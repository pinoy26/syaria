/* js/auth.js — halaman depan publik (beranda) & halaman masuk.
   Alur: beranda → tombol "Masuk" → halaman masuk (#masuk). Tombol kembali browser/HP kembali ke beranda. */
import { $, esc, errMsg, perluKonfirmasi } from './utils.js?v=202611141419';
import { THEME_BTN } from './theme.js?v=202611141419';
import { SBC } from './api.js?v=202611141419';
import { mulai } from './main.js?v=202611141419';
import { muatBeritaBeranda } from './berita.js?v=202611141419';

var HASH_MASUK = '#masuk';
var VIEW = '';
var TAHUN = new Date().getFullYear();
/* logo aplikasi LENTERA (ikon lentera, dibuat sendiri) */
var MARK = '<div class="mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.5h6M12 2.5v2"/><path d="M8.5 6.5h7l1.5 2.5v8.5l-1.5 2.5h-7L7 17.5V9z"/><path d="M12 10.5c1.4 1.3 1.6 3.3 0 4.8-1.6-1.5-1.4-3.5 0-4.8z"/><path d="M9 22h6"/></svg></div>';
var BRAND = '<div class="brand lentera">' + MARK + '<div><b>LENTERA</b><small>Layanan Perencanaan Anggaran Terintegrasi</small></div></div>';
var TAGLINE = 'Menerangi Perencanaan, Menyatukan Anggaran';
/* logo instansi: berkas resmi diletakkan di folder assets/ (disembunyikan otomatis bila belum ada) */
function logo(file, alt, cls){ return '<img class="' + cls + '" src="assets/' + file + '" alt="' + alt + '" onerror="this.hidden=true">'; }
var LOGO_DERET = '<div class="logo-deret">' + logo('logo-kemenag.png', 'Kementerian Agama', 'logo-deret-img') + logo('logo-iain-ternate.png', 'IAIN Ternate', 'logo-deret-img') + logo('logo-pusaka.png', 'Pusaka Kementerian Agama', 'logo-deret-img') + logo('logo-kemenag-berdampak.png', 'Kemenag Berdampak', 'logo-deret-img') + '</div>';
var IC_PANAH = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
var IC_KEMBALI = '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>';

