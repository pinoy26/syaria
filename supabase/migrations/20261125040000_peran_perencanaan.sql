-- =====================================================================
-- Peran Admin perencanaan (PERENCANAAN) & hak akses per pengguna
--
--   SUPERADMIN  = Super admin: semua hak, satu-satunya yang mengelola pengguna.
--   PERENCANAAN = Admin perencanaan: membaca seluruh data + hak yang dicentang Super admin.
--   ADMIN       = Admin keuangan, PIMPINAN = Pimpinan: membaca saja; Admin keuangan dapat diberi hak juga.
--   UNIT        = Admin fakultas/unit: usulan revisi unitnya (tidak berubah).
-- Hak (pengguna.hak): usulan, satker, periksa, setujui, sakti, periode, blokir, unggah, berita.
-- Cakupan usulan Admin perencanaan/keuangan memakai pengguna_cakupan (kosong = semua unit);
-- cakupan baca tetap seluruh satker (fn_semua).
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

alter table public.pengguna drop constraint if exists pengguna_peran_check;
alter table public.pengguna add constraint pengguna_peran_check check (peran in ('SUPERADMIN', 'PERENCANAAN', 'ADMIN', 'PIMPINAN', 'UNIT'));
alter table public.pengguna add column if not exists hak text[] not null default '{}';
alter table public.pengguna drop constraint if exists pengguna_hak_check;
alter table public.pengguna add constraint pengguna_hak_check
  check (hak <@ array['usulan', 'satker', 'periksa', 'setujui', 'sakti', 'periode', 'blokir', 'unggah', 'berita']::text[]);
-- Admin keuangan menjadi baca saja (sebelumnya dapat mengelola berita & membentuk usulan)
update public.pengguna set hak = '{}' where peran in ('ADMIN', 'PIMPINAN', 'UNIT') and hak <> '{}';

-- hak seorang pengguna (Super admin selalu punya semua hak)
create or replace function public.fn_hak_pengguna(p_uid uuid, p_hak text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.pengguna g where g.id = p_uid and g.aktif
                   and (g.peran = 'SUPERADMIN' or (g.peran in ('PERENCANAAN', 'ADMIN') and p_hak = any (g.hak))));
