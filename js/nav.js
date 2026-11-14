/* js/nav.js — navigasi: menu horizontal di header (desktop), bottom tab bar & sheet "Lainnya" (mobile), refresh halaman */
import { $, esc } from './utils.js?v=202611141319';
import { S, BOOT, DB, sess, isAdmin, isSuperAdmin, scopeLabel, persist, activeFilterCount, unitCaption } from './state.js?v=202611141319';
import { bindTips, bindTreeSearch, hideTip, clearPageState, openLevel, openAll, openModal } from './ui-components.js?v=202611141319';
import { THEME_BTN } from './theme.js?v=202611141319';
import { renderFilters } from './filters.js?v=202611141319';
import { pdfCard, printCard, printAll } from './export.js?v=202611141319';
import { renderRingkasan, loadTrend } from './pages/ringkasan.js?v=202611141319';
import { renderUnit, renderUnitRincian, unitModalHtml, renderSumber, renderJenis, renderDipa } from './pages/analisis.js?v=202611141319';
import { renderRiwayat, loadCompare } from './pages/riwayat.js?v=202611141319';
import { renderPerhatian } from './pages/perhatian.js?v=202611141319';
import { renderKelola, renderKelolaUser } from './pages/kelola.js?v=202611141319';
import { renderLaporan } from './pages/laporan.js?v=202611141319';
import { renderKelolaBerita } from './pages/berita.js?v=202611141319';
import { IC_BERITA, isiPanelBerita } from './berita.js?v=202611141319';

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
  {id:'laporan',t:'Laporan',g:'Laporan',ic:'<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',r:renderLaporan},
  {id:'kelola',t:'Kelola Data',g:'Admin',ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',r:renderKelola,superadmin:true,noData:true},
  {id:'kelola-user',t:'Kelola Pengguna',g:'Admin',ic:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.5-.2 4.4 1.4 5 4.8"/>',r:renderKelolaUser,superadmin:true,noData:true},
  {id:'kelola-berita',t:'Kelola Berita',g:'Admin',ic:IC_BERITA,r:renderKelolaBerita,admin:true,noData:true}
];
var BOTTOM_MAIN=['ringkasan','unit','riwayat','perhatian'];
var MORE_IC='<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
var IC_CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
var ROLE_NAME={SUPERADMIN:'Super admin',ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Pengguna unit'};
export function renderNav(){
  var visible=PAGES.filter(function(p){ return (!p.admin||isAdmin()) && (!p.superadmin||isSuperAdmin()) && (DB||p.noData); });
  /* menu horizontal (desktop): satu tombol per kelompok; kelompok berisi lebih dari satu halaman jadi menu turun */
  var groups=[], gm={};
  visible.forEach(function(p){ if(!gm[p.g]){ gm[p.g]=[]; groups.push(p.g); } gm[p.g].push(p); });
  $('nav').innerHTML=groups.map(function(g,i){
    var ps=gm[g], on=ps.some(function(p){ return p.id===S.page; });
    if (ps.length===1){ var p=ps[0]; return '<button type="button" class="hn-btn'+(on?' on':'')+'" data-page="'+p.id+'"'+(on?' aria-current="page"':'')+'>'+p.t+'</button>'; }
    return '<div class="hn-grp"><button type="button" class="hn-btn'+(on?' on':'')+'" data-hn="'+i+'" aria-expanded="false" aria-haspopup="true">'+g+IC_CHEV+'</button>'+
      '<div class="hn-menu glass" hidden>'+ps.map(function(p){
        return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+'><svg viewBox="0 0 24 24">'+p.ic+'</svg>'+p.t+'</button>';
      }).join('')+'</div></div>';
  }).join('');
  var s=sess(), role=ROLE_NAME[s.role]||'';
  var scopeNote=s.all?'Melihat seluruh data satker.':'Cakupan: '+esc(s.scopes.map(scopeLabel).join(', '))+'.';
  /* menu pengguna di kanan atas */
  $('who').innerHTML='<button type="button" class="tb-ubtn" data-hn="user" aria-expanded="false" aria-haspopup="true" aria-label="Menu akun '+esc(s.email)+'">'+
      '<span class="who-av" aria-hidden="true">'+esc((s.email||'?').charAt(0).toUpperCase())+'</span>'+
      '<span class="tb-uname"><b>'+esc(role)+'</b><small>'+esc(s.email)+'</small></span>'+IC_CHEV+'</button>'+
    '<div class="hn-menu tb-umenu glass" hidden><div class="tb-uinfo"><b>'+esc(role)+'</b>'+esc(s.email)+'<span class="note">'+scopeNote+'</span></div>'+
      '<button type="button" data-pw><svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/></svg>Ubah sandi</button>'+
      '<button type="button" data-out><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>Keluar</button></div>';

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
/* menu turun di header: klik untuk buka/tutup, klik di luar atau Esc menutup */
function tutupMenu(kecuali){
  [].forEach.call(document.querySelectorAll('.topbar [data-hn][aria-expanded="true"]'),function(b){
    if (b===kecuali) return; b.setAttribute('aria-expanded','false'); b.nextElementSibling.hidden=true;
  });
}
document.addEventListener('click',function(e){
  var t=e.target.closest('.topbar [data-hn]');
  if (t){ var buka=t.getAttribute('aria-expanded')!=='true'; tutupMenu(t); t.setAttribute('aria-expanded',buka?'true':'false'); t.nextElementSibling.hidden=!buka; return; }
  if (!e.target.closest('.hn-menu') || e.target.closest('button')) tutupMenu();
});
document.addEventListener('keydown',function(e){ if (e.key==='Escape') tutupMenu(); });
export function openFilterDrawer(){ $('filters').hidden=false; $('filtersBd').hidden=false; requestAnimationFrame(function(){ $('filters').classList.add('open'); $('filtersBd').classList.add('open'); }); var b=$('btnFilterToggle'); if(b){ b.setAttribute('aria-expanded','true'); b.classList.add('on'); } }
export function closeFilterDrawer(){ $('filters').classList.remove('open'); $('filtersBd').classList.remove('open'); setTimeout(function(){ $('filters').hidden=true; $('filtersBd').hidden=true; },220); var b=$('btnFilterToggle'); if(b){ b.setAttribute('aria-expanded','false'); b.classList.remove('on'); } }
export function filterDrawerOpen(){ return $('filters').classList.contains('open'); }
export function openSheet(){ $('moreSheet').hidden=false; $('sheetBd').hidden=false; requestAnimationFrame(function(){ $('moreSheet').classList.add('open'); $('sheetBd').classList.add('open'); }); var b=$('bottomnav').querySelector('[data-more]'); if(b) b.setAttribute('aria-expanded','true'); }
export function closeSheet(){ $('moreSheet').classList.remove('open'); $('sheetBd').classList.remove('open'); setTimeout(function(){ $('moreSheet').hidden=true; $('sheetBd').hidden=true; },220); var b=$('bottomnav').querySelector('[data-more]'); if(b) b.setAttribute('aria-expanded','false'); }
export function sheetOpen(){ return $('moreSheet').classList.contains('open'); }
export function refresh(){
  var p=PAGES.filter(function(x){ return x.id===S.page && (!x.admin||isAdmin()) && (!x.superadmin||isSuperAdmin()) && (DB||x.noData); })[0];
  if (!p){ p = DB ? PAGES[0] : (isSuperAdmin()?PAGES.filter(function(x){return x.id==='kelola';})[0]:null); }
  if (!p){ $('page').innerHTML='<div class="glass card"><h2>Belum ada data</h2><p class="note">Admin keuangan belum mengunggah laporan realisasi.</p></div>'; closeFilterDrawer(); renderNav(); return; }
  S.page=p.id; persist(); clearPageState(); hideTip();
  renderNav();
  var noF=!DB||p.id==='kelola'||p.id==='kelola-user'||p.id==='kelola-berita'||p.id==='unit'||p.id==='laporan';
  if (noF) closeFilterDrawer();
  if (!noF) renderFilters();
  var fBtn=$('btnFilterToggle');
  if (fBtn){
    fBtn.hidden=noF;
    var n=activeFilterCount(), c=$('fcount');
    if (c){ c.hidden=!n; c.textContent=n; }
  }
  /* kotak judul halaman sudah tidak ada: judul halaman tampil di tab browser */
  document.title=(p.id==='ringkasan'?'Ringkasan Realisasi':p.id==='unit-rincian'?('Rincian — '+(function(c){return c.charAt(0).toUpperCase()+c.slice(1);})(unitCaption())):p.t)+' · LENTERA';
  var toolsEl=$('pageTools');
  if (toolsEl) $('page').parentNode.insertBefore(toolsEl,$('page'));
  /* halaman Laporan meminjam pemilih posisi data ke formulirnya; kembalikan ke tempatnya sebelum isi halaman diganti */
  var selP=$('selPeriode'), rumahP=document.querySelector('#pageTools label[for="selPeriode"]');
  if (selP && rumahP && !rumahP.contains(selP)) rumahP.appendChild(selP);
  $('page').innerHTML=p.r();
  var pg=$('page');
  var firstHd=pg.querySelector('.card-h');
  if (firstHd && toolsEl) firstHd.appendChild(toolsEl);
  bindTips(pg);
  bindTreeSearch(pg);
  [].forEach.call(pg.querySelectorAll('[data-tog]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-tog'); S.open[id]=!S.open[id]; keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-openall]'),function(b){ b.onclick=function(){ openLevel(b.getAttribute('data-openall')); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-expandall]'),function(b){ b.onclick=function(){ openAll(b.getAttribute('data-expandall')); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-closeall]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-closeall'); Object.keys(S.open).forEach(function(k){ if(k.indexOf(id+'/')===0) delete S.open[k]; }); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-goa2]'),function(b){ b.onclick=function(){ S.f.a2=b.getAttribute('data-goa2'); S.f.a3=''; S.page='jenis'; S.open={}; S.open['t-jenis/'+S.f.a2]=true; refresh(); window.scrollTo(0,0); }; });
  [].forEach.call(pg.querySelectorAll('[data-unitview]'),function(b){ b.onclick=function(){ S.unitView=b.getAttribute('data-unitview'); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-unit]'),function(b){ b.onclick=function(){ openModal(unitModalHtml(b.getAttribute('data-unit'))); }; });
  [].forEach.call(pg.querySelectorAll('[data-print]'),function(b){ b.onclick=function(){ printCard(b.getAttribute('data-print')); }; });
  [].forEach.call(pg.querySelectorAll('[data-pdf]'),function(b){ b.onclick=function(){ pdfCard(b.getAttribute('data-pdf'),b.getAttribute('data-title')); }; });
  [].forEach.call(pg.querySelectorAll('[data-printall]'),function(b){ b.onclick=printAll; });
  if ($('cmpP1')) $('cmpP1').onchange=function(){ S.cmpP1=this.value; S.cmp=null; refresh(); };
  isiPanelBerita();
  if (p.after) p.after();
}
export function keepScroll(){ var y=window.scrollY; refresh(); window.scrollTo(0,y); }
