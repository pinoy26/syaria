-- =====================================================================
-- Monev Anggaran tahap 11: tab Pengajuan Revisi (pola SAKTI)
--
-- 1. usulan_revisi: isian surat usulan (perihal, pimpinan unit, pengusul), jenis revisi
--    (dideteksi otomatis saat dikirim), lampiran surat usulan & dokumen pendukung.
-- 2. Storage bucket privat 'usulan':
--      <usulan_id>/surat-<waktu>.pdf        surat usulan (PDF, maks. 10 MB, wajib)
--      <usulan_id>/pendukung-<waktu>.<ext>  dokumen pendukung (PDF/ZIP, maks. 20 MB)
--      templat/<nama>                       templat surat usulan (diunggah Admin perencanaan)
-- 3. jenis_usulan()     : deteksi jenis revisi dari selisih salinan terhadap DIPA basis
-- 4. simpan_pengajuan() : simpan isian surat (draf/dikembalikan)
-- 5. atur_lampiran()    : catat/lepas lampiran yang sudah diunggah (ukuran & tipe diperiksa server)
-- 6. kirim_usulan()     : "Lanjut & Kirim" — verifikasi isian + surat + aturan revisi, lalu diajukan
-- 7. proses_usulan()    : Admin perencanaan hanya Validasi & Setujui atau Kembalikan (tanpa Tolak)
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Kolom isian pengajuan ----------
alter table public.usulan_revisi add column if not exists perihal          text   not null default '';
alter table public.usulan_revisi add column if not exists pimpinan_nama    text   not null default '';
alter table public.usulan_revisi add column if not exists pimpinan_nip     text   not null default '';
alter table public.usulan_revisi add column if not exists pengusul_nama    text   not null default '';
alter table public.usulan_revisi add column if not exists pengusul_nip     text   not null default '';
alter table public.usulan_revisi add column if not exists pengusul_jabatan text   not null default '';
alter table public.usulan_revisi add column if not exists pengusul_hp      text   not null default '';
alter table public.usulan_revisi add column if not exists jenis_revisi     text[] not null default '{}';
alter table public.usulan_revisi add column if not exists surat_path       text   not null default '';
alter table public.usulan_revisi add column if not exists surat_nama       text   not null default '';
alter table public.usulan_revisi add column if not exists surat_ukuran     bigint not null default 0;
alter table public.usulan_revisi add column if not exists pendukung_path   text   not null default '';
alter table public.usulan_revisi add column if not exists pendukung_nama   text   not null default '';
alter table public.usulan_revisi add column if not exists pendukung_ukuran bigint not null default 0;
alter table public.usulan_revisi add column if not exists diajukan_pada    timestamptz;

