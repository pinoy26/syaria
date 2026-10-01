/* js/pages/analisis.js — Unit Kerja, Sumber Dana, Jenis Belanja, Struktur DIPA */
import { esc, rp, rpk, pc, group, sum } from '../utils.js';
import { FAK_ORDER, SRC, rows, pill, A2 } from '../state.js';
import { card, actions, track, printHead, treeCard, LV } from '../ui-components.js';

/* ================= halaman analisis ================= */
export function unitSort(a,b){ var ka=a.key.split('|'),kb=b.key.split('|'); if(ka[0]!==kb[0]) return ka[0]==='Fakultas'?-1:1; var ia=FAK_ORDER.indexOf(ka[1]),ib=FAK_ORDER.indexOf(kb[1]); if(ia>=0&&ib>=0) return ia-ib; return b.pagu-a.pagu; }
export function renderUnit(){
  var R=rows();
  var gu=group(R,function(r){return r.kat+'|'+r.unit;}).sort(unitSort);
  var cards=gu.map(function(g){
    var p=g.key.split('|');
    return '<button type="button" class="unit-card" data-unit="'+esc(g.key)+'">'+
      '<span class="note">'+esc(p[0])+'</span><span class="nm">'+esc(p[1])+'</span>'+
      track(g.p,'var(--real)')+
      '<span class="row"><span class="pct">'+pc(g.p)+'</span><span class="note num">'+rpk(g.pagu)+'</span></span></button>';
  }).join('');
  return '<div class="page-sec grid">'+printHead('Unit Kerja')+
    card('c-units','Unit kerja','Klik salah satu unit untuk melihat rincian sumber dana dan jenis belanjanya.','<div class="unit-grid">'+cards+'</div>')+'</div>';
}
export function unitModalHtml(key){
  var gu=group(rows(),function(r){return r.kat+'|'+r.unit;});
  var g=gu.filter(function(x){ return x.key===key; })[0];
  if (!g) return '';
  var p=key.split('|');
  var bySrc=group(g.rows,function(r){return r.sumber||'?';}).sort(function(a,b){return a.key==='RM'?-1:1;});
  var srcRows=bySrc.map(function(s){ return '<tr><td>'+esc(SRC[s.key]||'Belum dipetakan')+'</td><td class="n">'+rp(s.pagu)+'</td><td class="n">'+rp(s.sd)+'</td><td class="n">'+pc(s.p)+'</td></tr>'; }).join('');
  var byA2=group(g.rows,function(r){return r.a2;}).sort(function(a,b){return a.key<b.key?-1:1;});
  var a2Rows=byA2.map(function(g2){ return '<tr><td>'+g2.key+' '+esc(A2(g2.key))+'</td><td class="n">'+rp(g2.pagu)+'</td><td class="n">'+rp(g2.sd)+'</td><td class="n">'+pc(g2.p)+'</td></tr>'; }).join('');
  return '<div class="modal-hd"><div><span class="note">'+esc(p[0])+'</span><h3>'+esc(p[1])+'</h3></div>'+
      '<button type="button" class="icon" data-modal-close aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'+
    '<div style="margin-bottom:14px">'+pill(g.p)+' <span class="note num" style="margin-left:8px">Pagu '+rpk(g.pagu)+'</span></div>'+
    '<div class="unit-mini">'+
      '<div><div class="eyebrow" style="margin-bottom:8px">Sumber dana</div><div class="tbl"><table><thead><tr><th>Sumber</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th></tr></thead><tbody>'+srcRows+'</tbody></table></div></div>'+
      '<div><div class="eyebrow" style="margin-bottom:8px">Jenis belanja</div><div class="tbl"><table><thead><tr><th>Akun</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th></tr></thead><tbody>'+a2Rows+'</tbody></table></div></div>'+
    '</div>'+
    '<div class="tools" style="margin-top:16px"><button class="btn primary" type="button" data-goto-rincian="'+esc(key)+'">Lihat rincian lengkap →</button></div>';
}
export function renderUnitRincian(){
  var R=rows();
  return '<div class="page-sec grid">'+printHead('Rincian Unit Kerja')+
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
