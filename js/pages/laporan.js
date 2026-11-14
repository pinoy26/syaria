/* js/pages/laporan.js — Laporan: form pilihan cetak ala SAKTI, unduh PDF langsung (jsPDF) & Excel */
import { esc, rp, pc, tgl, sum, group, toast, errMsg } from '../utils.js?v=202611141514';
import { S, D, CHAIN, FLABEL, FAK_ORDER, DB, BOOT, SRC, A2, scoped, applyF, isUnitUser, sess, subName, rows, unitCaption } from '../state.js?v=202611141514';
import { treeCard, printHead, LV, IC } from '../ui-components.js?v=202611141514';
import { refresh } from '../nav.js?v=202611141514';

var JENIS=[
  {id:'unit',t:'Rincian per Unit Kerja',sub:'Kategori → Unit → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',lv:[LV.kat,LV.unit,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun]},
  {id:'src',t:'Rincian per Sumber Dana',sub:'Sumber dana → Jenis belanja → Akun 3 digit → Akun 6 digit → Detail belanja.',lv:[LV.src,LV.a2,LV.a3,LV.akun]},
  {id:'jenis',t:'Rincian per Jenis Belanja',sub:'Akun 2 digit → 3 digit → 6 digit → Detail belanja.',lv:[LV.a2,LV.a3,LV.akun]},
  {id:'dipa',t:'Struktur DIPA Lengkap',sub:'Program → Kegiatan → KRO → RO → Komponen → Sub Komponen → Akun → Detail belanja.',lv:[LV.prog,LV.keg,LV.kro,LV.ro,LV.komp,LV.sub,LV.akun]}
];
var active='unit';
var levelIdx=null; /* null = level terdalam (default, semua rincian) */

