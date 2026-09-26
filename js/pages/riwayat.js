/* js/pages/riwayat.js — Riwayat & Revisi */
import { $, esc, rp, pc, poin, tgl, group, sum, errMsg } from '../utils.js';
import { S, BOOT, DB, rows } from '../state.js';
import { card, printHead } from '../ui-components.js';
import { unitSort } from './analisis.js';
import { trendKey } from './ringkasan.js';
import { SB } from '../api.js';

/* ================= riwayat & revisi ================= */
export function renderRiwayat(){
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
export function loadCompare(){
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
