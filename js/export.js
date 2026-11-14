/* js/export.js — cetak kartu / laporan lengkap (cetak asli browser, bukan tangkapan layar) */
import { $, toast } from './utils.js?v=202611141413';

/* ================= orientasi cetak dinamis ================= */
function printStyleTag(){
  var s=$('printOrientStyle');
  if (!s){ s=document.createElement('style'); s.id='printOrientStyle'; document.head.appendChild(s); }
  return s;
}
function setPrintOrientation(landscape){
  printStyleTag().textContent='@media print{ @page{ size:A4 '+(landscape?'landscape':'portrait')+'; margin:5mm; } }';
}
/* lanskap dipilih bila salah satu tabel di dalamnya punya banyak kolom (potret jadi sempit untuk itu) */
function isWide(root){
  var tables=root.querySelectorAll('table');
  for (var i=0;i<tables.length;i++){
    var headRow=tables[i].tHead&&tables[i].tHead.rows[0];
    if (headRow && headRow.cells.length>5) return true;
  }
  return false;
}

/* ================= cetak satu kartu ================= */
export function printCard(id){
  var el=$(id); if(!el) return;
  setPrintOrientation(isWide(el));
  el.classList.add('print-target'); document.body.classList.add('print-one');
  setTimeout(function(){ window.print(); setTimeout(function(){ el.classList.remove('print-target'); document.body.classList.remove('print-one'); },500); },60);
}

/* "Unduh PDF" memakai mesin cetak asli browser juga (hasil teks asli, bukan gambar) —
   pengguna tinggal pilih tujuan "Simpan sebagai PDF" di jendela cetak. */
export function pdfCard(id,title){
  /* jendela cetak dibuka setelah petunjuk ditutup, agar petunjuk tidak ikut tercetak */
  toast('Pada jendela cetak berikutnya, pilih tujuan "Simpan sebagai PDF".','info','Unduh PDF',function(){ setTimeout(function(){ printCard(id); },250); });
}

/* ================= cetak seluruh halaman ================= */
export function printAll(){
  var pg=$('page');
  setPrintOrientation(pg ? isWide(pg) : false);
  document.body.classList.remove('print-one');
  window.print();
}
