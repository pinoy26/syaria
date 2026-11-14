/* js/pages/perhatian.js — Perlu Perhatian */
import { esc, rp, pc, group, sum } from '../utils.js?v=202611141310';
import { rows, subName, pill } from '../state.js?v=202611141310';
import { card, printHead } from '../ui-components.js?v=202611141310';

/* ================= perlu perhatian ================= */
export function renderPerhatian(){
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
  return '<div class="page-sec grid">'+printHead()+
    card('c-minus','Pagu minus','Detail dengan realisasi melebihi pagu — perlu usulan revisi DIPA.',mb)+
    card('c-low','Sub komponen penyerapan rendah','Pagu ≥ Rp 20 juta dan realisasi di bawah 30%, urut sisa terbesar.',lb)+
    card('c-zero','Detail belum terealisasi per unit','Jumlah detail belanja yang realisasinya masih Rp 0.',zb)+
    (nos.length?card('c-nosd','Detail tanpa sumber dana',nos.length+' detail belum punya sumber dana. Admin perlu mengunggah RKK terbaru lalu menerapkan ulang pemetaan.','<p class="note">Pagu terdampak: Rp '+rp(sum(nos).pagu)+'</p>'):'')+'</div>';
}
