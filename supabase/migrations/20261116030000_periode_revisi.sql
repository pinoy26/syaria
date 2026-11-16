-- =====================================================================
-- Periode revisi fakultas/unit (dibuka & ditutup Super admin)
--
-- Revisi terjadwal tiap awal triwulan melibatkan semua fakultas/unit; di antara jeda itu revisi
-- unit ditutup. Super admin dapat membuka periode kapan saja (terjadwal atau di luar jadwal),
-- untuk semua unit atau unit tertentu, dan menutupnya lebih awal.
--
-- Aturan (dijaga trigger pada usulan_revisi, berlaku untuk semua fungsi penulis usulan):
--   - pengguna selain Super admin hanya dapat MEMBENTUK usulan, MENGEDIT usulan berstatus draf, dan
--     MENGIRIM-nya bila ada periode terbuka untuk unit itu pada tahun anggaran usulan;
--   - usulan berstatus "dikembalikan" tetap dapat diperbaiki & dikirim ulang walau periode ditutup;
--   - membatalkan usulan (hapus) selalu boleh; Super admin tidak dibatasi periode.
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

create table if not exists public.periode_revisi (
  id           bigint generated always as identity primary key,
  tahun        int not null check (tahun between 2000 and 2100),
  nama         text not null check (length(btrim(nama)) between 3 and 120),
  mulai        timestamptz not null,
  selesai      timestamptz not null,
  semua        boolean not null default true,              -- true = semua fakultas & unit
  cakupan      jsonb not null default '[]'::jsonb,         -- [{"kategori":..,"unit":..}] bila semua = false
  catatan      text not null default '' check (length(catatan) <= 1000),
  ditutup_pada timestamptz,                                -- diisi saat ditutup lebih awal
  dibuat_oleh  uuid default auth.uid(),
  dibuat_pada  timestamptz not null default now(),
  check (selesai > mulai)
);
create index if not exists periode_revisi_idx on public.periode_revisi (tahun, mulai);
alter table public.periode_revisi enable row level security;
drop policy if exists periode_revisi_lihat on public.periode_revisi;
create policy periode_revisi_lihat on public.periode_revisi for select to authenticated using (public.fn_peran() <> '');
revoke all on public.periode_revisi from anon;
grant select on public.periode_revisi to authenticated;

-- periode terbuka untuk unit pada tahun anggaran tertentu (saat ini)
create or replace function public.fn_periode_terbuka(p_tahun int, p_kategori text, p_unit text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.periode_revisi p
     where p.tahun = p_tahun and p.ditutup_pada is null and now() >= p.mulai and now() < p.selesai
       and (p.semua or exists (select 1 from jsonb_array_elements(p.cakupan) c
                                where c->>'kategori' = coalesce(p_kategori, '') and coalesce(c->>'unit', '') = coalesce(p_unit, ''))));
$$;

-- penjaga: dipanggil trigger sebelum insert/update usulan_revisi
create or replace function public.fn_jaga_periode_usulan() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_nama text;
begin
  if public.fn_superadmin() or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'draf' then return new; end if;   -- dikembalikan / diproses admin: bebas periode
  if public.fn_periode_terbuka(new.tahun, new.kategori, new.unit) then return new; end if;
  v_nama := coalesce(nullif(new.unit, ''), new.kategori, 'unit Anda');
  if tg_op = 'INSERT' then
    raise exception 'Periode revisi untuk % sedang ditutup. Usulan revisi baru dapat dibentuk saat periode revisi dibuka Super admin.', v_nama;
  end if;
  raise exception 'Periode revisi untuk % sedang ditutup. Usulan draf tidak dapat diubah atau dikirim sampai periode revisi dibuka kembali.', v_nama;
end $$;
drop trigger if exists usulan_jaga_periode on public.usulan_revisi;
create trigger usulan_jaga_periode before insert or update on public.usulan_revisi
  for each row execute function public.fn_jaga_periode_usulan();

-- simpan (baru bila p_id null) / ubah / buka kembali periode — Super admin
create or replace function public.atur_periode_revisi(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint; v_mulai timestamptz; v_selesai timestamptz; v_semua boolean; v_cak jsonb; v_nama text; v_tahun int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Super admin yang dapat mengatur periode revisi.'; end if;
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

create or replace function public.tutup_periode_revisi(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.fn_superadmin() then raise exception 'Hanya Super admin yang dapat menutup periode revisi.'; end if;
  update public.periode_revisi set ditutup_pada = now() where id = p_id and ditutup_pada is null;
  if not found then raise exception 'Periode revisi tidak ditemukan atau sudah ditutup.'; end if;
  return jsonb_build_object('id', p_id, 'ditutup', true);
end;
$function$;

-- periode yang belum pernah dimulai boleh dihapus (salah jadwal)
create or replace function public.hapus_periode_revisi(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.fn_superadmin() then raise exception 'Hanya Super admin yang dapat menghapus periode revisi.'; end if;
  delete from public.periode_revisi where id = p_id and mulai > now();
  if not found then raise exception 'Hanya periode yang belum dimulai yang dapat dihapus. Periode yang sudah berjalan cukup ditutup.'; end if;
  return jsonb_build_object('id', p_id, 'dihapus', true);
end;
$function$;

revoke all on function public.fn_jaga_periode_usulan() from public, anon, authenticated;
revoke all on function public.fn_periode_terbuka(int, text, text), public.atur_periode_revisi(bigint, jsonb),
  public.tutup_periode_revisi(bigint), public.hapus_periode_revisi(bigint) from public, anon;
grant execute on function public.fn_periode_terbuka(int, text, text), public.atur_periode_revisi(bigint, jsonb),
  public.tutup_periode_revisi(bigint), public.hapus_periode_revisi(bigint) to authenticated, service_role;
