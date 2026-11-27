/* js/pages/anggaran.js — Monev Anggaran: Ringkasan Anggaran, Anggaran per Unit, Rincian Anggaran (RKK)
   Sumber data: versi RKK yang diunggah di Kelola Data (tabel anggaran_versi & anggaran).
   Fakultas/unit otomatis hanya menerima item di cakupannya (RLS di database). */
import { $, esc, rp, pc, tgl, labelVersi, errMsg } from '../utils.js?v=202611270923';
import { S, DB, ALL, SRC, A2, FAK_ORDER, FAK_FULL, isUnitUser, unitCaption, KODE_KL, KODE_IND } from '../state.js?v=202611270923';
import { card, IC, daftarPohon } from '../ui-components.js?v=202611270923';
import { SB } from '../api.js?v=202611270923';
import { refresh } from '../nav.js?v=202611270923';
import { hitungBlokir } from '../blokir.js?v=202611270923';
import { renderRedesain } from './redesain.js?v=202611270923';

export var HAL_ANGGARAN = ['anggaran', 'anggaran-unit', 'anggaran-rkk', 'anggaran-revisi', 'anggaran-usulan', 'anggaran-monitor', 'kelola-usulan'];
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
export function lupakanAnggaran(){ AG.versi = null; AG.rows = null; AG.rowsId = null; AG.id = null; SB.lupakanCacheAnggaran(); }
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
    vs.map(function(v){ return '<option value="' + v.id + '"' + (v.id === AG.id ? ' selected' : '') + '>' + labelVersi(v) + ' · ' + tgl(v.posisi) + ' · TA ' + v.tahun + '</option>'; }).join('') + '</select></label>';
}
export function bindAnggaran(){
  var s = $('agVersi');
  if (s) s.onchange = function(){ AG.id = +this.value; AG.rows = null; S.open = {}; refresh(); };
}

/* ---------- nilai blokir: RKK versi terpilih − FA Detail posisi realisasi yang sedang dimuat (tahun sama) ---------- */
var HB = null;
function nilaiBlokir(){
  var v = versiAktif();
  if (!v || !DB || !DB.periode || +DB.periode.slice(0, 4) !== v.tahun || !ALL.length) return null;
  return hitungBlokir(AG.rows, ALL);
}
function rpBlokir(n){ return '<span class="ag-blv">' + rp(n) + '</span>'; }

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
  prog: { lvl: 'Program', cls: 'lv-prog', key: function(r){ return bersih(r.prog); }, label: function(k, r){ return kodeNama(r.prog, r.prog_n); } },
  keg:  { lvl: 'Kegiatan', cls: 'lv-keg', key: function(r){ return bersih(r.keg); }, label: function(k, r){ return kodeNama(r.keg, r.keg_n); } },
  kro:  { lvl: 'KRO', cls: 'lv-kro', key: function(r){ return bersih(r.kro); }, label: function(k, r){ return kodeNama(r.kro, r.kro_n); } },
  ro:   { lvl: 'RO', cls: 'lv-ro', key: function(r){ return bersih(r.ro); }, label: function(k, r){ return kodeNama(r.ro, r.ro_n); } },
  komp: { lvl: 'Komponen', cls: 'lv-komp', key: function(r){ return bersih(r.komp); }, label: function(k, r){ return kodeNama(r.komp, r.komp_n); } },
  sub:  { lvl: 'Sub Komp', cls: 'lv-sub', key: function(r){ return bersih(r.ro + '|' + r.sub); }, label: function(k, r){ var p = String(r.sub || '').split('.'); return kodeNama(p[p.length - 1], r.sub_n); } },
  akun: { lvl: 'Akun', cls: 'lv-akun', key: function(r){ return bersih(r.akun); }, label: function(k, r){ return kodeNama(r.akun, r.akun_n) + ' <span class="chip ag-sd">' + (r.sumber === 'PNP' ? 'PNBP' : esc(r.sumber || '?')) + '</span>'; } },
  judul:{ lvl: '>', key: function(r){ return bersih(r.judul || '(tanpa judul)'); }, label: function(k, r){ return esc(r.judul || '(tanpa judul)'); } },
  kat:  { lvl: 'Kategori', key: function(r){ return bersih(r.kategori || '?'); }, label: function(k){ return esc(k); }, sort: function(a, b){ return a === 'Fakultas' ? -1 : b === 'Fakultas' ? 1 : (a < b ? -1 : 1); } },
  unit: { lvl: 'Unit', key: function(r){ return bersih(r.unit || '?'); }, label: function(k){ return '<b>' + esc(k) + '</b>' + (FAK_FULL[k] ? ' <span class="note">' + esc(FAK_FULL[k]) + '</span>' : ''); }, sort: urutUnit }
};

