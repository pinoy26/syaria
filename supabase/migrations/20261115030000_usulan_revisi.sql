-- =====================================================================
-- Usulan revisi anggaran oleh fakultas/unit (Monev Anggaran tahap 5–7)
--
-- Alur: Unit membuat usulan (draf) → ajukan → Admin perencanaan (SUPERADMIN) setujui /
--       kembalikan / tolak → Admin perencanaan input ke SAKTI & catat No. Revisi → selesai.
-- Semua perubahan data lewat fungsi (SECURITY DEFINER) yang memeriksa peran & aturan;
-- tabel hanya bisa DIBACA langsung (RLS). Nilai "semula" selalu diambil dari RKK di database,
-- bukan dari kiriman browser.
--
-- Aturan pemeriksaan (disepakati 2026-11-15):
--   ditolak : tidak seimbang; antar sumber dana (RM↔PNBP); akun 51 oleh unit; item terblokir diubah;
--             lintas unit oleh selain Admin perencanaan; di luar cakupan unit; pagu kelompok
--             (sub komponen + akun) di bawah realisasinya
--   telaah  : 52→53, 53→52, 52 lain→524
--   boleh   : 524→52 lain, 53→53, 524→524, antar komponen/sub komponen (dalam unit sendiri)
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Tabel ----------
create table if not exists public.usulan_revisi (
  id            bigint generated always as identity primary key,
  tahun         int    not null,
  versi_id      bigint references public.anggaran_versi(id) on delete set null,  -- RKK basis
  kategori      text,  unit text,                       -- unit pengusul (null bila lintas unit / belum berisi)
  lintas_unit   boolean not null default false,
  judul         text   not null check (length(btrim(judul)) between 3 and 200),
  alasan        text   not null default '' check (length(alasan) <= 5000),
  status        text   not null default 'draf'
                check (status in ('draf','diajukan','dikembalikan','disetujui','ditolak','diinput_sakti','selesai')),
  perlu_telaah  boolean not null default false,
  hasil_periksa jsonb,
  no_revisi     text   not null default '',
  dibuat_oleh   uuid   default auth.uid() references auth.users(id) on delete set null,
  dibuat_email  text   not null default '',
  dibuat_pada   timestamptz not null default now(),
  diubah_pada   timestamptz not null default now()
);
create index if not exists usulan_revisi_status_idx on public.usulan_revisi (tahun, status);

create table if not exists public.usulan_revisi_baris (
  id          bigint generated always as identity primary key,
  usulan_id   bigint not null references public.usulan_revisi(id) on delete cascade,
  urutan      int    not null,
  aksi        text   not null check (aksi in ('ubah','tambah','hapus')),
  anggaran_id bigint,                                   -- item RKK basis (ubah/hapus)
  prog text, keg text, kro text, ro text, komp text, sub text, akun text, sumber text not null default '',
  kategori text, unit text, judul text not null default '', judul2 text not null default '',
  uraian      text   not null,
  s_volume numeric, s_satuan text not null default '', s_harga numeric, s_jumlah bigint not null default 0,   -- semula
  m_volume numeric, m_satuan text not null default '', m_harga numeric, m_jumlah bigint not null default 0,   -- menjadi
  blokir      boolean not null default false
);
create index if not exists usulan_revisi_baris_idx on public.usulan_revisi_baris (usulan_id, urutan);

create table if not exists public.usulan_revisi_log (
  id        bigint generated always as identity primary key,
  usulan_id bigint not null references public.usulan_revisi(id) on delete cascade,
  waktu     timestamptz not null default now(),
  oleh      uuid default auth.uid(),
  email     text not null default '',
  peran     text not null default '',
  aksi      text not null,
  catatan   text not null default ''
);
create index if not exists usulan_revisi_log_idx on public.usulan_revisi_log (usulan_id, waktu);

-- ---------- 2. RLS: hanya baca; semua penulisan lewat fungsi ----------
alter table public.usulan_revisi       enable row level security;
alter table public.usulan_revisi_baris enable row level security;
alter table public.usulan_revisi_log   enable row level security;

drop policy if exists usulan_lihat on public.usulan_revisi;
create policy usulan_lihat on public.usulan_revisi for select to authenticated using (
  public.fn_superadmin() or public.fn_semua() or dibuat_oleh = auth.uid()
  or (kategori is not null and public.fn_boleh(kategori, unit)));
