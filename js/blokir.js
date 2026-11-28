/* js/blokir.js — nilai PAGU BLOKIR dari selisih RKK (pagu penuh) dan FA Detail (pagu setelah blokir)

   RKK SAKTI memuat pagu penuh termasuk blokir dan menandai item yang kena blokir dengan "*",
   tanpa nilainya. FA Detail memuat pagu setelah blokir. Maka:
     - blokir per KELOMPOK (sub komponen + akun) = jumlah RKK − jumlah pagu FA,
       hanya untuk kelompok yang memuat item bertanda * (nilai ini yang dipakai untuk total);
     - blokir per ITEM = jumlah item RKK − pagu item FA pasangannya (rincian tampilan).
   Item RKK tidak bernomor dan uraiannya berbeda tipis dari FA ("[7 KALI x 3 HARI]", spasi ganda),
   jadi item dipasangkan per kelompok menurut uraian yang dinormalkan, urut kemunculan. */
import { SB } from './api.js?v=202611280426';

export function kunciKelompok(r){ return [r.prog, r.kro, r.ro, r.sub, r.akun].join('|'); }
function normal(s){ return String(s || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

/* rkk: baris tabel anggaran; fa: baris realisasi (tanpa baris blokir buatan) */
export function hitungBlokir(rkk, fa){
  var faK = {}, rkK = {}, unitFa = {};
  fa.forEach(function(r){ if (r.blokir) return; unitFa[(r.kat || '') + '|' + (r.unit || '')] = 1; var k = kunciKelompok(r); (faK[k] = faK[k] || []).push(r); });
  /* hanya RKK milik unit yang ada di data realisasi pengguna: RKK unit lain (mis. tersisa dari sesi akun lain)
     tidak boleh menjadi baris "Pagu diblokir" di dasbor unit ini */
  rkk.forEach(function(r){ if (!unitFa[(r.kategori || '') + '|' + (r.unit || '')]) return; var k = kunciKelompok(r); (rkK[k] = rkK[k] || []).push(r); });
  var kelompok = {}, item = {}, total = 0;
  Object.keys(rkK).forEach(function(k){
    var rs = rkK[k];
    if (!rs.some(function(r){ return r.blokir; })) return;
    var faRs = (faK[k] || []).slice().sort(function(a, b){ return a.no < b.no ? -1 : a.no > b.no ? 1 : 0; });
    var jRkk = rs.reduce(function(a, r){ return a + r.jumlah; }, 0), jFa = faRs.reduce(function(a, r){ return a + r.pagu; }, 0);
    var nilai = jRkk - jFa;
    if (nilai <= 0) return; /* RKK lebih lama dari FA (mis. sebelum revisi): bukan blokir */
    kelompok[k] = { nilai: nilai, contoh: rs[0], rkk: jRkk, fa: jFa };
    total += nilai;
    /* rincian per item: pasangkan menurut uraian yang dinormalkan, urut kemunculan */
    var pakai = [];
    rs.slice().sort(function(a, b){ return a.urutan - b.urutan; }).forEach(function(r){
      var i = -1;
      for (var j = 0; j < faRs.length; j++) if (pakai.indexOf(j) < 0 && normal(faRs[j].item) === normal(r.uraian)){ i = j; break; }
      if (i >= 0) pakai.push(i);
      if (r.blokir) item[r.urutan] = Math.max(0, r.jumlah - (i >= 0 ? faRs[i].pagu : 0));
    });
  });
  return { kelompok: kelompok, item: item, total: total };
}

/* baris realisasi buatan "Pagu diblokir" per kelompok: ikut di semua penjumlahan (unit, sumber dana,
   jenis belanja, DIPA, laporan) sehingga pagu = pagu DIPA seperti SAKTI; realisasinya selalu 0 */
export function barisBlokir(hasil){
  return Object.keys(hasil.kelompok).map(function(k){
    var g = hasil.kelompok[k], c = g.contoh;
    var r = { prog: c.prog, keg: String(c.keg || ''), kro: c.kro, ro: c.ro, komp: String(c.komp || ''), sub: c.sub, akun: String(c.akun),
      sumber: c.sumber || '', no: '', item: 'Pagu diblokir (tidak dapat direalisasikan)', pagu: g.nilai, lock: 0, lalu: 0, ini: 0, sd: 0, sisa: g.nilai,
      kat: c.kategori, unit: c.unit, blokir: true };
    r.a2 = r.akun.slice(0, 2); r.a3 = r.akun.slice(0, 3); r.gaji = false;
    return r;
  });
}

/* versi RKK untuk satu posisi realisasi: tahun sama, posisi RKK terakhir <= posisi; bila belum ada, yang paling awal di tahun itu */
export function versiUntuk(versi, periode){
  var th = +String(periode).slice(0, 4);
  var sama = (versi || []).filter(function(v){ return v.tahun === th; });
  if (!sama.length) return null;
  var sebelum = sama.filter(function(v){ return v.posisi <= periode; });
  return sebelum.length ? sebelum[sebelum.length - 1] : sama[0];
}
/* muat RKK yang cocok untuk posisi realisasi; gagal/tidak ada → null (pagu tetap pagu FA) */
export function rkkUntuk(periode){
  return SB.anggaranVersi().then(function(vs){
    var v = versiUntuk(vs, periode);
    if (!v) return null;
    return SB.anggaranItem(v.id).then(function(rows){ return { versi: v, rows: rows }; });
  }).catch(function(){ return null; });
}
