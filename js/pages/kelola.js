/* js/pages/kelola.js — Kelola Data & Kelola Pengguna (admin) */
import { $, esc, rp, pc, tgl, toast, tanya, notifHtml, errMsg } from '../utils.js?v=202611141514';
import { S, FAK_ORDER, DB, BOOT, sess } from '../state.js?v=202611141514';
import { card, openModal } from '../ui-components.js?v=202611141514';
import { SB } from '../api.js?v=202611141514';
import { refresh } from '../nav.js?v=202611141514';
import { reboot, loadData } from '../main.js?v=202611141514';
import { IC_EYE, IC_EYE_OFF } from '../akun.js?v=202611141514';

/* ================= data admin bersama (dipakai Kelola Data & Kelola Pengguna) ================= */
function ensureAdmin(){
  if (S.admin) return S.admin;
  SB.adminInfo().then(function(x){ S.admin=x; if(S.page==='kelola'||S.page==='kelola-user') refresh(); })
    .catch(function(e){ $('page').innerHTML='<div class="glass card">'+esc(errMsg(e))+'</div>'; });
  return null;
}

/* ================= Kelola Data: unggah, riwayat, aturan unit kerja ================= */
export function renderKelola(){
  var A=ensureAdmin(); if (!A) return '<div class="loading">Memuat data admin…</div>';
  var thAktif=A.periods.length?String(A.periods[A.periods.length-1].periode).slice(0,4):'';
  var up='<div class="form"><label class="f" for="upJenis">Jenis file<select id="upJenis"><option value="REALISASI">Laporan Ketersediaan Dana Detail</option><option value="RKK">Rincian Kertas Kerja Satker (sumber dana)</option></select></label>'+
    '<label class="f" for="upTgl" id="upTglWrap">Tanggal posisi data<input type="date" id="upTgl"></label>'+
    '<label class="f" for="upTahun" id="upTahunWrap" hidden>Tahun anggaran RKK<input type="number" id="upTahun" min="2000" max="2100" step="1" inputmode="numeric"></label>'+
    '<label class="f" for="upFile">File Excel (.xlsx / .xls)<input type="file" id="upFile" accept=".xlsx,.xls"></label>'+
    '<div><button class="btn primary" type="button" id="btnUp">Unggah &amp; proses</button></div></div><div id="upMsg" class="status-box" role="status" aria-live="polite" hidden></div>'+
    '<p class="note">Setelah revisi DIPA/POK: unggah RKK terlebih dahulu, lalu Laporan Ketersediaan Dana. Mengunggah ulang tanggal yang sama akan menggantikan data tanggal tersebut. <b>Awal tahun anggaran baru:</b> unggah RKK dengan tahun anggaran baru sebelum data realisasi pertama tahun itu; RKK tahun lain tidak ikut berubah.</p>';
  var log='<div class="tbl"><table><thead><tr><th>Posisi</th><th>Diunggah</th><th>File</th><th class="n">Detail</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th>Cek</th><th></th></tr></thead><tbody>'+
    A.periods.slice().reverse().map(function(p){ var ok=Number(p.cekPagu)===0&&Number(p.cekReal)===0&&p.cekPagu!==''; return '<tr><td><b>'+tgl(p.periode)+'</b></td><td>'+esc(p.diunggah)+'<br><span class="note">'+esc(p.pengunggah)+'</span></td><td>'+esc(p.file)+'</td><td class="n">'+rp(p.jumlah)+'</td><td class="n">'+rp(p.pagu)+'</td><td class="n">'+rp(p.sd)+'</td><td class="n">'+pc(p.persen)+'</td><td><span class="pill '+(ok?'st-good':'st-crit')+'"><i></i>'+(ok?'Cocok':'Periksa')+'</span></td><td><button class="btn" type="button" data-delp="'+p.periode+'">Hapus</button></td></tr>'; }).join('')+'</tbody></table></div>';
  /* aturan unit kerja per tahun anggaran: tahun data terbaru belum punya aturan sendiri → tawarkan salin */
  var thAturan=[]; A.rules.forEach(function(r){ if(r[7]!=null && thAturan.indexOf(+r[7])<0) thAturan.push(+r[7]); }); thAturan.sort();
  var maxAturan=thAturan.length?thAturan[thAturan.length-1]:null, thNum=+thAktif||null;
  var salinKe=maxAturan==null?null:(thNum && thAturan.indexOf(thNum)<0 ? thNum : maxAturan+1), salinDari=maxAturan;
  var infoAturan=(thNum && maxAturan!=null && thAturan.indexOf(thNum)<0)
    ? '<div class="status-box s-err" style="margin-bottom:12px">Aturan unit kerja TA '+thNum+' belum ada — pemetaan data TA '+thNum+' sementara memakai aturan TA '+maxAturan+'. Salin aturan agar bisa disesuaikan untuk TA '+thNum+'.</div>' : '';
  var rules=infoAturan+'<div class="tbl"><table><thead><tr><th>KRO</th><th>Komponen</th><th>Jenis aturan</th><th>Kode</th><th>Kategori</th><th>Unit</th><th>Keterangan</th><th>TA</th></tr></thead><tbody>'+
    A.rules.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(i===3?' class="code"':'')+'>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'+
    '<div class="tools" style="margin-top:12px"><a class="link" href="'+esc(A.sheetUrl)+'" target="_blank" rel="noopener">Ubah aturan di sheet Ref_Unit ›</a><button class="btn" type="button" id="btnRemap">Terapkan ke posisi terbaru</button><button class="btn" type="button" id="btnRemapAll">Terapkan ke semua posisi TA '+thAktif+'</button>'+
      (salinKe?'<button class="btn" type="button" id="btnSalinAturan" data-dari="'+salinDari+'" data-ke="'+salinKe+'">Salin aturan TA '+salinDari+' ke TA '+salinKe+'</button>':'')+'</div>'+
    '<p class="note">Urutan: kode lengkap → huruf pertama → komponen → selain itu Rektorat. Terapkan ke semua posisi hanya untuk memperbaiki salah pemetaan dan hanya berlaku untuk tahun anggaran '+thAktif+' — data tahun anggaran sebelumnya tidak ikut diubah. Perubahan pemilik kode setelah revisi cukup berlaku untuk posisi terbaru.</p><div id="mapMsg" class="note"></div>';
  setTimeout(bindKelolaData,0);
  return '<div class="page-sec grid">'+card('k-up','Unggah laporan SAKTI','File dibaca di browser, dicocokkan dengan baris JUMLAH SELURUHNYA, lalu disimpan per tanggal posisi.',up)+
    card('k-log','Riwayat unggahan','Cek harus "Cocok": total detail sama dengan baris JUMLAH SELURUHNYA pada laporan.',log)+
    card('k-arsip','Arsip tahun anggaran','Tahun anggaran yang sudah selesai cukup menyimpan satu posisi per bulan untuk menghemat ruang database.',arsipHtml(A,thAktif))+
    card('k-rule','Aturan unit kerja','Menentukan Fakultas/Rektorat setiap sub komponen.',rules)+'</div>';
}
/* pratinjau rapikan arsip per tahun anggaran lama (sebelum tahun data terbaru) */
var KB_PER_BARIS=0.65; /* ukuran rata-rata satu baris realisasi beserta indeksnya (terukur ±0,65 KB) */
function arsipHtml(A,thAktif){
  var th=+thAktif, perTahun={};
  A.periods.forEach(function(p){ var y=+String(p.periode).slice(0,4); (perTahun[y]=perTahun[y]||[]).push(p); });
  var lama=Object.keys(perTahun).map(Number).filter(function(y){ return th && y<th; }).sort();
  var catatan='<p class="note">Untuk tahun anggaran yang sudah selesai, posisi terakhir di setiap bulan (termasuk posisi akhir Desember) disisakan; posisi lain di tahun itu dihapus permanen. Tahun anggaran berjalan (TA '+(th||'—')+') tidak bisa dirapikan.</p>';
  if (!lama.length) return '<div class="empty">Belum ada tahun anggaran yang selesai. Fitur ini aktif setelah data tahun anggaran berikutnya diunggah'+(th?' (mulai TA '+(th+1)+')':'')+'.</div>'+catatan;
  return '<div class="tbl"><table><thead><tr><th>Tahun anggaran</th><th class="n">Posisi tersimpan</th><th class="n">Disisakan (akhir bulan)</th><th class="n">Akan dihapus</th><th class="n">Perkiraan ruang dihemat</th><th></th></tr></thead><tbody>'+
    lama.map(function(y){
      var ps=perTahun[y], akhir={};
      ps.forEach(function(p){ var m=String(p.periode).slice(0,7); if(!akhir[m]||p.periode>akhir[m]) akhir[m]=p.periode; });
      var sisa=Object.keys(akhir).length, hapus=ps.filter(function(p){ return akhir[String(p.periode).slice(0,7)]!==p.periode; });
      var baris=hapus.reduce(function(a,p){ return a+(+p.jumlah||0); },0), mb=baris*KB_PER_BARIS/1024;
      return '<tr><td><b>TA '+y+'</b></td><td class="n">'+ps.length+'</td><td class="n">'+sisa+'</td><td class="n">'+hapus.length+' posisi · '+rp(baris)+' baris</td><td class="n">± '+mb.toLocaleString('id-ID',{maximumFractionDigits:1})+' MB</td><td>'+
        (hapus.length?'<button class="btn" type="button" data-arsip="'+y+'" data-n="'+hapus.length+'" data-sisa="'+sisa+'">Rapikan TA '+y+'</button>':'<span class="note">Sudah rapi</span>')+'</td></tr>';
    }).join('')+'</tbody></table></div>'+catatan;
}
function bindKelolaData(){
  if (!$('btnUp')) return;
  [].forEach.call(document.querySelectorAll('[data-arsip]'),function(b){ b.onclick=function(){
    var y=+b.dataset.arsip;
    tanya({ judul:'Rapikan arsip TA '+y+'?', pesan:b.dataset.n+' posisi data TA '+y+' akan dihapus permanen. Yang disisakan: '+b.dataset.sisa+' posisi akhir bulan. Tindakan ini tidak bisa dibatalkan.', ya:'Rapikan arsip' }).then(function(ya){
      if(!ya) return; b.disabled=true;
      SB.rapikanArsip(y).then(function(r){ toast(r.pesan,'ok','Arsip dirapikan'); S.admin=null; S.trend={}; S.cmp=null; reboot(); })
        .catch(function(e){ b.disabled=false; toast(errMsg(e),'err','Gagal merapikan arsip'); });
    });
  }; });
  var today=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
  $('upTgl').value=today;
  $('upTahun').value=new Date().getFullYear();
  $('upJenis').onchange=function(){ var rkk=this.value==='RKK'; $('upTglWrap').hidden=rkk; $('upTahunWrap').hidden=!rkk; };
  if ($('btnSalinAturan')) $('btnSalinAturan').onclick=function(){
    var b=this, dari=+b.dataset.dari, ke=+b.dataset.ke;
    tanya({ judul:'Salin aturan unit kerja ke TA '+ke+'?', pesan:'Semua aturan unit kerja TA '+dari+' disalin menjadi aturan TA '+ke+'. Setelah itu aturan TA '+ke+' bisa diubah tanpa memengaruhi data TA '+dari+'.', ya:'Salin', bahaya:false }).then(function(ya){
      if(!ya) return; b.disabled=true;
      SB.salinAturanUnit(dari,ke).then(function(r){ toast(r.pesan,'ok','Aturan unit kerja disalin'); S.admin=null; refresh(); })
        .catch(function(e){ b.disabled=false; toast(errMsg(e),'err','Gagal menyalin aturan'); });
    });
  };
  $('btnUp').onclick=doUpload;
  [].forEach.call(document.querySelectorAll('[data-delp]'),function(b){ b.onclick=function(){
    tanya({ judul:'Hapus data posisi '+tgl(b.dataset.delp)+'?', pesan:'Seluruh data realisasi pada tanggal posisi ini akan dihapus. Tindakan ini tidak bisa dibatalkan.', ya:'Hapus' }).then(function(ya){
      if(!ya) return;
      b.disabled=true; SB.hapusPeriode(b.dataset.delp).then(function(r){ toast(r.pesan,'ok','Data posisi dihapus'); reboot(); }).catch(function(e){ b.disabled=false; toast(errMsg(e),'err','Gagal menghapus data posisi'); });
    });
  }; });
  /* hasil ditampilkan lewat notifikasi: loadData memuat ulang halaman sehingga #mapMsg ikut hilang */
  var remap=function(scope,btn){ btn.disabled=true; $('mapMsg').textContent='Memproses…'; SB.terapkanUlang(scope,function(i,n,per){ if($('mapMsg')) $('mapMsg').textContent='Memproses posisi '+i+' dari '+n+' ('+tgl(per)+')…'; }).then(function(r){ toast(r.pesan||'Aturan unit kerja berhasil diterapkan.','ok','Aturan unit kerja diterapkan'); S.trend={}; S.cmp=null; loadData(DB.periode); }).catch(function(e){ btn.disabled=false; $('mapMsg').textContent=errMsg(e); toast(errMsg(e),'err','Gagal menerapkan aturan'); }); };
  $('btnRemap').onclick=function(){ remap('terbaru',this); };
  $('btnRemapAll').onclick=function(){ var btn=this; var th=(BOOT.periods.length?BOOT.periods[BOOT.periods.length-1].periode:'').slice(0,4); tanya({ judul:'Terapkan ke semua posisi TA '+th+'?', pesan:'Aturan terbaru akan diterapkan ke semua posisi data tahun anggaran '+th+'. Data tahun anggaran sebelumnya tidak ikut diubah.', ya:'Terapkan', bahaya:false }).then(function(ya){ if(ya) remap('semua',btn); }); };
}
/* kotak status di bawah formulir unggah: 'busy' (sedang diproses), 'ok', 'err' */
function upStatus(type,text){
  var m=$('upMsg'); if(!m) return;
  m.className='status-box s-'+type; m.hidden=false;
  m.innerHTML=(type==='busy'?'<span class="spin" aria-hidden="true"></span>':'')+'<span></span>';
  m.lastChild.textContent=text;
}
function upButton(busy){
  var b=$('btnUp'); if(!b) return;
  b.disabled=busy; b.innerHTML=busy?'<span class="spin" aria-hidden="true"></span>Memproses…':'Unggah &amp; proses';
}
function upGagal(text){
  upButton(false); upStatus('err',text);
  toast(text,'err','Unggahan gagal');
}
/* hasil sukses ditampilkan di jendela tersendiri: halaman Kelola Data dimuat ulang setelah unggah sehingga kotak status ikut hilang */
function upBerhasil(r, namaFile){
  var daftar=function(judul,isi){ return isi&&isi.length?'<div class="done-list"><b>'+esc(judul)+' ('+isi.length+')</b><ul>'+isi.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>':''; };
  /* tetap berhasil tersimpan, tetapi ada selisih total / catatan yang perlu dicek admin */
  var perluCek=(r.peringatan&&r.peringatan.length) || /PERHATIAN|belum punya sumber dana/.test(r.pesan||'');
  openModal(notifHtml(perluCek?'warn':'ok', perluCek?'Unggahan tersimpan — mohon diperiksa':'Unggahan berhasil', r.pesan||'File berhasil diproses.',
    '<p class="note" style="margin:0">'+esc(namaFile)+'</p>'+daftar('Sub komponen baru dibanding posisi sebelumnya',r.subBaru)+daftar('Catatan pembacaan',r.peringatan)));
}
function doUpload(){
  var f=$('upFile').files[0], jenis=$('upJenis').value, tg=$('upTgl').value, tahun=parseInt($('upTahun').value,10);
  if (!f){ upStatus('err','Pilih file Excel terlebih dahulu.'); return; }
  if (jenis==='REALISASI' && !tg){ upStatus('err','Isi tanggal posisi data.'); return; }
  if (jenis==='RKK' && !(tahun>=2000 && tahun<=2100)){ upStatus('err','Isi tahun anggaran RKK, misalnya '+new Date().getFullYear()+'.'); return; }
  if (typeof XLSX==='undefined'){ upGagal('Pembaca Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'); return; }
  upButton(true); upStatus('busy','Membaca file '+f.name+'…');
  var rd=new FileReader();
  rd.onerror=function(){ upGagal('File tidak bisa dibaca dari perangkat.'); };
  rd.onload=function(e){
    try{
      var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      var rowsX=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}).map(function(r){ var k=r.length; while(k>0&&r[k-1]==='') k--; return r.slice(0,k); });
      upStatus('busy','Memproses '+rp(rowsX.length)+' baris di server… Mohon tunggu, jangan tutup halaman ini.');
      SB.unggah(jenis,tg,f.name,rowsX,tahun).then(function(r){
        upButton(false); upStatus('ok',r.pesan||'File berhasil diproses.');
        var inp=$('upFile'); if(inp) inp.value='';
        upBerhasil(r, f.name);
        S.admin=null; S.trend={}; S.cmp=null;
        reboot(r.periode, true);
      }).catch(function(x){ upGagal('Gagal mengunggah: '+errMsg(x)); });
    } catch(ex){ upGagal('File tidak bisa dibaca: '+ex.message+'. Pastikan file adalah ekspor Excel dari SAKTI.'); }
  };
  rd.readAsArrayBuffer(f);
}

