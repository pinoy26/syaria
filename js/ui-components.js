/* js/ui-components.js — kartu, tooltip, tabel bertingkat (komponen UI umum) */
import { $, esc, rp, pc, sum, tgl } from './utils.js';
import { WAKTU, BOOT, DB, sess, scopeText, D, FAK_ORDER, FAK_FULL, SRC, S, pill, A2, A3 } from './state.js';

/* ================= komponen UI ================= */
export var IC = {
  pdf:'<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>',
  print:'<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.5-.2 4.4 1.4 5 4.8"/></svg>',
  box:'<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/></svg>',
  build:'<svg viewBox="0 0 24 24"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>'
};
export function actions(id,title){ return '<div class="card-a" data-html2canvas-ignore="true"><button class="icon" type="button" data-pdf="'+id+'" data-title="'+esc(title)+'" aria-label="Unduh PDF '+esc(title)+'" title="Unduh PDF">'+IC.pdf+'</button><button class="icon" type="button" data-print="'+id+'" aria-label="Cetak '+esc(title)+'" title="Cetak">'+IC.print+'</button></div>'; }
export function card(id,title,sub,body){
  return '<section class="glass card" id="'+id+'"><div class="card-h"><div><h2>'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+actions(id,title.replace(/&amp;/g,'&'))+'</div>'+body+'</section>';
}
var tip=$('tip');
export function showTip(e,html){ tip.innerHTML=html; tip.style.display='block'; var x=e.clientX+14,y=e.clientY+14,w=tip.offsetWidth,h=tip.offsetHeight; if(x+w>innerWidth-8)x=e.clientX-w-14; if(y+h>innerHeight-8)y=e.clientY-h-14; tip.style.left=x+'px'; tip.style.top=y+'px'; }
export function hideTip(){ tip.style.display='none'; }
export function tipOf(name,t){ return '<b>'+esc(name)+'</b><div class="num">Pagu&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.pagu)+'<br>Realisasi Rp '+rp(t.sd)+' ('+pc(t.p)+')<br>Periode ini Rp '+rp(t.ini)+'<br>Sisa&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.sisa)+'</div>'; }
var TIPS=[];
export function tipAttr(html){ TIPS.push(html); return ' data-tip="'+(TIPS.length-1)+'"'; }
export function track(p,color){ return '<span class="track"><span class="fill" style="width:'+Math.min(100,Math.max(0,p*100))+'%;background:'+(p>1.0001?'var(--crit)':color)+'"></span><span class="mark" style="left:calc('+(WAKTU*100)+'% - 1px)"></span></span>'; }
export function printHead(title){ return '<div class="printhead"><b>'+esc(BOOT.satker)+' · Satker '+esc(BOOT.kode)+'</b>'+esc(title)+' · Posisi data '+tgl(DB.periode)+'<br>Cakupan: '+esc(scopeText())+' · Dicetak '+new Date().toLocaleString('id-ID')+' oleh '+esc(sess().email)+' · Sumber: Laporan Ketersediaan Dana Detail (SAKTI)</div>'; }
export function bindTips(root){
  [].forEach.call(root.querySelectorAll('[data-tip]'),function(el){ var html=TIPS[+el.getAttribute('data-tip')]; el.addEventListener('mousemove',function(e){showTip(e,html);}); el.addEventListener('mouseleave',hideTip); });
}

/* ================= modal ================= */
export function openModal(html){
  $('modal').innerHTML=html; $('modal').hidden=false; $('modalBd').hidden=false;
  bindTips($('modal'));
  requestAnimationFrame(function(){ $('modal').classList.add('open'); $('modalBd').classList.add('open'); });
}
export function closeModal(){
  $('modal').classList.remove('open'); $('modalBd').classList.remove('open');
  setTimeout(function(){ $('modal').hidden=true; $('modalBd').hidden=true; $('modal').innerHTML=''; },200);
}

/* ================= TABEL BERTINGKAT ================= */
var TREES={};
export function clearPageState(){ TIPS.length=0; TREES={}; }
export function tree(id,R,levels){
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
export function treeCard(id,title,sub,R,levels){ TREES[id]={rows:R,levels:levels}; return card(id,title,sub,tree(id,R,levels)); }
export function openLevel(id){
  var T=TREES[id]; if(!T) return;
  var ids={}; Object.keys(S.open).forEach(function(k){ if(S.open[k]&&k.indexOf(id+'/')===0) ids[k]=1; });
  // buka tingkat berikutnya dari yang sudah terbuka paling dalam
  var depthOpen=0; Object.keys(ids).forEach(function(k){ depthOpen=Math.max(depthOpen,k.split('/').length-1); });
  var d=Math.min(depthOpen,T.levels.length-1);
  T.rows.forEach(function(r){ var p=id; for(var i=0;i<=d;i++){ p+='/'+T.levels[i].key(r); if(i===d) S.open[p]=true; else if(!S.open[p]) return; } });
}
export var LV={
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
