/* js/pages/analisis.js — Unit Kerja, Sumber Dana, Jenis Belanja, Struktur DIPA */
import { esc, rp, rpk, pc, group, sum } from '../utils.js?v=202611280616';
import { FAK_ORDER, FAK_FULL, SRC, S, WAKTU, rows, pill, status, A2 } from '../state.js?v=202611280616';
import { card, actions, track, trackIdeal, printHead, treeCard, LV } from '../ui-components.js?v=202611280616';

/* ================= halaman analisis ================= */
export function unitSort(a,b){ var ka=a.key.split('|'),kb=b.key.split('|'); if(ka[0]!==kb[0]) return ka[0]==='Fakultas'?-1:1; var ia=FAK_ORDER.indexOf(ka[1]),ib=FAK_ORDER.indexOf(kb[1]); if(ia>=0&&ib>=0) return ia-ib; return b.pagu-a.pagu; }
/* kartu unit kerja: ikon bulat berwarna di atas, keterangan berikon, persentase realisasi + tombol "Lihat selengkapnya" */
var UK_WARNA=['#e84a7f','#1fae7a','#3d7fd6','#f26b2c','#8e5bd6','#e5604a','#2bb3c0','#c9a227','#d8487a','#4f6bd8'];
var UK_IK={
  fak:'<svg viewBox="0 0 24 24"><path d="M3 9.5 12 5l9 4.5-9 4.5z"/><path d="M7 11.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/><path d="M21 9.5v5"/></svg>',
  rek:'<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M5.5 20V9.5L12 5l6.5 4.5V20"/><path d="M9.5 20v-5h5v5"/><path d="M9 11h.01M15 11h.01"/></svg>',
  nama:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 4-5 7-5s5.8 1.7 7 5"/></svg>',
  pagu:'<svg viewBox="0 0 24 24"><rect x="3.5" y="6.5" width="17" height="11" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M7 9.5h.01M17 14.5h.01"/></svg>',
  real:'<svg viewBox="0 0 24 24"><path d="M4 19.5h16"/><path d="M6.5 15.5l4-4.5 3 3 4.5-6"/></svg>',
  sisa:'<svg viewBox="0 0 24 24"><path d="M5 7.5h14v11H5z"/><path d="M8 7.5V5.5h8v2"/><path d="M9 13h6"/></svg>'
};
var UK_TINTA={'st-good':'var(--good-ink)','st-warn':'var(--warn-ink)','st-crit':'var(--crit-ink)'};
export function renderUnit(){
  var R=rows();
  var gu=group(R,function(r){return r.kat+'|'+r.unit;}).sort(unitSort);
  var unitCard=function(g,i){
    var p=g.key.split('|'), fak=p[0]==='Fakultas', st=status(g.p,WAKTU);
    var full=FAK_FULL[p[1]]||(fak?'Fakultas':'Rektorat · '+p[1]);
    return '<article class="uk">'+
      '<span class="uk-ic" style="background:'+UK_WARNA[i%UK_WARNA.length]+'" aria-hidden="true">'+(fak?UK_IK.fak:UK_IK.rek)+'</span>'+
      '<h4 class="uk-nm" title="'+esc(full)+'">'+esc(p[1])+'</h4>'+
      '<span class="uk-meta">'+UK_IK.nama+'<span>'+esc(full)+'</span></span>'+
      '<span class="uk-meta">'+UK_IK.pagu+'<span>Pagu <b>Rp '+rpk(g.pagu)+'</b></span></span>'+
      '<span class="uk-meta">'+UK_IK.real+'<span>Realisasi <b>Rp '+rpk(g.sd)+'</b></span></span>'+
      '<span class="uk-meta">'+UK_IK.sisa+'<span>Sisa <b>Rp '+rpk(g.sisa)+'</b></span></span>'+
      '<div class="uk-ft"><span class="uk-prog"><small>Realisasi</small><b style="color:'+(UK_TINTA[st[0]]||'inherit')+'" title="'+esc(st[1])+'">'+pc(g.p)+'</b></span>'+
        '<button type="button" class="uk-btn" data-rincian-unit="'+esc(g.key)+'" aria-label="Lihat selengkapnya: '+esc(p[1])+'">Lihat selengkapnya</button></div></article>';
  };
  /* dikelompokkan per kategori (Fakultas lebih dulu), masing-masing dengan subtotal */
  var kats=[]; gu.forEach(function(g){ var k=g.key.split('|')[0]; if(kats.indexOf(k)<0) kats.push(k); });
  var ringkas=kats.map(function(k){ var gs=gu.filter(function(g){ return g.key.split('|')[0]===k; }); return { k:k, n:gs.length, t:sum([].concat.apply([],gs.map(function(g){ return g.rows; }))) }; });
  var idSec=function(k){ return 'uk-sec-'+String(k).replace(/\W+/g,''); };
  /* batang panah memanjang (seperti langkah wizard): satu ruas per kelompok, berisi angka & batang realisasi */
  var panah='<nav class="uk-step noprint" aria-label="Ringkasan Fakultas dan Rektorat">'+ringkas.map(function(x,i){
      var w=Math.min(100,Math.max(0,x.t.p*100));
      return '<button type="button" class="uk-st" data-uk-ke="'+idSec(x.k)+'" style="--uk-bg:'+(['#285ea6','#194276','#16264d'][i%3])+'">'+
        '<span class="uk-st-hd"><b>'+esc(x.k)+'</b><span class="uk-st-pct">'+pc(x.t.p)+'</span></span>'+
        '<span class="uk-st-sub">'+x.n+' unit · Pagu Rp '+rpk(x.t.pagu)+' · Realisasi Rp '+rpk(x.t.sd)+' · Sisa Rp '+rpk(x.t.sisa)+'</span>'+
        '<span class="uk-st-bar" role="img" aria-label="Realisasi '+esc(x.k)+' '+pc(x.t.p)+'"><i style="width:'+w.toFixed(1)+'%"></i></span></button>';
    }).join('')+'</nav>';
  var sections=kats.map(function(k){
    var gs=gu.filter(function(g){ return g.key.split('|')[0]===k; });
    return '<section class="unit-sec" id="'+idSec(k)+'" aria-label="'+esc(k)+'">'+
      '<div class="unit-sec-hd"><div><h3>'+esc(k)+'</h3><span class="note">'+gs.length+' unit</span></div></div>'+
      '<div class="uk-grid">'+gs.map(unitCard).join('')+'</div></section>';
  }).join('');
  return '<div class="page-sec grid">'+printHead()+
    '<section class="glass card" id="c-units">'+panah+sections+'</section></div>';
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
/* dua urutan penelusuran: dari unit (Fakultas/Rektorat ke bawah) atau dari KRO (melihat sebaran satu KRO ke unit-unit) */
export function renderUnitRincian(){
  var R=rows(), kro=S.unitView==='kro';
  var sw='<div class="seg-row noprint"><span class="note">Urutan penelusuran</span><div class="seg" role="group" aria-label="Urutan penelusuran">'+
    '<button type="button" data-unitview="unit" aria-pressed="'+!kro+'">Mulai dari unit</button>'+
    '<button type="button" data-unitview="kro" aria-pressed="'+kro+'">Mulai dari KRO</button></div></div>';
  var tc=kro
    ? treeCard('t-unit-kro','Sebaran KRO ke unit kerja','KRO → Unit → RO → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.kro,LV.katunit,LV.ro,LV.komp,LV.sub,LV.akun],undefined,sw)
    : treeCard('t-unit','Rincian unit kerja','Kategori → Unit → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',R,[LV.kat,LV.unit,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun],undefined,sw);
  return '<div class="page-sec grid">'+printHead()+tc+'</div>';
}
export function renderSumber(){
  var R=rows(), T=sum(R);
  var tiles=group(R,function(r){return r.sumber||'?';}).sort(function(a,b){return a.key==='RM'?-1:1;}).map(function(s){ var c=s.key==='RM'?'var(--rm)':'var(--pnbp)', id='c-s'+s.key.replace(/\W/g,'');
    return '<section class="glass card" id="'+id+'"><div class="card-h"><div class="eyebrow"><i class="dot" style="display:inline-block;background:'+c+';margin-right:6px"></i>'+(SRC[s.key]||'Belum dipetakan')+'</div>'+actions(id,'Sumber dana '+(SRC[s.key]||''))+'</div>'+
      '<div class="num" style="font-size:30px;font-weight:600;letter-spacing:-.04em">'+rpk(s.pagu)+'</div><div class="note">'+pc(T.pagu?s.pagu/T.pagu:0)+' dari pagu induk · Rp '+rp(s.pagu)+'</div>'+
      '<div style="display:flex;justify-content:space-between;margin:14px 0 6px"><span>Realisasi '+rpk(s.sd)+'</span><span class="pct">'+pc(s.p)+'</span></div>'+track(s.p,c)+
      '<div style="display:flex;justify-content:space-between;margin-top:10px;align-items:center"><span class="note">Sisa '+rpk(s.sisa)+'</span>'+pill(s.p)+'</div></section>'; }).join('');
  return '<div class="page-sec grid">'+printHead()+'<div class="two">'+tiles+'</div>'+
    treeCard('t-src','Rincian per sumber dana','Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',R,[LV.src,LV.a2,LV.a3,LV.akun])+'</div>';
}
export function renderJenis(){
  return '<div class="page-sec grid">'+printHead()+
    treeCard('t-jenis','Rincian jenis belanja','Akun 2 digit → 3 digit → 6 digit → Detail belanja. Nama akun 2 dan 3 digit diatur di sheet Ref_Akun.',rows(),[LV.a2,LV.a3,LV.akun])+'</div>';
}
export function renderDipa(){
  return '<div class="page-sec grid">'+printHead()+
    treeCard('t-dipa','Struktur DIPA','Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',rows(),[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun])+'</div>';
}
