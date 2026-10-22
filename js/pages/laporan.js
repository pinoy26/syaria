/* js/pages/laporan.js — Laporan: unduh tiap rincian sebagai PDF tabel (cetak asli browser, bukan tangkapan layar) */
import { esc } from '../utils.js';
import { rows } from '../state.js';
import { treeCard, LV, IC } from '../ui-components.js';

function dl(id,title){
  return '<div class="card-a"><button class="btn" type="button" data-pdf="'+id+'" data-title="'+esc(title)+'">'+IC.pdf+' Unduh PDF</button></div>';
}

export function renderLaporan(){
  var R=rows();
  var intro='<div class="glass card noprint"><div class="card-h"><div><h2>Laporan</h2>'+
    '<p>Pilih "Unduh PDF" pada laporan yang diinginkan di bawah, atau cetak semuanya sekaligus. Mengikuti posisi data dan filter yang sedang aktif.</p></div></div>'+
    '<div class="tools"><button class="btn primary" type="button" data-printall><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>Cetak semua laporan</button></div>'+
    '<p class="note">Pada jendela cetak yang terbuka, pilih tujuan "Simpan sebagai PDF" untuk mengunduh.</p></div>';
  return '<div class="page-sec grid">'+intro+
    treeCard('lap-unit','Rincian per Unit Kerja','Kategori → Unit → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.kat,LV.unit,LV.komp,LV.sub,LV.akun],dl('lap-unit','Rincian per Unit Kerja'))+
    treeCard('lap-src','Rincian per Sumber Dana','Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',R,[LV.src,LV.a2,LV.a3,LV.akun],dl('lap-src','Rincian per Sumber Dana'))+
    treeCard('lap-jenis','Rincian per Jenis Belanja','Akun 2 digit → 3 digit → 6 digit → Detail belanja.',R,[LV.a2,LV.a3,LV.akun],dl('lap-jenis','Rincian per Jenis Belanja'))+
    treeCard('lap-dipa','Struktur DIPA Lengkap','Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun],dl('lap-dipa','Struktur DIPA Lengkap'))+
    '</div>';
}
