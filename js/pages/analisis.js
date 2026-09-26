/* js/pages/analisis.js — Unit Kerja, Sumber Dana, Jenis Belanja, Struktur DIPA */
import { esc, rp, rpk, pc, group, sum } from '../utils.js';
import { FAK_ORDER, SRC, rows, pill } from '../state.js';
import { card, actions, track, printHead, treeCard, LV } from '../ui-components.js';

/* ================= halaman analisis ================= */
export function unitSort(a,b){ var ka=a.key.split('|'),kb=b.key.split('|'); if(ka[0]!==kb[0]) return ka[0]==='Fakultas'?-1:1; var ia=FAK_ORDER.indexOf(ka[1]),ib=FAK_ORDER.indexOf(kb[1]); if(ia>=0&&ib>=0) return ia-ib; return b.pagu-a.pagu; }
function matrix(R,cols,colKey,colName){
  var gu=group(R,function(r){return r.kat+'|'+r.unit;}).sort(unitSort);
  var h='<div class="tbl"><table><thead><tr><th>Unit kerja</th>'+cols.map(function(c){return '<th class="n">'+colName(c)+' · pagu</th><th class="n">%</th>';}).join('')+'<th class="n">Total pagu</th><th class="n">%</th></tr></thead><tbody>';
  gu.forEach(function(g){ var p=g.key.split('|');
    h+='<tr><td><span class="note">'+esc(p[0])+'</span> <b>'+esc(p[1])+'</b></td>'+cols.map(function(c){ var s=sum(g.rows.filter(function(r){return colKey(r)===c;})); return s.pagu?'<td class="n">'+rp(s.pagu)+'</td><td class="n">'+pc(s.p)+'</td>':'<td class="n note">–</td><td class="n note">–</td>'; }).join('')+'<td class="n"><b>'+rp(g.pagu)+'</b></td><td class="n"><b>'+pc(g.p)+'</b></td></tr>'; });
  var T=sum(R);
  return h+'<tr class="tot"><td>Jumlah</td>'+cols.map(function(c){ var s=sum(R.filter(function(r){return colKey(r)===c;})); return '<td class="n">'+rp(s.pagu)+'</td><td class="n">'+pc(s.p)+'</td>'; }).join('')+'<td class="n">'+rp(T.pagu)+'</td><td class="n">'+pc(T.p)+'</td></tr></tbody></table></div>';
}
export function renderUnit(){
  var R=rows(), a2s=Object.keys(group(R,function(r){return r.a2;}).reduce(function(o,g){o[g.key]=1;return o;},{})).sort();
  return '<div class="page-sec grid">'+printHead('Realisasi per Unit Kerja')+
    card('c-mx1','Unit kerja × sumber dana','Pagu dan persentase realisasi setiap unit menurut sumber dana.',matrix(R,['RM','PNP'],function(r){return r.sumber;},function(c){return c==='PNP'?'PNBP':'RM';}))+
    card('c-mx2','Unit kerja × jenis belanja','Pagu dan persentase realisasi setiap unit menurut akun 51, 52, 53.',matrix(R,a2s,function(r){return r.a2;},function(c){return c;}))+
    treeCard('t-unit','Rincian unit kerja','Kategori → Unit → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.kat,LV.unit,LV.komp,LV.sub,LV.akun])+'</div>';
}
export function renderSumber(){
  var R=rows(), T=sum(R);
  var tiles=group(R,function(r){return r.sumber||'?';}).sort(function(a,b){return a.key==='RM'?-1:1;}).map(function(s){ var c=s.key==='RM'?'var(--rm)':'var(--pnbp)', id='c-s'+s.key.replace(/\W/g,'');
    return '<section class="glass card" id="'+id+'"><div class="card-h"><div class="eyebrow"><i class="dot" style="display:inline-block;background:'+c+';margin-right:6px"></i>'+(SRC[s.key]||'Belum dipetakan')+'</div>'+actions(id,'Sumber dana '+(SRC[s.key]||''))+'</div>'+
      '<div class="num" style="font-size:30px;font-weight:600;letter-spacing:-.04em">'+rpk(s.pagu)+'</div><div class="note">'+pc(T.pagu?s.pagu/T.pagu:0)+' dari pagu induk · Rp '+rp(s.pagu)+'</div>'+
      '<div style="display:flex;justify-content:space-between;margin:14px 0 6px"><span>Realisasi '+rpk(s.sd)+'</span><span class="pct">'+pc(s.p)+'</span></div>'+track(s.p,c)+
      '<div style="display:flex;justify-content:space-between;margin-top:10px;align-items:center"><span class="note">Sisa '+rpk(s.sisa)+'</span>'+pill(s.p)+'</div></section>'; }).join('');
  return '<div class="page-sec grid">'+printHead('Realisasi per Sumber Dana')+'<div class="two">'+tiles+'</div>'+
    treeCard('t-src','Rincian per sumber dana','Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',R,[LV.src,LV.a2,LV.a3,LV.akun])+'</div>';
}
export function renderJenis(){
  return '<div class="page-sec grid">'+printHead('Realisasi per Jenis Belanja')+
    treeCard('t-jenis','Rincian jenis belanja','Akun 2 digit → 3 digit → 6 digit → Detail belanja. Nama akun 2 dan 3 digit diatur di sheet Ref_Akun.',rows(),[LV.a2,LV.a3,LV.akun])+'</div>';
}
export function renderDipa(){
  return '<div class="page-sec grid">'+printHead('Struktur DIPA')+
    treeCard('t-dipa','Struktur DIPA','Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',rows(),[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun])+'</div>';
}