drop policy if exists usulan_baris_lihat on public.usulan_revisi_baris;
create policy usulan_baris_lihat on public.usulan_revisi_baris for select to authenticated using (
  exists (select 1 from public.usulan_revisi u where u.id = usulan_id));
drop policy if exists usulan_log_lihat on public.usulan_revisi_log;
create policy usulan_log_lihat on public.usulan_revisi_log for select to authenticated using (
  exists (select 1 from public.usulan_revisi u where u.id = usulan_id));

revoke all on public.usulan_revisi, public.usulan_revisi_baris, public.usulan_revisi_log from anon;
grant select on public.usulan_revisi, public.usulan_revisi_baris, public.usulan_revisi_log to authenticated;

-- ---------- 3. Bantuan ----------
create or replace function public.fn_rp(v bigint) returns text
language sql immutable as $$
  select case when v < 0 then '−' else '' end || replace(to_char(abs(coalesce(v,0)), 'FM999,999,999,999,990'), ',', '.');
$$;

create or replace function public.fn_log_usulan(p_id bigint, p_aksi text, p_catatan text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.usulan_revisi_log (usulan_id, oleh, email, peran, aksi, catatan)
  values (p_id, auth.uid(), coalesce((select email from public.pengguna where id = auth.uid()), ''),
          public.fn_peran(), p_aksi, coalesce(p_catatan, ''));
$$;

-- ---------- 4. Pemeriksaan aturan ----------
create or replace function public.periksa_usulan(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  u record; r record; v_peran text; v_delta bigint; v_periode date; v_n int;
  v_tolak text[] := '{}'; v_telaah text[] := '{}';
  n53 bigint; t53 bigint; n52 bigint; t52 bigint; n524 bigint; t524 bigint;
begin
  select * into u from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  select peran into v_peran from public.pengguna where id = u.dibuat_oleh;

  if not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id) then
    v_tolak := v_tolak || 'Usulan belum berisi perubahan.'::text;
  end if;

  select coalesce(sum(m_jumlah - s_jumlah), 0) into v_delta from public.usulan_revisi_baris where usulan_id = p_id;
  if v_delta <> 0 then
    v_tolak := v_tolak || format('Usulan tidak seimbang: selisih Rp %s. Pagu yang dikurangi harus sama dengan yang ditambahkan.', public.fn_rp(v_delta));
  end if;

  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by sumber having sum(m_jumlah - s_jumlah) <> 0) then
    v_tolak := v_tolak || 'Pergeseran antar sumber dana (RM ↔ PNBP) tidak diperbolehkan.'::text;
  end if;

  if v_peran = 'UNIT' and exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and left(akun, 2) = '51') then
    v_tolak := v_tolak || 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.'::text;
  end if;

  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and blokir
             and (aksi = 'hapus' or m_jumlah <> s_jumlah or m_volume is distinct from s_volume or m_harga is distinct from s_harga)) then
    v_tolak := v_tolak || 'Item yang diblokir tidak dapat diubah atau dihapus sebelum blokirnya dibuka.'::text;
  end if;

  select count(distinct coalesce(kategori, '') || '|' || coalesce(unit, '')) into v_n from public.usulan_revisi_baris where usulan_id = p_id;
  if v_n > 1 and coalesce(v_peran, '') <> 'SUPERADMIN' then
    v_tolak := v_tolak || 'Pergeseran antar fakultas/unit hanya dapat dilakukan Admin perencanaan.'::text;
  end if;
  if v_peran = 'UNIT' and exists (
       select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and not exists (
         select 1 from public.pengguna_cakupan c where c.user_id = u.dibuat_oleh and c.kategori = b.kategori and (c.unit = '' or c.unit = b.unit))) then
    v_tolak := v_tolak || 'Usulan memuat item di luar cakupan unit Anda.'::text;
  end if;

  -- pagu kelompok (sub komponen + akun) tidak boleh di bawah realisasi posisi terakhir tahun itu
  select max(periode) into v_periode from public.periode where extract(year from periode)::int = u.tahun;
  if v_periode is not null then
    for r in
      with d as (select prog, kro, ro, sub, akun, sum(m_jumlah - s_jumlah) delta from public.usulan_revisi_baris
                  where usulan_id = p_id group by 1,2,3,4,5 having sum(m_jumlah - s_jumlah) < 0),
           g as (select prog, kro, ro, sub, akun, sum(jumlah) pagu from public.anggaran where versi_id = u.versi_id group by 1,2,3,4,5),
           s as (select prog, kro, ro, sub, akun, sum(sd) sd from public.realisasi where periode = v_periode group by 1,2,3,4,5)
      select d.sub, d.akun, (g.pagu + d.delta)::bigint baru, coalesce(s.sd, 0)::bigint sd
        from d join g using (prog, kro, ro, sub, akun) left join s using (prog, kro, ro, sub, akun)
       where g.pagu + d.delta < coalesce(s.sd, 0)
    loop
      v_tolak := v_tolak || format('Pagu sub komponen %s akun %s menjadi Rp %s, di bawah realisasinya Rp %s.', r.sub, r.akun, public.fn_rp(r.baru), public.fn_rp(r.sd));
    end loop;
  end if;

  -- perlu telaah: arah pergeseran antar kelompok jenis belanja (neto per kelompok)
  select coalesce(sum(d) filter (where k = '53'  and d > 0), 0), coalesce(sum(d) filter (where k = '53'  and d < 0), 0),
         coalesce(sum(d) filter (where k = '52'  and d > 0), 0), coalesce(sum(d) filter (where k = '52'  and d < 0), 0),
         coalesce(sum(d) filter (where k = '524' and d > 0), 0), coalesce(sum(d) filter (where k = '524' and d < 0), 0)
    into n53, t53, n52, t52, n524, t524
    from (select case when akun like '53%' then '53' when akun like '524%' then '524' when akun like '52%' then '52' else 'lain' end k,
                 sum(m_jumlah - s_jumlah) d
            from public.usulan_revisi_baris where usulan_id = p_id group by 1) x;
  if n53 > 0 and (t52 < 0 or t524 < 0) then v_telaah := v_telaah || 'Pergeseran dari belanja barang (52) ke belanja modal (53).'::text; end if;
  if t53 < 0 and (n52 > 0 or n524 > 0) then v_telaah := v_telaah || 'Pergeseran dari belanja modal (53) ke belanja barang (52).'::text; end if;
  if n524 > 0 and t52 < 0 then v_telaah := v_telaah || 'Pergeseran dari akun 52 lainnya ke perjalanan dinas (524).'::text; end if;

  return jsonb_build_object('tolak', to_jsonb(v_tolak), 'telaah', to_jsonb(v_telaah), 'selisih', v_delta, 'diperiksa', now());
