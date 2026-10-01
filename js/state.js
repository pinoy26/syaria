/* js/state.js — state aplikasi, cakupan/filter pengguna, konstanta domain */

/* ================= konstanta ================= */
export var SRC = {RM:'Rupiah Murni', PNP:'PNBP'};
export var FAK_ORDER = ['FTIK','FEBI','FASYA','FUAD','Pascasarjana'];
export var FAK_FULL = {FTIK:'Fakultas Tarbiyah dan Ilmu Keguruan',FEBI:'Fakultas Ekonomi dan Bisnis Islam',FASYA:'Fakultas Syariah',FUAD:'Fakultas Ushuluddin, Adab dan Dakwah',Pascasarjana:'Pascasarjana'};
export var FLABEL = {prog:'Program',keg:'Kegiatan',kro:'KRO',ro:'RO',komp:'Komponen',sub:'Sub Komponen'};
export var CHAIN=['prog','keg','kro','ro','komp','sub'];

/* ================= state boot/data (diisi dari main.js) ================= */
export var BOOT=null, DB=null, ALL=[], D=null, WAKTU=0, AK={};
export function setBoot(b){ BOOT=b; }
export function setDB(d){ DB=d; }
export function setALL(a){ ALL=a; }
export function setD(d){ D=d; }
export function setWAKTU(w){ WAKTU=w; }
export function setAK(a){ AK=a; }

export function A2(k){ return AK[k]||('Akun '+k); }
export function A3(k){ return AK[k]||''; }
export function subName(r){ return D.sub[r.ro+'|'+r.sub]||''; }
export function status(p,w){ if(p>1.0001) return ['st-crit','Melebihi pagu']; var d=p-w; if(d>=-0.05) return ['st-good','Sesuai jadwal']; if(d>=-0.20) return ['st-warn','Perlu percepatan']; return ['st-crit','Tertinggal jauh']; }
export function pill(p){ var s=status(p,WAKTU); return '<span class="pill '+s[0]+'"><i></i>'+s[1]+'</span>'; }

/* ================= filter & cakupan pengguna ================= */
export var EMPTY_F = function(){ return {prog:'',keg:'',kro:'',ro:'',komp:'',sub:'',unit:'',sumber:'',a2:'',a3:'',noGaji:false}; };
export var S = { page:'ringkasan', open:{}, q:'', pg:0, f:EMPTY_F(), trend:{}, cmp:null, cmpKey:'', admin:null, filtersOpen:false, unitSel:null };
try { var sv=JSON.parse(localStorage.getItem('dasbor-v2')||'null'); if(sv&&sv.page) S.page=sv.page; } catch(e){}
export function persist(){ try{ localStorage.setItem('dasbor-v2', JSON.stringify({page:S.page})); }catch(e){} }
export function sess(){ return BOOT.session; }
export function isAdmin(){ return sess().role==='ADMIN'; }
export function isUnitUser(){ return !sess().all; }
export function scopeLabel(s){ return s.unit || ('Seluruh '+s.kat); }
export function scoped(){ return ALL; } // data sudah disaring server sesuai hak akses
export function applyF(rows, upto){
  var f=S.f;
  return rows.filter(function(r){
    for (var i=0;i<CHAIN.length;i++){ if (upto!=null && i>=upto) break; var k=CHAIN[i]; if (f[k] && r[k]!==f[k]) return false; }
    if (upto!=null) return true;
    if (f.unit){ var u=f.unit.split('|'); if (r.kat!==u[0]) return false; if (u[1] && r.unit!==u[1]) return false; }
    if (f.sumber && r.sumber!==f.sumber) return false;
    if (f.a2 && r.a2!==f.a2) return false;
    if (f.a3 && r.a3!==f.a3) return false;
    if (f.noGaji && r.gaji) return false;
    return true;
  });
}
export function rows(){ return applyF(scoped()); }
export function unitCaption(){
  if (S.f.unit){ var u=S.f.unit.split('|'); return u[1]||('Semua '+u[0]); }
  if (isUnitUser()) return sess().scopes.map(scopeLabel).join(', ');
  return 'seluruh satker';
}
export function activeFilterCount(){
  var f=S.f, n=0;
  CHAIN.concat(['unit','sumber','a2','a3']).forEach(function(k){ if(f[k]) n++; });
  if (f.noGaji) n++;
  return n;
}
export function scopeText(){
  var f=S.f, parts=[unitCaption()];
  CHAIN.forEach(function(k){ if(f[k]) parts.push(FLABEL[k]+' '+f[k]); });
  if (f.sumber) parts.push(SRC[f.sumber]); if (f.a2) parts.push('Akun '+f.a2); if (f.a3) parts.push('Akun '+f.a3);
  if (f.noGaji) parts.push('tanpa gaji & operasional kantor');
  return parts.join(' · ');
}
