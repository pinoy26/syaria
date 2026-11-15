/* js/pages/redesain.js — Belanja Redesain: edit salinan kerja usulan revisi (Monev Anggaran tahap 9)
   Susunan seperti RUH → Belanja Redesain di SAKTI: Program → Kegiatan → KRO → RO → Komponen → Sub komponen
   → Akun → Header 1 (">") → Header 2 (">>") → Detail. Pilih baris, lalu pakai tombol di bilah alat:
   Rekam Header 1 / Rekam Header 2 / Rekam Detail / Ubah / Hapus. Perubahan disimpan ke database lewat
   simpan_salinan (struktur & item terblokir dijaga di server; aturan revisi diperiksa saat diajukan). */
import { $, esc, rp, tgl, labelVersi, toast, tanya, errMsg } from '../utils.js?v=202611151008';
import { S, sess, isSuperAdmin } from '../state.js?v=202611151008';
import { card, openModal, closeModal } from '../ui-components.js?v=202611151008';
import { SB } from '../api.js?v=202611151008';
import { refresh, keepScroll } from '../nav.js?v=202611151008';
import { lupakanUsulan } from './usulan.js?v=202611151008';

var BISA_EDIT = ['draf', 'dikembalikan'], AKTIF = ['draf', 'diajukan', 'dikembalikan', 'disetujui'];
var R = { daftar: null, mode: null, u: null, rows: null, basis: null, sel: null, kotor: false, memuat: false, err: null, simpan: false };
var ST = { draf: 'Draf', diajukan: 'Diajukan', dikembalikan: 'Dikembalikan', disetujui: 'Disetujui' };
var IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

window.addEventListener('beforeunload', function(e){ if (R.kotor){ e.preventDefault(); e.returnValue = ''; } });
/* dari detail usulan: buka langsung mode edit usulan itu */
document.addEventListener('edit-redesain', function(e){ R.mode = e.detail; R.daftar = null; R.u = null; R.rows = null; S.page = 'anggaran-rkk'; S.open = {}; refresh(); window.scrollTo(0, 0); });
export function lupakanRedesain(){ if (!R.kotor){ R.daftar = null; R.u = null; R.rows = null; } }

/* ---------- angka ---------- */
function vol(v){ return v == null ? '' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 4 }); }
function tanda(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + rp(Math.abs(n)); }
/* "1.398.101.000" → 1398101000 ; "0,5" → 0.5 ; "12" → 12 */
function angka(t){
  t = String(t == null ? '' : t).trim().replace(/\s/g, ''); if (t === '') return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  var n = Number(t); return isFinite(n) ? n : NaN;
}
function jumlahDari(r, b){ return b && r.volume === b.volume && r.harga === b.harga ? b.jumlah : (r.volume == null || r.harga == null ? 0 : Math.round(r.volume * r.harga)); }

