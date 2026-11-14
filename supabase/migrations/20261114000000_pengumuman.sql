-- =====================================================================
-- Berita & Pengumuman (publik + internal) dengan lampiran PDF/foto
-- Jalankan di Supabase → SQL Editor (atau `supabase db push`).
-- Skrip ini idempoten: aman dijalankan ulang.
--
-- Asumsi skema yang sudah ada:
--   public.pengguna          (id uuid = auth.users.id, peran text, aktif boolean)
--   public.pengguna_cakupan  (user_id uuid, kategori text, unit text; unit '' = seluruh kategori)
--   peran: SUPERADMIN, ADMIN, PIMPINAN, UNIT
-- =====================================================================

-- ---------- 1. Tabel ----------
create table if not exists public.pengumuman (
  id           bigint generated always as identity primary key,
  judul        text        not null check (length(btrim(judul)) between 3 and 200),
  isi          text        not null default '' check (length(isi) <= 20000),   -- teks biasa, BUKAN HTML
  jenis        text        not null default 'info' check (jenis in ('info','penting','tenggat')),
  publik       boolean     not null default false,  -- true = tampil di halaman login (siapa saja)
  disematkan   boolean     not null default false,  -- tampil paling atas / jadi banner
  terbit       boolean     not null default false,  -- false = draf, hanya terlihat admin
  mulai        timestamptz not null default now(),  -- mulai tayang
  sampai       timestamptz,                         -- null = tidak kedaluwarsa
  tautan       text        check (tautan is null or tautan ~* '^https://'),
  dibuat_oleh  uuid        default auth.uid() references auth.users(id) on delete set null,
  dibuat_pada  timestamptz not null default now(),
  diubah_pada  timestamptz not null default now(),
  check (sampai is null or sampai > mulai)
);

-- Sasaran internal. Tanpa baris sasaran = untuk semua pengguna yang login.
-- unit '' = seluruh unit dalam kategori tsb.
create table if not exists public.pengumuman_sasaran (
  pengumuman_id bigint not null references public.pengumuman(id) on delete cascade,
  kategori      text   not null,
  unit          text   not null default '',
  primary key (pengumuman_id, kategori, unit)
);

-- Lampiran: berkasnya di Storage bucket 'pengumuman', path = '<pengumuman_id>/<nama-acak>.<ext>'
create table if not exists public.pengumuman_lampiran (
  id            bigint generated always as identity primary key,
  pengumuman_id bigint not null references public.pengumuman(id) on delete cascade,
  path          text   not null unique check (path ~ '^[0-9]+/[^/]+$'),
  nama          text   not null check (length(nama) between 1 and 200),   -- nama asli untuk ditampilkan
  mime          text   not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  ukuran        bigint not null check (ukuran > 0 and ukuran <= 10485760), -- maks 10 MB
  urutan        int    not null default 0,
  dibuat_pada   timestamptz not null default now()
);

create index if not exists pengumuman_tayang_idx  on public.pengumuman (terbit, publik, mulai desc);
create index if not exists pengumuman_lampiran_idx on public.pengumuman_lampiran (pengumuman_id, urutan);

-- perbarui diubah_pada otomatis
create or replace function public.pengumuman_sentuh() returns trigger
language plpgsql as $$
begin new.diubah_pada := now(); return new; end $$;

drop trigger if exists pengumuman_sentuh on public.pengumuman;
create trigger pengumuman_sentuh before update on public.pengumuman
  for each row execute function public.pengumuman_sentuh();

-- ---------- 2. Fungsi bantu hak akses ----------
-- security definer agar bisa membaca pengguna/cakupan tanpa terhalang RLS tabel tsb.
create or replace function public.pengumuman_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pengguna
    where id = auth.uid() and aktif and peran in ('ADMIN','SUPERADMIN')
  );
$$;

