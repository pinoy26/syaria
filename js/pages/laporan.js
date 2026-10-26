/* js/pages/laporan.js — Laporan: form pilihan cetak ala SAKTI, unduh PDF (cetak asli browser) & Excel */
import { esc } from '../utils.js';
import { S, D, CHAIN, FLABEL, FAK_ORDER, DB, scoped, applyF, isUnitUser, sess, subName, rows } from '../state.js';
import { treeCard, printHead, LV, IC, openAll } from '../ui-components.js';
import { pdfCard } from '../export.js';
import { refresh } from '../nav.js';

var JENIS=[
  {id:'unit',t:'Rincian per Unit Kerja',sub:'Kategori → Unit → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',lv:[LV.kat,LV.unit,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun]},
  {id:'src',t:'Rincian per Sumber Dana',sub:'Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',lv:[LV.src,LV.a2,LV.a3,LV.akun]},
  {id:'jenis',t:'Rincian per Jenis Belanja',sub:'Akun 2 digit → 3 digit → 6 digit → Detail belanja.',lv:[LV.a2,LV.a3,LV.akun]},
  {id:'dipa',t:'Struktur DIPA Lengkap',sub:'Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',lv:[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun]}
];
var active='unit';

function optName(k,v,r){
  var m={prog:D.program,keg:D.kegiatan,kro:D.kro,ro:D.ro,komp:D.komp}[k];
  if (m) return v+' — '+(m[v]||'');
  if (k==='sub') return v+' — '+subName(r);
  return v;
}
function unitField(){
  var base=scoped(), units={Fakultas:{},Rektorat:{}}, f=S.f;
  base.forEach(function(r){ (units[r.kat]=units[r.kat]||{})[r.unit]=1; });
  if (isUnitUser()){
    var sc=sess().scopes;
    if (sc.length===1 && sc[0].unit) return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" disabled><option>'+esc(sc[0].unit)+'</option></select></label>';
    var opts2=[];
    sc.forEach(function(s){ if(s.unit) opts2.push([s.kat+'|'+s.unit,s.unit]); else { opts2.push([s.kat+'|','Semua '+s.kat]); Object.keys(units[s.kat]||{}).sort().forEach(function(u){ opts2.push([s.kat+'|'+u,u]); }); } });
    return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" data-k="unit"><option value="">Semua cakupan saya</option>'+opts2.map(function(o){return '<option value="'+esc(o[0])+'"'+(f.unit===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';
  }
  var fk=FAK_ORDER.filter(function(u){return units.Fakultas[u];}).concat(Object.keys(units.Fakultas).filter(function(u){return FAK_ORDER.indexOf(u)<0;}));
  var rk=Object.keys(units.Rektorat||{}).sort();
  return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" data-k="unit"><option value="">Semua unit</option>'+
    '<optgroup label="Fakultas"><option value="Fakultas|"'+(f.unit==='Fakultas|'?' selected':'')+'>Semua fakultas</option>'+fk.map(function(u){return '<option value="Fakultas|'+esc(u)+'"'+(f.unit==='Fakultas|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup>'+
    '<optgroup label="Rektorat"><option value="Rektorat|"'+(f.unit==='Rektorat|'?' selected':'')+'>Semua Rektorat</option>'+rk.map(function(u){return '<option value="Rektorat|'+esc(u)+'"'+(f.unit==='Rektorat|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup></select></label>';
}
function chainFields(){
  var base=scoped(), f=S.f, h='';
  CHAIN.forEach(function(k,i){
    var pool=applyF(base,i), seen={}, opts=[];
    pool.forEach(function(r){ if(!seen[r[k]]){ seen[r[k]]=1; opts.push({v:r[k],t:optName(k,r[k],r)}); } });
    opts.sort(function(a,b){ return a.v<b.v?-1:1; });
    if (f[k] && !seen[f[k]]) f[k]='';
    h+='<label class="f" for="lf_'+k+'">'+FLABEL[k]+'<select id="lf_'+k+'" data-k="'+k+'"><option value="">Semua '+FLABEL[k]+'</option>'+
      opts.map(function(o){ return '<option value="'+esc(o.v)+'"'+(o.v===f[k]?' selected':'')+'>'+esc(o.t)+'</option>'; }).join('')+'</select></label>';
  });
  return h;
}

export function renderLaporan(){
  var J=JENIS.filter(function(x){return x.id===active;})[0]||JENIS[0];
  var radio=JENIS.map(function(x){ return '<label><input type="radio" name="lapJenis" value="'+x.id+'"'+(x.id===active?' checked':'')+'>'+esc(x.t)+'</label>'; }).join('');
  var form='<div class="glass card noprint"><div class="card-h"><div><h2>Laporan</h2><p>Pilih satuan kerja, jenis laporan, periode dan filter, lalu unduh.</p></div></div>'+
    '<div class="lap-box"><div class="eyebrow">Pilihan Cetak</div><div class="filters-grid">'+unitField()+'</div></div>'+
    '<div class="lap-box"><div class="eyebrow">Jenis Laporan &amp; Periode</div><div class="lap-radio">'+radio+'</div>'+
      '<div class="lap-periode-row"><label class="f" for="selPeriode">Posisi data<span id="lfPeriodeSlot"></span></label></div></div>'+
    '<div class="lap-box"><div class="eyebrow">Filter</div><div class="filters-grid">'+chainFields()+'</div></div>'+
    '<div class="tools" style="margin-top:16px"><button class="btn primary" type="button" id="btnLapPdf">'+IC.pdf+' Unduh PDF</button>'+
    '<button class="btn" type="button" id="btnUnduhExcel">'+IC.box+' Unduh Excel</button></div></div>';
  setTimeout(bindLaporan,0);
  return '<div class="page-sec grid">'+form+printHead()+treeCard('lap-aktif',J.t,J.sub,rows(),J.lv)+'</div>';
}
function bindLaporan(){
  var pg=document.getElementById('page'); if (!pg || !pg.querySelector('.lap-box')) return;
  [].forEach.call(pg.querySelectorAll('input[name="lapJenis"]'), function(r){ r.onchange=function(){ active=this.value; refresh(); }; });
  [].forEach.call(pg.querySelectorAll('.lap-box select[data-k]'), function(s){
    s.onchange=function(){ var k=s.dataset.k; S.f[k]=s.value; var i=CHAIN.indexOf(k); if(i>=0) for(var j=i+1;j<CHAIN.length;j++) S.f[CHAIN[j]]=''; S.pg=0; refresh(); };
  });
  var periodeSel=document.getElementById('selPeriode'), slot=document.getElementById('lfPeriodeSlot');
  if (periodeSel && slot && !slot.contains(periodeSel)) slot.appendChild(periodeSel);
  var btnX=document.getElementById('btnUnduhExcel'); if (btnX) btnX.onclick=unduhExcel;
  var btnPdf=document.getElementById('btnLapPdf');
  if (btnPdf) btnPdf.onclick=function(){
    openAll('lap-aktif');
    refresh();
    var J=JENIS.filter(function(x){return x.id===active;})[0]||JENIS[0];
    pdfCard('lap-aktif', J.t);
  };
}
function unduhExcel(){
  var R=rows();
  var head=['Kategori','Unit','Program','Kegiatan','KRO','RO','Komponen','Sub Komponen','Akun','Sumber Dana','No','Uraian','Pagu','Realisasi s.d. ini','Realisasi periode ini','Sisa'];
  var data=[head];
  R.forEach(function(r){ data.push([r.kat,r.unit,r.prog,r.keg,r.kro,r.ro,r.komp,r.sub,r.akun,r.sumber,r.no,r.item,r.pagu,r.sd,r.ini,r.sisa]); });
  var ws=XLSX.utils.aoa_to_sheet(data);
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Laporan');
  XLSX.writeFile(wb,'laporan-'+((DB&&DB.periode)||'data')+'.xlsx');
}
