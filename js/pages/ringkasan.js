/* js/pages/ringkasan.js — halaman Ringkasan Realisasi */
import { $, esc, rp, rpk, pc, poin, tgl, tglPendek, yearFrac, endPrevMonth, sum, group, errMsg } from '../utils.js';
import { WAKTU, DB, D, S, SRC, FAK_ORDER, FAK_FULL, rows, unitCaption, isUnitUser, A2, status, pill } from '../state.js';
import { card, actions, tipAttr, tipOf, track, printHead, IC, bindTips } from '../ui-components.js';
import { SB } from '../api.js';

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
export function renderRingkasan(){
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
export function trendKey(){ return JSON.stringify(S.f); }
export function loadTrend(){
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
