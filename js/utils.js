/* js/utils.js — util umum: DOM, format angka/tanggal, pesan */
export function $(id){ return document.getElementById(id); }
var nf = new Intl.NumberFormat('id-ID');
export function rp(v){ return nf.format(Math.round(v||0)); }
export function rpk(v){ var a=Math.abs(v||0), s=v<0?'−':'';
  if (a>=1e9) return s+'Rp '+(a/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';
  if (a>=1e6) return s+'Rp '+(a/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';
  return s+'Rp '+nf.format(Math.round(a)); }
export function pc(v,d){ d=d==null?1:d; return ((v||0)*100).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d})+'%'; }
export function poin(v){ return (v>=0?'+':'−')+Math.abs(v*100).toLocaleString('id-ID',{maximumFractionDigits:1})+' poin'; }
export function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
var BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
var BLN_PANJANG=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export function tgl(p){ if(!p) return ''; var a=p.split('-'); return (+a[2])+' '+BLN[+a[1]-1]+' '+a[0]; }
export function tglPendek(p){ return tgl(p).replace(/ \d{4}$/,''); }
export function blnTahun(p){ if(!p) return ''; var a=p.split('-'); return BLN_PANJANG[+a[1]-1]+' '+a[0]; }
export function yearFrac(p){ var a=p.split('-').map(Number); var d=Date.UTC(a[0],a[1]-1,a[2]),s=Date.UTC(a[0],0,1),e=Date.UTC(a[0]+1,0,1); return ((d-s)/864e5+1)/((e-s)/864e5); }
export function endPrevMonth(p){ var a=p.split('-').map(Number); var d=new Date(Date.UTC(a[0],a[1]-1,0)); return d.toISOString().slice(0,10); }
export function sum(rows){ var t={pagu:0,lock:0,lalu:0,ini:0,sd:0,sisa:0,n:0,n0:0}; rows.forEach(function(r){ t.pagu+=r.pagu;t.lock+=r.lock;t.lalu+=r.lalu;t.ini+=r.ini;t.sd+=r.sd;t.sisa+=r.sisa;t.n++; if(r.sd===0&&r.pagu>0)t.n0++; }); t.p=t.pagu?t.sd/t.pagu:0; return t; }
export function group(rows, fn){ var m={},o=[]; rows.forEach(function(r){ var k=fn(r); if(!m[k]){m[k]=[];o.push(k);} m[k].push(r); }); return o.map(function(k){ var s=sum(m[k]); s.key=k; s.rows=m[k]; return s; }); }
/* ================= jendela (modal) & notifikasi =================
   Semua notifikasi tampil sebagai jendela bergaya sama dengan "Kata sandi berhasil diubah":
   ikon bulat besar, judul, pesan, tombol. onClose dipanggil saat jendela ditutup dengan cara apa pun. */
