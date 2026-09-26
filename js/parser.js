/* js/parser.js — pembaca file SAKTI (sama dengan versi Apps Script) */
/**
 * Parser.gs — membaca ekspor SAKTI menjadi baris data datar.
 * Input: array 2D (baris x kolom) hasil SheetJS di browser.
 * Tidak bergantung pada posisi kolom tetap: jenis baris dikenali dari pola kode.
 */

var RX = {
  item:     /^(\d{6})\.\s*([\s\S]*)$/,
  akun:     /^\d{6}$/,
  program:  /^[A-Z]{2}$/,
  kegiatan: /^[A-Z]{2}\.(\d{4})$/,
  sub:      /^\d{3}\.[A-Z0-9]{2}$/,
  ro:       /^[A-Z0-9]{3}\.\d{3}$/,
  komp:     /^\d{3}$/,
  kro:      /^[A-Z0-9]{3}$/
};

function _txt(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function _isNum(v) { return typeof v === 'number' && isFinite(v); }

/** Teks-teks tidak kosong di kolom kiri (label) beserta indeksnya. */
function _labels(row, maxCol) {
  var out = [];
  for (var i = 0; i < Math.min(row.length, maxCol); i++) {
    var t = _txt(row[i]);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Laporan Ketersediaan Dana Detail (SAKTI).
 * Setiap baris data punya 7 angka di kanan: pagu, lock, realisasi lalu, periode ini, s.d. periode, %, sisa.
 */
export function parseRealisasi(rows) {
  var LABEL_COLS = 15;
  var cur = {}, items = [], meta = { periodeTeks: '', satker: '', total: null }, warn = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || [];
    var lab = _labels(row, LABEL_COLS);
    if (!lab.length) continue;
    var first = lab[0];
    if (/^Periode\s+/i.test(first)) { meta.periodeTeks = first; continue; }
    if (/^Satuan Kerja/i.test(first)) { meta.satker = lab.slice(1).join(' '); continue; }

    var nums = [];
    for (var c = LABEL_COLS; c < row.length; c++) if (_isNum(row[c])) nums.push(row[c]);
    if (/^JUMLAH SELURUHNYA/i.test(first) && nums.length >= 7) {
      meta.total = { pagu: nums[0], lock: nums[1], lalu: nums[2], ini: nums[3], sd: nums[4], sisa: nums[6] };
      continue;
    }
    if (nums.length < 7) continue; // judul halaman, catatan kaki, dll.

    var nama = lab[1] || '';
    var m;
    if ((m = first.match(RX.item))) {
      items.push({
        program: cur.program, program_n: cur.program_n, kegiatan: cur.kegiatan, kegiatan_n: cur.kegiatan_n,
        kro: cur.kro, kro_n: cur.kro_n, ro: cur.ro, ro_n: cur.ro_n, komp: cur.komp, komp_n: cur.komp_n,
        sub: cur.sub, sub_n: cur.sub_n, akun: cur.akun, akun_n: cur.akun_n,
        no: m[1], item: m[2].replace(/\s+/g, ' ').trim(),
        pagu: nums[0], lock: nums[1], lalu: nums[2], ini: nums[3], sd: nums[4], sisa: nums[6]
      });
    } else if (RX.akun.test(first)) { cur.akun = first; cur.akun_n = nama; }
    else if (RX.program.test(first)) { cur = { program: first, program_n: nama }; }
    else if ((m = first.match(RX.kegiatan))) { cur.kegiatan = m[1]; cur.kegiatan_n = nama; }
    else if (RX.sub.test(first)) { cur.sub = first; cur.sub_n = nama; }
    else if (RX.ro.test(first)) { cur.ro = first; cur.ro_n = nama; }
    else if (RX.komp.test(first)) { cur.komp = first; cur.komp_n = nama; }
    else if (RX.kro.test(first)) { cur.kro = first; cur.kro_n = nama; }
    else warn.push('Baris ' + (r + 1) + ' tidak dikenali: ' + first.substring(0, 60));
  }
  if (!items.length) throw new Error('Tidak ada item terbaca. Pastikan file adalah "Laporan Ketersediaan Dana Detail" dari SAKTI.');
  // Rekonsiliasi dengan baris JUMLAH SELURUHNYA
  var sum = { pagu: 0, sd: 0 };
  items.forEach(function (it) { sum.pagu += it.pagu; sum.sd += it.sd; });
  meta.cek = meta.total ? {
    selisihPagu: Math.round(sum.pagu - meta.total.pagu),
    selisihRealisasi: Math.round(sum.sd - meta.total.sd)
  } : null;
  if (!meta.total) warn.push('Baris JUMLAH SELURUHNYA tidak ditemukan — total tidak bisa dicocokkan.');
  return { items: items, meta: meta, warnings: warn.slice(0, 20) };
}

/**
 * Rincian Kertas Kerja Satker (SAKTI) — hanya diambil sumber dana per akun.
 * Kunci: program|kro|ro|sub|akun  (sama dengan kode di laporan realisasi).
 */
export function parseRKK(rows) {
  var cur = {}, map = {}, n = 0;
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] || [];
    var a = _txt(row[0]);
    if (!a) continue;
    var m;
    if ((m = a.match(/^\d{3}\.\d{2}\.([A-Z]{2})$/))) cur = { program: m[1] };
    else if (/^\d{4}$/.test(a)) cur.kegiatan = a;
    else if ((m = a.match(/^\d{4}\.([A-Z0-9]{3})$/))) cur.kro = m[1];
    else if ((m = a.match(/^\d{4}\.([A-Z0-9]{3}\.\d{3})$/))) cur.ro = m[1];
    else if (/^\d{6}$/.test(a)) {
      var sd = '';
      for (var c = 1; c < row.length; c++) {
        var t = _txt(row[c]);
        if (/^(RM|PNP|PNBP|BLU|PLN|HLN|SBSN)$/.test(t)) sd = t;
      }
      var key = [cur.program, cur.kro, cur.ro, cur.sub, a].join('|');
      if (sd) { map[key] = sd; n++; }
    }
    else if (/^\d{3}$/.test(a)) cur.komp = a;
    else if (/^[A-Z0-9]{1,2}$/.test(a)) cur.sub = cur.komp + '.' + (a.length === 1 ? '0' + a : a);
  }
  if (!n) throw new Error('Tidak ada akun terbaca. Pastikan file adalah "Rincian Kertas Kerja Satker" dari SAKTI.');
  return { map: map, count: n };
}
