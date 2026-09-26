/* js/export.js — unduh PDF & cetak kartu */
import { $, tgl, toast, errMsg } from './utils.js';
import { BOOT, DB, sess, scopeText } from './state.js';

/* ================= PDF & cetak ================= */
export function pdfCard(id,title){
  var el=$(id); if(!el) return;
  if (typeof html2canvas==='undefined' || !window.jspdf){ toast('Pustaka PDF gagal dimuat. Gunakan tombol Cetak lalu pilih "Simpan sebagai PDF".'); return; }
  toast('Menyiapkan PDF…');
  document.body.classList.add('pdf-mode');
  html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false}).then(function(cv){
    document.body.classList.remove('pdf-mode');
    var doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var W=210,M=14,cw=W-2*M,y=M;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(BOOT.satker+' · Satker '+BOOT.kode,M,y); y+=6;
    doc.setFontSize(11); doc.text(title,M,y); y+=5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.splitTextToSize('Posisi data '+tgl(DB.periode)+' · Cakupan: '+scopeText(),cw).forEach(function(l){ doc.text(l,M,y); y+=4; });
    doc.text('Dicetak '+new Date().toLocaleString('id-ID')+' oleh '+sess().email+' · Sumber: Laporan Ketersediaan Dana Detail (SAKTI)',M,y); y+=3;
    doc.setDrawColor(40); doc.line(M,y,W-M,y); y+=4;
    var pxPerMm=cv.width/cw, pageH=297-M, sliceTop=0;
    while (sliceTop<cv.height){
      var availMm=pageH-y, slicePx=Math.min(cv.height-sliceTop, Math.floor(availMm*pxPerMm));
      var part=document.createElement('canvas'); part.width=cv.width; part.height=slicePx;
      part.getContext('2d').drawImage(cv,0,sliceTop,cv.width,slicePx,0,0,cv.width,slicePx);
      doc.addImage(part.toDataURL('image/jpeg',0.92),'JPEG',M,y,cw,slicePx/pxPerMm);
      sliceTop+=slicePx;
      if (sliceTop<cv.height){ doc.addPage(); y=M; }
    }
    var name=(title||'laporan').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'_')+'_'+DB.periode+'.pdf';
    try { doc.save(name); } catch(e){}
    toast('PDF "'+name+'" diunduh.');
  }).catch(function(e){ document.body.classList.remove('pdf-mode'); toast('PDF gagal dibuat: '+errMsg(e)); });
}
export function printCard(id){
  var el=$(id); if(!el) return;
  el.classList.add('print-target'); document.body.classList.add('print-one');
  setTimeout(function(){ window.print(); setTimeout(function(){ el.classList.remove('print-target'); document.body.classList.remove('print-one'); },500); },60);
}
