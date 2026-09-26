/* js/pages/kelola.js — Kelola Data (admin) */
import { $, esc, rp, pc, tgl, toast, errMsg } from '../utils.js';
import { S, FAK_ORDER, DB } from '../state.js';
import { card } from '../ui-components.js';
import { SB } from '../api.js';
import { refresh } from '../nav.js';
import { reboot, loadData } from '../main.js';

/* ================= kelola data (admin) ================= */
export function renderKelola(){
  var A=S.admin;
  if (!A){ SB.adminInfo().then(function(x){ S.admin=x; if(S.page==='kelola') refresh(); }).catch(function(e){ $('page').innerHTML='<div class="glass card">'+esc(errMsg(e))+'</div>'; }); return '<div class="loading">Memuat data admin…</div>'; }
  var units={Fakultas:{},Rektorat:{}}; A.rules.forEach(function(r){ if(r[4]) (units[r[4]]=units[r[4]]||{})[r[5]]=1; });
  var up='<div class="form"><label class="f" for="upJenis">Jenis file<select id="upJenis"><option value="REALISASI">Laporan Ketersediaan Dana Detail</option><option value="RKK">Rincian Kertas Kerja Satker (sumber dana)</option></select></label>'+
    '<label class="f" for="upTgl" id="upTglWrap">Tanggal posisi data<input type="date" id="upTgl"></label>'+
    '<label class="f" for="upFile">File Excel (.xlsx / .xls)<input type="file" id="upFile" accept=".xlsx,.xls"></label>'+
    '<div><button class="btn primary" type="button" id="btnUp">Unggah &amp; proses</button></div></div><div id="upMsg" class="note" style="margin-top:12px;white-space:pre-wrap"></div>'+
    '<p class="note">Setelah revisi DIPA/POK: unggah RKK terlebih dahulu, lalu Laporan Ketersediaan Dana. Mengunggah ulang tanggal yang sama akan menggantikan data tanggal tersebut.</p>';
  var log='<div class="tbl"><table><thead><tr><th>Posisi</th><th>Diunggah</th><th>File</th><th class="n">Detail</th><th class="n">Pagu</th><th class="n">Realisasi</th><th class="n">%</th><th>Cek</th><th></th></tr></thead><tbody>'+
    A.periods.slice().reverse().map(function(p){ var ok=Number(p.cekPagu)===0&&Number(p.cekReal)===0&&p.cekPagu!==''; return '<tr><td><b>'+tgl(p.periode)+'</b></td><td>'+esc(p.diunggah)+'<br><span class="note">'+esc(p.pengunggah)+'</span></td><td>'+esc(p.file)+'</td><td class="n">'+rp(p.jumlah)+'</td><td class="n">'+rp(p.pagu)+'</td><td class="n">'+rp(p.sd)+'</td><td class="n">'+pc(p.persen)+'</td><td><span class="pill '+(ok?'st-good':'st-crit')+'"><i></i>'+(ok?'Cocok':'Periksa')+'</span></td><td><button class="btn" type="button" data-delp="'+p.periode+'">Hapus</button></td></tr>'; }).join('')+'</tbody></table></div>';
  var rules='<div class="tbl"><table><thead><tr><th>KRO</th><th>Komponen</th><th>Jenis aturan</th><th>Kode</th><th>Kategori</th><th>Unit</th><th>Keterangan</th></tr></thead><tbody>'+
    A.rules.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(i===3?' class="code"':'')+'>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'+
    '<div class="tools" style="margin-top:12px"><a class="link" href="'+esc(A.sheetUrl)+'" target="_blank" rel="noopener">Ubah aturan di sheet Ref_Unit ›</a><button class="btn" type="button" id="btnRemap">Terapkan ke posisi terbaru</button><button class="btn" type="button" id="btnRemapAll">Terapkan ke semua posisi</button></div>'+
    '<p class="note">Urutan: kode lengkap → huruf pertama → komponen → selain itu Rektorat. Terapkan ke semua posisi hanya untuk memperbaiki salah pemetaan — perubahan pemilik kode setelah revisi cukup berlaku untuk posisi terbaru.</p><div id="mapMsg" class="note"></div>';
  var peranName={ADMIN:'Admin keuangan',PIMPINAN:'Pimpinan',UNIT:'Unit'};
  var users='<div class="tbl"><table><thead><tr><th>Email / nama pengguna</th><th>Peran</th><th>Cakupan</th><th>Masuk dengan</th><th>Status</th><th>Keterangan</th><th></th></tr></thead><tbody>'+
    A.users.map(function(u){ var aktif=/^(YA|Y|TRUE|AKTIF|1)$/i.test(u[4]); return '<tr><td>'+esc(u[0])+'</td><td>'+esc(peranName[String(u[1]).toUpperCase()]||u[1])+'</td><td>'+(u[2]?esc(u[2])+(u[3]?' › '+esc(u[3]):' (semua)'):'Seluruh satker')+'</td><td>'+loginWay(u)+'</td><td><span class="pill '+(aktif?'st-good':'st-crit')+'"><i></i>'+(aktif?'Aktif':'Nonaktif')+'</span></td><td>'+esc(u[5])+'</td><td class="row-actions"><button class="btn" type="button" data-edit="'+u[6]+'">Ubah</button><button class="btn" type="button" data-act="'+u[6]+'" data-on="'+(aktif?0:1)+'">'+(aktif?'Nonaktifkan':'Aktifkan')+'</button></td></tr>'; }).join('')+'</tbody></table></div>'+
    '<h3 class="eyebrow" style="margin:18px 0 8px" id="uFormTitle">Tambah pengguna</h3><div class="form"><input type="hidden" id="uRow">'+
    '<label class="f" for="uEmail">Email pengguna<input type="text" id="uEmail" readonly placeholder="pilih lewat tombol Ubah di tabel"></label>'+

    '<label class="f" for="uPeran">Peran<select id="uPeran"><option value="UNIT">Fakultas / unit</option><option value="PIMPINAN">Pimpinan</option><option value="ADMIN">Admin keuangan</option></select></label>'+
    '<label class="f" for="uKat">Kategori<select id="uKat"><option value="Fakultas">Fakultas</option><option value="Rektorat">Rektorat</option></select></label>'+
    '<label class="f" for="uUnit">Unit<select id="uUnit"></select></label>'+
    '<label class="f" for="uKet">Keterangan<input type="text" id="uKet" placeholder="Jabatan / catatan"></label>'+
    '<p class="note" style="grid-column:1/-1;margin:0">Membuat akun baru: buka <a class="link" href="'+esc(A.authUrl)+'" target="_blank" rel="noopener">Supabase → Authentication → Users</a> → <b>Add user</b> → isi email &amp; kata sandi → centang <b>Auto Confirm User</b>. Setelah itu muat ulang halaman ini, akunnya akan muncul di tabel, lalu klik <b>Ubah</b> untuk menentukan peran dan cakupan unitnya.</p>'+
    '<div class="tools"><button class="btn primary" type="button" id="btnSaveUser">Simpan pengguna</button><button class="btn" type="button" id="btnClearUser">Kosongkan</button></div></div><div id="userMsg" class="note" style="margin-top:8px"></div>';
  setTimeout(function(){ bindKelola(units); },0);
  return '<div class="page-sec grid">'+card('k-up','Unggah laporan SAKTI','File dibaca di browser, dicocokkan dengan baris JUMLAH SELURUHNYA, lalu disimpan per tanggal posisi.',up)+
    card('k-log','Riwayat unggahan','Cek harus "Cocok": total detail sama dengan baris JUMLAH SELURUHNYA pada laporan.',log)+
    card('k-rule','Aturan unit kerja','Menentukan Fakultas/Rektorat setiap sub komponen.',rules)+
    card('k-user','Pengguna & hak akses','Admin dan pimpinan melihat seluruh satker; pengguna unit hanya melihat cakupannya.',users)+'</div>';
}
function bindKelola(units){
  if (!$('btnUp')) return;
  var today=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
  $('upTgl').value=today;
  $('upJenis').onchange=function(){ $('upTglWrap').hidden=this.value==='RKK'; };
  $('btnUp').onclick=doUpload;
  [].forEach.call(document.querySelectorAll('[data-delp]'),function(b){ b.onclick=function(){
    if(!confirm('Hapus data posisi '+tgl(b.dataset.delp)+'? Tindakan ini tidak bisa dibatalkan.')) return;
    b.disabled=true; SB.hapusPeriode(b.dataset.delp).then(function(r){ toast(r.pesan); reboot(); }).catch(function(e){ b.disabled=false; toast(errMsg(e)); });
  }; });
  var remap=function(scope,btn){ btn.disabled=true; $('mapMsg').textContent='Memproses…'; SB.terapkanUlang(scope).then(function(r){ $('mapMsg').textContent=r.pesan; S.trend={}; S.cmp=null; loadData(DB.periode); }).catch(function(e){ btn.disabled=false; $('mapMsg').textContent=errMsg(e); }); };
  $('btnRemap').onclick=function(){ remap('terbaru',this); };
  $('btnRemapAll').onclick=function(){ if(confirm('Terapkan aturan terbaru ke SEMUA posisi data? Data lama akan ikut dipetakan ulang.')) remap('semua',this); };
  var fillUnits=function(sel){ var k=$('uKat').value; $('uUnit').innerHTML='<option value="">Semua '+k+'</option>'+Object.keys(units[k]||{}).sort(function(a,b){var ia=FAK_ORDER.indexOf(a),ib=FAK_ORDER.indexOf(b);if(ia>=0&&ib>=0)return ia-ib;return a<b?-1:1;}).map(function(u){return '<option'+(u===sel?' selected':'')+'>'+esc(u)+'</option>';}).join(''); };
  var peranChange=function(){ var unit=$('uPeran').value==='UNIT'; $('uKat').disabled=!unit; $('uUnit').disabled=!unit; };
  $('uKat').onchange=function(){ fillUnits(''); }; $('uPeran').onchange=peranChange; fillUnits(''); peranChange();
  var clear=function(){ $('uRow').value=''; $('uEmail').value=''; $('uKet').value=''; $('uPeran').value='UNIT'; $('uKat').value='Fakultas'; fillUnits(''); peranChange(); $('uFormTitle').textContent='Tambah pengguna'; };
  $('btnClearUser').onclick=clear;
  [].forEach.call(document.querySelectorAll('[data-edit]'),function(b){ b.onclick=function(){
    var u=S.admin.users.filter(function(x){return String(x[6])===b.dataset.edit;})[0]; if(!u) return;
    $('uRow').value=u[6]; $('uEmail').value=u[0]; $('uPeran').value=String(u[1]).toUpperCase(); if(u[2]) $('uKat').value=u[2]; fillUnits(u[3]); $('uKet').value=u[5]; peranChange();
    $('uFormTitle').textContent='Ubah pengguna '+u[0]; $('uEmail').focus();
  }; });
  [].forEach.call(document.querySelectorAll('[data-act]'),function(b){ b.onclick=function(){
    b.disabled=true; SB.aktifkan(b.dataset.act, b.dataset.on==='1').then(function(r){ toast(r.pesan); S.admin=null; refresh(); }).catch(function(e){ b.disabled=false; toast(errMsg(e)); });
  }; });
  $('btnSaveUser').onclick=function(){
    var btn=this; btn.disabled=true; $('userMsg').textContent='Menyimpan…';
    SB.simpanPengguna($('uRow').value,$('uPeran').value,$('uKat').value,$('uUnit').value,$('uKet').value)
      .then(function(r){ toast(r.pesan); S.admin=null; refresh(); })
      .catch(function(e){ btn.disabled=false; $('userMsg').textContent=errMsg(e); });
  };
}
function loginWay(u){
  var dom=(S.admin&&S.admin.domain||'').toLowerCase(), kampus=dom && u[0].slice(-(dom.length+1))==='@'+dom;
  var parts=[]; if(kampus) parts.push('Google kampus'); if(u[7]) parts.push('Kata sandi');
  return parts.length?esc(parts.join(' + ')):'<span class="neg">Belum bisa masuk — beri kata sandi</span>';
}
function doUpload(){
  var f=$('upFile').files[0], jenis=$('upJenis').value, tg=$('upTgl').value, msg=$('upMsg'), btn=$('btnUp');
  if (!f){ msg.textContent='Pilih file terlebih dahulu.'; return; }
  if (jenis==='REALISASI' && !tg){ msg.textContent='Isi tanggal posisi data.'; return; }
  if (typeof XLSX==='undefined'){ msg.textContent='Pembaca Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'; return; }
  btn.disabled=true; msg.textContent='Membaca file…';
  var rd=new FileReader();
  rd.onload=function(e){
    try{
      var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      var rowsX=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}).map(function(r){ var k=r.length; while(k>0&&r[k-1]==='') k--; return r.slice(0,k); });
      msg.textContent='Memproses '+rowsX.length+' baris di server…';
      SB.unggah(jenis,tg,f.name,rowsX).then(function(r){
        var t=r.pesan;
        if (r.subBaru && r.subBaru.length) t+='\n\nSub komponen baru dibanding posisi sebelumnya ('+r.subBaru.length+'):\n• '+r.subBaru.join('\n• ');
        if (r.peringatan && r.peringatan.length) t+='\n\nCatatan pembacaan:\n• '+r.peringatan.join('\n• ');
        msg.textContent=t; btn.disabled=false; $('upFile').value='';
        S.admin=null; S.trend={}; S.cmp=null;
        reboot(r.periode, true);
      }).catch(function(x){ btn.disabled=false; msg.textContent='Gagal: '+errMsg(x); });
    } catch(ex){ btn.disabled=false; msg.textContent='File tidak bisa dibaca: '+ex.message; }
  };
  rd.readAsArrayBuffer(f);
}
