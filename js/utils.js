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
/* notifikasi singkat di atas layar. type: 'ok' (berhasil), 'err' (gagal), selain itu informasi */
var TOAST_IC={
  ok:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>',
  err:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5h.01"/></svg>',
  info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7.5h.01"/></svg>'
};
export function toast(msg, type){
  var t=$('toast'); type=TOAST_IC[type]?type:'info';
  t.className='toast glass t-'+type;
  t.setAttribute('role', type==='err'?'alert':'status');
  t.innerHTML='<span class="t-ic">'+TOAST_IC[type]+'</span><span class="t-msg"></span>'+
    '<button type="button" class="icon t-x" aria-label="Tutup notifikasi"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  t.querySelector('.t-msg').textContent=msg;
  t.querySelector('.t-x').onclick=function(){ t.hidden=true; };
  t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(function(){ t.hidden=true; }, type==='err'?12000:6000);
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
