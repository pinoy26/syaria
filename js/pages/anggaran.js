/* js/pages/anggaran.js — Monev Anggaran: Ringkasan Anggaran, Anggaran per Unit, Rincian Anggaran (RKK)
   Sumber data: versi RKK yang diunggah di Kelola Data (tabel anggaran_versi & anggaran).
   Fakultas/unit otomatis hanya menerima item di cakupannya (RLS di database). */
import { $, esc, rp, pc, tgl, errMsg } from '../utils.js?v=202611150527';
import { S, DB, SRC, A2, FAK_ORDER, FAK_FULL, isUnitUser, unitCaption } from '../state.js?v=202611150527';
import { card, IC, daftarPohon } from '../ui-components.js?v=202611150527';
import { SB } from '../api.js?v=202611150527';
import { refresh } from '../nav.js?v=202611150527';

export var HAL_ANGGARAN = ['anggaran', 'anggaran-unit', 'anggaran-rkk'];
var AG = { versi: null, id: null, rows: null, rowsId: null, memuat: false, err: null };

/* ---------- pemuatan data ---------- */
function versiAktif(){ return (AG.versi || []).filter(function(v){ return v.id === AG.id; })[0] || null; }
function pilihVersiAwal(){
  var vs = AG.versi || []; if (!vs.length) return null;
  var th = DB && DB.periode ? +DB.periode.slice(0, 4) : null;
  var sama = vs.filter(function(v){ return v.tahun === th; });
  return (sama.length ? sama : vs)[(sama.length ? sama : vs).length - 1].id;
}
function muat(){
  if (AG.memuat) return;
  AG.memuat = true; AG.err = null;
  var langkah = AG.versi ? Promise.resolve(AG.versi) : SB.anggaranVersi();
  langkah.then(function(vs){
    AG.versi = vs;
    if (!AG.id || !versiAktif()) AG.id = pilihVersiAwal();
    if (!AG.id) return [];
    return SB.anggaranItem(AG.id);
  }).then(function(rs){
    AG.rows = rs; AG.rowsId = AG.id; AG.memuat = false;
    if (HAL_ANGGARAN.indexOf(S.page) >= 0) refresh();
  }).catch(function(e){
    AG.memuat = false; AG.err = errMsg(e);
    if (HAL_ANGGARAN.indexOf(S.page) >= 0) refresh();
  });
}
/* dipanggil setelah unggah/hapus RKK agar data dimuat ulang */
export function lupakanAnggaran(){ AG.versi = null; AG.rows = null; AG.rowsId = null; AG.id = null; }
function siap(){
  if (AG.err) return '<div class="glass card"><h2>Data anggaran gagal dimuat</h2><p class="note">' + esc(AG.err) + '</p></div>';
  if (AG.versi && !AG.versi.length) return '<div class="glass card"><h2>Belum ada RKK</h2><p class="note">Admin perencanaan belum mengunggah Rincian Kertas Kerja Satker (RKK). Setelah diunggah di Kelola Data, rincian anggaran tampil di sini.</p></div>';
  if (!AG.rows || AG.rowsId !== AG.id){ muat(); return '<div class="loading">Memuat data anggaran…</div>'; }
  return null;
}
/* pemilih versi RKK (di kepala kartu pertama) */
function pilihVersi(){
  var vs = (AG.versi || []).slice().reverse();
  return '<label class="f ag-versi" for="agVersi"><span class="sr-only">Versi RKK</span><select id="agVersi">' +
    vs.map(function(v){ return '<option value="' + v.id + '"' + (v.id === AG.id ? ' selected' : '') + '>RKK ' + tgl(v.posisi) + ' · TA ' + v.tahun + '</option>'; }).join('') + '</select></label>';
}
export function bindAnggaran(){
  var s = $('agVersi');
  if (s) s.onchange = function(){ AG.id = +this.value; AG.rows = null; S.open = {}; refresh(); };
}