$$;
create or replace function public.fn_hak(p_hak text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fn_hak_pengguna(auth.uid(), p_hak);
$$;
-- unit yang boleh dibuatkan usulan oleh Admin perencanaan/keuangan (hak usulan + cakupan; hak satker = semua unit)
create or replace function public.fn_unit_usulan_pengguna(p_uid uuid, p_kategori text, p_unit text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fn_hak_pengguna(p_uid, 'satker')
      or (public.fn_hak_pengguna(p_uid, 'usulan')
          and (not exists (select 1 from public.pengguna_cakupan c where c.user_id = p_uid)
               or exists (select 1 from public.pengguna_cakupan c where c.user_id = p_uid and c.kategori = p_kategori
                            and (c.unit = '' or c.unit = coalesce(p_unit, '')))));
$$;
create or replace function public.fn_unit_usulan(p_kategori text, p_unit text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fn_unit_usulan_pengguna(auth.uid(), p_kategori, p_unit);
$$;

-- membaca seluruh satker: Admin keuangan, Pimpinan, Admin perencanaan
create or replace function public.fn_semua()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fn_peran() in ('ADMIN', 'PIMPINAN', 'PERENCANAAN');
$$;
-- berita: Super admin atau pemegang hak berita
create or replace function public.pengumuman_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.fn_hak('berita');
$$;
-- surat usulan wajib hanya untuk usulan dari fakultas/unit
create or replace function public.fn_wajib_surat(p_peran text)
returns boolean language sql immutable as $$ select coalesce(p_peran, '') not in ('SUPERADMIN', 'PERENCANAAN', 'ADMIN') $$;

-- kebijakan tulis tabel data: pemegang hak unggah (Kelola Data)
do $$
declare t text;
begin
  foreach t in array array['anggaran', 'anggaran_versi', 'periode', 'realisasi', 'ref_akun', 'ref_sumber_dana', 'ref_unit'] loop
    execute format('drop policy if exists %I on public.%I', t || '_kelola', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.fn_hak(''unggah'')) with check (public.fn_hak(''unggah''))', t || '_kelola', t);
  end loop;
end $$;

-- pengelolaan pengguna (Super admin): peran, cakupan, hak
drop function if exists public.simpan_pengguna(uuid, text, boolean, text, jsonb);
create or replace function public.simpan_pengguna(p_id uuid, p_peran text, p_aktif boolean, p_keterangan text,
                                                  p_cakupan jsonb default '[]'::jsonb, p_hak text[] default '{}')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_hak text[];
begin
  if not public.fn_superadmin() then raise exception 'Hanya Super admin yang boleh mengubah pengguna.'; end if;
  if p_peran not in ('PERENCANAAN', 'ADMIN', 'PIMPINAN', 'UNIT') then raise exception 'Peran tidak dikenal.'; end if;
  if p_id = auth.uid() then raise exception 'Tidak bisa menurunkan atau menonaktifkan akun sendiri.'; end if;
  v_hak := case when p_peran in ('PERENCANAAN', 'ADMIN') then
             coalesce((select array_agg(distinct h order by h) from unnest(coalesce(p_hak, '{}')) h
                        where h = any (array['usulan', 'satker', 'periksa', 'setujui', 'sakti', 'periode', 'blokir', 'unggah', 'berita'])), '{}')
           else '{}' end;
  if 'satker' = any (v_hak) and not 'usulan' = any (v_hak) then v_hak := array_append(v_hak, 'usulan'); end if;

  update public.pengguna
     set peran = p_peran, aktif = coalesce(p_aktif, false), keterangan = coalesce(p_keterangan, ''), hak = v_hak
   where id = p_id;
  if not found then raise exception 'Pengguna tidak ditemukan.'; end if;

  delete from public.pengguna_cakupan where user_id = p_id;
  -- UNIT: cakupan data; Admin perencanaan/keuangan dengan hak usulan: cakupan usulan (kosong = semua unit)
  if p_peran = 'UNIT' or (p_peran in ('PERENCANAAN', 'ADMIN') and 'usulan' = any (v_hak) and not 'satker' = any (v_hak)) then
    insert into public.pengguna_cakupan (user_id, kategori, unit)
    select p_id, c.kategori, coalesce(c.unit, '')
      from jsonb_to_recordset(coalesce(p_cakupan, '[]'::jsonb)) as c(kategori text, unit text)
     where c.kategori in ('Fakultas', 'Rektorat')
    on conflict do nothing;
  end if;
  return jsonb_build_object('id', p_id, 'status', 'disimpan', 'hak', to_jsonb(v_hak));
end;
$function$;

-- proses usulan: periksa (kembalikan) / setujui (setujui & batalkan persetujuan)
create or replace function public.proses_usulan(p_id bigint, p_aksi text, p_catatan text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_status text; v_pembuat uuid; h jsonb; v_baru text; v_cat text := coalesce(btrim(p_catatan), '');
begin
  if not (public.fn_hak('periksa') or public.fn_hak('setujui')) then raise exception 'Anda tidak memiliki hak memproses usulan revisi.'; end if;
  select status, dibuat_oleh into v_status, v_pembuat from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if p_aksi = 'setujui' then
    if not public.fn_hak('setujui') then raise exception 'Anda tidak memiliki hak menyetujui usulan revisi.'; end if;
    if v_status <> 'diajukan' then raise exception 'Hanya usulan berstatus Diajukan yang dapat disetujui.'; end if;
    h := public.periksa_usulan(p_id);
    if jsonb_array_length(h->'tolak') > 0 then raise exception 'Usulan tidak lagi memenuhi aturan: %', (select string_agg(x, ' ') from jsonb_array_elements_text(h->'tolak') x); end if;
    v_baru := 'disetujui';
    if v_pembuat = auth.uid() then
      v_cat := 'Divalidasi oleh pembuat usulan' || case when v_cat <> '' then ' — ' || v_cat else '' end;
    end if;
  elsif p_aksi = 'kembalikan' then
    if v_status not in ('diajukan', 'disetujui') then
      raise exception 'Hanya usulan berstatus Diajukan atau Disetujui (belum diinput ke SAKTI) yang dapat dikembalikan.';
    end if;
    if v_status = 'disetujui' and not public.fn_hak('setujui') then raise exception 'Membatalkan persetujuan memerlukan hak menyetujui usulan.'; end if;
    if length(v_cat) < 3 then raise exception 'Catatan perbaikan wajib diisi saat mengembalikan usulan.'; end if;
    if v_status = 'disetujui' then v_cat := 'Persetujuan dibatalkan — ' || v_cat; end if;
    v_baru := 'dikembalikan';
  else
    raise exception 'Aksi tidak dikenal. Usulan hanya dapat disetujui atau dikembalikan.';
  end if;
  update public.usulan_revisi set status = v_baru, diubah_pada = now(), hasil_periksa = coalesce(h, hasil_periksa) where id = p_id;
  perform public.fn_log_usulan(p_id, v_baru, v_cat);
  return jsonb_build_object('id', p_id, 'status', v_baru);
end;
$function$;

CREATE OR REPLACE FUNCTION public.atur_blokir_manual(p_anggaran_id bigint, p_nilai bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record; v_tahun int; v_occ int; v_kunci text;
begin
  if not public.fn_hak('blokir') then raise exception 'Anda tidak memiliki hak mengatur blokir manual.'; end if;
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

CREATE OR REPLACE FUNCTION public.atur_periode_revisi(p_id bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_mulai timestamptz; v_selesai timestamptz; v_semua boolean; v_cak jsonb; v_nama text; v_tahun int;
begin
  if not public.fn_hak('periode') then raise exception 'Anda tidak memiliki hak mengatur periode revisi.'; end if;
  v_nama := btrim(coalesce(p_data->>'nama', ''));
  v_tahun := nullif(p_data->>'tahun', '')::int;
  v_mulai := nullif(p_data->>'mulai', '')::timestamptz;
  v_selesai := nullif(p_data->>'selesai', '')::timestamptz;
  v_semua := coalesce((p_data->>'semua')::boolean, true);
  v_cak := case when v_semua then '[]'::jsonb else coalesce(p_data->'cakupan', '[]'::jsonb) end;
  if length(v_nama) < 3 then raise exception 'Nama periode minimal 3 karakter.'; end if;
  if v_tahun is null then raise exception 'Tahun anggaran wajib diisi.'; end if;
  if v_mulai is null or v_selesai is null then raise exception 'Tanggal mulai dan selesai wajib diisi.'; end if;
  if v_selesai <= v_mulai then raise exception 'Tanggal selesai harus sesudah tanggal mulai.'; end if;
  if jsonb_typeof(v_cak) <> 'array' or (not v_semua and jsonb_array_length(v_cak) = 0) then raise exception 'Pilih minimal satu fakultas/unit.'; end if;
  if p_id is null then
    insert into public.periode_revisi (tahun, nama, mulai, selesai, semua, cakupan, catatan)
    values (v_tahun, v_nama, v_mulai, v_selesai, v_semua, v_cak, left(coalesce(p_data->>'catatan', ''), 1000)) returning id into v_id;
  else
    update public.periode_revisi
       set tahun = v_tahun, nama = v_nama, mulai = v_mulai, selesai = v_selesai, semua = v_semua, cakupan = v_cak,
           catatan = left(coalesce(p_data->>'catatan', ''), 1000),
           ditutup_pada = case when v_selesai > now() then null else ditutup_pada end      -- diperpanjang = dibuka kembali
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Periode revisi tidak ditemukan.'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.hapus_periode_revisi(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_hak('periode') then raise exception 'Anda tidak memiliki hak mengatur periode revisi.'; end if;
  delete from public.periode_revisi where id = p_id and mulai > now();
  if not found then raise exception 'Hanya periode yang belum dimulai yang dapat dihapus. Periode yang sudah berjalan cukup ditutup.'; end if;
  return jsonb_build_object('id', p_id, 'dihapus', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tutup_periode_revisi(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_hak('periode') then raise exception 'Anda tidak memiliki hak mengatur periode revisi.'; end if;
  update public.periode_revisi set ditutup_pada = now() where id = p_id and ditutup_pada is null;
  if not found then raise exception 'Periode revisi tidak ditemukan atau sudah ditutup.'; end if;
  return jsonb_build_object('id', p_id, 'ditutup', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.atur_revisi_versi(p_id bigint, p_revisi integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if p_revisi is null or p_revisi < 0 or p_revisi > 999 then raise exception 'Nomor revisi harus 0–999.'; end if;
  update public.anggaran_versi set revisi_ke = p_revisi where id = p_id;
  if not found then raise exception 'Versi RKK tidak ditemukan.'; end if;
  return jsonb_build_object('id', p_id, 'revisi_ke', p_revisi);
end;
$function$;

CREATE OR REPLACE FUNCTION public.hapus_periode(p_periode date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  delete from public.periode where periode = p_periode;
  return jsonb_build_object('periode', p_periode, 'status', 'dihapus');
end;
$function$;

CREATE OR REPLACE FUNCTION public.hapus_rkk(p_posisi date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  delete from public.anggaran_versi where posisi = p_posisi;
  return jsonb_build_object('posisi', p_posisi, 'status', 'dihapus');
end;
$function$;

CREATE OR REPLACE FUNCTION public.rapikan_arsip(p_tahun integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_terbaru int := (select max(extract(year from periode))::int from public.periode);
  v_posisi_hapus int; v_posisi_sisa int; v_baris_hapus int;
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if p_tahun is null or v_terbaru is null or p_tahun >= v_terbaru then
    raise exception 'Tahun anggaran % masih berjalan atau belum selesai — hanya tahun sebelum % yang bisa dirapikan.', p_tahun, v_terbaru;
  end if;

  drop table if exists _sisa;
  create temp table _sisa on commit drop as
    select max(periode) as periode
      from public.periode
     where extract(year from periode)::int = p_tahun
     group by date_trunc('month', periode);

  select count(*) into v_posisi_sisa from _sisa;
  select count(*) into v_baris_hapus
    from public.realisasi
   where extract(year from periode)::int = p_tahun and periode not in (select periode from _sisa);

  delete from public.periode
   where extract(year from periode)::int = p_tahun
     and periode not in (select periode from _sisa);
  get diagnostics v_posisi_hapus = row_count;

  return jsonb_build_object('tahun', p_tahun, 'posisi_dihapus', v_posisi_hapus,
                            'posisi_disisakan', v_posisi_sisa, 'baris_dihapus', v_baris_hapus);
end;
$function$;

CREATE OR REPLACE FUNCTION public.salin_aturan_unit(p_dari integer, p_ke integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if p_ke < 2000 or p_ke > 2100 or p_dari = p_ke then raise exception 'Tahun tujuan tidak valid.'; end if;
  if exists (select 1 from public.ref_unit where tahun = p_ke) then
    raise exception 'Aturan unit kerja tahun % sudah ada.', p_ke;
  end if;
  insert into public.ref_unit (tahun, kro, komponen, jenis_aturan, kode, kategori, unit, keterangan)
  select p_ke, kro, komponen, jenis_aturan, kode, kategori, unit, keterangan
    from public.ref_unit where tahun = p_dari order by id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Tidak ada aturan unit kerja di tahun %.', p_dari; end if;
  return jsonb_build_object('baris', v_n, 'dari', p_dari, 'ke', p_ke);
end;
$function$;

CREATE OR REPLACE FUNCTION public.simpan_realisasi(p_periode date, p_label text, p_nama_file text, p_cek_pagu bigint, p_cek_realisasi bigint, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := coalesce((select email from public.pengguna where id = auth.uid()), '');
  v_jumlah int; v_pagu bigint; v_lock bigint; v_real bigint; v_sisa bigint; v_tanpa_sumber int;
  v_tahun int; v_th_sumber int;
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if p_periode is null then raise exception 'Tanggal posisi data wajib diisi.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris data yang dikirim.';
  end if;
  v_tahun := extract(year from p_periode)::int;
  v_th_sumber := public.fn_tahun_pemetaan_sumber(v_tahun);

  insert into public.periode as p (periode, label, nama_file, diunggah_pada, diunggah_oleh, cek_pagu, cek_realisasi)
  values (p_periode, coalesce(p_label,''), coalesce(p_nama_file,''), now(), v_email, coalesce(p_cek_pagu,0), coalesce(p_cek_realisasi,0))
  on conflict (periode) do update
    set label = excluded.label, nama_file = excluded.nama_file, diunggah_pada = now(),
        diunggah_oleh = excluded.diunggah_oleh, cek_pagu = excluded.cek_pagu, cek_realisasi = excluded.cek_realisasi;

  delete from public.realisasi where periode = p_periode;

  insert into public.realisasi (periode, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                sub, sub_n, akun, akun_n, sumber, kategori, unit, no_item, uraian,
                                pagu, lock_pagu, lalu, ini, sd, sisa)
  select p_periode,
         d.prog, d.prog_n, d.keg, d.keg_n, d.kro, d.kro_n, d.ro, d.ro_n, lpad(d.komp,3,'0'), d.komp_n,
         d.sub, d.sub_n, d.akun, d.akun_n,
         coalesce(s.sumber, ''), u.kategori, u.unit, d.no_item, d.uraian,
         d.pagu, d.lock_pagu, d.lalu, d.ini, d.sd, d.sisa
  from jsonb_to_recordset(p_rows) as d(
         prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
         komp text, komp_n text, sub text, sub_n text, akun text, akun_n text,
         no_item text, uraian text, pagu bigint, lock_pagu bigint, lalu bigint, ini bigint, sd bigint, sisa bigint)
  left join public.ref_sumber_dana s
         on s.tahun = v_th_sumber
        and s.kunci = d.prog || '|' || d.kro || '|' || d.ro || '|' || d.sub || '|' || d.akun
  cross join lateral public.fn_unit(d.kro, d.komp, d.sub, v_tahun) u;

  select count(*), coalesce(sum(pagu),0), coalesce(sum(lock_pagu),0), coalesce(sum(sd),0), coalesce(sum(sisa),0),
         count(*) filter (where sumber = '')
    into v_jumlah, v_pagu, v_lock, v_real, v_sisa, v_tanpa_sumber
    from public.realisasi where periode = p_periode;

  update public.periode
     set jumlah_detail = v_jumlah, pagu = v_pagu, lock_pagu = v_lock, realisasi = v_real, sisa = v_sisa
   where periode = p_periode;

  return jsonb_build_object('periode', p_periode, 'jumlah', v_jumlah, 'pagu', v_pagu,
                            'realisasi', v_real, 'sisa', v_sisa, 'tanpa_sumber', v_tanpa_sumber,
                            'tahun_sumber', v_th_sumber, 'tahun_unit', public.fn_tahun_pemetaan_unit(v_tahun));
end;
$function$;

CREATE OR REPLACE FUNCTION public.simpan_rkk(p_rows jsonb, p_tahun integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_jumlah int; v_tahun int := coalesce(p_tahun, extract(year from current_date)::int);
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if v_tahun < 2000 or v_tahun > 2100 then raise exception 'Tahun anggaran tidak valid: %', v_tahun; end if;
  delete from public.ref_sumber_dana where tahun = v_tahun;
  insert into public.ref_sumber_dana (tahun, kunci, prog, kro, ro, sub, akun, sumber)
  select v_tahun, d.kunci, d.prog, d.kro, d.ro, d.sub, d.akun, d.sumber
  from jsonb_to_recordset(p_rows) as d(kunci text, prog text, kro text, ro text, sub text, akun text, sumber text)
  on conflict (tahun, kunci) do update set sumber = excluded.sumber;
  select count(*) into v_jumlah from public.ref_sumber_dana where tahun = v_tahun;
  return jsonb_build_object('jumlah', v_jumlah, 'tahun', v_tahun);
end;
$function$;

CREATE OR REPLACE FUNCTION public.simpan_rkk_lengkap(p_tahun integer, p_posisi date, p_nama_file text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := coalesce((select email from public.pengguna where id = auth.uid()), '');
  v_id bigint; v_item int; v_pagu bigint; v_bintang int; v_pagu_bintang bigint; v_akun int;
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > 2100 then raise exception 'Tahun anggaran tidak valid: %', p_tahun; end if;
  if p_posisi is null then raise exception 'Tanggal posisi RKK wajib diisi.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Tidak ada item RKK yang dikirim.'; end if;

  insert into public.anggaran_versi as v (tahun, posisi, nama_file, diunggah_oleh)
  values (p_tahun, p_posisi, coalesce(p_nama_file, ''), v_email)
  on conflict (posisi) do update
    set tahun = excluded.tahun, nama_file = excluded.nama_file, diunggah_pada = now(), diunggah_oleh = excluded.diunggah_oleh
  returning id into v_id;

  delete from public.anggaran where versi_id = v_id;

  insert into public.anggaran (versi_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                               sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian,
                               volume, satuan, harga, jumlah, blokir)
  select v_id, d.urutan, d.prog, d.prog_n, d.keg, d.keg_n, d.kro, d.kro_n, d.ro, d.ro_n, lpad(d.komp, 3, '0'), d.komp_n,
         d.sub, d.sub_n, d.akun, d.akun_n, coalesce(d.sumber, ''), u.kategori, u.unit,
         coalesce(d.judul, ''), coalesce(d.judul2, ''), d.uraian, d.volume, coalesce(d.satuan, ''), d.harga,
         coalesce(d.jumlah, 0), coalesce(d.blokir, false)
  from jsonb_to_recordset(p_rows) as d(
         urutan int, prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
         komp text, komp_n text, sub text, sub_n text, akun text, akun_n text, sumber text,
         judul text, judul2 text, uraian text, volume numeric, satuan text, harga numeric, jumlah bigint, blokir boolean)
  cross join lateral public.fn_unit(d.kro, d.komp, d.sub, p_tahun) u;

  select count(*), coalesce(sum(jumlah), 0), count(*) filter (where blokir), coalesce(sum(jumlah) filter (where blokir), 0)
    into v_item, v_pagu, v_bintang, v_pagu_bintang
    from public.anggaran where versi_id = v_id;
  update public.anggaran_versi
     set jumlah_item = v_item, pagu = v_pagu, item_blokir = v_bintang, pagu_item_blokir = v_pagu_bintang
   where id = v_id;

  -- pemetaan sumber dana tahun itu diperbarui dari RKK yang sama (menggantikan simpan_rkk)
  delete from public.ref_sumber_dana where tahun = p_tahun;
  insert into public.ref_sumber_dana (tahun, kunci, prog, kro, ro, sub, akun, sumber)
  select distinct on (k) p_tahun, k, prog, kro, ro, sub, akun, sumber
    from (select prog || '|' || kro || '|' || ro || '|' || sub || '|' || akun as k, prog, kro, ro, sub, akun, sumber
            from public.anggaran where versi_id = v_id and sumber <> '') x
   order by k;
  get diagnostics v_akun = row_count;

  return jsonb_build_object('versi', v_id, 'tahun', p_tahun, 'posisi', p_posisi, 'jumlah_item', v_item, 'pagu', v_pagu,
                            'item_blokir', v_bintang, 'pagu_item_blokir', v_pagu_bintang, 'akun_sumber', v_akun);
end;
$function$;

CREATE OR REPLACE FUNCTION public.terapkan_ulang_pemetaan(p_periode date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not public.fn_hak('unggah') then raise exception 'Anda tidak memiliki hak mengelola data (unggah RKK/realisasi & pemetaan unit).'; end if;
  update public.realisasi r
     set kategori = x.kategori,
         unit     = x.unit,
         sumber   = coalesce(x.sumber, r.sumber)
    from (
      select r2.id, u.kategori, u.unit, s.sumber
        from public.realisasi r2
        cross join lateral public.fn_unit(r2.kro, r2.komp, r2.sub, extract(year from r2.periode)::int) u
        left join public.ref_sumber_dana s
               on s.tahun = public.fn_tahun_pemetaan_sumber(extract(year from r2.periode)::int)
              and s.kunci = r2.prog || '|' || r2.kro || '|' || r2.ro || '|' || r2.sub || '|' || r2.akun
       where p_periode is null or r2.periode = p_periode
    ) x
   where x.id = r.id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('baris', v_n);
end;
$function$;

CREATE OR REPLACE FUNCTION public.catat_no_revisi(p_id bigint, p_no text, p_catatan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_status text;
begin
  if not public.fn_hak('sakti') then raise exception 'Anda tidak memiliki hak mencatat No. Revisi SAKTI dan menyelesaikan usulan.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status not in ('disetujui', 'diinput_sakti') then raise exception 'No. Revisi hanya dicatat untuk usulan yang sudah disetujui.'; end if;
  if coalesce(length(btrim(p_no)), 0) < 3 then raise exception 'Isi No. Revisi SAKTI, mis. 2026.307740.015.'; end if;
  update public.usulan_revisi set status = 'diinput_sakti', no_revisi = btrim(p_no), diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'diinput_sakti', 'No. Revisi ' || btrim(p_no) || case when coalesce(btrim(p_catatan), '') <> '' then ' — ' || btrim(p_catatan) else '' end);
  return jsonb_build_object('id', p_id, 'status', 'diinput_sakti');
end;
$function$;

CREATE OR REPLACE FUNCTION public.selesaikan_usulan(p_id bigint, p_catatan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_status text;
begin
  if not public.fn_hak('sakti') then raise exception 'Anda tidak memiliki hak mencatat No. Revisi SAKTI dan menyelesaikan usulan.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status <> 'diinput_sakti' then raise exception 'Usulan diselesaikan setelah diinput ke SAKTI.'; end if;
  update public.usulan_revisi set status = 'selesai', diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'selesai', p_catatan);
  return jsonb_build_object('id', p_id, 'status', 'selesai');
end;
$function$;

CREATE OR REPLACE FUNCTION public.buat_histori(p_versi_id bigint, p_kategori text, p_unit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_satker boolean := coalesce(p_kategori, '') = ''; v_label text;
  v_peran text := public.fn_peran(); v record; v_akhir bigint; a record;
  v_id bigint; v_no int; v_judul text; v_n int; v_pagu bigint; v_item int;
begin
  if not (v_peran = 'UNIT' or public.fn_hak('usulan')) then raise exception 'Peran Anda tidak dapat membuat usulan revisi.'; end if;
  select * into v from public.anggaran_versi where id = p_versi_id;
  if not found then raise exception 'Versi RKK (histori awal) tidak ditemukan.'; end if;
  select id into v_akhir from public.anggaran_versi where tahun = v.tahun order by posisi desc limit 1;
  if v_akhir <> v.id then raise exception 'Histori awal harus DIPA terakhir TA %. Muat ulang halaman.', v.tahun; end if;
  if v_satker then
    if not public.fn_hak('satker') then raise exception 'Anda tidak memiliki hak membentuk usulan revisi seluruh satker.'; end if;
  elsif not (case when v_peran = 'UNIT' then public.fn_boleh(p_kategori, p_unit) else public.fn_unit_usulan(p_kategori, p_unit) end) then
    raise exception 'Unit tersebut di luar cakupan Anda.';
  end if;
  v_label := case when v_satker then 'seluruh satker' else coalesce(nullif(p_unit, ''), p_kategori) end;

  select count(*), coalesce(sum(jumlah), 0) into v_item, v_pagu from public.anggaran
   where versi_id = v.id and (v_satker or (kategori = p_kategori and unit is not distinct from nullif(p_unit, '')));
  if v_item = 0 then raise exception 'Unit % tidak memiliki anggaran pada RKK ini.', v_label; end if;

  -- usulan seluruh satker & usulan unit tidak boleh berjalan bersamaan (mengubah item yang sama)
  if v_satker then
    select string_agg(coalesce(nullif(unit, ''), kategori, 'satker') || ' (' || status || ')', ', ') into v_label from public.usulan_revisi
     where tahun = v.tahun and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui');
    if v_label is not null then
      raise exception 'Masih ada usulan revisi aktif: %. Selesaikan atau batalkan lebih dulu sebelum membentuk usulan seluruh satker.', v_label;
    end if;
    v_label := 'seluruh satker';
  else
    select id, judul, status into a from public.usulan_revisi
     where tahun = v.tahun and histori and kategori is null and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui') limit 1;
    if found then
      raise exception 'Sedang ada % untuk seluruh satker (status %). Usulan unit dapat dibentuk setelah usulan itu selesai.', a.judul, a.status;
    end if;
    select id, judul, status into a from public.usulan_revisi
     where tahun = v.tahun and kategori = p_kategori and coalesce(unit, '') = coalesce(p_unit, '')
       and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui') limit 1;
    if found then
      raise exception 'Unit % masih memiliki % (status %). Selesaikan atau batalkan usulan itu lebih dulu.', v_label, a.judul, a.status;
    end if;
  end if;

  v_no := coalesce(v.revisi_ke, 0) + 1;
  v_judul := 'Usulan Revisi ke ' || v_no;
  select count(*) into v_n from public.usulan_revisi
   where tahun = v.tahun and coalesce(kategori, '') = coalesce(p_kategori, '') and coalesce(unit, '') = coalesce(p_unit, '') and revisi_ke = v_no;
  if v_n > 0 then v_judul := v_judul || ' (' || (v_n + 1) || ')'; end if;

  insert into public.usulan_revisi (tahun, versi_id, kategori, unit, lintas_unit, judul, alasan, histori, revisi_ke, pagu_awal, pagu_usulan, dibuat_oleh, dibuat_email)
  values (v.tahun, v.id, nullif(p_kategori, ''), nullif(p_unit, ''), v_satker, v_judul, '', true, v_no, v_pagu, v_pagu, auth.uid(),
          coalesce((select email from public.pengguna where id = auth.uid()), ''))
  returning id into v_id;

  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select v_id, x.id, x.urutan, x.prog, x.prog_n, x.keg, x.keg_n, x.kro, x.kro_n, x.ro, x.ro_n, x.komp, x.komp_n,
         x.sub, x.sub_n, x.akun, x.akun_n, x.sumber, x.kategori, x.unit, x.judul, x.judul2, x.uraian, x.volume, x.satuan, x.harga, x.jumlah, x.blokir
    from public.anggaran x
   where x.versi_id = v.id and (v_satker or (x.kategori = p_kategori and x.unit is not distinct from nullif(p_unit, '')));

  perform public.fn_log_usulan(v_id, 'dibuat', case when v_satker then 'Seluruh satker · ' else '' end || 'Histori awal: DIPA – Revisi ke ' || coalesce(v.revisi_ke::text, '?') ||
                                               ' (posisi ' || to_char(v.posisi, 'DD-MM-YYYY') || ')');
  return jsonb_build_object('id', v_id, 'judul', v_judul, 'item', v_item, 'pagu', v_pagu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.simpan_usulan(p_id bigint, p_versi_id bigint, p_judul text, p_alasan text, p_baris jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_peran text := public.fn_peran(); v_id bigint; v_versi bigint; v_tahun int; v_status text;
  b jsonb; a record; v_urut int := 0; v_n int; v_kat text; v_unit text; v_aksi text;
  mv numeric; mh numeric; mj bigint;
begin
  if not (v_peran = 'UNIT' or public.fn_hak('usulan')) then raise exception 'Peran Anda tidak dapat membuat usulan revisi.'; end if;
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

CREATE OR REPLACE FUNCTION public.fn_jaga_periode_usulan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nama text;
begin
  if public.fn_superadmin() or public.fn_hak('usulan') or auth.uid() is null then return new; end if;   -- Super admin & Admin perencanaan bebas periode
  if tg_op = 'UPDATE' and old.status <> 'draf' then return new; end if;   -- dikembalikan / diproses admin: bebas periode
  if public.fn_periode_terbuka(new.tahun, new.kategori, new.unit) then return new; end if;
  v_nama := coalesce(nullif(new.unit, ''), new.kategori, 'unit Anda');
  if tg_op = 'INSERT' then
    raise exception 'Periode revisi untuk % sedang ditutup. Usulan revisi baru dapat dibentuk saat periode revisi dibuka Super admin.', v_nama;
  end if;
  raise exception 'Periode revisi untuk % sedang ditutup. Usulan draf tidak dapat diubah atau dikirim sampai periode revisi dibuka kembali.', v_nama;
end $function$;

CREATE OR REPLACE FUNCTION public.periksa_usulan(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- detail yang sudah terealisasi (tanpa blokir): tidak boleh dihapus/dipindah, jumlah ≥ realisasi
  for r in
    select b.uraian, b.aksi, b.m_jumlah, k.realisasi sd
      from public.usulan_revisi_baris b
      join public.blokir_item(u.versi_id) k on k.anggaran_id = b.anggaran_id
     where b.usulan_id = p_id and k.blokir = 0 and k.realisasi > 0 and (b.aksi = 'hapus' or (b.m_jumlah < k.realisasi and b.m_jumlah < b.s_jumlah))
  loop
    v_tolak := v_tolak || case when r.aksi = 'hapus' then format('Detail "%s" sudah terealisasi Rp %s dan tidak dapat dihapus atau dipindah.', r.uraian, public.fn_rp(r.sd))
                               else format('Jumlah "%s" menjadi Rp %s, di bawah realisasinya Rp %s.', r.uraian, public.fn_rp(r.m_jumlah), public.fn_rp(r.sd)) end;
  end loop;

  select count(distinct coalesce(kategori, '') || '|' || coalesce(unit, '')) into v_n from public.usulan_revisi_baris where usulan_id = p_id;
  if v_n > 1 and not public.fn_hak_pengguna(u.dibuat_oleh, 'satker') then
    v_tolak := v_tolak || 'Pergeseran antar fakultas/unit hanya dapat dilakukan Admin perencanaan.'::text;
  end if;
  if v_peran = 'UNIT' and exists (
       select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and not exists (
         select 1 from public.pengguna_cakupan c where c.user_id = u.dibuat_oleh and c.kategori = b.kategori and (c.unit = '' or c.unit = b.unit))) then
    v_tolak := v_tolak || 'Usulan memuat item di luar cakupan unit Anda.'::text;
  end if;
  if v_peran in ('PERENCANAAN', 'ADMIN') and exists (
       select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and not public.fn_unit_usulan_pengguna(u.dibuat_oleh, b.kategori, b.unit)) then
    v_tolak := v_tolak || 'Usulan memuat item di luar cakupan usulan pembuatnya.'::text;
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


revoke all on function public.fn_hak_pengguna(uuid, text), public.fn_hak(text), public.fn_unit_usulan_pengguna(uuid, text, text),
  public.fn_unit_usulan(text, text), public.simpan_pengguna(uuid, text, boolean, text, jsonb, text[]) from public, anon;
grant execute on function public.fn_hak_pengguna(uuid, text), public.fn_hak(text), public.fn_unit_usulan_pengguna(uuid, text, text),
  public.fn_unit_usulan(text, text), public.simpan_pengguna(uuid, text, boolean, text, jsonb, text[]) to authenticated, service_role;
