/* js/pages/usulan.js — Usulan Revisi Anggaran (Monev Anggaran tahap 5–7)
   Daftar usulan, editor (pemeriksaan langsung di browser), detail + tindakan per peran,
   Matriks Usulan Revisi (PDF/Excel) dan pencocokan dengan RKK baru setelah diinput ke SAKTI.
   Aturan yang sama diperiksa ulang di database saat disimpan/diajukan/disetujui. */
import { $, esc, rp, tgl, labelVersi, toast, tanya, errMsg } from '../utils.js?v=202611150917';
import { S, DB, ALL, BOOT, sess, isSuperAdmin } from '../state.js?v=202611150917';
import { card } from '../ui-components.js?v=202611150917';
import { SB } from '../api.js?v=202611150917';
import { refresh, keepScroll } from '../nav.js?v=202611150917';
import { kunciItem } from './anggaran.js?v=202611150917';
import { muatPdfLib } from './laporan.js?v=202611150917';
import { muatNotifUsulan, tandaiUsulanDilihat } from '../berita.js?v=202611150917';

/* dipakai di dua menu: Monev Anggaran → Usulan Revisi (pengusul) dan Admin → Kelola Usulan Revisi (Admin perencanaan) */
export var HAL_USULAN = ['anggaran-usulan', 'kelola-usulan'];
function modeKelola(){ return S.page === 'kelola-usulan'; }
var FL = { status: 'diajukan', unit: '', telaah: false };
/* dari lonceng / Monitoring: buka langsung detail usulan di menu yang sesuai peran */
document.addEventListener('buka-usulan', function(e){
  U.tab = 'pengajuan'; U.view = 'detail'; U.id = e.detail; U.detail = null; U.err = null;
  S.page = isSuperAdmin() ? 'kelola-usulan' : 'anggaran-usulan'; S.open = {};
  refresh(); window.scrollTo(0, 0);
});
var U = { tab: 'histori', list: null, view: 'daftar', id: null, draft: null, detail: null, basis: null, kelompok: '', memuat: false, err: null };
var ST = {
  draf: ['st-draf', 'Draf'], diajukan: ['st-info', 'Diajukan'], dikembalikan: ['st-warn', 'Dikembalikan'], disetujui: ['st-good', 'Disetujui'],
  ditolak: ['st-crit', 'Ditolak'], diinput_sakti: ['st-info', 'Diinput SAKTI'], selesai: ['st-good', 'Selesai']
};
function pillSt(s){ var x = ST[s] || ['', s]; return '<span class="pill ' + x[0] + '"><i></i>' + x[1] + '</span>'; }
function bolehBuat(){ var p = sess().role; return p === 'UNIT' || p === 'ADMIN' || p === 'SUPERADMIN'; }
function tanda(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + rp(Math.abs(n)); }
function vol(v){ return v == null ? '' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }
function kunciKel(r){ return [r.prog, r.kro, r.ro, r.sub, r.akun].join('|'); }
function sumberNama(s){ return s === 'PNP' ? 'PNBP' : (s || '?'); }

/* ---------- data ---------- */
function muatDaftar(){
  if (U.memuat) return; U.memuat = true; U.err = null;
  SB.usulanDaftar().then(function(l){ U.list = l; U.memuat = false; if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); })
    .catch(function(e){ U.memuat = false; U.err = errMsg(e); if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); });
}
/* RKK basis: versi terbaru di tahun anggaran berjalan (atau versi basis usulan yang sedang dibuka) */
function muatBasis(versiId){
  if (U.memuat) return; U.memuat = true; U.err = null;
  SB.anggaranVersi().then(function(vs){
    if (!vs.length) throw new Error('Belum ada RKK. Admin perencanaan perlu mengunggah RKK lebih dulu.');
    var v = versiId ? vs.filter(function(x){ return x.id === versiId; })[0] : null;
    if (!v){ var th = DB && DB.periode ? +DB.periode.slice(0, 4) : vs[vs.length - 1].tahun; var sama = vs.filter(function(x){ return x.tahun === th; }); v = (sama.length ? sama : vs)[(sama.length ? sama : vs).length - 1]; }
    return SB.anggaranItem(v.id).then(function(rows){ U.basis = { versi: v, rows: rows, semua: vs }; });
  }).then(function(){ U.memuat = false; if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); })
    .catch(function(e){ U.memuat = false; U.err = errMsg(e); if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); });
}
function muatDetail(id){
  if (U.memuat) return; U.memuat = true; U.err = null;
  SB.usulanDetail(id).then(function(d){ U.detail = d; U.memuat = false; if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); })
    .catch(function(e){ U.memuat = false; U.err = errMsg(e); if (HAL_USULAN.indexOf(S.page) >= 0) refresh(); });
}
function ke(view, id){ U.view = view; U.id = id || null; U.detail = null; U.err = null; if (view === 'daftar') U.list = null; refresh(); window.scrollTo(0, 0); }

