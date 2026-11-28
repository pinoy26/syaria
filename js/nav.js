/* js/nav.js — navigasi: menu horizontal di header (desktop), bottom tab bar & sheet "Lainnya" (mobile), refresh halaman */
import { $, esc, toast } from './utils.js?v=202611280605';
import { S, BOOT, DB, sess, isAdmin, isSuperAdmin, punyaSalah, NAMA_PERAN, scopeLabel, persist, activeFilterCount, unitCaption } from './state.js?v=202611280605';
import { bindTips, bindTreeSearch, hideTip, clearPageState, openLevel, openAll, openModal, closeModal } from './ui-components.js?v=202611280605';
import { THEME_BTN } from './theme.js?v=202611280605';
import { renderFilters } from './filters.js?v=202611280605';
import { pdfCard, printCard, printAll } from './export.js?v=202611280605';
import { renderRingkasan, loadTrend } from './pages/ringkasan.js?v=202611280605';
import { renderUnit, renderUnitRincian, unitModalHtml, renderSumber, renderJenis, renderDipa } from './pages/analisis.js?v=202611280605';
import { renderRiwayat, loadCompare } from './pages/riwayat.js?v=202611280605';
import { renderPerhatian } from './pages/perhatian.js?v=202611280605';
import { renderKelola, renderKelolaUser } from './pages/kelola.js?v=202611280605';
import { renderLaporan } from './pages/laporan.js?v=202611280605';
import { renderAnggaran, renderAnggaranUnit, renderAnggaranRKK, renderAnggaranRevisi, HAL_ANGGARAN } from './pages/anggaran.js?v=202611280605';
import { renderUsulan, renderKelolaUsulan, renderMonitor } from './pages/usulan.js?v=202611280605';
import { renderKelolaBerita } from './pages/berita.js?v=202611280605';
import { IC_BERITA, isiPanelBerita, hitungMenuUsulan } from './berita.js?v=202611280605';

