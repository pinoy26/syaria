/* js/pages/ringkasan.js — halaman Ringkasan Realisasi */
import { $, esc, rp, pc, poin, tgl, tglPendek, blnTahun, yearFrac, endPrevMonth, sum, group, errMsg } from '../utils.js?v=202611280632';
import { WAKTU, DB, D, S, SRC, FAK_ORDER, FAK_FULL, rows, unitCaption, isUnitUser, A2, status, pill } from '../state.js?v=202611280632';
import { card, tipAttr, tipOf, track, printHead, IC, bindTips } from '../ui-components.js?v=202611280632';
import { SB } from '../api.js?v=202611280632';

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
/* ikon keterangan batang indikator utama (pengganti kotak warna) */
var IK_REAL='<i class="bn-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5h16"/><path d="M6.5 15.5l4-4.5 3 3 4.5-6"/><path d="M14.5 8h3.5v3.5"/></svg></i>';
var IK_LOCK='<i class="bn-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/><path d="M12 14.2v2.2"/></svg></i>';
var IK_BLOK='<i class="bn-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><path d="M6.3 6.3l11.4 11.4"/></svg></i>';
/* gauge setengah lingkaran: bagian terealisasi (kuning) dan sisa (biru) seperti batang indikator utama, dipisah celah; penanda waktu berjalan */
var SG_N=0;
function setengah(p){
  var r=62, cx=80, cy=80, L=Math.PI*r, v=Math.min(1,Math.max(0,p||0)), id='sg'+(++SG_N);
  var d='M'+(cx-r)+' '+cy+' A'+r+' '+r+' 0 0 1 '+(cx+r)+' '+cy, celah=v>0.02&&v<0.98?22:0;
  var hijau=L*v, gelap=Math.max(0,L-hijau-celah);
  var th=Math.PI*(1-WAKTU), tk=function(rr){ return [(cx+rr*Math.cos(th)).toFixed(1),(cy-rr*Math.sin(th)).toFixed(1)]; }, a=tk(r-13), b=tk(r+13);
  return '<svg class="sg" viewBox="0 0 160 100" role="img" aria-label="Realisasi '+pc(p)+', waktu berjalan '+pc(WAKTU)+'">'+
    '<defs><linearGradient id="'+id+'" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#eba521"/><stop offset="1" stop-color="#f7c85c"/></linearGradient></defs>'+
    (gelap>0?'<path d="'+d+'" fill="none" stroke="var(--sg-sisa)" stroke-width="16" stroke-linecap="round" stroke-dasharray="'+gelap.toFixed(1)+' '+(L*2).toFixed(1)+'" stroke-dashoffset="'+(-(hijau+celah)).toFixed(1)+'"/>':'')+
    (hijau>0?'<path d="'+d+'" fill="none" stroke="url(#'+id+')" stroke-width="16" stroke-linecap="round" stroke-dasharray="'+hijau.toFixed(1)+' '+(L*2).toFixed(1)+'"/>':'')+
    '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"><title>Waktu berjalan '+pc(WAKTU)+'</title></line>'+
    '<text x="80" y="74" text-anchor="middle" class="sg-big">'+pc(p)+'</text>'+
    '<text x="80" y="94" text-anchor="middle" class="sg-sm">terealisasi</text></svg>';
}
/* grafik kolom 3D: per jenis belanja, kolom transparan = pagu (100%), kolom padat = realisasi */
var IND_REAL='#f2b33d', IND_SISA='#3d7fd6';
function kolom3d(gs){
  var W=320, base=212, H=150, w=46, dx=16, dy=10, n=gs.length||1, step=(W-40-dx)/n, s='';
  var poly=function(pts,fill,extra){ return '<polygon points="'+pts.map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ')+'" fill="'+fill+'"'+(extra||'')+'/>'; };
  var balok=function(x,top,col,ghost){
    var y=base-top, f=[[x,y],[x+w,y],[x+w,base],[x,base]], sd=[[x+w,y],[x+w+dx,y-dy],[x+w+dx,base-dy],[x+w,base]], tp=[[x,y],[x+dx,y-dy],[x+w+dx,y-dy],[x+w,y]];
    if (ghost) return poly(sd,col,' fill-opacity=".07" stroke="'+col+'" stroke-opacity=".35" stroke-dasharray="3 3"')+poly(tp,col,' fill-opacity=".1" stroke="'+col+'" stroke-opacity=".35" stroke-dasharray="3 3"')+poly(f,col,' fill-opacity=".08" stroke="'+col+'" stroke-opacity=".4" stroke-dasharray="3 3"');
    return poly(f,col)+poly(f,'url(#k3kilau)')+poly(sd,col)+poly(sd,'#000',' fill-opacity=".28"')+poly(tp,col)+poly(tp,'#fff',' fill-opacity=".38"');
  };
  gs.forEach(function(g,i){
    var x=26+i*step+(step-w-dx)/2, h=H*Math.min(1,Math.max(0,g.p)), hh=Math.max(h,2);
    s+='<g class="k3" data-goa2="'+g.key+'" role="button" tabindex="0" aria-label="Akun '+g.key+' '+esc(A2(g.key))+': realisasi '+pc(g.p)+'">'+
      '<ellipse cx="'+(x+(w+dx)/2)+'" cy="'+(base+4)+'" rx="'+((w+dx)/2+6)+'" ry="6" fill="#000" opacity=".10"/>'+
      balok(x,H,IND_SISA,true)+balok(x,hh,IND_REAL,false)+
      '<text x="'+(x+(w+dx)/2)+'" y="'+(base-hh-dy-8)+'" text-anchor="middle" class="k3-pct">'+pc(g.p)+'</text>'+
      '<text x="'+(x+w/2)+'" y="'+(base+22)+'" text-anchor="middle" class="k3-kode">'+g.key+'</text>'+
      '<text x="'+(x+w/2)+'" y="'+(base+36)+'" text-anchor="middle" class="k3-nm">'+esc(String(A2(g.key)).replace(/^Belanja\s+/i,''))+'</text></g>';
  });
  return '<svg class="k3d" viewBox="0 0 '+W+' 256" role="img" aria-label="Grafik 3D realisasi per jenis belanja">'+
    '<defs><linearGradient id="k3kilau" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>'+
    '<polygon points="10,'+(base+2)+' '+(10+dx)+','+(base-dy+2)+' '+(W-6)+','+(base-dy+2)+' '+(W-6-dx)+','+(base+2)+'" fill="var(--track)"/>'+s+'</svg>';
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
          '<div class="bn-box bn-sisa"><span>Sisa Pagu</span><b><small>Rp</small>'+(t.sisa<0?'−':'')+rp(Math.abs(t.sisa))+'</b>'+
            (t.bl?'<small class="bn-ef">dapat digunakan Rp '+rp(t.sisa-t.bl)+'</small>':'')+'</div>'+
        '</div></div>'+
      '<div class="bn-bar" role="img" aria-label="Realisasi '+pc(t.p)+' dari pagu, sisa '+pc(pSisa)+'"><span class="bn-fill" style="width:'+wBar+'%"><em>'+pc(t.p)+'</em></span>'+
        (pSisa>0?'<span class="bn-sisa-lbl" style="left:'+wBar+'%"><em>'+pc(pSisa)+'</em></span>':'')+
        (t.bl&&t.pagu?'<span class="bn-blk" style="width:'+Math.min(100,t.bl/t.pagu*100).toFixed(2)+'%" title="Pagu diblokir Rp '+rp(t.bl)+'"></span>':'')+'</div>'+
      '<div class="bn-foot">'+
        '<span class="bn-leg">'+IK_REAL+'<span>Realisasi periode ini<br><b><small>Rp</small> '+rp(t.ini)+'</b> <span class="bn-sub">'+poin(t.pagu?t.ini/t.pagu:0)+'</span></span></span>'+
        (t.lock?'<span class="bn-leg bn-lock">'+IK_LOCK+'<span>Lock pagu (proses revisi)<br><b><small>Rp</small> '+rp(t.lock)+'</b></span></span>':'')+
        (t.bl?'<span class="bn-leg bn-blok">'+IK_BLOK+'<span>Pagu diblokir (tidak dapat direalisasikan)<br><b><small>Rp</small> '+rp(t.bl)+'</b> <span class="bn-sub">'+pc(t.bl/t.pagu)+' pagu · dari RKK '+tgl(DB.blokir.versi.posisi)+'</span></span></span>':'')+
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
  /* kanan: grafik di sisi kanan baris (gauge); tanpa batang indikator */
  var realRow=function(nm,g,col,attrs,tag,kanan){
    tag=tag||'div';
    var v=function(lbl,val,cls){ return '<span class="rz-v"><span class="rz-lbl">'+lbl+' <small>(Rp)</small></span><b'+(cls?' class="'+cls+'"':'')+'>'+rp(val)+'</b></span>'; };
    var isi='<span class="rz-hd"><span class="nm">'+nm+'</span>'+(kanan?'':'<span class="rz-pct">'+pc(g.p)+' <small>terealisasi</small></span>')+'</span>'+
      '<span class="rz-vals">'+v('Pagu',g.pagu)+v('Realisasi',g.sd)+v('Sisa anggaran',g.sisa,g.sisa<0?'neg':'')+'</span>';
    return '<'+tag+' class="rz-row'+(kanan?' rz-kanan':'')+'"'+(attrs||'')+'>'+(kanan?'<span class="rz-kiri">'+isi+'</span><span class="rz-graf">'+kanan+'</span>':isi)+'</'+tag+'>';
  };
  var srcBody='<div class="rz-list">'+bySrc.map(function(s){
      return realRow('<i class="dot" style="background:'+srcCol(s.key)+'"></i>'+esc(srcName(s.key)),s,srcCol(s.key),'','div',setengah(s.p));
    }).join('')+'</div>';
  var byA2=group(R,function(r){return r.a2;}).sort(function(a,b){return a.key<b.key?-1:1;});
  var icons={'51':IC.people,'52':IC.box,'53':IC.build};
  /* warna identitas jenis belanja (sama di kartu realisasi, grafik, dan donat porsi) */
  var catCol=function(k){ return 'var(--cat-'+(k==='51'?1:k==='52'?2:3)+')'; };
  var catSw=function(k){ return '<span class="cat-sw" style="background:'+catCol(k)+'" aria-hidden="true"></span>'; };
  var typesBody='<div class="rz-3d"><div class="rz-list">'+byA2.map(function(g){
      return realRow('<span class="rz-ic">'+(icons[g.key]||IC.box)+'</span><span><span class="code">Akun '+g.key+'</span> '+esc(A2(g.key))+'</span>',g,'var(--real)',' type="button" data-goa2="'+g.key+'"','button');
    }).join('')+'</div><div class="rz-3d-graf">'+kolom3d(byA2)+'<div class="k3-leg"><span><i class="k3-sw padat"></i>Realisasi</span><span><i class="k3-sw"></i>Pagu (100%)</span></div></div></div>';
  /* dua sisi: kiri realisasi (sumber dana di atas, jenis belanja di bawah), kanan berita & pengumuman */
  /* empat petak sejajar: realisasi per sumber dana ↔ flayer, realisasi per jenis belanja ↔ berita */
  h+='<div class="rk-grid">'+card('c-src','Realisasi per sumber dana','Capaian realisasi masing-masing sumber dana terhadap pagunya.',srcBody)+
    '<div class="rk-fl-sel noprint">'+card('c-flayer','Info &amp; Flayer','','<div id="rkFlayer" class="rk-fl-host"><div class="loading" style="padding:24px 0">Memuat…</div></div>','')+'</div>'+
    card('c-type','Realisasi per jenis belanja','Akun 51, 52, 53. Klik untuk merinci.',typesBody)+
    '<div class="rk-br-sel noprint">'+card('c-berita','Berita &amp; Pengumuman','Informasi terbaru dari admin keuangan.','<div id="rkBerita" class="rk-br-host"><div class="loading" style="padding:24px 0">Memuat berita…</div></div>','')+'</div></div>';

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
    /* tabel seperti Ringkasan Anggaran: Fakultas, Rektorat (subtotal), Rektorat · PNBP & Rektorat · RM (per sumber dana) */
    var gaya=function(sd){ return sd==='RM'?'var(--rm)':sd==='PNP'?'var(--pnbp)':'var(--real)'; };
    var baris=function(nama,t,cls,sd){
      return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+nama+'</td><td class="n">'+rp(t.pagu)+'</td><td class="n'+(t.bl?' ag-u-bl':'')+'">'+(t.bl?rp(t.bl):'–')+'</td>'+
        '<td class="n">'+rp(t.sd)+'</td><td class="n'+(t.sisa<0?' neg':'')+'">'+rp(t.sisa)+'</td><td class="n ag-u-pct" style="color:'+gaya(sd)+'">'+pc(t.p)+'</td>'+
        '<td class="ag-u-bar">'+track(t.p,gaya(sd))+'</td></tr>';
    };
    var isiKel=function(gs,sd){ return gs.map(function(g){ var rs=sd?g.rows.filter(function(r){return r.sumber===sd;}):g.rows; return baris(esc(g.key.split('|')[1]),sum(rs),sd?'ag-u-sd':'',sd); }).join(''); };
    var out='';
    if (fak.length){ out+=baris('<b>Fakultas</b>',sum([].concat.apply([],fak.map(function(g){return g.rows;}))),'ag-u-sec')+isiKel(fak); }
    if (rek.length){
      out+=baris('<b>Rektorat</b>',sum([].concat.apply([],rek.map(function(g){return g.rows;}))),'ag-u-sec');
      [['PNP','PNBP'],['RM','RM']].forEach(function(x){
        var gs=rek.filter(function(g){ return g.rows.some(function(r){return r.sumber===x[0];}); }); if (!gs.length) return;
        var rs=[].concat.apply([],gs.map(function(g){return g.rows.filter(function(r){return r.sumber===x[0];});}));
        out+=baris('<i class="dot" style="background:'+gaya(x[0])+'"></i>Rektorat · '+x[1],sum(rs),'ag-u-sub',x[0])+isiKel(gs,x[0]);
      });
    }
    var tot=sum(R);
    unitBody=legend+'<div class="tbl ag-u-tbl rk-u-tbl"><table><colgroup><col><col class="ag-u-c"><col class="ag-u-c"><col class="ag-u-c"><col class="ag-u-c"><col class="ag-u-p"><col class="ag-u-b"></colgroup>'+
      '<thead><tr><th>Unit kerja</th><th class="n">Pagu</th><th class="n">Diblokir</th><th class="n">Realisasi</th><th class="n">Sisa</th><th class="n">%</th><th>Realisasi</th></tr></thead><tbody>'+
      out+baris('<b>Jumlah</b>',tot,'tot')+'</tbody></table></div>';
  } else {
    var gk=group(R,function(r){return r.komp;}).sort(function(a,b){return a.key<b.key?-1:1;});
    unitBody=legend+'<div class="ubars">'+gk.map(function(g){ return '<div class="ubar"><span class="n">'+g.key+' '+esc(D.komp[g.key])+'</span>'+track(g.p,'var(--real)')+'<span class="pct">'+pc(g.p)+'</span></div>'; }).join('')+'</div>';
  }
  /* tabel per unit kerja memakai lebar penuh; tren penyerapan di bawahnya */
  h+=(multiUnit?'':'<div class="two">')+card('c-unit',multiUnit?'Capaian per unit kerja':'Capaian per komponen',multiUnit?'Fakultas, Rektorat, serta alokasi Rektorat menurut sumber dana (PNBP / RM). Gaji & operasional kantor termasuk Rektorat — centang filter untuk mengecualikannya.':'Komponen anggaran dalam cakupan '+esc(unitCaption())+'.',unitBody)+
    card('c-tren','Tren penyerapan','Realisasi kumulatif setiap posisi data dibanding target penyerapan merata sepanjang tahun.','<div id="trendBox" class="trend"><div class="loading" style="padding:30px 0">Memuat tren…</div></div>')+(multiUnit?'':'</div>');

  var minus=R.filter(function(r){return r.sisa<0;}), ms=sum(minus);
  var gs=group(R.filter(function(r){return !r.blokir;}),function(r){return r.ro+'|'+r.sub;}), s0=gs.filter(function(g){return g.sd===0&&g.pagu>0;});
  var lowK=group(R,function(r){return r.komp;}).filter(function(g){return g.pagu>=1e8;}).sort(function(a,b){return a.p-b.p;})[0];

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
  if (S.trend[key]) { box.innerHTML=trendSvg(S.trend[key],box.clientWidth); bindTips(box); return; }
  SB.tren().then(function(list){ S.trend[key]=list; var b=$('trendBox'); if(b && trendKey()===key){ b.innerHTML=trendSvg(list,b.clientWidth); bindTips(b); } })
    .catch(function(e){ var b=$('trendBox'); if(b) b.innerHTML='<p class="note">Tren tidak dapat dimuat: '+esc(errMsg(e))+'</p>'; });
}
/* kurva halus monoton (tidak melampaui titik data) dari titik [x,y] berurutan */
function halus(P){
  var n=P.length; if (n<3) return 'M'+P.map(function(q){return q[0].toFixed(1)+' '+q[1].toFixed(1);}).join(' L');
  var dx=[], m=[], t=[], i;
  for (i=0;i<n-1;i++){ dx[i]=P[i+1][0]-P[i][0]; m[i]=dx[i]?(P[i+1][1]-P[i][1])/dx[i]:0; }
  t[0]=m[0]; t[n-1]=m[n-2];
  for (i=1;i<n-1;i++) t[i]=m[i-1]*m[i]<=0?0:(m[i-1]+m[i])/2;
  for (i=0;i<n-1;i++){ if (!m[i]){ t[i]=t[i+1]=0; continue; } var a=t[i]/m[i], b=t[i+1]/m[i], hh=a*a+b*b; if (hh>9){ var k=3/Math.sqrt(hh); t[i]=k*a*m[i]; t[i+1]=k*b*m[i]; } }
  var d='M'+P[0][0].toFixed(1)+' '+P[0][1].toFixed(1);
  for (i=0;i<n-1;i++){ var h=dx[i]/3; d+=' C'+(P[i][0]+h).toFixed(1)+' '+(P[i][1]+t[i]*h).toFixed(1)+' '+(P[i+1][0]-h).toFixed(1)+' '+(P[i+1][1]-t[i+1]*h).toFixed(1)+' '+P[i+1][0].toFixed(1)+' '+P[i+1][1].toFixed(1); }
  return d;
}
function rpS(v){ var a=Math.abs(v); return a>=1e9?(a/1e9).toLocaleString('id-ID',{maximumFractionDigits:a>=1e10?0:1})+' M':a>=1e6?(a/1e6).toLocaleString('id-ID',{maximumFractionDigits:0})+' jt':rp(a); }
/* tren penyerapan: kurva halus realisasi kumulatif (biru, area bergradasi) di atas area target penyerapan merata (kuning) */
/* lebar = lebar kotak grafik (px): ukuran tulisan tetap wajar di kartu lebar maupun sempit */
function trendSvg(list,lebar){
  var t=sum(rows());
  var pts=list.filter(function(x){return x.periode.slice(0,4)===DB.periode.slice(0,4) && x.periode<=DB.periode;})
    .map(function(x){ return {f:yearFrac(x.periode),v:x.pagu?x.sd/x.pagu:0,l:'s.d. '+tgl(x.periode),sd:x.sd,pagu:x.pagu,d:x.periode}; });
  var extra=false;
  if (pts.length<2){ var pl=endPrevMonth(DB.periode); pts.unshift({f:yearFrac(pl),v:t.pagu?t.lalu/t.pagu:0,l:'s.d. '+tgl(pl)+' (periode lalu)',sd:t.lalu,pagu:t.pagu,d:pl}); extra=true; }
  var lastP=pts[pts.length-1], pagu=lastP.pagu||t.pagu||1;
  var raw=pagu/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), mm=raw/mag, step=(mm<=1?1:mm<=2?2:mm<=2.5?2.5:mm<=5?5:10)*mag, top=Math.ceil(pagu/step)*step;
  var W=Math.max(520,Math.round(lebar||620)),H=W>900?300:280,L=58,Rt=16,T=22,B=34;
  var X=function(f){return L+Math.min(Math.max(f,0),1)*(W-L-Rt);}, Y=function(v){ return T+(1-Math.min(Math.max(v,0),top)/top)*(H-T-B); };
  var g='<defs><linearGradient id="trBiru" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2f6fd6" stop-opacity=".30"/><stop offset="1" stop-color="#2f6fd6" stop-opacity=".02"/></linearGradient>'+
    '<linearGradient id="trKuning" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f2c14e" stop-opacity=".55"/><stop offset="1" stop-color="#f2c14e" stop-opacity=".12"/></linearGradient>'+
    '<filter id="trBayang" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0a142a" flood-opacity=".18"/></filter></defs>';
  for (var v=0; v<=top+1; v+=step) g+='<line x1="'+L+'" x2="'+(W-Rt)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-10)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end">'+(v?rpS(v):'0')+'</text>';
  ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].forEach(function(m,i){ g+='<text x="'+X((i+.5)/12).toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle">'+m+'</text>'; });
  /* target penyerapan merata: 0 → pagu pada akhir tahun */
  g+='<path d="M'+X(0)+' '+Y(0)+' L'+X(1)+' '+Y(pagu).toFixed(1)+' L'+X(1)+' '+Y(0)+' Z" fill="url(#trKuning)"/>'+
     '<line x1="'+X(0)+'" y1="'+Y(0)+'" x2="'+X(1)+'" y2="'+Y(pagu).toFixed(1)+'" stroke="#e9b23c" stroke-width="2" stroke-linecap="round"/>';
  /* realisasi kumulatif */
  var P=[[X(0),Y(0)]].concat(pts.map(function(q){ return [X(q.f),Y(q.sd)]; })), kurva=halus(P);
  g+='<path d="'+kurva+' L'+P[P.length-1][0].toFixed(1)+' '+Y(0)+' L'+P[0][0].toFixed(1)+' '+Y(0)+' Z" fill="url(#trBiru)"/>'+
     '<path d="'+kurva+'" fill="none" stroke="#2f6fd6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  pts.forEach(function(q,i){
    var last=i===pts.length-1;
    g+='<circle cx="'+X(q.f).toFixed(1)+'" cy="'+Y(q.sd).toFixed(1)+'" r="'+(last?6:9)+'" fill="'+(last?'#2f6fd6':'transparent')+'"'+(last?' stroke="#fff" stroke-width="2.5"':'')+
      tipAttr('<b>'+esc(q.l)+'</b><div class="num">Realisasi Rp '+rp(q.sd)+'<br>Pagu&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rp '+rp(q.pagu)+'<br>Capaian '+pc(q.v)+' · target '+pc(q.f)+'</div>')+'/>';
  });
  /* label nilai pada titik terakhir */
  var lx=X(lastP.f), ly=Y(lastP.sd), bw=128, bh=44, bx=Math.min(Math.max(lx-bw/2,L), W-Rt-bw), by=ly-bh-14<T?ly+14:ly-bh-14;
  g+='<g filter="url(#trBayang)"><rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+bw+'" height="'+bh+'" rx="10" fill="var(--glass-strong, #fff)"/></g>'+
     '<text x="'+(bx+12).toFixed(1)+'" y="'+(by+17).toFixed(1)+'" class="tr-k">Realisasi · '+esc(tglPendek(lastP.d))+'</text>'+
     '<text x="'+(bx+12).toFixed(1)+'" y="'+(by+35).toFixed(1)+'" class="tr-v">Rp '+rpS(lastP.sd)+' <tspan class="tr-k">'+pc(lastP.v)+'</tspan></text>';
  var hd='<div class="tr-hd"><div class="tr-leg"><span><i style="background:#f2c14e"></i>Target penyerapan merata</span><span><i style="background:#2f6fd6"></i>Realisasi kumulatif</span></div>'+
    '<span class="tr-per">TA '+DB.periode.slice(0,4)+' · s.d. '+esc(tglPendek(DB.periode))+'</span></div>';
  return hd+'<svg class="tr2" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Tren penyerapan kumulatif">'+g+'</svg>'+
    '<p class="note">'+(extra?'Titik '+tgl(endPrevMonth(DB.periode))+' diambil dari kolom Realisasi Periode Lalu. ':'')+'Titik baru bertambah setiap kali laporan diunggah. Arahkan kursor ke titik untuk rinciannya.</p>';
}
