-- =====================================================================
-- Monev Anggaran tahap 9b: nilai blokir per item (seperti kolom Blokir di SAKTI) & blokir manual
--
-- RKK SAKTI hanya menandai item terblokir dengan "*", tanpa nilai. Nilainya = jumlah RKK − pagu
-- FA Detail posisi terakhir tahun itu (terverifikasi sama dengan kolom Blokir SAKTI, mis. Tiket Warek I
-- Rp 49.000.000 − Rp 42.000.000 = Rp 7.000.000). Item RKK ↔ FA dipasangkan per kelompok
-- (sub komponen + akun) menurut uraian yang dinormalkan, urut kemunculan; item bertanda * yang tidak
-- menemukan pasangannya dianggap diblokir penuh (aman).
-- Blokir manual: Admin perencanaan dapat menambahkan blokir pada item yang TIDAK bertanda * di RKK
-- (berlaku per tahun anggaran, dikenali dari kelompok + header + uraian). Nilai blokir dari RKK dikunci.
-- Aturan revisi: bagian yang diblokir tidak boleh digeser → jumlah menjadi ≥ blokir + realisasi item;
-- item blokir penuh tidak boleh diubah; item berblokir tidak boleh dihapus; uraiannya dikunci.
-- =====================================================================

create or replace function public.fn_norm(t text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(coalesce(t, ''), '\[[^\]]*\]', '', 'g'), '\s+', ' ', 'g')));
$$;

create table if not exists public.blokir_manual (
  tahun       int    not null,
  kunci       text   not null,
  nilai       bigint not null check (nilai > 0),
  uraian      text   not null default '',
  diatur_oleh text   not null default '',
  diatur_pada timestamptz not null default now(),
  primary key (tahun, kunci)
);
alter table public.blokir_manual enable row level security;
drop policy if exists blokir_manual_lihat on public.blokir_manual;
create policy blokir_manual_lihat on public.blokir_manual for select to authenticated using (public.fn_peran() <> '');
revoke all on public.blokir_manual from anon;
grant select on public.blokir_manual to authenticated;

-- nilai blokir & realisasi per item satu versi RKK (hanya item dalam cakupan pemanggil)
create or replace function public.blokir_item(p_versi_id bigint)
returns table (anggaran_id bigint, blokir bigint, dari_rkk boolean, manual boolean, realisasi bigint)
language sql stable security definer set search_path to 'public' as $$
  with v as (select tahun from public.anggaran_versi where id = p_versi_id),
  per as (select max(p.periode) p from public.periode p, v where extract(year from p.periode)::int = v.tahun),
  a as (select x.id, x.prog, x.kro, x.ro, x.sub, x.akun, x.judul, x.judul2, x.uraian, x.jumlah, x.blokir, public.fn_norm(x.uraian) nu,
               row_number() over (partition by x.prog, x.kro, x.ro, x.sub, x.akun, public.fn_norm(x.uraian) order by x.urutan) occ,
               row_number() over (partition by x.prog, x.kro, x.ro, x.sub, x.akun, public.fn_norm(x.judul), public.fn_norm(x.judul2), public.fn_norm(x.uraian) order by x.urutan) occ2
          from public.anggaran x where x.versi_id = p_versi_id),
  f as (select r.prog, r.kro, r.ro, r.sub, r.akun, public.fn_norm(r.uraian) nu, r.pagu, r.sd,
               row_number() over (partition by r.prog, r.kro, r.ro, r.sub, r.akun, public.fn_norm(r.uraian) order by r.no_item) occ
          from public.realisasi r, per where r.periode = per.p),
  ka as (select prog, kro, ro, sub, akun, sum(jumlah) j from a group by 1, 2, 3, 4, 5 having bool_or(blokir)),
  kf as (select prog, kro, ro, sub, akun, sum(pagu) j from f group by 1, 2, 3, 4, 5),
  k as (select ka.prog, ka.kro, ka.ro, ka.sub, ka.akun from ka left join kf using (prog, kro, ro, sub, akun) where ka.j > coalesce(kf.j, 0)),
  m as (select b.kunci, b.nilai from public.blokir_manual b, v where b.tahun = v.tahun)
  select a.id,
         (case when a.blokir and k.prog is not null then greatest(0, a.jumlah - coalesce(f.pagu, 0))
               when a.blokir then 0
               else least(coalesce(m.nilai, 0), a.jumlah) end)::bigint,
         a.blokir, (not a.blokir and m.nilai is not null), coalesce(f.sd, 0)::bigint
    from a
    join public.anggaran z on z.id = a.id
    left join f on f.prog = a.prog and f.kro = a.kro and f.ro = a.ro and f.sub = a.sub and f.akun = a.akun and f.nu = a.nu and f.occ = a.occ
    left join k on k.prog = a.prog and k.kro = a.kro and k.ro = a.ro and k.sub = a.sub and k.akun = a.akun
    left join m on m.kunci = concat_ws('|', a.prog, a.kro, a.ro, a.sub, a.akun, public.fn_norm(a.judul), public.fn_norm(a.judul2), a.nu, a.occ2)
   where public.fn_superadmin() or public.fn_boleh(z.kategori, z.unit);
