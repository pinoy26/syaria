/* js/pages/perhatian.js — Perlu Perhatian & Rincian/Ekspor */
import { esc, rp, pc, group, sum } from '../utils.js';
import { S, D, DB, rows, subName, pill } from '../state.js';
import { card, printHead } from '../ui-components.js';

/* ================= perlu perhatian & rincian ================= */
export function renderPerhatian(){
  var R=rows();
  var minus=R.filter(function(r){return r.sisa<0;}).sort(function(a,b){return a.sisa-b.sisa;}), ms=sum(minus);
  var mb=minus.length?'<div class="tbl"><table><thead><tr><th>Unit</th><th>Sub komp.</th><th>Akun</th><th>Uraian</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th class="n">Pagu minus</th></tr></thead><tbody>'+
    minus.map(function(r){return '<tr><td>'+esc(r.unit)+'</td><td class="code">'+esc(r.sub)+'</td><td class="code">'+esc(r.akun)+'</td><td>'+esc(r.item)+'</td><td class="n">'+rp(r.pagu)+'</td><td class="n">'+rp(r.sd)+'</td><td class="n">'+pc(r.pagu?r.sd/r.pagu:0)+'</td><td class="n neg">'+rp(r.sisa)+'</td></tr>';}).join('')+
    '<tr class="tot"><td colspan="4">Jumlah</td><td class="n">'+rp(ms.pagu)+'</td><td class="n">'+rp(ms.sd)+'</td><td></td><td class="n neg">'+rp(ms.sisa)+'</td></tr></tbody></table></div>':'<div class="empty"><span class="pill st-good"><i></i>Tidak ada pagu minus</span></div>';
  var low=group(R,function(r){return r.ro+'|'+r.sub;}).filter(function(g){return g.pagu>=2e7&&g.p<0.3;}).sort(function(a,b){return b.sisa-a.sisa;}).slice(0,25);
  var lb=low.length?'<div class="tbl"><table><thead><tr><th>Unit</th><th>Sub komponen</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th class="n">Sisa</th><th>Status</th></tr></thead><tbody>'+
    low.map(function(g){ var r=g.rows[0]; return '<tr><td>'+esc(r.unit)+'</td><td><span class="code">'+esc(r.sub)+'</span> '+esc(subName(r))+'</td><td class="n">'+rp(g.pagu)+'</td><td class="n">'+rp(g.sd)+'</td><td class="n">'+pc(g.p)+'</td><td class="n">'+rp(g.sisa)+'</td><td>'+pill(g.p)+'</td></tr>'; }).join('')+'</tbody></table></div>':'<p class="note">Tidak ada sub komponen dengan penyerapan di bawah 30%.</p>';
  var z=group(R.filter(function(r){return r.sd===0&&r.pagu>0;}),function(r){return r.kat+'|'+r.unit;}).sort(function(a,b){return b.pagu-a.pagu;});
  var zb='<div class="tbl"><table><thead><tr><th>Unit</th><th class="n">Detail belum terealisasi</th><th class="n">Pagu belum diserap</th></tr></thead><tbody>'+z.map(function(g){return '<tr><td><span class="note">'+esc(g.key.split('|')[0])+'</span> <b>'+esc(g.key.split('|')[1])+'</b></td><td class="n">'+g.n+'</td><td class="n">'+rp(g.pagu)+'</td></tr>';}).join('')+'</tbody></table></div>';
  var nos=R.filter(function(r){return !r.sumber;});
  return '<div class="page-sec grid">'+printHead('Perlu Perhatian')+
    card('c-minus','Pagu minus','Detail dengan realisasi melebihi pagu — perlu usulan revisi DIPA.',mb)+
    card('c-low','Sub komponen penyerapan rendah','Pagu ≥ Rp 20 juta dan realisasi di bawah 30%, urut sisa terbesar.',lb)+
    card('c-zero','Detail belum terealisasi per unit','Jumlah detail belanja yang realisasinya masih Rp 0.',zb)+
    (nos.length?card('c-nosd','Detail tanpa sumber dana',nos.length+' detail belum punya sumber dana. Admin perlu mengunggah RKK terbaru lalu menerapkan ulang pemetaan.','<p class="note">Pagu terdampak: Rp '+rp(sum(nos).pagu)+'</p>'):'')+'</div>';
}
export function itemRows(){
  var R=rows(), q=S.q.toLowerCase().trim();
  if (q) R=R.filter(function(r){ return (r.no+' '+r.item+' '+r.sub+' '+subName(r)+' '+r.akun+' '+D.akun[r.akun]+' '+r.unit+' '+r.ro).toLowerCase().indexOf(q)>=0; });
  return R;
}
export function renderRincian(){
  var R=itemRows(), PG=25, pages=Math.max(1,Math.ceil(R.length/PG)); S.pg=Math.min(S.pg,pages-1);
  var T=sum(R);
  var body='<div class="tools noprint" style="margin-bottom:12px"><input type="search" id="q" placeholder="Cari uraian, kode, atau unit…" value="'+esc(S.q)+'" style="min-width:240px;flex:1"><button class="btn" type="button" id="btnCsv">Unduh CSV</button></div>'+
    '<p class="note">'+rp(R.length)+' detail · pagu Rp '+rp(T.pagu)+' · realisasi Rp '+rp(T.sd)+' ('+pc(T.p)+')</p>'+
    '<div class="tbl tbl-grid"><table><thead><tr><th>Unit</th><th>RO</th><th>Sub komp.</th><th>Akun</th><th>No</th><th>Uraian</th><th>SD</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th class="n">Sisa</th></tr></thead><tbody>'+
    R.slice(S.pg*PG,S.pg*PG+PG).map(function(r){ return '<tr><td>'+esc(r.unit)+'</td><td class="code">'+esc(r.ro)+'</td><td class="code" title="'+esc(subName(r))+'">'+esc(r.sub)+'</td><td class="code" title="'+esc(D.akun[r.akun])+'">'+esc(r.akun)+'</td><td class="code">'+esc(r.no)+'</td><td>'+esc(r.item)+'</td><td>'+(r.sumber==='PNP'?'PNBP':esc(r.sumber))+'</td><td class="n">'+rp(r.pagu)+'</td><td class="n">'+rp(r.sd)+'</td><td class="n">'+pc(r.pagu?r.sd/r.pagu:0)+'</td><td class="n'+(r.sisa<0?' neg':'')+'">'+rp(r.sisa)+'</td></tr>'; }).join('')+
    '</tbody></table></div><div class="pager"><span>Halaman '+(S.pg+1)+' dari '+pages+'</span><button class="btn" type="button" id="pgPrev"'+(S.pg?'':' disabled')+'>‹ Sebelumnya</button><button class="btn" type="button" id="pgNext"'+(S.pg<pages-1?'':' disabled')+'>Berikutnya ›</button></div>';
  return '<div class="page-sec grid">'+printHead('Rincian Detail Belanja')+card('c-item','Rincian detail belanja','Semua detail dalam cakupan dan filter aktif.',body)+'</div>';
}
export function downloadCsv(){
  var head=['Kategori','Unit','Program','Kegiatan','KRO','RO','Komponen','Sub Komponen','Uraian Sub Komponen','Akun','Uraian Akun','Sumber Dana','No','Uraian','Pagu','Lock','Realisasi Lalu','Realisasi Periode Ini','Realisasi s.d.','Sisa'];
  var q=function(v){ v=String(v==null?'':v); return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  var lines=[head].concat(itemRows().map(function(r){ return [r.kat,r.unit,r.prog,r.keg,r.kro,r.ro,r.komp,r.sub,subName(r),r.akun,D.akun[r.akun],r.sumber==='PNP'?'PNBP':r.sumber,r.no,r.item,r.pagu,r.lock,r.lalu,r.ini,r.sd,r.sisa]; }));
  var csv='﻿'+lines.map(function(l){return l.map(q).join(';');}).join('\n');
  saveBlob(new Blob([csv],{type:'text/csv'}),'realisasi_'+DB.periode+'.csv');
}
function saveBlob(blob,name){
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },2000);
}