/* ---------- format ---------- */
function vol(v){ return v == null ? '' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }
function jml(rs){ return rs.reduce(function(a, r){ return a + r.jumlah; }, 0); }
function bersih(k){ return String(k == null ? '' : k).replace(/\//g, '∕'); } /* "/" dipakai sebagai pemisah id baris */
function kodeNama(kode, nama){ return '<b class="code">' + esc(kode) + '</b> ' + esc(nama || ''); }
function urutUnit(a, b){
  var ia = FAK_ORDER.indexOf(a), ib = FAK_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0 || ib >= 0) return ia >= 0 ? -1 : 1; return a < b ? -1 : 1;
}

/* level tabel bertingkat anggaran (kunci dari kolom baris RKK, label dari nama di RKK) */
var LA = {
  prog: { lvl: 'Program', key: function(r){ return bersih(r.prog); }, label: function(k, r){ return kodeNama(r.prog, r.prog_n); } },
  keg:  { lvl: 'Kegiatan', key: function(r){ return bersih(r.keg); }, label: function(k, r){ return kodeNama(r.keg, r.keg_n); } },
  kro:  { lvl: 'KRO', key: function(r){ return bersih(r.kro); }, label: function(k, r){ return kodeNama(r.kro, r.kro_n); } },
  ro:   { lvl: 'RO', key: function(r){ return bersih(r.ro); }, label: function(k, r){ return kodeNama(r.ro, r.ro_n); } },
  komp: { lvl: 'Komponen', key: function(r){ return bersih(r.komp); }, label: function(k, r){ return kodeNama(r.komp, r.komp_n); } },
  sub:  { lvl: 'Sub Komp', key: function(r){ return bersih(r.ro + '|' + r.sub); }, label: function(k, r){ var p = String(r.sub || '').split('.'); return kodeNama(p[p.length - 1], r.sub_n); } },
  akun: { lvl: 'Akun', key: function(r){ return bersih(r.akun); }, label: function(k, r){ return kodeNama(r.akun, r.akun_n) + ' <span class="chip ag-sd">' + (r.sumber === 'PNP' ? 'PNBP' : esc(r.sumber || '?')) + '</span>'; } },
  judul:{ lvl: '>', key: function(r){ return bersih(r.judul || '(tanpa judul)'); }, label: function(k, r){ return esc(r.judul || '(tanpa judul)'); } },
  kat:  { lvl: 'Kategori', key: function(r){ return bersih(r.kategori || '?'); }, label: function(k){ return esc(k); }, sort: function(a, b){ return a === 'Fakultas' ? -1 : b === 'Fakultas' ? 1 : (a < b ? -1 : 1); } },
  unit: { lvl: 'Unit', key: function(r){ return bersih(r.unit || '?'); }, label: function(k){ return '<b>' + esc(k) + '</b>' + (FAK_FULL[k] ? ' <span class="note">' + esc(FAK_FULL[k]) + '</span>' : ''); }, sort: urutUnit }
};

/* tabel bertingkat anggaran: Uraian | Volume | Satuan | Harga satuan | Jumlah | Blokir */
function pohon(id, R, levels){
  daftarPohon(id, R, levels);
  var out = [];
  var kolomKel = function(rs){
    var nb = rs.filter(function(r){ return r.blokir; }).length;
    return '<td></td><td></td><td></td><td class="n">' + rp(jml(rs)) + '</td><td class="stc">' + (nb ? '<span class="pill st-warn ag-bl"><i></i>' + nb + '</span>' : '') + '</td>';
  };
  (function walk(rs, depth, pid){
    var L = levels[depth], m = {}, order = [];
    rs.forEach(function(r){ var k = L.key(r); if (!m[k]){ m[k] = []; order.push(k); } m[k].push(r); });
    if (L.sort) order.sort(L.sort);
    order.forEach(function(k){
      var nid = pid + '/' + k, open = !!S.open[nid], ind = depth * 18, rr = m[k];
      out.push('<tr class="tree l' + Math.min(depth, 3) + '"><td><span class="tw" style="padding-left:' + ind + 'px"><button type="button" data-tog="' + esc(nid) + '" aria-expanded="' + open + '" aria-label="Buka atau tutup">' + IC.chev + '</button><span class="lvl">' + esc(L.lvl) + '</span><span class="tw-label">' + L.label(k, rr[0]) + '</span></span></td>' + kolomKel(rr) + '</tr>');
      if (!open) return;
      if (depth < levels.length - 1) walk(rr, depth + 1, nid);
      else rr.slice().sort(function(a, b){ return a.urutan - b.urutan; }).forEach(function(r){
        out.push('<tr class="leaf' + (r.blokir ? ' ag-blokir' : '') + '"><td><span style="padding-left:' + (ind + 44) + 'px;display:inline-block">' + esc(r.uraian) +
          (r.judul2 ? ' <span class="note">· ' + esc(r.judul2) + '</span>' : '') + '</span></td>' +
          '<td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n">' + rp(r.jumlah) + '</td>' +
          '<td class="stc">' + (r.blokir ? '<span class="pill st-warn ag-bl" title="Item ini kena blokir (tanda * di RKK)"><i></i>Blokir</span>' : '') + '</td></tr>');
      });
    });
  })(R, 0, id);
  var search = '<span class="tree-search">' + IC.search + '<input type="text" data-search-input="' + id + '" placeholder="Cari nama…" aria-label="Cari nama"><span class="tree-search-count" data-search-count="' + id + '"></span>' +
    '<button type="button" class="icon" data-search-prev="' + id + '" aria-label="Hasil sebelumnya">' + IC.up + '</button>' +
    '<button type="button" class="icon" data-search-next="' + id + '" aria-label="Hasil berikutnya">' + IC.down + '</button></span>';
  return '<div class="tools noprint" style="margin-bottom:10px"><button class="btn" type="button" data-openall="' + id + '">Buka satu tingkat</button><button class="btn" type="button" data-expandall="' + id + '">Buka semua</button><button class="btn" type="button" data-closeall="' + id + '">Tutup semua</button>' + search + '</div>' +
    '<div class="tbl tbl-grid"><table><thead><tr><th>Uraian</th><th class="n">Volume</th><th>Satuan</th><th class="n">Harga satuan</th><th class="n">Jumlah</th><th class="stc">Blokir</th></tr></thead><tbody>' + out.join('') +
    '<tr class="tot"><td>Jumlah</td><td></td><td></td><td></td><td class="n">' + rp(jml(R)) + '</td><td class="stc">' + (R.filter(function(r){ return r.blokir; }).length || '') + '</td></tr></tbody></table></div>';
}
function keterangan(){
  var v = versiAktif();
  return v ? 'RKK posisi ' + tgl(v.posisi) + ' · TA ' + v.tahun + (isUnitUser() ? ' · cakupan ' + esc(unitCaption()) : '') : '';
}

/* ================= Ringkasan Anggaran ================= */
export function renderAnggaran(){
  var t = siap(); if (t) return t;
  var R = AG.rows, total = jml(R), bl = R.filter(function(r){ return r.blokir; });
  var grup = function(fn){ var m = {}, o = []; R.forEach(function(r){ var k = fn(r); if (!m[k]){ m[k] = []; o.push(k); } m[k].push(r); }); return o.map(function(k){ return { key: k, rows: m[k], jumlah: jml(m[k]) }; }); };
  var baris = function(nama, g, warna){
    var p = total ? g.jumlah / total : 0;
    return '<div class="ubar"><span class="n"><span class="un">' + nama + '</span><span class="note num">Rp ' + rp(g.jumlah) + '</span></span>' +
      '<span class="track"><span class="fill" style="width:' + (p * 100).toFixed(2) + '%;background:' + warna + '"></span></span><span class="pct">' + pc(p) + '</span></div>';
  };
  var src = grup(function(r){ return r.sumber || '?'; }).sort(function(a, b){ return a.key === 'RM' ? -1 : b.key === 'RM' ? 1 : 0; });
  var jb = grup(function(r){ return r.a2; }).sort(function(a, b){ return a.key < b.key ? -1 : 1; });
  var un = grup(function(r){ return (r.kategori || '?') + '|' + (r.unit || '?'); });
  var fak = un.filter(function(g){ return g.key.indexOf('Fakultas|') === 0; }).sort(function(a, b){ return urutUnit(a.key.split('|')[1], b.key.split('|')[1]); });
  var rek = un.filter(function(g){ return g.key.indexOf('Fakultas|') !== 0; }).sort(function(a, b){ return b.jumlah - a.jumlah; });
  var srcCol = function(k){ return k === 'RM' ? 'var(--rm)' : k === 'PNP' ? 'var(--pnbp)' : 'var(--muted)'; };
  var tile = function(lbl, nilai, ket){ return '<div class="ag-tile"><span>' + lbl + '</span><b>' + nilai + '</b>' + (ket ? '<small>' + ket + '</small>' : '') + '</div>'; };
  var ringkas = '<div class="ag-tiles">' +
    tile('Pagu anggaran (RKK)', '<small>Rp</small> ' + rp(total), 'Termasuk pagu yang diblokir') +
    tile('Item detail', rp(R.length), 'Dalam ' + rp(grup(function(r){ return r.ro + '|' + r.sub; }).length) + ' sub komponen') +
    tile('Item bertanda blokir (*)', rp(bl.length), bl.length ? 'Pagu item: Rp ' + rp(jml(bl)) + ' · nilai blokir dihitung di tahap berikut' : 'Tidak ada item yang diblokir') +
  '</div>';
  var h = '<div class="page-sec grid">' +
    card('ag-ring', 'Ringkasan anggaran', keterangan(), ringkas, pilihVersi()) +
    '<div class="two eq">' +
      card('ag-src', 'Anggaran per sumber dana', 'Porsi pagu tiap sumber dana.', '<div class="ubars">' + src.map(function(g){ return baris('<i class="dot" style="background:' + srcCol(g.key) + '"></i>' + esc(SRC[g.key] || g.key), g, srcCol(g.key)); }).join('') + '</div>', '') +
      card('ag-jb', 'Anggaran per jenis belanja', 'Akun 51, 52, 53.', '<div class="ubars">' + jb.map(function(g){ return baris('<span class="code">' + esc(g.key) + '</span> ' + esc(A2(g.key)), g, 'var(--real)'); }).join('') + '</div>', '') +
    '</div>' +
    card('ag-unit', 'Anggaran per unit kerja', 'Fakultas dan unit Rektorat. Rincian item ada di menu Anggaran per Unit.',
      '<div class="ubars">' + (fak.length ? '<div class="sec">Fakultas · Rp ' + rp(fak.reduce(function(a, g){ return a + g.jumlah; }, 0)) + '</div>' + fak.map(function(g){ return baris(esc(g.key.split('|')[1]), g, 'var(--real)'); }).join('') : '') +
      (rek.length ? '<div class="sec">Rektorat · Rp ' + rp(rek.reduce(function(a, g){ return a + g.jumlah; }, 0)) + '</div>' + rek.map(function(g){ return baris(esc(g.key.split('|')[1]), g, 'var(--real)'); }).join('') : '') + '</div>', '') +
  '</div>';
  setTimeout(bindAnggaran, 0);
  return h;
}

/* ================= Anggaran per Unit ================= */
export function renderAnggaranUnit(){
  var t = siap(); if (t) return t;
  setTimeout(bindAnggaran, 0);
  return '<div class="page-sec grid">' + card('ag-t-unit', 'Anggaran per unit kerja', keterangan() + ' · Kategori → Unit → Komponen → Sub komponen → Akun → Judul → Item.',
    pohon('ag-t-unit', AG.rows, [LA.kat, LA.unit, LA.komp, LA.sub, LA.akun, LA.judul]), pilihVersi()) + '</div>';
}

/* ================= Rincian Anggaran (RKK) — susunan seperti SAKTI ================= */
export function renderAnggaranRKK(){
  var t = siap(); if (t) return t;
  setTimeout(bindAnggaran, 0);
  return '<div class="page-sec grid">' + card('ag-t-rkk', 'Rincian anggaran (RKK)', keterangan() + ' · Program → Kegiatan → KRO → RO → Komponen → Sub komponen → Akun → Judul → Item.',
    pohon('ag-t-rkk', AG.rows, [LA.prog, LA.keg, LA.kro, LA.ro, LA.komp, LA.sub, LA.akun, LA.judul]), pilihVersi()) + '</div>';
}
