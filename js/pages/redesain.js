/* js/pages/redesain.js — Belanja Redesain (Monev Anggaran tahap 9/9b)
   - tanpa usulan aktif: lembar kerja DIPA (hanya lihat; Admin perencanaan dapat mengatur blokir manual)
   - dengan usulan aktif: edit salinan kerja usulan revisi
   Kolom Blokir seperti SAKTI: nilai blokir per item = RKK − FA Detail (blokir_item di database), dikunci;
   bagian yang diblokir tidak boleh digeser (jumlah ≥ blokir + realisasi).
   Susunan seperti RUH → Belanja Redesain di SAKTI: Program → Kegiatan → KRO → RO → Komponen → Sub komponen
   → Akun → Header 1 (">") → Header 2 (">>") → Detail. Pilih baris, lalu pakai tombol di bilah alat:
   Rekam Header 1 / Rekam Header 2 / Rekam Detail / Ubah / Hapus. Perubahan disimpan ke database lewat
   simpan_salinan (struktur & item terblokir dijaga di server; aturan revisi diperiksa saat diajukan). */
import { $, esc, rp, tgl, labelVersi, toast, tanya, errMsg } from '../utils.js?v=202611250255';
import { S, sess, isSuperAdmin, KODE_KL, KODE_IND } from '../state.js?v=202611250255';
import { card, openModal, closeModal } from '../ui-components.js?v=202611250255';
import { SB } from '../api.js?v=202611250255';
import { refresh } from '../nav.js?v=202611250255';
import { lupakanUsulan } from './usulan.js?v=202611250255';

var BISA_EDIT = ['draf', 'dikembalikan'], AKTIF = ['draf', 'diajukan', 'dikembalikan', 'disetujui'];
var R = { lihat: null, cekKey: {}, daftar: null, mode: null, u: null, rows: null, basis: null, bl: {}, rk: {}, bas: [], vs: null, dv: null, sel: null, kotor: false, memuat: false, err: null, simpan: false };
var ST = { draf: 'Draf', diajukan: 'Diajukan', dikembalikan: 'Dikembalikan', disetujui: 'Disetujui', diinput_sakti: 'Diinput SAKTI', selesai: 'Selesai', ditolak: 'Ditolak' };
var IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

