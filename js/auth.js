/* js/auth.js — halaman masuk (login gate) */
import { $, esc, errMsg, perluKonfirmasi } from './utils.js';
import { BOOT } from './state.js';
import { THEME_BTN } from './theme.js';
import { SBC } from './api.js';
import { mulai } from './main.js';

export function tampilMasuk(catatan){
  $('app').hidden = true; $('boot').hidden = true; $('gate').hidden = false;
  $('gate').innerHTML =
    THEME_BTN +
    '<div class="brand" style="justify-content:center;margin-bottom:14px"><div class="mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20V10l7-5 7 5v10"/><path d="M9 20v-5h6v5"/></svg></div>' +
    '<div style="text-align:left"><b>Dasbor Anggaran</b><small>' + esc((BOOT && BOOT.satker) || 'Monitoring Anggaran & Realisasi') + '</small></div></div>' +
    '<h2 style="margin:0 0 6px">Masuk</h2>' +
    '<p class="note" style="margin:0 0 16px">' + esc(catatan || 'Masukkan email dan kata sandi yang diberikan admin keuangan.') + '</p>' +
    '<form id="loginForm" style="display:grid;gap:12px;text-align:left">' +
    '<label class="f" for="lgId">Email<input type="email" id="lgId" autocomplete="username" required></label>' +
    '<label class="f" for="lgPw">Kata sandi<input type="password" id="lgPw" autocomplete="current-password" required></label>' +
    '<button class="btn primary" type="submit" id="lgBtn" style="justify-content:center">Masuk</button>' +
    '<div id="lgMsg" class="note"></div></form>' +
    '<div class="tools" style="margin-top:14px;justify-content:center"><button class="btn" type="button" id="lgLupa">Lupa kata sandi</button></div>' +
    '<p class="note" style="margin-top:14px">Belum punya akun? Akun dibuatkan oleh admin keuangan.</p>';
  $('lgLupa').onclick = function(){
    var em = $('lgId').value.trim();
    if (!em) { $('lgMsg').textContent = 'Isi email dulu, lalu klik Lupa kata sandi.'; return; }
    SBC.auth.resetPasswordForEmail(em, { redirectTo: location.href.split('#')[0] })
      .then(function(r){ if (r.error) throw r.error; $('lgMsg').textContent = 'Tautan penggantian kata sandi dikirim ke ' + em + '. Bila tidak sampai, minta admin mengganti kata sandi Anda.'; })
      .catch(function(e){ $('lgMsg').textContent = errMsg(e); });
  };
  $('loginForm').onsubmit = function(e){
    e.preventDefault();
    var b = $('lgBtn'); b.disabled = true; $('lgMsg').textContent = 'Memeriksa…';
    SBC.auth.signInWithPassword({ email: $('lgId').value.trim(), password: $('lgPw').value }).then(function(r){
      if (r.error) throw r.error;
      $('gate').hidden = true; $('boot').hidden = false; $('boot').textContent = 'Memuat dasbor…';
      mulai();
    }).catch(function(x){
      b.disabled = false;
      $('lgMsg').textContent = errMsg(x);
      if (perluKonfirmasi(x)) $('lgMsg').textContent = 'Email akun ini belum dikonfirmasi. Minta admin membuka Supabase → Authentication → Users → akun Anda → Confirm email.';
    });
  };
  $('lgId').focus();
}
