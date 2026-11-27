/* js/berita.js — Berita & Pengumuman: tampilan bersama (halaman login, lonceng dasbor, halaman baca berita) */
import { $, esc, tgl, toast, errMsg } from './utils.js?v=202611270719';
import { SB } from './api.js?v=202611270719';
import { sess, punyaSalah } from './state.js?v=202611270719';
import { openModal, closeModal } from './ui-components.js?v=202611270719';

export var JENIS = { info: ['st-info', 'Info'], penting: ['st-crit', 'Penting'], tenggat: ['st-warn', 'Tenggat'] };
export var IC_BERITA = '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>';
var IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
var IC_BACK = '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>';
var K_BACA = 'dasbor-berita-dibaca';
var HASH = /^#berita-(\d+)$/;

/* ---------- format ---------- */
function dua(n){ return ('0' + n).slice(-2); }
/* ISO → 'YYYY-MM-DD' menurut zona waktu perangkat */
export function tglLokal(iso){ var d = new Date(iso); return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()); }
export function tglBerita(iso){ return iso ? tgl(tglLokal(iso)) : ''; }
export function ukuran(b){ return b >= 1048576 ? (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function isFoto(l){ return /^image\//.test(l.mime); }
export function pillJenis(j){ var x = JENIS[j] || JENIS.info; return '<span class="pill ' + x[0] + '"><i></i>' + x[1] + '</span>'; }
function ringkas(s, n){
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}
function cari(items, id){ return items.filter(function(b){ return String(b.id) === String(id); })[0]; }

/* ---------- tanda sudah dibaca (disimpan per perangkat) ---------- */
function ambilSet(k){ try { var a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function simpanSet(k, a){ try { localStorage.setItem(k, JSON.stringify(a.slice(-300))); } catch (e) {} }
function sudahDibaca(id){ return ambilSet(K_BACA).indexOf(id) >= 0; }
function tandaiDibaca(ids){ var a = ambilSet(K_BACA); ids.forEach(function(id){ if (a.indexOf(id) < 0) a.push(id); }); simpanSet(K_BACA, a); }

/* ---------- potongan daftar ---------- */
function itemHtml(b, baru){
  var r = ringkas(b.isi, 150);
  return '<button type="button" class="nw-item' + (baru ? ' baru' : '') + '" data-berita="' + b.id + '">' +
    '<span class="nw-meta">' + pillJenis(b.jenis) + (b.bentuk === 'flayer' ? '<span class="nw-tag">Flayer</span>' : '') + (b.disematkan ? '<span class="nw-tag">Disematkan</span>' : '') +
      '<span>' + tglBerita(b.mulai) + '</span>' + (b.lampiran.length ? '<span>· ' + b.lampiran.length + ' lampiran</span>' : '') +
      (baru ? '<span class="nw-dot" aria-label="Belum dibaca"></span>' : '') + '</span>' +
    '<b class="nw-judul">' + esc(b.judul) + '</b>' + (r ? '<span class="nw-ring">' + esc(r) + '</span>' : '') + '</button>';
}
function bindItems(root, items, onOpen){
  [].forEach.call(root.querySelectorAll('[data-berita]'), function(el){
    el.onclick = function(){ var b = cari(items, el.getAttribute('data-berita')); if (b) onOpen(b, el); };
  });
}

/* ================= halaman baca berita (menutupi halaman di bawahnya; alamat #berita-<id>) =================
   Ditutup lewat tombol Kembali, Escape, atau tombol kembali browser/HP → halaman sebelumnya utuh,
   termasuk posisi gulirnya, karena halaman di bawahnya tidak pernah dirender ulang. */
var RD = { open: false, pushed: false, fokus: null };
export function bukaHalamanBerita(b, asal, dariUrl){
  closeModal();
  var h = $('reader');
  if (!RD.open) RD.fokus = asal || document.activeElement;
  var foto = '', dok = '';
  b.lampiran.forEach(function(l, i){
    if (isFoto(l)) foto += '<a class="rd-ph" data-lamp="' + i + '" target="_blank" rel="noopener" title="Buka foto ukuran penuh"><img alt="' + esc(l.nama) + '"></a>';
    else dok += '<li><a class="rd-file" data-lamp="' + i + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span><b>' + esc(l.nama) + '</b><small>PDF · ' + ukuran(l.ukuran) + '</small></span></a></li>';
  });
  h.innerHTML =
    '<header class="rd-bar"><button type="button" class="btn" data-rd-tutup>' + IC_BACK + 'Kembali</button>' +
      '<span class="rd-brand">Berita &amp; Pengumuman</span>' +
      '<button type="button" class="icon" data-rd-tutup aria-label="Tutup berita" title="Tutup">' + IC_X + '</button></header>' +
    '<article class="rd-art glass">' +
      '<div class="nw-meta">' + pillJenis(b.jenis) + '<span>' + tglBerita(b.mulai) + '</span>' + (b.sampai ? '<span>· berlaku s.d. ' + tglBerita(b.sampai) + '</span>' : '') + '</div>' +
      '<h1 id="rdJudul">' + esc(b.judul) + '</h1>' +
      (b.isi ? '<div class="rd-isi">' + esc(b.isi) + '</div>' : '') +
      (b.tautan ? '<p class="rd-tautan"><a class="link" href="' + esc(b.tautan) + '" target="_blank" rel="noopener noreferrer">Buka tautan terkait ›</a></p>' : '') +
      (foto ? '<h2 class="eyebrow rd-sub">Foto</h2><div class="rd-foto">' + foto + '</div>' : '') +
      (dok ? '<h2 class="eyebrow rd-sub">Dokumen</h2><ul class="rd-dok">' + dok + '</ul>' : '') +
      '<p class="note" id="rdLampMsg" hidden></p>' +
    '</article>';
  h.setAttribute('aria-labelledby', 'rdJudul');
  h.hidden = false; h.scrollTop = 0;
  document.documentElement.classList.add('reader-open');
  if (!RD.open && !dariUrl){ history.pushState({ berita: b.id }, '', '#berita-' + b.id); RD.pushed = true; }
  else if (RD.pushed) history.replaceState({ berita: b.id }, '', '#berita-' + b.id);
  RD.open = true;
  var btn = h.querySelector('[data-rd-tutup]'); if (btn) btn.focus();
  if (!b.lampiran.length) return;
  SB.urlLampiran(b.lampiran.map(function(l){ return l.path; })).then(function(m){
    [].forEach.call(h.querySelectorAll('[data-lamp]'), function(a){
      var l = b.lampiran[+a.getAttribute('data-lamp')], url = l && m[l.path];
      if (!url) return;
      a.href = url;
      var img = a.querySelector('img'); if (img) img.src = url;
    });
  }).catch(function(e){
    var p = $('rdLampMsg'); if (!p) return;
    p.hidden = false; p.textContent = 'Lampiran tidak bisa dibuka: ' + errMsg(e);
  });
}
function sembunyikanHalaman(){
  if (!RD.open) return;
  RD.open = false; RD.pushed = false;
  var h = $('reader'); h.hidden = true; h.innerHTML = '';
  document.documentElement.classList.remove('reader-open');
  var f = RD.fokus; RD.fokus = null;
  if (f && document.contains(f)) try { f.focus({ preventScroll: true }); } catch (e) {}
}
function tutupHalaman(){
  if (!RD.open) return;
  if (RD.pushed) history.back(); /* popstate di bawah yang menutup halaman */
  else { history.replaceState(null, '', location.pathname + location.search); sembunyikanHalaman(); }
}
window.addEventListener('popstate', function(){ if (RD.open && !HASH.test(location.hash)) sembunyikanHalaman(); });
document.addEventListener('click', function(e){ if (e.target.closest('[data-rd-tutup]')) tutupHalaman(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && RD.open && $('modal').hidden) tutupHalaman(); });

/* tautan langsung (mis. syaria.biz.id/#berita-12): buka setelah aplikasi siap. RLS menentukan boleh tidaknya. */
export function bukaDariUrl(){
  var m = HASH.exec(location.hash); if (!m) return;
  SB.beritaSatu(m[1]).then(function(b){
    if (b){ bukaHalamanBerita(b, null, true); if (RD.tandai) RD.tandai(b); return; }
    history.replaceState(null, '', location.pathname + location.search);
    toast('Berita ini tidak ditemukan, sudah tidak tayang, atau hanya bisa dibaca setelah masuk.', 'info', 'Berita tidak bisa dibuka');
  }).catch(function(){ history.replaceState(null, '', location.pathname + location.search); });
}

/* ================= flayer: gambar berganti otomatis di baris teratas ruang berita =================
   Satu flayer tampil penuh selama durasinya (detik), lalu memudar ke flayer berikutnya dan berputar.
   Bingkai tegak 4:5; gambar tampil utuh (tidak dipotong) dengan latar versi buram gambar yang sama.
   Berhenti sementara saat kursor/fokus di atasnya, saat tab tidak dilihat, atau bila pengguna menekan Jeda.
   Bila perangkat diatur "kurangi animasi", tidak berputar otomatis (tetap bisa digeser manual). */
var IC_KIRI = '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>', IC_KANAN = '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
var IC_JEDA = '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>', IC_PUTAR = '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>';
export function gambarFlayer(b){ return (b.lampiran || []).filter(isFoto)[0] || null; }
export function pisahFlayer(items){
  var f = [], r = [];
  (items || []).forEach(function(b){ (b.bentuk === 'flayer' && gambarFlayer(b) ? f : r).push(b); });
  return { flayer: f, redaksi: r };
}
var KURANGI = false; try { KURANGI = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
export function pasangFlayer(host, items){
  if (!host) return;
  if (host._flayer) host._flayer.henti();
  if (!items.length){ host.innerHTML = ''; return; }
  var n = items.length, banyak = n > 1;
  host.innerHTML = '<div class="fl" role="region" aria-roledescription="carousel" aria-label="Flayer berita">' +
    '<div class="fl-bingkai">' + items.map(function(b, i){
      return '<button type="button" class="fl-s' + (i === 0 ? ' aktif' : '') + '" data-fl="' + i + '" aria-roledescription="slide" aria-label="' + (i + 1) + ' dari ' + n + ': ' + esc(b.judul) + '"' + (i ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
        '<span class="fl-bg"></span><img class="fl-img" alt="' + esc(b.judul) + '"></button>'; }).join('') +
      (banyak ? '<button type="button" class="fl-nav fl-prev" data-fl-ke="-1" aria-label="Flayer sebelumnya">' + IC_KIRI + '</button><button type="button" class="fl-nav fl-next" data-fl-ke="1" aria-label="Flayer berikutnya">' + IC_KANAN + '</button>' : '') +
    '</div>' +
    (banyak ? '<div class="fl-bawah"><div class="fl-titik">' + items.map(function(b, i){ return '<button type="button" data-fl-titik="' + i + '" aria-label="Tampilkan flayer ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '></button>'; }).join('') + '</div>' +
      '<button type="button" class="fl-jeda" aria-label="Jeda pergantian flayer" aria-pressed="false">' + IC_JEDA + '</button></div>' : '') +
    '</div>';
  var root = host.firstChild, slides = root.querySelectorAll('.fl-s'), titik = root.querySelectorAll('[data-fl-titik]'), jedaBtn = root.querySelector('.fl-jeda');
  var st = { i: 0, t: null, url: {}, tahan: 0, jeda: KURANGI, aktif: true };
  function pasangUrl(){
    return SB.urlLampiran(items.map(function(b){ return gambarFlayer(b).path; })).then(function(m){
      if (!st.aktif) return;
      items.forEach(function(b, i){
        var u = m[gambarFlayer(b).path]; if (!u) return;
        st.url[i] = u; slides[i].querySelector('.fl-img').src = u; slides[i].querySelector('.fl-bg').style.backgroundImage = 'url("' + u + '")';
      });
    }).catch(function(){});
  }
  function jadwal(){
    clearTimeout(st.t); st.t = null;
    if (!banyak || st.jeda || st.tahan || document.hidden || !st.aktif) return;
    st.t = setTimeout(function(){ if (!document.contains(root)){ henti(); return; } ke(st.i + 1); }, (items[st.i].durasi || 8) * 1000);
  }
  function ke(j){
    var lama = st.i; st.i = (j + n) % n;
    if (lama !== st.i){
      slides[lama].classList.remove('aktif'); slides[lama].setAttribute('aria-hidden', 'true'); slides[lama].tabIndex = -1;
      slides[st.i].classList.add('aktif'); slides[st.i].removeAttribute('aria-hidden'); slides[st.i].tabIndex = 0;
      [].forEach.call(titik, function(t, k){ if (k === st.i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    }
    jadwal();
  }
  function henti(){ st.aktif = false; clearTimeout(st.t); clearInterval(st.segar); document.removeEventListener('visibilitychange', jadwal); host._flayer = null; }
  host._flayer = { henti: henti };
  [].forEach.call(slides, function(s, i){ s.onclick = function(){
    var b = items[i];
    if (b.isi || b.tautan) bukaHalamanBerita(b, s);
    else if (st.url[i]) openModal('<div class="modal-hd"><div><span class="eyebrow">Flayer</span><h3>' + esc(b.judul) + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
      '<img class="fl-besar" src="' + esc(st.url[i]) + '" alt="' + esc(b.judul) + '">');
  }; });
  [].forEach.call(root.querySelectorAll('[data-fl-ke]'), function(b){ b.onclick = function(){ ke(st.i + (+b.getAttribute('data-fl-ke'))); }; });
  [].forEach.call(titik, function(b){ b.onclick = function(){ ke(+b.getAttribute('data-fl-titik')); }; });
  if (jedaBtn){
    var tandaJeda = function(){ jedaBtn.innerHTML = st.jeda ? IC_PUTAR : IC_JEDA; jedaBtn.setAttribute('aria-pressed', st.jeda ? 'true' : 'false');
      jedaBtn.setAttribute('aria-label', st.jeda ? 'Putar pergantian flayer' : 'Jeda pergantian flayer'); jedaBtn.title = jedaBtn.getAttribute('aria-label'); };
    jedaBtn.onclick = function(){ st.jeda = !st.jeda; tandaJeda(); jadwal(); };
    tandaJeda();
  }
  var bingkai = root.querySelector('.fl-bingkai');
  bingkai.addEventListener('mouseenter', function(){ st.tahan++; jadwal(); });
  bingkai.addEventListener('mouseleave', function(){ st.tahan = Math.max(0, st.tahan - 1); jadwal(); });
  root.addEventListener('focusin', function(){ st.tahan++; jadwal(); });
  root.addEventListener('focusout', function(){ st.tahan = Math.max(0, st.tahan - 1); jadwal(); });
  document.addEventListener('visibilitychange', jadwal);
  /* tautan gambar dari Storage privat berlaku 1 jam: perbarui berkala selama flayer tampil */
  st.segar = setInterval(function(){ if (!document.contains(root)){ henti(); return; } pasangUrl(); }, 45 * 60 * 1000);
  pasangUrl().then(jadwal);
}

/* ---------- jendela daftar berita (lonceng & "Lihat semua") ---------- */
function bukaDaftar(items, judul, opsi){
  opsi = opsi || {};
  var adaBaru = opsi.tandaiBaru && items.some(function(b){ return !sudahDibaca(b.id); });
  openModal('<div class="modal-hd"><div><span class="eyebrow">Berita &amp; Pengumuman</span><h3>' + esc(judul) + '</h3></div>' +
    '<button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    (opsi.usulan && opsi.usulan.length ? '<div class="nw-usulan"><span class="eyebrow">Usulan revisi anggaran</span><div class="nw-list">' + opsi.usulan.map(function(x){
        return '<button type="button" class="nw-item baru" data-usulan="' + x.id + '"' + (x.kunci ? ' data-kunci="' + esc(x.kunci) + '"' : '') + '><span class="nw-meta"><span class="pill st-info"><i></i>Usulan revisi</span>' +
          (x.telaah ? '<span class="pill st-warn"><i></i>Perlu telaah</span>' : '') + '<span class="nw-dot" aria-label="Baru"></span></span><b class="nw-judul">' + esc(x.teks) + '</b><span class="nw-ring">' + esc(x.judul) + '</span></button>'; }).join('') + '</div></div>' : '') +
    (items.length ? '<div class="nw-list">' + items.map(function(b){ return itemHtml(b, opsi.tandaiBaru && !sudahDibaca(b.id)); }).join('') + '</div>'
                  : (opsi.usulan && opsi.usulan.length ? '' : '<div class="empty">Belum ada berita.</div>')) +
    (adaBaru ? '<div class="tools nw-ft"><button type="button" class="btn" id="nwSemuaBaca">Tandai semua sudah dibaca</button></div>' : ''));
  [].forEach.call($('modal').querySelectorAll('[data-usulan]'), function(el){ el.onclick = function(){
    var k = el.getAttribute('data-kunci'); if (k){ var p = k.split(':'); tandaiUsulanDilihat(+p[0], p[1]); }
    closeModal(); document.dispatchEvent(new CustomEvent('buka-usulan', { detail: +el.getAttribute('data-usulan') }));
  }; });
  bindItems($('modal'), items, function(b){
    if (opsi.tandaiBaru){ tandaiDibaca([b.id]); if (opsi.onBerubah) opsi.onBerubah(); }
    bukaHalamanBerita(b, opsi.asal);
  });
  if ($('nwSemuaBaca')) $('nwSemuaBaca').onclick = function(){
    tandaiDibaca(items.map(function(b){ return b.id; })); if (opsi.onBerubah) opsi.onBerubah(); bukaDaftar(items, judul, opsi);
  };
}

/* ================= beranda publik: 6 berita publik terbaru ================= */
var BERANDA_BATAS = 6;
export function muatBeritaBeranda(onAda){
  Promise.all([SB.beritaTayang(true, BERANDA_BATAS, 'redaksi'), SB.beritaTayang(true, null, 'flayer')]).then(function(x){
    var r = x[0], fl = pisahFlayer(x[1].items).flayer;
    var host = $('lpBerita'), sec = $('lpBeritaSec');
    if (!host || !sec || (!r.items.length && !fl.length)) return;
    host.innerHTML = (fl.length ? '<div class="lp-fl" id="lpFlayer"></div>' : '') +
      (r.items.length ? '<div class="lp-nw">' + r.items.map(function(b){ return itemHtml(b, false); }).join('') + '</div>' : '') +
      (r.total > r.items.length ? '<div class="tools nw-ft lp-nw-ft"><button type="button" class="btn" id="lpSemua">Lihat semua (' + r.total + ')</button></div>' : '');
    sec.hidden = false;
    if (fl.length) pasangFlayer($('lpFlayer'), fl);
    bindItems(host, r.items, function(b, el){ bukaHalamanBerita(b, el); });
    if ($('lpSemua')) $('lpSemua').onclick = function(){
      var t = this; t.disabled = true;
      SB.beritaTayang(true, null, 'redaksi').then(function(s){ t.disabled = false; bukaDaftar(s.items, 'Semua berita', { asal: t }); })
        .catch(function(e){ t.disabled = false; toast(errMsg(e), 'err', 'Berita gagal dimuat'); });
    };
    if (onAda) onAda();
  }).catch(function(){ /* berita gagal dimuat: beranda tetap tampil tanpa bagian berita */ });
}

/* ================= dasbor: lonceng berisi semua berita yang tayang ================= */
var DASBOR = { items: [], dimuat: false };
export function muatBeritaDasbor(){
  RD.tandai = function(b){ tandaiDibaca([b.id]); tampilBel(); };
  return Promise.all([
    SB.beritaTayang(false).then(function(r){ DASBOR.items = r.items; }).catch(function(){ DASBOR.items = []; }),
    muatNotifUsulan()
  ]).then(function(){ DASBOR.dimuat = true; tampilBel(); isiPanelBerita(); });
}

/* ================= notifikasi usulan revisi (lonceng & angka di menu) =================
   Admin perencanaan: setiap usulan berstatus Diajukan (hilang setelah diproses).
   Pengusul: perubahan status usulannya sendiri (hilang setelah dibuka; disimpan per perangkat). */
var USULAN = { list: [] }, K_USULAN = 'dasbor-usulan-dilihat';
var TEKS_ST = { dikembalikan: 'dikembalikan untuk diperbaiki', disetujui: 'disetujui', ditolak: 'ditolak', diinput_sakti: 'sudah diinput ke SAKTI', selesai: 'selesai' };
export function muatNotifUsulan(){
  return SB.usulanDaftar().then(function(l){ USULAN.list = l; }).catch(function(){ USULAN.list = []; })
    .then(function(){ tampilBel(); document.dispatchEvent(new Event('notif-usulan')); });
}
function notifUsulan(){
  var s = sess(); if (!s || !s.role) return [];
  var antre = punyaSalah(['periksa', 'setujui']) ? USULAN.list.filter(function(u){ return u.status === 'diajukan'; }).map(function(u){
    return { id: u.id, teks: 'Usulan #' + u.id + ' dari ' + (u.lintas_unit ? 'lintas unit' : (u.unit || '—')) + ' menunggu persetujuan', judul: u.judul, telaah: u.perlu_telaah, kunci: null }; }) : [];
  if (s.role === 'SUPERADMIN') return antre;
  var dilihat = ambilSet(K_USULAN);
  return antre.concat(USULAN.list.filter(function(u){ return u.dibuat_email === s.email && TEKS_ST[u.status] && dilihat.indexOf(u.id + ':' + u.status) < 0; }).map(function(u){
    return { id: u.id, teks: 'Usulan #' + u.id + ' ' + TEKS_ST[u.status], judul: u.judul, telaah: false, kunci: u.id + ':' + u.status }; }));
}
export function tandaiUsulanDilihat(id, status){
  var a = ambilSet(K_USULAN), k = id + ':' + status;
  if (a.indexOf(k) < 0){ a.push(k); simpanSet(K_USULAN, a); tampilBel(); document.dispatchEvent(new Event('notif-usulan')); }
}
/* angka di menu: Admin perencanaan = menunggu persetujuan; pengusul = usulannya yang dikembalikan */
export function hitungMenuUsulan(){
  var s = sess(); if (!s || !s.role) return {};
  var m = {};
  if (punyaSalah(['periksa', 'setujui'])) m['kelola-usulan'] = USULAN.list.filter(function(u){ return u.status === 'diajukan'; }).length;
  if (s.role === 'SUPERADMIN') return m;
  m['anggaran-usulan'] = USULAN.list.filter(function(u){ return u.dibuat_email === s.email && u.status === 'dikembalikan'; }).length;
  return m;
}
function tampilBel(){
  var b = $('btnBerita'); if (!b) return;
  var nu = notifUsulan();
  var n = DASBOR.items.filter(function(x){ return !sudahDibaca(x.id); }).length + nu.length;
  b.hidden = !DASBOR.items.length && !nu.length;
  var bd = b.querySelector('.nw-badge'); bd.hidden = !n; bd.textContent = n > 9 ? '9+' : String(n);
  var lbl = 'Berita, pengumuman & usulan revisi' + (n ? ' (' + n + ' baru)' : '');
  b.setAttribute('aria-label', lbl); b.title = lbl;
}
/* panel Berita & Pengumuman di sisi kanan Ringkasan: 5 berita teratas (yang disematkan lebih dulu) */
var PANEL_BATAS = 5;
export function isiPanelBerita(){
  var h = $('rkBerita'); if (!h || !DASBOR.dimuat) return;
  var pisah = pisahFlayer(DASBOR.items), list = pisah.redaksi.slice(0, PANEL_BATAS);
  if (!list.length && !pisah.flayer.length){ h.innerHTML = '<div class="empty rk-kosong">Belum ada berita atau pengumuman.</div>'; return; }
  /* flayer yang sama tetap berjalan (tidak kembali ke gambar pertama) saat daftar berita digambar ulang */
  var kunci = pisah.flayer.map(function(b){ return b.id; }).join(','), lama = $('rkFlayer');
  var pakaiLama = lama && lama.getAttribute('data-k') === kunci ? lama : null;
  h.innerHTML = (pisah.flayer.length ? '<div class="rk-fl" id="rkFlayer" data-k="' + kunci + '"></div>' : '') +
    (list.length ? '<div class="nw-list">' + list.map(function(b){ return itemHtml(b, !sudahDibaca(b.id)); }).join('') + '</div>' : '') +
    (pisah.redaksi.length > PANEL_BATAS ? '<div class="tools nw-ft"><button type="button" class="btn" id="rkSemua">Lihat semua (' + DASBOR.items.length + ')</button></div>' : '');
  if (pakaiLama) $('rkFlayer').replaceWith(pakaiLama);
  else if (pisah.flayer.length) pasangFlayer($('rkFlayer'), pisah.flayer);
  bindItems(h, list, function(b, el){
    tandaiDibaca([b.id]); tampilBel();
    el.classList.remove('baru'); var d = el.querySelector('.nw-dot'); if (d) d.remove();
    bukaHalamanBerita(b, el);
  });
  if ($('rkSemua')) $('rkSemua').onclick = bukaBeritaDasbor;
}
export function bukaBeritaDasbor(){ bukaDaftar(DASBOR.items, 'Berita & pengumuman', { tandaiBaru: true, usulan: notifUsulan(), onBerubah: function(){ tampilBel(); isiPanelBerita(); }, asal: $('btnBerita') }); }
