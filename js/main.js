/* js/main.js — titik masuk: memuat data, mengikat event top-level, boot aplikasi */
import { $, tgl, blnTahun, esc, errMsg, toast, yearFrac } from './utils.js?v=202611141419';
import { S, setDB, setD, setWAKTU, setALL, setBoot, setAK, BOOT, EMPTY_F } from './state.js?v=202611141419';
import { SB, SBC, sbInit } from './api.js?v=202611141419';
import { closeModal } from './ui-components.js?v=202611141419';
import { refresh, openSheet, closeSheet, sheetOpen, openFilterDrawer, closeFilterDrawer, filterDrawerOpen } from './nav.js?v=202611141419';
import { tampilMasuk } from './auth.js?v=202611141419';
import { bukaUbahSandi } from './akun.js?v=202611141419';
import { muatBeritaDasbor, bukaBeritaDasbor, bukaDariUrl } from './berita.js?v=202611141419';

export function setData(d){
  setDB(d); setD(d.dims); setWAKTU(yearFrac(d.periode));
  setALL(d.items.map(function(a){
    var r={prog:a[0],keg:String(a[1]),kro:a[2],ro:a[3],komp:String(a[4]),sub:a[5],akun:String(a[6]),sumber:a[7],no:a[8],item:a[9],pagu:a[10],lock:a[11],lalu:a[12],ini:a[13],sd:a[14],sisa:a[15],kat:a[16],unit:a[17]};
    r.a2=r.akun.slice(0,2); r.a3=r.akun.slice(0,3); r.gaji=r.ro==='EBA.994'&&(r.komp==='001'||r.komp==='002');
    return r;
  }));
}
export function loadData(periode){
  $('page').innerHTML='<div class="loading">Memuat data posisi '+tgl(periode)+'…</div>';
  return SB.data(periode).then(function(d){ setData(d); S.open={}; refresh(); }).catch(function(e){ $('page').innerHTML='<div class="glass card">'+esc(errMsg(e))+'</div>'; });
}
export function fillPeriods(sel){
  var ps=BOOT.periods;
  $('selPeriode').innerHTML=ps.length?ps.slice().reverse().map(function(p){return '<option value="'+p.periode+'"'+(p.periode===sel?' selected':'')+'>'+blnTahun(p.periode)+'</option>';}).join(''):'<option>—</option>';
}
export function reboot(periode, keepPage){
  return SB.boot().then(function(b){
    setBoot(b); setAK(b.akunNames||{});
    var ps=b.periods, target=periode && ps.some(function(p){return p.periode===periode;}) ? periode : (ps.length?ps[ps.length-1].periode:null);
    fillPeriods(target);
    if (!target){ setDB(null); refresh(); return; }
    return loadData(target);
  });
}
$('selPeriode').onchange=function(){ S.cmp=null; loadData(this.value); };
$('btnFilterToggle').onclick=function(){ if (filterDrawerOpen()) closeFilterDrawer(); else openFilterDrawer(); };
$('filtersBd').addEventListener('click',closeFilterDrawer);
$('filters').addEventListener('click',function(e){ if (e.target.closest('[data-filter-close]')) closeFilterDrawer(); });
$('modalBd').addEventListener('click',closeModal);
$('modal').addEventListener('click',function(e){
  if (e.target.closest('[data-modal-close]')) { closeModal(); return; }
  var g=e.target.closest('[data-goto-rincian]');
  if (g){
    var key=g.getAttribute('data-goto-rincian'), parts=key.split('|');
    S.f.unit=key; S.f.a2=''; S.f.a3=''; S.cmp=null;
    closeModal();
    S.page='unit-rincian'; S.open={}; S.unitView='unit';
    S.open['t-unit/'+parts[0]]=true; S.open['t-unit/'+parts[0]+'/'+parts[1]]=true;
    refresh(); window.scrollTo(0,0);
  }
});
function gotoTab(id){ S.page=id; S.f=EMPTY_F(); S.open={}; S.pg=0; S.cmp=null; refresh(); window.scrollTo(0,0); }
$('nav').addEventListener('click',function(e){ var b=e.target.closest('[data-page]'); if(!b) return; gotoTab(b.getAttribute('data-page')); });
$('bottomnav').addEventListener('click',function(e){
  if (e.target.closest('[data-more]')){ if(sheetOpen()) closeSheet(); else openSheet(); return; }
  var b=e.target.closest('[data-page]'); if(!b) return;
  gotoTab(b.getAttribute('data-page'));
});
$('moreSheet').addEventListener('click',function(e){
  var b=e.target.closest('[data-page]'); if(!b) return;
  closeSheet(); gotoTab(b.getAttribute('data-page'));
});
$('sheetBd').addEventListener('click',closeSheet);
$('btnBerita').onclick=bukaBeritaDasbor;
document.addEventListener('click',function(e){
  if (e.target.closest('[data-out]')) { SB.keluar(); return; }
  if (e.target.closest('[data-pw]')) { if (sheetOpen()) closeSheet(); bukaUbahSandi(); }
});
/* Escape menutup jendela (modal) yang sedang terbuka */
document.addEventListener('keydown',function(e){ if (e.key==='Escape' && !$('modal').hidden) closeModal(); });

/* ---------- mulai ---------- */
export function mulai(){
  SB.boot().then(function(b){
    $('boot').hidden = true;
    setBoot(b);
    if (!b.session.allowed){
      if (!b.session.email) { tampilMasuk(); bukaDariUrl(); return; }
      tampilMasuk(b.session.tanpaCakupan
        ? 'Akun ' + b.session.email + ' sudah aktif tetapi belum diberi cakupan unit. Hubungi admin keuangan.'
        : 'Akun ' + b.session.email + ' belum diaktifkan admin keuangan.');
      SBC.auth.signOut();
      return;
    }
    setAK(b.akunNames || {});
    $('gate').hidden = true; $('app').hidden = false;
    $('brandSub').textContent = (b.satker || '') + (b.kode ? ' · Satker ' + b.kode : '');
    muatBeritaDasbor().then(bukaDariUrl);
    var ps = b.periods;
    fillPeriods(ps.length ? ps[ps.length - 1].periode : null);
    if (!ps.length) { setDB(null); refresh(); return; }
    loadData(ps[ps.length - 1].periode);
  }).catch(function(e){
    $('boot').hidden = false;
    $('boot').innerHTML = '<span class="neg">Dasbor gagal dimuat: ' + esc(errMsg(e)) + '</span>';
  });
}

if (sbInit()){
  /* sesi berakhir/gagal diperpanjang saat dasbor terbuka: kembali ke halaman login alih-alih
     diam-diam mengirim permintaan sebagai pengunjung anonim */
  SBC.auth.onAuthStateChange(function(ev){
    if (ev === 'SIGNED_OUT' && !$('app').hidden){ closeModal(); tampilMasuk('Sesi Anda sudah berakhir. Silakan masuk kembali.'); }
  });
  mulai();
}
