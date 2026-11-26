-- =====================================================================
-- Berita berbentuk flayer (gambar berganti otomatis di baris teratas ruang berita)
--   bentuk: 'redaksi' (teks, seperti sebelumnya) atau 'flayer' (gambar = lampiran gambar pertama)
--   durasi: lama satu flayer tampil sebelum berganti, dalam detik (3–60)
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================
alter table public.pengumuman add column if not exists bentuk text not null default 'redaksi';
alter table public.pengumuman add column if not exists durasi int not null default 8;
alter table public.pengumuman drop constraint if exists pengumuman_bentuk_check;
alter table public.pengumuman add constraint pengumuman_bentuk_check check (bentuk in ('redaksi', 'flayer'));
alter table public.pengumuman drop constraint if exists pengumuman_durasi_check;
alter table public.pengumuman add constraint pengumuman_durasi_check check (durasi between 3 and 60);
