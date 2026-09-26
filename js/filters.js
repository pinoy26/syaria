/* js/filters.js — panel filter cakupan data */
import { $, esc, tgl, pc } from './utils.js';
import { S, D, CHAIN, FLABEL, SRC, FAK_ORDER, DB, WAKTU, scoped, applyF, isUnitUser, sess, scopeLabel, unitCaption, A2, A3, EMPTY_F, subName } from './state.js';
import { refresh } from './nav.js';

function optName(k,v,r){
  var m={prog:D.program,keg:D.kegiatan,kro:D.kro,ro:D.ro,komp:D.komp}[k];
  if (m) return v+' — '+(m[v]||'');
  if (k==='sub') return v+' — '+subName(r);
  return v;
}
export function renderFilters(){
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
