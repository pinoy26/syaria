/* js/berita.js — Berita & Pengumuman: tampilan bersama (halaman login, lonceng & banner dasbor, pratinjau admin) */
import { $, esc, tgl, toast, errMsg } from './utils.js';
import { S } from './state.js';
import { SB } from './api.js';
import { openModal } from './ui-components.js';

export var JENIS = { info: ['st-info', 'Info'], penting: ['st-crit', 'Penting'], tenggat: ['st-warn', 'Tenggat'] };
export var IC_BERITA = '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>';
var IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
var IC_BACK = '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>';
var K_BACA = 'dasbor-berita-dibaca', K_TUTUP = 'dasbor-berita-tutup';

/* ---------- format ---------- */
function dua(n){ return ('0' + n).slice(-2); }
/* ISO → 'YYYY-MM-DD' menurut zona waktu perangkat */
export function tglLokal(iso){ var d = new Date(iso); return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()); }
export function tglBerita(iso){ return iso ? tgl(tglLokal(iso)) : ''; }
export function ukuran(b){ return b >= 1048576 ? (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
export function isFoto(l){ return /^image\//.test(l.mime); }
export function pillJenis(j){ var x = JENIS[j] || JENIS.info; return '<span class="pill ' + x[0] + '"><i></i>' + x[1] + '</span>'; }
function ringkas(s, n){
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}
function cari(items, id){ return items.filter(function(b){ return String(b.id) === String(id); })[0]; }

/* ---------- sudah dibaca / banner disembunyikan (disimpan per perangkat) ---------- */
function ambilSet(k){ try { var a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function simpanSet(k, a){ try { localStorage.setItem(k, JSON.stringify(a.slice(-300))); } catch (e) {} }
function sudahDibaca(id){ return ambilSet(K_BACA).indexOf(id) >= 0; }
function tandaiDibaca(ids){ var a = ambilSet(K_BACA); ids.forEach(function(id){ if (a.indexOf(id) < 0) a.push(id); }); simpanSet(K_BACA, a); }

/* ---------- potongan tampilan ---------- */
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
    el.onclick = function(){ var b = cari(items, el.getAttribute('data-berita')); if (b) onOpen(b); };
  });
}

/* ---------- jendela isi berita ---------- */
export function bukaBerita(b, kembali){
  var foto = '', dok = '';
  b.lampiran.forEach(function(l, i){
    if (isFoto(l)) foto += '<a class="nw-ph" data-lamp="' + i + '" target="_blank" rel="noopener"><img alt="' + esc(l.nama) + '"></a>';
    else dok += '<li><a class="link" data-lamp="' + i + '" target="_blank" rel="noopener">' + esc(l.nama) + '</a> <span class="note">PDF · ' + ukuran(l.ukuran) + '</span></li>';
  });
  openModal(
    '<div class="modal-hd"><div>' +
      (kembali ? '<button type="button" class="btn nw-back" id="nwBack">' + IC_BACK + 'Semua berita</button>' : '') +
      '<div class="nw-meta">' + pillJenis(b.jenis) + '<span>' + tglBerita(b.mulai) + '</span>' + (b.sampai ? '<span>· berlaku s.d. ' + tglBerita(b.sampai) + '</span>' : '') + '</div>' +
      '<h3>' + esc(b.judul) + '</h3></div>' +
      '<button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    (b.isi ? '<div class="nw-isi">' + esc(b.isi) + '</div>' : '') +
    (b.tautan ? '<p class="nw-tautan"><a class="link" href="' + esc(b.tautan) + '" target="_blank" rel="noopener noreferrer">Buka tautan terkait ›</a></p>' : '') +
    (foto ? '<div class="nw-foto">' + foto + '</div>' : '') +
    (dok ? '<ul class="nw-dok">' + dok + '</ul>' : '') +
    '<p class="note" id="nwLampMsg" hidden></p>');
  if (kembali) $('nwBack').onclick = kembali;
  if (!b.lampiran.length) return;
  SB.urlLampiran(b.lampiran.map(function(l){ return l.path; })).then(function(m){
    [].forEach.call($('modal').querySelectorAll('[data-lamp]'), function(a){
      var l = b.lampiran[+a.getAttribute('data-lamp')], url = l && m[l.path];
      if (!url) return;
      a.href = url;
      var img = a.querySelector('img'); if (img) img.src = url;
    });
  }).catch(function(e){
    var p = $('nwLampMsg'); if (!p) return;
    p.hidden = false; p.textContent = 'Lampiran tidak bisa dibuka: ' + errMsg(e);
  });
}

/* ---------- jendela daftar berita ---------- */
function bukaDaftar(items, judul, opsi){
  opsi = opsi || {};
  var tampil = function(){
    var adaBaru = opsi.tandaiBaru && items.some(function(b){ return !sudahDibaca(b.id); });
    openModal('<div class="modal-hd"><div><span class="eyebrow">Berita &amp; Pengumuman</span><h3>' + esc(judul) + '</h3></div>' +
      '<button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
      (items.length ? '<div class="nw-list">' + items.map(function(b){ return itemHtml(b, opsi.tandaiBaru && !sudahDibaca(b.id)); }).join('') + '</div>'
                    : '<div class="empty">Belum ada berita.</div>') +
      (adaBaru ? '<div class="tools nw-ft"><button type="button" class="btn" id="nwSemuaBaca">Tandai semua sudah dibaca</button></div>' : ''));
    bindItems($('modal'), items, function(b){
      if (opsi.tandaiBaru){ tandaiDibaca([b.id]); if (opsi.onBerubah) opsi.onBerubah(); }
      bukaBerita(b, tampil);
    });
    if ($('nwSemuaBaca')) $('nwSemuaBaca').onclick = function(){
      tandaiDibaca(items.map(function(b){ return b.id; })); if (opsi.onBerubah) opsi.onBerubah(); tampil();
    };
  };
  tampil();
}

/* ================= halaman login: 5 berita publik terbaru ================= */
var LOGIN_BATAS = 5;
export function muatBeritaLogin(){
  SB.beritaTayang(true, LOGIN_BATAS).then(function(r){
    var host = $('gateNews');
    if (!host || !r.items.length) return;
    host.innerHTML = '<div class="gn-hd"><span class="eyebrow">Berita &amp; Pengumuman</span><h2 id="gnJudul">Informasi terbaru</h2></div>' +
      '<div class="nw-list">' + r.items.map(function(b){ return itemHtml(b, false); }).join('') + '</div>' +
      (r.total > r.items.length ? '<div class="tools nw-ft"><button type="button" class="btn" id="gnSemua">Lihat semua (' + r.total + ')</button></div>' : '');
    host.hidden = false;
    $('gate').classList.add('has-news');
    bindItems(host, r.items, function(b){ bukaBerita(b); });
    if ($('gnSemua')) $('gnSemua').onclick = function(){
      var t = this; t.disabled = true;
      SB.beritaTayang(true).then(function(s){ t.disabled = false; bukaDaftar(s.items, 'Semua berita'); })
        .catch(function(e){ t.disabled = false; toast('Berita gagal dimuat: ' + errMsg(e), 'err'); });
    };
  }).catch(function(){ /* berita gagal dimuat: halaman login tetap berfungsi seperti biasa */ });
}

/* ================= dasbor: lonceng (semua berita tayang) & banner (berita disematkan, hanya di Ringkasan) ================= */
var DASBOR = { items: [] };
export function muatBeritaDasbor(){
  return SB.beritaTayang(false).then(function(r){ DASBOR.items = r.items; })
    .catch(function(){ DASBOR.items = []; })
    .then(function(){ tampilBel(); tampilBanner(); });
}
function tampilBel(){
  var b = $('btnBerita'); if (!b) return;
  var n = DASBOR.items.filter(function(x){ return !sudahDibaca(x.id); }).length;
  b.hidden = !DASBOR.items.length;
  var bd = b.querySelector('.nw-badge'); bd.hidden = !n; bd.textContent = n > 9 ? '9+' : String(n);
  var lbl = 'Berita & pengumuman' + (n ? ' (' + n + ' belum dibaca)' : '');
  b.setAttribute('aria-label', lbl); b.title = lbl;
}
export function bukaBeritaDasbor(){ bukaDaftar(DASBOR.items, 'Berita & pengumuman', { tandaiBaru: true, onBerubah: tampilBel }); }
export function tampilBanner(){
  var h = $('beritaBanner'); if (!h) return;
  var tutup = ambilSet(K_TUTUP);
  var list = S.page === 'ringkasan' ? DASBOR.items.filter(function(b){ return b.disematkan && tutup.indexOf(b.id) < 0; }).slice(0, 3) : [];
  h.hidden = !list.length;
  h.innerHTML = list.map(function(b){
    var r = ringkas(b.isi, 140);
    return '<div class="nw-banner nw-' + esc(b.jenis) + '">' + pillJenis(b.jenis) +
      '<button type="button" class="nw-banner-txt" data-berita="' + b.id + '"><b>' + esc(b.judul) + '</b>' + (r ? '<span>' + esc(r) + '</span>' : '') + '</button>' +
      '<button type="button" class="icon" data-tutup-berita="' + b.id + '" aria-label="Sembunyikan pengumuman ini" title="Sembunyikan">' + IC_X + '</button></div>';
  }).join('');
  bindItems(h, list, function(b){ tandaiDibaca([b.id]); tampilBel(); bukaBerita(b); });
  [].forEach.call(h.querySelectorAll('[data-tutup-berita]'), function(el){
    el.onclick = function(){ var a = ambilSet(K_TUTUP); a.push(Number(el.getAttribute('data-tutup-berita'))); simpanSet(K_TUTUP, a); tampilBanner(); };
  });
}