-- ---------- 2. Storage bucket privat 'usulan' ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('usulan', 'usulan', false, 20971520,
        array['application/pdf', 'application/zip', 'application/x-zip-compressed',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- hak berkas: folder pertama = id usulan (atau 'templat')
create or replace function public.fn_usulan_berkas(p_name text, p_tulis boolean)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_f text := split_part(coalesce(p_name, ''), '/', 1); u record;
begin
  if v_f = 'templat' then
    return case when p_tulis then public.fn_superadmin() else public.fn_peran() <> '' end;
  end if;
  if v_f !~ '^[0-9]{1,18}$' then return false; end if;
  select id, status, dibuat_oleh, kategori, unit into u from public.usulan_revisi where id = v_f::bigint;
  if not found then return false; end if;
  if p_tulis then
    return public.fn_superadmin() or (u.dibuat_oleh = auth.uid() and u.status in ('draf', 'dikembalikan'));
  end if;
  return public.fn_superadmin() or public.fn_semua() or u.dibuat_oleh = auth.uid()
      or (u.kategori is not null and public.fn_boleh(u.kategori, u.unit));
end $$;

drop policy if exists "usulan berkas: baca"   on storage.objects;
drop policy if exists "usulan berkas: unggah" on storage.objects;
drop policy if exists "usulan berkas: hapus"  on storage.objects;
create policy "usulan berkas: baca" on storage.objects for select to authenticated
  using (bucket_id = 'usulan' and public.fn_usulan_berkas(name, false));
create policy "usulan berkas: unggah" on storage.objects for insert to authenticated
  with check (bucket_id = 'usulan' and public.fn_usulan_berkas(name, true));
create policy "usulan berkas: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'usulan' and public.fn_usulan_berkas(name, true));

-- ---------- 3. Deteksi jenis revisi ----------
create or replace function public.jenis_usulan(p_id bigint)
returns text[] language plpgsql stable security definer set search_path to 'public' as $function$
declare u record; v text[] := '{}';
begin
  select * into u from public.usulan_revisi x where x.id = p_id
     and (public.fn_superadmin() or public.fn_semua() or x.dibuat_oleh = auth.uid() or (x.kategori is not null and public.fn_boleh(x.kategori, x.unit)));
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id) then return v; end if;

  -- tingkat pergeseran: tingkat terkecil yang neto perubahannya nol di setiap kelompok
  if not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog, kro, ro, komp, sub, akun having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Perubahan rincian dalam akun yang sama (pagu akun tetap)'::text;
  elsif not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog, kro, ro, komp, sub having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran anggaran antar akun dalam satu sub komponen'::text;
  elsif not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog, kro, ro, komp having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran anggaran antar sub komponen dalam satu komponen'::text;
  elsif not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog, kro, ro having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran anggaran antar komponen dalam satu RO'::text;
  elsif not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog, kro having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran anggaran antar RO dalam satu KRO'::text;
  elsif not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by prog having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran anggaran antar KRO dalam satu program'::text;
  else
    v := v || 'Pergeseran anggaran antar program'::text;
  end if;

  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by left(akun, 2) having sum(m_jumlah - s_jumlah) <> 0) then
    v := v || 'Pergeseran antar jenis belanja'::text;
  end if;
  if exists (select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and b.aksi = 'tambah' and not exists (
               select 1 from public.anggaran a where a.versi_id = u.versi_id and a.prog = b.prog and a.kro = b.kro and a.ro = b.ro and a.sub = b.sub)) then
    v := v || 'Penambahan sub komponen baru'::text;
  end if;
  if exists (select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and b.aksi = 'tambah' and not exists (
               select 1 from public.anggaran a where a.versi_id = u.versi_id and a.prog = b.prog and a.kro = b.kro and a.ro = b.ro and a.sub = b.sub and a.akun = b.akun)) then
    v := v || 'Penambahan akun baru'::text;
  end if;
  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and aksi = 'tambah') then v := v || 'Penambahan detail'::text; end if;
  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and aksi = 'hapus') then v := v || 'Penghapusan detail'::text; end if;
  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and aksi = 'ubah'
               and (m_volume is distinct from s_volume or m_harga is distinct from s_harga or m_satuan <> s_satuan)) then
    v := v || 'Perubahan volume / harga satuan'::text;
  end if;
  return v;
end;
$function$;

