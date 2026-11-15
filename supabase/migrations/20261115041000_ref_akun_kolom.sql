-- ref_akun sudah ada sebelumnya (kamus nama akun: kode, nama untuk semua level 2/3/6 digit),
-- sehingga kolom tambahan dari 20261115040000 tidak terbentuk. Tambahkan di sini agar pemicu
-- pengisian dari RKK (fn_isi_ref_akun) dan Bagan Akun Standar berjalan. Akun 6 digit = Bagan Akun Standar.
alter table public.ref_akun add column if not exists asal       text not null default 'rkk';
alter table public.ref_akun add column if not exists diperbarui timestamptz not null default now();