$$;

-- Admin perencanaan: pasang / ubah / lepas blokir manual pada item yang tidak bertanda * di RKK
create or replace function public.atur_blokir_manual(p_anggaran_id bigint, p_nilai bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare a record; v_tahun int; v_occ int; v_kunci text;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat mengatur blokir.'; end if;
  select * into a from public.anggaran where id = p_anggaran_id;
  if not found then raise exception 'Item anggaran tidak ditemukan.'; end if;
  if a.blokir then raise exception 'Blokir item "%" berasal dari RKK SAKTI dan dikunci.', a.uraian; end if;
  if p_nilai is not null and (p_nilai < 0 or p_nilai > a.jumlah) then
    raise exception 'Nilai blokir harus antara Rp 0 dan jumlah item (Rp %).', public.fn_rp(a.jumlah);
  end if;
  select tahun into v_tahun from public.anggaran_versi where id = a.versi_id;
  select count(*) into v_occ from public.anggaran x
   where x.versi_id = a.versi_id and x.prog = a.prog and x.kro = a.kro and x.ro = a.ro and x.sub = a.sub and x.akun = a.akun
     and public.fn_norm(x.judul) = public.fn_norm(a.judul) and public.fn_norm(x.judul2) = public.fn_norm(a.judul2)
     and public.fn_norm(x.uraian) = public.fn_norm(a.uraian) and x.urutan <= a.urutan;
  v_kunci := concat_ws('|', a.prog, a.kro, a.ro, a.sub, a.akun, public.fn_norm(a.judul), public.fn_norm(a.judul2), public.fn_norm(a.uraian), v_occ);
  if coalesce(p_nilai, 0) = 0 then
    delete from public.blokir_manual where tahun = v_tahun and kunci = v_kunci;
  else
    insert into public.blokir_manual (tahun, kunci, nilai, uraian, diatur_oleh)
    values (v_tahun, v_kunci, p_nilai, a.uraian, coalesce((select email from public.pengguna where id = auth.uid()), ''))
    on conflict (tahun, kunci) do update set nilai = excluded.nilai, uraian = excluded.uraian, diatur_oleh = excluded.diatur_oleh, diatur_pada = now();
  end if;
  return jsonb_build_object('anggaran_id', p_anggaran_id, 'nilai', coalesce(p_nilai, 0));
end;
$function$;

-- pemeriksaan usulan: aturan blokir lama ("item * tidak boleh berubah") diganti aturan nilai blokir
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

  -- blokir per item (dari RKK − FA Detail, atau blokir manual Admin perencanaan):
  -- bagian yang diblokir tidak boleh digeser; item blokir penuh / berblokir tidak boleh dihapus
  for r in
    select b.uraian, b.aksi, b.m_jumlah, k.blokir bl, k.realisasi sd, a.jumlah j
      from public.usulan_revisi_baris b
      join public.blokir_item(u.versi_id) k on k.anggaran_id = b.anggaran_id
      join public.anggaran a on a.id = b.anggaran_id
     where b.usulan_id = p_id and k.blokir > 0
       and (b.aksi = 'hapus' or (k.blokir >= a.jumlah and b.m_jumlah <> a.jumlah) or b.m_jumlah < k.blokir + k.realisasi)
  loop
    v_tolak := v_tolak || case when r.aksi = 'hapus' then format('Item "%s" memiliki blokir Rp %s dan tidak dapat dihapus.', r.uraian, public.fn_rp(r.bl))
                               when r.bl >= r.j then format('Item "%s" diblokir penuh (Rp %s) dan tidak dapat diubah.', r.uraian, public.fn_rp(r.bl))
                               else format('Jumlah "%s" minimal Rp %s (blokir Rp %s + realisasi Rp %s).', r.uraian, public.fn_rp(r.bl + r.sd), public.fn_rp(r.bl), public.fn_rp(r.sd)) end;
  end loop;

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



-- simpan salinan: pemeriksaan blokir memakai nilai blokir per item
create or replace function public.simpan_salinan(p_id bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; v_pagu bigint; v_n int; r record;
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama; ubah lewat formulir usulan.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Usulan yang sudah diajukan tidak dapat diubah.'; end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Rincian anggaran usulan tidak boleh kosong.';
  end if;

  drop table if exists pg_temp._salinan;
  create temp table _salinan on commit drop as
  select * from jsonb_to_recordset(p_rows) as d(anggaran_id bigint, urutan numeric, judul text, judul2 text, uraian text,
                                                volume numeric, satuan text, harga numeric, prog text, kro text, ro text, sub text, akun text);
  drop table if exists pg_temp._basis;
  create temp table _basis on commit drop as
  select * from public.anggaran where versi_id = u.versi_id and kategori = u.kategori and unit is not distinct from u.unit;

  if exists (select 1 from _salinan where urutan is null) then raise exception 'Urutan baris tidak lengkap. Muat ulang halaman.'; end if;
  select anggaran_id into r from _salinan where anggaran_id is not null group by anggaran_id having count(*) > 1 limit 1;
  if found then raise exception 'Item DIPA tercatat ganda pada salinan. Muat ulang halaman.'; end if;
  if exists (select 1 from _salinan s where s.anggaran_id is not null and not exists (select 1 from _basis b where b.id = s.anggaran_id)) then
    raise exception 'Ada item yang bukan berasal dari DIPA basis unit ini.';
  end if;
  -- blokir per item (RKK − FA Detail / blokir manual): bagian yang diblokir tidak boleh digeser
  drop table if exists pg_temp._blokir;
  create temp table _blokir on commit drop as
  select k.* from public.blokir_item(u.versi_id) k join _basis b on b.id = k.anggaran_id where k.blokir > 0;
  for r in select b.uraian, k.blokir from _blokir k join _basis b on b.id = k.anggaran_id
            where not exists (select 1 from _salinan s where s.anggaran_id = k.anggaran_id) limit 1 loop
    raise exception 'Item "%" memiliki blokir Rp % dan tidak dapat dihapus.', r.uraian, public.fn_rp(r.blokir);
  end loop;
  for r in select b.uraian from _salinan s join _basis b on b.id = s.anggaran_id join _blokir k on k.anggaran_id = b.id
            where coalesce(btrim(s.uraian), '') <> b.uraian or coalesce(btrim(s.judul), '') <> b.judul or coalesce(btrim(s.judul2), '') <> b.judul2 limit 1 loop
    raise exception 'Uraian dan header item berblokir "%" tidak dapat diubah.', r.uraian;
  end loop;
  for r in select b.uraian, b.jumlah, k.blokir, k.realisasi,
                  case when s.volume is not distinct from b.volume and s.harga is not distinct from b.harga then b.jumlah
                       else round(coalesce(s.volume, 0) * coalesce(s.harga, 0))::bigint end baru
             from _salinan s join _basis b on b.id = s.anggaran_id join _blokir k on k.anggaran_id = b.id loop
    if r.blokir >= r.jumlah and r.baru <> r.jumlah then
      raise exception 'Item "%" diblokir penuh (Rp %) dan tidak dapat diubah.', r.uraian, public.fn_rp(r.blokir);
    elsif r.baru < r.blokir + r.realisasi then
      raise exception 'Jumlah "%" minimal Rp % (blokir Rp % + realisasi Rp %).', r.uraian, public.fn_rp(r.blokir + r.realisasi), public.fn_rp(r.blokir), public.fn_rp(r.realisasi);
    end if;
  end loop;
  if exists (select 1 from _salinan where length(btrim(coalesce(uraian, ''))) < 2) then
    raise exception 'Uraian setiap detail wajib diisi (minimal 2 karakter).';
  end if;
  for r in select s.uraian from _salinan s where s.anggaran_id is null and not exists (
             select 1 from _basis b where b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.sub = s.sub and b.akun = s.akun) limit 1 loop
    raise exception 'Detail baru "%" tidak berada di sub komponen/akun milik unit ini.', r.uraian;
  end loop;
  for r in select s.uraian from _salinan s left join _basis b on b.id = s.anggaran_id
            where (b.id is null or s.volume is distinct from b.volume or s.harga is distinct from b.harga)
              and (s.volume is null or s.harga is null or s.volume < 0 or s.harga < 0) limit 1 loop
    raise exception 'Volume dan harga satuan "%" wajib diisi dan tidak boleh negatif.', r.uraian;
  end loop;

  -- salinan baru: struktur selalu dari DIPA basis
  delete from public.usulan_salinan where usulan_id = p_id;
  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select p_id, s.anggaran_id, s.urutan, k.prog, k.prog_n, k.keg, k.keg_n, k.kro, k.kro_n, k.ro, k.ro_n, k.komp, k.komp_n,
         k.sub, k.sub_n, k.akun, k.akun_n, k.sumber, k.kategori, k.unit,
         coalesce(btrim(s.judul), ''), coalesce(btrim(s.judul2), ''), btrim(s.uraian), s.volume, coalesce(btrim(s.satuan), ''), s.harga,
         case when a.id is not null and s.volume is not distinct from a.volume and s.harga is not distinct from a.harga then a.jumlah
              else round(s.volume * s.harga)::bigint end,
         coalesce(a.blokir, false)
    from _salinan s
    left join _basis a on a.id = s.anggaran_id
    cross join lateral (select * from _basis b
                         where (a.id is not null and b.id = a.id)
                            or (a.id is null and b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.sub = s.sub and b.akun = s.akun)
                         order by b.urutan limit 1) k;

  -- baris semula → menjadi dari selisih salinan terhadap DIPA basis
  delete from public.usulan_revisi_baris where usulan_id = p_id;
  insert into public.usulan_revisi_baris (usulan_id, urutan, aksi, anggaran_id, prog, keg, kro, ro, komp, sub, akun, sumber, kategori, unit,
                                          judul, judul2, uraian, s_volume, s_satuan, s_harga, s_jumlah, m_volume, m_satuan, m_harga, m_jumlah, blokir)
  select p_id, row_number() over (order by x.ur, x.aksi), x.aksi, x.aid, x.prog, x.keg, x.kro, x.ro, x.komp, x.sub, x.akun, x.sumber, x.kategori, x.unit,
         x.judul, x.judul2, x.uraian, x.sv, x.ss, x.sh, x.sj, x.mv, x.ms, x.mh, x.mj, x.blokir
    from (
      select s.urutan ur, 'ubah' aksi, b.id aid, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             b.volume sv, b.satuan ss, b.harga sh, b.jumlah sj, s.volume mv, s.satuan ms, s.harga mh, s.jumlah mj, b.blokir
        from public.usulan_salinan s join _basis b on b.id = s.anggaran_id
       where s.usulan_id = p_id and (s.volume is distinct from b.volume or s.harga is distinct from b.harga or s.satuan <> b.satuan
                                     or s.uraian <> b.uraian or s.judul <> b.judul or s.judul2 <> b.judul2 or s.jumlah <> b.jumlah)
      union all
      select s.urutan, 'tambah', null, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             null, '', null, 0, s.volume, s.satuan, s.harga, s.jumlah, false
        from public.usulan_salinan s where s.usulan_id = p_id and s.anggaran_id is null
      union all
      select b.urutan, 'hapus', b.id, b.prog, b.keg, b.kro, b.ro, b.komp, b.sub, b.akun, b.sumber, b.kategori, b.unit, b.judul, b.judul2, b.uraian,
             b.volume, b.satuan, b.harga, b.jumlah, null, '', null, 0, b.blokir
        from _basis b where not exists (select 1 from public.usulan_salinan s where s.usulan_id = p_id and s.anggaran_id = b.id)
    ) x;
  get diagnostics v_n = row_count;

  select coalesce(sum(jumlah), 0) into v_pagu from public.usulan_salinan where usulan_id = p_id;
  update public.usulan_revisi set pagu_usulan = v_pagu, diubah_pada = now(), hasil_periksa = public.periksa_usulan(p_id) where id = p_id;
  return jsonb_build_object('id', p_id, 'pagu', v_pagu, 'selisih', v_pagu - u.pagu_awal, 'perubahan', v_n,
                            'periksa', (select hasil_periksa from public.usulan_revisi where id = p_id));
end;
$function$;


revoke all on function public.fn_norm(text) from anon;
revoke all on function public.blokir_item(bigint), public.atur_blokir_manual(bigint, bigint) from public, anon;
grant execute on function public.blokir_item(bigint), public.atur_blokir_manual(bigint, bigint) to authenticated, service_role;
