/* app.js — Dasbor Anggaran & Realisasi (Supabase + GitHub Pages) */
(function(){
'use strict';

/* ===== pembaca file SAKTI (sama dengan versi Apps Script) ===== */
/**
 * Parser.gs — membaca ekspor SAKTI menjadi baris data datar.
 * Input: array 2D (baris x kolom) hasil SheetJS di browser.
 * Tidak bergantung pada posisi kolom tetap: jenis baris dikenali dari pola kode.
 */

var RX = {
  item:     /^(\d{6})\.\s*([\s\S]*)$/,
  akun:     /^\d{6}$/,
  program:  /^[A-Z]{2}$/,
  kegiatan: /^[A-Z]{2}\.(\d{4})$/,
  sub:      /^\d{3}\.[A-Z0-9]{2}$/,
  ro:       /^[A-Z0-9]{3}\.\d{3}$/,
  komp:     /^\d{3}$/,
  kro:      /^[A-Z0-9]{3}$/
};

function _txt(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function _isNum(v) { return typeof v === 'number' && isFinite(v); }

/** Teks-teks tidak kosong di kolom kiri (label) beserta indeksnya. */
function _labels(row, maxCol) {
  var out = [];
  for (var i = 0; i < Math.min(row.length, maxCol); i++) {
    var t = _txt(row[i]);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Laporan Ketersediaan Dana Detail (SAKTI).
 * Setiap baris data punya 7 angka di kanan: pagu, lock, realisasi lalu, periode ini, s.d. periode, %, sisa.
 */
function parseRealisasi(rows) {
  var LABEL_COLS = 15;
  var cur = {}, items = [], meta = { periodeTeks: '', satker: '', total: null }, warn = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || [];
    var lab = _labels(row, LABEL_COLS);
    if (!lab.length) continue;
    var first = lab[0];
    if (/^Periode\s+/i.test(first)) { meta.periodeTeks = first; continue; }
    if (/^Satuan Kerja/i.test(first)) { meta.satker = lab.slice(1).join(' '); continue; }

    var nums = [];
    for (var c = LABEL_COLS; c < row.length; c++) if (_isNum(row[c])) nums.push(row[c]);
    if (/^JUMLAH SELURUHNYA/i.test(first) && nums.length >= 7) {
      meta.total = { pagu: nums[0], lock: nums[1], lalu: nums[2], ini: nums[3], sd: nums[4], sisa: nums[6] };
      continue;
    }
    if (nums.length < 7) continue; // judul halaman, catatan kaki, dll.

    var nama = lab[1] || '';
    var m;
    if ((m = first.match(RX.item))) {
      items.push({
        program: cur.program, program_n: cur.program_n, kegiatan: cur.kegiatan, kegiatan_n: cur.kegiatan_n,
        kro: cur.kro, kro_n: cur.kro_n, ro: cur.ro, ro_n: cur.ro_n, komp: cur.komp, komp_n: cur.komp_n,
        sub: cur.sub, sub_n: cur.sub_n, akun: cur.akun, akun_n: cur.akun_n,
        no: m[1], item: m[2].replace(/\s+/g, ' ').trim(),
        pagu: nums[0], lock: nums[1], lalu: nums[2], ini: nums[3], sd: nums[4], sisa: nums[6]
      });
    } else if (RX.akun.test(first)) { cur.akun = first; cur.akun_n = nama; }
    else if (RX.program.test(first)) { cur = { program: first, program_n: nama }; }
    else if ((m = first.match(RX.kegiatan))) { cur.kegiatan = m[1]; cur.kegiatan_n = nama; }
    else if (RX.sub.test(first)) { cur.sub = first; cur.sub_n = nama; }
    else if (RX.ro.test(first)) { cur.ro = first; cur.ro_n = nama; }
    else if (RX.komp.test(first)) { cur.komp = first; cur.komp_n = nama; }
    else if (RX.kro.test(first)) { cur.kro = first; cur.kro_n = nama; }
    else warn.push('Baris ' + (r + 1) + ' tidak dikenali: ' + first.substring(0, 60));
  }
  if (!items.length) throw new Error('Tidak ada item terbaca. Pastikan file adalah "Laporan Ketersediaan Dana Detail" dari SAKTI.');
  // Rekonsiliasi dengan baris JUMLAH SELURUHNYA
  var sum = { pagu: 0, sd: 0 };
  items.forEach(function (it) { sum.pagu += it.pagu; sum.sd += it.sd; });
  meta.cek = meta.total ? {
    selisihPagu: Math.round(sum.pagu - meta.total.pagu),
    selisihRealisasi: Math.round(sum.sd - meta.total.sd)
  } : null;
  if (!meta.total) warn.push('Baris JUMLAH SELURUHNYA tidak ditemukan — total tidak bisa dicocokkan.');
  return { items: items, meta: meta, warnings: warn.slice(0, 20) };
}

/**
 * Rincian Kertas Kerja Satker (SAKTI) — hanya diambil sumber dana per akun.
 * Kunci: program|kro|ro|sub|akun  (sama dengan kode di laporan realisasi).
 */
function parseRKK(rows) {
  var cur = {}, map = {}, n = 0;
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || [];
    var a = _txt(row[0]);
    if (!a) continue;
    var m;
    if ((m = a.match(/^\d{3}\.\d{2}\.([A-Z]{2})$/))) cur = { program: m[1] };
    else if (/^\d{4}$/.test(a)) cur.kegiatan = a;
    else if ((m = a.match(/^\d{4}\.([A-Z0-9]{3})$/))) cur.kro = m[1];
    else if ((m = a.match(/^\d{4}\.([A-Z0-9]{3}\.\d{3})$/))) cur.ro = m[1];
    else if (/^\d{6}$/.test(a)) {
      var sd = '';
      for (var c = 1; c < row.length; c++) {
        var t = _txt(row[c]);
        if (/^(RM|PNP|PNBP|BLU|PLN|HLN|SBSN)$/.test(t)) sd = t;
      }
      var key = [cur.program, cur.kro, cur.ro, cur.sub, a].join('|');
      if (sd) { map[key] = sd; n++; }
    }
    else if (/^\d{3}$/.test(a)) cur.komp = a;
    else if (/^[A-Z0-9]{1,2}$/.test(a)) cur.sub = cur.komp + '.' + (a.length === 1 ? '0' + a : a);
  }
  if (!n) throw new Error('Tidak ada akun terbaca. Pastikan file adalah "Rincian Kertas Kerja Satker" dari SAKTI.');
  return { map: map, count: n };
}


/* ===== tampilan & perhitungan ===== */
/* ================= util ================= */
function $(id){ return document.getElementById(id); }
var nf = new Intl.NumberFormat('id-ID');
function rp(v){ return nf.format(Math.round(v||0)); }
function rpk(v){ var a=Math.abs(v||0), s=v<0?'−':'';
  if (a>=1e9) return s+'Rp '+(a/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';
  if (a>=1e6) return s+'Rp '+(a/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';
  return s+'Rp '+nf.format(Math.round(a)); }
function pc(v,d){ d=d==null?1:d; return ((v||0)*100).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d})+'%'; }
function poin(v){ return (v>=0?'+':'−')+Math.abs(v*100).toLocaleString('id-ID',{maximumFractionDigits:1})+' poin'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
var BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function tgl(p){ if(!p) return ''; var a=p.split('-'); return (+a[2])+' '+BLN[+a[1]-1]+' '+a[0]; }
function tglPendek(p){ return tgl(p).replace(/ \d{4}$/,''); }
function yearFrac(p){ var a=p.split('-').map(Number); var d=Date.UTC(a[0],a[1]-1,a[2]),s=Date.UTC(a[0],0,1),e=Date.UTC(a[0]+1,0,1); return ((d-s)/864e5+1)/((e-s)/864e5); }
function endPrevMonth(p){ var a=p.split('-').map(Number); var d=new Date(Date.UTC(a[0],a[1]-1,0)); return d.toISOString().slice(0,10); }
function sum(rows){ var t={pagu:0,lock:0,lalu:0,ini:0,sd:0,sisa:0,n:0,n0:0}; rows.forEach(function(r){ t.pagu+=r.pagu;t.lock+=r.lock;t.lalu+=r.lalu;t.ini+=r.ini;t.sd+=r.sd;t.sisa+=r.sisa;t.n++; if(r.sd===0&&r.pagu>0)t.n0++; }); t.p=t.pagu?t.sd/t.pagu:0; return t; }
function group(rows, fn){ var m={},o=[]; rows.forEach(function(r){ var k=fn(r); if(!m[k]){m[k]=[];o.push(k);} m[k].push(r); }); return o.map(function(k){ var s=sum(m[k]); s.key=k; s.rows=m[k]; return s; }); }
function toast(msg, html){ var t=$('toast'); if(html) t.innerHTML=msg; else t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(function(){t.hidden=true;},8000); }
function errMsg(e){ return String((e && e.message) || (e && e.error_description) || e); }

/* ================= konstanta ================= */
var SRC = {RM:'Rupiah Murni', PNP:'PNBP'};
var FAK_ORDER = ['FTIK','FEBI','FASYA','FUAD','Pascasarjana'];
var FAK_FULL = {FTIK:'Fakultas Tarbiyah dan Ilmu Keguruan',FEBI:'Fakultas Ekonomi dan Bisnis Islam',FASYA:'Fakultas Syariah',FUAD:'Fakultas Ushuluddin, Adab dan Dakwah',Pascasarjana:'Pascasarjana'};
var BOOT=null, DB=null, ALL=[], D=null, WAKTU=0, AK={};
function A2(k){ return AK[k]||('Akun '+k); }
function A3(k){ return AK[k]||''; }
function subName(r){ return D.sub[r.ro+'|'+r.sub]||''; }
function status(p,w){ if(p>1.0001) return ['st-crit','Melebihi pagu']; var d=p-w; if(d>=-0.05) return ['st-good','Sesuai jadwal']; if(d>=-0.20) return ['st-warn','Perlu percepatan']; return ['st-crit','Tertinggal jauh']; }
function pill(p){ var s=status(p,WAKTU); return '<span class="pill '+s[0]+'"><i></i>'+s[1]+'</span>'; }

/* ================= state ================= */
var EMPTY_F = function(){ return {prog:'',keg:'',kro:'',ro:'',komp:'',sub:'',unit:'',sumber:'',a2:'',a3:'',noGaji:false}; };
var S = { page:'ringkasan', open:{}, q:'', pg:0, f:EMPTY_F(), trend:{}, cmp:null, cmpKey:'', admin:null };
try { var sv=JSON.parse(localStorage.getItem('dasbor-v2')||'null'); if(sv&&sv.page) S.page=sv.page; } catch(e){}
function persist(){ try{ localStorage.setItem('dasbor-v2', JSON.stringify({page:S.page})); }catch(e){} }
function sess(){ return BOOT.session; }
function isAdmin(){ return sess().role==='ADMIN'; }
function isUnitUser(){ return !sess().all; }
function scopeLabel(s){ return s.unit || ('Seluruh '+s.kat); }
function scoped(){ return ALL; } // data sudah disaring server sesuai hak akses
var CHAIN=['prog','keg','kro','ro','komp','sub'];
function applyF(rows, upto){
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
function rows(){ return applyF(scoped()); }
function unitCaption(){
  if (S.f.unit){ var u=S.f.unit.split('|'); return u[1]||('Semua '+u[0]); }
  if (isUnitUser()) return sess().scopes.map(scopeLabel).join(', ');
  return 'seluruh satker';
}
function scopeText(){
  var f=S.f, parts=[unitCaption()];
  CHAIN.forEach(function(k){ if(f[k]) parts.push(FLABEL[k]+' '+f[k]); });
  if (f.sumber) parts.push(SRC[f.sumber]); if (f.a2) parts.push('Akun '+f.a2); if (f.a3) parts.push('Akun '+f.a3);
  if (f.noGaji) parts.push('tanpa gaji & operasional kantor');
  return parts.join(' · ');
}

/* ================= filter ================= */
var FLABEL = {prog:'Program',keg:'Kegiatan',kro:'KRO',ro:'RO',komp:'Komponen',sub:'Sub Komponen'};
function optName(k,v,r){
  var m={prog:D.program,keg:D.kegiatan,kro:D.kro,ro:D.ro,komp:D.komp}[k];
  if (m) return v+' — '+(m[v]||'');
  if (k==='sub') return v+' — '+subName(r);
  return v;
}
function renderFilters(){
  var base=scoped(), f=S.f, h='';
  CHAIN.forEach(function(k,i){
    var pool=applyF(base,i), seen={}, opts=[];
    pool.forEach(function(r){ if(!seen[r[k]]){ seen[r[k]]=1; opts.push({v:r[k],t:optName(k,r[k],r)}); } });
    opts.sort(function(a,b){ return a.v<b.v?-1:1; });
    if (f[k] && !seen[f[k]]) f[k]='';
    h+='<label class="f'+(k==='sub'?' wide':'')+'" for="f_'+k+'">'+FLABEL[k]+'<select id="f_'+k+'" data-k="'+k+'"><option value="">Semua '+FLABEL[k]+'</option>'+
      opts.map(function(o){ return '<option value="'+esc(o.v)+'"'+(o.v===f[k]?' selected':'')+'>'+esc(o.t)+'</option>'; }).join('')+'</select></label>';
  });
  var units={Fakultas:{},Rektorat:{}};
  base.forEach(function(r){ (units[r.kat]=units[r.kat]||{})[r.unit]=1; });
  if (isUnitUser()){
    var sc=sess().scopes;
    if (sc.length===1 && sc[0].unit){
      h+='<label class="f" for="f_unit">Unit kerja<select id="f_unit" disabled><option>'+esc(sc[0].unit)+'</option></select></label>';
    } else {
      var opts2=[];
      sc.forEach(function(s){ if(s.unit) opts2.push([s.kat+'|'+s.unit,s.unit]); else { opts2.push([s.kat+'|','Semua '+s.kat]); Object.keys(units[s.kat]||{}).sort().forEach(function(u){ opts2.push([s.kat+'|'+u,u]); }); } });
      h+='<label class="f" for="f_unit">Unit kerja<select id="f_unit" data-k="unit"><option value="">Semua cakupan saya</option>'+opts2.map(function(o){return '<option value="'+esc(o[0])+'"'+(f.unit===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';
    }
  } else {
    var fk=FAK_ORDER.filter(function(u){return units.Fakultas[u];}).concat(Object.keys(units.Fakultas).filter(function(u){return FAK_ORDER.indexOf(u)<0;}));
    var rk=Object.keys(units.Rektorat||{}).sort();
    h+='<label class="f" for="f_unit">Unit kerja<select id="f_unit" data-k="unit"><option value="">Semua unit</option>'+
      '<optgroup label="Fakultas"><option value="Fakultas|"'+(f.unit==='Fakultas|'?' selected':'')+'>Semua fakultas</option>'+fk.map(function(u){return '<option value="Fakultas|'+esc(u)+'"'+(f.unit==='Fakultas|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup>'+
      '<optgroup label="Rektorat"><option value="Rektorat|"'+(f.unit==='Rektorat|'?' selected':'')+'>Semua Rektorat</option>'+rk.map(function(u){return '<option value="Rektorat|'+esc(u)+'"'+(f.unit==='Rektorat|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup></select></label>';
  }
  h+='<label class="f" for="f_sumber">Sumber dana<select id="f_sumber" data-k="sumber"><option value="">RM &amp; PNBP</option><option value="RM"'+(f.sumber==='RM'?' selected':'')+'>Rupiah Murni (RM)</option><option value="PNP"'+(f.sumber==='PNP'?' selected':'')+'>PNBP</option></select></label>';
  var a2s={}; base.forEach(function(r){a2s[r.a2]=1;});
  h+='<label class="f" for="f_a2">Jenis belanja<select id="f_a2" data-k="a2"><option value="">Semua jenis</option>'+Object.keys(a2s).sort().map(function(k){return '<option value="'+k+'"'+(f.a2===k?' selected':'')+'>'+k+' '+esc(A2(k))+'</option>';}).join('')+'</select></label>';
  var a3s={}; base.forEach(function(r){ if(!f.a2||r.a2===f.a2) a3s[r.a3]=1; });
  if (f.a3 && !a3s[f.a3]) f.a3='';
  h+='<label class="f" for="f_a3">Akun 3 digit<select id="f_a3" data-k="a3"><option value="">Semua akun</option>'+Object.keys(a3s).sort().map(function(k){return '<option value="'+k+'"'+(f.a3===k?' selected':'')+'>'+k+' '+esc(A3(k))+'</option>';}).join('')+'</select></label>';
  h+='<label class="toggle" for="f_nogaji"><input type="checkbox" id="f_nogaji"'+(f.noGaji?' checked':'')+'>Tanpa gaji &amp; operasional kantor</label>';
  h+='<div class="noprint" style="padding-bottom:4px"><button class="btn" type="button" id="btnReset">Atur ulang filter</button></div>';
  $('filters').innerHTML=h;
  [].forEach.call($('filters').querySelectorAll('select[data-k]'), function(s){
    s.onchange=function(){ var k=s.dataset.k; S.f[k]=s.value; var i=CHAIN.indexOf(k); if(i>=0) for(var j=i+1;j<CHAIN.length;j++) S.f[CHAIN[j]]=''; if(k==='a2') S.f.a3=''; S.pg=0; S.cmp=null; refresh(); };
  });
  $('f_nogaji').onchange=function(){ S.f.noGaji=this.checked; S.cmp=null; refresh(); };
  $('btnReset').onclick=function(){ S.f=EMPTY_F(); S.cmp=null; refresh(); };
  var chips=[];
  if (isUnitUser()) chips.push('<span class="chip lock">Akses: '+esc(sess().scopes.map(scopeLabel).join(', '))+'</span>');
  CHAIN.forEach(function(k){ if(f[k]) chips.push('<span class="chip">'+FLABEL[k]+' '+esc(f[k])+'</span>'); });
  if (f.unit) chips.push('<span class="chip">'+esc(unitCaption())+'</span>');
  if (f.sumber) chips.push('<span class="chip">'+SRC[f.sumber]+'</span>');
  if (f.a2) chips.push('<span class="chip">Akun '+f.a2+'</span>');
  if (f.a3) chips.push('<span class="chip">Akun '+f.a3+'</span>');
  if (f.noGaji) chips.push('<span class="chip">Tanpa gaji &amp; operasional kantor</span>');
  $('scope').innerHTML='<span>Cakupan:</span>'+(chips.length?chips.join(''):'<span class="chip">Seluruh satker</span>')+'<span style="margin-left:auto">Posisi '+tgl(DB.periode)+' · waktu berjalan '+pc(WAKTU)+'</span>';
}

/* ================= komponen UI ================= */
var IC = {
  pdf:'<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>',
  print:'<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.5-.2 4.4 1.4 5 4.8"/></svg>',
  box:'<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/></svg>',
  build:'<svg viewBox="0 0 24 24"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>'
};
function actions(id,title){ return '<div class="card-a" data-html2canvas-ignore="true"><button class="icon" type="button" data-pdf="'+id+'" data-title="'+esc(title)+'" aria-label="Unduh PDF '+esc(title)+'" title="Unduh PDF">'+IC.pdf+'</button><button class="icon" type="button" data-print="'+id+'" aria-label="Cetak '+esc(title)+'" title="Cetak">'+IC.print+'</button></div>'; }
function card(id,title,sub,body){
  return '<section class="glass card" id="'+id+'"><div class="card-h"><div><h2>'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+actions(id,title.replace(/&amp;/g,'&'))+'</div>'+body+'</section>';
}
var tip=$('tip');
function showTip(e,html){ tip.innerHTML=html; tip.style.display='block'; var x=e.clientX+14,y=e.clientY+14,w=tip.offsetWidth,h=tip.offsetHeight; if(x+w>innerWidth-8)x=e.clientX-w-14; if(y+h>innerHeight-8)y=e.clientY-h-14; tip.style.left=x+'px'; tip.style.top=y+'px'; }
function hideTip(){ tip.style.display='none'; }
function tipOf(name,t){ return '<b>'+esc(name)+'</b><div class="num">Pagu&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.pagu)+'<br>Realisasi Rp '+rp(t.sd)+' ('+pc(t.p)+')<br>Periode ini Rp '+rp(t.ini)+'<br>Sisa&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.sisa)+'</div>'; }
var TIPS=[];
function tipAttr(html){ TIPS.push(html); return ' data-tip="'+(TIPS.length-1)+'"'; }
function track(p,color){ return '<span class="track"><span class="fill" style="width:'+Math.min(100,Math.max(0,p*100))+'%;background:'+(p>1.0001?'var(--crit)':color)+'"></span><span class="mark" style="left:calc('+(WAKTU*100)+'% - 1px)"></span></span>'; }
function printHead(title){ return '<div class="printhead"><b>'+esc(BOOT.satker)+' · Satker '+esc(BOOT.kode)+'</b>'+esc(title)+' · Posisi data '+tgl(DB.periode)+'<br>Cakupan: '+esc(scopeText())+' · Dicetak '+new Date().toLocaleString('id-ID')+' oleh '+esc(sess().email)+' · Sumber: Laporan Ketersediaan Dana Detail (SAKTI)</div>'; }

/* ================= RINGKASAN ================= */
function gauge(p){
  var R=92, Cc=2*Math.PI*R, arc=Math.min(1,Math.max(0,p));
  var ang=(-90+360*WAKTU)*Math.PI/180, cx=120, cy=120;
  var pt=function(r){ return [(cx+r*Math.cos(ang)).toFixed(1),(cy+r*Math.sin(ang)).toFixed(1)]; };
  var a=pt(R-15), b=pt(R+15), l=pt(R+30);
  return '<svg viewBox="-10 -10 260 260" role="img" aria-label="Realisasi '+pc(p)+' dibanding waktu berjalan '+pc(WAKTU)+'">'+
    '<circle cx="120" cy="120" r="'+R+'" fill="none" stroke="var(--track)" stroke-width="18"/>'+
    '<circle cx="120" cy="120" r="'+R+'" fill="none" stroke="'+(p>1.0001?'var(--crit)':'var(--real)')+'" stroke-width="18" stroke-linecap="round" stroke-dasharray="'+(Cc*arc).toFixed(1)+' '+Cc.toFixed(1)+'" transform="rotate(-90 120 120)"/>'+
    '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>'+
    '<text x="'+l[0]+'" y="'+(+l[1]+4)+'" text-anchor="'+(Math.cos(ang)<0?'end':'start')+'" font-size="11" font-weight="600" fill="var(--ink2)">waktu '+pc(WAKTU)+'</text>'+
    '<text x="120" y="122" text-anchor="middle" font-size="40" font-weight="700" fill="var(--ink)" style="font-family:var(--mono);letter-spacing:-.04em">'+pc(p)+'</text>'+
    '<text x="120" y="146" text-anchor="middle" font-size="12" fill="var(--muted)">terealisasi dari pagu</text></svg>';
}
function renderRingkasan(){
  var R=rows(), t=sum(R);
  var h='<div class="page-sec grid">'+printHead('Ringkasan Realisasi');
  h+='<section class="glass hero" id="c-hero"><div>'+
    '<div class="card-h" style="margin:0"><div class="eyebrow">Pagu induk · '+esc(unitCaption())+'</div>'+actions('c-hero','Ringkasan pagu induk')+'</div>'+
    '<div class="big"><small>Rp</small>'+rp(t.pagu)+'</div>'+
    '<div class="spell">≈ '+rpk(t.pagu)+' · pagu revisi yang berlaku per '+tgl(DB.periode)+'</div>'+
    '<div class="stats">'+
      '<div class="stat"><div class="l">Realisasi s.d. '+tglPendek(DB.periode)+'</div><div class="v">'+rpk(t.sd)+'</div><div class="d">Rp '+rp(t.sd)+'</div></div>'+
      '<div class="stat"><div class="l">Realisasi periode ini</div><div class="v">'+rpk(t.ini)+'</div><div class="d">'+poin(t.pagu?t.ini/t.pagu:0)+'</div></div>'+
      '<div class="stat"><div class="l">Sisa anggaran</div><div class="v">'+rpk(t.sisa)+'</div><div class="d">'+pc(t.pagu?t.sisa/t.pagu:0)+' dari pagu</div></div>'+
      '<div class="stat"><div class="l">Lock pagu</div><div class="v">'+rpk(t.lock)+'</div><div class="d">dalam proses revisi</div></div>'+
    '</div></div>'+
    '<div class="gauge">'+gauge(t.p)+pill(t.p)+
      '<div class="gauge-legend"><span><i class="sw" style="background:var(--real)"></i>Realisasi</span><span><i class="sw tick"></i>Waktu berjalan</span></div>'+
      (isUnitUser()?'<div class="note">Pembanding: capaian satker '+pc(DB.satkerPersen)+'</div>':'')+
    '</div></section>';

  var bySrc=group(R,function(r){return r.sumber||'?';}).sort(function(a,b){return b.pagu-a.pagu;});
  var srcCol=function(k){ return k==='RM'?'var(--rm)':k==='PNP'?'var(--pnbp)':'var(--muted)'; };
  var srcName=function(k){ return SRC[k]||'Belum dipetakan'; };
  var srcBody='<div class="split" role="img" aria-label="Komposisi pagu per sumber dana">'+bySrc.map(function(s){ var w=t.pagu?s.pagu/t.pagu:0;
      return '<div style="flex:'+Math.max(w,0.0001)+';background:'+srcCol(s.key)+'"'+tipAttr(tipOf(srcName(s.key),s))+'>'+(w>0.14?srcName(s.key)+' · '+pc(w):'')+'</div>'; }).join('')+'</div>'+
    bySrc.map(function(s){
      return '<div class="src-row"'+tipAttr(tipOf(srcName(s.key),s))+'><span class="nm"><i class="dot" style="background:'+srcCol(s.key)+'"></i>'+srcName(s.key)+'</span>'+track(s.p,srcCol(s.key))+'<span class="pct">'+pc(s.p)+'</span>'+
        '<div class="meta"><span>Pagu <b class="num">'+rpk(s.pagu)+'</b> · '+pc(t.pagu?s.pagu/t.pagu:0)+' dari pagu induk</span><span>Realisasi '+rpk(s.sd)+' · sisa '+rpk(s.sisa)+'</span></div></div>';
    }).join('');
  var byA2=group(R,function(r){return r.a2;}).sort(function(a,b){return a.key<b.key?-1:1;});
  var icons={'51':IC.people,'52':IC.box,'53':IC.build};
  var typesBody='<div class="types">'+byA2.map(function(g){
      var rm=sum(g.rows.filter(function(r){return r.sumber==='RM';})), pn=sum(g.rows.filter(function(r){return r.sumber==='PNP';}));
      return '<button type="button" class="type" data-goa2="'+g.key+'"'+tipAttr(tipOf(g.key+' '+A2(g.key),g))+'><span class="ic">'+(icons[g.key]||IC.box)+'</span>'+
        '<span class="code">Akun '+g.key+'</span><span class="nm">'+esc(A2(g.key))+'</span>'+
        '<span class="share">'+pc(t.pagu?g.pagu/t.pagu:0)+' <small>dari pagu induk</small></span>'+
        '<span class="num" style="font-size:12px;color:var(--ink2)">'+rpk(g.pagu)+'</span>'+
        '<span class="mini-split" aria-hidden="true"><i style="flex:'+rm.pagu+';background:var(--rm)"></i><i style="flex:'+pn.pagu+';background:var(--pnbp)"></i></span>'+
        '<span style="font-size:11.5px;color:var(--muted)">RM '+rpk(rm.pagu)+' · PNBP '+rpk(pn.pagu)+'</span>'+
        '<span style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><span style="font-size:12px;color:var(--ink2)">Realisasi</span><span class="pct">'+pc(g.p)+'</span></span>'+
        track(g.p,'var(--real)')+'</button>'; }).join('')+'</div>';
  h+='<div class="two">'+card('c-src','Pagu induk per sumber dana','Porsi terhadap pagu induk dan capaian realisasi masing-masing sumber dana.',srcBody)+
    card('c-type','Pagu induk per jenis belanja','Akun 51, 52, 53 — bilah tipis menunjukkan pembagian RM dan PNBP. Klik untuk merinci.',typesBody)+'</div>';

  var cells=[]; byA2.forEach(function(g){ ['RM','PNP'].forEach(function(s){ cells.push(sum(g.rows.filter(function(r){return r.sumber===s;}))); }); });
  var max=Math.max.apply(null,cells.map(function(c){return c.pagu;}).concat([1]));
  var jBody='<div class="legend"><span><i class="sw ghost" style="background:var(--rm)"></i><i class="sw" style="background:var(--rm);margin-left:-4px"></i>RM — pagu (pudar) &amp; realisasi</span><span><i class="sw ghost" style="background:var(--pnbp)"></i><i class="sw" style="background:var(--pnbp);margin-left:-4px"></i>PNBP — pagu (pudar) &amp; realisasi</span></div><div class="jchart">'+
    byA2.map(function(g){
      return '<div class="jrow"><div class="lab"><b>'+g.key+' · '+esc(A2(g.key))+'</b><span>Pagu '+rpk(g.pagu)+' · realisasi '+pc(g.p)+'</span></div><div class="jbars">'+
        ['RM','PNP'].map(function(s){ var c=sum(g.rows.filter(function(r){return r.sumber===s;})), col=s==='RM'?'rm':'pnbp', lab=s==='RM'?'RM':'PNBP';
          if (!c.pagu) return '<div class="jbar none"><span class="tag">'+lab+'</span><span class="bar"></span><span class="val">tidak ada pagu</span></div>';
          return '<div class="jbar"'+tipAttr(tipOf(g.key+' '+A2(g.key)+' · '+SRC[s],c))+'><span class="tag">'+lab+'</span><span class="bar"><span class="p" style="width:'+(c.pagu/max*100)+'%;background:var(--'+col+')"></span><span class="r" style="width:'+(Math.min(c.sd,c.pagu)/max*100)+'%;background:var(--'+col+')"></span></span>'+
            '<span class="val"><b>'+rpk(c.sd)+'</b> / '+rpk(c.pagu)+' · <b>'+pc(c.p)+'</b></span></div>';
        }).join('')+'</div></div>';
    }).join('')+'</div>';
  h+=card('c-jenis','Pagu &amp; realisasi per jenis belanja menurut sumber dana','Bilah pudar = pagu, bilah pekat = realisasi. Skala sama untuk semua baris.',jBody);

  var unitBody, multiUnit=group(R,function(r){return r.kat+'|'+r.unit;}).length>1;
  var legend='<div class="legend"><span><i class="sw" style="background:var(--real)"></i>Realisasi</span><span><i class="sw tick"></i>Waktu berjalan '+pc(WAKTU)+'</span></div>';
  if (multiUnit){
    var gu=group(R,function(r){return r.kat+'|'+r.unit;});
    var fak=gu.filter(function(g){return g.key.indexOf('Fakultas|')===0;}).sort(function(a,b){return FAK_ORDER.indexOf(a.key.split('|')[1])-FAK_ORDER.indexOf(b.key.split('|')[1]);});
    var rek=gu.filter(function(g){return g.key.indexOf('Fakultas|')!==0;}).sort(function(a,b){return b.pagu-a.pagu;});
    var ub=function(g){ var n=g.key.split('|')[1]; return '<div class="ubar"'+tipAttr(tipOf(n+(FAK_FULL[n]?' — '+FAK_FULL[n]:''),g))+'><span class="n">'+esc(n)+' <span class="note num">'+rpk(g.pagu)+'</span></span>'+track(g.p,'var(--real)')+'<span class="pct">'+pc(g.p)+'</span></div>'; };
    var fs=sum([].concat.apply([],fak.map(function(g){return g.rows;}))), rs=sum([].concat.apply([],rek.map(function(g){return g.rows;})));
    unitBody=legend+'<div class="ubars">'+(fak.length?'<div class="sec">Fakultas · '+rpk(fs.pagu)+' · '+pc(fs.p)+'</div>'+fak.map(ub).join(''):'')+
      (rek.length?'<div class="sec">Rektorat · '+rpk(rs.pagu)+' · '+pc(rs.p)+'</div>'+rek.map(ub).join(''):'')+'</div>';
  } else {
    var gk=group(R,function(r){return r.komp;}).sort(function(a,b){return a.key<b.key?-1:1;});
    unitBody=legend+'<div class="ubars">'+gk.map(function(g){ return '<div class="ubar"'+tipAttr(tipOf(g.key+' '+D.komp[g.key],g))+'><span class="n">'+g.key+' '+esc(D.komp[g.key])+'</span>'+track(g.p,'var(--real)')+'<span class="pct">'+pc(g.p)+'</span></div>'; }).join('')+'</div>';
  }
  h+='<div class="two">'+card('c-unit',multiUnit?'Capaian per unit kerja':'Capaian per komponen',multiUnit?'Fakultas dan sub-unit Rektorat. Gaji & operasional kantor termasuk Rektorat — centang filter untuk mengecualikannya.':'Komponen anggaran dalam cakupan '+esc(unitCaption())+'.',unitBody)+
    card('c-tren','Tren penyerapan','Realisasi kumulatif setiap posisi data dibanding garis ideal penyerapan merata sepanjang tahun.','<div id="trendBox" class="trend"><div class="loading" style="padding:30px 0">Memuat tren…</div></div>')+'</div>';

  var minus=R.filter(function(r){return r.sisa<0;}), ms=sum(minus);
  var gs=group(R,function(r){return r.ro+'|'+r.sub;}), s0=gs.filter(function(g){return g.sd===0&&g.pagu>0;});
  var lowK=group(R,function(r){return r.komp;}).filter(function(g){return g.pagu>=1e8;}).sort(function(a,b){return a.p-b.p;})[0];
  h+=card('c-alert','Perlu perhatian','Hal yang memerlukan tindak lanjut. Rincian lengkap di menu Perlu Perhatian.',
    '<div class="alerts">'+
      '<div class="alert"><span class="pill '+(minus.length?'st-crit':'st-good')+'"><i></i>'+(minus.length?'Pagu minus':'Tidak ada pagu minus')+'</span><span class="v">'+(minus.length?rpk(-ms.sisa):'Rp 0')+'</span><span class="t">'+minus.length+' detail realisasi melebihi pagu'+(minus.length?' — perlu revisi DIPA':'')+'</span></div>'+
      '<div class="alert"><span class="pill st-warn"><i></i>Belum terealisasi</span><span class="v">'+rp(t.n0)+' detail</span><span class="t">pagu '+rpk(sum(R.filter(function(r){return r.sd===0&&r.pagu>0;})).pagu)+' belum diserap sama sekali</span></div>'+
      '<div class="alert"><span class="pill st-warn"><i></i>Sub komponen 0%</span><span class="v">'+s0.length+' dari '+gs.length+'</span><span class="t">sub komponen belum ada realisasi</span></div>'+
      (lowK?'<div class="alert"><span class="pill '+status(lowK.p,WAKTU)[0]+'"><i></i>Komponen terendah</span><span class="v">'+pc(lowK.p)+'</span><span class="t">'+lowK.key+' '+esc(D.komp[lowK.key])+' · sisa '+rpk(lowK.sisa)+'</span></div>':'')+
    '</div>');
  return h+'</div>';
}
function trendKey(){ return JSON.stringify(S.f); }
function loadTrend(){
  var box=$('trendBox'); if(!box) return;
  var key=trendKey();
  if (S.trend[key]) { box.innerHTML=trendSvg(S.trend[key]); bindTips(box); return; }
  SB.tren().then(function(list){ S.trend[key]=list; var b=$('trendBox'); if(b && trendKey()===key){ b.innerHTML=trendSvg(list); bindTips(b); } })
    .catch(function(e){ var b=$('trendBox'); if(b) b.innerHTML='<p class="note">Tren tidak dapat dimuat: '+esc(errMsg(e))+'</p>'; });
}
function trendSvg(list){
  var t=sum(rows());
  var pts=list.filter(function(x){return x.periode.slice(0,4)===DB.periode.slice(0,4) && x.periode<=DB.periode;})
    .map(function(x){ return {f:yearFrac(x.periode),v:x.pagu?x.sd/x.pagu:0,l:'s.d. '+tgl(x.periode),sd:x.sd,pagu:x.pagu,d:x.periode}; });
  var extra=false;
  if (pts.length<2){ var pl=endPrevMonth(DB.periode); pts.unshift({f:yearFrac(pl),v:t.pagu?t.lalu/t.pagu:0,l:'s.d. '+tgl(pl)+' (periode lalu)',sd:t.lalu,pagu:t.pagu,d:pl}); extra=true; }
  var W=560,H=250,L=44,Rt=18,T=16,B=34;
  var X=function(f){return L+f*(W-L-Rt);}, Y=function(v){return T+(1-Math.min(v,1.1)/1.1*1.0)*(H-T-B);};
  Y=function(v){ return T+(1-Math.min(Math.max(v,0),1))*(H-T-B); };
  var g='';
  [0,.25,.5,.75,1].forEach(function(v){ g+='<line x1="'+L+'" x2="'+(W-Rt)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-8)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+(v*100)+'%</text>'; });
  ['Jan','Mar','Mei','Jul','Sep','Nov'].forEach(function(m,i){ g+='<text x="'+X(i*2/12)+'" y="'+(H-12)+'" text-anchor="'+(i===0?'start':'middle')+'">'+m+'</text>'; });
  g+='<line x1="'+X(0)+'" y1="'+Y(0)+'" x2="'+X(1)+'" y2="'+Y(1)+'" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 5"/><text x="'+(X(1)-4)+'" y="'+(Y(1)+18)+'" text-anchor="end">ideal merata</text>';
  var all=[{f:0,v:0}].concat(pts), lastP=pts[pts.length-1];
  g+='<path d="M'+X(0)+' '+Y(0)+' '+all.map(function(p){return 'L'+X(p.f).toFixed(1)+' '+Y(p.v).toFixed(1);}).join(' ')+' L'+X(lastP.f).toFixed(1)+' '+Y(0)+' Z" fill="var(--real)" opacity=".12"/>';
  g+='<polyline points="'+all.map(function(p){return X(p.f).toFixed(1)+','+Y(p.v).toFixed(1);}).join(' ')+'" fill="none" stroke="var(--real)" stroke-width="2.5" stroke-linejoin="round"/>';
  g+='<line x1="'+X(lastP.f)+'" x2="'+X(lastP.f)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--line-strong)" stroke-width="1"/>';
  pts.forEach(function(p,i){
    var last=i===pts.length-1;
    g+='<circle cx="'+X(p.f).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="'+(last?6:4)+'" fill="var(--real)" stroke="var(--glass-strong)" stroke-width="2"'+tipAttr('<b>'+esc(p.l)+'</b><div class="num">Realisasi Rp '+rp(p.sd)+'<br>Pagu&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(p.pagu)+'<br>Capaian '+pc(p.v)+' · ideal '+pc(p.f)+'</div>')+'/>';
    if (last) g+='<text class="lbl" x="'+(X(p.f)+10).toFixed(1)+'" y="'+(Y(p.v)+4).toFixed(1)+'">'+pc(p.v)+' <tspan style="font:500 10.5px var(--sans);fill:var(--muted)">'+tglPendek(p.d)+'</tspan></text>';
    else if (i===pts.length-2) g+='<text class="lbl" x="'+(X(p.f)-10).toFixed(1)+'" y="'+(Y(p.v)+18).toFixed(1)+'" text-anchor="end">'+pc(p.v)+' <tspan style="font:500 10.5px var(--sans);fill:var(--muted)">'+tglPendek(p.d)+'</tspan></text>';
  });
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Tren penyerapan kumulatif">'+g+'</svg>'+
    '<p class="note">'+(extra?'Titik '+tgl(endPrevMonth(DB.periode))+' diambil dari kolom Realisasi Periode Lalu. ':'')+'Titik baru bertambah setiap kali laporan diunggah.</p>';
}

/* ================= TABEL BERTINGKAT ================= */
var TREES={};
function tree(id,R,levels){
  var root={id:id,children:[],rows:R};
  (function build(node,depth){
    if (depth>=levels.length){ node.leaf=true; return; }
    var L=levels[depth], m={}, order=[];
    node.rows.forEach(function(r){ var k=L.key(r); if(!m[k]){m[k]=[];order.push(k);} m[k].push(r); });
    if (L.sort) order.sort(L.sort); else order.sort();
    node.children=order.map(function(k){ var n={id:node.id+'/'+k,key:k,rows:m[k],depth:depth,lvl:L.lvl,label:L.label(k,m[k][0])}; n.t=sum(m[k]); return n; });
    node.children.forEach(function(c){ build(c,depth+1); });
  })(root,0);
  var out=[];
  var cols=function(t){ return '<td class="n">'+rp(t.pagu)+'</td><td class="n">'+rp(t.sd)+'</td><td class="n">'+rp(t.ini)+'</td><td class="n">'+pc(t.p)+'<span class="minibar"><b style="width:'+Math.min(100,t.p*100)+'%;'+(t.p>1.0001?'background:var(--crit)':'')+'"></b></span></td><td class="n'+(t.sisa<0?' neg':'')+'">'+rp(t.sisa)+'</td><td>'+pill(t.p)+'</td>'; };
  (function walk(n){
    n.children.forEach(function(c){
      var open=!!S.open[c.id], ind=c.depth*18;
      out.push('<tr class="tree l'+c.depth+'"><td><span class="tw" style="padding-left:'+ind+'px"><button type="button" data-tog="'+esc(c.id)+'" aria-expanded="'+open+'" aria-label="Buka atau tutup">'+IC.chev+'</button><span class="lvl">'+c.lvl+'</span> '+c.label+'</span></td>'+cols(c.t)+'</tr>');
      if (!open) return;
      if (c.leaf) c.rows.slice().sort(function(a,b){return a.no<b.no?-1:1;}).forEach(function(r){
        out.push('<tr class="leaf"><td><span style="padding-left:'+(ind+44)+'px;display:inline-block;white-space:normal;max-width:560px"><span class="code">'+esc(r.no)+'</span> '+esc(r.item)+' <span class="chip" style="font-size:10.5px;padding:1px 7px">'+(r.sumber==='PNP'?'PNBP':(r.sumber||'?'))+'</span></span></td>'+cols(sum([r]))+'</tr>');
      }); else walk(c);
    });
  })(root);
  return '<div class="tools noprint" style="margin-bottom:10px"><button class="btn" type="button" data-openall="'+id+'">Buka satu tingkat</button><button class="btn" type="button" data-closeall="'+id+'">Tutup semua</button></div>'+
    '<div class="tbl"><table><thead><tr><th>Uraian</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">Periode ini</th><th class="n">%</th><th class="n">Sisa</th><th>Status</th></tr></thead><tbody>'+out.join('')+
    '<tr class="tot"><td>Jumlah</td>'+cols(sum(R))+'</tr></tbody></table></div>';
}
function treeCard(id,title,sub,R,levels){ TREES[id]={rows:R,levels:levels}; return card(id,title,sub,tree(id,R,levels)); }
function openLevel(id){
  var T=TREES[id]; if(!T) return;
  var ids={}; Object.keys(S.open).forEach(function(k){ if(S.open[k]&&k.indexOf(id+'/')===0) ids[k]=1; });
  // buka tingkat berikutnya dari yang sudah terbuka paling dalam
  var depthOpen=0; Object.keys(ids).forEach(function(k){ depthOpen=Math.max(depthOpen,k.split('/').length-1); });
  var d=Math.min(depthOpen,T.levels.length-1);
  T.rows.forEach(function(r){ var p=id; for(var i=0;i<=d;i++){ p+='/'+T.levels[i].key(r); if(i===d) S.open[p]=true; else if(!S.open[p]) return; } });
}
var LV={
  prog:{lvl:'Program',key:function(r){return r.prog;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.program[k]);}},
  keg:{lvl:'Kegiatan',key:function(r){return r.keg;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.kegiatan[k]);}},
  kro:{lvl:'KRO',key:function(r){return r.kro;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.kro[k]);}},
  ro:{lvl:'RO',key:function(r){return r.ro;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.ro[k]);}},
  komp:{lvl:'Komponen',key:function(r){return r.komp;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.komp[k]);}},
  sub:{lvl:'Sub Komp',key:function(r){return r.ro+'|'+r.sub;},label:function(k){return '<b class="code">'+esc(k.split('|')[1])+'</b> '+esc(D.sub[k]);}},
  akun:{lvl:'Akun',key:function(r){return r.akun;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.akun[k]);}},
  a2:{lvl:'Jenis',key:function(r){return r.a2;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(A2(k));}},
  a3:{lvl:'Akun 3',key:function(r){return r.a3;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(A3(k));}},
  kat:{lvl:'Kategori',key:function(r){return r.kat;},label:function(k){return esc(k);},sort:function(a,b){return a==='Fakultas'?-1:b==='Fakultas'?1:(a<b?-1:1);}},
  unit:{lvl:'Unit',key:function(r){return r.unit;},label:function(k){return '<b>'+esc(k)+'</b>'+(FAK_FULL[k]?' <span class="note">'+FAK_FULL[k]+'</span>':'');},sort:function(a,b){var ia=FAK_ORDER.indexOf(a),ib=FAK_ORDER.indexOf(b);if(ia>=0||ib>=0)return (ia<0?99:ia)-(ib<0?99:ib);return a<b?-1:1;}},
  src:{lvl:'Sumber',key:function(r){return r.sumber||'?';},label:function(k){return SRC[k]||'Belum dipetakan';},sort:function(a,b){return a==='RM'?-1:b==='RM'?1:0;}}
};

/* ================= halaman analisis ================= */
function unitSort(a,b){ var ka=a.key.split('|'),kb=b.key.split('|'); if(ka[0]!==kb[0]) return ka[0]==='Fakultas'?-1:1; var ia=FAK_ORDER.indexOf(ka[1]),ib=FAK_ORDER.indexOf(kb[1]); if(ia>=0&&ib>=0) return ia-ib; return b.pagu-a.pagu; }
function matrix(R,cols,colKey,colName){
  var gu=group(R,function(r){return r.kat+'|'+r.unit;}).sort(unitSort);
  var h='<div class="tbl"><table><thead><tr><th>Unit kerja</th>'+cols.map(function(c){return '<th class="n">'+colName(c)+' · pagu</th><th class="n">%</th>';}).join('')+'<th class="n">Total pagu</th><th class="n">%</th></tr></thead><tbody>';
  gu.forEach(function(g){ var p=g.key.split('|');
    h+='<tr><td><span class="note">'+esc(p[0])+'</span> <b>'+esc(p[1])+'</b></td>'+cols.map(function(c){ var s=sum(g.rows.filter(function(r){return colKey(r)===c;})); return s.pagu?'<td class="n">'+rp(s.pagu)+'</td><td class="n">'+pc(s.p)+'</td>':'<td class="n note">–</td><td class="n note">–</td>'; }).join('')+'<td class="n"><b>'+rp(g.pagu)+'</b></td><td class="n"><b>'+pc(g.p)+'</b></td></tr>'; });
  var T=sum(R);
  return h+'<tr class="tot"><td>Jumlah</td>'+cols.map(function(c){ var s=sum(R.filter(function(r){return colKey(r)===c;})); return '<td class="n">'+rp(s.pagu)+'</td><td class="n">'+pc(s.p)+'</td>'; }).join('')+'<td class="n">'+rp(T.pagu)+'</td><td class="n">'+pc(T.p)+'</td></tr></tbody></table></div>';
}
function renderUnit(){
  var R=rows(), a2s=Object.keys(group(R,function(r){return r.a2;}).reduce(function(o,g){o[g.key]=1;return o;},{})).sort();
  return '<div class="page-sec grid">'+printHead('Realisasi per Unit Kerja')+
    card('c-mx1','Unit kerja × sumber dana','Pagu dan persentase realisasi setiap unit menurut sumber dana.',matrix(R,['RM','PNP'],function(r){return r.sumber;},function(c){return c==='PNP'?'PNBP':'RM';}))+
    card('c-mx2','Unit kerja × jenis belanja','Pagu dan persentase realisasi setiap unit menurut akun 51, 52, 53.',matrix(R,a2s,function(r){return r.a2;},function(c){return c;}))+
    treeCard('t-unit','Rincian unit kerja','Kategori → Unit → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.kat,LV.unit,LV.komp,LV.sub,LV.akun])+'</div>';
}
function renderSumber(){
  var R=rows(), T=sum(R);
  var tiles=group(R,function(r){return r.sumber||'?';}).sort(function(a,b){return a.key==='RM'?-1:1;}).map(function(s){ var c=s.key==='RM'?'var(--rm)':'var(--pnbp)', id='c-s'+s.key.replace(/\W/g,'');
    return '<section class="glass card" id="'+id+'"><div class="card-h"><div class="eyebrow"><i class="dot" style="display:inline-block;background:'+c+';margin-right:6px"></i>'+(SRC[s.key]||'Belum dipetakan')+'</div>'+actions(id,'Sumber dana '+(SRC[s.key]||''))+'</div>'+
      '<div class="num" style="font-size:30px;font-weight:600;letter-spacing:-.04em">'+rpk(s.pagu)+'</div><div class="note">'+pc(T.pagu?s.pagu/T.pagu:0)+' dari pagu induk · Rp '+rp(s.pagu)+'</div>'+
      '<div style="display:flex;justify-content:space-between;margin:14px 0 6px"><span>Realisasi '+rpk(s.sd)+'</span><span class="pct">'+pc(s.p)+'</span></div>'+track(s.p,c)+
      '<div style="display:flex;justify-content:space-between;margin-top:10px;align-items:center"><span class="note">Sisa '+rpk(s.sisa)+'</span>'+pill(s.p)+'</div></section>'; }).join('');
  return '<div class="page-sec grid">'+printHead('Realisasi per Sumber Dana')+'<div class="two">'+tiles+'</div>'+
    treeCard('t-src','Rincian per sumber dana','Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',R,[LV.src,LV.a2,LV.a3,LV.akun])+'</div>';
}
function renderJenis(){
  return '<div class="page-sec grid">'+printHead('Realisasi per Jenis Belanja')+
    treeCard('t-jenis','Rincian jenis belanja','Akun 2 digit → 3 digit → 6 digit → Detail belanja. Nama akun 2 dan 3 digit diatur di sheet Ref_Akun.',rows(),[LV.a2,LV.a3,LV.akun])+'</div>';
}
function renderDipa(){
  return '<div class="page-sec grid">'+printHead('Struktur DIPA')+
    treeCard('t-dipa','Struktur DIPA','Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',rows(),[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun])+'</div>';
}

/* ================= riwayat & revisi ================= */
function renderRiwayat(){
  var R=rows(), ps=BOOT.periods, cur=DB.periode;
  var gu=group(R,function(r){return r.kat+'|'+r.unit;}).sort(unitSort);
  var gerak='<div class="tbl"><table><thead><tr><th>Unit kerja</th><th class="n">Pagu</th><th class="n">s.d. periode lalu</th><th class="n">%</th><th class="n">Periode ini</th><th class="n">s.d. '+tgl(cur)+'</th><th class="n">%</th><th class="n">Kenaikan</th></tr></thead><tbody>'+
    gu.map(function(g){ var p0=g.pagu?g.lalu/g.pagu:0; return '<tr><td><span class="note">'+esc(g.key.split('|')[0])+'</span> <b>'+esc(g.key.split('|')[1])+'</b></td><td class="n">'+rp(g.pagu)+'</td><td class="n">'+rp(g.lalu)+'</td><td class="n">'+pc(p0)+'</td><td class="n">'+rp(g.ini)+'</td><td class="n">'+rp(g.sd)+'</td><td class="n">'+pc(g.p)+'</td><td class="n">'+poin(g.p-p0)+'</td></tr>'; }).join('')+'</tbody></table></div>';
  var rev;
  var older=ps.filter(function(p){return p.periode<cur;});
  if (!older.length){
    rev='<div class="empty">Belum ada posisi data sebelum '+tgl(cur)+'. Perbandingan revisi muncul otomatis setelah ada dua tanggal posisi.</div>';
  } else {
    var p1=S.cmpP1 && S.cmpP1<cur ? S.cmpP1 : older[older.length-1].periode;
    rev='<div class="form noprint" style="margin-bottom:14px;max-width:560px"><label class="f" for="cmpP1">Dibandingkan dengan posisi<select id="cmpP1">'+older.slice().reverse().map(function(p){return '<option value="'+p.periode+'"'+(p.periode===p1?' selected':'')+'>'+tgl(p.periode)+'</option>';}).join('')+'</select></label><div class="note" style="padding-bottom:8px">Posisi terbaru: <b>'+tgl(cur)+'</b> (pilih di bagian atas)</div></div><div id="cmpBox"><div class="loading" style="padding:30px 0">Membandingkan…</div></div>';
    S.cmpWant={p1:p1,p2:cur};
  }
  return '<div class="page-sec grid">'+printHead('Riwayat & Revisi')+
    card('c-rev','Perbandingan revisi pagu','Sub komponen yang bertambah, berkurang, atau berubah pagunya, perubahan pagu per unit, dan pergeseran antar akun.',rev)+
    card('c-gerak','Pergerakan realisasi','Realisasi s.d. periode lalu dibanding posisi '+tgl(cur)+'.',gerak)+'</div>';
}
function loadCompare(){
  if (!S.cmpWant || !$('cmpBox')) return;
  var key=S.cmpWant.p1+'>'+S.cmpWant.p2+'>'+trendKey();
  if (S.cmp && S.cmpKey===key){ $('cmpBox').innerHTML=compareHtml(S.cmp); return; }
  SB.banding(S.cmpWant.p1,S.cmpWant.p2).then(function(c){ S.cmp=c; S.cmpKey=key; var b=$('cmpBox'); if(b) b.innerHTML=compareHtml(c); })
    .catch(function(e){ var b=$('cmpBox'); if(b) b.innerHTML='<p class="note">Gagal membandingkan: '+esc(errMsg(e))+'</p>'; });
}
function compareHtml(c){
  var p1=tgl(S.cmpWant.p1), p2=tgl(S.cmpWant.p2), stLab={baru:['st-good','Baru'],dihapus:['st-crit','Dihapus'],berubah:['st-warn','Berubah']};
  var units=c.unit.slice().sort(function(a,b){ return Math.abs(b.p2-b.p1)-Math.abs(a.p2-a.p1); });
  var h='<h3 class="eyebrow" style="margin:4px 0 8px">Perubahan pagu per unit</h3><div class="tbl"><table><thead><tr><th>Unit</th><th class="n">Pagu '+p1+'</th><th class="n">Pagu '+p2+'</th><th class="n">Selisih</th></tr></thead><tbody>'+
    units.map(function(u){ var d=u.p2-u.p1; return '<tr><td><span class="note">'+esc(u.kat)+'</span> <b>'+esc(u.unit)+'</b></td><td class="n">'+rp(u.p1)+'</td><td class="n">'+rp(u.p2)+'</td><td class="n'+(d<0?' neg':'')+'">'+(d>0?'+':'')+rp(d)+'</td></tr>'; }).join('')+'</tbody></table></div>';
  h+='<h3 class="eyebrow" style="margin:18px 0 8px">Sub komponen berubah ('+c.sub.length+')</h3>';
  h+= c.sub.length ? '<div class="tbl"><table><thead><tr><th>Status</th><th>Unit</th><th>Sub komponen</th><th class="n">Pagu '+p1+'</th><th class="n">Pagu '+p2+'</th><th class="n">Selisih</th></tr></thead><tbody>'+
    c.sub.sort(function(a,b){return a.status<b.status?-1:1;}).map(function(x){ var d=x.p2-x.p1, s=stLab[x.status]; return '<tr><td><span class="pill '+s[0]+'"><i></i>'+s[1]+'</span></td><td>'+esc(x.unit)+'</td><td><span class="code">'+esc(x.ro)+' · '+esc(x.sub)+'</span> '+esc(x.nama)+'</td><td class="n">'+rp(x.p1)+'</td><td class="n">'+rp(x.p2)+'</td><td class="n'+(d<0?' neg':'')+'">'+(d>0?'+':'')+rp(d)+'</td></tr>'; }).join('')+'</tbody></table></div>' : '<p class="note">Tidak ada perubahan sub komponen.</p>';
  var net=c.akun.reduce(function(a,x){return a+(x.p2-x.p1);},0);
  h+='<h3 class="eyebrow" style="margin:18px 0 8px">Pergeseran antar akun ('+c.akun.length+') · selisih bersih '+(net>0?'+':'')+rp(net)+'</h3>';
  h+= c.akun.length ? '<div class="tbl"><table><thead><tr><th>Akun</th><th class="n">Pagu '+p1+'</th><th class="n">Pagu '+p2+'</th><th class="n">Selisih</th></tr></thead><tbody>'+
    c.akun.sort(function(a,b){return (a.p2-a.p1)-(b.p2-b.p1);}).map(function(x){ var d=x.p2-x.p1; return '<tr><td><span class="code">'+esc(x.akun)+'</span> '+esc(x.nama)+'</td><td class="n">'+rp(x.p1)+'</td><td class="n">'+rp(x.p2)+'</td><td class="n'+(d<0?' neg':'')+'">'+(d>0?'+':'')+rp(d)+'</td></tr>'; }).join('')+'</tbody></table></div>' : '<p class="note">Tidak ada pergeseran pagu antar akun.</p>';
  return h;
}

/* ================= perlu perhatian & rincian ================= */
function renderPerhatian(){
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
function itemRows(){
  var R=rows(), q=S.q.toLowerCase().trim();
  if (q) R=R.filter(function(r){ return (r.no+' '+r.item+' '+r.sub+' '+subName(r)+' '+r.akun+' '+D.akun[r.akun]+' '+r.unit+' '+r.ro).toLowerCase().indexOf(q)>=0; });
  return R;
}
function renderRincian(){
  var R=itemRows(), PG=25, pages=Math.max(1,Math.ceil(R.length/PG)); S.pg=Math.min(S.pg,pages-1);
  var T=sum(R);
  var body='<div class="tools noprint" style="margin-bottom:12px"><input type="search" id="q" placeholder="Cari uraian, kode, atau unit…" value="'+esc(S.q)+'" style="min-width:240px;flex:1"><button class="btn" type="button" id="btnCsv">Unduh CSV</button></div>'+
    '<p class="note">'+rp(R.length)+' detail · pagu Rp '+rp(T.pagu)+' · realisasi Rp '+rp(T.sd)+' ('+pc(T.p)+')</p>'+
    '<div class="tbl"><table><thead><tr><th>Unit</th><th>RO</th><th>Sub komp.</th><th>Akun</th><th>No</th><th>Uraian</th><th>SD</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th class="n">Sisa</th></tr></thead><tbody>'+
    R.slice(S.pg*PG,S.pg*PG+PG).map(function(r){ return '<tr><td>'+esc(r.unit)+'</td><td class="code">'+esc(r.ro)+'</td><td class="code" title="'+esc(subName(r))+'">'+esc(r.sub)+'</td><td class="code" title="'+esc(D.akun[r.akun])+'">'+esc(r.akun)+'</td><td class="code">'+esc(r.no)+'</td><td>'+esc(r.item)+'</td><td>'+(r.sumber==='PNP'?'PNBP':esc(r.sumber))+'</td><td class="n">'+rp(r.pagu)+'</td><td class="n">'+rp(r.sd)+'</td><td class="n">'+pc(r.pagu?r.sd/r.pagu:0)+'</td><td class="n'+(r.sisa<0?' neg':'')+'">'+rp(r.sisa)+'</td></tr>'; }).join('')+
    '</tbody></table></div><div class="pager"><span>Halaman '+(S.pg+1)+' dari '+pages+'</span><button class="btn" type="button" id="pgPrev"'+(S.pg?'':' disabled')+'>‹ Sebelumnya</button><button class="btn" type="button" id="pgNext"'+(S.pg<pages-1?'':' disabled')+'>Berikutnya ›</button></div>';
  return '<div class="page-sec grid">'+printHead('Rincian Detail Belanja')+card('c-item','Rincian detail belanja','Semua detail dalam cakupan dan filter aktif.',body)+'</div>';
}
function downloadCsv(){
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

/* ================= kelola data (admin) ================= */
function renderKelola(){
  var A=S.admin;
  if (!A){ SB.adminInfo().then(function(x){ S.admin=x; if(S.page==='kelola') refresh(); }).catch(function(e){ $('page').innerHTML='<div class="glass card">'+esc(errMsg(e))+'</div>'; }); return '<div class="loading">Memuat data admin…</div>'; }
  var units={Fakultas:{},Rektorat:{}}; A.rules.forEach(function(r){ if(r[4]) (units[r[4]]=units[r[4]]||{})[r[5]]=1; });
  var up='<div class="form"><label class="f" for="upJenis">Jenis file<select id="upJenis"><option value="REALISASI">Laporan Ketersediaan Dana Detail</option><option value="RKK">Rincian Kertas Kerja Satker (sumber dana)</option></select></label>'+
    '<label class="f" for="upTgl" id="upTglWrap">Tanggal posisi data<input type="date" id="upTgl"></label>'+
    '<label class="f" for="upFile">File Excel (.xlsx / .xls)<input type="file" id="upFile" accept=".xlsx,.xls"></label>'+
    '<div><button class="btn primary" type="button" id="btnUp">Unggah &amp; proses</button></div></div><div id="upMsg" class="note" style="margin-top:12px;white-space:pre-wrap"></div>'+
    '<p class="note">Setelah revisi DIPA/POK: unggah RKK terlebih dahulu, lalu Laporan Ketersediaan Dana. Mengunggah ulang tanggal yang sama akan menggantikan data tanggal tersebut.</p>';
  var log='<div class="tbl"><table><thead><tr><th>Posisi</th><th>Diunggah</th><th>File</th><th class="n">Detail</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th>Cek</th><th></th></tr></thead><tbody>'+
    A.periods.slice().reverse().map(function(p){ var ok=Number(p.cekPagu)===0&&Number(p.cekReal)===0&&p.cekPagu!==''; return '<tr><td><b>'+tgl(p.periode)+'</b></td><td>'+esc(p.diunggah)+'<br><span class="note">'+esc(p.pengunggah)+'</span></td><td>'+esc(p.file)+'</td><td class="n">'+rp(p.jumlah)+'</td><td class="n">'+rp(p.pagu)+'</td><td class="n">'+rp(p.sd)+'</td><td class="n">'+pc(p.persen)+'</td><td><span class="pill '+(ok?'st-good':'st-crit')+'"><i></i>'+(ok?'Cocok':'Periksa')+'</span></td><td><button class="btn" type="button" data-delp="'+p.periode+'">Hapus</button></td></tr>'; }).join('')+'</tbody></table></div>';
  var rules='<div class="tbl"><table><thead><tr><th>KRO</th><th>Komponen</th><th>Jenis aturan</th><th>Kode</th><th>Kategori</th><th>Unit</th><th>Keterangan</th></tr></thead><tbody>'+
    A.rules.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(i===3?' class="code"':'')+'>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'+
    '<div class="tools" style="margin-top:12px"><a class="link" href="'+esc(A.sheetUrl)+'" target="_blank" rel="noopener">Ubah aturan di sheet Ref_Unit ›</a><button class="btn" type="button" id="btnRemap">Terapkan ke posisi terbaru</button><button class="btn" type="button" id="btnRemapAll">Terapkan ke semua posisi</button></div>'+
    '<p class="note">Urutan: kode lengkap → huruf pertama → komponen → selain itu Rektorat. Terapkan ke semua posisi hanya untuk memperbaiki salah pemetaan — perubahan pemilik kode setelah revisi cukup berlaku untuk posisi terbaru.</p><div id="mapMsg" class="note"></div>';
  var peranName={ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Unit'};
  var users='<div class="tbl"><table><thead><tr><th>Email / nama pengguna</th><th>Peran</th><th>Cakupan</th><th>Masuk dengan</th><th>Status</th><th>Keterangan</th><th></th></tr></thead><tbody>'+
    A.users.map(function(u){ var aktif=/^(YA|Y|TRUE|AKTIF|1)$/i.test(u[4]); return '<tr><td>'+esc(u[0])+'</td><td>'+esc(peranName[String(u[1]).toUpperCase()]||u[1])+'</td><td>'+(u[2]?esc(u[2])+(u[3]?' › '+esc(u[3]):' (semua)'):'Seluruh satker')+'</td><td>'+loginWay(u)+'</td><td><span class="pill '+(aktif?'st-good':'st-crit')+'"><i></i>'+(aktif?'Aktif':'Nonaktif')+'</span></td><td>'+esc(u[5])+'</td><td class="row-actions"><button class="btn" type="button" data-edit="'+u[6]+'">Ubah</button><button class="btn" type="button" data-act="'+u[6]+'" data-on="'+(aktif?0:1)+'">'+(aktif?'Nonaktifkan':'Aktifkan')+'</button></td></tr>'; }).join('')+'</tbody></table></div>'+
    '<h3 class="eyebrow" style="margin:18px 0 8px" id="uFormTitle">Tambah pengguna</h3><div class="form"><input type="hidden" id="uRow">'+
    '<label class="f" for="uEmail">Email / nama pengguna<input type="text" id="uEmail" placeholder="nama@gmail.com atau nama@'+esc(A.domain||'kampus')+'" autocomplete="off"></label>'+
    '<label class="f" for="uPw">Kata sandi<input type="password" id="uPw" placeholder="Wajib untuk akun non-kampus" autocomplete="new-password"></label>'+
    '<label class="f" for="uPeran">Peran<select id="uPeran"><option value="UNIT">Fakultas / unit</option><option value="PIMPINAN">Pimpinan</option><option value="ADMIN">Admin keuangan</option></select></label>'+
    '<label class="f" for="uKat">Kategori<select id="uKat"><option value="Fakultas">Fakultas</option><option value="Rektorat">Rektorat</option></select></label>'+
    '<label class="f" for="uUnit">Unit<select id="uUnit"></select></label>'+
    '<label class="f" for="uKet">Keterangan<input type="text" id="uKet" placeholder="Jabatan / catatan"></label>'+
    '<p class="note" style="grid-column:1/-1;margin:0">Akun @'+esc(A.domain||'kampus')+' bisa masuk langsung dengan Google tanpa kata sandi. Akun lain (Gmail, dll.) masuk dengan kata sandi minimal 8 karakter. Saat mengubah pengguna, kosongkan kata sandi bila tidak ingin menggantinya.</p>'+
    '<div class="tools"><button class="btn primary" type="button" id="btnSaveUser">Simpan pengguna</button><button class="btn" type="button" id="btnClearUser">Kosongkan</button></div></div><div id="userMsg" class="note" style="margin-top:8px"></div>';
  setTimeout(function(){ bindKelola(units); },0);
  return '<div class="page-sec grid">'+card('k-up','Unggah laporan SAKTI','File dibaca di browser, dicocokkan dengan baris JUMLAH SELURUHNYA, lalu disimpan per tanggal posisi.',up)+
    card('k-log','Riwayat unggahan','Cek harus "Cocok": total detail sama dengan baris JUMLAH SELURUHNYA pada laporan.',log)+
    card('k-rule','Aturan unit kerja','Menentukan Fakultas/Rektorat setiap sub komponen.',rules)+
    card('k-user','Pengguna & hak akses','Admin dan pimpinan melihat seluruh satker; pengguna unit hanya melihat cakupannya.',users)+'</div>';
}
function bindKelola(units){
  if (!$('btnUp')) return;
  var today=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
  $('upTgl').value=today;
  $('upJenis').onchange=function(){ $('upTglWrap').hidden=this.value==='RKK'; };
  $('btnUp').onclick=doUpload;
  [].forEach.call(document.querySelectorAll('[data-delp]'),function(b){ b.onclick=function(){
    if(!confirm('Hapus data posisi '+tgl(b.dataset.delp)+'? Tindakan ini tidak bisa dibatalkan.')) return;
    b.disabled=true; SB.hapusPeriode(b.dataset.delp).then(function(r){ toast(r.pesan); reboot(); }).catch(function(e){ b.disabled=false; toast(errMsg(e)); });
  }; });
  var remap=function(scope,btn){ btn.disabled=true; $('mapMsg').textContent='Memproses…'; SB.terapkanUlang(scope).then(function(r){ $('mapMsg').textContent=r.pesan; S.trend={}; S.cmp=null; loadData(DB.periode); }).catch(function(e){ btn.disabled=false; $('mapMsg').textContent=errMsg(e); }); };
  $('btnRemap').onclick=function(){ remap('terbaru',this); };
  $('btnRemapAll').onclick=function(){ if(confirm('Terapkan aturan terbaru ke SEMUA posisi data? Data lama akan ikut dipetakan ulang.')) remap('semua',this); };
  var fillUnits=function(sel){ var k=$('uKat').value; $('uUnit').innerHTML='<option value="">Semua '+k+'</option>'+Object.keys(units[k]||{}).sort(function(a,b){var ia=FAK_ORDER.indexOf(a),ib=FAK_ORDER.indexOf(b);if(ia>=0&&ib>=0)return ia-ib;return a<b?-1:1;}).map(function(u){return '<option'+(u===sel?' selected':'')+'>'+esc(u)+'</option>';}).join(''); };
  var peranChange=function(){ var unit=$('uPeran').value==='UNIT'; $('uKat').disabled=!unit; $('uUnit').disabled=!unit; };
  $('uKat').onchange=function(){ fillUnits(''); }; $('uPeran').onchange=peranChange; fillUnits(''); peranChange();
  var clear=function(){ $('uRow').value=''; $('uEmail').value=''; $('uPw').value=''; $('uKet').value=''; $('uPeran').value='UNIT'; $('uKat').value='Fakultas'; fillUnits(''); peranChange(); $('uFormTitle').textContent='Tambah pengguna'; };
  $('btnClearUser').onclick=clear;
  [].forEach.call(document.querySelectorAll('[data-edit]'),function(b){ b.onclick=function(){
    var u=S.admin.users.filter(function(x){return String(x[6])===b.dataset.edit;})[0]; if(!u) return;
    $('uRow').value=u[6]; $('uEmail').value=u[0]; $('uPeran').value=String(u[1]).toUpperCase(); if(u[2]) $('uKat').value=u[2]; fillUnits(u[3]); $('uKet').value=u[5]; $('uPw').value=''; peranChange();
    $('uFormTitle').textContent='Ubah pengguna '+u[0]; $('uEmail').focus();
  }; });
  [].forEach.call(document.querySelectorAll('[data-act]'),function(b){ b.onclick=function(){
    b.disabled=true; SB.aktifkan(b.dataset.act, b.dataset.on==='1').then(function(r){ toast(r.pesan); S.admin=null; refresh(); }).catch(function(e){ b.disabled=false; toast(errMsg(e)); });
  }; });
  $('btnSaveUser').onclick=function(){
    var btn=this; btn.disabled=true; $('userMsg').textContent='Menyimpan…';
    SB.simpanPengguna($('uRow').value,$('uPeran').value,$('uKat').value,$('uUnit').value,$('uKet').value)
      .then(function(r){ toast(r.pesan); S.admin=null; refresh(); })
      .catch(function(e){ btn.disabled=false; $('userMsg').textContent=errMsg(e); });
  };
}
function loginWay(u){
  var dom=(S.admin&&S.admin.domain||'').toLowerCase(), kampus=dom && u[0].slice(-(dom.length+1))==='@'+dom;
  var parts=[]; if(kampus) parts.push('Google kampus'); if(u[7]) parts.push('Kata sandi');
  return parts.length?esc(parts.join(' + ')):'<span class="neg">Belum bisa masuk — beri kata sandi</span>';
}
function doUpload(){
  var f=$('upFile').files[0], jenis=$('upJenis').value, tg=$('upTgl').value, msg=$('upMsg'), btn=$('btnUp');
  if (!f){ msg.textContent='Pilih file terlebih dahulu.'; return; }
  if (jenis==='REALISASI' && !tg){ msg.textContent='Isi tanggal posisi data.'; return; }
  if (typeof XLSX==='undefined'){ msg.textContent='Pembaca Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'; return; }
  btn.disabled=true; msg.textContent='Membaca file…';
  var rd=new FileReader();
  rd.onload=function(e){
    try{
      var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      var rowsX=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}).map(function(r){ var k=r.length; while(k>0&&r[k-1]==='') k--; return r.slice(0,k); });
      msg.textContent='Memproses '+rowsX.length+' baris di server…';
      SB.unggah(jenis,tg,f.name,rowsX).then(function(r){
        var t=r.pesan;
        if (r.subBaru && r.subBaru.length) t+='\n\nSub komponen baru dibanding posisi sebelumnya ('+r.subBaru.length+'):\n• '+r.subBaru.join('\n• ');
        if (r.peringatan && r.peringatan.length) t+='\n\nCatatan pembacaan:\n• '+r.peringatan.join('\n• ');
        msg.textContent=t; btn.disabled=false; $('upFile').value='';
        S.admin=null; S.trend={}; S.cmp=null;
        reboot(r.periode, true);
      }).catch(function(x){ btn.disabled=false; msg.textContent='Gagal: '+errMsg(x); });
    } catch(ex){ btn.disabled=false; msg.textContent='File tidak bisa dibaca: '+ex.message; }
  };
  rd.readAsArrayBuffer(f);
}

/* ================= PDF & cetak ================= */
function pdfCard(id,title){
  var el=$(id); if(!el) return;
  if (typeof html2canvas==='undefined' || !window.jspdf){ toast('Pustaka PDF gagal dimuat. Gunakan tombol Cetak lalu pilih "Simpan sebagai PDF".'); return; }
  toast('Menyiapkan PDF…');
  document.body.classList.add('pdf-mode');
  html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false}).then(function(cv){
    document.body.classList.remove('pdf-mode');
    var doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var W=210,M=14,cw=W-2*M,y=M;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(BOOT.satker+' · Satker '+BOOT.kode,M,y); y+=6;
    doc.setFontSize(11); doc.text(title,M,y); y+=5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.splitTextToSize('Posisi data '+tgl(DB.periode)+' · Cakupan: '+scopeText(),cw).forEach(function(l){ doc.text(l,M,y); y+=4; });
    doc.text('Dicetak '+new Date().toLocaleString('id-ID')+' oleh '+sess().email+' · Sumber: Laporan Ketersediaan Dana Detail (SAKTI)',M,y); y+=3;
    doc.setDrawColor(40); doc.line(M,y,W-M,y); y+=4;
    var pxPerMm=cv.width/cw, pageH=297-M, sliceTop=0;
    while (sliceTop<cv.height){
      var availMm=pageH-y, slicePx=Math.min(cv.height-sliceTop, Math.floor(availMm*pxPerMm));
      var part=document.createElement('canvas'); part.width=cv.width; part.height=slicePx;
      part.getContext('2d').drawImage(cv,0,sliceTop,cv.width,slicePx,0,0,cv.width,slicePx);
      doc.addImage(part.toDataURL('image/jpeg',0.92),'JPEG',M,y,cw,slicePx/pxPerMm);
      sliceTop+=slicePx;
      if (sliceTop<cv.height){ doc.addPage(); y=M; }
    }
    var name=(title||'laporan').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_')+'_'+DB.periode+'.pdf';
    try { doc.save(name); } catch(e){}
    toast('PDF "'+name+'" diunduh.');
  }).catch(function(e){ document.body.classList.remove('pdf-mode'); toast('PDF gagal dibuat: '+errMsg(e)); });
}
function printCard(id){
  var el=$(id); if(!el) return;
  el.classList.add('print-target'); document.body.classList.add('print-one');
  setTimeout(function(){ window.print(); setTimeout(function(){ el.classList.remove('print-target'); document.body.classList.remove('print-one'); },500); },60);
}

/* ================= navigasi ================= */
var PAGES=[
  {id:'ringkasan',t:'Ringkasan',g:'Dasbor',ic:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',r:renderRingkasan,after:loadTrend},
  {id:'unit',t:'Unit Kerja',g:'Analisis',ic:'<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5"/>',r:renderUnit},
  {id:'sumber',t:'Sumber Dana',g:'Analisis',ic:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h8"/>',r:renderSumber},
  {id:'jenis',t:'Jenis Belanja',g:'Analisis',ic:'<path d="M4 6h16M4 12h10M4 18h6"/>',r:renderJenis},
  {id:'dipa',t:'Struktur DIPA',g:'Analisis',ic:'<path d="M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v4.5h9V15"/>',r:renderDipa},
  {id:'riwayat',t:'Riwayat & Revisi',g:'Pemantauan',ic:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',r:renderRiwayat,after:loadCompare},
  {id:'perhatian',t:'Perlu Perhatian',g:'Pemantauan',ic:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',r:renderPerhatian},
  {id:'rincian',t:'Rincian & Ekspor',g:'Pemantauan',ic:'<path d="M4 5h16v14H4zM4 10h16M10 10v9"/>',r:renderRincian},
  {id:'kelola',t:'Kelola Data',g:'Admin',ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',r:renderKelola,admin:true,noData:true}
];
function renderNav(){
  var g='',h='';
  PAGES.forEach(function(p){ if(p.admin&&!isAdmin()) return; if(!DB&&!p.noData) return;
    if(p.g!==g){ g=p.g; h+='<div class="grp">'+g+'</div>'; }
    h+='<button type="button" data-page="'+p.id+'" class="'+(S.page===p.id?'on':'')+'"'+(S.page===p.id?' aria-current="page"':'')+'><svg viewBox="0 0 24 24">'+p.ic+'</svg>'+p.t+'</button>'; });
  $('nav').innerHTML=h;
  var s=sess(), role={ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Pengguna unit'}[s.role];
  $('who').innerHTML='<b>'+esc(role)+'</b>'+esc(s.email)+'<br>'+(s.all?'Melihat seluruh data satker.':'Cakupan: '+esc(s.scopes.map(scopeLabel).join(', '))+'.')+
    ('<div class="tools" style="margin-top:10px"><button class="btn" type="button" id="btnPw">Ubah sandi</button><button class="btn" type="button" id="btnOut">Keluar</button></div>');
  if ($('btnOut')) $('btnOut').onclick=function(){ SB.keluar(); };
  if ($('btnPw')) $('btnPw').onclick=function(){
    var baru=prompt('Kata sandi baru (minimal 8 karakter):'); if(baru===null) return;
    SB.gantiSandi(baru).then(function(r){ toast(r.pesan); }).catch(function(e){ toast(errMsg(e)); });
  };
}
function bindTips(root){
  [].forEach.call(root.querySelectorAll('[data-tip]'),function(el){ var html=TIPS[+el.getAttribute('data-tip')]; el.addEventListener('mousemove',function(e){showTip(e,html);}); el.addEventListener('mouseleave',hideTip); });
}
function refresh(){
  var p=PAGES.filter(function(x){ return x.id===S.page && (!x.admin||isAdmin()) && (DB||x.noData); })[0];
  if (!p){ p = DB ? PAGES[0] : (isAdmin()?PAGES[PAGES.length-1]:null); }
  if (!p){ $('page').innerHTML='<div class="glass card"><h2>Belum ada data</h2><p class="note">Admin keuangan belum mengunggah laporan realisasi.</p></div>'; $('filters').hidden=true; $('scope').hidden=true; renderNav(); return; }
  S.page=p.id; persist(); TIPS=[]; TREES={}; hideTip();
  renderNav();
  var noF=!DB||p.id==='kelola';
  $('filters').hidden=noF; $('scope').hidden=noF;
  if (!noF) renderFilters();
  $('pageTitle').textContent=p.id==='ringkasan'?'Ringkasan Realisasi':p.t;
  $('crumb').textContent=p.g+' · '+BOOT.satker;
  $('page').innerHTML=p.r();
  var pg=$('page');
  bindTips(pg);
  [].forEach.call(pg.querySelectorAll('[data-tog]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-tog'); S.open[id]=!S.open[id]; keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-openall]'),function(b){ b.onclick=function(){ openLevel(b.getAttribute('data-openall')); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-closeall]'),function(b){ b.onclick=function(){ var id=b.getAttribute('data-closeall'); Object.keys(S.open).forEach(function(k){ if(k.indexOf(id+'/')===0) delete S.open[k]; }); keepScroll(); }; });
  [].forEach.call(pg.querySelectorAll('[data-goa2]'),function(b){ b.onclick=function(){ S.f.a2=b.getAttribute('data-goa2'); S.f.a3=''; S.page='jenis'; S.open={}; S.open['t-jenis/'+S.f.a2]=true; refresh(); window.scrollTo(0,0); }; });
  [].forEach.call(pg.querySelectorAll('[data-print]'),function(b){ b.onclick=function(){ printCard(b.getAttribute('data-print')); }; });
  [].forEach.call(pg.querySelectorAll('[data-pdf]'),function(b){ b.onclick=function(){ pdfCard(b.getAttribute('data-pdf'),b.getAttribute('data-title')); }; });
  var q=$('q'); if(q) q.oninput=function(){ S.q=q.value; S.pg=0; var pos=q.selectionStart; refresh(); var n=$('q'); n.focus(); try{n.setSelectionRange(pos,pos);}catch(e){} };
  if ($('pgPrev')){ $('pgPrev').onclick=function(){S.pg--;refresh();}; $('pgNext').onclick=function(){S.pg++;refresh();}; }
  if ($('btnCsv')) $('btnCsv').onclick=downloadCsv;
  if ($('cmpP1')) $('cmpP1').onchange=function(){ S.cmpP1=this.value; S.cmp=null; refresh(); };
  if (p.after) p.after();
}
function keepScroll(){ var y=window.scrollY; refresh(); window.scrollTo(0,y); }

function setData(d){
  DB=d; D=d.dims; WAKTU=yearFrac(d.periode);
  ALL=d.items.map(function(a){
    var r={prog:a[0],keg:String(a[1]),kro:a[2],ro:a[3],komp:String(a[4]),sub:a[5],akun:String(a[6]),sumber:a[7],no:a[8],item:a[9],pagu:a[10],lock:a[11],lalu:a[12],ini:a[13],sd:a[14],sisa:a[15],kat:a[16],unit:a[17]};
    r.a2=r.akun.slice(0,2); r.a3=r.akun.slice(0,3); r.gaji=r.ro==='EBA.994'&&(r.komp==='001'||r.komp==='002');
    return r;
  });
}
function loadData(periode){
  $('page').innerHTML='<div class="loading">Memuat data posisi '+tgl(periode)+'…</div>';
  return SB.data(periode).then(function(d){ setData(d); S.open={}; refresh(); }).catch(function(e){ $('page').innerHTML='<div class="glass card">'+esc(errMsg(e))+'</div>'; });
}
function fillPeriods(sel){
  var ps=BOOT.periods;
  $('selPeriode').innerHTML=ps.length?ps.slice().reverse().map(function(p){return '<option value="'+p.periode+'"'+(p.periode===sel?' selected':'')+'>'+tgl(p.periode)+'</option>';}).join(''):'<option>—</option>';
}
function reboot(periode, keepPage){
  return SB.boot().then(function(b){
    BOOT=b; AK=b.akunNames||{};
    var ps=b.periods, target=periode && ps.some(function(p){return p.periode===periode;}) ? periode : (ps.length?ps[ps.length-1].periode:null);
    fillPeriods(target);
    if (!target){ DB=null; refresh(); return; }
    return loadData(target);
  });
}
$('selPeriode').onchange=function(){ S.cmp=null; loadData(this.value); };
$('btnPrintAll').onclick=function(){ document.body.classList.remove('print-one'); window.print(); };
$('nav').addEventListener('click',function(e){ var b=e.target.closest('[data-page]'); if(!b) return; S.page=b.getAttribute('data-page'); S.open={}; S.pg=0; refresh(); window.scrollTo(0,0); });



/* ============================================================
   Lapisan Supabase: autentikasi, baca data, unggah, kelola pengguna.
   ============================================================ */
var SBC = null;      // klien supabase
var SB = {};

function sbInit(){
  var c = window.SB_CONFIG || {};
  if (!c.url || !c.anonKey || /GANTI/i.test(c.url) || /GANTI/i.test(c.anonKey)) {
    $('boot').innerHTML = '<div class="glass gate"><h2>Konfigurasi belum diisi</h2>' +
      '<p class="note">Buka berkas <b>config.js</b>, lalu isi <b>url</b> dan <b>anonKey</b> project Supabase Anda ' +
      '(Supabase → Project Settings → API).</p></div>';
    return false;
  }
  SBC = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return true;
}

/* ---------- ambil semua baris (PostgREST membatasi 1000 baris per permintaan) ---------- */
function sbAll(build){
  var HAL = 1000, out = [];
  function ambil(dari){
    return build().range(dari, dari + HAL - 1).then(function(r){
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      return (r.data && r.data.length === HAL) ? ambil(dari + HAL) : out;
    });
  }
  return ambil(0);
}

/* ---------- boot: sesi, profil, referensi, daftar posisi data ---------- */
SB.boot = function(){
  return SBC.auth.getSession().then(function(s){
    var user = s.data.session && s.data.session.user;
    if (!user) return { session: { allowed: false, email: '', via: '' }, satker: '', kode: '', periods: [] };
    return Promise.all([
      SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan').eq('id', user.id).maybeSingle(),
      SBC.from('pengguna_cakupan').select('kategori,unit').eq('user_id', user.id),
      SBC.from('pengaturan').select('kunci,nilai'),
      SBC.from('ref_akun').select('kode,nama'),
      SBC.from('periode').select('*').order('periode')
    ]).then(function(r){
      var p = r[0].data, cak = r[1].data || [], set = {}, akun = {};
      (r[2].data || []).forEach(function(x){ set[x.kunci] = x.nilai; });
      (r[3].data || []).forEach(function(x){ akun[x.kode] = x.nama; });
      var aktif = !!(p && p.aktif);
      var sess = {
        email: (p && p.email) || user.email, via: 'sandi', allowed: aktif,
        role: p ? p.peran : '', all: !!p && (p.peran === 'ADMIN' || p.peran === 'PIMPINAN'),
        scopes: cak.map(function(c){ return { kat: c.kategori, unit: c.unit }; })
      };
      if (sess.all) sess.scopes = [];
      if (aktif && !sess.all && !sess.scopes.length) { sess.allowed = false; sess.tanpaCakupan = true; }
      return {
        session: sess, satker: set.NAMA_SATKER || '', kode: set.KODE_SATKER || '', akunNames: akun,
        periods: (r[4].data || []).map(function(x){
          return { periode: x.periode, label: x.label, diunggah: (x.diunggah_pada || '').replace('T', ' ').slice(0, 16),
            pengunggah: x.diunggah_oleh, file: x.nama_file, jumlah: x.jumlah_detail, pagu: x.pagu, lock: x.lock_pagu,
            sd: x.realisasi, sisa: x.sisa, persen: x.pagu ? x.realisasi / x.pagu : 0, cekPagu: x.cek_pagu, cekReal: x.cek_realisasi };
        })
      };
    });
  });
};

/* ---------- data satu posisi (RLS membatasi baris sesuai cakupan) ---------- */
var KOLOM = 'prog,prog_n,keg,keg_n,kro,kro_n,ro,ro_n,komp,komp_n,sub,sub_n,akun,akun_n,sumber,kategori,unit,no_item,uraian,pagu,lock_pagu,lalu,ini,sd,sisa';
SB.data = function(periode){
  return Promise.all([
    sbAll(function(){ return SBC.from('realisasi').select(KOLOM).eq('periode', periode).order('id'); }),
    SBC.from('periode').select('pagu,realisasi').eq('periode', periode).maybeSingle()
  ]).then(function(r){
    var rows = r[0], tot = r[1].data || { pagu: 0, realisasi: 0 };
    var dims = { program: {}, kegiatan: {}, kro: {}, ro: {}, komp: {}, sub: {}, akun: {} };
    var items = rows.map(function(x){
      dims.program[x.prog] = x.prog_n; dims.kegiatan[x.keg] = x.keg_n; dims.kro[x.kro] = x.kro_n;
      dims.ro[x.ro] = x.ro_n; dims.komp[x.komp] = x.komp_n; dims.sub[x.ro + '|' + x.sub] = x.sub_n; dims.akun[x.akun] = x.akun_n;
      return [x.prog, x.keg, x.kro, x.ro, x.komp, x.sub, x.akun, x.sumber, x.no_item, x.uraian,
        +x.pagu, +x.lock_pagu, +x.lalu, +x.ini, +x.sd, +x.sisa, x.kategori, x.unit];
    });
    return { periode: periode, dims: dims, items: items, satkerPersen: tot.pagu ? tot.realisasi / tot.pagu : 0 };
  });
};

/* ---------- tren: mengikuti cakupan pengguna (bukan filter) ---------- */
SB.tren = function(){
  return SBC.from('v_tren').select('periode,pagu,realisasi').order('periode').then(function(r){
    if (r.error) throw r.error;
    return (r.data || []).map(function(x){ return { periode: x.periode, pagu: +x.pagu, sd: +x.realisasi }; });
  });
};

/* ---------- perbandingan revisi antara dua posisi ---------- */
SB.banding = function(p1, p2){
  var kol = 'ro,sub,sub_n,akun,akun_n,kategori,unit,pagu,sd';
  var ambil = function(p){ return sbAll(function(){ return SBC.from('realisasi').select(kol).eq('periode', p).order('id'); }); };
  return Promise.all([ambil(p1), ambil(p2)]).then(function(r){
    var siap = function(rows){ return rows.map(function(x){
      return { ro: x.ro, sub: x.sub, sub_n: x.sub_n, akun: x.akun, akun_n: x.akun_n,
        kat: x.kategori, unit: x.unit, pagu: +x.pagu, sd: +x.sd }; }); };
    return bandingBlok(siap(r[0]), siap(r[1]));
  });
};
/* versi JavaScript dari compareBlocks (SQL/Apps Script) */
function bandingBlok(a, b){
  function kumpul(rows, kunci, meta){
    var m = {};
    rows.forEach(function(r){ var k = kunci(r); if (!m[k]) m[k] = meta(r); m[k].pagu += r.pagu; m[k].sd += r.sd; });
    return m;
  }
  function gabung(x, y){
    var keys = {}, out = [];
    Object.keys(x).forEach(function(k){ keys[k] = 1; }); Object.keys(y).forEach(function(k){ keys[k] = 1; });
    Object.keys(keys).forEach(function(k){
      var p = x[k], q = y[k], dasar = p || q, o = {};
      for (var f in dasar) if (f !== 'pagu' && f !== 'sd') o[f] = dasar[f];
      o.key = k; o.p1 = p ? p.pagu : 0; o.p2 = q ? q.pagu : 0; o.r1 = p ? p.sd : 0; o.r2 = q ? q.sd : 0;
      o.status = !p ? 'baru' : !q ? 'dihapus' : (Math.round(o.p2 - o.p1) !== 0 ? 'berubah' : 'tetap');
      out.push(o);
    });
    return out;
  }
  var kSub = function(r){ return r.ro + '|' + r.sub; };
  var mSub = function(r){ return { kat: r.kat, unit: r.unit, ro: r.ro, sub: r.sub, nama: r.sub_n, pagu: 0, sd: 0 }; };
  var kAk = function(r){ return r.akun; }, mAk = function(r){ return { akun: r.akun, nama: r.akun_n, pagu: 0, sd: 0 }; };
  var kUn = function(r){ return r.kat + '|' + r.unit; }, mUn = function(r){ return { kat: r.kat, unit: r.unit, pagu: 0, sd: 0 }; };
  return {
    sub: gabung(kumpul(a, kSub, mSub), kumpul(b, kSub, mSub)).filter(function(x){ return x.status !== 'tetap'; }),
    akun: gabung(kumpul(a, kAk, mAk), kumpul(b, kAk, mAk)).filter(function(x){ return x.status !== 'tetap'; }),
    unit: gabung(kumpul(a, kUn, mUn), kumpul(b, kUn, mUn))
  };
}

/* ---------- unggah file SAKTI ---------- */
SB.unggah = function(jenis, tanggal, namaFile, rowsX){
  if (jenis === 'RKK'){
    var k = parseRKK(rowsX);
    var baris = Object.keys(k.map).map(function(key){
      var p = key.split('|');
      return { kunci: key, prog: p[0], kro: p[1], ro: p[2], sub: p[3], akun: p[4], sumber: k.map[key] };
    });
    return SBC.rpc('simpan_rkk', { p_rows: baris }).then(function(r){
      if (r.error) throw r.error;
      return { ok: true, pesan: 'Sumber dana diperbarui dari RKK: ' + (r.data.jumlah || baris.length) + ' akun. ' +
        'Klik "Terapkan ke posisi terbaru" bila data realisasi sudah pernah diunggah.' };
    });
  }
  var res = parseRealisasi(rowsX);
  var cek = res.meta.cek || { selisihPagu: 0, selisihRealisasi: 0 };
  var baris2 = res.items.map(function(it){
    return { prog: it.program, prog_n: it.program_n, keg: it.kegiatan, keg_n: it.kegiatan_n,
      kro: it.kro, kro_n: it.kro_n, ro: it.ro, ro_n: it.ro_n, komp: it.komp, komp_n: it.komp_n,
      sub: it.sub, sub_n: it.sub_n, akun: it.akun, akun_n: it.akun_n, no_item: it.no, uraian: it.item,
      pagu: it.pagu, lock_pagu: it.lock, lalu: it.lalu, ini: it.ini, sd: it.sd, sisa: it.sisa };
  });
  return SBC.rpc('simpan_realisasi', {
    p_periode: tanggal, p_label: res.meta.periodeTeks || '', p_nama_file: namaFile || '',
    p_cek_pagu: cek.selisihPagu, p_cek_realisasi: cek.selisihRealisasi, p_rows: baris2
  }).then(function(r){
    if (r.error) throw r.error;
    var d = r.data || {};
    var pesan = 'Tersimpan ' + d.jumlah + ' detail belanja untuk posisi ' + tanggal + '. ';
    pesan += (cek.selisihPagu === 0 && cek.selisihRealisasi === 0)
      ? 'Total cocok dengan baris JUMLAH SELURUHNYA.'
      : 'PERHATIAN: selisih terhadap JUMLAH SELURUHNYA — pagu ' + cek.selisihPagu + ', realisasi ' + cek.selisihRealisasi + '.';
    if (d.tanpa_sumber) pesan += ' ' + d.tanpa_sumber + ' detail belum punya sumber dana — unggah RKK terbaru lalu terapkan ulang pemetaan.';
    return { ok: true, pesan: pesan, periode: tanggal, peringatan: res.warnings, subBaru: [] };
  });
};

/* ---------- admin ---------- */
SB.adminInfo = function(){
  return Promise.all([
    SBC.from('periode').select('*').order('periode'),
    SBC.from('ref_unit').select('*').order('id'),
    SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan').order('email'),
    SBC.from('pengguna_cakupan').select('user_id,kategori,unit')
  ]).then(function(r){
    r.forEach(function(x){ if (x.error) throw x.error; });
    var cak = {};
    (r[3].data || []).forEach(function(c){ (cak[c.user_id] = cak[c.user_id] || []).push(c); });
    return {
      periods: (r[0].data || []).map(function(x){
        return { periode: x.periode, diunggah: (x.diunggah_pada || '').replace('T', ' ').slice(0, 16), pengunggah: x.diunggah_oleh,
          file: x.nama_file, jumlah: x.jumlah_detail, pagu: x.pagu, sd: x.realisasi,
          persen: x.pagu ? x.realisasi / x.pagu : 0, cekPagu: x.cek_pagu, cekReal: x.cek_realisasi };
      }),
      rules: (r[1].data || []).map(function(x){ return [x.kro, x.komponen, x.jenis_aturan, x.kode, x.kategori, x.unit, x.keterangan]; }),
      users: (r[2].data || []).map(function(u){
        var c = cak[u.id] || [];
        return [u.email, u.peran, c.length ? c[0].kategori : '', c.length ? c[0].unit : '', u.aktif ? 'YA' : 'TIDAK', u.keterangan, u.id, 1];
      }),
      domain: '', sheetUrl: (window.SB_CONFIG.url || '').replace('.supabase.co', '.supabase.co/project/_/editor')
    };
  });
};
SB.simpanPengguna = function(id, peran, kategori, unit, keterangan){
  if (!id) return Promise.reject(new Error('Pilih pengguna dari tabel di atas (tombol Ubah). Akun baru dibuat lewat halaman pendaftaran.'));
  var cak = peran === 'UNIT' ? [{ kategori: kategori, unit: unit || '' }] : [];
  return SBC.rpc('simpan_pengguna', { p_id: id, p_peran: peran, p_aktif: true, p_keterangan: keterangan || '', p_cakupan: cak })
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Pengguna disimpan.' }; });
};
SB.aktifkan = function(id, aktif){
  return SBC.from('pengguna').update({ aktif: aktif }).eq('id', id)
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Status pengguna diperbarui.' }; });
};
SB.hapusPeriode = function(periode){
  return SBC.rpc('hapus_periode', { p_periode: periode }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Data posisi ' + periode + ' dihapus.' }; });
};
SB.terapkanUlang = function(scope){
  var terbaru = BOOT && BOOT.periods.length ? BOOT.periods[BOOT.periods.length - 1].periode : null;
  return SBC.rpc('terapkan_ulang_pemetaan', { p_periode: scope === 'semua' ? null : terbaru }).then(function(r){
    if (r.error) throw r.error;
    return { ok: true, pesan: 'Pemetaan diterapkan ulang ke ' + r.data.baris + ' baris' + (scope === 'semua' ? ' (semua posisi).' : ' (posisi terbaru).') };
  });
};
SB.gantiSandi = function(baru){
  return SBC.auth.updateUser({ password: baru }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Kata sandi diperbarui.' }; });
};
SB.keluar = function(){ return SBC.auth.signOut().then(function(){ location.reload(); }); };

/* ---------- halaman masuk & daftar ---------- */
function tampilMasuk(catatan, mode){
  $('app').hidden = true; $('boot').hidden = true; $('gate').hidden = false;
  var daftar = mode === 'daftar';
  $('gate').innerHTML =
    '<div class="brand" style="justify-content:center;margin-bottom:14px"><div class="mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20V10l7-5 7 5v10"/><path d="M9 20v-5h6v5"/></svg></div>' +
    '<div style="text-align:left"><b>Dasbor Anggaran</b><small>' + esc((BOOT && BOOT.satker) || 'Monitoring Anggaran & Realisasi') + '</small></div></div>' +
    '<h2 style="margin:0 0 6px">' + (daftar ? 'Daftar akun' : 'Masuk') + '</h2>' +
    '<p class="note" style="margin:0 0 16px">' + esc(catatan || (daftar
      ? 'Setelah mendaftar, admin keuangan akan mengaktifkan akun Anda dan menentukan cakupan unitnya.'
      : 'Masukkan email dan kata sandi akun dasbor.')) + '</p>' +
    '<form id="loginForm" style="display:grid;gap:12px;text-align:left">' +
    '<label class="f" for="lgId">Email<input type="email" id="lgId" autocomplete="username" required></label>' +
    '<label class="f" for="lgPw">Kata sandi<input type="password" id="lgPw" autocomplete="' + (daftar ? 'new-password' : 'current-password') + '" required minlength="8"></label>' +
    '<button class="btn primary" type="submit" id="lgBtn" style="justify-content:center">' + (daftar ? 'Daftar' : 'Masuk') + '</button>' +
    '<div id="lgMsg" class="note"></div></form>' +
    '<div class="tools" style="margin-top:14px;justify-content:center">' +
    '<button class="btn" type="button" id="lgSwitch">' + (daftar ? 'Sudah punya akun — Masuk' : 'Belum punya akun — Daftar') + '</button>' +
    (daftar ? '' : '<button class="btn" type="button" id="lgLupa">Lupa kata sandi</button>') + '</div>';
  $('lgSwitch').onclick = function(){ tampilMasuk('', daftar ? 'masuk' : 'daftar'); };
  if ($('lgLupa')) $('lgLupa').onclick = function(){
    var em = $('lgId').value.trim();
    if (!em) { $('lgMsg').textContent = 'Isi email dulu, lalu klik Lupa kata sandi.'; return; }
    SBC.auth.resetPasswordForEmail(em, { redirectTo: location.href.split('#')[0] })
      .then(function(){ $('lgMsg').textContent = 'Tautan penggantian kata sandi dikirim ke ' + em + '.'; })
      .catch(function(e){ $('lgMsg').textContent = errMsg(e); });
  };
  $('loginForm').onsubmit = function(e){
    e.preventDefault();
    var b = $('lgBtn'); b.disabled = true; $('lgMsg').textContent = daftar ? 'Mendaftarkan…' : 'Memeriksa…';
    var em = $('lgId').value.trim(), pw = $('lgPw').value;
    var aksi = daftar ? SBC.auth.signUp({ email: em, password: pw }) : SBC.auth.signInWithPassword({ email: em, password: pw });
    aksi.then(function(r){
      if (r.error) throw r.error;
      if (daftar && !r.data.session){
        b.disabled = false;
        $('lgMsg').textContent = 'Pendaftaran terkirim. Periksa email untuk konfirmasi, lalu hubungi admin agar akun diaktifkan.';
        return;
      }
      $('gate').hidden = true; $('boot').hidden = false; $('boot').textContent = 'Memuat dasbor…';
      mulai();
    }).catch(function(x){ b.disabled = false; $('lgMsg').textContent = errMsg(x); });
  };
  $('lgId').focus();
}

/* ---------- mulai ---------- */
function mulai(){
  SB.boot().then(function(b){
    $('boot').hidden = true;
    BOOT = b;
    if (!b.session.allowed){
      if (!b.session.email) { tampilMasuk('', 'masuk'); return; }
      tampilMasuk(b.session.tanpaCakupan
        ? 'Akun ' + b.session.email + ' sudah aktif tetapi belum diberi cakupan unit. Hubungi admin keuangan.'
        : 'Akun ' + b.session.email + ' belum diaktifkan admin keuangan.', 'masuk');
      SBC.auth.signOut();
      return;
    }
    AK = b.akunNames || {};
    $('gate').hidden = true; $('app').hidden = false;
    $('brandSub').textContent = (b.satker || '') + (b.kode ? ' · Satker ' + b.kode : '');
    var ps = b.periods;
    fillPeriods(ps.length ? ps[ps.length - 1].periode : null);
    if (!ps.length) { DB = null; refresh(); return; }
    loadData(ps[ps.length - 1].periode);
  }).catch(function(e){
    $('boot').hidden = false;
    $('boot').innerHTML = '<span class="neg">Dasbor gagal dimuat: ' + esc(errMsg(e)) + '</span>';
  });
}

if (sbInit()) mulai();

})();