var jendelaTutup=null, jendelaTimer=null;
export function bukaJendela(html, onClose){
  var prev=jendelaTutup; jendelaTutup=null; if (prev) prev();
  clearTimeout(jendelaTimer);
  jendelaTutup=onClose||null;
  var m=$('modal'), bd=$('modalBd');
  m.innerHTML=html; m.hidden=false; bd.hidden=false;
  requestAnimationFrame(function(){ m.classList.add('open'); bd.classList.add('open'); });
}
export function tutupJendela(){
  var m=$('modal'), bd=$('modalBd');
  m.classList.remove('open'); bd.classList.remove('open');
  clearTimeout(jendelaTimer);
  jendelaTimer=setTimeout(function(){ m.hidden=true; bd.hidden=true; m.innerHTML=''; },200);
  var cb=jendelaTutup; jendelaTutup=null; if (cb) cb();
}
var NOTIF_IC={
  ok:'<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  err:'<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  warn:'<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  info:'<svg viewBox="0 0 24 24"><path d="M12 11v6M12 7.5h.01"/></svg>',
  tanya:'<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'
};
var NOTIF_JUDUL={ ok:'Berhasil', err:'Gagal', warn:'Perlu diperiksa', info:'Informasi' };
/* isi standar jendela notifikasi; tambahan = HTML ekstra (mis. daftar) di bawah pesan */
export function notifHtml(type, judul, pesan, tambahan, tombol){
  type=NOTIF_IC[type]?type:'info';
  return '<div class="done" role="'+(type==='err'||type==='tanya'?'alertdialog':'dialog')+'" aria-labelledby="ntJudul">'+
    '<div class="done-ic t-'+type+'">'+NOTIF_IC[type]+'</div>'+
    '<h3 id="ntJudul">'+esc(judul||NOTIF_JUDUL[type]||'')+'</h3>'+
    (pesan?'<p class="done-msg">'+esc(pesan)+'</p>':'')+(tambahan||'')+
    (tombol||'<button type="button" class="btn primary" data-modal-close>Tutup</button>')+'</div>';
}
function fokusTombol(sel){ setTimeout(function(){ var b=$('modal').querySelector(sel); if(b) b.focus(); },60); }
/* notifikasi. type: 'ok' (berhasil), 'err' (gagal), 'warn' (perlu diperiksa), selain itu informasi.
   Nama tetap "toast" agar semua pemanggil lama ikut berubah ke bentuk jendela. */
export function toast(msg, type, judul, onClose){
  bukaJendela(notifHtml(type, judul, msg), onClose);
  fokusTombol('[data-modal-close]');
}
/* pengganti confirm() bawaan browser. Mengembalikan Promise<boolean>; Batal/Esc/klik di luar = false. */
export function tanya(o){
  return new Promise(function(selesai){
    var dijawab=false;
    bukaJendela(notifHtml('tanya', o.judul, o.pesan, '',
      '<div class="done-btns"><button type="button" class="btn" data-modal-close>'+esc(o.batal||'Batal')+'</button>'+
      '<button type="button" class="btn '+(o.bahaya===false?'primary':'danger')+'" id="ntYa">'+esc(o.ya||'Ya')+'</button></div>'),
      function(){ if(!dijawab){ dijawab=true; selesai(false); } });
    $('ntYa').onclick=function(){ dijawab=true; selesai(true); tutupJendela(); };
    fokusTombol('[data-modal-close]');
  });
}
export function errMsg(e){
  var m = String((e && e.message) || (e && e.error_description) || e);
  var peta = {
    'Email not confirmed': 'Email belum dikonfirmasi. Klik tautan konfirmasi di email Anda, atau minta admin mematikan "Confirm email" di pengaturan Supabase.',
    'Invalid login credentials': 'Email atau kata sandi salah.',
    'User already registered': 'Email ini sudah terdaftar. Silakan masuk, atau pakai "Lupa kata sandi".',
    'Password should be at least 6 characters': 'Kata sandi terlalu pendek (minimal 8 karakter).',
    'should be different from the old password': 'Kata sandi baru harus berbeda dari kata sandi lama.',
    'requires reauthentication': 'Demi keamanan, silakan keluar lalu masuk kembali, kemudian ulangi ubah kata sandi.',
    'Email rate limit exceeded': 'Batas pengiriman email Supabase tercapai. Coba lagi nanti atau matikan konfirmasi email.',
    'Signups not allowed for this instance': 'Pendaftaran mandiri sedang dimatikan. Hubungi admin keuangan.',
    'permission denied for table': 'Akses ditolak database — biasanya karena sesi login sudah berakhir. Silakan keluar lalu masuk kembali, kemudian ulangi.',
    'JWT expired': 'Sesi login Anda sudah berakhir. Silakan masuk kembali, lalu ulangi.',
    'Failed to fetch': 'Tidak bisa menghubungi server. Periksa koneksi internet dan isi config.js.'
  };
  for (var k in peta) if (m.indexOf(k) >= 0) return peta[k];
  return m;
}
export function perluKonfirmasi(e){ return /Email not confirmed/i.test(String((e && e.message) || e)); }
