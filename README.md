# Dasbor Anggaran & Realisasi

Dasbor monitoring rencana anggaran (pagu) dan realisasi belanja satker berbasis data SAKTI (Laporan Ketersediaan Dana Detail & Rincian Kertas Kerja Satker). SPA statis tanpa build tool, di-hosting di GitHub Pages, dengan Supabase sebagai backend (autentikasi, database, RLS per pengguna).

## Struktur proyek

```
index.html          Kerangka halaman & elemen DOM
styles.css           Seluruh gaya (mendukung mode gelap/terang & tampilan mobile ala aplikasi native)
config.js            URL & anon key project Supabase (lihat "Konfigurasi" di bawah)
js/
  main.js            Entry point (dimuat sebagai <script type="module">) — boot aplikasi & event top-level
  state.js           State aplikasi, cakupan/filter pengguna, konstanta domain
  api.js             Lapisan Supabase: autentikasi, baca data, unggah, kelola pengguna
  parser.js          Pembaca file Excel SAKTI (Laporan Realisasi & RKK)
  nav.js             Sidebar desktop, bottom tab bar + sheet "Lainnya" (mobile), render halaman aktif
  filters.js         Panel filter cakupan data
  ui-components.js   Kartu, tooltip, tabel bertingkat (komponen UI umum)
  theme.js           Toggle mode gelap/terang
  auth.js            Halaman masuk (login)
  export.js          Unduh PDF & cetak kartu
  pages/             Satu berkas per halaman (Ringkasan, Unit Kerja/Sumber Dana/Jenis Belanja/DIPA, Riwayat & Revisi, Perlu Perhatian/Rincian, Kelola Data)
```

Kode memakai modul ES bawaan browser (`import`/`export`) — tidak perlu bundler/build step apa pun, cukup file statis.

## Menjalankan secara lokal

Karena memakai `<script type="module">`, halaman harus diakses lewat server HTTP (bukan dibuka langsung sebagai `file://`). Dari folder proyek:

```bash
python3 -m http.server 8000
```

lalu buka `http://localhost:8000`.

## Konfigurasi Supabase

Isi [config.js](config.js) dengan data project Supabase Anda (Supabase → Project Settings → API):

- `url` — Project URL
- `anonKey` — kunci publik (anon/public). Aman berada di repo selama Row Level Security (RLS) aktif di semua tabel — **jangan pernah** menaruh `service_role` key di berkas ini.

## Fitur

- Login & sesi berbasis peran (Admin keuangan, Pimpinan, Unit) dengan cakupan data dibatasi RLS Supabase.
- Ringkasan, tren penyerapan, analisis per unit/sumber dana/jenis belanja/struktur DIPA, riwayat & perbandingan revisi antar-periode, daftar "perlu perhatian", rincian & ekspor CSV.
- Kelola data (khusus admin): unggah laporan SAKTI, atur pengguna & hak akses.
- Ekspor PDF per-kartu maupun cetak laporan lengkap.
- Mode gelap/terang manual (tersimpan per perangkat) dan navigasi yang menyesuaikan ukuran layar — sidebar di desktop, bottom tab bar ala aplikasi native di HP.