create or replace function public.pengumuman_boleh_baca(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pengumuman_admin() or exists (
    select 1 from pengumuman a
    where a.id = p_id
      and a.terbit
      and a.mulai <= now()
      and (a.sampai is null or a.sampai > now())
      and (
        a.publik                                     -- publik: siapa saja, termasuk belum login
        or (
          exists (select 1 from pengguna u where u.id = auth.uid() and u.aktif)
          and (
            not exists (select 1 from pengumuman_sasaran s where s.pengumuman_id = a.id)        -- untuk semua
            or exists (select 1 from pengguna u where u.id = auth.uid() and u.peran <> 'UNIT')  -- pimpinan/admin lihat semua
            or exists (
              select 1
              from pengumuman_sasaran s
              join pengguna_cakupan c
                on c.user_id = auth.uid()
               and c.kategori = s.kategori
               and (s.unit = '' or c.unit = '' or c.unit = s.unit)
              where s.pengumuman_id = a.id
            )
          )
        )
      )
  );
$$;

revoke all on function public.pengumuman_admin()              from public;
revoke all on function public.pengumuman_boleh_baca(bigint)   from public;
grant execute on function public.pengumuman_admin()            to anon, authenticated;
grant execute on function public.pengumuman_boleh_baca(bigint) to anon, authenticated;

-- ---------- 3. RLS ----------
alter table public.pengumuman          enable row level security;
alter table public.pengumuman_sasaran  enable row level security;
alter table public.pengumuman_lampiran enable row level security;

-- pengumuman
drop policy if exists "pengumuman: baca"   on public.pengumuman;
drop policy if exists "pengumuman: tambah" on public.pengumuman;
drop policy if exists "pengumuman: ubah"   on public.pengumuman;
drop policy if exists "pengumuman: hapus"  on public.pengumuman;
create policy "pengumuman: baca"   on public.pengumuman for select to anon, authenticated using (public.pengumuman_boleh_baca(id));
create policy "pengumuman: tambah" on public.pengumuman for insert to authenticated with check (public.pengumuman_admin());
create policy "pengumuman: ubah"   on public.pengumuman for update to authenticated using (public.pengumuman_admin()) with check (public.pengumuman_admin());
create policy "pengumuman: hapus"  on public.pengumuman for delete to authenticated using (public.pengumuman_admin());

-- sasaran
drop policy if exists "pengumuman_sasaran: baca"   on public.pengumuman_sasaran;
drop policy if exists "pengumuman_sasaran: kelola" on public.pengumuman_sasaran;
create policy "pengumuman_sasaran: baca"   on public.pengumuman_sasaran for select to authenticated using (public.pengumuman_boleh_baca(pengumuman_id));
create policy "pengumuman_sasaran: kelola" on public.pengumuman_sasaran for all    to authenticated using (public.pengumuman_admin()) with check (public.pengumuman_admin());

-- lampiran
drop policy if exists "pengumuman_lampiran: baca"   on public.pengumuman_lampiran;
drop policy if exists "pengumuman_lampiran: kelola" on public.pengumuman_lampiran;
create policy "pengumuman_lampiran: baca"   on public.pengumuman_lampiran for select to anon, authenticated using (public.pengumuman_boleh_baca(pengumuman_id));
create policy "pengumuman_lampiran: kelola" on public.pengumuman_lampiran for all    to authenticated using (public.pengumuman_admin()) with check (public.pengumuman_admin());

-- hak tabel: anon hanya baca; tulis hanya authenticated (tetap disaring RLS)
revoke all on public.pengumuman, public.pengumuman_sasaran, public.pengumuman_lampiran from anon;
grant select on public.pengumuman, public.pengumuman_lampiran to anon;
grant select, insert, update, delete on public.pengumuman, public.pengumuman_sasaran, public.pengumuman_lampiran to authenticated;

-- ---------- 4. Storage: bucket privat 'pengumuman' ----------
-- Privat: berkas dibuka lewat signed URL (createSignedUrl), yang hanya terbit bila
-- policy baca di bawah lolos -> lampiran internal tidak bisa diunduh orang luar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pengumuman', 'pengumuman', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pengumuman berkas: baca"  on storage.objects;
drop policy if exists "pengumuman berkas: unggah" on storage.objects;
drop policy if exists "pengumuman berkas: ubah"  on storage.objects;
drop policy if exists "pengumuman berkas: hapus" on storage.objects;

create policy "pengumuman berkas: baca" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'pengumuman'
    and exists (
      select 1 from public.pengumuman_lampiran l
      where l.path = storage.objects.name
        and public.pengumuman_boleh_baca(l.pengumuman_id)
    )
  );
create policy "pengumuman berkas: unggah" on storage.objects for insert to authenticated
  with check (bucket_id = 'pengumuman' and public.pengumuman_admin());
create policy "pengumuman berkas: ubah" on storage.objects for update to authenticated
  using (bucket_id = 'pengumuman' and public.pengumuman_admin())
  with check (bucket_id = 'pengumuman' and public.pengumuman_admin());
create policy "pengumuman berkas: hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'pengumuman' and public.pengumuman_admin());