/* ---------- mode: lihat DIPA atau edit/lihat usulan histori ---------- */
function usulanSaya(){
  var me = sess().email;
  return (R.daftar || []).filter(function(u){ return u.histori && AKTIF.indexOf(u.status) >= 0 && (!isSuperAdmin() || u.dibuat_email === me); });
}
function bolehUbah(u){ return !!u && BISA_EDIT.indexOf(u.status) >= 0 && (u.dibuat_email === sess().email || isSuperAdmin()); }
function muatDaftar(){
  if (R.memuat) return; R.memuat = true; R.err = null;
  SB.usulanDaftar().then(function(l){
    R.daftar = l; R.memuat = false;
    var ada = usulanSaya();
    if (R.mode == null || (R.mode !== 'dipa' && !ada.some(function(u){ return u.id === R.mode; }))){
      var ed = ada.filter(bolehUbah)[0]; R.mode = ed ? ed.id : 'dipa';
    }
    if (S.page === 'anggaran-rkk') refresh();
  }).catch(function(e){ R.memuat = false; R.daftar = []; R.mode = 'dipa'; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
function muatSalinan(u){
  if (R.memuat) return; R.memuat = true; R.err = null;
  Promise.all([SB.salinan(u.id), SB.anggaranItem(u.versi_id)]).then(function(r){
    R.u = u; R.rows = r[0]; R.sel = null; R.kotor = false;
    R.basis = {}; r[1].forEach(function(b){ if (b.kategori === u.kategori && (b.unit || '') === (u.unit || '')) R.basis[b.id] = b; });
    R.memuat = false; if (S.page === 'anggaran-rkk') refresh();
  }).catch(function(e){ R.memuat = false; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
/* dipanggil renderAnggaranRKK: null = tampilkan DIPA seperti biasa (dengan bilah mode bila ada usulan) */
export function barMode(){
  if (!R.daftar){ muatDaftar(); return ''; }
  var ada = usulanSaya(); if (!ada.length) return '';
  return '<div class="seg-row noprint"><span class="note">Tampilan</span><div class="seg" role="group" aria-label="Tampilan Belanja Redesain">' +
    '<button type="button" data-rd-mode="dipa" aria-pressed="' + (R.mode === 'dipa') + '">DIPA (lihat)</button>' +
    ada.map(function(u){ return '<button type="button" data-rd-mode="' + u.id + '" aria-pressed="' + (R.mode === u.id) + '">' + (bolehUbah(u) ? 'Edit: ' : '') + esc(u.judul + (u.unit ? ' · ' + u.unit : '')) + (bolehUbah(u) ? '' : ' (' + (ST[u.status] || u.status) + ')') + '</button>'; }).join('') +
    '</div></div>';
}
export function modeEdit(){ if (!R.daftar){ muatDaftar(); return false; } return R.mode != null && R.mode !== 'dipa'; }

/* ---------- susunan baris (seperti SAKTI) ---------- */
var TK = [
  { t: 'prog', k: function(r){ return r.prog; }, kode: function(r){ return r.prog; }, n: function(r){ return r.prog_n; } },
  { t: 'keg', k: function(r){ return r.keg; }, kode: function(r){ return r.keg; }, n: function(r){ return r.keg_n; } },
  { t: 'kro', k: function(r){ return r.kro; }, kode: function(r){ return r.keg + '.' + r.kro; }, n: function(r){ return r.kro_n; } },
  { t: 'ro', k: function(r){ return r.ro; }, kode: function(r){ return r.keg + '.' + r.ro; }, n: function(r){ return r.ro_n; } },
  { t: 'komp', k: function(r){ return r.komp; }, kode: function(r){ return r.komp; }, n: function(r){ return r.komp_n; } },
  { t: 'sub', k: function(r){ return r.sub; }, kode: function(r){ var p = String(r.sub || '').split('.'); return p[p.length - 1]; }, n: function(r){ return r.sub_n; } },
  { t: 'akun', k: function(r){ return r.akun; }, kode: function(r){ return r.akun; }, n: function(r){ return r.akun_n; } },
  { t: 'h1', k: function(r){ return r.judul; }, kode: function(){ return ''; }, n: function(r){ return r.judul; } },
  { t: 'h2', k: function(r){ return r.judul2; }, kode: function(){ return ''; }, n: function(r){ return r.judul2; } }
];
function urut(){ R.rows.sort(function(a, b){ return a.urutan - b.urutan; }); }
/* kunci jalur tiap tingkat untuk satu baris */
function jalur(r){ var p = [], acc = ''; TK.forEach(function(L){ acc += '¦' + (L.k(r) || ''); p.push(acc); }); return p; }
function susun(){
  urut();
  var tot = {}, baris = [], prev = [];
  R.rows.forEach(function(r){ jalur(r).forEach(function(k){ tot[k] = (tot[k] || 0) + r.jumlah; }); });
  R.rows.forEach(function(r, i){
    var p = jalur(r), beda = false;
    TK.forEach(function(L, d){
      if (!beda && p[d] === prev[d]) return;
      beda = true;
      if ((L.t === 'h1' || L.t === 'h2') && !L.k(r)) return;
      baris.push({ jenis: L.t, d: d, key: p[d], r: r, kode: L.kode(r), n: L.n(r), j: tot[p[d]] });
    });
    baris.push({ jenis: 'item', d: 9, key: 'i' + i, r: r, idx: i });
    prev = p;
  });
  return baris;
}
function statusItem(r){
  if (r.anggaran_id == null) return 'baru';
  var b = R.basis[r.anggaran_id]; if (!b) return '';
  return (r.uraian !== b.uraian || r.volume !== b.volume || r.harga !== b.harga || r.satuan !== b.satuan || r.judul !== b.judul || r.judul2 !== b.judul2) ? 'ubah' : '';
}
function dihapus(){ var ada = {}; R.rows.forEach(function(r){ if (r.anggaran_id != null) ada[r.anggaran_id] = 1; }); return Object.keys(R.basis).filter(function(id){ return !ada[id]; }).map(function(id){ return R.basis[id]; }); }
function kunci51(r){ return sess().role === 'UNIT' && /^51/.test(r.akun); }

/* ---------- halaman ---------- */
export function renderRedesain(pilihVersi){
  var u = (R.daftar || []).filter(function(x){ return x.id === R.mode; })[0];
  if (!u){ R.mode = 'dipa'; return null; }
  if (R.err) return '<div class="page-sec grid">' + card('rd', 'Belanja Redesain', '', barMode() + '<p class="note">' + esc(R.err) + '</p>', '') + '</div>' + ikat();
  if (!R.rows || !R.u || R.u.id !== u.id){ muatSalinan(u); return '<div class="loading">Memuat ' + esc(u.judul) + '…</div>'; }
  var ubah = bolehUbah(u), baris = susun(), pagu = R.rows.reduce(function(a, r){ return a + r.jumlah; }, 0), sel = pilihan(baris);
  var selisih = pagu - u.pagu_awal, hapus = dihapus();
  var ring = '<div class="rd-ring"><div><span class="note">Pagu usulan</span><b>Rp ' + rp(pagu) + '</b></div><div><span class="note">Pagu DIPA unit</span><b>Rp ' + rp(u.pagu_awal) + '</b></div>' +
    '<div><span class="note">Selisih</span><b class="' + (selisih ? 'neg' : 'pos') + '">' + (selisih ? tanda(selisih) : 'Rp 0 · seimbang') + '</b></div>' +
    '<div><span class="note">Status</span><b>' + esc(ST[u.status] || u.status) + (R.kotor ? ' · <span class="neg">belum disimpan</span>' : '') + '</b></div></div>';
  var alat = !ubah ? '<div class="status-box us-telaah">' + esc(u.judul) + ' berstatus ' + esc(ST[u.status] || u.status) + ': hanya dapat dilihat.</div>' :
    '<div class="rd-alat noprint" role="toolbar" aria-label="Alat Belanja Redesain">' +
      tb('h1', 'Rekam Header 1', sel.h1) + tb('h2', 'Rekam Header 2', sel.h2) + tb('det', 'Rekam Detail', sel.det) + tb('ubah', 'Ubah', sel.ubah) + tb('hapus', 'Hapus', sel.hapus) +
      '<span class="rd-sp"></span><button class="btn" type="button" data-rd="batal"' + (R.kotor ? '' : ' disabled') + '>Batalkan perubahan</button>' +
      '<button class="btn primary" type="button" data-rd="simpan"' + (R.kotor && !R.simpan ? '' : ' disabled') + '>' + (R.simpan ? 'Menyimpan…' : 'Simpan') + '</button></div>' +
      '<p class="note rd-petunjuk">' + esc(sel.ket) + '</p>';
  var grid = '<div class="tbl rd-grid"><table><thead><tr><th>Kode</th><th>Uraian</th><th class="n">Vol</th><th>Sat</th><th class="n">Harga</th><th class="n">Jumlah</th><th title="Blokir">*</th></tr></thead><tbody>' +
    baris.map(function(b){
      var on = R.sel && R.sel.key === b.key ? ' sel' : '';
      if (b.jenis !== 'item') return '<tr class="rd-' + b.jenis + on + '" data-rd-sel="' + esc(b.key) + '" data-rd-j="' + b.jenis + '" tabindex="0"><td class="code">' + esc(b.kode) + '</td><td style="padding-left:' + (8 + b.d * 10) + 'px">' + (b.jenis === 'h1' ? '&gt; ' : b.jenis === 'h2' ? '&gt;&gt; ' : '') + esc(b.n || '') + '</td><td></td><td></td><td></td><td class="n">' + rp(b.j) + '</td><td></td></tr>';
      var r = b.r, st = statusItem(r);
      return '<tr class="rd-item' + (st ? ' rd-' + st : '') + on + '" data-rd-sel="' + b.key + '" data-rd-j="item" tabindex="0"><td class="code">' + (st === 'baru' ? 'baru' : st === 'ubah' ? 'ubah' : '') + '</td><td style="padding-left:' + (8 + 9 * 10) + 'px">' + esc(r.uraian) + '</td>' +
        '<td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n">' + rp(r.jumlah) + '</td><td>' + (r.blokir ? '*' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  var daftarHapus = !hapus.length ? '' : card('rd-hapus', 'Detail yang dihapus (' + hapus.length + ')', 'Detail DIPA yang tidak ada lagi di usulan ini.',
    '<div class="tbl"><table><thead><tr><th>Akun</th><th>Uraian</th><th class="n">Jumlah DIPA</th><th></th></tr></thead><tbody>' +
    hapus.map(function(b){ return '<tr><td class="code">' + esc(b.akun) + '</td><td>' + esc(b.uraian) + '</td><td class="n">' + rp(b.jumlah) + '</td><td>' + (ubah ? '<button class="btn" type="button" data-rd-pulih="' + b.id + '">Kembalikan</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>', '');
  return '<div class="page-sec grid">' + card('rd', 'Belanja Redesain — ' + esc(u.judul), esc((u.unit || u.kategori || '') + ' · basis ' + 'DIPA – Revisi ke ' + ((u.revisi_ke || 1) - 1) + ' · TA ' + u.tahun) + '. Baris kuning = diubah, hijau = baru.',
    barMode() + ring + alat + grid, '') + daftarHapus + '</div>' + ikat();
}
function tb(id, t, aktif){ return '<button class="btn" type="button" data-rd="' + id + '"' + (aktif ? '' : ' disabled') + '>' + t + '</button>'; }
function ikat(){ setTimeout(bind, 0); return ''; }

/* ---------- pilihan baris → tombol yang aktif ---------- */
function barisTerpilih(baris){ return R.sel ? baris.filter(function(b){ return b.key === R.sel.key; })[0] || null : null; }
/* anggota (detail) di bawah satu baris kepala */
function anggota(b){ return R.rows.filter(function(r){ return jalur(r)[b.d] === b.key; }); }
function pilihan(baris){
  var o = { h1: false, h2: false, det: false, ubah: false, hapus: false, ket: 'Pilih baris akun, header, atau detail untuk merekam / mengubah.' };
  var b = barisTerpilih(baris); if (!b) return o;
  if (kunci51(b.r)){ o.ket = 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.'; return o; }
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), adaH1 = ang.some(function(r){ return r.judul; }), adaH2 = ang.some(function(r){ return r.judul2; });
  var bisaHapus = ang.length && !ang.some(function(r){ return r.blokir; });
  if (b.jenis === 'akun'){ o.h1 = true; o.det = !adaH1; o.ket = adaH1 ? 'Akun ini memakai header: pilih header untuk merekam detail, atau Rekam Header 1 baru.' : 'Rekam Header 1 baru atau Rekam Detail langsung di bawah akun ini.'; }
  else if (b.jenis === 'h1'){ o.h2 = true; o.det = !adaH2; o.ubah = true; o.hapus = bisaHapus; o.ket = 'Header 1: ' + b.n + (adaH2 ? ' — pilih Header 2 untuk merekam detail.' : ''); }
  else if (b.jenis === 'h2'){ o.det = true; o.ubah = true; o.hapus = bisaHapus; o.ket = 'Header 2: ' + b.n; }
  else if (b.jenis === 'item'){ o.det = true; o.ubah = !b.r.blokir; o.hapus = !b.r.blokir; o.ket = b.r.blokir ? 'Item terblokir (*) tidak dapat diubah atau dihapus.' : 'Detail: ' + b.r.uraian; }
  else o.ket = 'Pada tingkat ini belum ada perubahan yang bisa dilakukan; pilih akun, header, atau detail.';
  return o;
}

/* ---------- jendela isian (Form R/U/H Item & Form Rekam Header) ---------- */
function formItem(judul, sub, r, header, onOk){
  var fld = function(id, lbl, v, ph, mode){ return '<label class="f" for="' + id + '">' + lbl + '<input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '" placeholder="' + (ph || '') + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off"></label>'; };
  openModal('<div class="modal-hd"><div><span class="note">' + esc(sub) + '</span><h3>' + esc(judul) + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate>' +
      (header ? fld('rdHeader', header, '', 'uraian header') : '') +
      (r ? fld('rdUraian', 'Uraian detail', r.uraian, 'mis. Honor Sopir') +
        '<div class="rd-hitung">' + fld('rdVol', 'Volume', vol(r.volume), '0', 'decimal') + fld('rdSat', 'Satuan', r.satuan, 'mis. OK') + '<span class="rd-op">×</span>' +
        fld('rdHarga', 'Harga satuan', r.harga == null ? '' : rp(r.harga), '0', 'decimal') + '<span class="rd-op">=</span><div class="f">Jumlah<output id="rdJml" class="rd-jml">' + rp(r.jumlah || 0) + '</output></div></div>' +
        '<label class="chk"><input type="checkbox" disabled' + (r.blokir ? ' checked' : '') + '><span>Blokir (diatur Admin perencanaan di SAKTI)</span></label>' : '') +
      '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div>' +
      '<div class="tools"><button type="submit" class="btn primary">Ok</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  var f = $('rdForm');
  var hitung = function(){ if (!$('rdJml')) return; var v = angka($('rdVol').value), h = angka($('rdHarga').value); $('rdJml').textContent = v == null || h == null || isNaN(v) || isNaN(h) ? '—' : rp(Math.round(v * h)); };
  if ($('rdVol')){ $('rdVol').oninput = hitung; $('rdHarga').oninput = hitung; }
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  f.onsubmit = function(e){
    e.preventDefault();
    var salah = function(m){ $('rdMsg').textContent = m; $('rdMsg').hidden = false; };
    var hasil = {};
    if (header){ hasil.header = $('rdHeader').value.trim(); if (hasil.header.length < 2) return salah('Uraian header wajib diisi (minimal 2 karakter).'); }
    if (r){
      hasil.uraian = $('rdUraian').value.trim(); hasil.volume = angka($('rdVol').value); hasil.satuan = $('rdSat').value.trim(); hasil.harga = angka($('rdHarga').value);
      if (hasil.uraian.length < 2) return salah('Uraian detail wajib diisi (minimal 2 karakter).');
      if (hasil.volume == null || isNaN(hasil.volume) || hasil.volume < 0) return salah('Isi volume dengan angka (boleh desimal, mis. 0,5).');
      if (hasil.harga == null || isNaN(hasil.harga) || hasil.harga < 0) return salah('Isi harga satuan dengan angka, mis. 1.398.101.000.');
    }
    closeModal(); onOk(hasil);
  };
  setTimeout(function(){ var x = f.querySelector('input:not([disabled])'); if (x) x.focus(); }, 60);
}
function formHeader(judul, sub, nilai, onOk){
  openModal('<div class="modal-hd"><div><span class="note">' + esc(sub) + '</span><h3>' + esc(judul) + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate><label class="f" for="rdHeader">Uraian<input type="text" id="rdHeader" value="' + esc(nilai) + '" autocomplete="off"></label>' +
    '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div><div class="tools"><button type="submit" class="btn primary">Ok</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  $('rdForm').onsubmit = function(e){ e.preventDefault(); var v = $('rdHeader').value.trim(); if (v.length < 2){ $('rdMsg').textContent = 'Uraian header wajib diisi (minimal 2 karakter).'; $('rdMsg').hidden = false; return; } closeModal(); onOk(v); };
  setTimeout(function(){ $('rdHeader').focus(); }, 60);
}

/* ---------- perubahan pada salinan (di memori sampai Simpan) ---------- */
function urutanSetelah(r){ urut(); var i = R.rows.indexOf(r), n = R.rows[i + 1]; return n ? (r.urutan + n.urutan) / 2 : r.urutan + 1; }
function sisip(dasar, setelah, isi, judul, judul2){
  var r = {}; ['prog', 'prog_n', 'keg', 'keg_n', 'kro', 'kro_n', 'ro', 'ro_n', 'komp', 'komp_n', 'sub', 'sub_n', 'akun', 'akun_n', 'sumber', 'kategori', 'unit'].forEach(function(k){ r[k] = dasar[k]; });
  r.id = null; r.anggaran_id = null; r.blokir = false; r.judul = judul; r.judul2 = judul2;
  r.uraian = isi.uraian; r.volume = isi.volume; r.satuan = isi.satuan; r.harga = isi.harga; r.jumlah = Math.round(isi.volume * isi.harga);
  r.urutan = urutanSetelah(setelah); R.rows.push(r); urut();
  R.sel = { key: 'i' + R.rows.indexOf(r) }; R.kotor = true; keepScroll();
}
function kosong(){ return { uraian: '', volume: null, satuan: '', harga: null, jumlah: 0, blokir: false }; }
function aksi(nama){
  var baris = susun(), b = barisTerpilih(baris); if (!b) return;
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), akhir = ang[ang.length - 1], konteks = b.r.akun + ' ' + (b.r.akun_n || '');
  if (nama === 'h1') formItem('Rekam Header 1', konteks, kosong(), 'Uraian Header 1', function(h){ sisip(b.r, akhir, h, h.header, ''); });
  else if (nama === 'h2') formItem('Rekam Header 2', konteks + ' · ' + b.r.judul, kosong(), 'Uraian Header 2', function(h){ sisip(b.r, akhir, h, b.r.judul, h.header); });
  else if (nama === 'det') formItem('Rekam Detail', konteks + (b.r.judul ? ' · ' + b.r.judul : '') + (b.r.judul2 ? ' · ' + b.r.judul2 : ''), kosong(), null,
    function(h){ sisip(b.r, b.jenis === 'item' ? b.r : akhir, h, b.r.judul, b.r.judul2); });
  else if (nama === 'ubah' && b.jenis === 'item'){
    var r = b.r;
    formItem('Ubah Detail', konteks, r, null, function(h){ r.uraian = h.uraian; r.volume = h.volume; r.satuan = h.satuan; r.harga = h.harga; r.jumlah = jumlahDari(r, R.basis[r.anggaran_id]); R.kotor = true; keepScroll(); });
  }
  else if (nama === 'ubah') formHeader(b.jenis === 'h1' ? 'Ubah Header 1' : 'Ubah Header 2', konteks, b.n, function(v){
    ang.forEach(function(r){ if (b.jenis === 'h1') r.judul = v; else r.judul2 = v; }); R.sel = null; R.kotor = true; keepScroll();
  });
  else if (nama === 'hapus'){
    var pesan = b.jenis === 'item' ? 'Detail "' + b.r.uraian + '" (Rp ' + rp(b.r.jumlah) + ') dihapus dari usulan.' : ang.length + ' detail di bawah header "' + b.n + '" (Rp ' + rp(b.j) + ') dihapus dari usulan.';
    tanya({ judul: b.jenis === 'item' ? 'Hapus detail?' : 'Hapus header beserta detailnya?', pesan: pesan + ' Perubahan baru tersimpan setelah Anda klik Simpan.', ya: 'Hapus', bahaya: true }).then(function(ya){
      if (!ya) return; R.rows = R.rows.filter(function(r){ return ang.indexOf(r) < 0; }); R.sel = null; R.kotor = true; keepScroll();
    });
  }
}
function pulihkan(id){
  var b = R.basis[id]; if (!b) return;
  var r = {}; Object.keys(b).forEach(function(k){ r[k] = b[k]; }); r.anggaran_id = b.id; r.id = null;
  R.rows.push(r); urut(); R.kotor = true; keepScroll();
}
function simpan(){
  if (!R.kotor || R.simpan) return;
  R.simpan = true; keepScroll();
  var kirim = R.rows.map(function(r){ return { anggaran_id: r.anggaran_id, urutan: r.urutan, judul: r.judul || '', judul2: r.judul2 || '', uraian: r.uraian, volume: r.volume, satuan: r.satuan || '', harga: r.harga,
    prog: r.prog, kro: r.kro, ro: r.ro, sub: r.sub, akun: r.akun }; });
  SB.simpanSalinan(R.u.id, kirim).then(function(x){
    R.simpan = false; R.kotor = false; R.rows = null; R.u = null; R.daftar = null; lupakanUsulan();
    toast('Pagu usulan Rp ' + rp(x.pagu) + (x.selisih ? ' — selisih ' + tanda(x.selisih) + ' terhadap DIPA; usulan harus seimbang sebelum diajukan.' : ' — seimbang dengan DIPA.') + ' ' + x.perubahan + ' baris perubahan tercatat.', x.selisih ? 'warn' : 'ok', 'Usulan disimpan');
    refresh();
  }).catch(function(e){ R.simpan = false; keepScroll(); toast(errMsg(e), 'err', 'Usulan belum tersimpan'); });
}

/* ---------- interaksi ---------- */
function bind(){
  var pg = $('page'); if (!pg) return;
  [].forEach.call(pg.querySelectorAll('[data-rd-mode]'), function(el){ el.onclick = function(){
    var m = el.getAttribute('data-rd-mode'); m = m === 'dipa' ? 'dipa' : +m;
    var ganti = function(){ R.mode = m; R.kotor = false; R.rows = null; R.u = null; R.sel = null; refresh(); };
    if (R.kotor && m !== R.mode) tanya({ judul: 'Tinggalkan perubahan yang belum disimpan?', pesan: 'Perubahan pada Belanja Redesain akan hilang.', ya: 'Tinggalkan', bahaya: true }).then(function(ya){ if (ya) ganti(); });
    else ganti();
  }; });
  [].forEach.call(pg.querySelectorAll('[data-rd-sel]'), function(el){
    var pilih = function(){ R.sel = { key: el.getAttribute('data-rd-sel') }; [].forEach.call(pg.querySelectorAll('.rd-grid tr.sel'), function(t){ t.classList.remove('sel'); }); el.classList.add('sel'); perbaruiAlat(); };
    el.onclick = pilih;
    el.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pilih(); } };
    el.ondblclick = function(){ pilih(); var t = pg.querySelector('[data-rd="ubah"]'); if (t && !t.disabled) aksi('ubah'); };
  });
  [].forEach.call(pg.querySelectorAll('[data-rd]'), function(el){ el.onclick = function(){
    var a = el.getAttribute('data-rd');
    if (a === 'simpan') simpan();
    else if (a === 'batal') tanya({ judul: 'Batalkan semua perubahan?', pesan: 'Belanja Redesain kembali ke kondisi terakhir yang disimpan.', ya: 'Batalkan perubahan', bahaya: true }).then(function(ya){ if (ya){ R.kotor = false; R.rows = null; R.u = null; refresh(); } });
    else aksi(a);
  }; });
  [].forEach.call(pg.querySelectorAll('[data-rd-pulih]'), function(el){ el.onclick = function(){ pulihkan(+el.getAttribute('data-rd-pulih')); }; });
}
/* tombol bilah alat diperbarui tanpa menggambar ulang tabel (tabel bisa ratusan baris) */
function perbaruiAlat(){
  var o = pilihan(susun()), pg = $('page');
  ['h1', 'h2', 'det', 'ubah', 'hapus'].forEach(function(k){ var t = pg.querySelector('[data-rd="' + k + '"]'); if (t) t.disabled = !o[k]; });
  var p = pg.querySelector('.rd-petunjuk'); if (p) p.textContent = o.ket;
}