/* ================= Kelola Pengguna: daftar & hak akses (khusus super admin) ================= */
export function renderKelolaUser(){
  var A=ensureAdmin(); if (!A) return '<div class="loading">Memuat data admin…</div>';
  var units={Fakultas:{},Rektorat:{}}; A.rules.forEach(function(r){ if(r[4]) (units[r[4]]=units[r[4]]||{})[r[5]]=1; });
  var peranName={SUPERADMIN:'Super admin',ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Unit'};
  var emailSaya=sess().email;
  var users='<div class="tbl"><table><thead><tr><th>Email / nama pengguna</th><th>Peran</th><th>Cakupan</th><th>Masuk dengan</th><th>Status</th><th>Keterangan</th><th></th></tr></thead><tbody>'+
    A.users.map(function(u){ var aktif=/^(YA|Y|TRUE|AKTIF|1)$/i.test(u[4]), sendiri=u[0]===emailSaya;
      var aksi='<td class="row-actions"><button class="btn" type="button" data-edit="'+u[6]+'">Ubah</button><button class="btn" type="button" data-act="'+u[6]+'" data-on="'+(aktif?0:1)+'">'+(aktif?'Nonaktifkan':'Aktifkan')+'</button>'+(sendiri?'':'<button class="btn" type="button" data-del="'+u[6]+'" data-email="'+esc(u[0])+'">Hapus</button>')+'</td>';
      return '<tr><td>'+esc(u[0])+'</td><td>'+esc(peranName[String(u[1]).toUpperCase()]||u[1])+'</td><td>'+(u[2]?esc(u[2])+(u[3]?' › '+esc(u[3]):' (semua)'):'Seluruh satker')+'</td><td>'+loginWay(u)+'</td><td><span class="pill '+(aktif?'st-good':'st-crit')+'"><i></i>'+(aktif?'Aktif':'Nonaktif')+'</span></td><td>'+esc(u[5])+'</td>'+aksi+'</tr>'; }).join('')+'</tbody></table></div>';
  var form='<h3 class="eyebrow" style="margin:18px 0 8px" id="uFormTitle">Tambah pengguna</h3><div class="form"><input type="hidden" id="uRow">'+
    '<label class="f" for="uEmail">Email pengguna<input type="text" id="uEmail" placeholder="nama@kampus.ac.id"></label>'+
    '<label class="f" for="uPassword" id="uPasswordWrap"><span id="uPwLabel">Kata sandi awal</span><span class="pw-wrap"><input type="password" id="uPassword" placeholder="Minimal 8 karakter" autocomplete="new-password">'+
      '<button type="button" class="icon pw-eye" id="uPwEye" aria-label="Tampilkan kata sandi" aria-pressed="false" title="Tampilkan kata sandi">'+IC_EYE+'</button></span></label>'+
    '<label class="f" for="uPeran">Peran<select id="uPeran"><option value="UNIT">Fakultas / unit</option><option value="PIMPINAN">Pimpinan</option><option value="ADMIN">Admin keuangan</option></select></label>'+
    '<label class="f" for="uKat">Kategori<select id="uKat"><option value="Fakultas">Fakultas</option><option value="Rektorat">Rektorat</option></select></label>'+
    '<label class="f" for="uUnit">Unit<select id="uUnit"></select></label>'+
    '<label class="f" for="uKet">Keterangan<input type="text" id="uKet" placeholder="Jabatan / catatan"></label>'+
    '<p class="note" style="grid-column:1/-1;margin:0" id="uPwNote">Saat mengubah pengguna (tombol <b>Ubah</b>), isi kolom kata sandi hanya bila ingin menggantinya — kosongkan untuk mempertahankan kata sandi lama. Sampaikan kata sandi baru langsung kepada pengguna.</p>'+
    '<div class="tools"><button class="btn primary" type="button" id="btnSaveUser">Buat pengguna baru</button><button class="btn" type="button" id="btnClearUser">Kosongkan</button></div></div><div id="userMsg" class="note" style="margin-top:8px"></div>';
  setTimeout(function(){ bindKelolaUser(units); },0);
  return '<div class="page-sec grid">'+card('k-user','Pengguna & hak akses','Admin dan pimpinan melihat seluruh satker; pengguna unit hanya melihat cakupannya.',users+form)+'</div>';
}
function bindKelolaUser(units){
  if (!$('uPeran')) return;
  [].forEach.call(document.querySelectorAll('[data-del]'),function(b){ b.onclick=function(){
    tanya({ judul:'Hapus akun '+b.dataset.email+'?', pesan:'Pengguna ini tidak akan bisa masuk lagi. Tindakan ini tidak bisa dibatalkan.', ya:'Hapus akun' }).then(function(ya){
      if(!ya) return;
      b.disabled=true; SB.hapusPengguna(b.dataset.del).then(function(r){ toast(r.pesan,'ok','Akun dihapus'); S.admin=null; refresh(); }).catch(function(e){ b.disabled=false; toast(errMsg(e),'err','Gagal menghapus akun'); });
    });
  }; });
  var fillUnits=function(sel){ var k=$('uKat').value; $('uUnit').innerHTML='<option value="">Semua '+k+'</option>'+Object.keys(units[k]||{}).sort(function(a,b){var ia=FAK_ORDER.indexOf(a),ib=FAK_ORDER.indexOf(b);if(ia>=0&&ib>=0)return ia-ib;return a<b?-1:1;}).map(function(u){return '<option'+(u===sel?' selected':'')+'>'+esc(u)+'</option>';}).join(''); };
  var peranChange=function(){ var unit=$('uPeran').value==='UNIT'; $('uKat').disabled=!unit; $('uUnit').disabled=!unit; };
  $('uKat').onchange=function(){ fillUnits(''); }; $('uPeran').onchange=peranChange; fillUnits(''); peranChange();
  var lihatSandi=function(on){
    var b=$('uPwEye'); $('uPassword').type=on?'text':'password';
    b.innerHTML=on?IC_EYE_OFF:IC_EYE; b.setAttribute('aria-pressed',on?'true':'false');
    b.setAttribute('aria-label',on?'Sembunyikan kata sandi':'Tampilkan kata sandi'); b.title=b.getAttribute('aria-label');
  };
  $('uPwEye').onclick=function(){ lihatSandi($('uPassword').type==='password'); };
  var mode=function(){
    var edit=!!$('uRow').value, sendiri=edit && $('uEmail').value===sess().email;
    $('uEmail').readOnly=edit; $('uPassword').value=''; lihatSandi(false);
    /* akun sendiri diganti lewat menu Ubah sandi (perlu sesi pemiliknya) */
    $('uPasswordWrap').hidden=sendiri;
    $('uPwLabel').textContent=edit?'Kata sandi baru (opsional)':'Kata sandi awal';
    $('uPassword').placeholder=edit?'Kosongkan bila tidak diganti':'Minimal 8 karakter';
    $('btnSaveUser').textContent=edit?'Simpan perubahan':'Buat pengguna baru';
  };
  var clear=function(){ $('uRow').value=''; $('uEmail').value=''; $('uPassword').value=''; $('uKet').value=''; $('uPeran').value='UNIT'; $('uKat').value='Fakultas'; fillUnits(''); peranChange(); mode(); $('uFormTitle').textContent='Tambah pengguna'; };
  $('btnClearUser').onclick=clear;
  mode();
  [].forEach.call(document.querySelectorAll('[data-edit]'),function(b){ b.onclick=function(){
    var u=S.admin.users.filter(function(x){return String(x[6])===b.dataset.edit;})[0]; if(!u) return;
    $('uRow').value=u[6]; $('uEmail').value=u[0]; $('uPeran').value=String(u[1]).toUpperCase(); if(u[2]) $('uKat').value=u[2]; fillUnits(u[3]); $('uKet').value=u[5]; peranChange(); mode();
    $('uFormTitle').textContent='Ubah pengguna '+u[0];
  }; });
  [].forEach.call(document.querySelectorAll('[data-act]'),function(b){ b.onclick=function(){
    b.disabled=true; SB.aktifkan(b.dataset.act, b.dataset.on==='1').then(function(r){ toast(r.pesan,'ok'); S.admin=null; refresh(); }).catch(function(e){ b.disabled=false; toast(errMsg(e),'err'); });
  }; });
  $('btnSaveUser').onclick=function(){
    var btn=this, edit=!!$('uRow').value;
    btn.disabled=true; $('userMsg').textContent=edit?'Menyimpan…':'Membuat akun…';
    var selesai=function(r){ toast(r.pesan,'ok'); S.admin=null; refresh(); };
    var gagal=function(e){ btn.disabled=false; $('userMsg').textContent=errMsg(e); toast(errMsg(e),'err'); };
    if (edit){
      var id=$('uRow').value, sandiBaru=$('uPasswordWrap').hidden?'':$('uPassword').value;
      if (sandiBaru && sandiBaru.length<8){ gagal(new Error('Kata sandi baru minimal 8 karakter, atau kosongkan bila tidak diganti.')); return; }
      SB.simpanPengguna(id,$('uPeran').value,$('uKat').value,$('uUnit').value,$('uKet').value).then(function(r){
        if (!sandiBaru) return r;
        $('userMsg').textContent='Mengganti kata sandi…';
        return SB.aturSandi(id,sandiBaru).then(function(){ return { ok:true, pesan:'Pengguna disimpan dan kata sandinya diganti.' }; });
      }).then(selesai).catch(gagal);
      return;
    }
    var email=$('uEmail').value.trim(), pass=$('uPassword').value;
    if (!email){ gagal(new Error('Isi email pengguna.')); return; }
    if (pass.length<8){ gagal(new Error('Kata sandi minimal 8 karakter.')); return; }
    SB.buatPengguna(email,pass,$('uPeran').value,$('uKat').value,$('uUnit').value,$('uKet').value).then(function(r){ clear(); selesai(r); }).catch(gagal);
  };
}
function loginWay(u){
  var dom=(S.admin&&S.admin.domain||'').toLowerCase(), kampus=dom && u[0].slice(-(dom.length+1))==='@'+dom;
  var parts=[]; if(kampus) parts.push('Google kampus'); if(u[7]) parts.push('Kata sandi');
  return parts.length?esc(parts.join(' + ')):'<span class="neg">Belum bisa masuk — beri kata sandi</span>';
}
