/* js/pages/redesain.js — Belanja Redesain (Monev Anggaran tahap 9/9b)
   - tanpa usulan aktif: lembar kerja DIPA (hanya lihat; Admin perencanaan dapat mengatur blokir manual)
   - dengan usulan aktif: edit salinan kerja usulan revisi
   Kolom Blokir seperti SAKTI: nilai blokir per item = RKK − FA Detail (blokir_item di database), dikunci;
   bagian yang diblokir tidak boleh digeser (jumlah ≥ blokir + realisasi).
   Susunan seperti RUH → Belanja Redesain di SAKTI: Program → Kegiatan → KRO → RO → Komponen → Sub komponen
   → Akun → Header 1 (">") → Header 2 (">>") → Detail. Pilih baris, lalu pakai tombol di bilah alat:
   Rekam Header 1 / Rekam Header 2 / Rekam Detail / Ubah / Hapus. Perubahan disimpan ke database lewat
   simpan_salinan (struktur & item terblokir dijaga di server; aturan revisi diperiksa saat diajukan). */
import { $, esc, rp, tgl, labelVersi, toast, tanya, errMsg } from '../utils.js?v=202611151253';
import { S, sess, isSuperAdmin } from '../state.js?v=202611151253';
import { card, openModal, closeModal } from '../ui-components.js?v=202611151253';
import { SB } from '../api.js?v=202611151253';
import { refresh } from '../nav.js?v=202611151253';
import { lupakanUsulan } from './usulan.js?v=202611151253';

var BISA_EDIT = ['draf', 'dikembalikan'], AKTIF = ['draf', 'diajukan', 'dikembalikan', 'disetujui'];
var R = { daftar: null, mode: null, u: null, rows: null, basis: null, bl: {}, rk: {}, bas: [], vs: null, dv: null, sel: null, kotor: false, memuat: false, err: null, simpan: false };
var ST = { draf: 'Draf', diajukan: 'Diajukan', dikembalikan: 'Dikembalikan', disetujui: 'Disetujui' };
var IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