/* tabel bertingkat anggaran: Uraian | Volume | Satuan | Harga satuan | Jumlah | Blokir */
function pohon(id, R, levels){
  daftarPohon(id, R, levels);
  var out = [];
  var kolomKel = function(rs){
    var b = rs.filter(function(r){ return r.blokir; });
    var nilai = HB ? b.reduce(function(a, r){ return a + (HB.item[r.urutan] || 0); }, 0) : 0;
    return '<td></td><td></td><td></td><td class="n">' + rp(jml(rs)) + '</td><td class="n">' + (!b.length ? '' : HB ? rpBlokir(nilai) : '<span class="pill st-warn ag-bl"><i></i>' + b.length + ' item</span>') + '</td>';
  };
  (function walk(rs, depth, pid){
    var L = levels[depth], m = {}, order = [];
    rs.forEach(function(r){ var k = L.key(r); if (!m[k]){ m[k] = []; order.push(k); } m[k].push(r); });
    if (L.sort) order.sort(L.sort);
    order.forEach(function(k){
      var nid = pid + '/' + k, open = !!S.open[nid], ind = depth * 18, rr = m[k];
      /* susunan ala SAKTI: Kode menjorok per tingkat, Uraian rata kiri (lihat KODE_IND) */
      var lb = L.label(k, rr[0]), mk = lb.match(/^<b class="code">([\s\S]*?)<\/b>\s*([\s\S]*)$/), kode = mk ? mk[1] : '', uraian = mk ? mk[2] : lb, kk = L.cls ? L.cls.replace('lv-', '') : '';
      if ((L.lvl === 'KRO' || L.lvl === 'RO') && kode && rr[0].keg) kode = esc(rr[0].keg) + '.' + kode;
      if (L.lvl === 'Program' && kode) kode = KODE_KL + '.' + kode;
      out.push('<tr class="tree l' + Math.min(depth, 3) + (L.cls ? ' ' + L.cls : '') + '"><td class="tg-k"><span class="tg-kw" style="padding-left:' + (KODE_IND[kk] != null ? KODE_IND[kk] : depth * 12) + 'px"><button type="button" data-tog="' + esc(nid) + '" aria-expanded="' + open + '" aria-label="Buka atau tutup">' + IC.chev + '</button><span class="code">' + kode + '</span></span></td>' +
        '<td class="tg-u"><span class="tw">' + (kode ? '' : '<span class="lvl">' + esc(L.lvl) + '</span>') + '<span class="tw-label">' + uraian + '</span></span></td>' + kolomKel(rr) + '</tr>');
      if (!open) return;
      if (depth < levels.length - 1) walk(rr, depth + 1, nid);
      else rr.slice().sort(function(a, b){ return a.urutan - b.urutan; }).forEach(function(r){
        out.push('<tr class="leaf' + (r.blokir ? ' ag-blokir' : '') + '"><td class="tg-k"></td><td class="tg-u"><span style="display:inline-block">- ' + esc(r.uraian) +
          (r.judul2 ? ' <span class="note">· ' + esc(r.judul2) + '</span>' : '') + '</span></td>' +
          '<td class="n">' + vol(r.volume) + '</td><td>' + esc(r.satuan) + '</td><td class="n">' + (r.harga == null ? '' : rp(r.harga)) + '</td><td class="n">' + rp(r.jumlah) + '</td>' +
          '<td class="n">' + (!r.blokir ? '' : HB && HB.item[r.urutan] != null ? rpBlokir(HB.item[r.urutan]) : '<span class="pill st-warn ag-bl" title="Item ini kena blokir (tanda * di RKK)"><i></i>Blokir</span>') + '</td></tr>');
      });
    });
  })(R, 0, id);
  var search = '<span class="tree-search">' + IC.search + '<input type="text" data-search-input="' + id + '" placeholder="Cari nama…" aria-label="Cari nama"><span class="tree-search-count" data-search-count="' + id + '"></span>' +
    '<button type="button" class="icon" data-search-prev="' + id + '" aria-label="Hasil sebelumnya">' + IC.up + '</button>' +
    '<button type="button" class="icon" data-search-next="' + id + '" aria-label="Hasil berikutnya">' + IC.down + '</button></span>';
  return '<div class="tools noprint" style="margin-bottom:10px"><button class="btn" type="button" data-openall="' + id + '">Buka satu tingkat</button><button class="btn" type="button" data-expandall="' + id + '">Buka semua</button><button class="btn" type="button" data-closeall="' + id + '">Tutup semua</button>' + search + '</div>' +
    '<div class="tbl tbl-grid"><table><thead><tr><th class="tg-k">Kode</th><th class="tg-u">Uraian</th><th class="n">Volume</th><th>Satuan</th><th class="n">Harga satuan</th><th class="n">Jumlah</th><th class="n">Blokir</th></tr></thead><tbody>' + out.join('') +
    '<tr class="tot"><td class="tg-k"></td><td class="tg-u">Jumlah</td><td></td><td></td><td></td><td class="n">' + rp(jml(R)) + '</td><td class="n">' + (HB ? rp(R.reduce(function(a, r){ return a + (r.blokir ? (HB.item[r.urutan] || 0) : 0); }, 0)) : (R.filter(function(r){ return r.blokir; }).length || '')) + '</td></tr></tbody></table></div>' +
    '<p class="note">' + (HB ? 'Nilai blokir = jumlah di RKK − pagu di FA Detail posisi ' + tgl(DB.periode) + ' (data realisasi yang sedang dibuka).' : 'Nilai blokir tampil bila data realisasi tahun anggaran yang sama sudah dimuat; sementara hanya ditandai.') + '</p>';
}
function keterangan(){
  HB = nilaiBlokir();
  var v = versiAktif();
  return v ? labelVersi(v) + ' · posisi ' + tgl(v.posisi) + ' · TA ' + v.tahun + (isUnitUser() ? ' · cakupan ' + esc(unitCaption()) : '') : '';
}

