/* js/theme.js — tema gelap/terang manual (tersimpan di localStorage) */
export function toggleTheme(){
  var root=document.documentElement;
  var cur=root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var next=cur==='dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try{ localStorage.setItem('dasbor-tema', next); }catch(e){}
}
document.addEventListener('click', function(e){ if (e.target.closest('[data-theme-toggle]')) toggleTheme(); });

export var THEME_BTN = '<button type="button" class="icon theme-toggle" data-theme-toggle aria-label="Ganti mode gelap/terang" title="Mode gelap/terang">' +
  '<svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>' +
  '<svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>' +
  '</button>';