function optName(k,v,r){
  var m={prog:D.program,keg:D.kegiatan,kro:D.kro,ro:D.ro,komp:D.komp}[k];
  if (m) return v+' — '+(m[v]||'');
  if (k==='sub') return v+' — '+subName(r);
  return v;
}
function unitField(){
  var base=scoped(), units={Fakultas:{},Rektorat:{}}, f=S.f;
  base.forEach(function(r){ (units[r.kat]=units[r.kat]||{})[r.unit]=1; });
  if (isUnitUser()){
    var sc=sess().scopes;
    if (sc.length===1 && sc[0].unit) return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" disabled><option>'+esc(sc[0].unit)+'</option></select></label>';
    var opts2=[];
    sc.forEach(function(s){ if(s.unit) opts2.push([s.kat+'|'+s.unit,s.unit]); else { opts2.push([s.kat+'|','Semua '+s.kat]); Object.keys(units[s.kat]||{}).sort().forEach(function(u){ opts2.push([s.kat+'|'+u,u]); }); } });
    return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" data-k="unit"><option value="">Semua cakupan saya</option>'+opts2.map(function(o){return '<option value="'+esc(o[0])+'"'+(f.unit===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';
  }
  var fk=FAK_ORDER.filter(function(u){return units.Fakultas[u];}).concat(Object.keys(units.Fakultas).filter(function(u){return FAK_ORDER.indexOf(u)<0;}));
  var rk=Object.keys(units.Rektorat||{}).sort();
  return '<label class="f" for="lf_unit">Satuan/unit kerja<select id="lf_unit" data-k="unit"><option value="">Semua unit</option>'+
    '<optgroup label="Fakultas"><option value="Fakultas|"'+(f.unit==='Fakultas|'?' selected':'')+'>Semua fakultas</option>'+fk.map(function(u){return '<option value="Fakultas|'+esc(u)+'"'+(f.unit==='Fakultas|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup>'+
    '<optgroup label="Rektorat"><option value="Rektorat|"'+(f.unit==='Rektorat|'?' selected':'')+'>Semua Rektorat</option>'+rk.map(function(u){return '<option value="Rektorat|'+esc(u)+'"'+(f.unit==='Rektorat|'+u?' selected':'')+'>'+esc(u)+'</option>';}).join('')+'</optgroup></select></label>';
}
function chainFields(){
  var base=scoped(), f=S.f, h='';
  CHAIN.forEach(function(k,i){
    var pool=applyF(base,i), seen={}, opts=[];
    pool.forEach(function(r){ if(!seen[r[k]]){ seen[r[k]]=1; opts.push({v:r[k],t:optName(k,r[k],r)}); } });
    opts.sort(function(a,b){ return a.v<b.v?-1:1; });
    if (f[k] && !seen[f[k]]) f[k]='';
    h+='<label class="f" for="lf_'+k+'">'+FLABEL[k]+'<select id="lf_'+k+'" data-k="'+k+'"><option value="">Semua '+FLABEL[k]+'</option>'+
      opts.map(function(o){ return '<option value="'+esc(o.v)+'"'+(o.v===f[k]?' selected':'')+'>'+esc(o.t)+'</option>'; }).join('')+'</select></label>';
  });
  return h;
}
/* level terpilih -> {lv: daftar level terpotong, full: true bila sampai Detail (baris item individual)}
   indeks 0..J.lv.length-1 = level kelompok (Kategori..Akun), indeks J.lv.length = "Detail" (default) */
function pilihLevel(J){
  var maxIdx=J.lv.length;
  var n=(levelIdx==null)?maxIdx:Math.max(0,Math.min(levelIdx,maxIdx));
  var full=(n===maxIdx);
  return { lv: J.lv.slice(0, full?J.lv.length:(n+1)), full: full };
}
function levelField(J){
  var P=pilihLevel(J), selIdx=P.full?J.lv.length:(P.lv.length-1);
  var opts=J.lv.map(function(l,i){ return '<option value="'+i+'"'+(i===selIdx?' selected':'')+'>'+esc(l.lvl)+'</option>'; }).join('');
  opts+='<option value="'+J.lv.length+'"'+(selIdx===J.lv.length?' selected':'')+'>Detail</option>';
  return '<label class="f" for="lfLevel">Pilih level<select id="lfLevel">'+opts+'</select></label>';
}

export function renderLaporan(){
  var J=JENIS.filter(function(x){return x.id===active;})[0]||JENIS[0];
  var P=pilihLevel(J);
  var radio=JENIS.map(function(x){ return '<label><input type="radio" name="lapJenis" value="'+x.id+'"'+(x.id===active?' checked':'')+'>'+esc(x.t)+'</label>'; }).join('');
  /* susunan ala SAKTI: bagian bertajuk tab, tiap isian satu baris (label kiri, pilihan kanan), tersusun ke bawah */
  var form='<div class="glass card noprint lap-form"><div class="card-h"><div><h2>Laporan</h2><p>Pilih satuan kerja, jenis laporan, level, periode dan filter, lalu unduh.</p></div></div>'+
    '<fieldset class="lap-box"><legend>Pilihan Cetak</legend><div class="lap-rows">'+unitField()+'</div></fieldset>'+
    '<fieldset class="lap-box"><legend>Pilih Jenis, Level dan Periode</legend><div class="lap-rows">'+
      '<div class="lap-row" role="radiogroup" aria-labelledby="lapJenisLbl"><span class="lap-lbl" id="lapJenisLbl">Jenis laporan</span><div class="lap-radio">'+radio+'</div></div>'+
      levelField(J)+'<label class="f" for="selTahun">Tahun anggaran<span id="lfTahunSlot"></span></label>'+
      '<label class="f" for="selPeriode">Posisi data<span id="lfPeriodeSlot"></span></label></div></fieldset>'+
    '<fieldset class="lap-box"><legend>Filter</legend><div class="lap-rows">'+chainFields()+'</div></fieldset>'+
    '<div class="tools lap-aksi"><button class="btn primary" type="button" id="btnLapPdf">'+IC.pdf+' Unduh PDF</button>'+
    '<button class="btn" type="button" id="btnUnduhExcel">'+IC.box+' Unduh Excel</button></div></div>';
  setTimeout(bindLaporan,0);
  return '<div class="page-sec grid">'+form+printHead()+treeCard('lap-aktif',J.t,J.sub,rows(),P.lv)+'</div>';
}
function bindLaporan(){
  var pg=document.getElementById('page'); if (!pg || !pg.querySelector('.lap-box')) return;
  [].forEach.call(pg.querySelectorAll('input[name="lapJenis"]'), function(r){ r.onchange=function(){ active=this.value; levelIdx=null; refresh(); }; });
  [].forEach.call(pg.querySelectorAll('.lap-box select[data-k]'), function(s){
    s.onchange=function(){ var k=s.dataset.k; S.f[k]=s.value; var i=CHAIN.indexOf(k); if(i>=0) for(var j=i+1;j<CHAIN.length;j++) S.f[CHAIN[j]]=''; S.pg=0; refresh(); };
  });
  var lvlSel=document.getElementById('lfLevel');
  if (lvlSel) lvlSel.onchange=function(){ levelIdx=+lvlSel.value; refresh(); };
  var periodeSel=document.getElementById('selPeriode'), slot=document.getElementById('lfPeriodeSlot');
  if (periodeSel && slot && !slot.contains(periodeSel)) slot.appendChild(periodeSel);
  var tahunSel=document.getElementById('selTahun'), slotT=document.getElementById('lfTahunSlot');
  if (tahunSel && slotT && !slotT.contains(tahunSel)) slotT.appendChild(tahunSel);
  var btnX=document.getElementById('btnUnduhExcel'); if (btnX) btnX.onclick=unduhExcel;
  var btnPdf=document.getElementById('btnLapPdf'); if (btnPdf) btnPdf.onclick=unduhPdf;
}
function unduhExcel(){
  if (active==='src'){ excelSumberDana(); return; }
  var R=rows();
  var head=['Kategori','Unit','Program','Kegiatan','KRO','RO','Komponen','Sub Komponen','Akun','Sumber Dana','No','Uraian','Pagu','Realisasi s.d. ini','Realisasi periode ini','Sisa'];
  var data=[head];
  R.forEach(function(r){ data.push([r.kat,r.unit,r.prog,r.keg,r.kro,r.ro,r.komp,r.sub,r.akun,r.sumber,r.no,r.item,r.pagu,r.sd,r.ini,r.sisa]); });
  var ws=XLSX.utils.aoa_to_sheet(data);
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Laporan');
  XLSX.writeFile(wb,'laporan-'+((DB&&DB.periode)||'data')+'.xlsx');
}

/* ================= unduhan langsung: PDF dibuat di browser (jsPDF + AutoTable), bukan jendela cetak ================= */
var PDF_LIB=['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js','https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'];
var pdfSiap=null;
/* pustaka PDF (±400 KB) baru dimuat saat pertama kali dibutuhkan */
function muatPdfLib(){
  if (pdfSiap) return pdfSiap;
  pdfSiap=PDF_LIB.reduce(function(p,src){ return p.then(function(){ return new Promise(function(ok,gagal){
    var sc=document.createElement('script'); sc.src=src; sc.onload=ok;
    sc.onerror=function(){ gagal(new Error('Pustaka PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.')); };
    document.head.appendChild(sc);
  }); }); }, Promise.resolve());
  pdfSiap.catch(function(){ pdfSiap=null; });
  return pdfSiap;
}
var ABU=[232,234,237];   /* abu muda: kepala & kaki tabel */
var KODE_SD={RM:'A',PNP:'D'};
var NAMA_JB={'51':'Pegawai','52':'Barang','53':'Modal'};
/* teks polos untuk PDF: buang HTML & ganti karakter di luar font standar PDF */
function polos(x){ return String(x||'').replace(/[\u2013\u2014]/g,'-').replace(/[\u00b7\u2022]/g,'|').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2026/g,'...').replace(/[^\x20-\x7e\u00a0-\u00ff\n]/g,''); }
function teks(html){ var d=document.createElement('div'); d.innerHTML=html; return polos(d.textContent.replace(/\s+/g,' ').trim()); }
function pct(p){ return pc(p,2); }
function stempel(){ var d=new Date(), z=function(n){return ('0'+n).slice(-2);}; return z(d.getDate())+'-'+z(d.getMonth()+1)+'-'+d.getFullYear()+' '+z(d.getHours())+':'+z(d.getMinutes())+':'+z(d.getSeconds()); }
function namaBerkas(J,ext){ return (J.t.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+((DB&&DB.periode)||'data')+'.'+ext); }

/* kop, judul, nomor halaman & tanggal cetak di setiap halaman */
function kopPdf(doc, judul){
  var W=doc.internal.pageSize.getWidth();
  doc.setTextColor(20);
  doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
  doc.text(polos((BOOT&&BOOT.satker)||'').toUpperCase(), 36, 34);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  if (BOOT && BOOT.kode) doc.text('Kode Satker '+BOOT.kode, 36, 47);
  doc.setDrawColor(150); doc.setLineWidth(.6); doc.line(36, 56, W-36, 56);
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text(judul.toUpperCase(), W/2, 78, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text('Posisi data s.d. '+tgl(DB.periode)+'  |  Cakupan: '+polos(unitCaption()), W/2, 91, {align:'center'});
}
function kakiPdf(doc){
  var n=doc.internal.getNumberOfPages(), W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), cetak='tanggal cetak : '+stempel();
  for (var i=1;i<=n;i++){
    doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text('hal : '+i+' dari '+n+' halaman', W/2, H-18, {align:'center'});
    doc.text(cetak, W-36, H-18, {align:'right'});
  }
}
var GAYA={
  theme:'grid', margin:{top:104,left:36,right:36,bottom:34},
  styles:{font:'helvetica',fontSize:7.5,cellPadding:3,lineColor:[170,170,170],lineWidth:.4,textColor:20,overflow:'linebreak'},
  headStyles:{fillColor:ABU,textColor:20,fontStyle:'bold',halign:'center',valign:'middle'},
  footStyles:{fillColor:ABU,textColor:20,fontStyle:'bold'}
};
function gaya(tambahan){ var o={}; Object.keys(GAYA).forEach(function(k){ o[k]=GAYA[k]; }); Object.keys(tambahan).forEach(function(k){ o[k]=tambahan[k]; }); return o; }

/* baris tabel bertingkat (tanpa HTML), mengikuti level yang dipilih */
function barisPohon(R, lv, full){
  var out=[];
  (function walk(rs, d){
    var L=lv[d], m={}, order=[];
    rs.forEach(function(r){ var k=L.key(r); if(!m[k]){ m[k]=[]; order.push(k); } m[k].push(r); });
    if (L.sort) order.sort(L.sort); else order.sort();
    order.forEach(function(k){
      out.push({d:d, label:L.lvl+'  '+teks(L.label(k,m[k][0])), t:sum(m[k])});
      if (d<lv.length-1) walk(m[k], d+1);
      else if (full) m[k].slice().sort(function(a,b){ return a.no<b.no?-1:1; }).forEach(function(r){
        out.push({d:d+1, detail:true, label:polos(r.no+'  '+r.item+'  ('+(r.sumber==='PNP'?'PNBP':(r.sumber||'?'))+')'), t:sum([r])});
      });
    });
  })(R, 0);
  return out;
}
function pdfBertingkat(doc, J, R){
  var P=pilihLevel(J), bar=barisPohon(R, P.lv, P.full), T=sum(R);
  var nilai=function(t){ return [rp(t.pagu), rp(t.sd), rp(t.ini), pct(t.p), rp(t.sisa)]; };
  doc.autoTable(gaya({
    head:[['Uraian','Pagu','Realisasi','Periode ini','%','Sisa']],
    body:bar.map(function(x){ return [x.label].concat(nilai(x.t)); }),
    foot:[['JUMLAH'].concat(nilai(T))], showFoot:'lastPage',
    columnStyles:{0:{cellWidth:'auto'},1:{halign:'right',cellWidth:78},2:{halign:'right',cellWidth:78},3:{halign:'right',cellWidth:70},4:{halign:'right',cellWidth:44},5:{halign:'right',cellWidth:78}},
    didParseCell:function(c){
      if (c.section==='foot' && c.column.index>0) c.cell.styles.halign='right';
      if (c.section!=='body') return;
      var x=bar[c.row.index]; if (!x) return;
      if (c.column.index===0) c.cell.styles.cellPadding={top:3,bottom:3,right:3,left:3+x.d*9};
      if (!x.detail && x.d<2) c.cell.styles.fontStyle='bold';
      if (x.detail) c.cell.styles.textColor=60;
    },
    didDrawPage:function(){ kopPdf(doc, J.t); }
  }));
}
/* susunan seperti SAKTI "Realisasi Belanja per Sumber Dana": baris sumber dana × kolom jenis belanja */
function matriksSumberDana(R){
  var jenis=group(R,function(r){ return r.a2; }).map(function(g){ return g.key; }).sort();
  var src=group(R,function(r){ return r.sumber||'?'; }).sort(function(a,b){ return a.key==='RM'?-1:b.key==='RM'?1:(a.key<b.key?-1:1); });
  var sel=function(rs){ return sum(rs); };
  return {
    jenis:jenis, namaJenis:jenis.map(function(k){ return NAMA_JB[k]||A2(k); }),
    baris:src.map(function(g,i){ return { no:i+1, nama:'('+(KODE_SD[g.key]||'-')+') '+String(SRC[g.key]||'Belum dipetakan').toUpperCase(),
      sel:jenis.map(function(k){ return sel(g.rows.filter(function(r){ return r.a2===k; })); }), total:sum(g.rows) }; }),
    grand:{ sel:jenis.map(function(k){ return sel(R.filter(function(r){ return r.a2===k; })); }), total:sum(R) }
  };
}
function pdfSumberDana(doc, J, R){
  var M=matriksSumberDana(R), KET='PAGU\nREALISASI\n%\nSISA';
  var isi=function(t){ return rp(t.pagu)+'\n'+rp(t.sd)+'\n'+pct(t.p)+'\n'+rp(t.sisa); };
  /* tabel selebar halaman: kolom tetap untuk NO/nama/keterangan, sisa lebar dibagi rata ke kolom jenis belanja & total */
  var lebarHal=doc.internal.pageSize.getWidth()-72, tetap=30+170+80, akhir=3+M.jenis.length;
  var lebarJ=(lebarHal-tetap)/(M.jenis.length+1);
  var cs={0:{halign:'center',cellWidth:30},1:{cellWidth:170},2:{cellWidth:80}};
  M.jenis.forEach(function(_,i){ cs[3+i]={halign:'right',cellWidth:lebarJ}; });
  cs[akhir]={halign:'right',cellWidth:lebarJ};
  doc.autoTable(gaya({
    head:[[{content:'NO',rowSpan:2},{content:'(Kode) Sumber Dana',rowSpan:2},{content:'Keterangan',rowSpan:2},{content:'Jenis Belanja',colSpan:M.jenis.length},{content:'Total',rowSpan:2}],
          M.namaJenis],
    body:M.baris.map(function(b){ return [String(b.no), b.nama, KET].concat(b.sel.map(isi)).concat([isi(b.total)]); }),
    foot:[[{content:'GRAND TOTAL',colSpan:2,styles:{halign:'center',valign:'middle'}}, KET].concat(M.grand.sel.map(isi)).concat([isi(M.grand.total)])],
    showFoot:'lastPage', columnStyles:cs, tableWidth:lebarHal,
    styles:{font:'helvetica',fontSize:8,cellPadding:4,lineColor:[170,170,170],lineWidth:.4,textColor:20,valign:'middle'},
    didParseCell:function(c){ if (c.section==='foot' && c.column.index>=3) c.cell.styles.halign='right'; },
    didDrawPage:function(){ kopPdf(doc, 'Realisasi Belanja per Sumber Dana'); }
  }));
}
function unduhPdf(){
  var btn=document.getElementById('btnLapPdf'), J=JENIS.filter(function(x){ return x.id===active; })[0]||JENIS[0], R=rows();
  if (!R.length){ toast('Tidak ada data untuk filter yang dipilih.', 'info', 'Tidak ada data'); return; }
  var asli=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin" aria-hidden="true"></span>Menyiapkan PDF…';
  muatPdfLib().then(function(){
    var doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
    if (active==='src') pdfSumberDana(doc, J, R); else pdfBertingkat(doc, J, R);
    kakiPdf(doc);
    doc.save(namaBerkas(J,'pdf'));
  }).catch(function(e){ toast(errMsg(e), 'err', 'PDF gagal dibuat'); })
    .then(function(){ btn.disabled=false; btn.innerHTML=asli; });
}
/* Excel per sumber dana dengan susunan yang sama (angka tetap berupa angka agar bisa diolah) */
function excelSumberDana(){
  var R=rows(); if (!R.length){ toast('Tidak ada data untuk filter yang dipilih.', 'info', 'Tidak ada data'); return; }
  var M=matriksSumberDana(R), n=M.jenis.length, data=[], merges=[], baris=0;
  data.push(['REALISASI BELANJA PER SUMBER DANA']); data.push([String((BOOT&&BOOT.satker)||'')+' · Posisi data s.d. '+tgl(DB.periode)+' · Cakupan: '+unitCaption()]); data.push([]);
  var h1=['NO','(Kode) Sumber Dana','Keterangan','Jenis Belanja'], h2=['','','',];
  for (var i=1;i<n;i++) h1.push(''); h1.push('Total');
  h2=h2.concat(M.namaJenis); h2.push('');
  data.push(h1); data.push(h2);
  merges.push({s:{r:3,c:0},e:{r:4,c:0}},{s:{r:3,c:1},e:{r:4,c:1}},{s:{r:3,c:2},e:{r:4,c:2}},{s:{r:3,c:3},e:{r:3,c:2+n}},{s:{r:3,c:3+n},e:{r:4,c:3+n}});
  var KUNCI=[['PAGU','pagu'],['REALISASI','sd'],['%','p'],['SISA','sisa']];
  var blok=function(no,nama,sel,total){
    var r0=data.length;
    KUNCI.forEach(function(k,j){ data.push([j?'':no, j?'':nama, k[0]].concat(sel.map(function(t){ return t[k[1]]; })).concat([total[k[1]]])); });
    merges.push({s:{r:r0,c:0},e:{r:r0+3,c:0}},{s:{r:r0,c:1},e:{r:r0+3,c:1}});
    return r0;
  };
  var awal=data.length;
  M.baris.forEach(function(b){ blok(b.no,b.nama,b.sel,b.total); });
  var gt=blok('GRAND TOTAL','',M.grand.sel,M.grand.total);
  merges.push({s:{r:gt,c:0},e:{r:gt+3,c:1}});
  var ws=XLSX.utils.aoa_to_sheet(data);
  ws['!merges']=merges;
  ws['!cols']=[{wch:6},{wch:24},{wch:12}].concat(M.jenis.map(function(){ return {wch:18}; })).concat([{wch:20}]);
  /* format angka: ribuan untuk nominal, persen untuk baris % */
  for (var r=awal;r<data.length;r++) for (var c=3;c<=3+n;c++){
    var ref=XLSX.utils.encode_cell({r:r,c:c}); if (!ws[ref]) continue;
    ws[ref].z = data[r][2]==='%' ? '0.00%' : '#,##0';
  }
  var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Per Sumber Dana');
  XLSX.writeFile(wb,'Realisasi-Belanja-per-Sumber-Dana-'+((DB&&DB.periode)||'data')+'.xlsx');
}