var FITUR = [
  ['Monitoring Realisasi', 'Pantau pagu, realisasi, dan sisa anggaran per sumber dana, jenis belanja, hingga unit kerja.',
    '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'],
  ['Peringatan Dini', 'Tandai sub komponen yang belum terserap, realisasi melebihi pagu, dan capaian di bawah target waktu.',
    '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'],
  ['Riwayat &amp; Revisi', 'Bandingkan pagu antarposisi data untuk melihat pergeseran anggaran akibat revisi DIPA dan POK.',
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'],
  ['Laporan', 'Cetak dan unduh laporan realisasi yang siap pakai untuk pimpinan dan unit kerja.',
    '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>']
];

/* latar gambar utama beranda: panel kaca & grafik abstrak (digambar sendiri, bukan aset pihak lain) */
var HERO_ART = '<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
  '<defs><linearGradient id="lpG1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fe7e2" stop-opacity=".55"/><stop offset="1" stop-color="#4a8fd8" stop-opacity=".08"/></linearGradient>' +
  '<linearGradient id="lpG2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a" stop-opacity=".6"/><stop offset="1" stop-color="#ff9a6b" stop-opacity=".05"/></linearGradient></defs>' +
  '<g transform="rotate(-18 520 300)">' +
    '<rect x="380" y="40" width="300" height="300" rx="34" fill="url(#lpG1)" stroke="#bff6f2" stroke-opacity=".5"/>' +
    '<rect x="470" y="170" width="300" height="300" rx="34" fill="url(#lpG1)" stroke="#bff6f2" stroke-opacity=".35"/>' +
    '<rect x="560" y="-40" width="240" height="240" rx="30" fill="url(#lpG2)" stroke="#ffe3a8" stroke-opacity=".55"/>' +
    '<rect x="300" y="300" width="220" height="220" rx="28" fill="url(#lpG1)" stroke="#bff6f2" stroke-opacity=".25"/>' +
  '</g>' +
  '<g opacity=".55" stroke="#e8fffd" stroke-width="3" fill="none" stroke-linecap="round"><path d="M430 470 L500 420 L560 440 L640 360 L720 380"/></g>' +
  '<g fill="#e8fffd" opacity=".35"><rect x="452" y="500" width="22" height="50" rx="5"/><rect x="486" y="476" width="22" height="74" rx="5"/><rect x="520" y="456" width="22" height="94" rx="5"/><rect x="554" y="430" width="22" height="120" rx="5"/></g>' +
'</svg>';

/* ilustrasi panel kiri halaman masuk: kartu dasbor, grafik batang, donat, dokumen, koin Rp */
var LOGIN_ART = '<svg viewBox="0 0 520 420" aria-hidden="true">' +
  '<g transform="translate(40 30)">' +
    '<rect x="20" y="40" width="300" height="200" rx="22" fill="#ffffff" fill-opacity=".14" stroke="#ffffff" stroke-opacity=".35"/>' +
    '<rect x="44" y="64" width="120" height="12" rx="6" fill="#fff" fill-opacity=".55"/>' +
    '<rect x="44" y="86" width="80" height="8" rx="4" fill="#fff" fill-opacity=".3"/>' +
    '<g fill="#ffffff"><rect x="52" y="170" width="26" height="46" rx="6" fill-opacity=".45"/><rect x="92" y="146" width="26" height="70" rx="6" fill-opacity=".6"/><rect x="132" y="126" width="26" height="90" rx="6" fill-opacity=".75"/><rect x="172" y="108" width="26" height="108" rx="6" fill="#ffd166"/></g>' +
    '<circle cx="262" cy="160" r="38" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="16"/>' +
    '<circle cx="262" cy="160" r="38" fill="none" stroke="#ffd166" stroke-width="16" stroke-dasharray="170 239" transform="rotate(-90 262 160)" stroke-linecap="round"/>' +
    '<rect x="250" y="210" width="200" height="140" rx="20" fill="#ffffff" fill-opacity=".9"/>' +
    '<rect x="274" y="236" width="110" height="12" rx="6" fill="#0a6a70" fill-opacity=".8"/>' +
    '<rect x="274" y="260" width="150" height="8" rx="4" fill="#0a6a70" fill-opacity=".3"/>' +
    '<rect x="274" y="278" width="130" height="8" rx="4" fill="#0a6a70" fill-opacity=".3"/>' +
    '<rect x="274" y="306" width="70" height="24" rx="12" fill="#0a6a70"/>' +
    '<circle cx="70" cy="300" r="40" fill="#ffd166"/><circle cx="70" cy="300" r="31" fill="none" stroke="#e0a82e" stroke-width="3"/>' +
    '<text x="70" y="311" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="28" fill="#9a6b00">Rp</text>' +
    '<path d="M150 330 l26 -18 l20 12 l34 -30" stroke="#ffffff" stroke-opacity=".7" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</g></svg>';

/* ================= titik masuk ================= */
export function tampilMasuk(catatan){
  $('app').hidden = true; $('boot').hidden = true; $('gate').hidden = false;
  if (catatan || location.hash === HASH_MASUK){
    if (location.hash !== HASH_MASUK) history.replaceState({ gate: 'masuk' }, '', HASH_MASUK);
    halamanMasuk(catatan);
  } else halamanBeranda();
}
function keMasuk(){ history.pushState({ gate: 'masuk' }, '', HASH_MASUK); halamanMasuk(); }
function keBeranda(){
  if (history.state && history.state.gate === 'masuk' && history.length > 1) history.back();
  else { history.replaceState(null, '', location.pathname + location.search); halamanBeranda(); }
}
window.addEventListener('popstate', function(){
  if ($('gate').hidden) return;
  if (location.hash === HASH_MASUK){ if (VIEW !== 'masuk') halamanMasuk(); }
  else if (!/^#berita-\d+$/.test(location.hash) && VIEW !== 'beranda') halamanBeranda();
});
document.addEventListener('click', function(e){
  if ($('gate').hidden) return;
  if (e.target.closest('[data-ke-masuk]')) keMasuk();
  else if (e.target.closest('[data-ke-beranda]')) keBeranda();
});

/* ================= beranda publik ================= */
function halamanBeranda(){
  VIEW = 'beranda';
  $('gate').innerHTML =
    '<div class="lp">' +
      '<header class="lp-top"><div class="lp-in">' + BRAND +
        '<div class="lp-act">' + THEME_BTN + '<button type="button" class="btn primary lp-masuk" data-ke-masuk>Masuk' + IC_PANAH + '</button></div></div></header>' +
      '<section class="lp-hero"><div class="lp-art">' + HERO_ART + '</div>' +
        '<div class="lp-in lp-hero-in">' +
          '<span class="lp-kicker">LENTERA · ' + TAGLINE + '</span>' +
          '<h1>Layanan Perencanaan Anggaran Terintegrasi untuk <em>Monitoring</em> Pagu, Realisasi, dan Revisi</h1>' +
          '<p>Data Laporan Ketersediaan Dana dan Rincian Kertas Kerja dari SAKTI diolah menjadi ringkasan yang mudah dibaca pimpinan dan unit kerja IAIN Ternate.</p>' +
          '<div class="lp-cta"><button type="button" class="btn primary" data-ke-masuk>Masuk ke LENTERA' + IC_PANAH + '</button>' +
            '<button type="button" class="btn lp-ghost" id="lpKeBerita" hidden>Berita terbaru</button></div>' +
        '</div></section>' +
      '<section class="lp-fitur" aria-label="Fitur"><div class="lp-in lp-grid">' + FITUR.map(function(f){
          return '<div class="lp-f"><div class="lp-f-hd"><span class="lp-f-ic"><svg viewBox="0 0 24 24">' + f[2] + '</svg></span><h3>' + f[0] + '</h3></div><p>' + f[1] + '</p></div>';
        }).join('') + '</div></section>' +
      '<section class="lp-berita" id="lpBeritaSec" aria-labelledby="lpBeritaJudul" hidden><div class="lp-in">' +
        '<div class="lp-sec-hd"><span class="eyebrow">Berita &amp; Pengumuman</span><h2 id="lpBeritaJudul">Informasi terbaru</h2></div>' +
        '<div id="lpBerita"></div></div></section>' +
      '<section class="lp-mitra"><div class="lp-in">' + LOGO_DERET + '</div></section>' +
      '<footer class="lp-foot"><div class="lp-in"><span>© ' + TAHUN + ' · LENTERA — Layanan Perencanaan Anggaran Terintegrasi · IAIN Ternate</span><span>Data bersumber dari SAKTI</span></div></footer>' +
    '</div>';
  window.scrollTo(0, 0);
  muatBeritaBeranda(function(){
    var b = $('lpKeBerita'); if (!b) return;
    b.hidden = false; b.onclick = function(){ $('lpBeritaSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  });
}

/* ================= halaman masuk ================= */
function halamanMasuk(catatan){
  VIEW = 'masuk';
  $('gate').innerHTML =
    '<div class="lg">' +
      '<aside class="lg-side"><div class="lg-side-in">' +
        '<h1>Menerangi Perencanaan, Menyatukan Anggaran</h1>' +
        '<p>LENTERA — Layanan Perencanaan Anggaran Terintegrasi. Memantau pagu, realisasi, dan revisi anggaran dalam satu tempat.</p></div>' +
        '<div class="lg-ilus">' + LOGIN_ART + '</div></aside>' +
      '<main class="lg-main">' +
        '<div class="lg-top"><button type="button" class="btn lg-back" data-ke-beranda>' + IC_KEMBALI + 'Beranda</button>' + THEME_BTN + '</div>' +
        '<div class="lg-box">' + BRAND +
          '<div class="lg-card">' +
            '<h2>Masuk ke LENTERA</h2>' +
            '<p class="note lg-note">' + esc(catatan || 'Masukkan email dan kata sandi yang diberikan admin keuangan.') + '</p>' +
            '<form id="loginForm" class="lg-form">' +
              '<label class="f" for="lgId">Email<input type="email" id="lgId" autocomplete="username" required></label>' +
              '<label class="f" for="lgPw">Kata sandi<input type="password" id="lgPw" autocomplete="current-password" required></label>' +
              '<button class="btn primary lg-btn" type="submit" id="lgBtn">Masuk</button>' +
              '<div id="lgMsg" class="note" role="status" aria-live="polite"></div></form>' +
            '<button class="btn lg-lupa" type="button" id="lgLupa">Lupa kata sandi</button>' +
            '<p class="note lg-akun">Belum punya akun? Akun dibuatkan oleh admin keuangan.</p>' +
          '</div>' +
          LOGO_DERET +
          '<p class="lg-foot">© ' + TAHUN + ' · LENTERA · IAIN Ternate</p>' +
        '</div></main>' +
    '</div>';
  window.scrollTo(0, 0);
  $('lgLupa').onclick = function(){
    var em = $('lgId').value.trim();
    if (!em) { $('lgMsg').textContent = 'Isi email dulu, lalu klik Lupa kata sandi.'; $('lgId').focus(); return; }
    SBC.auth.resetPasswordForEmail(em, { redirectTo: location.href.split('#')[0] })
      .then(function(r){ if (r.error) throw r.error; $('lgMsg').textContent = 'Tautan penggantian kata sandi dikirim ke ' + em + '. Bila tidak sampai, minta admin mengganti kata sandi Anda.'; })
      .catch(function(e){ $('lgMsg').textContent = errMsg(e); });
  };
  $('loginForm').onsubmit = function(e){
    e.preventDefault();
    var b = $('lgBtn'); b.disabled = true; $('lgMsg').textContent = 'Memeriksa…';
    SBC.auth.signInWithPassword({ email: $('lgId').value.trim(), password: $('lgPw').value }).then(function(r){
      if (r.error) throw r.error;
      history.replaceState(null, '', location.pathname + location.search);
      VIEW = '';
      $('gate').hidden = true; $('gate').innerHTML = ''; $('boot').hidden = false; $('boot').textContent = 'Memuat dasbor…';
      mulai();
    }).catch(function(x){
      b.disabled = false;
      $('lgMsg').textContent = errMsg(x);
      if (perluKonfirmasi(x)) $('lgMsg').textContent = 'Email akun ini belum dikonfirmasi. Minta admin membuka Supabase → Authentication → Users → akun Anda → Confirm email.';
    });
  };
  $('lgId').focus();
}