/* ================= navigasi ================= */
export var PAGES=[
  {id:'ringkasan',t:'Ringkasan',g:'Dasbor',ic:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',r:renderRingkasan,after:loadTrend},
  {id:'anggaran',t:'Ringkasan Anggaran',g:'Monev Anggaran',ic:'<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',r:renderAnggaran,noData:true},
  {id:'anggaran-rkk',t:'Belanja Redesain',g:'Monev Anggaran',ic:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/>',r:renderAnggaranRKK,noData:true},
  {id:'anggaran-usulan',t:'Usulan Revisi',g:'Monev Anggaran',ic:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',r:renderUsulan,noData:true},
  {id:'anggaran-monitor',t:'Monitoring Submit & Approve',g:'Monev Anggaran',ic:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',r:renderMonitor,noData:true},
  {id:'anggaran-unit',t:'Anggaran per Unit',g:'Monev Anggaran',ic:'<path d="M3 21h18M5 21V9l7-4 7 4v12"/><path d="M9 13h6M9 17h6"/>',r:renderAnggaranUnit,noData:true,notUnit:true},
  {id:'anggaran-revisi',t:'Riwayat Revisi Anggaran',g:'Monev Anggaran',ic:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',r:renderAnggaranRevisi,noData:true,notUnit:true},
  {id:'unit',t:'Unit Kerja',g:'Monev Realisasi',notUnit:true,ic:'<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5"/>',r:renderUnit},
  {id:'unit-rincian',t:'Rincian Unit Kerja',g:'Monev Realisasi',ic:'<path d="M4 5h16v14H4zM4 10h16M10 10v9"/>',r:renderUnitRincian},
  {id:'sumber',t:'Sumber Dana',g:'Monev Realisasi',ic:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h8"/>',r:renderSumber},
  {id:'jenis',t:'Jenis Belanja',g:'Monev Realisasi',ic:'<path d="M4 6h16M4 12h10M4 18h6"/>',r:renderJenis},
  {id:'dipa',t:'Struktur DIPA',g:'Monev Realisasi',notUnit:true,ic:'<path d="M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v4.5h9V15"/>',r:renderDipa},
  {id:'riwayat',t:'Riwayat & Revisi',g:'Monev Realisasi',ic:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',r:renderRiwayat,after:loadCompare},
  {id:'perhatian',t:'Perlu Perhatian',g:'Monev Realisasi',ic:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',r:renderPerhatian},
  {id:'laporan',t:'Laporan',g:'Laporan',ic:'<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',r:renderLaporan},
  {id:'kelola',t:'Kelola Data',g:'Admin',ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',r:renderKelola,hak:['unggah'],noData:true},
  {id:'kelola-user',t:'Kelola Pengguna',g:'Admin',ic:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.5-.2 4.4 1.4 5 4.8"/>',r:renderKelolaUser,superadmin:true,noData:true},
  {id:'kelola-berita',t:'Kelola Berita',g:'Admin',ic:IC_BERITA,r:renderKelolaBerita,hak:['berita'],noData:true},
  {id:'kelola-usulan',t:'Kelola Usulan Revisi',g:'Admin',ic:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',r:renderKelolaUsulan,hak:['periksa','setujui','sakti','periode'],noData:true}
];
var BOTTOM_MAIN=['ringkasan','anggaran','unit','perhatian'];
/* ikon kelompok menu di sidebar */
var GIC={
  'Dasbor':'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',
  'Monev Anggaran':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13h3M8 16h3M14 13h3M14 16h3"/>',
  'Monev Realisasi':'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  'Laporan':'<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  'Admin':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
};
/* sidebar: sentuh/klik ikon membuka panel (perangkat tanpa kursor); klik di luar menutup.
   Tombol ≡ di navbar menampilkan nama menu di samping ikon (diingat per peramban). */
function tutupSn(kecuali){ [].forEach.call(document.querySelectorAll('.sn-grp.buka'),function(g){ if(g!==kecuali){ g.classList.remove('buka'); var b=g.querySelector('[data-sn]'); if(b) b.setAttribute('aria-expanded','false'); } }); }
document.addEventListener('click',function(e){
  var t=e.target.closest('.sidenav [data-sn]');
  if (t){ var g=t.parentNode, buka=!g.classList.contains('buka'); tutupSn(g); g.classList.toggle('buka',buka); t.setAttribute('aria-expanded',buka?'true':'false'); return; }
  if (e.target.closest('.sidenav [data-page],.sidenav [data-pw],.sidenav [data-out]') || !e.target.closest('.sidenav')) tutupSn();
  if (e.target.closest('#btnSide')){ var l=!document.body.classList.contains('sn-lebar'); document.body.classList.toggle('sn-lebar',l); e.target.closest('#btnSide').setAttribute('aria-pressed',l?'true':'false'); try{ localStorage.setItem('lentera-sidebar',l?'lebar':''); }catch(x){} }
});
document.addEventListener('keydown',function(e){ if (e.key==='Escape') tutupSn(); });
try{ if(localStorage.getItem('lentera-sidebar')==='lebar') document.body.classList.add('sn-lebar'); }catch(x){}
var MORE_IC='<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
var IC_CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
var ROLE_NAME=NAMA_PERAN;
function lencana(id,H){ var n=H[id]||0; return n?'<span class="nav-badge" aria-label="'+n+' perlu tindakan">'+(n>9?'9+':n)+'</span>':''; }
document.addEventListener('notif-usulan',function(){ if($('app') && !$('app').hidden && BOOT && BOOT.session && BOOT.session.allowed) renderNav(); });
/* hak tampil menu: hak akses (salah satu), superadmin, sembunyikan dari Super admin (notSuper) atau pengguna unit (notUnit) */
function tampil(p){ return (!p.admin||isAdmin()) && (!p.hak||punyaSalah(p.hak)) && (!p.superadmin||isSuperAdmin()) && (!p.notSuper||!isSuperAdmin()) && (!p.notUnit||sess().role!=='UNIT') && (DB||p.noData); }
/* Monev Anggaran masih tahap pengembangan: pengguna unit/fakultas melihat pemberitahuan saja,
   Admin perencanaan (dan peran lain) tetap bisa memakai untuk memantau perubahan sebelum dirilis.
   Ubah ke false bila sudah siap dibuka untuk unit. */
var ANGGARAN_DIKEMBANGKAN=true;
function terkunci(p){ return ANGGARAN_DIKEMBANGKAN && p.g==='Monev Anggaran' && sess().role==='UNIT'; }
function halPengembangan(p){
  return '<div class="glass card dev-card"><div class="card-h"><h2>'+esc(p.t)+'</h2></div>'+
    '<div class="dev-isi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>'+
    '<div><b>Fitur sedang dalam tahap pengembangan</b>'+
    '<p class="note">Menu Monev Anggaran (Ringkasan Anggaran, Belanja Redesain, Usulan Revisi, dan Monitoring Submit &amp; Approve) '+
    'sedang disiapkan oleh Admin perencanaan dan belum dapat diakses oleh fakultas/unit. Fitur ini akan dibuka setelah selesai diuji. '+
    'Sementara itu, menu Dasbor dan Monev Realisasi tetap dapat digunakan seperti biasa.</p></div></div></div>';
}
export function renderNav(){
  var H=hitungMenuUsulan();
  var visible=PAGES.filter(tampil);
  /* sidebar ikon (desktop, gaya SatuDJA): satu ikon per kelompok; kursor diarahkan → panel judul + submenu.
     Kelompok berisi satu halaman: ikon & judul panel langsung membuka halaman itu. */
  var groups=[], gm={};
  visible.forEach(function(p){ if(!gm[p.g]){ gm[p.g]=[]; groups.push(p.g); } gm[p.g].push(p); });
  $('nav').innerHTML=groups.map(function(g,i){
    var ps=gm[g], on=ps.some(function(p){ return p.id===S.page; }), ada=ps.some(function(p){ return H[p.id]; }), satu=ps.length===1;
    var ic='<svg viewBox="0 0 24 24" aria-hidden="true">'+(GIC[g]||ps[0].ic)+'</svg>';
    var kepala=satu ? '<button type="button" class="sn-fly-t" data-page="'+ps[0].id+'">'+esc(ps[0].t)+lencana(ps[0].id,H)+'</button>' : '<div class="sn-fly-t">'+esc(g)+'</div>';
    return '<div class="sn-grp'+(on?' on':'')+'">'+
      '<button type="button" class="sn-ic"'+(satu?' data-page="'+ps[0].id+'"':' data-sn="'+i+'" aria-haspopup="true" aria-expanded="false"')+' aria-label="'+esc(satu?ps[0].t:g)+'"'+(on?' aria-current="page"':'')+'>'+ic+
        '<span class="sn-lbl">'+esc(satu?ps[0].t:g)+'</span>'+(ada?'<span class="sn-dot" aria-label="ada yang perlu tindakan"></span>':'')+'</button>'+
      '<div class="sn-fly">'+kepala+(satu?'':'<div class="sn-fly-l">'+ps.map(function(p){
        return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+'><svg viewBox="0 0 24 24">'+p.ic+'</svg><span>'+esc(p.t)+'</span>'+lencana(p.id,H)+'</button>';
      }).join('')+'</div>')+'</div></div>';
  }).join('');
  /* navbar kanan: T.A. & kode satker (seperti SatuDJA) */
  /* pojok kanan navbar: logo IAIN Ternate + kode satker (tanpa T.A.) */
  $('tbTa').innerHTML='<span class="tb-satker" title="'+esc((BOOT && BOOT.satker) || 'IAIN Ternate')+'"><img src="assets/logo-iain-ternate.png" alt="IAIN Ternate" onerror="this.hidden=true">'+(BOOT && BOOT.kode ? esc(BOOT.kode) : '')+'</span>';
  var s=sess(), role=ROLE_NAME[s.role]||'';
  var scopeNote=s.all?'Melihat seluruh data satker.':'Cakupan: '+esc(s.scopes.map(scopeLabel).join(', '))+'.';
  /* menu akun di bagian bawah sidebar (kursor diarahkan → panel: peran, email, cakupan, Ubah sandi, Keluar) */
  $('who').innerHTML='';
  $('snUser').innerHTML='<div class="sn-grp sn-akun">'+
      '<button type="button" class="sn-ic" data-sn="akun" aria-haspopup="true" aria-expanded="false" aria-label="Akun '+esc(s.email)+'">'+
        '<span class="sn-av" aria-hidden="true">'+esc((s.email||'?').charAt(0).toUpperCase())+'</span><span class="sn-lbl">'+esc(role)+'</span></button>'+
      '<div class="sn-fly"><div class="sn-fly-t">'+esc(role)+'</div>'+
        '<div class="sn-uinfo">'+esc(s.email)+'<span>'+scopeNote+'</span></div>'+
        '<div class="sn-fly-l">'+
          '<button type="button" data-pw><svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/></svg><span>Ubah sandi</span></button>'+
          '<button type="button" data-out><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg><span>Keluar</span></button>'+
        '</div></div></div>';

  /* navigasi bawah ala aplikasi native (mobile) */
  var mainPages=BOTTOM_MAIN.map(function(id){ return visible.filter(function(p){return p.id===id;})[0]; }).filter(Boolean);
  var morePages=visible.filter(function(p){ return BOTTOM_MAIN.indexOf(p.id)<0; });
  var moreOn=morePages.some(function(p){ return p.id===S.page; });
  var bh=mainPages.map(function(p){ return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+'><svg viewBox="0 0 24 24">'+p.ic+'</svg><span>'+p.t+'</span></button>'; }).join('');
  bh+='<button type="button" data-more class="'+(moreOn?'on':'')+'" aria-expanded="false"><svg viewBox="0 0 24 24">'+MORE_IC+'</svg><span>Lainnya</span></button>';
  $('bottomnav').innerHTML=bh;
  $('bottomnav').hidden=false;

  var sh='<div class="sheet-hd"><b>Lainnya</b>'+THEME_BTN+'</div><div class="sheet-list">'+
    morePages.map(function(p){ return '<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"><svg viewBox="0 0 24 24">'+p.ic+'</svg>'+p.t+lencana(p.id,H)+'</button>'; }).join('')+
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
  var p=PAGES.filter(function(x){ return x.id===S.page && tampil(x); })[0];
  if (!p){ p = DB ? PAGES[0] : (punyaSalah(['unggah'])?PAGES.filter(function(x){return x.id==='kelola';})[0]:null); }
  if (!p){ $('page').innerHTML='<div class="glass card"><h2>Belum ada data</h2><p class="note">Admin keuangan belum mengunggah laporan realisasi.</p></div>'; closeFilterDrawer(); renderNav(); return; }
  S.page=p.id; persist(); clearPageState(); hideTip();
  renderNav();
  var noF=!DB||HAL_ANGGARAN.indexOf(p.id)>=0||p.id==='kelola'||p.id==='kelola-user'||p.id==='kelola-berita'||p.id==='unit'||p.id==='laporan';
  if (noF) closeFilterDrawer();
  if (!noF) renderFilters();
  var fBtn=$('btnFilterToggle');
  if (fBtn){
    fBtn.hidden=noF;
    var n=activeFilterCount(), c=$('fcount');
    if (c){ c.hidden=!n; c.textContent=n; }
  }
  /* kotak judul halaman sudah tidak ada: judul halaman tampil di tab browser */
  document.title=(p.id==='ringkasan'?'Ringkasan Realisasi':p.id==='unit-rincian'?('Rincian — '+(function(c){return c.charAt(0).toUpperCase()+c.slice(1);})(unitCaption())):p.t)+' · LANTERA';
  var toolsEl=$('pageTools');
  /* pemilih tahun/posisi realisasi tidak berlaku di Monev Anggaran (punya pemilih versi RKK sendiri) */
  if (toolsEl) toolsEl.classList.toggle('pt-ag', HAL_ANGGARAN.indexOf(p.id)>=0);
  if (toolsEl) $('page').parentNode.insertBefore(toolsEl,$('page'));
  /* halaman Laporan meminjam pemilih posisi data ke formulirnya; kembalikan ke tempatnya sebelum isi halaman diganti */
  ['selTahun','selPeriode'].forEach(function(id){
    var el=$(id), rumah=document.querySelector('#pageTools label[for="'+id+'"]');
    if (el && rumah && !rumah.contains(el)) rumah.appendChild(el);
  });
  var kunci=terkunci(p);
  $('page').innerHTML=kunci?halPengembangan(p):p.r();
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
  /* kartu Unit Kerja: "Lihat selengkapnya" langsung ke rincian lengkap fakultas/unit (Rincian Unit Kerja, terbuka di unit itu) */
  [].forEach.call(pg.querySelectorAll('[data-rincian-unit]'),function(b){ b.onclick=function(){
    var key=b.getAttribute('data-rincian-unit'), parts=key.split('|');
    S.f.unit=key; S.f.a2=''; S.f.a3=''; S.cmp=null;
    S.page='unit-rincian'; S.open={}; S.unitView='unit';
    S.open['t-unit/'+parts[0]]=true; S.open['t-unit/'+parts[0]+'/'+parts[1]]=true;
    refresh(); window.scrollTo(0,0);
  }; });
  /* batang panah Fakultas/Rektorat di Unit Kerja: gulir ke kelompoknya */
  [].forEach.call(pg.querySelectorAll('[data-uk-ke]'),function(b){ b.onclick=function(){ var t=document.getElementById(b.getAttribute('data-uk-ke')); if(t) t.scrollIntoView({behavior:'smooth',block:'start'}); }; });
  [].forEach.call(pg.querySelectorAll('[data-print]'),function(b){ b.onclick=function(){ printCard(b.getAttribute('data-print')); }; });
  [].forEach.call(pg.querySelectorAll('[data-pdf]'),function(b){ b.onclick=function(){ pdfCard(b.getAttribute('data-pdf'),b.getAttribute('data-title')); }; });
  [].forEach.call(pg.querySelectorAll('[data-printall]'),function(b){ b.onclick=printAll; });
  if ($('cmpP1')) $('cmpP1').onchange=function(){ S.cmpP1=this.value; S.cmp=null; refresh(); };
  isiPanelBerita();
  if (p.after && !kunci) p.after();
  catatRiwayat();
}

/* ================= riwayat browser: tombol back browser/HP & tombol ‹ Kembali di navbar =================
   Setiap perpindahan menu / filter / tampilan di dalam halaman yang dilakukan PENGGUNA dicatat (pushState, alamat #/menu);
   perubahan otomatis (memuat data, pengalihan) hanya memperbarui catatan yang sedang aktif (replaceState) agar tombol
   back tidak terjebak. Back saat jendela/panel terbuka hanya menutupnya. Di bawah halaman pertama ada catatan "jaga":
   back di halaman pertama memunculkan peringatan, back sekali lagi keluar dari LANTERA. */
/* halaman yang punya tampilan di dalamnya (mis. Usulan Revisi: daftar → detail) mendaftarkan cara membaca & memasang tampilannya.
   SUB sengaja tanpa nilai awal: modul halaman bisa mendaftar sebelum isi modul ini dijalankan (impor melingkar). */
var SUB;
export function daftarSub(pages,o){ SUB=SUB||{}; pages.forEach(function(p){ SUB[p]=o; }); }
function subDari(p){ return SUB&&SUB[p]; }
var RW={ awal:false, pulih:false, aksi:false, keluar:false, peringatan:0 };
['click','keydown','change','submit'].forEach(function(ev){ document.addEventListener(ev,function(e){ if(e.isTrusted&&$('app')&&!$('app').hidden) RW.aksi=true; },true); });
function salin(x){ return JSON.parse(JSON.stringify(x||{})); }
function snap(d){ var o=subDari(S.page); return { lantera:1, page:S.page, f:salin(S.f), uv:S.unitView||'', open:salin(S.open), sub:o?o.ambil():null, d:d||0 }; }
function kunciSnap(x){ return JSON.stringify([x.page,x.f,x.uv,x.sub]); }
function alamat(p){ return '#/'+p; }
function aktifApp(){ var a=$('app'); return a&&!a.hidden; }
function catatRiwayat(){
  if (RW.pulih || !aktifApp()) return;
  var cur=history.state;
  if (!RW.awal){
    RW.awal=true;
    if (cur && cur.lantera && !cur.jaga){ var s0=snap(cur.d); history.replaceState(s0,'',alamat(s0.page)); RW.aksi=false; tombolKembali(); return; }   /* muat ulang (F5) */
    history.replaceState({lantera:1,jaga:1},'',location.pathname+location.search);
    history.pushState(snap(0),'',alamat(S.page)); RW.aksi=false; tombolKembali(); return;
  }
  var d=cur&&cur.lantera&&!cur.jaga?cur.d:0, s=snap(d);
  if (cur && cur.lantera && !cur.jaga && (kunciSnap(cur)===kunciSnap(s) || !RW.aksi)){ s.y=cur.y; history.replaceState(s,'',alamat(s.page)); }
  else {
    if (cur && cur.lantera && !cur.jaga){ var c2=salin(cur); c2.y=window.scrollY; history.replaceState(c2,'',location.hash); }
    s.d=d+1; history.pushState(s,'',alamat(s.page));
  }
  RW.aksi=false; tombolKembali();
}
function pulihkan(st){
  RW.pulih=true;
  try{
    S.page=st.page; S.f=salin(st.f); S.unitView=st.uv||S.unitView; S.open=salin(st.open);
    if (subDari(st.page) && st.sub) subDari(st.page).pasang(st.sub);
    refresh();
  } finally { RW.pulih=false; }
  window.scrollTo(0,st.y||0); tombolKembali();
}
window.addEventListener('popstate',function(e){
  if (!aktifApp() || /^#berita-\d+$/.test(location.hash)) return;   /* halaman baca berita menangani dirinya sendiri */
  var st=e.state;
  /* jendela / panel terbuka: back hanya menutupnya, tetap di halaman ini */
  if (!$('modal').hidden || filterDrawerOpen() || sheetOpen()){
    closeModal(); closeFilterDrawer(); closeSheet();
    if (st && st.lantera && !st.jaga && kunciSnap(st)===kunciSnap(snap())) return;
    history.pushState(snap(st&&st.d!=null?st.d+1:1),'',alamat(S.page)); tombolKembali(); return;
  }
  if (st && st.jaga){
    if (Date.now()-RW.peringatan<4000){ RW.keluar=true; history.back(); return; }
    RW.peringatan=Date.now();
    toast('Tekan Kembali sekali lagi untuk keluar dari LANTERA.','info','Keluar dari LANTERA?');
    history.pushState(snap(0),'',alamat(S.page)); tombolKembali(); return;
  }
  if (!st || !st.lantera){ if (RW.keluar){ history.back(); return; } history.pushState(snap(0),'',alamat(S.page)); return; }
  if (kunciSnap(st)===kunciSnap(snap())){ tombolKembali(); return; }   /* mis. kembali dari halaman berita */
  pulihkan(st);
});
/* tombol ‹ Kembali & jejak lokasi di navbar */
function tombolKembali(){
  var b=$('btnKembali'), st=history.state, ada=!!(st&&st.lantera&&!st.jaga&&st.d>0);
  if (b) b.hidden=!ada;
  var j=$('tbJejak'); if (!j) return;
  var p=PAGES.filter(function(x){ return x.id===S.page; })[0]; if (!p){ j.innerHTML=''; return; }
  var bag=[p.g,p.t]; if (p.id==='unit-rincian' && S.f && S.f.unit) bag.push(S.f.unit.split('|')[1]||S.f.unit.split('|')[0]);
  j.innerHTML=bag.filter(Boolean).map(function(x,i,a){ return '<span'+(i===a.length-1?' aria-current="page"':'')+'>'+esc(x)+'</span>'; }).join('<i aria-hidden="true">›</i>');
}
document.addEventListener('click',function(e){ if (e.target.closest('#btnKembali')) history.back(); });
/* setelah muat ulang (F5): kembali ke menu yang sedang dibuka (login baru selalu mulai dari Ringkasan) */
export function pulihkanDariAlamat(){
  var st=history.state;
  if (st && st.lantera && !st.jaga && /^#\/[\w-]+$/.test(location.hash) && PAGES.some(function(x){ return x.id===st.page; })){
    S.page=st.page; S.f=salin(st.f); S.unitView=st.uv||S.unitView; S.open=salin(st.open);
    if (subDari(st.page) && st.sub) subDari(st.page).pasang(st.sub);
  }
}
export function keepScroll(){ var y=window.scrollY; refresh(); window.scrollTo(0,y); }
