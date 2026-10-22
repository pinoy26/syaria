/* js/pages/laporan.js — Laporan: cetak/unduh ringkasan anggaran sesuai posisi data & filter aktif */
import { printAll } from '../export.js';
import { renderRingkasan } from './ringkasan.js';

export function renderLaporan(){
  var kontrol='<div class="glass card noprint"><div class="card-h"><div><h2>Unduh laporan</h2>'+
    '<p>Mencetak laporan di bawah sesuai posisi data dan filter yang sedang aktif.</p></div></div>'+
    '<div class="tools"><button class="btn primary" type="button" id="btnPrintAll"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>Cetak laporan lengkap</button></div>'+
    '<p class="note">Pada jendela cetak yang terbuka, pilih tujuan "Simpan sebagai PDF" untuk mengunduh.</p></div>';
  setTimeout(function(){ var b=document.getElementById('btnPrintAll'); if(b) b.onclick=printAll; },0);
  return '<div class="page-sec grid">'+kontrol+renderRingkasan()+'</div>';
}
