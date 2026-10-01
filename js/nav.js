/* js/nav.js — navigasi: sidebar desktop, bottom tab bar & sheet "Lainnya" (mobile), refresh halaman */
import { $, esc } from './utils.js';
import { S, BOOT, DB, sess, isAdmin, scopeLabel, persist, activeFilterCount } from './state.js';
import { bindTips, hideTip, clearPageState, openLevel, openModal } from './ui-components.js';
import { THEME_BTN } from './theme.js';
import { renderFilters } from './filters.js';
import { pdfCard, printCard } from './export.js';
import { downloadCsv } from './pages/perhatian.js';
import { renderRingkasan, loadTrend } from './pages/ringkasan.js';
import { renderUnit, renderUnitRincian, unitModalHtml, renderSumber, renderJenis, renderDipa } from './pages/analisis.js';
import { renderRiwayat, loadCompare } from './pages/riwayat.js';
import { renderPerhatian, renderRincian } from './pages/perhatian.js';
import { renderKelola } from './pages/kelola.js';

/* ================= navigasi ================= */
export var PAGES=[
  {id:'ringkasan',t:'Ringkasan',g:'Dasbor',ic:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',r:renderRingkasan,after:loadTrend},
  {id:'unit',t:'Unit Kerja',g:'Analisis',ic:'<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5"/>',r:renderUnit},
  {id:'unit-rincian',t:'Rincian Unit Kerja',g:'Analisis',ic:'<path d="M4 5h16v14H4zM4 10h16M10 10v9"/>',r:renderUnitRincian},
  {id:'sumber',t:'Sumber Dana',g:'Analisis',ic:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h8"/>',r:renderSumber},
  {id:'jenis',t:'Jenis Belanja',g:'Analisis',ic:'<path d="M4 6h16M4 12h10M4 18h6"/>',r:renderJenis},
  {id:'dipa',t:'Struktur DIPA',g:'Analisis',ic:'<path d="M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v4.5h9V15"/>',r:renderDipa},
  {id:'riwayat',t:'Riwayat & Revisi',g:'Pemantauan',ic:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',r:renderRiwayat,after:loadCompare},
  {id:'perhatian',t:'Perlu Perhatian',g:'Pemantauan',ic:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',r:renderPerhatian},
  {id:'rincian',t:'Rincian & Ekspor',g:'Pemantauan',ic:'<path d="M4 5h16v14H4zM4 10h16M10 10v9"/>',r:renderRincian},
  {id:'kelola',t:'Kelola Data',g:'Admin',ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',r:renderKelola,admin:true,noData:true}
];
var BOTTOM_MAIN=['ringkasan','unit','riwayat','perhatian'];
var MORE_IC='<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
export function renderNav(){
  var g='',h='';
  var visible=PAGES.filter(function(p){ return (!p.admin||isAdmin()) && (DB||p.noData); });
  visible.forEach(function(p){
    if(p.g!==g){ g=p.g; h+='<div class="grp">'+g+'</div>'; }
    h+='<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+' title="'+esc(p.t)+'"><svg viewBox="0 0 24 24">'+p.ic+'</svg><span class="lbl">'+p.t+'</span></button>'; });
  $('nav').innerHTML=h;
  var s=sess(), role={ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Pengguna unit'}[s.role];
  var scopeNote=s.all?'Melihat seluruh data satker.':'Cakupan: '+esc(s.scopes.map(scopeLabel).join(', '))+'.';
  $('who').innerHTML='<b>'+esc(role)+'</b>'+esc(s.email)+'<br>'+scopeNote+
    '<div class="tools" style="margin-top:10px"><button class="btn" type="button" data-pw>Ubah sandi</button><button class="btn" type="button" data-out>Keluar</button></div>';

  /* navigasi bawah ala aplikasi native (mobile) */
  var mainPages=BOTTOM_MAIN.map(function(id){ return visible.filter(function(p){return p.id===id;})[0]; }).filter(Boolean);
  var morePages=visible.filter(function(p){ return BOTTOM_MAIN.indexOf(p.id)<0; });
  var moreOn=morePages.some(function(p){ return p.id===S.page; });
  var bh=mainPages.map(function(p){ return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+'><svg viewBox="0 0 24 24">'+p.ic+'</svg><span>'+p.t+'</span></button>'; }).join('');
  bh+='<button type="button" data-more class="'+(moreOn?'on':'')+'" aria-expanded="false"><svg viewBox="0 0 24 24">'+MORE_IC+'</svg><span>Lainnya</span></button>';
  $('bottomnav').innerHTML=bh;
  $('bottomnav').hidden=false;

  var sh='<div class="sheet-hd"><b>Lainnya</b>'+THEME_BTN+'</div><div class="sheet-list">'+
    morePages.map(function(p){ return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"><svg viewBox="0 0 24 24">'+p.ic+'</svg>'+p.t+'</button>'; }).join('')+
    '</div><div class="sheet-hd"><b>'+esc(role)+'</b></div><p class="note" style="margin:0 0 12px">'+esc(s.email)+'<br>'+scopeNote+'</p>'+
    '<div class="tools"><button class="btn" type="button" data-pw>Ubah sandi</button><button class="btn" type="button" data-out>Keluar</button></div>';
  $('moreSheet').innerHTML=sh;
}
export function openSheet(){ $('moreSheet').hidden=false; $('sheetBd').hidden=false; requestAnimationFrame(function(){ $('moreSheet').classList.add('open'); $('sheetBd').classList.add('open'); }); var b=$('bottomnav').querySelector('[data-more]'); if(b) b.setAttribute('aria-expanded','true'); }
export function closeSheet(){ $('moreSheet').classList.remove('open'); $('sheetBd').classList.remove('open'); setTimeout(function(){ $('moreSheet').hidden=true; $('sheetBd').hidden=true; },220); var b=$('bottomnav').querySelector('[data-more]'); if(b) b.setAttribute('aria-expanded','false'); }
export function sheetOpen(){ return $('moreSheet').classList.contains('open'); }
export function refresh(){
  var p=PAGES.filter(function(x){ return x.id===S.page && (!x.admin||isAdmin()) && (DB||x.noData); })[0];
  if (!p){ p = DB ? PAGES[0] : (isAdmin()?PAGES[PAGES.length-1]:null); }
  if (!p){ $('page').innerHTML='<div class="glass card"><h2>Belum ada data</h2><p class="note">Admin keuangan belum mengunggah laporan realisasi.</p></div>'; $('filters').hidden=true; $('scope').hidden=true; renderNav(); return; }
  S.page=p.id; persist(); clearPageState(); hideTip();
  renderNav();
  var noF=!DB||p.id==='kelola';
  $('scope').hidden=noF;
  $('filters').hidden=noF||!S.filtersOpen;
  if (!noF) renderFilters();
  var fBtn=$('btnFilterToggle');
  if (fBtn){
    fBtn.hidden=noF;
    fBtn.setAttribute('aria-expanded',String(!!S.filtersOpen));
    fBtn.classList.toggle('on',S.filtersOpen);
    var n=activeFilterCount(), c=$('fcount');
    if (c){ c.hidden=!n; c.textContent=n; }
  }
  $('pageTitle').textContent=p.id==='ringkasan'?'Ringkasan Realisasi':p.t;
  $('crumb').textContent=p.g+' · '+BOOT.satker;
  $('page').innerHTML=p.r();
  var pg=$('page');
  bindTips(pg);
  [].forEach.call(pg.querySelectorAll('[data-tog]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-tog'); S.open[id]=!S.open[id]; keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-openall]'),function(b){ b.onclick=function(){ openLevel(b.getAttribute('data-openall')); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-closeall]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-closeall'); Object.keys(S.open).forEach(function(k){ if(k.indexOf(id+'/')===0) delete S.open[k]; }); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-goa2]'),function(b){ b.onclick=function(){ S.f.a2=b.getAttribute('data-goa2'); S.f.a3=''; S.page='jenis'; S.open={}; S.open['t-jenis/'+S.f.a2]=true; refresh(); window.scrollTo(0,0); }; });
  [].forEach.call(pg.querySelectorAll('[data-unit]'),function(b){ b.onclick=function(){ openModal(unitModalHtml(b.getAttribute('data-unit'))); }; });
  [].forEach.call(pg.querySelectorAll('[data-print]'),function(b){ b.onclick=function(){ printCard(b.getAttribute('data-print')); }; });
  [].forEach.call(pg.querySelectorAll('[data-pdf]'),function(b){ b.onclick=function(){ pdfCard(b.getAttribute('data-pdf'),b.getAttribute('data-title')); }; });
  var q=$('q'); if(q) q.oninput=function(){ S.q=q.value; S.pg=0; var pos=q.selectionStart; refresh(); var n=$('q'); n.focus(); try{n.setSelectionRange(pos,pos);}catch(e){} };
  if ($('pgPrev')){ $('pgPrev').onclick=function(){S.pg--;refresh();}; $('pgNext').onclick=function(){S.pg++;refresh();}; }
  if ($('btnCsv')) $('btnCsv').onclick=downloadCsv;
  if ($('cmpP1')) $('cmpP1').onchange=function(){ S.cmpP1=this.value; S.cmp=null; refresh(); };
  if (p.after) p.after();
}
export function keepScroll(){ var y=window.scrollY; refresh(); window.scrollTo(0,y); }
