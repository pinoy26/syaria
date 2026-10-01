/* js/main.js — titik masuk: memuat data, mengikat event top-level, boot aplikasi */
import { $, tgl, esc, errMsg, toast, yearFrac } from './utils.js';
import { S, setDB, setD, setWAKTU, setALL, setBoot, setAK, BOOT } from './state.js';
import { SB, SBC, sbInit } from './api.js';
import { closeModal } from './ui-components.js';
import { refresh, openSheet, closeSheet, sheetOpen } from './nav.js';
import { tampilMasuk } from './auth.js';

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
  $('selPeriode').innerHTML=ps.length?ps.slice().reverse().map(function(p){return '<option value="'+p.periode+'"'+(p.periode===sel?' selected':'')+'>'+tgl(p.periode)+'</option>';}).join(''):'<option>—</option>';
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
$('btnPrintAll').onclick=function(){ document.body.classList.remove('print-one'); window.print(); };
$('btnFilterToggle').onclick=function(){ S.filtersOpen=!S.filtersOpen; refresh(); };
try { if (localStorage.getItem('dasbor-sidebar')==='tutup') $('app').classList.add('side-collapsed'); } catch(e){}
$('btnSideToggle').onclick=function(){
  var tutup=$('app').classList.toggle('side-collapsed');
  try { localStorage.setItem('dasbor-sidebar', tutup?'tutup':'buka'); } catch(e){}
};
$('modalBd').addEventListener('click',closeModal);
$('modal').addEventListener('click',function(e){
  if (e.target.closest('[data-modal-close]')) { closeModal(); return; }
  var g=e.target.closest('[data-goto-rincian]');
  if (g){
    var key=g.getAttribute('data-goto-rincian'), parts=key.split('|');
    S.f.unit=key; S.f.a2=''; S.f.a3=''; S.cmp=null;
    closeModal();
    S.page='unit-rincian'; S.open={};
    S.open['t-unit/'+parts[0]]=true; S.open['t-unit/'+parts[0]+'/'+parts[1]]=true;
    refresh(); window.scrollTo(0,0);
  }
});
$('nav').addEventListener('click',function(e){ var b=e.target.closest('[data-page]'); if(!b) return; S.page=b.getAttribute('data-page'); S.open={}; S.pg=0; refresh(); window.scrollTo(0,0); });
$('bottomnav').addEventListener('click',function(e){
  if (e.target.closest('[data-more]')){ if(sheetOpen()) closeSheet(); else openSheet(); return; }
  var b=e.target.closest('[data-page]'); if(!b) return;
  S.page=b.getAttribute('data-page'); S.open={}; S.pg=0; refresh(); window.scrollTo(0,0);
});
$('moreSheet').addEventListener('click',function(e){
  var b=e.target.closest('[data-page]'); if(!b) return;
  S.page=b.getAttribute('data-page'); S.open={}; S.pg=0; closeSheet(); refresh(); window.scrollTo(0,0);
});
$('sheetBd').addEventListener('click',closeSheet);
document.addEventListener('click',function(e){
  if (e.target.closest('[data-out]')) { SB.keluar(); return; }
  if (e.target.closest('[data-pw]')) {
    var baru=prompt('Kata sandi baru (minimal 8 karakter):'); if(baru===null) return;
    SB.gantiSandi(baru).then(function(r){ toast(r.pesan); }).catch(function(e){ toast(errMsg(e)); });
  }
});

/* ---------- mulai ---------- */
export function mulai(){
  SB.boot().then(function(b){
    $('boot').hidden = true;
    setBoot(b);
    if (!b.session.allowed){
      if (!b.session.email) { tampilMasuk(); return; }
      tampilMasuk(b.session.tanpaCakupan
        ? 'Akun ' + b.session.email + ' sudah aktif tetapi belum diberi cakupan unit. Hubungi admin keuangan.'
        : 'Akun ' + b.session.email + ' belum diaktifkan admin keuangan.');
      SBC.auth.signOut();
      return;
    }
    setAK(b.akunNames || {});
    $('gate').hidden = true; $('app').hidden = false;
    $('brandSub').textContent = (b.satker || '') + (b.kode ? ' · Satker ' + b.kode : '');
    var ps = b.periods;
    fillPeriods(ps.length ? ps[ps.length - 1].periode : null);
    if (!ps.length) { setDB(null); refresh(); return; }
    loadData(ps[ps.length - 1].periode);
  }).catch(function(e){
    $('boot').hidden = false;
    $('boot').innerHTML = '<span class="neg">Dasbor gagal dimuat: ' + esc(errMsg(e)) + '</span>';
  });
}

if (sbInit()) mulai();
