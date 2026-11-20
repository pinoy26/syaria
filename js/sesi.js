/* js/sesi.js — pengaman sesi login
   B. Keluar otomatis bila tidak ada aktivitas selama BATAS (dihitung bersama untuk semua tab,
      termasuk saat laptop tidur/dimatikan). Peringatan muncul PERINGATAN sebelum keluar.
   C. Login ulang setiap kali browser ditutup: tab baru yang dibuka tanpa tab LANTERA lain yang
      masih terbuka dianggap pembukaan baru browser, sesi lama diakhiri. */
import { SBC } from './api.js?v=202611201707';

export var BATAS_MENIT = 60;
var BATAS = BATAS_MENIT * 60 * 1000, PERINGATAN = 2 * 60 * 1000;
var KUNCI = 'lentera-aktif', TANDA_TAB = 'lentera-tab';
var alasan = '';

function bacaAktif(){ try { return +localStorage.getItem(KUNCI) || 0; } catch (e) { return 0; } }
export function tandaiAktif(){ try { localStorage.setItem(KUNCI, String(Date.now())); } catch (e) {} }

/* pesan untuk halaman masuk setelah keluar otomatis (sekali pakai) */
export function pesanKeluar(){
  var a = alasan; alasan = '';
  return a === 'diam' ? 'Anda keluar otomatis karena tidak ada aktivitas selama ' + (BATAS_MENIT % 60 ? BATAS_MENIT + ' menit' : (BATAS_MENIT / 60) + ' jam') + '. Silakan masuk kembali.' : '';
}

/* tab LANTERA lain yang masih terbuka menjawab pertanyaan lewat BroadcastChannel */
var kanal = null;
try { kanal = new BroadcastChannel('lentera-sesi'); kanal.onmessage = function(e){ if (e.data === 'tanya') kanal.postMessage('ada'); }; } catch (e) {}
function adaTabLain(){
  return new Promise(function(selesai){
    if (!kanal) { selesai(false); return; }
    function jawab(e){ if (e.data === 'ada') { clearTimeout(t); kanal.removeEventListener('message', jawab); selesai(true); } }
    var t = setTimeout(function(){ kanal.removeEventListener('message', jawab); selesai(false); }, 400);
    kanal.addEventListener('message', jawab);
    kanal.postMessage('tanya');
  });
}
function keluar(sebab){ alasan = sebab; tutupPeringatan(); return SBC.auth.signOut({ scope: 'local' }).catch(function(){}); }

/* dijalankan sekali saat halaman dibuka, sebelum dasbor dimuat */
export function periksaAwal(){
  var tabBaru = false;
  try { tabBaru = !sessionStorage.getItem(TANDA_TAB); sessionStorage.setItem(TANDA_TAB, '1'); } catch (e) {}
  return SBC.auth.getSession().then(function(r){
    if (!r.data || !r.data.session) return;
    if (Date.now() - bacaAktif() > BATAS) return keluar('diam');
    if (!tabBaru) return;                       // muat ulang (F5) pada tab yang sama
    return adaTabLain().then(function(ada){ if (!ada) return keluar('tutup'); });
  }).catch(function(){});
}

/* ---------- peringatan sebelum keluar ---------- */
var elPeringatan = null;
function tampilPeringatan(sisa){
  var menit = Math.max(1, Math.ceil(sisa / 60000));
  if (!elPeringatan){
    elPeringatan = document.createElement('div');
    elPeringatan.className = 'sesi-peringatan'; elPeringatan.setAttribute('role', 'alert');
    elPeringatan.innerHTML = '<span></span><button type="button" class="btn primary">Tetap masuk</button>';
    elPeringatan.querySelector('button').onclick = function(){ tandaiAktif(); tutupPeringatan(); };
    document.body.appendChild(elPeringatan);
  }
  elPeringatan.querySelector('span').textContent = 'Tidak ada aktivitas. Anda akan keluar otomatis dalam ±' + menit +
    ' menit. Simpan pekerjaan yang belum disimpan.';
}
function tutupPeringatan(){ if (elPeringatan){ elPeringatan.remove(); elPeringatan = null; } }

function cek(){
  var app = document.getElementById('app');
  if (!app || app.hidden) { tutupPeringatan(); return; }
  var sisa = BATAS - (Date.now() - bacaAktif());
  if (sisa <= 0) { keluar('diam'); return; }
  if (sisa <= PERINGATAN) tampilPeringatan(sisa); else tutupPeringatan();
}

/* pantau aktivitas pengguna; penulisan ke localStorage dibatasi tiap 15 detik */
export function pantauAktivitas(){
  var tulis = 0;
  function aktif(){
    var n = Date.now(), app = document.getElementById('app');
    /* gerakan pertama setelah laptop bangun tidak boleh memperpanjang sesi yang sudah lewat batas */
    if (app && !app.hidden && n - bacaAktif() > BATAS) { cek(); return; }
    if (n - tulis > 15000) { tulis = n; tandaiAktif(); }
    if (elPeringatan) tutupPeringatan();
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'].forEach(function(ev){
    document.addEventListener(ev, aktif, { passive: true, capture: true });
  });
  setInterval(cek, 15000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) cek(); });
}
