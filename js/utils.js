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
export function tgl(p){ if(!p) return ''; var a=p.split('-'); return (+a[2])+' '+BLN[+a[1]-1]+' '+a[0]; }
export function tglPendek(p){ return tgl(p).replace(/ \d{4}$/,''); }
export function yearFrac(p){ var a=p.split('-').map(Number); var d=Date.UTC(a[0],a[1]-1,a[2]),s=Date.UTC(a[0],0,1),e=Date.UTC(a[0]+1,0,1); return ((d-s)/864e5+1)/((e-s)/864e5); }
export function endPrevMonth(p){ var a=p.split('-').map(Number); var d=new Date(Date.UTC(a[0],a[1]-1,0)); return d.toISOString().slice(0,10); }
export function sum(rows){ var t={pagu:0,lock:0,lalu:0,ini:0,sd:0,sisa:0,n:0,n0:0}; rows.forEach(function(r){ t.pagu+=r.pagu;t.lock+=r.lock;t.lalu+=r.lalu;t.ini+=r.ini;t.sd+=r.sd;t.sisa+=r.sisa;t.n++; if(r.sd===0&&r.pagu>0)t.n0++; }); t.p=t.pagu?t.sd/t.pagu:0; return t; }
export function group(rows, fn){ var m={},o=[]; rows.forEach(function(r){ var k=fn(r); if(!m[k]){m[k]=[];o.push(k);} m[k].push(r); }); return o.map(function(k){ var s=sum(m[k]); s.key=k; s.rows=m[k]; return s; }); }
export function toast(msg, html){ var t=$('toast'); if(html) t.innerHTML=msg; else t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(function(){t.hidden=true;},8000); }
export function errMsg(e){
  var m = String((e && e.message) || (e && e.error_description) || e);
  var peta = {
    'Email not confirmed': 'Email belum dikonfirmasi. Klik tautan konfirmasi di email Anda, atau minta admin mematikan "Confirm email" di pengaturan Supabase.',
    'Invalid login credentials': 'Email atau kata sandi salah.',
    'User already registered': 'Email ini sudah terdaftar. Silakan masuk, atau pakai "Lupa kata sandi".',
    'Password should be at least 6 characters': 'Kata sandi terlalu pendek (minimal 8 karakter).',
    'Email rate limit exceeded': 'Batas pengiriman email Supabase tercapai. Coba lagi nanti atau matikan konfirmasi email.',
    'Signups not allowed for this instance': 'Pendaftaran mandiri sedang dimatikan. Hubungi admin keuangan.',
    'Failed to fetch': 'Tidak bisa menghubungi server. Periksa koneksi internet dan isi config.js.'
  };
  for (var k in peta) if (m.indexOf(k) >= 0) return peta[k];
  return m;
}
export function perluKonfirmasi(e){ return /Email not confirmed/i.test(String((e && e.message) || e)); }