window.addEventListener('beforeunload', function(e){ if (R.kotor){ e.preventDefault(); e.returnValue = ''; } });
/* dari detail usulan: buka langsung mode edit usulan itu */
document.addEventListener('edit-redesain', function(e){ R.mode = e.detail; R.daftar = null; R.u = null; R.rows = null; S.page = 'anggaran-rkk'; S.open = {}; refresh(); window.scrollTo(0, 0); });
/* usulan dibentuk/diajukan/dibatalkan di menu lain: daftar usulan dimuat ulang saat Belanja Redesain dibuka lagi */
document.addEventListener('usulan-berubah', function(){ if (!R.kotor){ R.daftar = null; R.u = null; R.rows = null; } });
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
  return (R.daftar || []).filter(function(u){ return u.histori && AKTIF.indexOf(u.status) >= 0 && (!isSuperAdmin() || u.dibuat_email === me) && bolehUbah(u); });
}
function bolehUbah(u){ return !!u && BISA_EDIT.indexOf(u.status) >= 0 && (u.dibuat_email === sess().email || isSuperAdmin()); }
function muatDaftar(){
  if (R.memuat) return; R.memuat = true; R.err = null;
  SB.usulanDaftar().then(function(l){
    R.daftar = l; R.memuat = false;
    var ada = usulanSaya();
    if (!ada.some(function(u){ return u.id === R.mode; })) R.mode = ada.length ? ada[0].id : 'dipa';
    if (S.page === 'anggaran-rkk') refresh();
  }).catch(function(e){ R.memuat = false; R.daftar = []; R.mode = 'dipa'; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
function muatSalinan(u){
  if (R.memuat) return; R.memuat = true; R.err = null;
  Promise.all([SB.salinan(u.id), SB.anggaranItem(u.versi_id), SB.blokirItem(u.versi_id), SB.realisasiKelompok(u.versi_id), SB.bagianAkun()]).then(function(r){
    R.u = u; R.rows = r[0]; R.bl = r[2]; R.rk = r[3]; R.bas = r[4]; R.sel = null; R.kotor = false;
    R.basis = {}; r[1].forEach(function(b){ if (b.kategori === u.kategori && (b.unit || '') === (u.unit || '')) R.basis[b.id] = b; });
    R.memuat = false; if (S.page === 'anggaran-rkk') refresh();
  }).catch(function(e){ R.memuat = false; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
/* lembar kerja DIPA: versi terpilih (bawaan: DIPA terakhir pada tahun anggaran terbaru) */
function muatDipa(){
  if (R.memuat) return; R.memuat = true; R.err = null;
  SB.anggaranVersi().then(function(vs){
    R.vs = vs;
    if (!vs.length) throw new Error('Belum ada RKK. Admin perencanaan perlu mengunggah RKK lebih dulu.');
    var v = vs.filter(function(x){ return x.id === R.dv; })[0];
    if (!v){ var th = Math.max.apply(null, vs.map(function(x){ return x.tahun; })), sm = vs.filter(function(x){ return x.tahun === th; }); v = sm[sm.length - 1]; }
    return Promise.all([SB.anggaranItem(v.id), SB.blokirItem(v.id)]).then(function(r){
      R.dv = v.id; R.u = { dipa: true, id: 'dipa-' + v.id, versi: v };
      R.basis = {}; R.rows = r[0].map(function(b){ R.basis[b.id] = b; var x = {}; Object.keys(b).forEach(function(k){ x[k] = b[k]; }); x.anggaran_id = b.id; return x; });
      R.bl = r[1]; R.sel = null; R.kotor = false;
    });
  }).then(function(){ R.memuat = false; if (S.page === 'anggaran-rkk') refresh(); })
    .catch(function(e){ R.memuat = false; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
/* Belanja Redesain langsung terbuka dalam mode edit bila unit punya usulan yang sedang disusun.
   Pemilih hanya muncul bila pengguna memegang lebih dari satu usulan (mis. cakupan beberapa unit). */
export function barMode(){
  var ada = usulanSaya(); if (ada.length < 2) return '';
  return '<div class="form noprint rd-pilih"><label class="f" for="rdUsulan">Usulan yang diedit<select id="rdUsulan">' +
    ada.map(function(u){ return '<option value="' + u.id + '"' + (u.id === R.mode ? ' selected' : '') + '>' + esc(u.judul + (u.unit ? ' · ' + u.unit : '')) + '</option>'; }).join('') + '</select></label></div>';
}

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
  return (r.sub !== b.sub || r.sub_n !== b.sub_n || r.akun !== b.akun || r.uraian !== b.uraian || r.volume !== b.volume || r.harga !== b.harga || r.satuan !== b.satuan || r.judul !== b.judul || r.judul2 !== b.judul2) ? 'ubah' : '';
}
function dihapus(){ var ada = {}; R.rows.forEach(function(r){ if (r.anggaran_id != null) ada[r.anggaran_id] = 1; }); return Object.keys(R.basis).filter(function(id){ return !ada[id]; }).map(function(id){ return R.basis[id]; }); }
/* info blokir item: { blokir, realisasi, rkk, manual } — item baru tidak berblokir */
function blk(r){ return (r.anggaran_id != null && R.bl[r.anggaran_id]) || { blokir: 0, realisasi: 0, rkk: false, manual: false }; }
function penuh(r){ var i = blk(r), b = R.basis[r.anggaran_id]; return i.blokir > 0 && b && i.blokir >= b.jumlah; }
function minimal(r){ var i = blk(r); return i.blokir > 0 ? i.blokir + i.realisasi : 0; }
/* realisasi sub komponen / kelompok menurut struktur DIPA asal item (bukan kode yang sedang diedit) */
function realSub(rows){ var k = {}, n = 0; rows.forEach(function(r){ var b = R.basis[r.anggaran_id]; if (b) k[[b.prog, b.kro, b.ro, b.sub].join('|')] = 1; }); Object.keys(k).forEach(function(x){ n += R.rk[x] || 0; }); return n; }
function realKel(rows){ var k = {}, n = 0; rows.forEach(function(r){ var b = R.basis[r.anggaran_id]; if (b) k[[b.prog, b.kro, b.ro, b.sub, b.akun].join('|')] = 1; }); Object.keys(k).forEach(function(x){ n += R.rk[x] || 0; }); return n; }
function sd(s){ return s === 'PNP' ? 'PNBP' : s === 'RM' ? 'RM' : (s || ''); }
function kunci51(r){ return sess().role === 'UNIT' && /^51/.test(r.akun); }

/* ---------- halaman ---------- */
export function renderRedesain(){
  if (!R.daftar){ muatDaftar(); return '<div class="loading">Memuat Belanja Redesain…</div>'; }
  var u = R.mode === 'dipa' ? null : (R.daftar || []).filter(function(x){ return x.id === R.mode; })[0];
  if (R.mode !== 'dipa' && !u) R.mode = 'dipa';
  if (R.err) return '<div class="page-sec grid">' + card('rd', 'Belanja Redesain', '', barMode() + '<p class="note">' + esc(R.err) + '</p>', '') + '</div>' + ikat();
  if (!u){
    if (!R.rows || !R.u || !R.u.dipa || R.u.versi.id !== R.dv){ muatDipa(); return '<div class="loading">Memuat Belanja Redesain…</div>'; }
  } else if (!R.rows || !R.u || R.u.id !== u.id){ muatSalinan(u); return '<div class="loading">Memuat ' + esc(u.judul) + '…</div>'; }
  var dipa = !u, ubah = !dipa && bolehUbah(u), baris = susun(), sel = pilihan(baris);
  var pagu = R.rows.reduce(function(a, r){ return a + r.jumlah; }, 0), totBl = R.rows.reduce(function(a, r){ return a + blk(r).blokir; }, 0);
  var ring, alat = '', judul, sub, act = '';
  if (dipa){
    var v = R.u.versi;
    judul = 'Belanja Redesain';
    sub = esc(labelVersi(v) + ' · posisi ' + tgl(v.posisi) + ' · TA ' + v.tahun) + '. Kolom Blokir = nilai blokir per item seperti di SAKTI.';
    act = '<label class="f ag-versi" for="rdVersi"><span class="sr-only">Versi DIPA</span><select id="rdVersi">' + R.vs.slice().reverse().map(function(x){ return '<option value="' + x.id + '"' + (x.id === v.id ? ' selected' : '') + '>' + esc(labelVersi(x) + ' · ' + tgl(x.posisi) + ' · TA ' + x.tahun) + '</option>'; }).join('') + '</select></label>';
    ring = '<div class="rd-ring"><div><span class="note">Pagu</span><b>Rp ' + rp(pagu) + '</b></div><div><span class="note">Diblokir</span><b>Rp ' + rp(totBl) + '</b></div><div><span class="note">Dapat digunakan</span><b>Rp ' + rp(pagu - totBl) + '</b></div></div>';
    if (isSuperAdmin()) alat = '<div class="rd-alat noprint" role="toolbar" aria-label="Alat Belanja Redesain">' + tb('blokir', 'Ubah Blokir', sel.blokir) + '</div><p class="note rd-petunjuk">' + esc(sel.ket) + '</p>';
  } else {
    var selisih = pagu - u.pagu_awal;
    judul = 'Belanja Redesain — ' + esc(u.judul);
    sub = esc((u.unit || u.kategori || '') + ' · basis DIPA – Revisi ke ' + ((u.revisi_ke || 1) - 1) + ' · TA ' + u.tahun) + '. Baris kuning = diubah, hijau = baru.';
    ring = '<div class="rd-ring"><div><span class="note">Pagu usulan</span><b>Rp ' + rp(pagu) + '</b></div><div><span class="note">Pagu DIPA unit</span><b>Rp ' + rp(u.pagu_awal) + '</b></div>' +
      '<div><span class="note">Selisih</span><b class="' + (selisih ? 'neg' : 'pos') + '">' + (selisih ? tanda(selisih) : 'Rp 0 · seimbang') + '</b></div>' +
      '<div><span class="note">Diblokir</span><b>Rp ' + rp(totBl) + '</b></div>' +
      '<div><span class="note">Status</span><b>' + esc(ST[u.status] || u.status) + (R.kotor ? ' · <span class="neg">belum disimpan</span>' : '') + '</b></div></div>';
    alat = !ubah ? '<div class="status-box us-telaah">' + esc(u.judul) + ' berstatus ' + esc(ST[u.status] || u.status) + ': hanya dapat dilihat.</div>' :
      '<div class="rd-alat noprint" role="toolbar" aria-label="Alat Belanja Redesain">' +
        tb('subbaru', 'Rekam Sub Komponen', sel.subbaru) + tb('akun', 'Rekam Akun', sel.akun) + tb('h1', 'Rekam Header 1', sel.h1) + tb('h2', 'Rekam Header 2', sel.h2) + tb('det', 'Rekam Detail', sel.det) + tb('ubah', 'Ubah', sel.ubah) + tb('hapus', 'Hapus', sel.hapus) +
        '<span class="rd-sp"></span><button class="btn" type="button" data-rd="batal"' + (R.kotor ? '' : ' disabled') + '>Batalkan perubahan</button>' +
        '<button class="btn primary" type="button" data-rd="simpan"' + (R.kotor && !R.simpan ? '' : ' disabled') + '>' + (R.simpan ? 'Menyimpan…' : 'Simpan') + '</button></div>' +
        '<p class="note rd-petunjuk">' + esc(sel.ket) + '</p>';
  }
  /* jumlah blokir per baris kepala */
  var blK = {}; R.rows.forEach(function(r){ var n = blk(r).blokir; if (n) jalur(r).forEach(function(k){ blK[k] = (blK[k] || 0) + n; }); });
  var IND = 7;
  var grid = '<div class="tbl rd-grid"><table><colgroup><col class="c-kode"><col><col class="c-n"><col class="c-sat"><col class="c-rp"><col class="c-rp"><col class="c-rp"><col class="c-t"><col class="c-sd"></colgroup>' +
    '<thead><tr><th>Kode</th><th>Uraian</th><th class="n">Vol</th><th>Sat</th><th class="n">Harga</th><th class="n">Jumlah</th><th class="n">Blokir</th><th title="Item terblokir">*</th><th title="Sumber dana">SD</th></tr></thead><tbody>' +
    baris.map(function(b){
      var on = R.sel && R.sel.key === b.key ? ' sel' : '';
      if (b.jenis !== 'item') return '<tr class="rd-' + b.jenis + on + '" data-rd-sel="' + esc(b.key) + '" tabindex="0"><td class="code">' + esc(b.kode) + '</td><td style="padding-left:' + (6 + b.d * IND) + 'px">' + (b.jenis === 'h1' ? '&gt; ' : b.jenis === 'h2' ? '&gt;&gt; ' : '') + esc(b.n || '') + '</td><td></td><td></td><td></td><td class="n">' + rp(b.j) + '</td>' +
        '<td class="n rd-bl">' + (blK[b.key] ? rp(blK[b.key]) : '') + '</td><td></td><td class="rd-sd">' + (b.jenis === 'akun' ? sd(b.r.sumber) : '') + '</td></tr>';
      var r = b.r, st = dipa ? '' : statusItem(r), i = blk(r);
      return '<tr class="rd-item' + (st ? ' rd-' + st : '') + on + '" data-rd-sel="' + b.key + '" tabindex="0"><td class="code">' + (st === 'baru' ? 'baru' : st === 'ubah' ? 'ubah' : '') + '</td><td style="padding-left:' + (6 + 9 * IND) + 'px">' + esc(r.uraian) + '</td>' +
        '<td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n">' + rp(r.jumlah) + '</td>' +
        '<td class="n rd-bl">' + (i.blokir ? rp(i.blokir) : '') + '</td><td class="rd-t" title="' + (i.blokir ? (i.manual ? 'Blokir manual Admin perencanaan' : 'Blokir dari RKK SAKTI') : '') + '">' + (i.blokir ? (i.manual ? 'M' : '*') : '') + '</td><td class="rd-sd">' + sd(r.sumber) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  var hapus = dipa ? [] : dihapus();
  var daftarHapus = !hapus.length ? '' : card('rd-hapus', 'Detail yang dihapus (' + hapus.length + ')', 'Detail DIPA yang tidak ada lagi di usulan ini.',
    '<div class="tbl"><table><thead><tr><th>Akun</th><th>Uraian</th><th class="n">Jumlah DIPA</th><th></th></tr></thead><tbody>' +
    hapus.map(function(b){ return '<tr><td class="code">' + esc(b.akun) + '</td><td>' + esc(b.uraian) + '</td><td class="n">' + rp(b.jumlah) + '</td><td>' + (ubah ? '<button class="btn" type="button" data-rd-pulih="' + b.id + '">Kembalikan</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>', '');
  return '<div class="page-sec grid">' + card('rd', judul, sub, barMode() + ring + alat + grid +
    '<p class="note rd-ket">* = blokir dari RKK SAKTI (nilai = RKK − FA Detail posisi terakhir) · M = blokir manual Admin perencanaan · SD = sumber dana (RM / PNBP).</p>', act) + daftarHapus + '</div>' + ikat();
}
/* gambar ulang tanpa kehilangan posisi: gulir halaman & gulir tabel dicatat lalu dikembalikan di bind() */
function gambarUlang(){
  var g = document.querySelector('.rd-grid');
  R.posisi = { y: window.scrollY, g: g ? g.scrollTop : 0, x: g ? g.scrollLeft : 0 };
  refresh();
}
function tb(id, t, aktif){ return '<button class="btn" type="button" data-rd="' + id + '"' + (aktif ? '' : ' disabled') + '>' + t + '</button>'; }
function ikat(){ setTimeout(bind, 0); return ''; }

/* ---------- pilihan baris → tombol yang aktif ---------- */
function barisTerpilih(baris){ return R.sel ? baris.filter(function(b){ return b.key === R.sel.key; })[0] || null : null; }
/* anggota (detail) di bawah satu baris kepala */
function anggota(b){ return R.rows.filter(function(r){ return jalur(r)[b.d] === b.key; }); }
function pilihan(baris){
  var dipa = R.u && R.u.dipa;
  var o = { subbaru: false, akun: false, h1: false, h2: false, det: false, ubah: false, hapus: false, blokir: false,
    ket: dipa ? 'Pilih detail untuk mengatur blokir manual.' : 'Urutan merekam: 1. Rekam Sub Komponen (pilih baris komponen) → 2. Rekam Akun (pilih sub komponen) → 3. Rekam Header → 4. Rekam Detail.' };
  var b = barisTerpilih(baris); if (!b) return o;
  if (dipa){
    if (b.jenis !== 'item') o.ket = 'Blokir diatur per detail: pilih baris detail.';
    else if (b.r.blokir) o.ket = 'Blokir "' + b.r.uraian + '" berasal dari RKK SAKTI (Rp ' + rp(blk(b.r).blokir) + ') dan dikunci.';
    else { o.blokir = true; o.ket = 'Detail: ' + b.r.uraian + (blk(b.r).blokir ? ' · blokir manual Rp ' + rp(blk(b.r).blokir) : ''); }
    return o;
  }
  if (kunci51(b.r)){ o.ket = 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.'; return o; }
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), adaH1 = ang.some(function(r){ return r.judul; }), adaH2 = ang.some(function(r){ return r.judul2; });
  var adaBl = ang.some(function(r){ return blk(r).blokir > 0; }), bisaHapus = ang.length && !adaBl;
  if (b.jenis === 'komp'){ o.subbaru = true; o.ket = 'Komponen ' + b.kode + ': Rekam Sub Komponen baru (beserta akun dan detail pertamanya).'; }
  else if (b.jenis === 'sub'){
    var rs = realSub(ang);
    o.subbaru = true; o.akun = true; o.ubah = !rs && !adaBl;
    o.ket = 'Sub komponen ' + b.kode + ': Rekam Akun baru' + (rs ? '. Kode/uraian tidak dapat diubah karena sudah ada realisasi Rp ' + rp(rs) + '.' : adaBl ? '. Kode/uraian tidak dapat diubah karena memuat item berblokir.' : ', atau Ubah kode/uraian (realisasi Rp 0).');
  }
  else if (b.jenis === 'akun'){
    var rk = realKel(ang);
    o.h1 = true; o.det = !adaH1; o.ubah = !rk && !adaBl;
    o.ket = (adaH1 ? 'Akun ini memakai header: pilih header untuk merekam detail, atau Rekam Header 1 baru.' : 'Rekam Header 1 baru atau Rekam Detail langsung di bawah akun ini.') +
      (rk ? ' Akun tidak dapat diganti: sudah ada realisasi Rp ' + rp(rk) + '.' : adaBl ? ' Akun tidak dapat diganti: memuat item berblokir.' : ' Ubah = ganti akun (realisasi Rp 0).');
  }
  else if (b.jenis === 'h1'){ o.h2 = true; o.det = !adaH2; o.ubah = !adaBl; o.hapus = bisaHapus; o.ket = 'Header 1: ' + b.n + (adaH2 ? ' — pilih Header 2 untuk merekam detail.' : '') + (adaBl ? ' · memuat item berblokir (header tidak dapat diubah/dihapus).' : ''); }
  else if (b.jenis === 'h2'){ o.det = true; o.ubah = !adaBl; o.hapus = bisaHapus; o.ket = 'Header 2: ' + b.n + (adaBl ? ' · memuat item berblokir (header tidak dapat diubah/dihapus).' : ''); }
  else if (b.jenis === 'item'){
    var i = blk(b.r);
    o.det = true; o.ubah = !penuh(b.r); o.hapus = !i.blokir;
    o.ket = penuh(b.r) ? 'Item diblokir penuh (Rp ' + rp(i.blokir) + '): tidak dapat diubah atau dihapus.' :
      i.blokir ? 'Blokir Rp ' + rp(i.blokir) + ' · realisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal Rp ' + rp(minimal(b.r)) + '. Item berblokir tidak dapat dihapus.' : 'Detail: ' + b.r.uraian;
  }
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
        (function(){ var i = blk(r); return '<div class="rd-blokir"><label class="chk"><input type="checkbox" disabled' + (i.blokir ? ' checked' : '') + '><span>Blokir</span></label>' +
          '<input type="text" class="rd-blnilai" value="' + rp(i.blokir) + '" disabled aria-label="Nilai blokir">' +
          (i.blokir ? '<span class="note">Dikunci' + (i.manual ? ' (blokir manual Admin perencanaan)' : ' (RKK SAKTI)') + '. Realisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal <b>Rp ' + rp(i.blokir + i.realisasi) + '</b>.</span>' : '<span class="note">Tidak diblokir.</span>') + '</div>'; })() : '') +
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
      var bi = blk(r);
      if (bi.blokir){
        var baru = jumlahDari({ volume: hasil.volume, harga: hasil.harga }, R.basis[r.anggaran_id]);
        if (baru < bi.blokir + bi.realisasi) return salah('Ditolak: jumlah menjadi Rp ' + rp(baru) + ', di bawah batas minimal Rp ' + rp(bi.blokir + bi.realisasi) + ' (blokir Rp ' + rp(bi.blokir) + ' + realisasi Rp ' + rp(bi.realisasi) + '). Bagian yang diblokir tidak dapat digeser.');
      }
    }
    closeModal(); onOk(hasil);
  };
  if (r && blk(r).blokir) $('rdUraian').disabled = true;
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

/* Form R/U/H Sub Komponen (gambar 4): kode & uraian — hanya bila realisasinya Rp 0 */
function formSub(b, ang){
  var komp = b.r.komp, kode = String(b.r.sub || '').slice(String(komp).length + 1);
  openModal('<div class="modal-hd"><div><span class="note">Komponen ' + esc(komp + ' ' + (b.r.komp_n || '')) + '</span><h3>Ubah Sub Komponen</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate><div class="rd-hitung"><label class="f" for="rdSubKode" style="flex:0 0 130px">Sub Komponen<input type="text" id="rdSubKode" value="' + esc(kode) + '" maxlength="4" autocomplete="off" style="text-transform:uppercase"></label>' +
    '<label class="f" for="rdSubN">Uraian<input type="text" id="rdSubN" value="' + esc(b.r.sub_n || '') + '" autocomplete="off"></label></div>' +
    '<p class="note" style="margin:0">' + ang.length + ' detail (Rp ' + rp(b.j) + ') ikut berpindah ke kode baru. Realisasi sub komponen ini Rp 0.</p>' +
    '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div><div class="tools"><button type="submit" class="btn primary">Ok</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  $('rdForm').onsubmit = function(e){
    e.preventDefault();
    var salah = function(m){ $('rdMsg').textContent = m; $('rdMsg').hidden = false; };
    var k = $('rdSubKode').value.trim().toUpperCase(), n = $('rdSubN').value.trim(), baru = komp + '.' + k;
    if (!/^[A-Z0-9]{1,4}$/.test(k)) return salah('Kode sub komponen 1–4 huruf kapital/angka, mis. AA.');
    if (n.length < 3) return salah('Uraian sub komponen wajib diisi (minimal 3 karakter).');
    if (baru !== b.r.sub && R.rows.some(function(r){ return ang.indexOf(r) < 0 && r.ro === b.r.ro && r.sub === baru; }))
      return salah('Kode ' + k + ' sudah dipakai sub komponen lain di komponen ini.');
    closeModal();
    ang.forEach(function(r){ r.sub = baru; r.sub_n = n; });
    R.sel = null; R.kotor = true; gambarUlang();
  };
  setTimeout(function(){ $('rdSubKode').focus(); }, 60);
}
/* Bagan Akun Standar (gambar 5): pilih akun per jenis belanja; mode rekam juga meminta detail pertama */
var JENIS = { '51': 'Belanja Pegawai', '52': 'Belanja Barang', '53': 'Belanja Modal', '57': 'Belanja Bantuan Sosial' };
function formAkun(judul, sub, rekam, sumberList, onOk, subBaru){
  var bas = R.bas.filter(function(a){ return !(sess().role === 'UNIT' && /^51/.test(a.kode)); });
  var jenis = []; bas.forEach(function(a){ var j = a.kode.slice(0, 2); if (jenis.indexOf(j) < 0) jenis.push(j); }); jenis.sort();
  var pilih = { jenis: jenis.indexOf('52') >= 0 ? '52' : jenis[0], akun: null, q: '' };
  var fld = function(id, lbl, ph, mode){ return '<label class="f" for="' + id + '">' + lbl + '<input type="text" id="' + id + '" placeholder="' + (ph || '') + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off"></label>'; };
  openModal('<div class="modal-hd"><div><span class="note">' + esc(sub) + '</span><h3>' + esc(judul) + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate>' +
      (subBaru ? '<div class="rd-hitung"><label class="f" for="rdSubKode" style="flex:0 0 130px">Kode sub komponen<input type="text" id="rdSubKode" maxlength="4" placeholder="mis. ZA" autocomplete="off" style="text-transform:uppercase"></label>' +
        '<label class="f" for="rdSubN">Uraian sub komponen<input type="text" id="rdSubN" placeholder="mis. PENYUSUNAN KURIKULUM" autocomplete="off"></label></div><p class="note" style="margin:0">Pilih akun pertama untuk sub komponen ini:</p>' : '') +
      '<div class="rd-bas"><div class="rd-bas-jenis" role="radiogroup" aria-label="Jenis belanja">' +
      jenis.map(function(j){ return '<label class="chk"><input type="radio" name="rdJenis" value="' + j + '"' + (j === pilih.jenis ? ' checked' : '') + '><span>' + esc(JENIS[j] || ('Akun ' + j)) + '</span></label>'; }).join('') + '</div>' +
      '<div class="rd-bas-daftar"><input type="search" id="rdCariAkun" placeholder="Cari kode atau nama akun" autocomplete="off"><div id="rdDaftarAkun" class="rd-bas-list" role="listbox" aria-label="Bagan Akun Standar"></div></div></div>' +
      '<p class="note" id="rdAkunPilih" style="margin:0">Belum ada akun dipilih.</p>' +
      (rekam ? '<div class="rd-hitung">' + fld('rdHeader', 'Header 1 (opsional)', 'mis. BELANJA BAHAN') + (sumberList.length > 1 ? '<label class="f" for="rdSD" style="flex:0 0 120px">Sumber dana<select id="rdSD">' + sumberList.map(function(x){ return '<option value="' + esc(x) + '">' + esc(sd(x)) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' +
        fld('rdUraian', 'Uraian detail pertama', 'mis. Belanja ATK') +
        '<div class="rd-hitung">' + fld('rdVol', 'Volume', '0', 'decimal') + fld('rdSat', 'Satuan', 'mis. PKT') + '<span class="rd-op">×</span>' + fld('rdHarga', 'Harga satuan', '0', 'decimal') + '<span class="rd-op">=</span><div class="f">Jumlah<output id="rdJml" class="rd-jml">0</output></div></div>' : '') +
      '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div><div class="tools"><button type="submit" class="btn primary">Ok</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  var gambar = function(){
    var q = pilih.q.toLowerCase(), l = bas.filter(function(a){ return a.kode.slice(0, 2) === pilih.jenis && (!q || (a.kode + ' ' + a.nama).toLowerCase().indexOf(q) >= 0); });
    $('rdDaftarAkun').innerHTML = l.length ? l.map(function(a){ return '<button type="button" role="option" data-akun="' + a.kode + '" aria-selected="' + (pilih.akun && pilih.akun.kode === a.kode) + '"><span class="code">' + a.kode + '</span>' + esc(a.nama) + '</button>'; }).join('') : '<p class="note" style="padding:8px">Tidak ada akun.</p>';
    [].forEach.call($('rdDaftarAkun').querySelectorAll('[data-akun]'), function(x){ x.onclick = function(){
      pilih.akun = bas.filter(function(a){ return a.kode === x.getAttribute('data-akun'); })[0];
      $('rdAkunPilih').innerHTML = 'Akun dipilih: <b>' + esc(pilih.akun.kode + ' ' + pilih.akun.nama) + '</b>' + (/^53/.test(pilih.akun.kode) ? ' · <span class="neg">pergeseran dari belanja barang ke modal perlu telaah</span>' : /^524/.test(pilih.akun.kode) ? ' · <span class="neg">pergeseran dari akun 52 lain ke 524 perlu telaah</span>' : '');
      gambar();
    }; });
  };
  gambar();
  [].forEach.call(document.querySelectorAll('#rdForm [name=rdJenis]'), function(x){ x.onchange = function(){ pilih.jenis = x.value; gambar(); }; });
  $('rdCariAkun').oninput = function(){ pilih.q = this.value.trim(); gambar(); };
  if (rekam){ var hitung = function(){ var v = angka($('rdVol').value), h = angka($('rdHarga').value); $('rdJml').textContent = v == null || h == null || isNaN(v) || isNaN(h) ? '—' : rp(Math.round(v * h)); }; $('rdVol').oninput = hitung; $('rdHarga').oninput = hitung; }
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  $('rdForm').onsubmit = function(e){
    e.preventDefault();
    var salah = function(m){ $('rdMsg').textContent = m; $('rdMsg').hidden = false; };
    var h = {};
    if (subBaru){
      h.kode = $('rdSubKode').value.trim().toUpperCase(); h.subN = $('rdSubN').value.trim();
      if (!/^[A-Z0-9]{1,4}$/.test(h.kode)) return salah('Kode sub komponen 1–4 huruf kapital/angka, mis. ZA.');
      if (h.subN.length < 3) return salah('Uraian sub komponen wajib diisi (minimal 3 karakter).');
      if (R.rows.some(function(r){ return r.ro === subBaru.ro && r.sub === subBaru.komp + '.' + h.kode; })) return salah('Kode ' + h.kode + ' sudah dipakai sub komponen lain di komponen ini.');
    }
    if (!pilih.akun) return salah('Pilih akun dari Bagan Akun Standar.');
    h.akun = pilih.akun;
    if (rekam){
      h.header = $('rdHeader').value.trim(); h.sumber = $('rdSD') ? $('rdSD').value : sumberList[0];
      h.uraian = $('rdUraian').value.trim(); h.volume = angka($('rdVol').value); h.satuan = $('rdSat').value.trim(); h.harga = angka($('rdHarga').value);
      if (h.header && h.header.length < 2) return salah('Uraian header minimal 2 karakter, atau kosongkan.');
      if (h.uraian.length < 2) return salah('Uraian detail wajib diisi (minimal 2 karakter).');
      if (h.volume == null || isNaN(h.volume) || h.volume < 0) return salah('Isi volume dengan angka (boleh desimal, mis. 0,5).');
      if (h.harga == null || isNaN(h.harga) || h.harga < 0) return salah('Isi harga satuan dengan angka.');
    }
    closeModal(); onOk(h);
  };
  setTimeout(function(){ ($('rdSubKode') || $('rdCariAkun')).focus(); }, 60);
}
/* ganti akun satu kelompok; bila akun tujuan sudah ada di sub komponen itu, detail dipindah ke ujung kelompok tujuan */
function gantiAkun(ang, a){
  urut();
  var c = ang[0], tujuan = R.rows.filter(function(r){ return ang.indexOf(r) < 0 && r.prog === c.prog && r.kro === c.kro && r.ro === c.ro && r.sub === c.sub && r.akun === a.kode; });
  ang.forEach(function(r){ r.akun = a.kode; r.akun_n = a.nama; });
  if (tujuan.length){
    var akhir = tujuan[tujuan.length - 1], i = R.rows.indexOf(akhir), n = R.rows.slice(i + 1).filter(function(r){ return ang.indexOf(r) < 0; })[0];
    var lo = akhir.urutan, hi = n ? n.urutan : akhir.urutan + ang.length + 1, step = (hi - lo) / (ang.length + 1);
    ang.forEach(function(r, k){ r.urutan = lo + step * (k + 1); });
    urut();
  }
}

/* Admin perencanaan: blokir manual pada detail yang tidak bertanda * di RKK */
function formBlokir(r){
  var i = blk(r);
  openModal('<div class="modal-hd"><div><span class="note">' + esc(r.akun + ' ' + (r.akun_n || '')) + '</span><h3>Ubah Blokir</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate><p style="margin:0"><b>' + esc(r.uraian) + '</b><br><span class="note">' + vol(r.volume) + ' ' + esc(r.satuan) + ' × Rp ' + rp(r.harga) + ' = Rp ' + rp(r.jumlah) + '</span></p>' +
    '<div class="rd-blokir"><label class="chk"><input type="checkbox" id="rdBlOn"' + (i.blokir ? ' checked' : '') + '><span>Blokir</span></label>' +
    '<input type="text" id="rdBlNilai" class="rd-blnilai" inputmode="decimal" value="' + (i.blokir ? rp(i.blokir) : '') + '" placeholder="nilai blokir"' + (i.blokir ? '' : ' disabled') + ' aria-label="Nilai blokir">' +
    '<button type="button" class="btn" id="rdBlPenuh">Blokir penuh</button></div>' +
    '<p class="note" style="margin:0">Blokir manual berlaku di LENTERA untuk TA ini: fakultas/unit melihat nilainya terkunci dan tidak dapat menggeser bagian yang diblokir. Hilangkan centang untuk melepas blokir manual.</p>' +
    '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div><div class="tools"><button type="submit" class="btn primary">Simpan blokir</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  $('rdBlOn').onchange = function(){ $('rdBlNilai').disabled = !this.checked; if (this.checked && !$('rdBlNilai').value) $('rdBlNilai').value = rp(r.jumlah); };
  $('rdBlPenuh').onclick = function(){ $('rdBlOn').checked = true; $('rdBlNilai').disabled = false; $('rdBlNilai').value = rp(r.jumlah); };
  $('rdForm').onsubmit = function(e){
    e.preventDefault();
    var salah = function(m){ $('rdMsg').textContent = m; $('rdMsg').hidden = false; };
    var n = $('rdBlOn').checked ? angka($('rdBlNilai').value) : 0;
    if (n == null || isNaN(n) || n < 0) return salah('Isi nilai blokir dengan angka.');
    n = Math.round(n);
    if (n > r.jumlah) return salah('Nilai blokir tidak boleh melebihi jumlah item (Rp ' + rp(r.jumlah) + ').');
    var tombol = this.querySelector('[type=submit]'); tombol.disabled = true;
    SB.aturBlokirManual(r.anggaran_id, n).then(function(){ return SB.blokirItem(R.u.versi.id); }).then(function(m){
      R.bl = m; closeModal(); toast(n ? 'Blokir manual Rp ' + rp(n) + ' dipasang pada "' + r.uraian + '".' : 'Blokir manual "' + r.uraian + '" dilepas.', 'ok', 'Blokir disimpan'); gambarUlang();
    }).catch(function(x){ tombol.disabled = false; salah(errMsg(x)); });
  };
}

/* ---------- perubahan pada salinan (di memori sampai Simpan) ---------- */
function urutanSetelah(r){ urut(); var i = R.rows.indexOf(r), n = R.rows[i + 1]; return n ? (r.urutan + n.urutan) / 2 : r.urutan + 1; }
function sisip(dasar, setelah, isi, judul, judul2, ganti){
  var r = {}; ['prog', 'prog_n', 'keg', 'keg_n', 'kro', 'kro_n', 'ro', 'ro_n', 'komp', 'komp_n', 'sub', 'sub_n', 'akun', 'akun_n', 'sumber', 'kategori', 'unit'].forEach(function(k){ r[k] = dasar[k]; });
  if (ganti) Object.keys(ganti).forEach(function(k){ r[k] = ganti[k]; });
  r.id = null; r.anggaran_id = null; r.blokir = false; r.judul = judul; r.judul2 = judul2;
  r.uraian = isi.uraian; r.volume = isi.volume; r.satuan = isi.satuan; r.harga = isi.harga; r.jumlah = Math.round(isi.volume * isi.harga);
  r.urutan = urutanSetelah(setelah); R.rows.push(r); urut();
  R.sel = { key: 'i' + R.rows.indexOf(r) }; R.kotor = true; gambarUlang();
}
function kosong(){ return { uraian: '', volume: null, satuan: '', harga: null, jumlah: 0, blokir: false }; }
function aksi(nama){
  var baris = susun(), b = barisTerpilih(baris); if (!b) return;
  if (nama === 'blokir'){ if (b.jenis === 'item') formBlokir(b.r); return; }
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), akhir = ang[ang.length - 1], konteks = b.r.akun + ' ' + (b.r.akun_n || '');
  if (nama === 'ubah' && b.jenis === 'sub') return formSub(b, ang);
  if (nama === 'ubah' && b.jenis === 'akun') return formAkun('Ganti Akun', 'Akun semula ' + konteks + ' · ' + ang.length + ' detail Rp ' + rp(b.j), false, [], function(h){
    if (h.akun.kode === b.r.akun) return; gantiAkun(ang, h.akun); R.sel = null; R.kotor = true; gambarUlang();
  });
  if (nama === 'subbaru'){
    /* sub komponen baru di komponen yang sama; diletakkan di ujung komponen */
    var kompRows = R.rows.filter(function(r){ return r.prog === b.r.prog && r.kro === b.r.kro && r.ro === b.r.ro && r.komp === b.r.komp; });
    var sbr = []; kompRows.forEach(function(r){ if (r.sumber && sbr.indexOf(r.sumber) < 0) sbr.push(r.sumber); });
    return formAkun('Rekam Sub Komponen', 'Komponen ' + b.r.komp + ' ' + (b.r.komp_n || ''), true, sbr, function(h){
      sisip(b.r, kompRows[kompRows.length - 1], h, h.header || '', '', { sub: b.r.komp + '.' + h.kode, sub_n: h.subN, akun: h.akun.kode, akun_n: h.akun.nama, sumber: h.sumber });
    }, { komp: b.r.komp, ro: b.r.ro });
  }
  if (nama === 'akun'){
    var sumber = []; ang.forEach(function(r){ if (r.sumber && sumber.indexOf(r.sumber) < 0) sumber.push(r.sumber); });
    if (!sumber.length) R.rows.forEach(function(r){ if (r.sumber && sumber.indexOf(r.sumber) < 0) sumber.push(r.sumber); });
    return formAkun('Rekam Akun', 'Sub komponen ' + b.kode + ' ' + (b.r.sub_n || ''), true, sumber, function(h){
      /* akun yang sudah ada di sub komponen ini: detail baru diletakkan di ujung kelompok akun itu */
      var ada = ang.filter(function(r){ return r.akun === h.akun.kode; });
      sisip(b.r, ada.length ? ada[ada.length - 1] : akhir, h, h.header || '', '', { akun: h.akun.kode, akun_n: h.akun.nama, sumber: h.sumber });
    });
  }
  if (nama === 'h1') formItem('Rekam Header 1', konteks, kosong(), 'Uraian Header 1', function(h){ sisip(b.r, akhir, h, h.header, ''); });
  else if (nama === 'h2') formItem('Rekam Header 2', konteks + ' · ' + b.r.judul, kosong(), 'Uraian Header 2', function(h){ sisip(b.r, akhir, h, b.r.judul, h.header); });
  else if (nama === 'det') formItem('Rekam Detail', konteks + (b.r.judul ? ' · ' + b.r.judul : '') + (b.r.judul2 ? ' · ' + b.r.judul2 : ''), kosong(), null,
    function(h){ sisip(b.r, b.jenis === 'item' ? b.r : akhir, h, b.r.judul, b.r.judul2); });
  else if (nama === 'ubah' && b.jenis === 'item'){
    var r = b.r;
    formItem('Ubah Detail', konteks, r, null, function(h){ r.uraian = h.uraian; r.volume = h.volume; r.satuan = h.satuan; r.harga = h.harga; r.jumlah = jumlahDari(r, R.basis[r.anggaran_id]); R.kotor = true; gambarUlang(); });
  }
  else if (nama === 'ubah') formHeader(b.jenis === 'h1' ? 'Ubah Header 1' : 'Ubah Header 2', konteks, b.n, function(v){
    ang.forEach(function(r){ if (b.jenis === 'h1') r.judul = v; else r.judul2 = v; }); R.sel = null; R.kotor = true; gambarUlang();
  });
  else if (nama === 'hapus'){
    var pesan = b.jenis === 'item' ? 'Detail "' + b.r.uraian + '" (Rp ' + rp(b.r.jumlah) + ') dihapus dari usulan.' : ang.length + ' detail di bawah header "' + b.n + '" (Rp ' + rp(b.j) + ') dihapus dari usulan.';
    tanya({ judul: b.jenis === 'item' ? 'Hapus detail?' : 'Hapus header beserta detailnya?', pesan: pesan + ' Perubahan baru tersimpan setelah Anda klik Simpan.', ya: 'Hapus', bahaya: true }).then(function(ya){
      if (!ya) return; R.rows = R.rows.filter(function(r){ return ang.indexOf(r) < 0; }); R.sel = null; R.kotor = true; gambarUlang();
    });
  }
}
function pulihkan(id){
  var b = R.basis[id]; if (!b) return;
  var r = {}; Object.keys(b).forEach(function(k){ r[k] = b[k]; }); r.anggaran_id = b.id; r.id = null;
  R.rows.push(r); urut(); R.kotor = true; gambarUlang();
}
function simpan(){
  if (!R.kotor || R.simpan) return;
  R.simpan = true; gambarUlang();
  var kirim = R.rows.map(function(r){ return { anggaran_id: r.anggaran_id, urutan: r.urutan, judul: r.judul || '', judul2: r.judul2 || '', uraian: r.uraian, volume: r.volume, satuan: r.satuan || '', harga: r.harga,
    prog: r.prog, kro: r.kro, ro: r.ro, komp: r.komp, sub: r.sub, sub_n: r.sub_n || '', akun: r.akun, sumber: r.sumber || '' }; });
  SB.simpanSalinan(R.u.id, kirim).then(function(x){
    R.simpan = false; R.kotor = false; lupakanUsulan();
    R.rows.forEach(function(r){ r.jumlah = jumlahDari(r, R.basis[r.anggaran_id]); });
    toast('Pagu usulan Rp ' + rp(x.pagu) + (x.selisih ? ' — selisih ' + tanda(x.selisih) + ' terhadap DIPA; usulan harus seimbang sebelum diajukan.' : ' — seimbang dengan DIPA.') + ' ' + x.perubahan + ' baris perubahan tercatat.', x.selisih ? 'warn' : 'ok', 'Usulan disimpan');
    gambarUlang();
  }).catch(function(e){ R.simpan = false; gambarUlang(); toast(errMsg(e), 'err', 'Usulan belum tersimpan'); });
}

/* ---------- interaksi ---------- */
function bind(){
  var pg = $('page'); if (!pg) return;
  if (R.posisi){
    var g = pg.querySelector('.rd-grid'), p = R.posisi; R.posisi = null;
    if (g){ g.scrollTop = p.g; g.scrollLeft = p.x; }
    window.scrollTo(0, p.y);
  }
  if ($('rdVersi')) $('rdVersi').onchange = function(){ R.dv = +this.value; R.rows = null; R.u = null; R.sel = null; refresh(); };
  if ($('rdUsulan')) $('rdUsulan').onchange = function(){
    var sel = this, m = +sel.value;
    var ganti = function(){ R.mode = m; R.kotor = false; R.rows = null; R.u = null; R.sel = null; refresh(); };
    if (R.kotor) tanya({ judul: 'Tinggalkan perubahan yang belum disimpan?', pesan: 'Perubahan pada Belanja Redesain akan hilang.', ya: 'Tinggalkan', bahaya: true }).then(function(ya){ if (ya) ganti(); else sel.value = R.mode; });
    else ganti();
  };
  [].forEach.call(pg.querySelectorAll('[data-rd-sel]'), function(el){
    var pilih = function(){ R.sel = { key: el.getAttribute('data-rd-sel') }; [].forEach.call(pg.querySelectorAll('.rd-grid tr.sel'), function(t){ t.classList.remove('sel'); }); el.classList.add('sel'); perbaruiAlat(); };
    el.onclick = pilih;
    el.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pilih(); } };
    el.ondblclick = function(){ pilih(); var t = pg.querySelector('[data-rd="ubah"]'); if (t && !t.disabled) aksi('ubah'); };
  });
  [].forEach.call(pg.querySelectorAll('[data-rd]'), function(el){ el.onclick = function(){
    var a = el.getAttribute('data-rd');
    if (a === 'simpan') simpan();
    else if (a === 'batal') tanya({ judul: 'Batalkan semua perubahan?', pesan: 'Belanja Redesain kembali ke kondisi terakhir yang disimpan.', ya: 'Batalkan perubahan', bahaya: true }).then(function(ya){ if (ya){ R.kotor = false; R.rows = null; R.u = null; R.posisi = null; refresh(); } });
    else aksi(a);
  }; });
  [].forEach.call(pg.querySelectorAll('[data-rd-pulih]'), function(el){ el.onclick = function(){ pulihkan(+el.getAttribute('data-rd-pulih')); }; });
}
/* tombol bilah alat diperbarui tanpa menggambar ulang tabel (tabel bisa ratusan baris) */
function perbaruiAlat(){
  var o = pilihan(susun()), pg = $('page');
  ['subbaru', 'akun', 'h1', 'h2', 'det', 'ubah', 'hapus', 'blokir'].forEach(function(k){ var t = pg.querySelector('[data-rd="' + k + '"]'); if (t) t.disabled = !o[k]; });
  var p = pg.querySelector('.rd-petunjuk'); if (p) p.textContent = o.ket;
}