window.addEventListener('beforeunload', function(e){ if (R.kotor){ e.preventDefault(); e.returnValue = ''; } });
/* dari detail usulan: buka langsung mode edit usulan itu */
/* dari Pengajuan Revisi / Kelola Usulan: lihat usulan apa pun yang boleh dibaca (hanya lihat bila statusnya tidak dapat diedit) */
document.addEventListener('lihat-redesain', function(e){ R.lihat = e.detail; R.mode = e.detail; R.daftar = null; R.u = null; R.rows = null; S.page = 'anggaran-rkk'; S.open = {}; refresh(); window.scrollTo(0, 0); });
document.addEventListener('edit-redesain', function(e){ R.lihat = null; R.mode = e.detail; R.daftar = null; R.u = null; R.rows = null; S.page = 'anggaran-rkk'; S.open = {}; refresh(); window.scrollTo(0, 0); });
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
  /* Super admin: semua usulan unit yang masih dapat diedit; pengguna lain: usulannya sendiri */
  return (R.daftar || []).filter(function(u){ return u.histori && AKTIF.indexOf(u.status) >= 0 && (isSuperAdmin() || u.dibuat_email === me) && bolehUbah(u); });
}
function bolehUbah(u){ return !!u && BISA_EDIT.indexOf(u.status) >= 0 && (u.dibuat_email === sess().email || isSuperAdmin()); }
function muatDaftar(){
  if (R.memuat) return; R.memuat = true; R.err = null;
  SB.usulanDaftar().then(function(l){
    R.daftar = l; R.memuat = false;
    var ada = usulanSaya();
    var dilihat = R.lihat && R.lihat === R.mode && l.some(function(u){ return u.id === R.lihat; });
    if (!dilihat) R.lihat = null;
    /* Super admin membuka lembar kerja DIPA lebih dulu (untuk blokir manual); usulan unit dipilih dari daftar */
    if (!dilihat && !ada.some(function(u){ return u.id === R.mode; })) R.mode = ada.length && !isSuperAdmin() ? ada[0].id : 'dipa';
    if (S.page === 'anggaran-rkk') refresh();
  }).catch(function(e){ R.memuat = false; R.daftar = []; R.mode = 'dipa'; R.err = errMsg(e); if (S.page === 'anggaran-rkk') refresh(); });
}
function muatSalinan(u){
  if (R.memuat) return; R.memuat = true; R.err = null;
  Promise.all([SB.salinan(u.id), SB.anggaranItem(u.versi_id), SB.blokirItem(u.versi_id), SB.realisasiKelompok(u.versi_id), SB.bagianAkun()]).then(function(r){
    R.u = u; R.rows = r[0]; R.cekKey = {}; R.clip = null; R.bl = r[2]; R.rk = r[3]; R.bas = r[4]; R.sel = null; R.kotor = false;
    /* usulan seluruh satker (kategori kosong): basis = seluruh DIPA */
    R.basis = {}; r[1].forEach(function(b){ if (u.kategori == null || (b.kategori === u.kategori && (b.unit || '') === (u.unit || ''))) R.basis[b.id] = b; });
    /* sub komponen baru yang tersimpan sebelum diurutkan (mis. BD di bawah CH): rapikan menurut kode saat dibuka;
       bila ada yang berpindah, tandai belum disimpan agar urutannya bisa disimpan (hanya untuk usulan yang dapat diedit) */
    if (bolehUbah(u)){
      urut();
      var sebelum = R.rows.slice(), nilaiLama = R.rows.map(function(x){ return x.urutan; });
      urutkanSubBaru();
      var pindah = R.rows.some(function(x, i){ return x !== sebelum[i]; });
      if (!pindah) sebelum.forEach(function(x, i){ x.urutan = nilaiLama[i]; });   /* posisi sudah benar: nilai urutan dibiarkan apa adanya */
      if (pindah){
        R.kotor = true; R.info = 'Urutan sub komponen baru dirapikan menurut kode (mis. BD tepat di bawah BC). Klik Simpan untuk menyimpan urutannya.';
      }
    }
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
  var ada = usulanSaya(), sa = isSuperAdmin(); if (ada.length < (sa ? 1 : 2)) return '';
  /* pilihan kecil di pojok kanan judul kartu */
  return '<label class="rd-tampil noprint" for="rdUsulan"><span>' + (sa ? 'Tampilan' : 'Usulan') + '</span><select id="rdUsulan">' +
    (sa ? '<option value="dipa"' + (R.mode === 'dipa' ? ' selected' : '') + '>Lembar kerja DIPA (lihat & blokir)</option>' : '') +
    ada.map(function(u){ return '<option value="' + u.id + '"' + (u.id === R.mode ? ' selected' : '') + '>' + esc(u.judul + ' · ' + (u.unit || u.kategori || 'Seluruh satker') + ' · ' + (ST[u.status] || u.status)) + '</option>'; }).join('') + '</select></label>';
}

/* ---------- susunan baris (seperti SAKTI) ---------- */
var TK = [
  { t: 'prog', k: function(r){ return r.prog; }, kode: function(r){ return KODE_KL + '.' + r.prog; }, n: function(r){ return r.prog_n; } },
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
/* jumlah minimal detail: blokir + realisasi (item berblokir) atau realisasi (detail yang sudah terealisasi) */
function minimal(r){ var i = blk(r); return i.blokir > 0 ? i.blokir + i.realisasi : i.realisasi; }
/* realisasi sub komponen / kelompok menurut struktur DIPA asal item (bukan kode yang sedang diedit) */
function realSub(rows){ var k = {}, n = 0; rows.forEach(function(r){ var b = R.basis[r.anggaran_id]; if (b) k[[b.prog, b.kro, b.ro, b.sub].join('|')] = 1; }); Object.keys(k).forEach(function(x){ n += R.rk[x] || 0; }); return n; }
function realKel(rows){ var k = {}, n = 0; rows.forEach(function(r){ var b = R.basis[r.anggaran_id]; if (b) k[[b.prog, b.kro, b.ro, b.sub, b.akun].join('|')] = 1; }); Object.keys(k).forEach(function(x){ n += R.rk[x] || 0; }); return n; }
/* kotak centang hapus: detail yang boleh dihapus (bukan item berblokir, bukan akun 51 untuk unit) */
var LV_CEK = ['sub', 'akun', 'h1', 'h2', 'item'];
function bisaDicentang(r){ var i = blk(r); return !i.blokir && !i.realisasi && !kunci51(r); }
function dicentang(){ return R.rows.filter(function(r){ return r._hapus; }); }
function sd(s){ return s === 'PNP' ? 'PNBP' : s === 'RM' ? 'RM' : (s || ''); }
function kunci51(r){ return sess().role === 'UNIT' && /^51/.test(r.akun); }

/* ---------- halaman ---------- */
export function renderRedesain(){
  if (!R.daftar){ muatDaftar(); return '<div class="loading">Memuat Belanja Redesain…</div>'; }
  var u = R.mode === 'dipa' ? null : (R.daftar || []).filter(function(x){ return x.id === R.mode; })[0];
  if (R.mode !== 'dipa' && !u) R.mode = 'dipa';
  if (R.err) return '<div class="page-sec grid">' + card('rd', 'Belanja Redesain', '', '<p class="note">' + esc(R.err) + '</p>', '<div class="rd-act">' + barMode() + '</div>') + '</div>' + ikat();
  if (!u){
    if (!R.rows || !R.u || !R.u.dipa || R.u.versi.id !== R.dv){ muatDipa(); return '<div class="loading">Memuat Belanja Redesain…</div>'; }
  } else if (!R.rows || !R.u || R.u.id !== u.id){ muatSalinan(u); return '<div class="loading">Memuat ' + esc(u.judul) + '…</div>'; }
  var dipa = !u, ubah = !dipa && bolehUbah(u), baris = susun(), sel = pilihan(baris);
  var adaKey = {}; baris.forEach(function(x){ adaKey[x.key] = 1; }); Object.keys(R.cekKey).forEach(function(k){ if (!adaKey[k]) delete R.cekKey[k]; });
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
    sub = esc((u.unit || u.kategori || 'Seluruh satker') + ' · basis DIPA – Revisi ke ' + ((u.revisi_ke || 1) - 1) + ' · TA ' + u.tahun) + '. Baris kuning = diubah, hijau = baru.';
    ring = '<div class="rd-ring"><div><span class="note">Pagu usulan</span><b>Rp ' + rp(pagu) + '</b></div><div><span class="note">Pagu DIPA unit</span><b>Rp ' + rp(u.pagu_awal) + '</b></div>' +
      '<div><span class="note">Selisih</span><b class="' + (selisih ? 'neg' : 'pos') + '">' + (selisih ? tanda(selisih) : 'Rp 0 · seimbang') + '</b></div>' +
      '<div><span class="note">Diblokir</span><b>Rp ' + rp(totBl) + '</b></div>' +
      '<div><span class="note">Status</span><b>' + esc(ST[u.status] || u.status) + (R.kotor ? ' · <span class="neg">belum disimpan</span>' : '') + '</b></div></div>';
    if (R.lihat === u.id) act = '<div class="tools"><button class="btn" type="button" data-rd-kembali="' + u.id + '">‹ Kembali ke pengajuan</button><button class="btn" type="button" data-rd-tutup>Tutup</button></div>';
    alat = !ubah ? '<div class="status-box us-telaah">' + esc(u.judul) + ' berstatus ' + esc(ST[u.status] || u.status) + ': hanya dapat dilihat. Baris kuning = diubah, hijau = baru; detail yang dihapus tercantum di bawah lembar kerja.</div>' :
      '<div class="rd-alat noprint" role="toolbar" aria-label="Alat Belanja Redesain">' +
        '<span class="rd-kiri" id="rdKiri">' + htmlKiri(sel) + '</span><span class="rd-sp"></span>' +
        (R.info ? '<span class="rd-info" role="status">' + esc(R.info) + '</span>' : '') +
        '<span class="rd-kanan">' + tb('ubah', 'Ubah', sel.ubah) +
          '<button class="btn" type="button" data-rd="copy" title="Copy sub komponen / akun / header beserta isinya"' + (sel.copy ? '' : ' disabled') + '>Copy</button>' +
          '<button class="btn" type="button" data-rd="paste" title="' + esc(R.clip ? 'Tempel: ' + R.clip.label : 'Belum ada yang dicopy') + '"' + (sel.paste ? '' : ' disabled') + '>Paste</button>' +
          '<button class="btn" type="button" data-rd="hapus"' + (sel.hapus || dicentang().length ? '' : ' disabled') + '>' + labelHapus() + '</button></span>' +
        '<span class="rd-pisah" aria-hidden="true"></span>' +
        (function(){ var n = dihapus().length; return n ? '<button class="btn rd-btn-dihapus" type="button" data-rd="dihapus" title="Lihat & kembalikan detail DIPA yang dihapus">Dihapus (' + n + ')</button>' : ''; })() +
        '<button class="btn" type="button" data-rd="batal"' + (R.kotor ? '' : ' disabled') + '>Batalkan perubahan</button>' +
        '<button class="btn primary' + (R.kotor && !R.simpan ? ' rd-perlu-simpan' : '') + '" type="button" data-rd="simpan"' + (R.kotor && !R.simpan ? '' : ' disabled') + '>' + (R.simpan ? 'Menyimpan…' : 'Simpan') + '</button></div>' +
        (R.clip ? '<p class="note rd-clip">Dicopy: <b>' + esc(R.clip.label) + '</b> · pilih baris tujuan lalu klik <b>Paste</b>. <button type="button" class="rd-clip-x" data-rd="lepascopy" aria-label="Batalkan copy">✕</button></p>' : '') +
        '<p class="note rd-petunjuk"' + (sel.ket || sel.ketPaste ? '' : ' hidden') + '>' + esc([sel.ket, sel.ketPaste].filter(Boolean).join(' · ')) + '</p>';
  }
  /* jumlah blokir per baris kepala */
  /* kolom Selisih (mode usulan): per item = jumlah usulan − jumlah DIPA; baris kepala = total selisih di bawahnya,
     termasuk detail yang dihapus (−jumlah DIPA di lokasi lamanya) dan item yang dipindah sub komponen/akun */
  var selK = {}, tambahSel = function(ks, n){ if (n) ks.forEach(function(k){ selK[k] = (selK[k] || 0) + n; }); };
  if (!dipa){
    R.rows.forEach(function(r){ var b = R.basis[r.anggaran_id]; tambahSel(jalur(r), r.jumlah); if (b) tambahSel(jalur(b), -b.jumlah); });
    dihapus().forEach(function(b){ tambahSel(jalur(b), -b.jumlah); });
  }
  var selItem = function(r){ var b = R.basis[r.anggaran_id]; return r.jumlah - (b ? b.jumlah : 0); };
  var selTd = function(n){ return dipa ? '' : '<td class="n rd-sel' + (n > 0 ? ' pos' : n < 0 ? ' neg' : '') + '">' + (n ? tanda(n) : '') + '</td>'; };
  var blK = {}; R.rows.forEach(function(r){ var n = blk(r).blokir; if (n) jalur(r).forEach(function(k){ blK[k] = (blK[k] || 0) + n; }); });
  var IND = 7;
  var grid = '<div class="tbl rd-grid"><table><colgroup><col class="c-kode"><col><col class="c-n"><col class="c-sat"><col class="c-rp"><col class="c-rp">' + (dipa ? '' : '<col class="c-rp">') + '<col class="c-rp c-bl"><col class="c-sd">' + (ubah ? '<col class="c-cek">' : '') + '</colgroup>' +
    '<thead><tr><th>Kode</th><th>Uraian</th><th class="n">Vol</th><th>Sat</th><th class="n">Harga</th><th class="n">Jumlah</th>' + (dipa ? '' : '<th class="n" title="Jumlah usulan − jumlah DIPA">Selisih</th>') + '<th class="n" title="Nilai blokir · * = blokir dari RKK SAKTI · M = blokir manual Admin perencanaan">Blokir</th><th title="Sumber dana">SD</th>' + (ubah ? '<th class="rd-cek" title="Centang untuk dihapus">Hapus</th>' : '') + '</tr></thead><tbody>' +
    baris.map(function(b){
      var on = R.sel && R.sel.key === b.key ? ' sel' : '';
      if (b.jenis !== 'item') return '<tr class="rd-' + b.jenis + on + (R.clip && R.clip.key === b.key ? ' rd-dicopy' : '') + '" data-rd-sel="' + esc(b.key) + '" tabindex="0"><td class="code" style="padding-left:' + (KODE_IND[b.jenis] || 6) + 'px">' + esc(b.kode) + '</td><td class="rd-u">' + (b.jenis === 'h1' ? '&gt; ' : b.jenis === 'h2' ? '&gt;&gt; ' : '') + esc(b.n || '') + '</td><td></td><td></td><td></td><td class="n">' + rp(b.j) + '</td>' + selTd(selK[b.key] || 0) +
        '<td class="n rd-bl">' + (blK[b.key] ? rp(blK[b.key]) : '') + '</td><td class="rd-sd">' + (b.jenis === 'akun' ? sd(b.r.sumber) : '') + '</td>' + (ubah ? kotak(b) : '') + '</tr>';
      var r = b.r, st = dipa ? '' : statusItem(r), i = blk(r);
      return '<tr class="rd-item' + (st ? ' rd-' + st : '') + on + '" data-rd-sel="' + b.key + '" tabindex="0"><td class="code">' + (st === 'baru' ? 'baru' : st === 'ubah' ? 'ubah' : '') + '</td><td class="rd-u">- ' + esc(r.uraian) + '</td>' +
        '<td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n"' + (!dipa && R.basis[r.anggaran_id] && R.basis[r.anggaran_id].jumlah !== r.jumlah ? ' title="Jumlah DIPA Rp ' + rp(R.basis[r.anggaran_id].jumlah) + '"' : '') + '>' + rp(r.jumlah) + '</td>' + selTd(dipa ? 0 : selItem(r)) +
        '<td class="n rd-bl"' + (i.blokir ? ' title="' + (i.manual ? 'Blokir manual Admin perencanaan' : 'Blokir dari RKK SAKTI') + '"' : '') + '>' + (i.blokir ? rp(i.blokir) + '<span class="rd-t">' + (i.manual ? 'M' : '*') + '</span>' : '') + '</td><td class="rd-sd">' + sd(r.sumber) + '</td>' + (ubah ? kotak(b) : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
  var hapus = dipa ? [] : dihapus();
  /* tabel "Detail yang dihapus" tidak lagi ditampilkan di bawah lembar kerja (detail terhapus tetap tercatat di
     baris perubahan, Matriks & selisih); kode kartunya disimpan bila kelak diperlukan lagi */
  var daftarHapus = true ? '' : card('rd-hapus', 'Detail yang dihapus (' + hapus.length + ')', 'Detail DIPA yang tidak ada lagi di usulan ini.',
    '<div class="tbl"><table><thead><tr><th>Akun</th><th>Uraian</th><th class="n">Jumlah DIPA</th><th></th></tr></thead><tbody>' +
    hapus.map(function(b){ return '<tr><td class="code">' + esc(b.akun) + '</td><td>' + esc(b.uraian) + '</td><td class="n">' + rp(b.jumlah) + '</td><td>' + (ubah ? '<button class="btn" type="button" data-rd-pulih="' + b.id + '">Kembalikan</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>', '');
  /* ringkasan pagu jadi footer tetap di bawah lembar kerja; pilihan Tampilan kecil di pojok kanan */
  ring = ring.replace('class="rd-ring"', 'class="rd-ring rd-foot"');
  /* footer ringkasan: bilah tipis menempel di bawah layar (di luar kartu agar position:fixed tidak terkurung) */
  /* kepala (judul + Tampilan + bilah tombol) menempel di bawah navbar saat digulir, dibuat ringkas */
  var kepala = '<div class="rd-kepala"><div class="card-h"><div><h2>' + judul + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
    '<div class="rd-act">' + act + barMode() + '</div></div>' + alat + '</div>';
  return '<div class="page-sec grid"><section class="glass card rd-card" id="rd">' + kepala + grid +
    '<p class="note rd-ket">* = blokir dari RKK SAKTI (nilai = RKK − FA Detail posisi terakhir) · M = blokir manual Admin perencanaan · SD = sumber dana (RM / PNBP).</p></section>' + daftarHapus + '</div>' + ring + ikat();
}
/* gambar ulang tanpa kehilangan posisi: gulir halaman & gulir tabel dicatat lalu dikembalikan di bind() */
function gambarUlang(){
  var g = document.querySelector('.rd-grid');
  R.posisi = { y: window.scrollY, g: g ? g.scrollTop : 0, x: g ? g.scrollLeft : 0 };
  refresh();
}
function labelHapus(){ var n = dicentang().length; return n ? 'Hapus (' + n + ' dicentang)' : 'Hapus'; }
/* kotak centang per baris: mencentang suatu level menyeleksi level itu & semua di bawahnya;
   mencentang detail hanya menyeleksi detail itu (induknya tidak ikut tercentang) */
function dicentangLangsung(key){ return Object.keys(R.cekKey).some(function(k){ return key === k || key.indexOf(k + '¦') === 0; }); }
function kotak(b){
  if (LV_CEK.indexOf(b.jenis) < 0) return '<td class="rd-cek"></td>';
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), bisa = ang.filter(bisaDicentang);
  if (!bisa.length) return '<td class="rd-cek"><input type="checkbox" disabled title="' + (ang.some(function(r){ return blk(r).blokir; }) ? 'Item berblokir tidak dapat dihapus' : ang.some(function(r){ return blk(r).realisasi; }) ? 'Detail yang sudah terealisasi tidak dapat dihapus' : 'Dikunci') + '" aria-label="Tidak dapat dihapus"></td>';
  var on = b.jenis === 'item' ? !!b.r._hapus : dicentangLangsung(b.key);
  return '<td class="rd-cek"><input type="checkbox" data-rd-cek="' + esc(b.key) + '"' + (on ? ' checked' : '') +
    ' aria-label="Tandai untuk dihapus: ' + esc(b.jenis === 'item' ? b.r.uraian : (b.kode + ' ' + (b.n || ''))) + '"' + (bisa.length < ang.length ? ' title="Item berblokir / sudah terealisasi di dalamnya tidak ikut dihapus"' : '') + '></td>';
}
/* centang/lepas: level kepala menyeleksi semua detail di bawahnya; melepas detail melepas centang induknya */
function centang(key, on){
  var b = susun().filter(function(x){ return x.key === key; })[0]; if (!b) return;
  if (b.jenis === 'item'){
    b.r._hapus = on;
    /* detail dilepas: induk yang tadinya dicentang langsung ikut dilepas */
    if (!on) jalur(b.r).forEach(function(k){ delete R.cekKey[k]; });
  } else {
    Object.keys(R.cekKey).forEach(function(k){ if (k === key || k.indexOf(key + '¦') === 0 || (!on && key.indexOf(k + '¦') === 0)) delete R.cekKey[k]; });
    if (on) R.cekKey[key] = true;
    anggota(b).filter(bisaDicentang).forEach(function(r){ r._hapus = on; });
  }
}
function hapusTanda(){
  var t = dicentang(), n = t.reduce(function(a, r){ return a + r.jumlah; }, 0);
  tanya({ judul: 'Hapus ' + t.length + ' detail yang dicentang?', pesan: t.length + ' detail senilai Rp ' + rp(n) + ' dihapus dari usulan, termasuk sub komponen, akun, atau header yang tidak lagi berisi detail. Perubahan baru tersimpan setelah Anda klik Simpan.', ya: 'Hapus', bahaya: true }).then(function(ya){
    if (!ya) return; R.rows = R.rows.filter(function(r){ return !r._hapus; }); R.cekKey = {}; R.sel = null; R.kotor = true; gambarUlang();
  });
}
function tb(id, t, aktif){ return '<button class="btn" type="button" data-rd="' + id + '"' + (aktif ? '' : ' disabled') + '>' + t + '</button>'; }
function ikat(){ setTimeout(bind, 0); return ''; }

/* ---------- pilihan baris → tombol yang aktif ---------- */
function barisTerpilih(baris){ return R.sel ? baris.filter(function(b){ return b.key === R.sel.key; })[0] || null : null; }
/* anggota (detail) di bawah satu baris kepala */
function anggota(b){ return R.rows.filter(function(r){ return jalur(r)[b.d] === b.key; }); }
function pilihan(baris){
  var dipa = R.u && R.u.dipa;
  var o = { copy: false, paste: false, subbaru: false, akun: false, h1: false, h2: false, det: false, ubah: false, hapus: false, blokir: false,
    ket: dipa ? 'Pilih detail untuk mengatur blokir manual.' : '' };
  var b = barisTerpilih(baris); if (!b) return o;
  if (!dipa){
    o.copy = ['sub', 'akun', 'h1', 'h2'].indexOf(b.jenis) >= 0 && !(b.jenis === 'akun' && kunci51(b.r));
    o.paste = !!(R.clip && tujuanPaste(b));
    if (R.clip && !o.paste) o.ketPaste = ketPaste();
  }
  if (dipa){
    if (b.jenis !== 'item') o.ket = 'Blokir diatur per detail: pilih baris detail.';
    else if (b.r.blokir) o.ket = 'Blokir "' + b.r.uraian + '" berasal dari RKK SAKTI (Rp ' + rp(blk(b.r).blokir) + ') dan dikunci.';
    else { o.blokir = true; o.ket = 'Detail: ' + b.r.uraian + (blk(b.r).blokir ? ' · blokir manual Rp ' + rp(blk(b.r).blokir) : ''); }
    return o;
  }
  if (kunci51(b.r)){ o.ket = 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.'; return o; }
  var ang = b.jenis === 'item' ? [b.r] : anggota(b), adaH1 = ang.some(function(r){ return r.judul; }), adaH2 = ang.some(function(r){ return r.judul2; });
  var adaBl = ang.some(function(r){ return blk(r).blokir > 0; }), adaReal = ang.some(function(r){ return blk(r).realisasi > 0; }), bisaHapus = ang.length && !adaBl && !adaReal;
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
  else if (b.jenis === 'h1'){ o.h2 = true; o.det = !adaH2; o.ubah = !adaBl; o.hapus = bisaHapus; o.ket = 'Header 1: ' + b.n + (adaH2 ? ' — pilih Header 2 untuk merekam detail.' : '') + (adaBl ? ' · memuat item berblokir (header tidak dapat diubah/dihapus).' : adaReal ? ' · memuat detail yang sudah terealisasi (header tidak dapat dihapus).' : ''); }
  else if (b.jenis === 'h2'){ o.det = true; o.ubah = !adaBl; o.hapus = bisaHapus; o.ket = 'Header 2: ' + b.n + (adaBl ? ' · memuat item berblokir (header tidak dapat diubah/dihapus).' : adaReal ? ' · memuat detail yang sudah terealisasi (header tidak dapat dihapus).' : ''); }
  else if (b.jenis === 'item'){
    var i = blk(b.r);
    o.det = true; o.ubah = !penuh(b.r); o.hapus = !i.blokir && !i.realisasi;
    o.ket = penuh(b.r) ? 'Item diblokir penuh (Rp ' + rp(i.blokir) + '): tidak dapat diubah atau dihapus.' :
      i.blokir ? 'Blokir Rp ' + rp(i.blokir) + ' · realisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal Rp ' + rp(minimal(b.r)) + '. Item berblokir tidak dapat dihapus.' :
      i.realisasi ? 'Detail: ' + b.r.uraian + ' · sudah terealisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal Rp ' + rp(i.realisasi) + '. Detail yang sudah terealisasi tidak dapat dihapus.' : 'Detail: ' + b.r.uraian;
  }
  else o.ket = 'Pada tingkat ini belum ada perubahan yang bisa dilakukan; pilih akun, header, atau detail.';
  return o;
}

/* ---------- jendela isian (Form R/U/H Item & Form Rekam Header) ---------- */
/* rincian volume di uraian detail, seperti SAKTI: "Biaya Kebutuhan Tamu [95 Org x 4 Kali x 12 Bulan]"
   → volume = 95 × 4 × 12 = 4.560. Diambil dari kurung siku terakhir; pemisah x / × / *. */
function namaInti(t){ return String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function rincianVolume(uraian){
  var m = String(uraian || '').match(/\[([^\[\]]*)\][^\[\]]*$/); if (!m) return null;
  var bagian = m[1].split(/\s*[x×*]\s*(?=\d)/i), angkaL = [], hasil = 1;
  for (var i = 0; i < bagian.length; i++){
    var t = bagian[i].trim().match(/^(\d[\d.,]*)\s*(.*)$/); if (!t) return null;
    var n = angka(t[1]); if (n == null || isNaN(n)) return null;
    angkaL.push(t[1]); hasil *= n;
  }
  return angkaL.length ? { volume: Math.round(hasil * 10000) / 10000, rumus: angkaL.join(' × ') } : null;
}
/* hubungkan uraian ↔ volume: mengetik rincian dalam [ ] langsung mengisi Volume; beda → tampilkan tombol Terapkan */
function pasangRincian(hitung){
  var u = $('rdUraian'), v = $('rdVol'), k = $('rdRinci'); if (!u || !v || !k) return;
  var tampil = function(otomatis){
    var x = rincianVolume(u.value);
    if (!x){ k.hidden = true; return; }
    if (otomatis && !u.disabled){ v.value = vol(x.volume); hitung(); }
    var sama = angka(v.value) === x.volume;
    k.innerHTML = 'Rincian volume: ' + esc(x.rumus) + ' = <b>' + vol(x.volume) + '</b>' + (sama ? ' ✓' : ' · Volume saat ini ' + esc(v.value || '0') + ' <button type="button" class="btn" id="rdRinciPakai">Gunakan ' + vol(x.volume) + '</button>');
    k.hidden = false;
    var b = $('rdRinciPakai'); if (b) b.onclick = function(){ v.value = vol(x.volume); hitung(); tampil(false); };
  };
  u.addEventListener('input', function(){ tampil(true); });
  v.addEventListener('input', function(){ tampil(false); });
  tampil(false);
}
function formItem(judul, sub, r, header, onOk){
  var fld = function(id, lbl, v, ph, mode){ return '<label class="f" for="' + id + '">' + lbl + '<input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '" placeholder="' + (ph || '') + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' autocomplete="off"></label>'; };
  openModal('<div class="modal-hd"><div><span class="note">' + esc(sub) + '</span><h3>' + esc(judul) + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate>' +
      /* baris 1: (header) + uraian; baris 2: volume × satuan × harga = jumlah · blokir */
      '<div class="rd-baris1">' + (header ? fld('rdHeader', header, '', 'uraian header') : '') + (r ? fld('rdUraian', 'Uraian detail', r.uraian, 'mis. Honor Sopir') : '') + '</div>' +
      (r ? '<div class="rd-hitung">' + fld('rdVol', 'Volume', vol(r.volume), '0', 'decimal') + fld('rdSat', 'Satuan', r.satuan, 'mis. OK') + '<span class="rd-op">×</span>' +
        fld('rdHarga', 'Harga satuan', r.harga == null ? '' : rp(r.harga), '0', 'decimal') + '<span class="rd-op">=</span><div class="f rd-f-jml">Jumlah<output id="rdJml" class="rd-jml">' + rp(r.jumlah || 0) + '</output></div>' +
        (function(){ var i = blk(r); return '<div class="f rd-f-bl">Blokir<span class="rd-blokir"><input type="checkbox" disabled' + (i.blokir ? ' checked' : '') + ' aria-label="Blokir">' +
          '<input type="text" class="rd-blnilai" value="' + rp(i.blokir) + '" disabled aria-label="Nilai blokir"></span></div>'; })() + '</div>' +
        (function(){ var i = blk(r); return !i.blokir && i.realisasi ? '<p class="note rd-blket">Detail ini sudah terealisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal <b>Rp ' + rp(i.realisasi) + '</b>; tidak dapat dihapus.</p>' : i.blokir ? '<p class="note rd-blket">Blokir dikunci' + (i.manual ? ' (blokir manual Admin perencanaan)' : ' (RKK SAKTI)') + '. Realisasi Rp ' + rp(i.realisasi) + ' → jumlah minimal <b>Rp ' + rp(i.blokir + i.realisasi) + '</b>. Nama detail dikunci; rincian volume dalam [ ] boleh diubah.</p>' : ''; })() : '') +
      (r ? '<p class="note rd-rinci" id="rdRinci" hidden></p>' : '') +
      '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div>' +
      '<div class="tools"><button type="submit" class="btn primary">Ok</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  var f = $('rdForm');
  var hitung = function(){ if (!$('rdJml')) return; var v = angka($('rdVol').value), h = angka($('rdHarga').value); $('rdJml').textContent = v == null || h == null || isNaN(v) || isNaN(h) ? '—' : rp(Math.round(v * h)); };
  if ($('rdVol')){ $('rdVol').oninput = hitung; $('rdHarga').oninput = hitung; pasangRincian(hitung); }
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
        /* item berblokir: nama detail dikunci, yang boleh diubah hanya rincian volume dalam [ ] (sama dengan fn_norm di server) */
        if (namaInti(hasil.uraian) !== namaInti(r.uraian)) return salah('Item berblokir: nama detail "' + r.uraian.replace(/\s*\[[^\]]*\]/g, '') + '" tidak dapat diubah. Yang boleh diubah hanya rincian volume di dalam tanda kurung [ ].');
        var baru = jumlahDari({ volume: hasil.volume, harga: hasil.harga }, R.basis[r.anggaran_id]);
        if (baru < bi.blokir + bi.realisasi) return salah('Ditolak: jumlah menjadi Rp ' + rp(baru) + ', di bawah batas minimal Rp ' + rp(bi.blokir + bi.realisasi) + ' (blokir Rp ' + rp(bi.blokir) + ' + realisasi Rp ' + rp(bi.realisasi) + '). Bagian yang diblokir tidak dapat digeser.');
      }
      else if (bi.realisasi){
        var baruR = jumlahDari({ volume: hasil.volume, harga: hasil.harga }, R.basis[r.anggaran_id]);
        if (baruR < bi.realisasi && baruR < (R.basis[r.anggaran_id] ? R.basis[r.anggaran_id].jumlah : 0)){ return salah('Ditolak: jumlah menjadi Rp ' + rp(baruR) + ', di bawah realisasi detail ini Rp ' + rp(bi.realisasi) + '. Detail yang sudah terealisasi tidak boleh lebih kecil dari realisasinya.'); }
      }
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
  setTimeout(function(){ var x = $('rdHeader'); if (x) x.focus(); }, 60);
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
  setTimeout(function(){ var x = $('rdSubKode'); if (x) x.focus(); }, 60);
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
      (rekam ? '<div class="rd-baris1">' + fld('rdHeader', 'Header 1 (opsional)', 'mis. BELANJA BAHAN') + fld('rdUraian', 'Uraian detail pertama', 'mis. Belanja ATK') +
        (sumberList.length > 1 ? '<label class="f rd-f-sd" for="rdSD">Sumber dana<select id="rdSD">' + sumberList.map(function(x){ return '<option value="' + esc(x) + '">' + esc(sd(x)) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' +
        '<div class="rd-hitung">' + fld('rdVol', 'Volume', '0', 'decimal') + fld('rdSat', 'Satuan', 'mis. PKT') + '<span class="rd-op">×</span>' + fld('rdHarga', 'Harga satuan', '0', 'decimal') + '<span class="rd-op">=</span><div class="f">Jumlah<output id="rdJml" class="rd-jml">0</output></div></div>' : '') +
      (rekam ? '<p class="note rd-rinci" id="rdRinci" hidden></p>' : '') +
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
  if (rekam){ var hitung = function(){ var v = angka($('rdVol').value), h = angka($('rdHarga').value); $('rdJml').textContent = v == null || h == null || isNaN(v) || isNaN(h) ? '—' : rp(Math.round(v * h)); }; $('rdVol').oninput = hitung; $('rdHarga').oninput = hitung; pasangRincian(hitung); }
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
  setTimeout(function(){ var x = $('rdSubKode') || $('rdCariAkun'); if (x) x.focus(); }, 60);
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
    '<p class="note" style="margin:0">Blokir manual berlaku di LANTERA untuk TA ini: fakultas/unit melihat nilainya terkunci dan tidak dapat menggeser bagian yang diblokir. Hilangkan centang untuk melepas blokir manual.</p>' +
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
  R.sel = { key: 'i' + R.rows.indexOf(r) }; R.kotor = true; R.fokus = true;
  R.info = (ganti && ganti.sub && ganti.sub !== dasar.sub ? 'Sub komponen ' + ganti.sub.split('.').pop() + ' ditambahkan' :
            ganti && ganti.akun && ganti.akun !== dasar.akun ? 'Akun ' + ganti.akun + ' ditambahkan' :
            judul2 && judul2 !== dasar.judul2 ? 'Header 2 ditambahkan' : judul && judul !== dasar.judul ? 'Header 1 ditambahkan' : 'Detail ditambahkan') +
           ': "' + r.uraian + '". Klik Simpan untuk menyimpan.';
  gambarUlang();
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
/* jendela "Detail yang dihapus": daftar detail DIPA yang tidak ada lagi di usulan + tombol Kembalikan */
function bukaDihapus(){
  var hp = dihapus(), u = R.u, bisa = u && !u.dipa && bolehUbah(u);
  if (!hp.length){ closeModal(); return; }
  var tot = hp.reduce(function(a, b){ return a + b.jumlah; }, 0);
  openModal('<div class="modal-hd"><div><span class="note">' + esc(u.judul || '') + '</span><h3>Detail yang dihapus (' + hp.length + ')</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<div class="rd-form"><p class="note" style="margin:0">Detail DIPA yang tidak ada lagi di usulan ini, total Rp ' + rp(tot) + '. Klik <b>Kembalikan</b> untuk memulihkannya ke lembar kerja (lalu Simpan).</p>' +
    '<div class="tbl"><table><thead><tr><th>Kode</th><th>Uraian</th><th class="n">Jumlah DIPA</th><th></th></tr></thead><tbody>' +
    hp.map(function(b){ var p = String(b.sub || '').split('.'); return '<tr><td class="code">' + esc(p[p.length - 1] + ' · ' + b.akun) + '</td><td>' + esc(b.uraian) + (b.judul ? '<br><span class="note">' + esc(b.judul) + '</span>' : '') + '</td><td class="n">' + rp(b.jumlah) + '</td><td>' +
      (bisa ? '<button class="btn" type="button" data-rd-kembali-item="' + b.id + '">Kembalikan</button>' : '') + '</td></tr>'; }).join('') +
    '</tbody></table></div><div class="tools"><button type="button" class="btn" data-modal-close>Tutup</button></div></div>');
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  [].forEach.call(document.querySelectorAll('#modal [data-rd-kembali-item]'), function(x){ x.onclick = function(){ closeModal(); pulihkan(+x.getAttribute('data-rd-kembali-item')); }; });
}
/* ===== Salin Sub Komponen / Akun / Header beserta isinya (detail salinan = detail baru) ===== */
/* saran kode sub komponen yang belum dipakai di RO + komponen itu: lanjutan kode dua huruf tertinggi, mis. AE → AF */
function saranKode(ro, komp){
  var pakai = {}, cek = function(r){ if (r.ro === ro && r.komp === komp) pakai[String(r.sub || '').split('.').pop()] = 1; };
  R.rows.forEach(cek); Object.keys(R.basis).forEach(function(id){ cek(R.basis[id]); });
  var H = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', semua = [];
  for (var i = 0; i < 26; i++) for (var j = 0; j < 26; j++) semua.push(H[i] + H[j]);
  var maks = -1; semua.forEach(function(k, x){ if (pakai[k]) maks = x; });
  for (var n = maks + 1; n < semua.length; n++) if (!pakai[semua[n]]) return semua[n];
  for (n = 0; n < semua.length; n++) if (!pakai[semua[n]]) return semua[n];
  return '';
}
/* tombol Rekam di kiri bilah: hanya yang relevan dengan baris yang dipilih */
function htmlKiri(o){
  var t = [['subbaru', 'Rekam Sub Komponen'], ['akun', 'Rekam Akun'], ['h1', 'Rekam Header 1'], ['h2', 'Rekam Header 2'], ['det', 'Rekam Detail']]
    .filter(function(x){ return o[x[0]]; }).map(function(x){ return '<button class="btn" type="button" data-rd="' + x[0] + '">' + x[1] + '</button>'; }).join('');
  return t || '<span class="rd-kiri-kosong">Pilih baris di lembar kerja untuk merekam</span>';
}
var NAMA_JENIS = { sub: 'Sub komponen', akun: 'Akun', h1: 'Header 1', h2: 'Header 2' };
/* Copy: simpan sumber (sub komponen / akun / header) beserta isinya; bisa di-Paste berkali-kali */
function salinKeClip(){
  var b = barisTerpilih(susun()); if (!b || ['sub', 'akun', 'h1', 'h2'].indexOf(b.jenis) < 0) return;
  var ang = anggota(b), src = ang.filter(function(r){ return !kunci51(r); });
  if (!src.length) return toast('Isi baris ini hanya akun 51 (Belanja Pegawai) yang dikunci untuk fakultas/unit.', 'err', 'Tidak dapat dicopy');
  R.clip = { jenis: b.jenis, key: b.key, rows: src, lewat: ang.length - src.length, ro: b.r.ro, komp: b.r.komp, sub: b.r.sub, akun: b.r.akun, judul: b.r.judul, judul2: b.r.judul2,
    label: NAMA_JENIS[b.jenis] + ' ' + (b.jenis === 'sub' ? b.r.sub + ' ' + (b.r.sub_n || '') + ' (RO ' + b.r.keg + '.' + b.r.ro + ')' : b.jenis === 'akun' ? b.r.akun + ' ' + (b.r.akun_n || '') + ' di ' + b.r.sub : (b.n || '') + ' di ' + b.r.sub + ' · ' + b.r.akun) +
      ' · ' + (b.jenis === 'sub' ? src.map(function(r){ return r.akun; }).filter(function(v, i, a){ return a.indexOf(v) === i; }).length + ' akun · ' : '') + src.length + ' detail · Rp ' + rp(src.reduce(function(t, r){ return t + r.jumlah; }, 0)) };
  R.info = ''; gambarUlang();
}
/* baris tujuan yang sah untuk Paste, atau null */
function tujuanPaste(b){
  var c = R.clip; if (!c || !b) return null;
  if (c.jenis === 'sub') return (b.jenis === 'komp' || b.jenis === 'sub') && b.r.ro === c.ro && b.r.komp === c.komp ? b : null;
  if (c.jenis === 'akun') return b.jenis === 'sub' && b.r.ro === c.ro && b.r.komp === c.komp ? b : null;
  if (c.jenis === 'h1') return b.jenis === 'akun' && !kunci51(b.r) ? b : null;
  if (c.jenis === 'h2') return b.jenis === 'h1' && !kunci51(b.r) ? b : null;
  return null;
}
function ketPaste(){
  var c = R.clip; if (!c) return '';
  return c.jenis === 'sub' ? 'Untuk menempel sub komponen: pilih baris komponen ' + c.komp + ' (ditempel setelah ' + String(c.sub).split('.').pop() + ') atau sub komponen lain di komponen itu (ditempel setelahnya).' :
         c.jenis === 'akun' ? 'Untuk menempel akun: pilih baris sub komponen di komponen ' + c.komp + '.' :
         c.jenis === 'h1' ? 'Untuk menempel Header 1: pilih baris akun tujuan.' : 'Untuk menempel Header 2: pilih baris Header 1 tujuan.';
}
/* kode berikutnya setelah kode asal yang belum dipakai di RO + komponen itu: BC → BD (lewati yang terpakai) */
function kodeSetelah(ro, komp, asal){
  var pakai = {}, cek = function(r){ if (r.ro === ro && r.komp === komp) pakai[String(r.sub || '').split('.').pop()] = 1; };
  R.rows.forEach(cek); Object.keys(R.basis).forEach(function(id){ cek(R.basis[id]); });
  if (/^[A-Z]{2}$/.test(asal)){
    var H = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', n = H.indexOf(asal[0]) * 26 + H.indexOf(asal[1]);
    for (var k = n + 1; k < 676; k++){ var kd = H[Math.floor(k / 26)] + H[k % 26]; if (!pakai[kd]) return kd; }
  }
  return saranKode(ro, komp);
}
/* salin baris src (urutan dipertahankan) dan sisipkan setelah baris 'setelah' */
function tempelSalinan(src, ganti, denganNilai, setelah){
  urut();
  var i = R.rows.indexOf(setelah), nx = R.rows[i + 1], a = setelah.urutan, z = nx ? nx.urutan : a + src.length + 1, step = (z - a) / (src.length + 1);
  var baru = src.map(function(r, k){
    var x = {}; Object.keys(r).forEach(function(f){ if (f.charAt(0) !== '_') x[f] = r[f]; });
    Object.keys(ganti).forEach(function(f){ x[f] = ganti[f]; });
    x.id = null; x.anggaran_id = null; x.blokir = false;
    if (!denganNilai) x.volume = 0;
    x.jumlah = Math.round((x.volume || 0) * (x.harga || 0)); x.urutan = a + step * (k + 1);
    return x;
  });
  R.rows = R.rows.concat(baru); urut();
  return baru;
}
/* Paste: tempel isi Copy ke baris tujuan yang dipilih */
function bukaPaste(){
  var c = R.clip, b = tujuanPaste(barisTerpilih(susun())); if (!c || !b) return;
  if (c.jenis === 'sub'){
    /* sub komponen: langsung ditempel — setelah sub asal (tujuan = baris komponen) atau setelah sub yang dipilih;
       kode = kode berikutnya yang masih kosong (BC → BD); kode & uraian bisa diganti lewat Ubah */
    var asalKode = String(c.sub).split('.').pop(), kodeBaru = kodeSetelah(c.ro, c.komp, asalKode);
    if (!kodeBaru) return toast('Tidak ada kode sub komponen yang masih kosong di komponen ini.', 'err', 'Paste gagal');
    var acuan = b.jenis === 'sub' ? b.r.sub : c.sub;
    var grupAcuan = R.rows.filter(function(r){ return r.ro === c.ro && r.sub === acuan; });
    var setelahS = grupAcuan.length ? grupAcuan[grupAcuan.length - 1] : R.rows.filter(function(r){ return r.ro === c.ro && r.komp === c.komp; }).pop();
    var hasil = tempelSalinan(c.rows, { sub: c.komp + '.' + kodeBaru, sub_n: c.rows[0].sub_n }, true, setelahS);
    R.sel = { key: 'i' + R.rows.indexOf(hasil[0]) }; R.kotor = true; R.fokus = true;
    R.info = 'Sub komponen ' + kodeBaru + ' ditempel setelah ' + String(acuan).split('.').pop() + ' (salinan ' + asalKode + '): ' + hasil.length + ' detail, Rp ' + rp(hasil.reduce(function(t, r){ return t + r.jumlah; }, 0)) +
      '. Ganti kode/uraian lewat Ubah bila perlu, lalu Simpan.';
    return gambarUlang();
  }
  var src = c.rows, tot = src.reduce(function(t, r){ return t + r.jumlah; }, 0);
  var inp = function(id, lbl, v, ph, extra){ return '<label class="f" for="' + id + '"' + (extra && extra.lebar ? ' style="flex:0 0 ' + extra.lebar + '"' : '') + '>' + lbl + '<input type="text" id="' + id + '" value="' + esc(v) + '" placeholder="' + (ph || '') + '" autocomplete="off"' + (extra && extra.attr || '') + '></label>'; };
  var isian = '', tuju = '';
  if (c.jenis === 'sub'){
    isian = '<div class="rd-hitung">' + inp('slKode', 'Kode sub komponen baru', saranKode(c.ro, c.komp), 'mis. AZ', { lebar: '160px', attr: ' maxlength="4" style="text-transform:uppercase"' }) +
      inp('slUraian', 'Uraian sub komponen', (src[0] && src[0].sub_n) || '', 'uraian sub komponen') + '</div>';
    tuju = 'di ujung komponen ' + c.komp;
  } else if (c.jenis === 'akun'){
    var bas = R.bas.filter(function(a){ return !(sess().role === 'UNIT' && /^51/.test(a.kode)); });
    isian = '<label class="f" for="slAkun">Akun tujuan<select id="slAkun">' + bas.map(function(a){ return '<option value="' + a.kode + '"' + (a.kode === c.akun ? ' selected' : '') + '>' + esc(a.kode + ' · ' + a.nama) + '</option>'; }).join('') + '</select></label>';
    tuju = 'ke sub komponen ' + String(b.r.sub).split('.').pop() + ' ' + (b.r.sub_n || '');
  } else {
    isian = inp('slHeader', c.jenis === 'h1' ? 'Uraian Header 1' : 'Uraian Header 2', (c.jenis === 'h1' ? c.judul : c.judul2) || '', 'uraian header');
    tuju = c.jenis === 'h1' ? 'ke akun ' + b.r.akun + ' ' + (b.r.akun_n || '') : 'ke Header 1 "' + (b.r.judul || '') + '"';
  }
  openModal('<div class="modal-hd"><div><span class="note">' + esc(c.label) + '</span><h3>Paste ' + NAMA_JENIS[c.jenis] + '</h3></div><button type="button" class="icon" data-modal-close aria-label="Tutup">' + IC_X + '</button></div>' +
    '<form id="rdForm" class="rd-form" novalidate><p class="note" style="margin:0">Ditempel <b>' + esc(tuju) + '</b>: ' + src.length + ' detail · Rp ' + rp(tot) + (c.lewat ? ' · ' + c.lewat + ' detail akun 51 dilewati' : '') + '.</p>' + isian +
    '<div class="pr-cak"><label class="chk"><input type="radio" name="slNilai" value="1" checked><span>Dengan volume &amp; harga (jumlah sama)</span></label>' +
      '<label class="chk"><input type="radio" name="slNilai" value="0"><span>Tanpa nilai (volume 0, jumlah Rp 0)</span></label></div>' +
    '<p class="note" style="margin:0">Hasil tempel menjadi detail <b>baru</b> (tanpa blokir/realisasi) dan menambah pagu usulan bila dengan nilai — seimbangkan dengan pengurangan di tempat lain.</p>' +
    '<div id="rdMsg" class="status-box s-err" role="alert" hidden></div>' +
    '<div class="tools"><button type="submit" class="btn primary">Paste</button><button type="button" class="btn" data-modal-close>Batal</button></div></form>');
  [].forEach.call(document.querySelectorAll('#modal [data-modal-close]'), function(x){ x.onclick = closeModal; });
  setTimeout(function(){ var x = $('slKode') || $('slHeader') || $('slAkun'); if (x) x.focus(); }, 60);
  $('rdForm').onsubmit = function(e){
    e.preventDefault();
    var salah = function(m){ $('rdMsg').textContent = m; $('rdMsg').hidden = false; };
    var nilai = document.querySelector('#modal [name=slNilai]:checked').value === '1', ganti = {}, setelah, info;
    if (c.jenis === 'sub'){
      var kode = $('slKode').value.trim().toUpperCase(), ur = $('slUraian').value.trim(), subBaru = c.komp + '.' + kode;
      if (!/^[A-Z0-9]{1,4}$/.test(kode)) return salah('Kode sub komponen 1–4 huruf kapital/angka, mis. AZ.');
      if (ur.length < 3) return salah('Uraian sub komponen wajib diisi (minimal 3 karakter).');
      var dipakai = R.rows.some(function(r){ return r.ro === c.ro && r.sub === subBaru; }) || Object.keys(R.basis).some(function(id){ var x = R.basis[id]; return x.ro === c.ro && x.sub === subBaru; });
      if (dipakai) return salah('Kode ' + kode + ' sudah dipakai sub komponen lain di komponen ini. Pilih kode lain.');
      ganti = { sub: subBaru, sub_n: ur };
      var kompRows = R.rows.filter(function(r){ return r.prog === b.r.prog && r.kro === b.r.kro && r.ro === c.ro && r.komp === c.komp; });
      setelah = kompRows[kompRows.length - 1]; info = 'Sub komponen ' + kode + ' ditempel';
    } else if (c.jenis === 'akun'){
      var aT = $('slAkun').value, ak = R.bas.filter(function(a){ return a.kode === aT; })[0];
      if (!ak) return salah('Pilih akun tujuan.');
      var subRows = R.rows.filter(function(r){ return r.ro === b.r.ro && r.sub === b.r.sub; }), ada = subRows.filter(function(r){ return r.akun === aT; });
      ganti = { sub: b.r.sub, sub_n: b.r.sub_n, akun: aT, akun_n: ak.nama };
      setelah = ada.length ? ada[ada.length - 1] : subRows[subRows.length - 1]; info = 'Akun ' + aT + ' ditempel ke sub komponen ' + String(b.r.sub).split('.').pop();
    } else {
      var hb = $('slHeader').value.trim();
      if (hb.length < 2) return salah('Uraian header wajib diisi (minimal 2 karakter).');
      var tAng = anggota(b);
      var kembar = c.jenis === 'h1' ? tAng.some(function(r){ return r.judul === hb; }) : tAng.some(function(r){ return r.judul2 === hb; });
      if (kembar) return salah('Header "' + hb + '" sudah ada di tempat tujuan. Gunakan uraian lain.');
      ganti = { sub: b.r.sub, sub_n: b.r.sub_n, akun: b.r.akun, akun_n: b.r.akun_n, sumber: b.r.sumber };
      if (c.jenis === 'h1') ganti.judul = hb; else { ganti.judul = b.r.judul; ganti.judul2 = hb; }
      setelah = tAng[tAng.length - 1]; info = 'Header "' + hb + '" ditempel';
    }
    closeModal();
    var baru = tempelSalinan(src, ganti, nilai, setelah);
    R.sel = { key: 'i' + R.rows.indexOf(baru[0]) }; R.kotor = true; R.fokus = true;
    R.info = info + ': ' + baru.length + ' detail' + (nilai ? ', Rp ' + rp(baru.reduce(function(t, r){ return t + r.jumlah; }, 0)) : ' tanpa nilai') + '. Klik Simpan untuk menyimpan.';
    gambarUlang();
  };
}
function pulihkan(id){
  var b = R.basis[id]; if (!b) return;
  var r = {}; Object.keys(b).forEach(function(k){ r[k] = b[k]; }); r.anggaran_id = b.id; r.id = null;
  R.rows.push(r); urut(); R.sel = { key: 'i' + R.rows.indexOf(r) }; R.kotor = true; R.fokus = true; R.info = 'Detail "' + r.uraian + '" dikembalikan. Klik Simpan untuk menyimpan.'; gambarUlang();
}
/* sub komponen baru (belum ada di DIPA) dipindah ke posisi menurut kodenya di dalam komponen:
   mis. BD diletakkan tepat setelah BC, BE setelah BD; isi tiap sub komponen tetap berurutan */
function urutkanSubBaru(){
  urut();
  var diDipa = {}; Object.keys(R.basis).forEach(function(id){ var b = R.basis[id]; diDipa[b.ro + '|' + b.sub] = 1; });
  var baru = {}; R.rows.forEach(function(r){ var k = r.ro + '|' + r.sub; if (!diDipa[k]) (baru[k] = baru[k] || []).push(r); });
  var kodeDari = function(sub){ return String(sub || '').split('.').pop(); };
  Object.keys(baru).sort(function(a, b){ return kodeDari(a) < kodeDari(b) ? -1 : 1; }).forEach(function(k){
    var grup = baru[k], g = grup[0], kode = kodeDari(g.sub);
    var sisa = R.rows.filter(function(r){ return grup.indexOf(r) < 0; });
    var komp = sisa.filter(function(r){ return r.prog === g.prog && r.kro === g.kro && r.ro === g.ro && r.komp === g.komp; });
    if (!komp.length) return;
    /* sub komponen lain di komponen ini yang kodenya lebih kecil → tempel setelah baris terakhir sub yang kodenya terbesar di antaranya */
    var lebihKecil = komp.filter(function(r){ return kodeDari(r.sub) < kode; }), acuan;
    if (lebihKecil.length){
      var maks = lebihKecil.reduce(function(m, r){ return kodeDari(r.sub) > m ? kodeDari(r.sub) : m; }, '');
      var grupMaks = komp.filter(function(r){ return kodeDari(r.sub) === maks; }); acuan = grupMaks[grupMaks.length - 1];
    }
    var i = acuan ? sisa.indexOf(acuan) : sisa.indexOf(komp[0]) - 1;
    var a = i >= 0 ? sisa[i].urutan : komp[0].urutan - 1, z = sisa[i + 1] ? sisa[i + 1].urutan : a + grup.length + 1;
    var step = (z - a) / (grup.length + 1);
    grup.forEach(function(r, n){ r.urutan = a + step * (n + 1); });
    urut();
  });
}
function simpan(){
  if (!R.kotor || R.simpan) return;
  /* sel terpilih ditandai dengan objek baris agar tetap menunjuk baris yang sama setelah diurutkan */
  var selBaris = (function(){ var b = barisTerpilih(susun()); return b && b.jenis === 'item' ? b.r : null; })();
  urutkanSubBaru();
  if (selBaris) R.sel = { key: 'i' + R.rows.indexOf(selBaris) };
  R.simpan = true; gambarUlang();
  var kirim = R.rows.map(function(r){ return { anggaran_id: r.anggaran_id, urutan: r.urutan, judul: r.judul || '', judul2: r.judul2 || '', uraian: r.uraian, volume: r.volume, satuan: r.satuan || '', harga: r.harga,
    prog: r.prog, kro: r.kro, ro: r.ro, komp: r.komp, sub: r.sub, sub_n: r.sub_n || '', akun: r.akun, sumber: r.sumber || '' }; });
  SB.simpanSalinan(R.u.id, kirim).then(function(x){
    R.simpan = false; R.kotor = false; R.info = ''; lupakanUsulan();
    R.rows.forEach(function(r){ r.jumlah = jumlahDari(r, R.basis[r.anggaran_id]); });
    toast('Pagu usulan Rp ' + rp(x.pagu) + (x.selisih ? ' — selisih ' + tanda(x.selisih) + ' terhadap DIPA; usulan harus seimbang sebelum diajukan.' : ' — seimbang dengan DIPA.') + ' ' + x.perubahan + ' baris perubahan tercatat.', x.selisih ? 'warn' : 'ok', 'Usulan disimpan');
    gambarUlang();
  }).catch(function(e){ R.simpan = false; gambarUlang(); toast(errMsg(e), 'err', 'Usulan belum tersimpan'); });
}

/* ---------- interaksi ---------- */
/* tinggi lembar kerja diukur langsung: mengisi sisa layar sampai tepat di atas footer ringkasan,
   sehingga halaman tidak perlu digulir (yang digulir hanya isi tabel) dan tidak ada ruang kosong */
function aturTinggi(){
  var g = document.querySelector('.rd-card .rd-grid'), f = document.querySelector('.rd-foot'); if (!g) return;
  var kartu = g.closest('.rd-card'), ket = kartu && kartu.querySelector('.rd-ket');
  var atas = g.getBoundingClientRect().top + window.scrollY;
  var bawah = (ket ? ket.offsetHeight + 6 : 0) + (kartu ? parseFloat(getComputedStyle(kartu).paddingBottom) || 0 : 0) + (f ? f.offsetHeight : 0) + 6;
  g.style.maxHeight = Math.max(260, Math.floor(window.innerHeight - atas - bawah) - 1) + 'px';
}
window.addEventListener('resize', function(){ if (S.page === 'anggaran-rkk') aturTinggi(); });
function bind(){
  var pg = $('page'); if (!pg) return;
  aturTinggi();
  if (R.posisi){
    var g = pg.querySelector('.rd-grid'), p = R.posisi; R.posisi = null;
    if (g){ g.scrollTop = p.g; g.scrollLeft = p.x; }
    window.scrollTo(0, p.y);
  }
  if (R.fokus){
    R.fokus = false;
    var gr = pg.querySelector('.rd-grid'), tr = gr && gr.querySelector('tr.sel');
    if (gr && tr){
      var th = gr.querySelector('thead'), atas = tr.offsetTop - (th ? th.offsetHeight : 0);
      if (atas < gr.scrollTop || tr.offsetTop + tr.offsetHeight > gr.scrollTop + gr.clientHeight) gr.scrollTop = Math.max(0, atas - gr.clientHeight / 3);
      tr.classList.add('rd-kilat'); setTimeout(function(){ tr.classList.remove('rd-kilat'); }, 2400);
    }
  }
  if (R.info){ var inf = R.info; setTimeout(function(){ if (R.info === inf){ R.info = ''; var el = document.querySelector('.rd-info'); if (el) el.remove(); } }, 8000); }
  [].forEach.call(pg.querySelectorAll('[data-rd-kembali]'), function(el){ el.onclick = function(){ var id = +el.getAttribute('data-rd-kembali'); R.lihat = null; R.mode = null; R.daftar = null; document.dispatchEvent(new CustomEvent('buka-usulan', { detail: id })); }; });
  [].forEach.call(pg.querySelectorAll('[data-rd-tutup]'), function(el){ el.onclick = function(){ R.lihat = null; R.mode = null; R.daftar = null; R.u = null; R.rows = null; refresh(); }; });
  if ($('rdVersi')) $('rdVersi').onchange = function(){ R.dv = +this.value; R.rows = null; R.u = null; R.sel = null; refresh(); };
  if ($('rdUsulan')) $('rdUsulan').onchange = function(){
    var sel = this, m = sel.value === 'dipa' ? 'dipa' : +sel.value;
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
  [].forEach.call(pg.querySelectorAll('[data-rd]'), pasangAlat);
  bindLanjutan(pg);
}
function pasangAlat(el){ el.onclick = function(){
    var a = el.getAttribute('data-rd');
    if (a === 'simpan') simpan();
    else if (a === 'dihapus') bukaDihapus();
    else if (a === 'copy') salinKeClip();
    else if (a === 'paste') bukaPaste();
    else if (a === 'lepascopy'){ R.clip = null; gambarUlang(); }
    else if (a === 'hapus' && dicentang().length) hapusTanda();
    else if (a === 'batal') tanya({ judul: 'Batalkan semua perubahan?', pesan: 'Belanja Redesain kembali ke kondisi terakhir yang disimpan.', ya: 'Batalkan perubahan', bahaya: true }).then(function(ya){ if (ya){ R.kotor = false; R.rows = null; R.u = null; R.posisi = null; refresh(); } });
    else aksi(a);
  }; }
function bindLanjutan(pg){
  [].forEach.call(pg.querySelectorAll('[data-rd-cek]'), function(el){
    if (el.getAttribute('data-ind')) el.indeterminate = true;
    el.onclick = function(e){ e.stopPropagation(); };
    el.onchange = function(){
      centang(el.getAttribute('data-rd-cek'), el.checked);
      gambarUlang();
    };
  });
  [].forEach.call(pg.querySelectorAll('[data-rd-pulih]'), function(el){ el.onclick = function(){ pulihkan(+el.getAttribute('data-rd-pulih')); }; });
}
/* tombol bilah alat diperbarui tanpa menggambar ulang tabel (tabel bisa ratusan baris) */
function perbaruiAlat(){
  var o = pilihan(susun()), pg = $('page');
  ['ubah', 'hapus', 'blokir'].forEach(function(k){ var t = pg.querySelector('[data-rd="' + k + '"]'); if (t) t.disabled = !(o[k] || (k === 'hapus' && dicentang().length)); });
  var kiri = $('rdKiri'); if (kiri){ kiri.innerHTML = htmlKiri(o); [].forEach.call(kiri.querySelectorAll('[data-rd]'), pasangAlat); }
  ['copy', 'paste'].forEach(function(k){ var t = pg.querySelector('[data-rd="' + k + '"]'); if (t) t.disabled = !o[k]; });
  var p = pg.querySelector('.rd-petunjuk'), kt = [o.ket, o.ketPaste].filter(Boolean).join(' · '); if (p){ p.textContent = kt; p.hidden = !kt; }
}