/* ================= Ringkasan Anggaran ================= */
export function renderAnggaran(){
  var t = siap(); if (t) return t;
  HB = nilaiBlokir();
  var R = AG.rows, total = jml(R), bl = R.filter(function(r){ return r.blokir; });
  var grup = function(fn){ var m = {}, o = []; R.forEach(function(r){ var k = fn(r); if (!m[k]){ m[k] = []; o.push(k); } m[k].push(r); }); return o.map(function(k){ return { key: k, rows: m[k], jumlah: jml(m[k]) }; }); };
  var blUnit = {};
  if (HB) Object.keys(HB.kelompok).forEach(function(k){ var c = HB.kelompok[k].contoh; var ku = (c.kategori || '?') + '|' + (c.unit || '?'); blUnit[ku] = (blUnit[ku] || 0) + HB.kelompok[k].nilai; });
  var baris = function(nama, g, warna){
    var p = total ? g.jumlah / total : 0, b = blUnit[g.key];
    return '<div class="ubar"><span class="n"><span class="un">' + nama + '</span><span class="note num">Rp ' + rp(g.jumlah) + (b ? ' · <span class="ag-blv">blokir Rp ' + rp(b) + '</span>' : '') + '</span></span>' +
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
    (HB ? tile('Pagu diblokir', '<small>Rp</small> ' + rp(HB.total), bl.length + ' item bertanda * · dibandingkan FA Detail ' + tgl(DB.periode)) +
          tile('Pagu efektif', '<small>Rp</small> ' + rp(total - HB.total), 'Pagu yang dapat direalisasikan')
        : tile('Item bertanda blokir (*)', rp(bl.length), bl.length ? 'Nilai blokir tampil setelah data realisasi tahun yang sama dimuat' : 'Tidak ada item yang diblokir')) +
  '</div>';
  /* tabel per unit: Unit · Pagu · Pagu blokir · Pagu efektif · % sumber dana · batang indikator.
     Fakultas: % = porsi pagu PNBP unit terhadap total PNBP satker.
     Rektorat dipecah dua alokasi: Rektorat · PNBP dan Rektorat · RM (masing-masing % terhadap total sumber itu). */
  var totSd = { PNP: 0, RM: 0 }; R.forEach(function(r){ if (totSd[r.sumber] != null) totSd[r.sumber] += r.jumlah; });
  var blUnitSd = {};
  if (HB) Object.keys(HB.kelompok).forEach(function(k){ var c = HB.kelompok[k].contoh, kk = (c.kategori || '?') + '|' + (c.unit || '?') + '|' + (c.sumber || ''); blUnitSd[kk] = (blUnitSd[kk] || 0) + HB.kelompok[k].nilai; });
  var nilaiG = function(g, sd){
    var rs = sd ? g.rows.filter(function(r){ return r.sumber === sd; }) : g.rows, pagu = jml(rs);
    var b = !HB ? 0 : sd ? (blUnitSd[g.key + '|' + sd] || 0) : (blUnit[g.key] || 0);
    return { pagu: pagu, blokir: b, efektif: pagu - b, porsi: rs.reduce(function(a, r){ return a + (r.sumber === (sd || 'PNP') ? r.jumlah : 0); }, 0) };
  };
  var tambah = function(t, v){ t.pagu += v.pagu; t.blokir += v.blokir; t.efektif += v.efektif; t.porsi += v.porsi; return t; };
  var nol = function(){ return { pagu: 0, blokir: 0, efektif: 0, porsi: 0 }; };
  var selBar = function(v, sd){ var tot = totSd[sd] || 0, p = tot ? v.porsi / tot : 0, w = sd === 'RM' ? 'var(--rm)' : 'var(--pnbp)';
    return '<td class="n ag-u-pct" style="color:' + w + '">' + (v.porsi ? pc(p) : '—') + '</td><td class="ag-u-bar"><span class="track"><span class="fill" style="width:' + Math.min(100, p * 100).toFixed(2) + '%;background:' + w + '"></span></span></td>'; };
  var barisU = function(nama, v, cls, sd, tanpaPorsi){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + nama + '</td><td class="n">' + rp(v.pagu) + '</td><td class="n' + (v.blokir ? ' ag-u-bl' : '') + '">' + (HB ? (v.blokir ? rp(v.blokir) : '–') : '?') + '</td><td class="n">' + rp(v.efektif) + '</td>' +
    (tanpaPorsi ? '<td></td><td></td>' : selBar(v, sd)) + '</tr>'; };
  var tabelUnit = function(){
    var out = '', semua = nol();
    if (fak.length){
      var tf = nol(), isi = fak.map(function(g){ var v = nilaiG(g); tambah(tf, v); return barisU(esc(g.key.split('|')[1]), v, '', 'PNP'); }).join('');
      out += barisU('<b>Fakultas</b>', tf, 'ag-u-sec', 'PNP') + isi; tambah(semua, tf);
    }
    if (rek.length){
      var tr = nol(); rek.forEach(function(g){ tambah(tr, nilaiG(g)); });
      out += barisU('<b>Rektorat</b>', tr, 'ag-u-sec', '', true);
      [['PNP', 'PNBP'], ['RM', 'RM']].forEach(function(x){
        var sd = x[0], gs = rek.filter(function(g){ return g.rows.some(function(r){ return r.sumber === sd; }); });
        if (!gs.length) return;
        var ts = nol(), isi = gs.map(function(g){ var v = nilaiG(g, sd); tambah(ts, v); return barisU(esc(g.key.split('|')[1]), v, 'ag-u-sd', sd); }).join('');
        out += barisU('<i class="dot" style="background:' + (sd === 'RM' ? 'var(--rm)' : 'var(--pnbp)') + '"></i>Rektorat · ' + x[1], ts, 'ag-u-sub', sd) + isi;
      });
      tambah(semua, tr);
    }
    semua.porsi = 0;
    return '<div class="tbl ag-u-tbl"><table><colgroup><col><col class="ag-u-c"><col class="ag-u-c"><col class="ag-u-c"><col class="ag-u-p"><col class="ag-u-b"></colgroup>' +
      '<thead><tr><th>Unit kerja</th><th class="n">Pagu</th><th class="n">Pagu blokir</th><th class="n">Pagu efektif</th><th class="n" title="Fakultas & Rektorat · PNBP: porsi terhadap total PNBP satker. Rektorat · RM: porsi terhadap total RM satker.">% Sumber</th><th>Porsi</th></tr></thead><tbody>' +
      out + barisU('<b>Jumlah</b>', semua, 'tot', '', true) + '</tbody></table></div>' +
      '<p class="note">% Sumber: Fakultas dan Rektorat · PNBP terhadap total PNBP satker (Rp ' + rp(totSd.PNP) + '); Rektorat · RM terhadap total RM satker (Rp ' + rp(totSd.RM) + ').' + (HB ? '' : ' Pagu blokir tampil setelah data realisasi tahun anggaran yang sama dimuat.') + '</p>';
  };
  var h = '<div class="page-sec grid">' +
    card('ag-ring', 'Ringkasan anggaran', keterangan(), ringkas, pilihVersi()) +
    '<div class="two eq">' +
      card('ag-src', 'Anggaran per sumber dana', 'Porsi pagu tiap sumber dana.', '<div class="ubars">' + src.map(function(g){ return baris('<i class="dot" style="background:' + srcCol(g.key) + '"></i>' + esc(SRC[g.key] || g.key), g, srcCol(g.key)); }).join('') + '</div>', '') +
      card('ag-jb', 'Anggaran per jenis belanja', 'Akun 51, 52, 53.', '<div class="ubars">' + jb.map(function(g){ return baris('<span class="code">' + esc(g.key) + '</span> ' + esc(A2(g.key)), g, 'var(--real)'); }).join('') + '</div>', '') +
    '</div>' +
    card('ag-unit', 'Anggaran per unit kerja', 'Pagu, blokir, dan pagu efektif per fakultas/unit; % = porsi pagu PNBP unit terhadap total pagu PNBP satker. Rincian item ada di menu Anggaran per Unit.', tabelUnit(), '') +
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
  /* lembar kerja seperti SAKTI: DIPA (lihat) atau salinan usulan revisi yang sedang disusun (edit) */
  return renderRedesain();
}

/* ================= Riwayat Revisi Anggaran: bandingkan dua versi RKK sampai tingkat item =================
   Item RKK tidak bernomor: item dikenali dari kelompok (sub komponen + akun), judul, sub judul dan uraian
   (rincian dalam kurung [..] diabaikan karena bisa berubah saat revisi); nama kembar dipasangkan urut kemunculan. */
function normal(s){ return String(s || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
export function kunciItem(r){ return [r.prog, r.kro, r.ro, r.sub, r.akun].join('|') + '#' + normal(r.judul) + '#' + normal(r.judul2) + '#' + normal(r.uraian); }
export function bandingRKK(lama, baru){
  var peta = function(rs){ var m = {}; rs.slice().sort(function(a, b){ return a.urutan - b.urutan; }).forEach(function(r){ var k = kunciItem(r); (m[k] = m[k] || []).push(r); }); return m; };
  var A = peta(lama), B = peta(baru), keys = {}, hasil = [];
  Object.keys(A).concat(Object.keys(B)).forEach(function(k){ keys[k] = 1; });
  Object.keys(keys).forEach(function(k){
    var a = A[k] || [], b = B[k] || [], n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++){
      var x = a[i] || null, y = b[i] || null, st = [];
      if (!x) st.push('baru'); else if (!y) st.push('hapus');
      else {
        if (x.jumlah !== y.jumlah || x.volume !== y.volume || x.harga !== y.harga || x.satuan !== y.satuan) st.push('ubah');
        if (!x.blokir && y.blokir) st.push('blokir+');
        if (x.blokir && !y.blokir) st.push('blokir-');
      }
      if (st.length) hasil.push({ st: st, a: x, b: y, r: y || x, selisih: (y ? y.jumlah : 0) - (x ? x.jumlah : 0) });
    }
  });
  var tot = function(rs){ return rs.reduce(function(s, r){ return s + r.jumlah; }, 0); };
  return { item: hasil, totalLama: tot(lama), totalBaru: tot(baru) };
}
var LABEL_ST = { 'baru': ['st-good', 'Baru'], 'hapus': ['st-crit', 'Dihapus'], 'ubah': ['st-info', 'Berubah'], 'blokir+': ['st-warn', 'Blokir baru'], 'blokir-': ['st-good', 'Blokir dibuka'] };
var AG2 = { id: null, rows: null, memuat: false, err: null };
function muatPembanding(id){
  if (AG2.memuat) return; AG2.memuat = true; AG2.err = null;
  SB.anggaranItem(id).then(function(rs){ AG2.id = id; AG2.rows = rs; AG2.memuat = false; if (S.page === 'anggaran-revisi') refresh(); })
    .catch(function(e){ AG2.memuat = false; AG2.err = errMsg(e); if (S.page === 'anggaran-revisi') refresh(); });
}
export function renderAnggaranRevisi(){
  var t = siap(); if (t) return t;
  var v = versiAktif(), lain = (AG.versi || []).filter(function(x){ return x.posisi < v.posisi && x.tahun === v.tahun; });
  setTimeout(bindRevisi, 0);
  if (!lain.length) return '<div class="page-sec grid">' + card('ag-rev', 'Riwayat revisi anggaran', keterangan(),
    '<div class="empty">Belum ada versi RKK lain sebelum ' + tgl(v.posisi) + ' di TA ' + v.tahun + '. Perbandingan muncul setelah RKK lebih dari satu tanggal posisi diunggah di Kelola Data (mis. RKK sebelum dan sesudah revisi).</div>', pilihVersi()) + '</div>';
  var idLama = AG.pembanding && lain.some(function(x){ return x.id === AG.pembanding; }) ? AG.pembanding : lain[lain.length - 1].id;
  var pilihLama = '<label class="f ag-versi" for="agLama"><span class="sr-only">Dibandingkan dengan</span><select id="agLama">' +
    lain.slice().reverse().map(function(x){ return '<option value="' + x.id + '"' + (x.id === idLama ? ' selected' : '') + '>dibanding ' + labelVersi(x) + ' · ' + tgl(x.posisi) + '</option>'; }).join('') + '</select></label>';
  if (AG2.err) return '<div class="glass card"><h2>Versi pembanding gagal dimuat</h2><p class="note">' + esc(AG2.err) + '</p></div>';
  if (AG2.id !== idLama || !AG2.rows){ muatPembanding(idLama); return '<div class="loading">Membandingkan versi RKK…</div>'; }
  var vl = (AG.versi || []).filter(function(x){ return x.id === idLama; })[0];
  var H = bandingRKK(AG2.rows, AG.rows), it = H.item;
  var hitung = function(st){ return it.filter(function(x){ return x.st.indexOf(st) >= 0; }); };
  var tile = function(lbl, nilai, ket){ return '<div class="ag-tile"><span>' + lbl + '</span><b>' + nilai + '</b>' + (ket ? '<small>' + ket + '</small>' : '') + '</div>'; };
  var sel = H.totalBaru - H.totalLama, tanda = function(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + rp(Math.abs(n)); };
  var ring = '<div class="ag-tiles">' +
    tile('Pagu ' + tgl(vl.posisi) + ' → ' + tgl(v.posisi), '<small>Rp</small> ' + rp(H.totalBaru), 'Semula Rp ' + rp(H.totalLama) + ' · selisih ' + tanda(sel)) +
    tile('Item berubah nilai', rp(hitung('ubah').length), 'Baru ' + hitung('baru').length + ' · dihapus ' + hitung('hapus').length) +
    tile('Status blokir', rp(hitung('blokir+').length + hitung('blokir-').length), 'Blokir baru ' + hitung('blokir+').length + ' item · dibuka ' + hitung('blokir-').length + ' item') +
  '</div>';
  /* ringkasan per unit & per akun (pergeseran) */
  var agregat = function(fn){
    var m = {}; AG2.rows.forEach(function(r){ var k = fn(r); (m[k] = m[k] || { a: 0, b: 0, r: r }).a += r.jumlah; });
    AG.rows.forEach(function(r){ var k = fn(r); (m[k] = m[k] || { a: 0, b: 0, r: r }).b += r.jumlah; m[k].r = r; });
    return Object.keys(m).map(function(k){ return { k: k, a: m[k].a, b: m[k].b, r: m[k].r }; }).filter(function(x){ return x.a !== x.b; });
  };
  var tabelSel = function(judulKol, baris, label){
    if (!baris.length) return '<p class="note">Tidak ada perubahan.</p>';
    return '<div class="tbl"><table><thead><tr><th>' + judulKol + '</th><th class="n">Pagu ' + tgl(vl.posisi) + '</th><th class="n">Pagu ' + tgl(v.posisi) + '</th><th class="n">Selisih</th></tr></thead><tbody>' +
      baris.sort(function(x, y){ return (x.b - x.a) - (y.b - y.a); }).map(function(x){ var d = x.b - x.a; return '<tr><td>' + label(x) + '</td><td class="n">' + rp(x.a) + '</td><td class="n">' + rp(x.b) + '</td><td class="n' + (d < 0 ? ' neg' : '') + '">' + tanda(d) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  };
  var perUnit = tabelSel('Unit kerja', agregat(function(r){ return (r.kategori || '?') + '|' + (r.unit || '?'); }), function(x){ var p = x.k.split('|'); return '<span class="note">' + esc(p[0]) + '</span> <b>' + esc(p[1]) + '</b>'; });
  var perAkun = tabelSel('Akun', agregat(function(r){ return r.akun + '|' + (r.sumber || ''); }), function(x){ return '<span class="code">' + esc(x.r.akun) + '</span> ' + esc(x.r.akun_n) + ' <span class="chip ag-sd">' + (x.r.sumber === 'PNP' ? 'PNBP' : esc(x.r.sumber)) + '</span>'; });
  var nilaiItem = function(r){ return r ? vol(r.volume) + ' ' + esc(r.satuan) + ' × ' + (r.harga == null ? '' : rp(r.harga)) + ' = <b>' + rp(r.jumlah) + '</b>' + (r.blokir ? ' <span class="ag-blv">*</span>' : '') : '<span class="note">—</span>'; };
  var filt = AG.filterRev || '';
  var tampil = it.filter(function(x){ return !filt || x.st.indexOf(filt) >= 0; })
    .sort(function(x, y){ return ((x.r.kategori || '') + (x.r.unit || '') + kunciItem(x.r)) < ((y.r.kategori || '') + (y.r.unit || '') + kunciItem(y.r)) ? -1 : 1; });
  var pilihan = '<label class="f" for="agFilt" style="max-width:260px">Tampilkan<select id="agFilt"><option value="">Semua perubahan (' + it.length + ')</option>' +
    ['ubah', 'baru', 'hapus', 'blokir+', 'blokir-'].map(function(s){ return '<option value="' + s + '"' + (s === filt ? ' selected' : '') + '>' + LABEL_ST[s][1] + ' (' + hitung(s).length + ')</option>'; }).join('') + '</select></label>';
  var rinci = !tampil.length ? '<p class="note">Tidak ada item untuk pilihan ini.</p>' :
    '<div class="tbl"><table><thead><tr><th>Status</th><th>Unit</th><th>Sub komponen · Akun</th><th>Uraian</th><th class="n">Semula</th><th class="n">Menjadi</th><th class="n">Selisih</th></tr></thead><tbody>' +
    tampil.map(function(x){ var r = x.r, p = String(r.sub || '').split('.');
      return '<tr><td>' + x.st.map(function(s){ return '<span class="pill ' + LABEL_ST[s][0] + ' ag-bl"><i></i>' + LABEL_ST[s][1] + '</span>'; }).join(' ') + '</td>' +
        '<td>' + esc(r.unit || '') + '</td><td><span class="code">' + esc(p[p.length - 1]) + '</span> ' + esc(r.sub_n || '') + '<br><span class="code">' + esc(r.akun) + '</span> <span class="note">' + esc(r.judul || '') + '</span></td>' +
        '<td>' + esc(r.uraian) + '</td><td class="n">' + nilaiItem(x.a) + '</td><td class="n">' + nilaiItem(x.b) + '</td><td class="n' + (x.selisih < 0 ? ' neg' : '') + '">' + (x.selisih ? tanda(x.selisih) : '') + '</td></tr>'; }).join('') +
    '</tbody></table></div>';
  return '<div class="page-sec grid">' +
    card('ag-rev', 'Riwayat revisi anggaran', keterangan() + ' · dibandingkan dengan RKK ' + tgl(vl.posisi), ring, pilihVersi() + pilihLama) +
    '<div class="two eq">' + card('ag-rev-unit', 'Perubahan pagu per unit', 'Unit yang pagunya bertambah atau berkurang.', perUnit, '') +
      card('ag-rev-akun', 'Pergeseran antar akun', 'Akun yang pagunya bertambah atau berkurang (per sumber dana).', perAkun, '') + '</div>' +
    card('ag-rev-item', 'Rincian item yang berubah', 'Semula → menjadi: volume × harga satuan = jumlah. Tanda * = item kena blokir.', '<div class="noprint" style="margin-bottom:10px">' + pilihan + '</div>' + rinci, '') +
  '</div>';
}
function bindRevisi(){
  bindAnggaran();
  var l = $('agLama'); if (l) l.onchange = function(){ AG.pembanding = +this.value; AG2.rows = null; AG2.id = null; refresh(); };
  var f = $('agFilt'); if (f) f.onchange = function(){ AG.filterRev = this.value; refresh(); };
}
