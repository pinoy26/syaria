/* js/berita.js — Berita & Pengumuman: tampilan bersama (halaman login, lonceng dasbor, halaman baca berita) */
import { $, esc, tgl, toast, errMsg } from './utils.js?v=202611141458';
import { SB } from './api.js?v=202611141458';
import { openModal, closeModal } from './ui-components.js?v=202611141458';

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
    '<span class="nw-meta">' + pillJenis(b.jenis) + (b.disematkan ? '<span class="nw-tag">Disematkan</span>' : '') +
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

/* ---------- jendela daftar berita (lonceng & "Lihat semua") ---------- */
function bukaDaftar(items, judul, opsi){
  opsi = opsi || {};
  var adaBaru = opsi.tandaiBaru && items.some(function(b){ return !sudahDibaca(b.id); });
  openModal('<div class="modal-hd"><div><span class="eyebrow">Berita &amp; Pengumuman</span><h3>' + esc(judul) + '</h3></div>' +
    '<button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    (items.length ? '<div class="nw-list">' + items.map(function(b){ return itemHtml(b, opsi.tandaiBaru && !sudahDibaca(b.id)); }).join('') + '</div>'
                  : '<div class="empty">Belum ada berita.</div>') +
    (adaBaru ? '<div class="tools nw-ft"><button type="button" class="btn" id="nwSemuaBaca">Tandai semua sudah dibaca</button></div>' : ''));
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
  SB.beritaTayang(true, BERANDA_BATAS).then(function(r){
    var host = $('lpBerita'), sec = $('lpBeritaSec');
    if (!host || !sec || !r.items.length) return;
    host.innerHTML = '<div class="lp-nw">' + r.items.map(function(b){ return itemHtml(b, false); }).join('') + '</div>' +
      (r.total > r.items.length ? '<div class="tools nw-ft lp-nw-ft"><button type="button" class="btn" id="lpSemua">Lihat semua (' + r.total + ')</button></div>' : '');
    sec.hidden = false;
    bindItems(host, r.items, function(b, el){ bukaHalamanBerita(b, el); });
    if ($('lpSemua')) $('lpSemua').onclick = function(){
      var t = this; t.disabled = true;
      SB.beritaTayang(true).then(function(s){ t.disabled = false; bukaDaftar(s.items, 'Semua berita', { asal: t }); })
        .catch(function(e){ t.disabled = false; toast(errMsg(e), 'err', 'Berita gagal dimuat'); });
    };
    if (onAda) onAda();
  }).catch(function(){ /* berita gagal dimuat: beranda tetap tampil tanpa bagian berita */ });
}

/* ================= dasbor: lonceng berisi semua berita yang tayang ================= */
var DASBOR = { items: [], dimuat: false };
export function muatBeritaDasbor(){
  RD.tandai = function(b){ tandaiDibaca([b.id]); tampilBel(); };
  return SB.beritaTayang(false).then(function(r){ DASBOR.items = r.items; })
    .catch(function(){ DASBOR.items = []; })
    .then(function(){ DASBOR.dimuat = true; tampilBel(); isiPanelBerita(); });
}
function tampilBel(){
  var b = $('btnBerita'); if (!b) return;
  var n = DASBOR.items.filter(function(x){ return !sudahDibaca(x.id); }).length;
  b.hidden = !DASBOR.items.length;
  var bd = b.querySelector('.nw-badge'); bd.hidden = !n; bd.textContent = n > 9 ? '9+' : String(n);
  var lbl = 'Berita & pengumuman' + (n ? ' (' + n + ' belum dibaca)' : '');
  b.setAttribute('aria-label', lbl); b.title = lbl;
}
/* panel Berita & Pengumuman di sisi kanan Ringkasan: 5 berita teratas (yang disematkan lebih dulu) */
var PANEL_BATAS = 5;
export function isiPanelBerita(){
  var h = $('rkBerita'); if (!h || !DASBOR.dimuat) return;
  var list = DASBOR.items.slice(0, PANEL_BATAS);
  if (!list.length){ h.innerHTML = '<div class="empty rk-kosong">Belum ada berita atau pengumuman.</div>'; return; }
  h.innerHTML = '<div class="nw-list">' + list.map(function(b){ return itemHtml(b, !sudahDibaca(b.id)); }).join('') + '</div>' +
    (DASBOR.items.length > PANEL_BATAS ? '<div class="tools nw-ft"><button type="button" class="btn" id="rkSemua">Lihat semua (' + DASBOR.items.length + ')</button></div>' : '');
  bindItems(h, list, function(b, el){
    tandaiDibaca([b.id]); tampilBel();
    el.classList.remove('baru'); var d = el.querySelector('.nw-dot'); if (d) d.remove();
    bukaHalamanBerita(b, el);
  });
  if ($('rkSemua')) $('rkSemua').onclick = bukaBeritaDasbor;
}
export function bukaBeritaDasbor(){ bukaDaftar(DASBOR.items, 'Berita & pengumuman', { tandaiBaru: true, onBerubah: function(){ tampilBel(); isiPanelBerita(); }, asal: $('btnBerita') }); }
