/* js/akun.js — jendela Ubah kata sandi (pengganti prompt() bawaan browser yang menampilkan sandi apa adanya) */
import { $, esc, errMsg, notifHtml } from './utils.js';
import { sess } from './state.js';
import { openModal } from './ui-components.js';
import { SB } from './api.js';

var IC_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
export var IC_EYE='<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
export var IC_EYE_OFF='<svg viewBox="0 0 24 24"><path d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

function kolom(id,label,ac){
  return '<label class="f" for="'+id+'">'+label+'<span class="pw-wrap"><input type="password" id="'+id+'" autocomplete="'+ac+'" required>'+
    '<button type="button" class="icon pw-eye" data-eye="'+id+'" aria-label="Tampilkan kata sandi" aria-pressed="false" title="Tampilkan kata sandi">'+IC_EYE+'</button></span></label>';
}

export function bukaUbahSandi(){
  var email=(sess()&&sess().email)||'';
  openModal(
    '<div class="modal-hd"><div><span class="note">'+esc(email)+'</span><h3 id="pwJudul">Ubah kata sandi</h3></div>'+
      '<button type="button" class="icon" data-modal-close aria-label="Tutup">'+IC_X+'</button></div>'+
    '<form id="pwForm" class="pw-form" novalidate>'+
      /* kolom username tersembunyi: membantu pengelola sandi browser menyimpan sandi baru ke akun yang benar */
      '<input type="email" autocomplete="username" value="'+esc(email)+'" hidden readonly>'+
      kolom('pwBaru','Kata sandi baru','new-password')+
      kolom('pwUlang','Ulangi kata sandi baru','new-password')+
      '<p class="note" style="margin:0">Minimal 8 karakter.</p>'+
      '<div id="pwMsg" class="status-box" role="alert" hidden></div>'+
      '<div class="tools"><button type="submit" class="btn primary" id="pwSimpan">Simpan kata sandi</button>'+
      '<button type="button" class="btn" data-modal-close>Batal</button></div>'+
    '</form>'
  );
  setTimeout(function(){ var i=$('pwBaru'); if(i) i.focus(); },60);

  [].forEach.call($('modal').querySelectorAll('[data-eye]'),function(b){
    b.onclick=function(){
      var inp=$(b.getAttribute('data-eye')), lihat=inp.type==='password';
      inp.type=lihat?'text':'password';
      b.innerHTML=lihat?IC_EYE_OFF:IC_EYE;
      b.setAttribute('aria-pressed',lihat?'true':'false');
      b.setAttribute('aria-label',lihat?'Sembunyikan kata sandi':'Tampilkan kata sandi');
      b.title=b.getAttribute('aria-label');
    };
  });

  $('pwForm').onsubmit=function(e){
    e.preventDefault();
    var baru=$('pwBaru').value, ulang=$('pwUlang').value, msg=$('pwMsg'), btn=$('pwSimpan');
    var salah=function(t,fokus){ msg.className='status-box s-err'; msg.textContent=t; msg.hidden=false; if(fokus) fokus.focus(); };
    if (baru.length<8) return salah('Kata sandi minimal 8 karakter.',$('pwBaru'));
    if (baru!==ulang) return salah('Kedua kata sandi tidak sama. Ketik ulang dengan teliti.',$('pwUlang'));
    msg.hidden=true;
    btn.disabled=true; btn.innerHTML='<span class="spin" aria-hidden="true"></span>Menyimpan…';
    SB.gantiSandi(baru).then(function(){
      var m=$('modal'); if(!m || !$('pwForm')) return; /* jendela sudah ditutup pengguna */
      m.innerHTML=notifHtml('ok','Kata sandi berhasil diubah','Gunakan kata sandi baru ini saat masuk berikutnya.');
      var t=m.querySelector('[data-modal-close]'); if(t) t.focus();
    }).catch(function(err){
      btn.disabled=false; btn.textContent='Simpan kata sandi';
      salah('Gagal mengubah kata sandi: '+errMsg(err));
    });
  };
}
