-- =====================================================================
-- Surat usulan hanya wajib untuk revisi dari fakultas/unit.
-- Usulan yang dibentuk Super admin (SUPERADMIN) atau Admin perencanaan (PERENCANAAN, peran
-- yang direncanakan) dikirim tanpa surat & isian surat; keterangan/alasan tetap wajib.
-- Peran pembuat dicatat saat usulan dibuat (pembuat_peran) agar aturan tidak berubah
-- bila peran pengguna kelak diganti.
-- =====================================================================
alter table public.usulan_revisi add column if not exists pembuat_peran text not null default '';
update public.usulan_revisi u set pembuat_peran = coalesce((select p.peran from public.pengguna p where p.id = u.dibuat_oleh), '')
 where pembuat_peran = '';

create or replace function public.fn_isi_pembuat_peran() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  new.pembuat_peran := coalesce((select peran from public.pengguna where id = new.dibuat_oleh), '');
  return new;
end $$;
drop trigger if exists usulan_isi_pembuat_peran on public.usulan_revisi;
create trigger usulan_isi_pembuat_peran before insert on public.usulan_revisi
  for each row execute function public.fn_isi_pembuat_peran();
-- pembuat_peran tidak dapat diubah setelah usulan dibuat
create or replace function public.fn_jaga_pembuat_peran() returns trigger
language plpgsql set search_path to 'public' as $$
begin new.pembuat_peran := old.pembuat_peran; return new; end $$;
drop trigger if exists usulan_jaga_pembuat_peran on public.usulan_revisi;
create trigger usulan_jaga_pembuat_peran before update on public.usulan_revisi
  for each row execute function public.fn_jaga_pembuat_peran();

create or replace function public.fn_wajib_surat(p_peran text) returns boolean
language sql immutable as $$ select coalesce(p_peran, '') not in ('SUPERADMIN', 'PERENCANAAN') $$;

create or replace function public.kirim_usulan(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; v_akhir record; v_wajib boolean; h jsonb; j text[]; v_kurang text[] := '{}'; x text;
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama; ajukan lewat formulir usulan.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Usulan ini sudah dikirim.'; end if;

  select id, revisi_ke into v_akhir from public.anggaran_versi where tahun = u.tahun order by posisi desc limit 1;
  if v_akhir.id is distinct from u.versi_id then
    v_kurang := v_kurang || format('DIPA sudah diperbarui menjadi DIPA – Revisi ke %s. Batalkan usulan ini, lalu bentuk ulang dari Status Histori.', coalesce(v_akhir.revisi_ke::text, '?'));
  end if;

  v_wajib := public.fn_wajib_surat(u.pembuat_peran);
  if length(u.alasan) < 10 then v_kurang := v_kurang || 'Keterangan / alasan revisi wajib diisi (minimal 10 karakter).'::text; end if;
  -- isian & surat usulan: wajib untuk usulan dari fakultas/unit, tidak wajib untuk usulan Super admin / Admin perencanaan
  if v_wajib then
  if length(u.perihal) < 5 then v_kurang := v_kurang || 'Perihal surat usulan wajib diisi.'::text; end if;
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

revoke all on function public.fn_isi_pembuat_peran(), public.fn_jaga_pembuat_peran() from public, anon, authenticated;
revoke all on function public.kirim_usulan(bigint) from public, anon;
grant execute on function public.kirim_usulan(bigint), public.fn_wajib_surat(text) to authenticated, service_role;