-- ---------- 4. Simpan isian surat usulan ----------
create or replace function public.simpan_pengajuan(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record;
  f_perihal text := btrim(coalesce(p_data->>'perihal', ''));
  f_alasan text := btrim(coalesce(p_data->>'alasan', ''));
  f_pn text := btrim(coalesce(p_data->>'pimpinan_nama', ''));
  f_pp text := regexp_replace(coalesce(p_data->>'pimpinan_nip', ''), '\s', '', 'g');
  f_un text := btrim(coalesce(p_data->>'pengusul_nama', ''));
  f_up text := regexp_replace(coalesce(p_data->>'pengusul_nip', ''), '\s', '', 'g');
  f_uj text := btrim(coalesce(p_data->>'pengusul_jabatan', ''));
  f_uh text := btrim(coalesce(p_data->>'pengusul_hp', ''));
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Usulan yang sudah dikirim tidak dapat diubah.'; end if;
  if length(f_perihal) > 300 then raise exception 'Perihal maksimal 300 karakter.'; end if;
  if length(f_alasan) > 5000 then raise exception 'Keterangan maksimal 5.000 karakter.'; end if;
  if greatest(length(f_pn), length(f_un), length(f_uj)) > 150 then raise exception 'Nama dan jabatan maksimal 150 karakter.'; end if;
  if greatest(length(f_pp), length(f_up), length(f_uh)) > 30 then raise exception 'NIP dan nomor HP maksimal 30 karakter.'; end if;
  update public.usulan_revisi
     set perihal = f_perihal, alasan = f_alasan, pimpinan_nama = f_pn, pimpinan_nip = f_pp,
         pengusul_nama = f_un, pengusul_nip = f_up, pengusul_jabatan = f_uj, pengusul_hp = f_uh, diubah_pada = now()
   where id = p_id;
  return jsonb_build_object('id', p_id);
end;
$function$;

-- ---------- 5. Lampiran (berkas sudah diunggah ke Storage oleh browser) ----------
create or replace function public.atur_lampiran(p_id bigint, p_jenis text, p_path text, p_nama text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; o record; v_lama text; v_ukuran bigint; v_tipe text; v_batas bigint;
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Lampiran usulan yang sudah dikirim tidak dapat diubah.'; end if;
  if p_jenis not in ('surat', 'pendukung') then raise exception 'Jenis lampiran tidak dikenal.'; end if;
  v_lama := case when p_jenis = 'surat' then u.surat_path else u.pendukung_path end;

  if coalesce(p_path, '') = '' then
    if p_jenis = 'surat' then update public.usulan_revisi set surat_path = '', surat_nama = '', surat_ukuran = 0, diubah_pada = now() where id = p_id;
    else update public.usulan_revisi set pendukung_path = '', pendukung_nama = '', pendukung_ukuran = 0, diubah_pada = now() where id = p_id; end if;
    return jsonb_build_object('id', p_id, 'lama', v_lama);
  end if;

  if split_part(p_path, '/', 1) <> p_id::text then raise exception 'Lokasi berkas tidak sesuai usulan.'; end if;
  select * into o from storage.objects where bucket_id = 'usulan' and name = p_path;
  if not found then raise exception 'Berkas belum terunggah. Coba unggah lagi.'; end if;
  v_ukuran := coalesce((o.metadata->>'size')::bigint, 0);
  v_tipe := lower(coalesce(o.metadata->>'mimetype', ''));
  v_batas := case when p_jenis = 'surat' then 10485760 else 20971520 end;
  if v_ukuran > v_batas then raise exception 'Ukuran berkas % melebihi batas % MB.', p_nama, v_batas / 1048576; end if;
  if p_jenis = 'surat' and v_tipe <> 'application/pdf' then raise exception 'Surat usulan harus berformat PDF.'; end if;
  if p_jenis = 'pendukung' and v_tipe not in ('application/pdf', 'application/zip', 'application/x-zip-compressed') then
    raise exception 'Dokumen pendukung harus berformat PDF atau ZIP.';
  end if;

  if p_jenis = 'surat' then
    update public.usulan_revisi set surat_path = p_path, surat_nama = left(coalesce(p_nama, ''), 200), surat_ukuran = v_ukuran, diubah_pada = now() where id = p_id;
  else
    update public.usulan_revisi set pendukung_path = p_path, pendukung_nama = left(coalesce(p_nama, ''), 200), pendukung_ukuran = v_ukuran, diubah_pada = now() where id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'lama', case when v_lama <> p_path then v_lama else '' end, 'ukuran', v_ukuran);
end;
$function$;

-- ---------- 6. Lanjut & Kirim ----------
create or replace function public.kirim_usulan(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; v_akhir record; h jsonb; j text[]; v_kurang text[] := '{}'; x text;
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama; ajukan lewat formulir usulan.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Usulan ini sudah dikirim.'; end if;

  select id, revisi_ke into v_akhir from public.anggaran_versi where tahun = u.tahun order by posisi desc limit 1;
  if v_akhir.id is distinct from u.versi_id then
    v_kurang := v_kurang || format('DIPA sudah diperbarui menjadi DIPA – Revisi ke %s. Batalkan usulan ini, lalu bentuk ulang dari Status Histori.', coalesce(v_akhir.revisi_ke::text, '?'));
  end if;

  -- isian surat usulan
  if length(u.perihal) < 5 then v_kurang := v_kurang || 'Perihal surat usulan wajib diisi.'::text; end if;
  if length(u.alasan) < 10 then v_kurang := v_kurang || 'Keterangan / alasan revisi wajib diisi (minimal 10 karakter).'::text; end if;
  if length(u.pimpinan_nama) < 3 then v_kurang := v_kurang || 'Nama pimpinan unit wajib diisi.'::text; end if;
  if u.pimpinan_nip !~ '^[0-9]{18}$' then v_kurang := v_kurang || 'NIP pimpinan unit harus 18 digit angka.'::text; end if;
  if length(u.pengusul_nama) < 3 then v_kurang := v_kurang || 'Nama pengusul wajib diisi.'::text; end if;
  if u.pengusul_nip <> '' and u.pengusul_nip !~ '^[0-9]{18}$' then v_kurang := v_kurang || 'NIP pengusul harus 18 digit angka (kosongkan bila tidak ada).'::text; end if;
  if length(u.pengusul_jabatan) < 3 then v_kurang := v_kurang || 'Jabatan pengusul wajib diisi.'::text; end if;
  if u.pengusul_hp !~ '^\+?[0-9][0-9 -]{7,19}$' then v_kurang := v_kurang || 'Nomor HP pengusul belum benar.'::text; end if;

  -- lampiran
  if u.surat_path = '' or not exists (select 1 from storage.objects where bucket_id = 'usulan' and name = u.surat_path) then
    v_kurang := v_kurang || 'Surat usulan (PDF) wajib diunggah.'::text;
  end if;
  if u.pendukung_path <> '' and not exists (select 1 from storage.objects where bucket_id = 'usulan' and name = u.pendukung_path) then
    v_kurang := v_kurang || 'Berkas dokumen pendukung tidak ditemukan. Unggah ulang atau hapus.'::text;
  end if;

  -- aturan revisi (sama dengan pemeriksaan di Belanja Redesain)
  h := public.periksa_usulan(p_id);
  for x in select jsonb_array_elements_text(h->'tolak') loop v_kurang := v_kurang || x; end loop;

  if array_length(v_kurang, 1) > 0 then
    update public.usulan_revisi set hasil_periksa = h where id = p_id;
    return jsonb_build_object('ok', false, 'kurang', to_jsonb(v_kurang), 'periksa', h);
  end if;

  j := public.jenis_usulan(p_id);
  update public.usulan_revisi
     set status = 'diajukan', perlu_telaah = jsonb_array_length(h->'telaah') > 0, hasil_periksa = h,
         jenis_revisi = j, diajukan_pada = now(), diubah_pada = now()
   where id = p_id;
  perform public.fn_log_usulan(p_id, 'diajukan', 'Lanjut & Kirim' || case when jsonb_array_length(h->'telaah') > 0 then ' · perlu telaah' else '' end);
  return jsonb_build_object('ok', true, 'id', p_id, 'status', 'diajukan', 'jenis', to_jsonb(j), 'periksa', h);
end;
$function$;

-- ---------- 7. Formulir lama tidak lagi dipakai untuk usulan histori; Tolak dihapus ----------
create or replace function public.ajukan_usulan(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; v_histori boolean; h jsonb; v_msg text;
begin
  select status, histori into v_status, v_histori from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if v_histori then raise exception 'Kirim usulan ini lewat tombol Lanjut & Kirim di tab Pengajuan Revisi.'; end if;
  if v_status not in ('draf', 'dikembalikan') then raise exception 'Usulan ini sudah diajukan.'; end if;
  h := public.periksa_usulan(p_id);
  if jsonb_array_length(h->'tolak') > 0 then
    select string_agg(x, ' ') into v_msg from jsonb_array_elements_text(h->'tolak') x;
    raise exception 'Usulan belum dapat diajukan. %', v_msg;
  end if;
  update public.usulan_revisi set status = 'diajukan', perlu_telaah = jsonb_array_length(h->'telaah') > 0, hasil_periksa = h, diajukan_pada = now(), diubah_pada = now() where id = p_id;
  perform public.fn_log_usulan(p_id, 'diajukan', case when jsonb_array_length(h->'telaah') > 0 then 'Perlu telaah' else '' end);
  return jsonb_build_object('id', p_id, 'status', 'diajukan', 'periksa', h);
end;
$function$;

create or replace function public.proses_usulan(p_id bigint, p_aksi text, p_catatan text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_status text; h jsonb; v_baru text;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat memproses usulan revisi.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_status <> 'diajukan' then raise exception 'Hanya usulan berstatus Diajukan yang dapat diproses.'; end if;
  if p_aksi = 'setujui' then
    h := public.periksa_usulan(p_id);
    if jsonb_array_length(h->'tolak') > 0 then raise exception 'Usulan tidak lagi memenuhi aturan: %', (select string_agg(x, ' ') from jsonb_array_elements_text(h->'tolak') x); end if;
    v_baru := 'disetujui';
  elsif p_aksi = 'kembalikan' then
    if coalesce(length(btrim(p_catatan)), 0) < 3 then raise exception 'Catatan perbaikan wajib diisi saat mengembalikan usulan.'; end if;
    v_baru := 'dikembalikan';
  else
    raise exception 'Aksi tidak dikenal. Usulan hanya dapat disetujui atau dikembalikan.';
  end if;
  update public.usulan_revisi set status = v_baru, diubah_pada = now(), hasil_periksa = coalesce(h, hasil_periksa) where id = p_id;
  perform public.fn_log_usulan(p_id, v_baru, coalesce(btrim(p_catatan), ''));
  return jsonb_build_object('id', p_id, 'status', v_baru);
end;
$function$;

-- ---------- 8. Hak eksekusi ----------
revoke all on function public.fn_usulan_berkas(text, boolean) from public, anon;
grant execute on function public.fn_usulan_berkas(text, boolean) to authenticated;
revoke all on function public.jenis_usulan(bigint), public.simpan_pengajuan(bigint, jsonb), public.atur_lampiran(bigint, text, text, text),
  public.kirim_usulan(bigint), public.ajukan_usulan(bigint), public.proses_usulan(bigint, text, text) from public, anon;
grant execute on function public.jenis_usulan(bigint), public.simpan_pengajuan(bigint, jsonb), public.atur_lampiran(bigint, text, text, text),
  public.kirim_usulan(bigint), public.ajukan_usulan(bigint), public.proses_usulan(bigint, text, text) to authenticated, service_role;