end;
$function$;

-- ---------- 5. Simpan draf (buat baru bila p_id null) ----------
create or replace function public.simpan_usulan(p_id bigint, p_versi_id bigint, p_judul text, p_alasan text, p_baris jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_peran text := public.fn_peran(); v_id bigint; v_versi bigint; v_tahun int; v_status text;
  b jsonb; a record; v_urut int := 0; v_n int; v_kat text; v_unit text; v_aksi text;
  mv numeric; mh numeric; mj bigint;
begin
  if v_peran not in ('UNIT', 'ADMIN', 'SUPERADMIN') then raise exception 'Peran Anda tidak dapat membuat usulan revisi.'; end if;
  if coalesce(length(btrim(p_judul)), 0) < 3 then raise exception 'Judul usulan minimal 3 karakter.'; end if;
  if jsonb_typeof(coalesce(p_baris, '[]'::jsonb)) <> 'array' then raise exception 'Format daftar perubahan tidak valid.'; end if;

  if p_id is null then
    select tahun into v_tahun from public.anggaran_versi where id = p_versi_id;
    if not found then raise exception 'Versi RKK basis tidak ditemukan.'; end if;
    insert into public.usulan_revisi (tahun, versi_id, judul, alasan, dibuat_oleh, dibuat_email)
    values (v_tahun, p_versi_id, btrim(p_judul), coalesce(p_alasan, ''), auth.uid(), coalesce((select email from public.pengguna where id = auth.uid()), ''))
    returning id, versi_id into v_id, v_versi;
    perform public.fn_log_usulan(v_id, 'dibuat', '');
  else
    select status, versi_id into v_status, v_versi from public.usulan_revisi
     where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
    if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
    if v_status not in ('draf', 'dikembalikan') then raise exception 'Usulan yang sudah diajukan tidak dapat diubah.'; end if;
    update public.usulan_revisi set judul = btrim(p_judul), alasan = coalesce(p_alasan, ''), diubah_pada = now() where id = p_id;
    delete from public.usulan_revisi_baris where usulan_id = p_id;
    v_id := p_id;
  end if;

  for b in select * from jsonb_array_elements(coalesce(p_baris, '[]'::jsonb)) loop
    v_urut := v_urut + 1; v_aksi := b->>'aksi';
    if v_aksi in ('ubah', 'hapus') then
      select * into a from public.anggaran where id = (b->>'anggaran_id')::bigint and versi_id = v_versi;
      if not found then raise exception 'Item basis baris % tidak ditemukan pada RKK usulan.', v_urut; end if;
    elsif v_aksi = 'tambah' then
      select * into a from public.anggaran
       where versi_id = v_versi and prog = b->>'prog' and kro = b->>'kro' and ro = b->>'ro' and sub = b->>'sub' and akun = b->>'akun'
       order by urutan limit 1;
      if not found then raise exception 'Kelompok anggaran baris % tidak ditemukan pada RKK usulan.', v_urut; end if;
      if coalesce(length(btrim(b->>'uraian')), 0) < 2 then raise exception 'Uraian item baru (baris %) wajib diisi.', v_urut; end if;
    else
      raise exception 'Aksi baris % tidak dikenal.', v_urut;
    end if;
    if v_peran = 'UNIT' and not public.fn_boleh(a.kategori, a.unit) then
      raise exception 'Baris % di luar cakupan unit Anda.', v_urut;
    end if;

    mv := nullif(b->>'m_volume', '')::numeric; mh := nullif(b->>'m_harga', '')::numeric;
    if v_aksi = 'hapus' then mj := 0;
    elsif v_aksi = 'ubah' and mv is not distinct from a.volume and mh is not distinct from a.harga then mj := a.jumlah;  -- tak berubah: jumlah RKK apa adanya
    else
      if mv is null or mh is null or mv < 0 or mh < 0 then raise exception 'Volume dan harga satuan baris % wajib diisi (tidak boleh negatif).', v_urut; end if;
      mj := round(mv * mh)::bigint;
    end if;

    insert into public.usulan_revisi_baris (usulan_id, urutan, aksi, anggaran_id, prog, keg, kro, ro, komp, sub, akun, sumber, kategori, unit,
                                            judul, judul2, uraian, s_volume, s_satuan, s_harga, s_jumlah, m_volume, m_satuan, m_harga, m_jumlah, blokir)
    values (v_id, v_urut, v_aksi, case when v_aksi = 'tambah' then null else a.id end,
            a.prog, a.keg, a.kro, a.ro, a.komp, a.sub, a.akun, a.sumber, a.kategori, a.unit,
            case when v_aksi = 'tambah' then coalesce(nullif(btrim(b->>'judul'), ''), a.judul) else a.judul end,
            case when v_aksi = 'tambah' then '' else a.judul2 end,
            case when v_aksi = 'tambah' then btrim(b->>'uraian') else a.uraian end,
            case when v_aksi = 'tambah' then null else a.volume end,
            case when v_aksi = 'tambah' then '' else a.satuan end,
            case when v_aksi = 'tambah' then null else a.harga end,
            case when v_aksi = 'tambah' then 0 else a.jumlah end,
            case when v_aksi = 'hapus' then null else mv end,
            case when v_aksi = 'hapus' then '' else coalesce(nullif(btrim(b->>'m_satuan'), ''), a.satuan) end,
            case when v_aksi = 'hapus' then null else mh end,
            mj,
            case when v_aksi = 'tambah' then false else a.blokir end);
  end loop;

  select count(distinct kategori || '|' || unit), min(kategori), min(unit) into v_n, v_kat, v_unit
    from public.usulan_revisi_baris where usulan_id = v_id;
  update public.usulan_revisi
     set kategori = case when v_n = 1 then v_kat end, unit = case when v_n = 1 then v_unit end,
         lintas_unit = coalesce(v_n, 0) > 1, hasil_periksa = public.periksa_usulan(v_id)
   where id = v_id;
  return jsonb_build_object('id', v_id, 'periksa', (select hasil_periksa from public.usulan_revisi where id = v_id));
end;
$function$;

-- ---------- 6. Ajukan / hapus (pengusul) ----------
create or replace function public.ajukan_usulan(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; h jsonb; v_msg text;
begin
  select status into v_status from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if v_status not in ('draf', 'dikembalikan') then raise exception 'Usulan ini sudah diajukan.'; end if;
  h := public.periksa_usulan(p_id);
  if jsonb_array_length(h->'tolak') > 0 then
    select string_agg(x, ' ') into v_msg from jsonb_array_elements_text(h->'tolak') x;
    update public.usulan_revisi set hasil_periksa = h where id = p_id;
    raise exception 'Usulan belum dapat diajukan. %', v_msg;
  end if;
  update public.usulan_revisi set status = 'diajukan', perlu_telaah = jsonb_array_length(h->'telaah') > 0, hasil_periksa = h, diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'diajukan', case when jsonb_array_length(h->'telaah') > 0 then 'Perlu telaah' else '' end);
  return jsonb_build_object('id', p_id, 'status', 'diajukan', 'periksa', h);
end;
$function$;

create or replace function public.hapus_usulan(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text;
begin
  select status into v_status from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if v_status not in ('draf', 'dikembalikan') and not public.fn_superadmin() then raise exception 'Usulan yang sudah diajukan tidak dapat dihapus.'; end if;
  delete from public.usulan_revisi where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'dihapus');
end;
$function$;

-- ---------- 7. Proses oleh Admin perencanaan ----------
create or replace function public.proses_usulan(p_id bigint, p_aksi text, p_catatan text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; h jsonb; v_baru text;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat memproses usulan revisi.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status <> 'diajukan' then raise exception 'Hanya usulan berstatus Diajukan yang dapat diproses.'; end if;
  if p_aksi in ('kembalikan', 'tolak') and coalesce(length(btrim(p_catatan)), 0) < 3 then raise exception 'Catatan wajib diisi saat mengembalikan atau menolak usulan.'; end if;
  if p_aksi = 'setujui' then
    h := public.periksa_usulan(p_id);
    if jsonb_array_length(h->'tolak') > 0 then raise exception 'Usulan tidak lagi memenuhi aturan: %', (select string_agg(x, ' ') from jsonb_array_elements_text(h->'tolak') x); end if;
    v_baru := 'disetujui';
  elsif p_aksi = 'kembalikan' then v_baru := 'dikembalikan';
  elsif p_aksi = 'tolak' then v_baru := 'ditolak';
  else raise exception 'Aksi tidak dikenal.'; end if;
  update public.usulan_revisi set status = v_baru, diubah_pada = now(), hasil_periksa = coalesce(h, hasil_periksa) where id = p_id;
  perform public.fn_log_usulan(p_id, v_baru, p_catatan);
  return jsonb_build_object('id', p_id, 'status', v_baru);
end;
$function$;

create or replace function public.catat_no_revisi(p_id bigint, p_no text, p_catatan text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat mencatat No. Revisi SAKTI.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status not in ('disetujui', 'diinput_sakti') then raise exception 'No. Revisi hanya dicatat untuk usulan yang sudah disetujui.'; end if;
  if coalesce(length(btrim(p_no)), 0) < 3 then raise exception 'Isi No. Revisi SAKTI, mis. 2026.307740.015.'; end if;
  update public.usulan_revisi set status = 'diinput_sakti', no_revisi = btrim(p_no), diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'diinput_sakti', 'No. Revisi ' || btrim(p_no) || case when coalesce(btrim(p_catatan), '') <> '' then ' — ' || btrim(p_catatan) else '' end);
  return jsonb_build_object('id', p_id, 'status', 'diinput_sakti');
end;
$function$;

create or replace function public.selesaikan_usulan(p_id bigint, p_catatan text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat menyelesaikan usulan.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status <> 'diinput_sakti' then raise exception 'Usulan diselesaikan setelah diinput ke SAKTI.'; end if;
  update public.usulan_revisi set status = 'selesai', diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'selesai', p_catatan);
  return jsonb_build_object('id', p_id, 'status', 'selesai');
end;
$function$;

-- ---------- 8. Hak eksekusi: fungsi bantu hanya internal; fungsi aksi untuk pengguna yang masuk ----------
revoke all on function public.fn_rp(bigint), public.fn_log_usulan(bigint, text, text), public.periksa_usulan(bigint) from public, anon, authenticated;
revoke all on function public.simpan_usulan(bigint, bigint, text, text, jsonb), public.ajukan_usulan(bigint), public.hapus_usulan(bigint),
  public.proses_usulan(bigint, text, text), public.catat_no_revisi(bigint, text, text), public.selesaikan_usulan(bigint, text) from public, anon;
grant execute on function public.simpan_usulan(bigint, bigint, text, text, jsonb), public.ajukan_usulan(bigint), public.hapus_usulan(bigint),
  public.proses_usulan(bigint, text, text), public.catat_no_revisi(bigint, text, text), public.selesaikan_usulan(bigint, text) to authenticated, service_role;
