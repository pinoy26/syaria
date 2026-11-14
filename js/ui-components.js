/* js/ui-components.js — kartu, tooltip, tabel bertingkat (komponen UI umum) */
import { $, esc, rp, pc, sum, tgl, bukaJendela, tutupJendela } from './utils.js?v=202611141509';
import { WAKTU, BOOT, DB, D, FAK_ORDER, FAK_FULL, SRC, S, pill, status, A2, A3 } from './state.js?v=202611141509';

/* ================= komponen UI ================= */
export var IC = {
  pdf:'<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>',
  print:'<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.5-.2 4.4 1.4 5 4.8"/></svg>',
  box:'<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/></svg>',
  build:'<svg viewBox="0 0 24 24"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>',
  stGood:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  stWarn:'<svg viewBox="0 0 24 24"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>',
  stCrit:'<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  up:'<svg viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"/></svg>',
  down:'<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>'
};
/* cetak/unduh per kartu dipindah ke halaman Laporan — kartu biasa tidak punya tombol sendiri lagi */
export function actions(id,title){ return ''; }
export function card(id,title,sub,body,act){
  return '<section class="glass card" id="'+id+'"><div class="card-h"><div><h2>'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+(act!==undefined?act:actions(id,title.replace(/&amp;/g,'&')))+'</div>'+body+'</section>';
}
var tip=$('tip');
export function showTip(e,html){ tip.innerHTML=html; tip.style.display='block'; var x=e.clientX+14,y=e.clientY+14,w=tip.offsetWidth,h=tip.offsetHeight; if(x+w>innerWidth-8)x=e.clientX-w-14; if(y+h>innerHeight-8)y=e.clientY-h-14; tip.style.left=x+'px'; tip.style.top=y+'px'; }
export function hideTip(){ tip.style.display='none'; }
export function tipOf(name,t){ return '<b>'+esc(name)+'</b><div class="num">Pagu&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.pagu)+'<br>Realisasi Rp '+rp(t.sd)+' ('+pc(t.p)+')<br>Periode ini Rp '+rp(t.ini)+'<br>Sisa&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(t.sisa)+'</div>'; }
var TIPS=[];
export function tipAttr(html){ TIPS.push(html); return ' data-tip="'+(TIPS.length-1)+'"'; }
export function track(p,color){
  var c=p>1.0001?'var(--crit)':color;
  var grad='linear-gradient(90deg, color-mix(in srgb, '+c+' 35%, transparent), '+c+')';
  return '<span class="track"><span class="fill" style="width:'+Math.min(100,Math.max(0,p*100))+'%;background:'+grad+'"></span><span class="mark" style="left:calc('+(WAKTU*100)+'% - 1px)"></span></span>';
}
/* batang realisasi bergradasi merah → kuning → hijau, dipatok ke lebar penuh track:
   hijau tepat di garis ideal (waktu berjalan), mengikuti ambang status (≥ −5 poin hijau, −5…−20 kuning, < −20 merah).
   Batang yang masih pendek hanya memperlihatkan bagian merah/kuning; melebihi pagu tetap merah. */