/* ---------- baris usulan: nilai semula & menjadi (rumus sama dengan fungsi database) ---------- */
function nilaiBaris(b){
  var a = b.a || {}, s = b.aksi === 'tambah' ? 0 : a.jumlah, m;
  var mv = b.m_volume === '' || b.m_volume == null ? null : +b.m_volume, mh = b.m_harga === '' || b.m_harga == null ? null : +b.m_harga;
  if (b.aksi === 'hapus') m = 0;
  else if (b.aksi === 'ubah' && mv === a.volume && mh === a.harga) m = a.jumlah;
  else m = mv == null || mh == null ? null : Math.round(mv * mh);
  return { s: s, m: m, d: m == null ? null : m - s };
}
/* pemeriksaan di browser (cerminan periksa_usulan di database) */
function periksa(baris, basisRows){
  var tolak = [], telaah = [], peran = sess().role, delta = 0, perSd = {}, kat = {}, unit = {}, kosong = false;
  if (!baris.length) tolak.push('Usulan belum berisi perubahan.');
  baris.forEach(function(b){
    var n = nilaiBaris(b), a = b.a || {};
    if (n.m == null){ kosong = true; return; }
    delta += n.d; perSd[a.sumber] = (perSd[a.sumber] || 0) + n.d;
    var k = /^53/.test(a.akun) ? '53' : /^524/.test(a.akun) ? '524' : /^52/.test(a.akun) ? '52' : 'lain';
    kat[k] = kat[k] || { n: 0, t: 0 }; if (n.d > 0) kat[k].n += n.d; else kat[k].t += n.d;
    unit[(a.kategori || '') + '|' + (a.unit || '')] = 1;
    if (peran === 'UNIT' && /^51/.test(a.akun) && tolak.indexOf('a51') < 0) tolak.push('a51');
    if (a.blokir && b.aksi !== 'tambah' && (b.aksi === 'hapus' || n.d !== 0) && tolak.indexOf('blk') < 0) tolak.push('blk');
  });
  tolak = tolak.map(function(t){ return t === 'a51' ? 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.' : t === 'blk' ? 'Item yang diblokir tidak dapat diubah atau dihapus sebelum blokirnya dibuka.' : t; });
  if (kosong) tolak.push('Lengkapi volume dan harga satuan pada setiap baris.');
  if (delta !== 0) tolak.push('Usulan tidak seimbang: selisih Rp ' + tanda(delta) + '. Pagu yang dikurangi harus sama dengan yang ditambahkan.');
  if (Object.keys(perSd).some(function(s){ return perSd[s] !== 0; })) tolak.push('Pergeseran antar sumber dana (RM ↔ PNBP) tidak diperbolehkan.');
  if (Object.keys(unit).length > 1 && peran !== 'SUPERADMIN') tolak.push('Pergeseran antar fakultas/unit hanya dapat dilakukan Admin perencanaan.');
  /* pagu kelompok tidak boleh di bawah realisasi (data realisasi tahun yang sama yang sedang dimuat) */
  if (U.basis && DB && DB.periode && +DB.periode.slice(0, 4) === U.basis.versi.tahun){
    var dK = {}, pK = {}, sdK = {};
    baris.forEach(function(b){ var n = nilaiBaris(b); if (n.d != null) dK[kunciKel(b.a)] = (dK[kunciKel(b.a)] || 0) + n.d; });
    basisRows.forEach(function(r){ var k = kunciKel(r); if (dK[k] != null) pK[k] = (pK[k] || 0) + r.jumlah; });
    ALL.forEach(function(r){ if (r.blokir) return; var k = kunciKel(r); if (dK[k] != null) sdK[k] = (sdK[k] || 0) + r.sd; });
    Object.keys(dK).forEach(function(k){ if (dK[k] < 0 && (pK[k] || 0) + dK[k] < (sdK[k] || 0)){ var p = k.split('|'); tolak.push('Pagu sub komponen ' + p[3] + ' akun ' + p[4] + ' menjadi Rp ' + rp((pK[k] || 0) + dK[k]) + ', di bawah realisasinya Rp ' + rp(sdK[k]) + '.'); } });
  }
  var g = function(k, f){ return kat[k] ? kat[k][f] : 0; };
  if (g('53', 'n') > 0 && (g('52', 't') < 0 || g('524', 't') < 0)) telaah.push('Pergeseran dari belanja barang (52) ke belanja modal (53).');
  if (g('53', 't') < 0 && (g('52', 'n') > 0 || g('524', 'n') > 0)) telaah.push('Pergeseran dari belanja modal (53) ke belanja barang (52).');
  if (g('524', 'n') > 0 && g('52', 't') < 0) telaah.push('Pergeseran dari akun 52 lainnya ke perjalanan dinas (524).');
  return { tolak: tolak, telaah: telaah, delta: delta, perSd: perSd };
}
function kotakPeriksa(h){
  if (!h) return '';
  var t = h.tolak || [], l = h.telaah || [];
  if (!t.length && !l.length) return '<div class="status-box s-ok">Memenuhi semua aturan revisi. Usulan siap diajukan.</div>';
  return (t.length ? '<div class="status-box s-err"><div><b>Belum dapat diajukan:</b><ul class="us-list">' + t.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>' : '') +
    (l.length ? '<div class="status-box us-telaah"><div><b>Perlu telaah Admin perencanaan:</b><ul class="us-list">' + l.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>' : '');
}

/* ================= halaman ================= */
export function renderUsulan(){
  /* menu unit: dua tab ala SAKTI — Status Histori (bentuk usulan) & Pengajuan Revisi (daftar/detail usulan) */
  if (!modeKelola()){
    var tabs = '<div class="seg-row noprint"><div class="seg" role="group" aria-label="Tahapan usulan revisi">' +
      '<button type="button" data-us-tab="histori" aria-pressed="' + (U.tab === 'histori') + '">Status Histori</button>' +
      '<button type="button" data-us-tab="pengajuan" aria-pressed="' + (U.tab !== 'histori') + '">Pengajuan Revisi</button></div></div>';
    if (U.tab === 'histori') return tabs + renderHistori();
    return tabs + renderPengajuan();
  }
  return renderPengajuan();
}
function renderPengajuan(){
  if (U.err) return '<div class="glass card"><h2>Usulan revisi</h2><p class="note">' + esc(U.err) + '</p><div class="tools"><button class="btn" type="button" data-us-ke="daftar">Kembali ke daftar</button></div></div>' + ikat();
  if (U.view === 'edit') return renderEdit();
  if (U.view === 'detail') return renderDetail();
  return renderDaftar();
}
function ikat(){ setTimeout(bind, 0); return ''; }

/* ---------- daftar ---------- */
function renderDaftar(){
  if (!U.list){ muatDaftar(); return '<div class="loading">Memuat usulan revisi…</div>'; }
  var menunggu = isSuperAdmin() ? U.list.filter(function(u){ return u.status === 'diajukan'; }).length : 0;
  var daftar = U.list, saring = '';
  if (modeKelola()){
    var unitList = []; U.list.forEach(function(u){ var n = u.lintas_unit ? 'Lintas unit' : (u.unit || '—'); if (unitList.indexOf(n) < 0) unitList.push(n); }); unitList.sort();
    daftar = U.list.filter(function(u){ var n = u.lintas_unit ? 'Lintas unit' : (u.unit || '—');
      return (!FL.status || u.status === FL.status) && (!FL.unit || n === FL.unit) && (!FL.telaah || u.perlu_telaah); });
    saring = '<div class="form noprint us-saring"><label class="f" for="usFlSt">Status<select id="usFlSt"><option value="">Semua status (' + U.list.length + ')</option>' +
      Object.keys(ST).map(function(k){ var n = U.list.filter(function(u){ return u.status === k; }).length; return '<option value="' + k + '"' + (k === FL.status ? ' selected' : '') + '>' + ST[k][1] + (k === 'diajukan' ? ' — menunggu persetujuan' : '') + ' (' + n + ')</option>'; }).join('') + '</select></label>' +
      '<label class="f" for="usFlUnit">Unit<select id="usFlUnit"><option value="">Semua unit</option>' + unitList.map(function(n){ return '<option' + (n === FL.unit ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +
      '<label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="usFlTelaah"' + (FL.telaah ? ' checked' : '') + '><span>Hanya yang perlu telaah</span></label></div>';
  }
  var isi = !daftar.length ? (modeKelola() && U.list.length ? '<div class="empty">Tidak ada usulan untuk saringan ini.</div>' : '<div class="empty">Belum ada usulan revisi.' + (!modeKelola() ? ' Bentuk usulan lewat tab <b>Status Histori</b>.' : bolehBuat() ? ' Klik <b>Buat usulan</b> untuk memulai.' : '') + '</div>') :
    '<div class="tbl"><table><thead><tr><th>No</th><th>Judul</th><th>Unit</th><th>Status</th><th>Diperbarui</th><th></th></tr></thead><tbody>' +
    daftar.map(function(u){ return '<tr><td class="code">' + u.id + '</td><td><b>' + esc(u.judul) + '</b>' + (u.perlu_telaah ? ' <span class="pill st-warn ag-bl"><i></i>Perlu telaah</span>' : '') + (u.no_revisi ? '<br><span class="note">No. Revisi ' + esc(u.no_revisi) + '</span>' : '') + '</td>' +
      '<td>' + (u.lintas_unit ? '<i>Lintas unit</i>' : esc(u.unit || '—')) + '</td><td>' + pillSt(u.status) + '</td><td>' + esc(String(u.diubah_pada || '').slice(0, 16).replace('T', ' ')) + '<br><span class="note">' + esc(u.dibuat_email) + '</span></td>' +
      '<td><button class="btn" type="button" data-us-buka="' + u.id + '">Buka</button></td></tr>'; }).join('') + '</tbody></table></div>';
  return '<div class="page-sec grid">' + card('us-daftar', modeKelola() ? 'Kelola usulan revisi' : 'Usulan revisi anggaran',
    (modeKelola() ? 'Antrean usulan dari seluruh fakultas/unit: verifikasi, telaah, setujui / kembalikan / tolak, lalu catat No. Revisi SAKTI.' : 'Usulan perubahan anggaran unit Anda; diverifikasi dan ditelaah Admin perencanaan sebelum diinput ke SAKTI.') +
      (menunggu ? ' <b>' + menunggu + ' usulan menunggu persetujuan.</b>' : ''),
    saring + isi, modeKelola() && bolehBuat() ? '<button class="btn primary" type="button" data-us-baru>Buat usulan</button>' : '') + '</div>' + ikat();
}

/* ---------- editor ---------- */
function mulaiDraft(d){
  /* dari detail usulan (ubah) atau kosong (baru); baris disambungkan ke item RKK basis */
  var byId = {}; U.basis.rows.forEach(function(r){ byId[r.id] = r; });
  U.draft = { id: d ? d.u.id : null, judul: d ? d.u.judul : '', alasan: d ? d.u.alasan : '', baris: [] };
  if (d) d.baris.forEach(function(b){
    var a = b.aksi === 'tambah' ? (U.basis.rows.filter(function(r){ return kunciKel(r) === kunciKel(b); })[0] || b) : (byId[b.anggaran_id] || b);
    U.draft.baris.push({ aksi: b.aksi, anggaran_id: b.anggaran_id, a: a, uraian: b.uraian, judul: b.judul, m_volume: b.m_volume, m_satuan: b.m_satuan, m_harga: b.m_harga });
  });
}
function renderEdit(){
  var basisId = U.detail ? U.detail.u.versi_id : null;
  if (!U.basis || !U.basis.versi || (basisId && U.basis.versi.id !== basisId)){ muatBasis(basisId); return '<div class="loading">Memuat RKK basis…</div>'; }
  if (U.id && !U.detail){ muatDetail(U.id); return '<div class="loading">Memuat usulan…</div>'; }
  if (!U.draft || U.draft.id !== U.id) mulaiDraft(U.detail);
  var D = U.draft, rows = U.basis.rows;
  /* daftar kelompok (sub komponen + akun) yang terlihat oleh pengguna (RLS) */
  var kel = {}, urut = [];
  rows.forEach(function(r){ var k = kunciKel(r); if (!kel[k]){ kel[k] = { r: r, n: 0, j: 0 }; urut.push(k); } kel[k].n++; kel[k].j += r.jumlah; });
  urut.sort(function(a, b){ var x = kel[a].r, y = kel[b].r; return ((x.unit || '') + x.sub + x.akun) < ((y.unit || '') + y.sub + y.akun) ? -1 : 1; });
  if (!U.kelompok || !kel[U.kelompok]) U.kelompok = urut[0] || '';
  var pilihKel = '<label class="f" for="usKel">Kelompok anggaran (sub komponen · akun)<select id="usKel">' + urut.map(function(k){ var r = kel[k].r, p = String(r.sub).split('.');
    return '<option value="' + esc(k) + '"' + (k === U.kelompok ? ' selected' : '') + '>' + esc((r.unit || '') + ' · ' + p[p.length - 1] + ' ' + (r.sub_n || '') + ' · ' + r.akun + ' ' + (r.akun_n || '') + ' (' + sumberNama(r.sumber) + ') — Rp ' + rp(kel[k].j)) + '</option>'; }).join('') + '</select></label>';
  var dipakai = {}; D.baris.forEach(function(b){ if (b.anggaran_id) dipakai[b.anggaran_id] = 1; });
  var itemKel = rows.filter(function(r){ return kunciKel(r) === U.kelompok; });
  var tabelItem = '<div class="tbl"><table><thead><tr><th>Uraian</th><th class="n">Volume</th><th>Satuan</th><th class="n">Harga satuan</th><th class="n">Jumlah</th><th></th></tr></thead><tbody>' +
    itemKel.map(function(r){ var kunci = r.blokir ? '<span class="pill st-warn ag-bl" title="Diblokir: tidak dapat diubah"><i></i>Blokir</span>' : dipakai[r.id] ? '<span class="note">sudah di usulan</span>' :
      '<button class="btn" type="button" data-us-ubah="' + r.id + '">Ubah</button> <button class="btn" type="button" data-us-hapus-item="' + r.id + '">Hapus</button>';
      return '<tr><td>' + esc(r.uraian) + (r.judul ? '<br><span class="note">' + esc(r.judul) + '</span>' : '') + '</td><td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n">' + rp(r.jumlah) + '</td><td class="row-actions">' + kunci + '</td></tr>'; }).join('') +
    '</tbody></table></div><div class="tools" style="margin-top:8px"><button class="btn" type="button" data-us-tambah>+ Tambah item baru di kelompok ini</button></div>';
  /* daftar perubahan yang bisa diisi */
  var inp = function(i, f, v, ph, w){ return '<input type="text" inputmode="decimal" class="us-in" style="width:' + (w || 90) + 'px" data-us-i="' + i + '" data-us-f="' + f + '" value="' + esc(v == null ? '' : v) + '" placeholder="' + ph + '">'; };
  var perubahan = !D.baris.length ? '<p class="note">Belum ada perubahan. Pilih kelompok di atas, lalu klik <b>Ubah</b>, <b>Hapus</b>, atau <b>Tambah item baru</b>.</p>' :
    '<div class="tbl"><table><thead><tr><th>Aksi</th><th>Kelompok · Uraian</th><th class="n">Semula</th><th>Menjadi (volume · satuan · harga satuan)</th><th class="n">Jumlah menjadi</th><th class="n">Selisih</th><th></th></tr></thead><tbody>' +
    D.baris.map(function(b, i){ var a = b.a || {}, n = nilaiBaris(b), p = String(a.sub || '').split('.');
      var menjadi = b.aksi === 'hapus' ? '<span class="note">dihapus</span>' : inp(i, 'm_volume', b.m_volume, 'volume', 80) + ' ' + inp(i, 'm_satuan', b.m_satuan, 'satuan', 80) + ' × ' + inp(i, 'm_harga', b.m_harga, 'harga', 120);
      return '<tr><td>' + (b.aksi === 'ubah' ? 'Ubah' : b.aksi === 'hapus' ? 'Hapus' : 'Tambah') + '</td>' +
        '<td><span class="note">' + esc((a.unit || '') + ' · ' + p[p.length - 1] + ' · ' + a.akun + ' ' + sumberNama(a.sumber)) + '</span><br>' +
          (b.aksi === 'tambah' ? inp(i, 'uraian', b.uraian, 'uraian item baru', 260) : esc(a.uraian)) + '</td>' +
        '<td class="n">' + (b.aksi === 'tambah' ? '—' : vol(a.volume) + ' ' + esc(a.satuan) + ' × ' + rp(a.harga) + '<br><b>' + rp(a.jumlah) + '</b>') + '</td>' +
        '<td>' + menjadi + '</td><td class="n"><b>' + (n.m == null ? '—' : rp(n.m)) + '</b></td><td class="n' + (n.d < 0 ? ' neg' : '') + '">' + (n.d == null ? '' : tanda(n.d)) + '</td>' +
        '<td><button class="icon" type="button" data-us-buang="' + i + '" aria-label="Buang baris">✕</button></td></tr>'; }).join('') +
    '</tbody></table></div>';
  var h = periksa(D.baris, rows);
  var ringkas = '<div class="us-ring"><span>Selisih total: <b class="' + (h.delta ? 'neg' : '') + '">' + tanda(h.delta) + '</b></span>' +
    Object.keys(h.perSd).map(function(s){ return '<span>' + sumberNama(s) + ': <b>' + tanda(h.perSd[s]) + '</b></span>'; }).join('') + '</div>';
  return '<div class="page-sec grid">' +
    card('us-edit', D.id ? 'Ubah usulan revisi #' + D.id : 'Buat usulan revisi', 'Basis: RKK posisi ' + tgl(U.basis.versi.posisi) + ' · TA ' + U.basis.versi.tahun + '. Nilai semula selalu diambil dari RKK ini.',
      '<div class="form"><label class="f" for="usJudul">Judul usulan<input type="text" id="usJudul" maxlength="200" value="' + esc(D.judul) + '" placeholder="mis. Pergeseran belanja perjalanan dinas ke belanja bahan FTIK"></label></div>' +
      '<label class="f" for="usAlasan" style="margin-top:10px">Alasan / dasar usulan<textarea id="usAlasan" rows="3" maxlength="5000">' + esc(D.alasan) + '</textarea></label>',
      '<button class="btn" type="button" data-us-ke="daftar">‹ Daftar usulan</button>') +
    card('us-pilih', 'Pilih item dari RKK', 'Hanya anggaran dalam cakupan Anda yang tampil. Item yang diblokir tidak dapat diubah.', '<div class="form">' + pilihKel + '</div>' + tabelItem, '') +
    card('us-baris', 'Daftar perubahan (semula → menjadi)', 'Jumlah menjadi = volume × harga satuan. Usulan harus seimbang per sumber dana.', perubahan + ringkas + kotakPeriksa(h) +
      '<div class="tools" style="margin-top:14px"><button class="btn" type="button" id="usSimpan">Simpan draf</button><button class="btn primary" type="button" id="usAjukan"' + (h.tolak.length ? ' disabled title="Perbaiki dulu hal yang belum memenuhi aturan"' : '') + '>Simpan & ajukan</button></div>', '') +
  '</div>' + ikat();
}

/* ---------- detail ---------- */
function renderDetail(){
  if (!U.detail || U.detail.u.id !== U.id){ muatDetail(U.id); return '<div class="loading">Memuat usulan…</div>'; }
  var d = U.detail, u = d.u, saya = sess(), pemilik = u.dibuat_email === saya.email, adminP = isSuperAdmin();
  if (pemilik) tandaiUsulanDilihat(u.id, u.status);
  var h = u.hasil_periksa || null, sel = d.baris.reduce(function(a, b){ return a + (b.m_jumlah - b.s_jumlah); }, 0);
  var info = '<div class="us-info"><div><span class="note">Status</span>' + pillSt(u.status) + (u.perlu_telaah ? ' <span class="pill st-warn ag-bl"><i></i>Perlu telaah</span>' : '') + '</div>' +
    '<div><span class="note">Unit</span><b>' + (u.lintas_unit ? 'Lintas unit' : esc(u.unit || '—')) + '</b></div><div><span class="note">TA</span><b>' + u.tahun + '</b></div>' +
    '<div><span class="note">Diusulkan oleh</span><b>' + esc(u.dibuat_email) + '</b></div>' + (u.no_revisi ? '<div><span class="note">No. Revisi SAKTI</span><b>' + esc(u.no_revisi) + '</b></div>' : '') + '</div>' +
    (u.alasan ? '<p class="us-alasan"><span class="note">Alasan</span><br>' + esc(u.alasan) + '</p>' : '');
  var tabel = '<div class="tbl"><table><thead><tr><th>Aksi</th><th>Unit · Sub komponen · Akun</th><th>Uraian</th><th class="n">Semula</th><th class="n">Menjadi</th><th class="n">Selisih</th></tr></thead><tbody>' +
    d.baris.map(function(b){ var p = String(b.sub || '').split('.'), d0 = b.m_jumlah - b.s_jumlah;
      return '<tr><td>' + (b.aksi === 'ubah' ? 'Ubah' : b.aksi === 'hapus' ? 'Hapus' : 'Tambah') + '</td><td>' + esc((b.unit || '') + ' · ' + p[p.length - 1] + ' · ' + b.akun + ' ' + sumberNama(b.sumber)) + '</td><td>' + esc(b.uraian) + '</td>' +
        '<td class="n">' + (b.aksi === 'tambah' ? '—' : vol(b.s_volume) + ' ' + esc(b.s_satuan) + ' × ' + rp(b.s_harga) + '<br><b>' + rp(b.s_jumlah) + '</b>') + '</td>' +
        '<td class="n">' + (b.aksi === 'hapus' ? '—' : vol(b.m_volume) + ' ' + esc(b.m_satuan) + ' × ' + rp(b.m_harga) + '<br><b>' + rp(b.m_jumlah) + '</b>') + '</td>' +
        '<td class="n' + (d0 < 0 ? ' neg' : '') + '">' + tanda(d0) + '</td></tr>'; }).join('') +
    '<tr class="tot"><td colspan="3">Jumlah</td><td class="n">' + rp(d.baris.reduce(function(a, b){ return a + b.s_jumlah; }, 0)) + '</td><td class="n">' + rp(d.baris.reduce(function(a, b){ return a + b.m_jumlah; }, 0)) + '</td><td class="n">' + tanda(sel) + '</td></tr></tbody></table></div>';
  var log = '<ol class="us-log">' + d.log.map(function(l){ return '<li><b>' + esc(({ dibuat: 'Dibuat', diajukan: 'Diajukan', dikembalikan: 'Dikembalikan', disetujui: 'Disetujui', ditolak: 'Ditolak', diinput_sakti: 'Diinput ke SAKTI', selesai: 'Selesai' })[l.aksi] || l.aksi) + '</b> · ' +
    esc(String(l.waktu).slice(0, 16).replace('T', ' ')) + ' · ' + esc(l.email) + (l.catatan ? '<br><span class="note">' + esc(l.catatan) + '</span>' : '') + '</li>'; }).join('') + '</ol>';
  /* tindakan sesuai peran & status */
  var aksi = '';
  if ((pemilik || adminP) && (u.status === 'draf' || u.status === 'dikembalikan'))
    aksi += '<div class="tools"><button class="btn" type="button" data-us-edit>Ubah usulan</button><button class="btn primary" type="button" data-us-ajukan>Ajukan</button><button class="btn" type="button" data-us-hapus>Hapus</button></div>';
  if (adminP && u.status === 'diajukan')
    aksi += '<label class="f" for="usCatatan">Catatan (wajib bila dikembalikan/ditolak)<textarea id="usCatatan" rows="2"></textarea></label>' +
      '<div class="tools" style="margin-top:8px"><button class="btn primary" type="button" data-us-proses="setujui">Setujui</button><button class="btn" type="button" data-us-proses="kembalikan">Kembalikan ke pengusul</button><button class="btn danger" type="button" data-us-proses="tolak">Tolak</button></div>';
  if (adminP && (u.status === 'disetujui' || u.status === 'diinput_sakti'))
    aksi += '<div class="form"><label class="f" for="usNo">No. Revisi SAKTI<input type="text" id="usNo" value="' + esc(u.no_revisi) + '" placeholder="mis. 2026.307740.015"></label></div>' +
      '<div class="tools" style="margin-top:8px"><button class="btn primary" type="button" data-us-norev>' + (u.status === 'disetujui' ? 'Catat: sudah diinput ke SAKTI' : 'Perbarui No. Revisi') + '</button></div>';
  if (u.status === 'diinput_sakti') aksi += cocokRKK(d);
  var matriks = '<div class="tools"><button class="btn" type="button" data-us-matriks="pdf">Unduh Matriks (PDF)</button><button class="btn" type="button" data-us-matriks="xlsx">Unduh Matriks (Excel)</button></div>';
  return '<div class="page-sec grid">' +
    card('us-detail', 'Usulan revisi #' + u.id + ' — ' + esc(u.judul), 'TA ' + u.tahun, info + (h && (u.status === 'draf' || u.status === 'dikembalikan' || u.status === 'diajukan') ? kotakPeriksa(h) : '') + matriks,
      '<button class="btn" type="button" data-us-ke="daftar">‹ Daftar usulan</button>') +
    card('us-tabel', 'Semula → menjadi', 'Volume × harga satuan = jumlah.', tabel, '') +
    '<div class="two eq">' + card('us-aksi', 'Tindakan', aksi ? '' : 'Tidak ada tindakan untuk Anda pada status ini.', aksi || '', '') + card('us-riwayat', 'Riwayat', '', log, '') + '</div>' +
  '</div>' + ikat();
}

/* ---------- tahap 7: cocokkan usulan dengan RKK yang lebih baru ---------- */
function cocokRKK(d){
  var u = d.u, vs = (U.basis && U.basis.semua) || null;
  if (!vs){ SB.anggaranVersi().then(function(v){ U.basis = U.basis || {}; U.basis.semua = v; if (HAL_USULAN.indexOf(S.page) >= 0) keepScroll(); }); return '<p class="note">Memeriksa RKK terbaru…</p>'; }
  var basis = vs.filter(function(v){ return v.id === u.versi_id; })[0];
  var baru = vs.filter(function(v){ return v.tahun === u.tahun && (!basis || v.posisi > basis.posisi); });
  if (!baru.length) return '<div class="status-box us-telaah" style="margin-top:12px">Belum ada RKK yang lebih baru dari basis usulan. Setelah revisi ditetapkan di SAKTI, unggah RKK terbaru di Kelola Data untuk mencocokkan.</div>';
  var v = baru[baru.length - 1];
  if (!U.cocok || U.cocok.versi !== v.id){
    SB.anggaranItem(v.id).then(function(rows){ U.cocok = { versi: v.id, rows: rows }; if (HAL_USULAN.indexOf(S.page) >= 0) keepScroll(); });
    return '<p class="note">Mencocokkan dengan RKK ' + tgl(v.posisi) + '…</p>';
  }
  var peta = {}; U.cocok.rows.forEach(function(r){ var k = kunciItem(r); (peta[k] = peta[k] || []).push(r); });
  var hasil = d.baris.map(function(b){
    var ada = peta[kunciItem(b)] || [];
    var ok = b.aksi === 'hapus' ? !ada.some(function(r){ return r.jumlah === b.s_jumlah; }) : ada.some(function(r){ return r.jumlah === b.m_jumlah; });
    return { b: b, ok: ok };
  });
  var semua = hasil.every(function(x){ return x.ok; });
  return '<div class="us-cocok"><b>Pencocokan dengan RKK ' + tgl(v.posisi) + ':</b> ' + (semua ? '<span class="pill st-good"><i></i>Semua baris sudah sesuai</span>' : '<span class="pill st-warn"><i></i>' + hasil.filter(function(x){ return !x.ok; }).length + ' baris belum sesuai</span>') +
    '<ul class="us-list">' + hasil.map(function(x){ return '<li>' + (x.ok ? '✓ ' : '✗ ') + esc(x.b.uraian) + ' — ' + (x.b.aksi === 'hapus' ? 'dihapus' : 'Rp ' + rp(x.b.m_jumlah)) + '</li>'; }).join('') + '</ul>' +
    (isSuperAdmin() ? '<div class="tools"><button class="btn primary" type="button" data-us-selesai' + (semua ? '' : ' title="Tetap bisa diselesaikan bila selisihnya sudah dijelaskan"') + '>Tandai selesai</button></div>' : '') + '</div>';
}

/* ---------- Matriks Usulan Revisi (semula → menjadi) ---------- */
function barisMatriks(d){
  return d.baris.map(function(b, i){ var p = String(b.sub || '').split('.');
    return [i + 1, (b.aksi === 'ubah' ? 'Ubah' : b.aksi === 'hapus' ? 'Hapus' : 'Tambah'), (b.unit || ''), p[p.length - 1] + ' ' + b.akun + ' ' + sumberNama(b.sumber), b.uraian,
      b.aksi === 'tambah' ? '' : vol(b.s_volume) + ' ' + b.s_satuan, b.aksi === 'tambah' ? '' : b.s_harga, b.s_jumlah,
      b.aksi === 'hapus' ? '' : vol(b.m_volume) + ' ' + b.m_satuan, b.aksi === 'hapus' ? '' : b.m_harga, b.m_jumlah, b.m_jumlah - b.s_jumlah]; });
}
var KEPALA_MATRIKS = ['No', 'Aksi', 'Unit', 'Sub komp · Akun · SD', 'Uraian', 'Volume semula', 'Harga semula', 'Jumlah semula', 'Volume menjadi', 'Harga menjadi', 'Jumlah menjadi', 'Selisih'];
function unduhMatriks(jenis){
  var d = U.detail, u = d.u, data = barisMatriks(d), nama = 'Matriks-Usulan-Revisi-' + u.id;
  if (jenis === 'xlsx'){
    var aoa = [['MATRIKS USULAN REVISI ANGGARAN'], [String((BOOT && BOOT.satker) || '') + ' · TA ' + u.tahun], ['Usulan #' + u.id + ': ' + u.judul], ['Status: ' + ((ST[u.status] || [0, u.status])[1]) + (u.no_revisi ? ' · No. Revisi ' + u.no_revisi : '')], [], KEPALA_MATRIKS].concat(data);
    var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 4 }, { wch: 7 }, { wch: 18 }, { wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Matriks'); XLSX.writeFile(wb, nama + '.xlsx'); return;
  }
  muatPdfLib().then(function(){
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth();
    var polos = function(x){ return String(x == null ? '' : x).replace(/[–—−]/g, '-').replace(/[·•]/g, '|').replace(/[^\x20-\x7e -ÿ\n]/g, ''); };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(polos((BOOT && BOOT.satker) || '').toUpperCase(), 36, 34);
    doc.setFontSize(12); doc.text('MATRIKS USULAN REVISI ANGGARAN', W / 2, 60, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(polos('Usulan #' + u.id + ': ' + u.judul + '  |  TA ' + u.tahun + '  |  Status: ' + ((ST[u.status] || [0, u.status])[1]) + (u.no_revisi ? '  |  No. Revisi ' + u.no_revisi : '')), W / 2, 74, { align: 'center' });
    var abu = [232, 234, 237], fmt = function(v){ return typeof v === 'number' ? rp(v).replace(/−/g, '-') : polos(v); };
    doc.autoTable({ startY: 86, theme: 'grid', margin: { left: 36, right: 36 }, head: [KEPALA_MATRIKS], body: data.map(function(r){ return r.map(fmt); }),
      foot: [['', '', '', '', 'JUMLAH', '', '', rp(d.baris.reduce(function(a, b){ return a + b.s_jumlah; }, 0)), '', '', rp(d.baris.reduce(function(a, b){ return a + b.m_jumlah; }, 0)), fmt(d.baris.reduce(function(a, b){ return a + b.m_jumlah - b.s_jumlah; }, 0))]],
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 3, lineColor: [170, 170, 170], lineWidth: .4, textColor: 20 },
      headStyles: { fillColor: abu, textColor: 20, fontStyle: 'bold', halign: 'center' }, footStyles: { fillColor: abu, textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 4: { cellWidth: 150 }, 6: { halign: 'right' }, 7: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' } } });
    var y = doc.lastAutoTable.finalY + 18;
    if (u.alasan){ doc.setFontSize(8.5); doc.text(doc.splitTextToSize(polos('Alasan: ' + u.alasan), W - 72), 36, y); }
    doc.save(nama + '.pdf');
  }).catch(function(e){ toast(errMsg(e), 'err', 'Matriks gagal dibuat'); });
}

/* ---------- interaksi ---------- */
function bind(){
  var pg = $('page'); if (!pg) return;
  var on = function(sel, fn){ [].forEach.call(pg.querySelectorAll(sel), function(el){ el.onclick = function(){ fn(el); }; }); };
  on('[data-us-ke]', function(el){ ke(el.getAttribute('data-us-ke')); });
  if ($('usFlSt')) $('usFlSt').onchange = function(){ FL.status = this.value; keepScroll(); };
  if ($('usFlUnit')) $('usFlUnit').onchange = function(){ FL.unit = this.value; keepScroll(); };
  if ($('usFlTelaah')) $('usFlTelaah').onchange = function(){ FL.telaah = this.checked; keepScroll(); };
  on('[data-us-baru]', function(){ U.draft = null; U.detail = null; ke('edit'); });
  on('[data-us-buka]', function(el){ U.tab = 'pengajuan'; ke('detail', +el.getAttribute('data-us-buka')); });
  on('[data-us-tab]', function(el){ U.tab = el.getAttribute('data-us-tab'); if (U.tab === 'pengajuan'){ U.view = 'daftar'; U.list = null; } HS.v = null; refresh(); });
  if ($('usHistUnit')) $('usHistUnit').onchange = function(){ HS.unit = this.value; keepScroll(); };
  on('[data-us-histori]', function(el){ buatHistori(el); });
  on('[data-us-batal]', function(el){ batalHistori(+el.getAttribute('data-us-batal'), el.getAttribute('data-judul')); });
  on('[data-mo-buka]', function(el){ document.dispatchEvent(new CustomEvent('buka-usulan', { detail: +el.getAttribute('data-mo-buka') })); });
  if ($('moUnit')) $('moUnit').onchange = function(){ MO.unit = this.value; keepScroll(); };
  if ($('moTahun')) $('moTahun').onchange = function(){ MO.tahun = +this.value; MO.unit = ''; keepScroll(); };
  on('[data-us-edit]', function(){ var d = U.detail; U.view = 'edit'; U.draft = null; U.detail = d; refresh(); window.scrollTo(0, 0); });
  var kel = $('usKel'); if (kel) kel.onchange = function(){ U.kelompok = this.value; keepScroll(); };
  var catat = function(){ if ($('usJudul')) U.draft.judul = $('usJudul').value; if ($('usAlasan')) U.draft.alasan = $('usAlasan').value; };
  var cari = function(id){ return U.basis.rows.filter(function(r){ return r.id === id; })[0]; };
  on('[data-us-ubah]', function(el){ catat(); var a = cari(+el.getAttribute('data-us-ubah')); U.draft.baris.push({ aksi: 'ubah', anggaran_id: a.id, a: a, m_volume: a.volume, m_satuan: a.satuan, m_harga: a.harga }); keepScroll(); });
  on('[data-us-hapus-item]', function(el){ catat(); var a = cari(+el.getAttribute('data-us-hapus-item')); U.draft.baris.push({ aksi: 'hapus', anggaran_id: a.id, a: a }); keepScroll(); });
  on('[data-us-tambah]', function(){ catat(); var a = U.basis.rows.filter(function(r){ return kunciKel(r) === U.kelompok; })[0]; if (a) U.draft.baris.push({ aksi: 'tambah', a: a, uraian: '', judul: a.judul, m_volume: '', m_satuan: '', m_harga: '' }); keepScroll(); });
  on('[data-us-buang]', function(el){ catat(); U.draft.baris.splice(+el.getAttribute('data-us-buang'), 1); keepScroll(); });
  [].forEach.call(pg.querySelectorAll('[data-us-i]'), function(el){
    el.onchange = function(){ catat(); var b = U.draft.baris[+el.getAttribute('data-us-i')], f = el.getAttribute('data-us-f'), v = el.value.trim();
      b[f] = (f === 'm_volume' || f === 'm_harga') ? (v === '' ? '' : Number(v.replace(/\./g, '').replace(',', '.'))) : v; keepScroll(); };
  });
  var kirim = function(ajukan, btn){
    catat(); var D = U.draft;
    var baris = D.baris.map(function(b){ return { aksi: b.aksi, anggaran_id: b.anggaran_id || null, prog: b.a.prog, kro: b.a.kro, ro: b.a.ro, sub: b.a.sub, akun: b.a.akun, uraian: b.uraian || '', judul: b.judul || '', m_volume: b.m_volume, m_satuan: b.m_satuan || '', m_harga: b.m_harga }; });
    btn.disabled = true;
    SB.simpanUsulan(D.id, U.basis.versi.id, D.judul, D.alasan, baris).then(function(r){
      D.id = r.id;
      return ajukan ? SB.ajukanUsulan(r.id).then(function(){ return 'Usulan #' + r.id + ' diajukan ke Admin perencanaan.'; }) : 'Draf usulan #' + r.id + ' disimpan.';
    }).then(function(pesan){ toast(pesan, 'ok', ajukan ? 'Usulan diajukan' : 'Draf disimpan'); U.draft = null; muatNotifUsulan(); ke('detail', D.id); })
      .catch(function(e){ btn.disabled = false; toast(errMsg(e), 'err', 'Usulan belum tersimpan'); });
  };
  if ($('usSimpan')) $('usSimpan').onclick = function(){ kirim(false, this); };
  if ($('usAjukan')) $('usAjukan').onclick = function(){ kirim(true, this); };
  var muatUlang = function(pesan, judul){ toast(pesan, 'ok', judul); var id = U.id; U.detail = null; U.list = null; muatNotifUsulan(); ke('detail', id); };
  on('[data-us-ajukan]', function(el){ el.disabled = true; SB.ajukanUsulan(U.id).then(function(){ muatUlang('Usulan diajukan ke Admin perencanaan.', 'Usulan diajukan'); }).catch(function(e){ el.disabled = false; toast(errMsg(e), 'err', 'Belum dapat diajukan'); }); });
  on('[data-us-hapus]', function(){ tanya({ judul: 'Hapus usulan #' + U.id + '?', pesan: 'Usulan dan seluruh barisnya dihapus.', ya: 'Hapus' }).then(function(ya){ if (!ya) return; SB.hapusUsulan(U.id).then(function(){ toast('Usulan dihapus.', 'ok', 'Usulan dihapus'); ke('daftar'); }).catch(function(e){ toast(errMsg(e), 'err', 'Gagal menghapus'); }); }); });
  on('[data-us-proses]', function(el){
    var aksi = el.getAttribute('data-us-proses'), cat = $('usCatatan') ? $('usCatatan').value : '';
    var judul = { setujui: 'Setujui usulan #' + U.id + '?', kembalikan: 'Kembalikan usulan #' + U.id + ' ke pengusul?', tolak: 'Tolak usulan #' + U.id + '?' }[aksi];
    tanya({ judul: judul, pesan: aksi === 'setujui' ? 'Usulan disetujui dan siap diinput ke SAKTI.' : 'Pengusul akan melihat catatan Anda.', ya: { setujui: 'Setujui', kembalikan: 'Kembalikan', tolak: 'Tolak' }[aksi], bahaya: aksi === 'tolak' }).then(function(ya){
      if (!ya) return; el.disabled = true;
      SB.prosesUsulan(U.id, aksi, cat).then(function(r){ muatUlang('Status usulan: ' + ((ST[r.status] || [0, r.status])[1]) + '.', 'Usulan diproses'); }).catch(function(e){ el.disabled = false; toast(errMsg(e), 'err', 'Gagal memproses'); });
    });
  });
  on('[data-us-norev]', function(el){ el.disabled = true; SB.catatNoRevisi(U.id, $('usNo').value, '').then(function(){ muatUlang('No. Revisi SAKTI dicatat.', 'Diinput ke SAKTI'); }).catch(function(e){ el.disabled = false; toast(errMsg(e), 'err', 'Gagal mencatat'); }); });
  on('[data-us-selesai]', function(el){ el.disabled = true; SB.selesaikanUsulan(U.id, 'Dicocokkan dengan RKK terbaru').then(function(){ muatUlang('Usulan selesai.', 'Usulan selesai'); }).catch(function(e){ el.disabled = false; toast(errMsg(e), 'err', 'Gagal'); }); });
  on('[data-us-matriks]', function(el){ unduhMatriks(el.getAttribute('data-us-matriks')); });
}
export function renderKelolaUsulan(){ return renderUsulan(); }

/* ================= tahap 8: Status Histori (tombol "Usulan Revisi") ================= */
var AKTIF = ['draf', 'diajukan', 'dikembalikan', 'disetujui'];
var HS = { v: null, rows: null, units: null, unit: '', memuat: false, err: null };
function kunciUnit(kat, unit){ return (kat || '') + '|' + (unit || ''); }
/* DIPA terakhir = versi RKK terbaru pada tahun anggaran terbaru */
function versiTerakhir(vs){ if (!vs.length) return null; var th = Math.max.apply(null, vs.map(function(v){ return v.tahun; })); var s = vs.filter(function(v){ return v.tahun === th; }); return s[s.length - 1]; }
function daftarUnit(rows){
  var m = {}, l = [];
  rows.forEach(function(r){ var k = kunciUnit(r.kategori, r.unit); if (!m[k]){ m[k] = { k: k, kat: r.kategori || '', unit: r.unit || '', nama: r.unit || r.kategori || '—', pagu: 0 }; l.push(m[k]); } m[k].pagu += r.jumlah; });
  return l.sort(function(a, b){ return a.nama < b.nama ? -1 : 1; });
}
function muatHistori(){
  if (HS.memuat) return; HS.memuat = true; HS.err = null;
  Promise.all([SB.anggaranVersi(), SB.usulanDaftar()]).then(function(r){
    var v = versiTerakhir(r[0]); U.list = r[1];
    if (!v) throw new Error('Belum ada RKK. Admin perencanaan perlu mengunggah RKK lebih dulu.');
    return SB.anggaranItem(v.id).then(function(rows){ HS.v = v; HS.rows = rows; HS.units = daftarUnit(rows); });
  }).then(function(){ HS.memuat = false; if (S.page === 'anggaran-usulan') refresh(); })
    .catch(function(e){ HS.memuat = false; HS.err = errMsg(e); if (S.page === 'anggaran-usulan') refresh(); });
}
function usulanAktif(tahun, un){
  return (U.list || []).filter(function(u){ return u.tahun === tahun && kunciUnit(u.kategori, u.unit) === un.k && AKTIF.indexOf(u.status) >= 0; })[0] || null;
}
function renderHistori(){
  var judulKartu = 'Memilih Status Histori';
  if (HS.err) return '<div class="page-sec grid">' + card('us-hist', judulKartu, '', '<p class="note">' + esc(HS.err) + '</p>', '') + '</div>' + ikat();
  if (!HS.v || !U.list){ muatHistori(); return '<div class="loading">Memuat status histori…</div>'; }
  var v = HS.v, units = HS.units;
  if (!units.length) return '<div class="page-sec grid">' + card('us-hist', judulKartu, labelVersi(v), '<div class="empty">Tidak ada anggaran dalam cakupan Anda pada ' + esc(labelVersi(v)) + '.</div>', '') + '</div>' + ikat();
  if (!units.some(function(x){ return x.k === HS.unit; })) HS.unit = units[0].k;
  var un = units.filter(function(x){ return x.k === HS.unit; })[0], aktif = usulanAktif(v.tahun, un);
  var dipa = labelVersi(v) + ' — ' + tgl(v.posisi), noBaru = (v.revisi_ke || 0) + 1;
  var tujuan = aktif ? aktif.judul + ' (' + (ST[aktif.status] || [0, aktif.status])[1] + ')' : 'Usulan Revisi ke ' + noBaru;
  var info = '<dl class="us-hist-info"><dt>Revisi Terakhir</dt><dd>' + esc(aktif ? aktif.judul + ' · ' + (ST[aktif.status] || [0, aktif.status])[1] : dipa) + '</dd>' +
    '<dt>DIPA Terakhir</dt><dd>' + esc(dipa) + ' · TA ' + v.tahun + '</dd><dt>Pagu unit</dt><dd>Rp ' + rp(un.pagu) + '</dd></dl>';
  var form = '<div class="form us-hist-form">' +
    (units.length > 1 ? '<label class="f" for="usHistUnit">Unit<select id="usHistUnit">' + units.map(function(x){ return '<option value="' + esc(x.k) + '"' + (x.k === HS.unit ? ' selected' : '') + '>' + esc(x.nama + (x.unit && x.kat ? ' (' + x.kat + ')' : '')) + '</option>'; }).join('') + '</select></label>' : '') +
    '<label class="f" for="usHistAwal">Histori Awal<select id="usHistAwal" disabled><option>' + esc(labelVersi(v)) + '</option></select></label>' +
    '<label class="f" for="usHistTujuan">Histori Tujuan<select id="usHistTujuan" disabled><option>' + esc(tujuan) + '</option></select></label>' +
    (bolehBuat() ? '<div><button class="btn primary" type="button" data-us-histori' + (aktif ? ' disabled title="Unit ini masih memiliki usulan aktif"' : '') + '>Usulan Revisi</button></div>' : '') + '</div>';
  var ket;
  if (!aktif) ket = '<div class="status-box us-telaah">Klik <b>Usulan Revisi</b> untuk membentuk <b>Usulan Revisi ke ' + noBaru + '</b> dari ' + esc(labelVersi(v)) + '. Seluruh rincian anggaran ' + esc(un.nama) + ' disalin sebagai bahan revisi; DIPA aslinya tidak berubah. Satu unit hanya dapat memiliki satu usulan aktif.</div>';
  else if (aktif.status === 'draf' || aktif.status === 'dikembalikan') ket = '<div class="status-box s-ok"><div><b>' + esc(aktif.judul) + '</b> sedang disusun (' + (ST[aktif.status] || [0, aktif.status])[1] + '). Lakukan perubahan anggaran, lalu ajukan lewat tab <b>Pengajuan Revisi</b>. Riwayatnya tampil di menu Monitoring Submit &amp; Approve.' +
    '<div class="tools" style="margin-top:10px"><button class="btn" type="button" data-us-buka="' + aktif.id + '">Buka usulan</button>' +
    (aktif.dibuat_email === sess().email || isSuperAdmin() ? '<button class="btn danger" type="button" data-us-batal="' + aktif.id + '" data-judul="' + esc(aktif.judul) + '">Batalkan usulan</button>' : '') + '</div></div></div>';
  else ket = '<div class="status-box us-telaah"><div><b>' + esc(aktif.judul) + '</b> sedang diproses Admin perencanaan (' + (ST[aktif.status] || [0, aktif.status])[1] + '). Usulan baru dapat dibentuk setelah No. Revisi SAKTI dicatat.' +
    '<div class="tools" style="margin-top:10px"><button class="btn" type="button" data-us-buka="' + aktif.id + '">Lihat usulan</button></div></div></div>';
  return '<div class="page-sec grid">' + card('us-hist', judulKartu, 'Bentuk usulan revisi dari DIPA terakhir, seperti menu Memilih Status History di SAKTI.', info + form + ket, '') + '</div>' + ikat();
}
function buatHistori(btn){
  var v = HS.v, un = HS.units.filter(function(x){ return x.k === HS.unit; })[0];
  tanya({ judul: 'Bentuk Usulan Revisi ke ' + ((v.revisi_ke || 0) + 1) + '?', pesan: 'Rincian anggaran ' + un.nama + ' pada ' + labelVersi(v) + ' (Rp ' + rp(un.pagu) + ') disalin menjadi bahan usulan revisi.', ya: 'Usulan Revisi' }).then(function(ya){
    if (!ya) return; btn.disabled = true;
    SB.buatHistori(v.id, un.kat, un.unit).then(function(r){
      toast(r.judul + ' terbentuk untuk ' + un.nama + ': ' + rp(r.item) + ' item, pagu Rp ' + rp(r.pagu) + '.', 'ok', 'Usulan revisi aktif');
      U.list = null; HS.v = null; MO.data = null; muatNotifUsulan(); refresh();
    }).catch(function(e){ btn.disabled = false; toast(errMsg(e), 'err', 'Usulan belum terbentuk'); });
  });
}
function batalHistori(id, judul){
  tanya({ judul: 'Batalkan ' + judul + '?', pesan: 'Usulan beserta salinan rincian anggarannya dihapus. DIPA tidak berubah.', ya: 'Batalkan usulan', bahaya: true }).then(function(ya){
    if (!ya) return;
    SB.hapusUsulan(id).then(function(){ toast(judul + ' dibatalkan.', 'ok', 'Usulan dibatalkan'); U.list = null; HS.v = null; MO.data = null; muatNotifUsulan(); refresh(); })
      .catch(function(e){ toast(errMsg(e), 'err', 'Gagal membatalkan'); });
  });
}

/* ================= tahap 8: Monitoring Submit & Approve ================= */
var MO = { data: null, unit: '', tahun: 0, memuat: false, err: null };
function pemilik(st){ return st === 'draf' || st === 'dikembalikan' ? 'Unit' : st === 'diajukan' || st === 'disetujui' ? 'Admin perencanaan' : st === 'ditolak' ? '—' : 'SAKTI'; }
function muatMonitor(){
  if (MO.memuat) return; MO.memuat = true; MO.err = null;
  Promise.all([SB.anggaranVersi(), SB.paguUnitVersi(), SB.usulanDaftar()]).then(function(r){
    MO.data = { versi: r[0], pagu: r[1] }; U.list = r[2]; MO.memuat = false; if (S.page === 'anggaran-monitor') refresh();
  }).catch(function(e){ MO.memuat = false; MO.err = errMsg(e); if (S.page === 'anggaran-monitor') refresh(); });
}
export function renderMonitor(){
  var judul = 'Monitoring Submit & Approve';
  if (MO.err) return '<div class="page-sec grid">' + card('mo', judul, '', '<p class="note">' + esc(MO.err) + '</p>', '') + '</div>' + ikat();
  if (!MO.data || !U.list){ muatMonitor(); return '<div class="loading">Memuat riwayat usulan…</div>'; }
  var vs = MO.data.versi;
  if (!vs.length) return '<div class="page-sec grid">' + card('mo', judul, '', '<div class="empty">Belum ada RKK. Admin perencanaan perlu mengunggah RKK lebih dulu.</div>', '') + '</div>' + ikat();
  var thn = []; vs.forEach(function(v){ if (thn.indexOf(v.tahun) < 0) thn.push(v.tahun); }); thn.sort();
  if (thn.indexOf(MO.tahun) < 0) MO.tahun = thn[thn.length - 1];
  var vTh = vs.filter(function(v){ return v.tahun === MO.tahun; }), idTh = vTh.map(function(v){ return v.id; });
  /* unit yang terlihat (RLS): dari pagu per versi tahun itu */
  var um = {}, units = [];
  MO.data.pagu.forEach(function(p){ if (idTh.indexOf(p.versi_id) < 0) return; var k = kunciUnit(p.kategori, p.unit); if (!um[k]){ um[k] = { k: k, kat: p.kategori || '', unit: p.unit || '', nama: p.unit || p.kategori || '—' }; units.push(um[k]); } });
  units.sort(function(a, b){ return a.nama < b.nama ? -1 : 1; });
  if (!units.length) return '<div class="page-sec grid">' + card('mo', judul, '', '<div class="empty">Tidak ada anggaran dalam cakupan Anda pada TA ' + MO.tahun + '.</div>', '') + '</div>' + ikat();
  if (!um[MO.unit]) MO.unit = units[0].k;
  var paguV = {}; MO.data.pagu.forEach(function(p){ if (kunciUnit(p.kategori, p.unit) === MO.unit) paguV[p.versi_id] = p.pagu; });
  var baris = vTh.map(function(v){ return { t: v.posisi, h: labelVersi(v), asal: v.revisi_ke ? 'DIPA – Revisi ke ' + (v.revisi_ke - 1) : '', o: 'SAKTI', pagu: paguV[v.id] || 0, st: '<span class="pill st-good"><i></i>DIPA</span>', id: null }; });
  U.list.filter(function(u){ return u.tahun === MO.tahun && kunciUnit(u.kategori, u.unit) === MO.unit; }).forEach(function(u){
    baris.push({ t: String(u.diubah_pada || u.dibuat_pada || '').slice(0, 10), w: String(u.diubah_pada || '').slice(11, 16), h: u.judul, asal: u.revisi_ke ? 'DIPA – Revisi ke ' + (u.revisi_ke - 1) : '',
      o: pemilik(u.status), pagu: u.histori ? u.pagu_usulan : null, st: pillSt(u.status) + (u.perlu_telaah ? ' <span class="pill st-warn ag-bl"><i></i>Perlu telaah</span>' : '') + (u.no_revisi ? '<br><span class="note">No. Revisi ' + esc(u.no_revisi) + '</span>' : ''), id: u.id });
  });
  baris.sort(function(a, b){ return a.t < b.t ? 1 : a.t > b.t ? -1 : (a.id ? -1 : 1); });
  var saring = '<div class="form noprint us-saring">' +
    (thn.length > 1 ? '<label class="f" for="moTahun">Tahun anggaran<select id="moTahun">' + thn.map(function(t){ return '<option value="' + t + '"' + (t === MO.tahun ? ' selected' : '') + '>TA ' + t + '</option>'; }).join('') + '</select></label>' : '') +
    (units.length > 1 ? '<label class="f" for="moUnit">Unit<select id="moUnit">' + units.map(function(x){ return '<option value="' + esc(x.k) + '"' + (x.k === MO.unit ? ' selected' : '') + '>' + esc(x.nama + (x.unit && x.kat ? ' (' + x.kat + ')' : '')) + '</option>'; }).join('') + '</select></label>' : '') + '</div>';
  var tabel = '<div class="tbl"><table><thead><tr><th>Status-History</th><th>Sumber</th><th>Owner</th><th>Tanggal</th><th class="n">Pagu unit</th><th>Status</th><th></th></tr></thead><tbody>' +
    baris.map(function(b){ return '<tr><td><b>' + esc(b.h) + '</b></td><td>' + esc(b.asal) + '</td><td>' + esc(b.o) + '</td><td>' + tgl(b.t) + (b.w ? '<br><span class="note">' + esc(b.w) + '</span>' : '') + '</td>' +
      '<td class="n">' + (b.pagu == null ? '—' : rp(b.pagu)) + '</td><td>' + b.st + '</td><td>' + (b.id ? '<button class="btn" type="button" data-mo-buka="' + b.id + '">Buka</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  return '<div class="page-sec grid">' + card('mo', judul, 'Riwayat DIPA dan usulan revisi unit, terbaru di atas. Owner = pihak yang sedang memegang usulan.', saring + tabel, '') + '</div>' + ikat();
}
