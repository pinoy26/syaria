-- =====================================================================
-- Monev Anggaran tahap 8: alur revisi pola SAKTI (Status Histori)
--
-- 1. anggaran_versi.revisi_ke  : label "DIPA – Revisi ke N" (otomatis menurut urutan unggahan,
--                                bisa dikoreksi Admin perencanaan)
-- 2. ref_akun                  : Bagan Akun Standar, diisi otomatis dari akun di RKK yang diunggah
-- 3. usulan_salinan            : salinan kerja RKK unit per usulan ("Usulan Revisi ke N")
-- 4. buat_histori()            : tombol "Usulan Revisi" di layar Status Histori
-- 5. satu usulan aktif per unit (indeks unik + pemeriksaan di fungsi)
-- 6. pagu_unit_versi()         : pagu per unit per versi RKK (mengikuti RLS) untuk Monitoring
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Label revisi DIPA pada versi RKK ----------
alter table public.anggaran_versi add column if not exists revisi_ke int check (revisi_ke between 0 and 999);

create or replace function public.fn_isi_revisi_ke() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.revisi_ke is null then
    select coalesce(max(revisi_ke), 0) + 1 into new.revisi_ke
      from public.anggaran_versi where tahun = new.tahun and posisi < new.posisi;
  end if;
  return new;
end $$;
drop trigger if exists anggaran_versi_revisi_ke on public.anggaran_versi;
create trigger anggaran_versi_revisi_ke before insert on public.anggaran_versi
  for each row execute function public.fn_isi_revisi_ke();

update public.anggaran_versi v set revisi_ke = x.n
  from (select id, row_number() over (partition by tahun order by posisi) n from public.anggaran_versi) x
 where v.id = x.id and v.revisi_ke is null;

create or replace function public.atur_revisi_versi(p_id bigint, p_revisi int)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat mengubah nomor revisi DIPA.'; end if;
  if p_revisi is null or p_revisi < 0 or p_revisi > 999 then raise exception 'Nomor revisi harus 0–999.'; end if;
  update public.anggaran_versi set revisi_ke = p_revisi where id = p_id;
  if not found then raise exception 'Versi RKK tidak ditemukan.'; end if;
  return jsonb_build_object('id', p_id, 'revisi_ke', p_revisi);
end;
$function$;

-- ---------- 2. Bagan Akun Standar ----------
create table if not exists public.ref_akun (
  kode       text primary key check (kode ~ '^[0-9]{6}$'),
  nama       text not null default '',
  asal       text not null default 'rkk' check (asal in ('rkk', 'manual')),
  diperbarui timestamptz not null default now()
);
alter table public.ref_akun enable row level security;
drop policy if exists ref_akun_lihat  on public.ref_akun;
drop policy if exists ref_akun_kelola on public.ref_akun;
create policy ref_akun_lihat  on public.ref_akun for select to authenticated using (public.fn_peran() <> '');
create policy ref_akun_kelola on public.ref_akun for all    to authenticated using (public.fn_superadmin()) with check (public.fn_superadmin());
revoke all on public.ref_akun from anon;
grant select on public.ref_akun to authenticated;
grant insert, update, delete on public.ref_akun to authenticated;

create or replace function public.fn_isi_ref_akun() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.ref_akun (kode, nama)
  select distinct on (akun) akun, coalesce(akun_n, '') from baru
   where akun ~ '^[0-9]{6}$' order by akun, (coalesce(akun_n, '') = '')
  on conflict (kode) do update
    set nama = case when excluded.nama <> '' then excluded.nama else ref_akun.nama end, diperbarui = now();
  return null;
end $$;
drop trigger if exists anggaran_isi_ref_akun on public.anggaran;
create trigger anggaran_isi_ref_akun after insert on public.anggaran
  referencing new table as baru for each statement execute function public.fn_isi_ref_akun();

insert into public.ref_akun (kode, nama)
select distinct on (akun) akun, coalesce(akun_n, '') from public.anggaran
 where akun ~ '^[0-9]{6}$' order by akun, (coalesce(akun_n, '') = '')
on conflict (kode) do nothing;

-- ---------- 3. Usulan berbasis histori & salinan kerja ----------
alter table public.usulan_revisi add column if not exists histori     boolean not null default false;
alter table public.usulan_revisi add column if not exists revisi_ke   int;
alter table public.usulan_revisi add column if not exists pagu_awal   bigint not null default 0;
alter table public.usulan_revisi add column if not exists pagu_usulan bigint not null default 0;

create unique index if not exists usulan_aktif_unik on public.usulan_revisi (tahun, kategori, coalesce(unit, ''))
  where kategori is not null and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui');

create table if not exists public.usulan_salinan (
  id          bigint generated always as identity primary key,
  usulan_id   bigint not null references public.usulan_revisi(id) on delete cascade,
  anggaran_id bigint,                                   -- item RKK asal (null = item baru)
  urutan      numeric not null,                         -- urutan tampil; item sisipan memakai pecahan
  prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
  komp text, komp_n text, sub text, sub_n text, akun text, akun_n text,
  sumber    text not null default '',
  kategori  text, unit text,
  judul     text not null default '',
  judul2    text not null default '',
  uraian    text not null,
  volume    numeric,
  satuan    text not null default '',
  harga     numeric,
  jumlah    bigint not null default 0,
  blokir    boolean not null default false
);
create index if not exists usulan_salinan_idx on public.usulan_salinan (usulan_id, urutan);
alter table public.usulan_salinan enable row level security;
drop policy if exists usulan_salinan_lihat on public.usulan_salinan;
create policy usulan_salinan_lihat on public.usulan_salinan for select to authenticated using (
  exists (select 1 from public.usulan_revisi u where u.id = usulan_id));
