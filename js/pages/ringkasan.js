/* js/pages/ringkasan.js — halaman Ringkasan Realisasi */
import { $, esc, rp, pc, poin, tgl, tglPendek, blnTahun, yearFrac, endPrevMonth, sum, group, errMsg } from '../utils.js?v=202611141322';
import { WAKTU, DB, D, S, SRC, FAK_ORDER, FAK_FULL, rows, unitCaption, isUnitUser, A2, status, pill } from '../state.js?v=202611141322';
import { card, tipAttr, tipOf, track, printHead, IC, bindTips } from '../ui-components.js?v=202611141322';
import { SB } from '../api.js?v=202611141322';

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
  var h='<div class="page-sec grid">'+printHead();
  /* header: banner Total Pagu / Realisasi / Sisa + batang komposisi, gauge realisasi vs waktu di samping */
  var pSisa=t.pagu?t.sisa/t.pagu:0, wBar=Math.min(100,Math.max(0,t.p*100));
  var tglPanjang=(+DB.periode.split('-')[2])+' '+blnTahun(DB.periode);
  var info='<span class="bn-i" tabindex="0" role="img" aria-label="Pagu revisi yang berlaku per '+esc(tglPanjang)+'" title="Pagu revisi yang berlaku per '+esc(tglPanjang)+'"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></span>';
  h+='<section class="glass hero hero2" id="c-hero"><div class="card-h hero-hd"></div>'+
    '<div class="banner">'+
      '<div class="bn-top">'+
        '<div class="bn-pagu"><div class="bn-lbl">Total Pagu '+info+'<span class="bn-cap">'+esc(unitCaption())+'</span></div>'+
          '<div class="bn-amt"><small>Rp</small>'+rp(t.pagu)+'</div></div>'+
        '<div class="bn-boxes">'+
          '<div class="bn-box bn-real"><span>Realisasi Belanja</span><b><small>Rp</small>'+rp(t.sd)+'</b></div>'+
          '<div class="bn-box bn-sisa"><span>Sisa Pagu</span><b><small>Rp</small>'+(t.sisa<0?'−':'')+rp(Math.abs(t.sisa))+'</b></div>'+
        '</div></div>'+
      '<div class="bn-pct"><span>Total Realisasi Belanja <b>'+pc(t.p)+'</b></span><span>Sisa Pagu <b>'+pc(pSisa)+'</b></span></div>'+
      '<div class="bn-bar" role="img" aria-label="Realisasi '+pc(t.p)+' dari pagu, sisa '+pc(pSisa)+'"><span class="bn-fill" style="width:'+wBar+'%"><em>'+pc(t.p)+'</em></span></div>'+
      '<div class="bn-foot">'+
        '<span class="bn-leg"><i></i><span>Realisasi periode ini<br><b><small>Rp</small> '+rp(t.ini)+'</b> <span class="bn-sub">'+poin(t.pagu?t.ini/t.pagu:0)+'</span></span></span>'+
        (t.lock?'<span class="bn-leg bn-lock"><i></i><span>Lock pagu (proses revisi)<br><b><small>Rp</small> '+rp(t.lock)+'</b></span></span>':'')+
        '<span class="bn-date">Data per '+esc(tglPanjang)+'</span>'+
      '</div>'+
    '</div>'+
    '<div class="gauge">'+gauge(t.p)+pill(t.p)+
      '<div class="gauge-legend"><span><i class="sw" style="background:var(--real)"></i>Realisasi</span><span><i class="sw tick"></i>Waktu berjalan</span></div>'+
      (isUnitUser()?'<div class="note">Pembanding: capaian satker '+pc(DB.satkerPersen)+'</div>':'')+
    '</div></section>';

  var bySrc=group(R,function(r){return r.sumber||'?';}).sort(function(a,b){return b.pagu-a.pagu;});
  var srcCol=function(k){ return k==='RM'?'var(--rm)':k==='PNP'?'var(--pnbp)':'var(--muted)'; };
  var srcName=function(k){ return SRC[k]||'Belum dipetakan'; };
  var RP=function(v){ return '<small>Rp</small> '+rp(v); };
  /* baris kedua: khusus REALISASI per sumber dana & per jenis belanja — angka ditulis penuh */
  var realRow=function(nm,g,col,attrs,tag){
    tag=tag||'div';
    var v=function(lbl,val,cls){ return '<span class="rz-v"><span class="rz-lbl">'+lbl+' <small>(Rp)</small></span><b'+(cls?' class="'+cls+'"':'')+'>'+rp(val)+'</b></span>'; };
    return '<'+tag+' class="rz-row"'+(attrs||'')+'>'+
      '<span class="rz-hd"><span class="nm">'+nm+'</span><span class="rz-pct">'+pc(g.p)+' <small>terealisasi</small></span></span>'+
      track(g.p,col)+
      '<span class="rz-vals">'+v('Pagu',g.pagu)+v('Realisasi',g.sd)+v('Sisa anggaran',g.sisa,g.sisa<0?'neg':'')+'</span>'+
    '</'+tag+'>';
  };
  var srcBody='<div class="rz-list">'+bySrc.map(function(s){
      return realRow('<i class="dot" style="background:'+srcCol(s.key)+'"></i>'+esc(srcName(s.key)),s,srcCol(s.key));
    }).join('')+'</div>';
  var byA2=group(R,function(r){return r.a2;}).sort(function(a,b){return a.key<b.key?-1:1;});
  var icons={'51':IC.people,'52':IC.box,'53':IC.build};
  /* warna identitas jenis belanja (sama di kartu realisasi, grafik, dan donat porsi) */
  var catCol=function(k){ return 'var(--cat-'+(k==='51'?1:k==='52'?2:3)+')'; };
  var catSw=function(k){ return '<span class="cat-sw" style="background:'+catCol(k)+'" aria-hidden="true"></span>'; };
  var typesBody='<div class="rz-list">'+byA2.map(function(g){
      return realRow(catSw(g.key)+'<span class="rz-ic">'+(icons[g.key]||IC.box)+'</span><span><span class="code">Akun '+g.key+'</span> '+esc(A2(g.key))+'</span>',g,'var(--real)',' type="button" data-goa2="'+g.key+'"','button');
    }).join('')+'</div>';
  /* dua sisi: kiri realisasi (sumber dana di atas, jenis belanja di bawah), kanan berita & pengumuman */
  h+='<div class="rk-split"><div class="rk-main">'+card('c-src','Realisasi per sumber dana','Capaian realisasi masing-masing sumber dana terhadap pagunya.',srcBody)+
    card('c-type','Realisasi per jenis belanja','Akun 51, 52, 53. Klik untuk merinci.',typesBody)+'</div>'+
    '<div class="rk-side noprint">'+card('c-berita','Berita &amp; Pengumuman','Informasi terbaru dari admin keuangan.','<div id="rkBerita"><div class="loading" style="padding:24px 0">Memuat berita…</div></div>','')+'</div></div>';

  var cells=[]; byA2.forEach(function(g){ ['RM','PNP'].forEach(function(s){ cells.push(sum(g.rows.filter(function(r){return r.sumber===s;}))); }); });
  var max=Math.max.apply(null,cells.map(function(c){return c.pagu;}).concat([1]));
  var jBody='<div class="legend"><span><i class="sw ghost" style="background:var(--rm)"></i><i class="sw" style="background:var(--rm);margin-left:-4px"></i>RM — pagu (pudar) &amp; realisasi</span><span><i class="sw ghost" style="background:var(--pnbp)"></i><i class="sw" style="background:var(--pnbp);margin-left:-4px"></i>PNBP — pagu (pudar) &amp; realisasi</span></div><div class="jchart">'+
    byA2.map(function(g){
      return '<div class="jrow"><div class="lab"><b>'+catSw(g.key)+g.key+' · '+esc(A2(g.key))+'</b><span>Pagu <span class="num">Rp '+rp(g.pagu)+'</span><br>realisasi '+pc(g.p)+'</span></div><div class="jbars">'+
        ['RM','PNP'].map(function(s){ var c=sum(g.rows.filter(function(r){return r.sumber===s;})), col=s==='RM'?'rm':'pnbp', lab=s==='RM'?'RM':'PNBP';
          if (!c.pagu) return '<div class="jbar none"><span class="tag">'+lab+'</span><span class="bar"></span><span class="val">tidak ada pagu</span></div>';
          return '<div class="jbar"><span class="tag">'+lab+'</span><span class="bar"><span class="p" style="width:'+(c.pagu/max*100)+'%;background:var(--'+col+')"></span><span class="r" style="width:'+(Math.min(c.sd,c.pagu)/max*100)+'%;background:var(--'+col+')"></span></span>'+
            '<span class="val"><b>Rp '+rp(c.sd)+'</b> / Rp '+rp(c.pagu)+' · <b>'+pc(c.p)+'</b></span></div>';
        }).join('')+'</div></div>';
    }).join('')+'</div>';
  h+=card('c-jenis','Pagu &amp; realisasi per jenis belanja menurut sumber dana','Bilah pudar = pagu, bilah pekat = realisasi. Skala sama untuk semua baris.',jBody);

  var unitBody, multiUnit=group(R,function(r){return r.kat+'|'+r.unit;}).length>1;
  var legend='<div class="legend"><span><i class="sw" style="background:var(--real)"></i>Realisasi</span><span><i class="sw tick"></i>Waktu berjalan '+pc(WAKTU)+'</span></div>';
  if (multiUnit){
    var gu=group(R,function(r){return r.kat+'|'+r.unit;});
    var fak=gu.filter(function(g){return g.key.indexOf('Fakultas|')===0;}).sort(function(a,b){return FAK_ORDER.indexOf(a.key.split('|')[1])-FAK_ORDER.indexOf(b.key.split('|')[1]);});
    var rek=gu.filter(function(g){return g.key.indexOf('Fakultas|')!==0;}).sort(function(a,b){return b.pagu-a.pagu;});
    var ub=function(g){ var n=g.key.split('|')[1]; return '<div class="ubar"><span class="n"><span class="un">'+esc(n)+'</span><span class="note num">Rp '+rp(g.pagu)+'</span></span>'+track(g.p,'var(--real)')+'<span class="pct">'+pc(g.p)+'</span></div>'; };
    var fs=sum([].concat.apply([],fak.map(function(g){return g.rows;}))), rs=sum([].concat.apply([],rek.map(function(g){return g.rows;})));
    unitBody=legend+'<div class="ubars">'+(fak.length?'<div class="sec">Fakultas · Rp '+rp(fs.pagu)+' · '+pc(fs.p)+'</div>'+fak.map(ub).join(''):'')+
      (rek.length?'<div class="sec">Rektorat · Rp '+rp(rs.pagu)+' · '+pc(rs.p)+'</div>'+rek.map(ub).join(''):'')+'</div>';
  } else {
    var gk=group(R,function(r){return r.komp;}).sort(function(a,b){return a.key<b.key?-1:1;});
    unitBody=legend+'<div class="ubars">'+gk.map(function(g){ return '<div class="ubar"><span class="n">'+g.key+' '+esc(D.komp[g.key])+'</span>'+track(g.p,'var(--real)')+'<span class="pct">'+pc(g.p)+'</span></div>'; }).join('')+'</div>';
  }
  h+='<div class="two">'+card('c-unit',multiUnit?'Capaian per unit kerja':'Capaian per komponen',multiUnit?'Fakultas dan sub-unit Rektorat. Gaji & operasional kantor termasuk Rektorat — centang filter untuk mengecualikannya.':'Komponen anggaran dalam cakupan '+esc(unitCaption())+'.',unitBody)+
    card('c-tren','Tren penyerapan','Realisasi kumulatif setiap posisi data dibanding garis ideal penyerapan merata sepanjang tahun.','<div id="trendBox" class="trend"><div class="loading" style="padding:30px 0">Memuat tren…</div></div>')+'</div>';

  var minus=R.filter(function(r){return r.sisa<0;}), ms=sum(minus);
  var gs=group(R,function(r){return r.ro+'|'+r.sub;}), s0=gs.filter(function(g){return g.sd===0&&g.pagu>0;});
  var lowK=group(R,function(r){return r.komp;}).filter(function(g){return g.pagu>=1e8;}).sort(function(a,b){return a.p-b.p;})[0];

  /* porsi pagu terhadap pagu induk: diagram donat + keterangan berangka penuh */
  var donut=function(parts,label){
    var R0=64, C=2*Math.PI*R0, gap=parts.length>1?3:0, off=0, tot=parts.reduce(function(a,x){return a+Math.max(0,x.v);},0)||1;
    var top=parts.slice().sort(function(a,b){return b.v-a.v;})[0];
    var segs=parts.map(function(x){ var len=Math.max(0,x.v)/tot*C, d=Math.max(0,len-gap);
      var el='<circle class="dn-seg" cx="90" cy="90" r="'+R0+'" fill="none" stroke="'+x.col+'" stroke-width="30" stroke-dasharray="'+d.toFixed(2)+' '+(C-d).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 90 90)"'+'/>';
      off+=len; return el; }).join('');
    return '<svg class="dn" viewBox="0 0 180 180" role="img" aria-label="'+esc(label)+'">'+
      '<circle cx="90" cy="90" r="'+R0+'" fill="none" stroke="var(--track)" stroke-width="30"/>'+segs+
      '<text x="90" y="88" text-anchor="middle" class="dn-big">'+pc(top.v/tot)+'</text>'+
      '<text x="90" y="108" text-anchor="middle" class="dn-sm">'+esc(top.short)+'</text></svg>';
  };
  var legRow=function(col,nm,g,extra){
    return '<div class="dn-row"><span class="dn-sw" style="background:'+col+'"></span><div class="dn-txt">'+
      '<div class="dn-hd"><span class="nm">'+nm+'</span><span class="dn-pct">'+pc(t.pagu?g.pagu/t.pagu:0)+'</span></div>'+
      '<div class="dn-val"><small>Rp</small> '+rp(g.pagu)+'</div>'+(extra||'')+'</div></div>';
  };
  var porsiSrc='<div class="dn-wrap">'+donut(bySrc.map(function(x){ return {v:x.pagu,col:srcCol(x.key),short:srcName(x.key)}; }),'Porsi pagu per sumber dana')+
    '<div class="dn-legend">'+bySrc.map(function(x){ return legRow(srcCol(x.key),esc(srcName(x.key)),x); }).join('')+'</div></div>';
  var porsiType='<div class="dn-wrap">'+donut(byA2.map(function(g){ return {v:g.pagu,col:catCol(g.key),short:'Akun '+g.key}; }),'Porsi pagu per jenis belanja')+
    '<div class="dn-legend">'+byA2.map(function(g){
      var rm=sum(g.rows.filter(function(r){return r.sumber==='RM';})), pn=sum(g.rows.filter(function(r){return r.sumber==='PNP';}));
      return legRow(catCol(g.key),'<span class="code">'+g.key+'</span> '+esc(A2(g.key)),g,'<div class="dn-sub">RM <b><small>Rp</small> '+rp(rm.pagu)+'</b> · PNBP <b><small>Rp</small> '+rp(pn.pagu)+'</b></div>');
    }).join('')+'</div></div>';
  h+='<div class="two eq">'+card('c-porsi-src','Porsi pagu per sumber dana','Bagian masing-masing sumber dana dari pagu induk.',porsiSrc)+
    card('c-porsi-type','Porsi pagu per jenis belanja','Bagian masing-masing jenis belanja dari pagu induk, beserta pembagian RM dan PNBP.',porsiType)+'</div>';

  /* paling bawah: hal yang perlu ditindaklanjuti */
  h+=card('c-alert','Perlu perhatian','Hal yang memerlukan tindak lanjut. Rincian lengkap di menu Perlu Perhatian.',
    '<div class="alerts">'+
      '<div class="alert"><span class="pill '+(minus.length?'st-crit':'st-good')+'"><i></i>'+(minus.length?'Pagu minus':'Tidak ada pagu minus')+'</span><span class="v">'+(minus.length?'Rp '+rp(-ms.sisa):'Rp 0')+'</span><span class="t">'+minus.length+' detail realisasi melebihi pagu'+(minus.length?' — perlu revisi DIPA':'')+'</span></div>'+
      '<div class="alert"><span class="pill st-warn"><i></i>Belum terealisasi</span><span class="v">'+rp(t.n0)+' detail</span><span class="t">pagu Rp '+rp(sum(R.filter(function(r){return r.sd===0&&r.pagu>0;})).pagu)+' belum diserap sama sekali</span></div>'+
      '<div class="alert"><span class="pill st-warn"><i></i>Sub komponen 0%</span><span class="v">'+s0.length+' dari '+gs.length+'</span><span class="t">sub komponen belum ada realisasi</span></div>'+
      (lowK?'<div class="alert"><span class="pill '+status(lowK.p,WAKTU)[0]+'"><i></i>Komponen terendah</span><span class="v">'+pc(lowK.p)+'</span><span class="t">'+lowK.key+' '+esc(D.komp[lowK.key])+' · sisa Rp '+rp(lowK.sisa)+'</span></div>':'')+
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