export function trackIdeal(p){
  var w=Math.min(100,Math.max(0,p*100)), W=WAKTU*100, bg;
  if (p>1.0001) bg='var(--crit)';
  else {
    var a=Math.max(0,W-25), b=Math.max(a,W-12.5), c=Math.max(b,W-5);
    bg='linear-gradient(90deg, var(--crit) 0%, var(--crit) '+a.toFixed(1)+'%, var(--warn) '+b.toFixed(1)+'%, var(--good) '+c.toFixed(1)+'%, var(--good) 100%) 0 0 / '+(w>0?(10000/w).toFixed(2):100)+'% 100% no-repeat';
  }
  return '<span class="track"><span class="fill" style="width:'+w+'%;background:'+bg+'"></span><span class="mark" style="left:calc('+W+'% - 1px)"></span></span>';
}
export function printHead(){
  var unitNama='';
  if (S.f.unit){
    var u=S.f.unit.split('|');
    unitNama=u[1]?(FAK_FULL[u[1]]||u[1]):('Seluruh '+u[0]);
  }
  return '<div class="printhead">'+
    '<div class="kop-inst"><b>'+esc(BOOT.satker)+'</b>'+(unitNama?'<br><b>'+esc(unitNama)+'</b>':'')+'<br><span>Realisasi sampai dengan '+tgl(DB.periode)+'</span></div>'+
    '<div class="kop-garis"></div>'+
  '</div>';
}
/* tooltip: mouse (ikut kursor), sentuh (ketuk untuk buka/tutup) & keyboard (muncul saat elemen difokus) */
var tipOwner=null;
function tipNearEl(el,html){ var r=el.getBoundingClientRect(); showTip({clientX:r.left+Math.min(r.width/2,60),clientY:r.bottom-6},html); tipOwner=el; }
function closeTip(){ hideTip(); tipOwner=null; }
document.addEventListener('pointerdown',function(e){ if(tipOwner && e.pointerType!=='mouse' && !e.target.closest('[data-tip]')) closeTip(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape' && tipOwner) closeTip(); });
window.addEventListener('scroll',function(){ if(tipOwner) closeTip(); },{passive:true,capture:true});
export function bindTips(root){
  [].forEach.call(root.querySelectorAll('[data-tip]'),function(el){
    var html=TIPS[+el.getAttribute('data-tip')];
    var clickable=el.matches('button,a,[data-goa2],[data-unit]');
    el.addEventListener('pointermove',function(e){ if(e.pointerType==='mouse'){ showTip(e,html); tipOwner=el; } });
    el.addEventListener('pointerleave',function(e){ if(e.pointerType==='mouse') closeTip(); });
    /* sentuh: ketuk pertama membuka, ketuk lagi menutup; elemen yang bisa diklik tetap menjalankan aksinya */
    el.addEventListener('pointerup',function(e){
      if (e.pointerType==='mouse' || clickable) return;
      if (tipOwner===el) closeTip(); else { showTip(e,html); tipOwner=el; }
    });
    if (!el.matches('button,a,input,select,textarea')) el.setAttribute('tabindex','0');
    el.addEventListener('focus',function(){
      var kb=true; try{ kb=el.matches(':focus-visible'); }catch(err){}
      if (kb){ tipNearEl(el,html); el.setAttribute('aria-describedby','tip'); }
    });
    el.addEventListener('blur',function(){ if(tipOwner===el) closeTip(); el.removeAttribute('aria-describedby'); });
  });
}

/* ================= cari di tabel bertingkat (lompat + sorot, mirip Ctrl+F) ================= */
export function bindTreeSearch(root){
  [].forEach.call(root.querySelectorAll('[data-search-input]'),function(inp){
    var id=inp.getAttribute('data-search-input');
    var host=document.getElementById(id);
    var table=host&&host.querySelector('.tbl-grid');
    var countEl=root.querySelector('[data-search-count="'+id+'"]');
    var prevBtn=root.querySelector('[data-search-prev="'+id+'"]');
    var nextBtn=root.querySelector('[data-search-next="'+id+'"]');
    var matches=[], idx=-1;
    function clear(){ matches.forEach(function(el){ el.classList.remove('search-hit','search-hit-active'); }); }
    function updateCount(){ if(!countEl) return; countEl.textContent=matches.length?((idx+1)+'/'+matches.length):(inp.value.trim()?'0/0':''); }
    function goTo(i){
      if (!matches.length) return;
      if (idx>=0&&matches[idx]) matches[idx].classList.remove('search-hit-active');
      idx=((i%matches.length)+matches.length)%matches.length;
      matches[idx].classList.add('search-hit-active');
      matches[idx].scrollIntoView({block:'center',behavior:'smooth'});
      updateCount();
    }
    function run(){
      clear(); matches=[]; idx=-1;
      var q=inp.value.trim().toLowerCase();
      if (q&&table){
        [].forEach.call(table.querySelectorAll('td:first-child'),function(td){
          if (td.textContent.toLowerCase().indexOf(q)>=0){ matches.push(td); td.classList.add('search-hit'); }
        });
      }
      updateCount();
      if (matches.length) goTo(0);
    }
    inp.oninput=run;
    inp.onkeydown=function(e){ if (e.key==='Enter'){ e.preventDefault(); goTo(idx+(e.shiftKey?-1:1)); } };
    if (prevBtn) prevBtn.onclick=function(){ goTo(idx-1); };
    if (nextBtn) nextBtn.onclick=function(){ goTo(idx+1); };
  });
}

/* ================= modal ================= */
export function openModal(html,onClose){ bukaJendela(html,onClose); bindTips($('modal')); }
export function closeModal(){ tutupJendela(); }

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
    node.children=order.map(function(k){ var n={id:node.id+'/'+k,key:k,rows:m[k],depth:depth,lvl:L.lvl,cls:L.cls,label:L.label(k,m[k][0])}; n.t=sum(m[k]); return n; });
    node.children.forEach(function(c){ build(c,depth+1); });
  })(root,0);
  var out=[];
  var ST_ICON={'st-good':IC.stGood,'st-warn':IC.stWarn,'st-crit':IC.stCrit};
  var statusBadge=function(p){ var s=status(p,WAKTU); return '<span class="st-badge '+s[0]+'" title="'+esc(s[1])+'" aria-label="'+esc(s[1])+'">'+ST_ICON[s[0]]+'</span>'; };
  var cols=function(t){ return '<td class="n">'+rp(t.pagu)+'</td><td class="n">'+rp(t.sd)+'</td><td class="n">'+rp(t.ini)+'</td><td class="n">'+pc(t.p)+'<span class="minibar"><b style="width:'+Math.min(100,t.p*100)+'%;'+(t.p>1.0001?'background:var(--crit)':'')+'"></b></span></td><td class="n'+(t.sisa<0?' neg':'')+'">'+rp(t.sisa)+'</td><td class="stc">'+statusBadge(t.p)+'</td>'; };
  (function walk(n){
    n.children.forEach(function(c){
      var open=!!S.open[c.id], ind=c.depth*18;
      out.push('<tr class="tree l'+c.depth+(c.cls?' '+c.cls:'')+'"><td><span class="tw" style="padding-left:'+ind+'px"><button type="button" data-tog="'+esc(c.id)+'" aria-expanded="'+open+'" aria-label="Buka atau tutup">'+IC.chev+'</button><span class="lvl">'+c.lvl+'</span><span class="tw-label">'+c.label+'</span></span></td>'+cols(c.t)+'</tr>');
      if (!open) return;
      if (c.leaf) c.rows.slice().sort(function(a,b){return a.no<b.no?-1:1;}).forEach(function(r){
        out.push('<tr class="leaf"><td><span style="padding-left:'+(ind+44)+'px;display:inline-block"><span class="code">'+esc(r.no)+'</span> '+esc(r.item)+' <span class="chip" style="font-size:11px;padding:1px 7px">'+(r.sumber==='PNP'?'PNBP':(r.sumber||'?'))+'</span></span></td>'+cols(sum([r]))+'</tr>');
      }); else walk(c);
    });
  })(root);
  var legend='<div class="st-legend noprint"><span><span class="st-badge st-good">'+IC.stGood+'</span>Sesuai jadwal</span><span><span class="st-badge st-warn">'+IC.stWarn+'</span>Perlu percepatan</span><span><span class="st-badge st-crit">'+IC.stCrit+'</span>Kritis — melebihi pagu / tertinggal jauh</span></div>';
  var search='<span class="tree-search">'+IC.search+'<input type="text" data-search-input="'+id+'" placeholder="Cari nama…" aria-label="Cari nama"><span class="tree-search-count" data-search-count="'+id+'"></span>'+
    '<button type="button" class="icon" data-search-prev="'+id+'" aria-label="Hasil sebelumnya">'+IC.up+'</button>'+
    '<button type="button" class="icon" data-search-next="'+id+'" aria-label="Hasil berikutnya">'+IC.down+'</button></span>';
  return '<div class="tools noprint" style="margin-bottom:10px"><button class="btn" type="button" data-openall="'+id+'">Buka satu tingkat</button><button class="btn" type="button" data-expandall="'+id+'">Buka semua</button><button class="btn" type="button" data-closeall="'+id+'">Tutup semua</button>'+search+legend+'</div>'+
    '<div class="tbl tbl-grid"><table><thead><tr><th>Uraian</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">Periode ini</th><th class="n">%</th><th class="n">Sisa</th><th class="stc">Status</th></tr></thead><tbody>'+out.join('')+
    '<tr class="tot"><td>Jumlah</td>'+cols(sum(R))+'</tr></tbody></table></div>';
}
/* pre: isi tambahan di atas tabel (mis. tombol pilihan urutan) */
export function treeCard(id,title,sub,R,levels,act,pre){ TREES[id]={rows:R,levels:levels}; return card(id,title,sub,(pre||'')+tree(id,R,levels),act); }
export function openLevel(id){
  var T=TREES[id]; if(!T) return;
  var ids={}; Object.keys(S.open).forEach(function(k){ if(S.open[k]&&k.indexOf(id+'/')===0) ids[k]=1; });
  // buka tingkat berikutnya dari yang sudah terbuka paling dalam
  var depthOpen=0; Object.keys(ids).forEach(function(k){ depthOpen=Math.max(depthOpen,k.split('/').length-1); });
  var d=Math.min(depthOpen,T.levels.length-1);
  T.rows.forEach(function(r){ var p=id; for(var i=0;i<=d;i++){ p+='/'+T.levels[i].key(r); if(i===d) S.open[p]=true; else if(!S.open[p]) return; } });
}
export function openAll(id){
  var T=TREES[id]; if(!T) return;
  T.rows.forEach(function(r){ var p=id; T.levels.forEach(function(L){ p+='/'+L.key(r); S.open[p]=true; }); });
}
export var LV={
  prog:{lvl:'Program',key:function(r){return r.prog;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.program[k]);}},
  keg:{lvl:'Kegiatan',key:function(r){return r.keg;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.kegiatan[k]);}},
  kro:{lvl:'KRO',cls:'lv-kro',key:function(r){return r.kro;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.kro[k]);}},
  ro:{lvl:'RO',cls:'lv-ro',key:function(r){return r.ro;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.ro[k]);}},
  komp:{lvl:'Komponen',cls:'lv-komp',key:function(r){return r.komp;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.komp[k]);}},
  sub:{lvl:'Sub Komp',cls:'lv-sub',key:function(r){return r.ro+'|'+r.sub;},label:function(k){var full=k.split('|')[1],parts=full.split('.'); return '<b class="code">'+esc(parts[parts.length-1])+'</b> '+esc(D.sub[k]);}},
  akun:{lvl:'Akun',cls:'lv-akun',key:function(r){return r.akun;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(D.akun[k]);}},
  a2:{lvl:'Jenis',key:function(r){return r.a2;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(A2(k));}},
  a3:{lvl:'Akun 3',key:function(r){return r.a3;},label:function(k){return '<b class="code">'+esc(k)+'</b> '+esc(A3(k));}},
  /* unit lengkap dengan kategorinya — dipakai saat penelusuran dimulai dari KRO */
  katunit:{lvl:'Unit',key:function(r){return r.kat+'|'+r.unit;},
    label:function(k){ var p=k.split('|'); return FAK_FULL[p[1]] ? '<b>'+esc(p[1])+'</b> <span class="note">'+FAK_FULL[p[1]]+'</span>' : '<span class="note">'+esc(p[0])+'</span> <b>'+esc(p[1])+'</b>'; },
    sort:function(a,b){ var pa=a.split('|'),pb=b.split('|'); if(pa[0]!==pb[0]) return pa[0]==='Fakultas'?-1:pb[0]==='Fakultas'?1:(pa[0]<pb[0]?-1:1);
      var ia=FAK_ORDER.indexOf(pa[1]),ib=FAK_ORDER.indexOf(pb[1]); if(ia>=0&&ib>=0) return ia-ib; if(ia>=0||ib>=0) return ia>=0?-1:1; return pa[1]<pb[1]?-1:1; }},
  kat:{lvl:'Kategori',key:function(r){return r.kat;},label:function(k){return esc(k);},sort:function(a,b){return a==='Fakultas'?-1:b==='Fakultas'?1:(a<b?-1:1);}},
  unit:{lvl:'Unit',key:function(r){return r.unit;},label:function(k){return '<b>'+esc(k)+'</b>'+(FAK_FULL[k]?' <span class="note">'+FAK_FULL[k]+'</span>':'');},sort:function(a,b){var ia=FAK_ORDER.indexOf(a),ib=FAK_ORDER.indexOf(b);if(ia>=0||ib>=0)return (ia<0?99:ia)-(ib<0?99:ib);return a<b?-1:1;}},
  src:{lvl:'Sumber',key:function(r){return r.sumber||'?';},label:function(k){return SRC[k]||'Belum dipetakan';},sort:function(a,b){return a==='RM'?-1:b==='RM'?1:0;}}
};