revoke all on public.usulan_salinan from anon;
grant select on public.usulan_salinan to authenticated;

-- usulan berbasis histori selalu milik satu unit: simpan_usulan (editor lama) tidak boleh mengosongkan unitnya
create or replace function public.fn_jaga_unit_histori() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if old.histori then new.kategori := old.kategori; new.unit := old.unit; new.lintas_unit := false; end if;
  return new;
end $$;
drop trigger if exists usulan_jaga_unit_histori on public.usulan_revisi;
create trigger usulan_jaga_unit_histori before update on public.usulan_revisi
  for each row execute function public.fn_jaga_unit_histori();

-- ---------- 4. Tombol "Usulan Revisi": bentuk Usulan Revisi ke N dari DIPA terakhir ----------
create or replace function public.buat_histori(p_versi_id bigint, p_kategori text, p_unit text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_peran text := public.fn_peran(); v record; v_akhir bigint; a record;
  v_id bigint; v_no int; v_judul text; v_n int; v_pagu bigint; v_item int;
begin
  if v_peran not in ('UNIT', 'ADMIN', 'SUPERADMIN') then raise exception 'Peran Anda tidak dapat membuat usulan revisi.'; end if;
  select * into v from public.anggaran_versi where id = p_versi_id;
  if not found then raise exception 'Versi RKK (histori awal) tidak ditemukan.'; end if;
  select id into v_akhir from public.anggaran_versi where tahun = v.tahun order by posisi desc limit 1;
  if v_akhir <> v.id then raise exception 'Histori awal harus DIPA terakhir TA %. Muat ulang halaman.', v.tahun; end if;
  if coalesce(p_kategori, '') = '' or not (public.fn_superadmin() or public.fn_boleh(p_kategori, p_unit)) then
    raise exception 'Unit tersebut di luar cakupan Anda.';
  end if;

  select count(*), coalesce(sum(jumlah), 0) into v_item, v_pagu from public.anggaran
   where versi_id = v.id and kategori = p_kategori and unit is not distinct from nullif(p_unit, '');
  if v_item = 0 then raise exception 'Unit % tidak memiliki anggaran pada RKK ini.', coalesce(nullif(p_unit, ''), p_kategori); end if;

  select id, judul, status into a from public.usulan_revisi
   where tahun = v.tahun and kategori = p_kategori and coalesce(unit, '') = coalesce(p_unit, '')
     and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui') limit 1;
  if found then
    raise exception 'Unit % masih memiliki % (status %). Selesaikan atau batalkan usulan itu lebih dulu.', coalesce(nullif(p_unit, ''), p_kategori), a.judul, a.status;
  end if;

  v_no := coalesce(v.revisi_ke, 0) + 1;
  v_judul := 'Usulan Revisi ke ' || v_no;
  select count(*) into v_n from public.usulan_revisi
   where tahun = v.tahun and kategori = p_kategori and coalesce(unit, '') = coalesce(p_unit, '') and revisi_ke = v_no;
  if v_n > 0 then v_judul := v_judul || ' (' || (v_n + 1) || ')'; end if;

  insert into public.usulan_revisi (tahun, versi_id, kategori, unit, judul, alasan, histori, revisi_ke, pagu_awal, pagu_usulan, dibuat_oleh, dibuat_email)
  values (v.tahun, v.id, p_kategori, nullif(p_unit, ''), v_judul, '', true, v_no, v_pagu, v_pagu, auth.uid(),
          coalesce((select email from public.pengguna where id = auth.uid()), ''))
  returning id into v_id;

  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select v_id, x.id, x.urutan, x.prog, x.prog_n, x.keg, x.keg_n, x.kro, x.kro_n, x.ro, x.ro_n, x.komp, x.komp_n,
         x.sub, x.sub_n, x.akun, x.akun_n, x.sumber, x.kategori, x.unit, x.judul, x.judul2, x.uraian, x.volume, x.satuan, x.harga, x.jumlah, x.blokir
    from public.anggaran x
   where x.versi_id = v.id and x.kategori = p_kategori and x.unit is not distinct from nullif(p_unit, '');

  perform public.fn_log_usulan(v_id, 'dibuat', 'Histori awal: DIPA – Revisi ke ' || coalesce(v.revisi_ke::text, '?') ||
                                               ' (posisi ' || to_char(v.posisi, 'DD-MM-YYYY') || ')');
  return jsonb_build_object('id', v_id, 'judul', v_judul, 'item', v_item, 'pagu', v_pagu);
end;
$function$;

-- ---------- 5. Pagu per unit per versi RKK (mengikuti RLS pemanggil) ----------
create or replace function public.pagu_unit_versi()
returns table (versi_id bigint, kategori text, unit text, pagu bigint)
language sql stable security invoker set search_path to 'public' as $$
  select a.versi_id, a.kategori, a.unit, sum(a.jumlah)::bigint from public.anggaran a group by 1, 2, 3;
$$;

-- ---------- 6. Hak eksekusi ----------
revoke all on function public.fn_isi_revisi_ke(), public.fn_isi_ref_akun(), public.fn_jaga_unit_histori() from public, anon, authenticated;
revoke all on function public.atur_revisi_versi(bigint, int), public.buat_histori(bigint, text, text), public.pagu_unit_versi() from public, anon;
grant execute on function public.atur_revisi_versi(bigint, int), public.buat_histori(bigint, text, text), public.pagu_unit_versi() to authenticated, service_role;
