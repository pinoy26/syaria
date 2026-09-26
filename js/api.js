/* js/api.js — Lapisan Supabase: autentikasi, baca data, unggah, kelola pengguna */
import { BOOT } from './state.js';
import { parseRealisasi, parseRKK } from './parser.js';

export var SBC = null; // klien supabase
export var SB = {};

export function sbInit(){
  var c = window.SB_CONFIG || {};
  if (!c.url || !c.anonKey || /GANTI/i.test(c.url) || /GANTI/i.test(c.anonKey)) {
    document.getElementById('boot').innerHTML = '<div class="glass gate"><h2>Konfigurasi belum diisi</h2>' +
      '<p class="note">Buka berkas <b>config.js</b>, lalu isi <b>url</b> dan <b>anonKey</b> project Supabase Anda ' +
      '(Supabase → Project Settings → API).</p></div>';
    return false;
  }
  SBC = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return true;
}

/* ---------- ambil semua baris (PostgREST membatasi 1000 baris per permintaan) ---------- */
function sbAll(build){
  var HAL = 1000, out = [];
  function ambil(dari){
    return build().range(dari, dari + HAL - 1).then(function(r){
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      return (r.data && r.data.length === HAL) ? ambil(dari + HAL) : out;
    });
  }
  return ambil(0);
}

/* ---------- boot: sesi, profil, referensi, daftar posisi data ---------- */
SB.boot = function(){
  return SBC.auth.getSession().then(function(s){
    var user = s.data.session && s.data.session.user;
    if (!user) return { session: { allowed: false, email: '', via: '' }, satker: '', kode: '', periods: [] };
    return Promise.all([
      SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan').eq('id', user.id).maybeSingle(),
      SBC.from('pengguna_cakupan').select('kategori,unit').eq('user_id', user.id),
      SBC.from('pengaturan').select('kunci,nilai'),
      SBC.from('ref_akun').select('kode,nama'),
      SBC.from('periode').select('*').order('periode')
    ]).then(function(r){
      var p = r[0].data, cak = r[1].data || [], set = {}, akun = {};
      (r[2].data || []).forEach(function(x){ set[x.kunci] = x.nilai; });
      (r[3].data || []).forEach(function(x){ akun[x.kode] = x.nama; });
      var aktif = !!(p && p.aktif);
      var sess = {
        email: (p && p.email) || user.email, via: 'sandi', allowed: aktif,
        role: p ? p.peran : '', all: !!p && (p.peran === 'ADMIN' || p.peran === 'PIMPINAN'),
        scopes: cak.map(function(c){ return { kat: c.kategori, unit: c.unit }; })
      };
      if (sess.all) sess.scopes = [];
      if (aktif && !sess.all && !sess.scopes.length) { sess.allowed = false; sess.tanpaCakupan = true; }
      return {
        session: sess, satker: set.NAMA_SATKER || '', kode: set.KODE_SATKER || '', akunNames: akun,
        periods: (r[4].data || []).map(function(x){
          return { periode: x.periode, label: x.label, diunggah: (x.diunggah_pada || '').replace('T', ' ').slice(0, 16),
            pengunggah: x.diunggah_oleh, file: x.nama_file, jumlah: x.jumlah_detail, pagu: x.pagu, lock: x.lock_pagu,
            sd: x.realisasi, sisa: x.sisa, persen: x.pagu ? x.realisasi / x.pagu : 0, cekPagu: x.cek_pagu, cekReal: x.cek_realisasi };
        })
      };
    });
  });
};

/* ---------- data satu posisi (RLS membatasi baris sesuai cakupan) ---------- */
var KOLOM = 'prog,prog_n,keg,keg_n,kro,kro_n,ro,ro_n,komp,komp_n,sub,sub_n,akun,akun_n,sumber,kategori,unit,no_item,uraian,pagu,lock_pagu,lalu,ini,sd,sisa';
SB.data = function(periode){
  return Promise.all([
    sbAll(function(){ return SBC.from('realisasi').select(KOLOM).eq('periode', periode).order('id'); }),
    SBC.from('periode').select('pagu,realisasi').eq('periode', periode).maybeSingle()
  ]).then(function(r){
    var rows = r[0], tot = r[1].data || { pagu: 0, realisasi: 0 };
    var dims = { program: {}, kegiatan: {}, kro: {}, ro: {}, komp: {}, sub: {}, akun: {} };
    var items = rows.map(function(x){
      dims.program[x.prog] = x.prog_n; dims.kegiatan[x.keg] = x.keg_n; dims.kro[x.kro] = x.kro_n;
      dims.ro[x.ro] = x.ro_n; dims.komp[x.komp] = x.komp_n; dims.sub[x.ro + '|' + x.sub] = x.sub_n; dims.akun[x.akun] = x.akun_n;
      return [x.prog, x.keg, x.kro, x.ro, x.komp, x.sub, x.akun, x.sumber, x.no_item, x.uraian,
        +x.pagu, +x.lock_pagu, +x.lalu, +x.ini, +x.sd, +x.sisa, x.kategori, x.unit];
    });
    return { periode: periode, dims: dims, items: items, satkerPersen: tot.pagu ? tot.realisasi / tot.pagu : 0 };
  });
};

/* ---------- tren: mengikuti cakupan pengguna (bukan filter) ---------- */
SB.tren = function(){
  return SBC.from('v_tren').select('periode,pagu,realisasi').order('periode').then(function(r){
    if (r.error) throw r.error;
    return (r.data || []).map(function(x){ return { periode: x.periode, pagu: +x.pagu, sd: +x.realisasi }; });
  });
};

/* ---------- perbandingan revisi antara dua posisi ---------- */
SB.banding = function(p1, p2){
  var kol = 'ro,sub,sub_n,akun,akun_n,kategori,unit,pagu,sd';
  var ambil = function(p){ return sbAll(function(){ return SBC.from('realisasi').select(kol).eq('periode', p).order('id'); }); };
  return Promise.all([ambil(p1), ambil(p2)]).then(function(r){
    var siap = function(rows){ return rows.map(function(x){
      return { ro: x.ro, sub: x.sub, sub_n: x.sub_n, akun: x.akun, akun_n: x.akun_n,
        kat: x.kategori, unit: x.unit, pagu: +x.pagu, sd: +x.sd }; }); };
    return bandingBlok(siap(r[0]), siap(r[1]));
  });
};
/* versi JavaScript dari compareBlocks (SQL/Apps Script) */
function bandingBlok(a, b){
  function kumpul(rows, kunci, meta){
    var m = {};
    rows.forEach(function(r){ var k = kunci(r); if (!m[k]) m[k] = meta(r); m[k].pagu += r.pagu; m[k].sd += r.sd; });
    return m;
  }
  function gabung(x, y){
    var keys = {}, out = [];
    Object.keys(x).forEach(function(k){ keys[k] = 1; }); Object.keys(y).forEach(function(k){ keys[k] = 1; });
    Object.keys(keys).forEach(function(k){
      var p = x[k], q = y[k], dasar = p || q, o = {};
      for (var f in dasar) if (f !== 'pagu' && f !== 'sd') o[f] = dasar[f];
      o.key = k; o.p1 = p ? p.pagu : 0; o.p2 = q ? q.pagu : 0; o.r1 = p ? p.sd : 0; o.r2 = q ? q.sd : 0;
      o.status = !p ? 'baru' : !q ? 'dihapus' : (Math.round(o.p2 - o.p1) !== 0 ? 'berubah' : 'tetap');
      out.push(o);
    });
    return out;
  }
  var kSub = function(r){ return r.ro + '|' + r.sub; };
  var mSub = function(r){ return { kat: r.kat, unit: r.unit, ro: r.ro, sub: r.sub, nama: r.sub_n, pagu: 0, sd: 0 }; };
  var kAk = function(r){ return r.akun; }, mAk = function(r){ return { akun: r.akun, nama: r.akun_n, pagu: 0, sd: 0 }; };
  var kUn = function(r){ return r.kat + '|' + r.unit; }, mUn = function(r){ return { kat: r.kat, unit: r.unit, pagu: 0, sd: 0 }; };
  return {
    sub: gabung(kumpul(a, kSub, mSub), kumpul(b, kSub, mSub)).filter(function(x){ return x.status !== 'tetap'; }),
    akun: gabung(kumpul(a, kAk, mAk), kumpul(b, kAk, mAk)).filter(function(x){ return x.status !== 'tetap'; }),
    unit: gabung(kumpul(a, kUn, mUn), kumpul(b, kUn, mUn))
  };
}

/* ---------- unggah file SAKTI ---------- */
SB.unggah = function(jenis, tanggal, namaFile, rowsX){
  if (jenis === 'RKK'){
    var k = parseRKK(rowsX);
    var baris = Object.keys(k.map).map(function(key){
      var p = key.split('|');
      return { kunci: key, prog: p[0], kro: p[1], ro: p[2], sub: p[3], akun: p[4], sumber: k.map[key] };
    });
    return SBC.rpc('simpan_rkk', { p_rows: baris }).then(function(r){
      if (r.error) throw r.error;
      return { ok: true, pesan: 'Sumber dana diperbarui dari RKK: ' + (r.data.jumlah || baris.length) + ' akun. ' +
        'Klik "Terapkan ke posisi terbaru" bila data realisasi sudah pernah diunggah.' };
    });
  }
  var res = parseRealisasi(rowsX);
  var cek = res.meta.cek || { selisihPagu: 0, selisihRealisasi: 0 };
  var baris2 = res.items.map(function(it){
    return { prog: it.program, prog_n: it.program_n, keg: it.kegiatan, keg_n: it.kegiatan_n,
      kro: it.kro, kro_n: it.kro_n, ro: it.ro, ro_n: it.ro_n, komp: it.komp, komp_n: it.komp_n,
      sub: it.sub, sub_n: it.sub_n, akun: it.akun, akun_n: it.akun_n, no_item: it.no, uraian: it.item,
      pagu: it.pagu, lock_pagu: it.lock, lalu: it.lalu, ini: it.ini, sd: it.sd, sisa: it.sisa };
  });
  return SBC.rpc('simpan_realisasi', {
    p_periode: tanggal, p_label: res.meta.periodeTeks || '', p_nama_file: namaFile || '',
    p_cek_pagu: cek.selisihPagu, p_cek_realisasi: cek.selisihRealisasi, p_rows: baris2
  }).then(function(r){
    if (r.error) throw r.error;
    var d = r.data || {};
    var pesan = 'Tersimpan ' + d.jumlah + ' detail belanja untuk posisi ' + tanggal + '. ';
    pesan += (cek.selisihPagu === 0 && cek.selisihRealisasi === 0)
      ? 'Total cocok dengan baris JUMLAH SELURUHNYA.'
      : 'PERHATIAN: selisih terhadap JUMLAH SELURUHNYA — pagu ' + cek.selisihPagu + ', realisasi ' + cek.selisihRealisasi + '.';
    if (d.tanpa_sumber) pesan += ' ' + d.tanpa_sumber + ' detail belum punya sumber dana — unggah RKK terbaru lalu terapkan ulang pemetaan.';
    return { ok: true, pesan: pesan, periode: tanggal, peringatan: res.warnings, subBaru: [] };
  });
};

/* ---------- admin ---------- */
SB.adminInfo = function(){
  return Promise.all([
    SBC.from('periode').select('*').order('periode'),
    SBC.from('ref_unit').select('*').order('id'),
    SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan').order('email'),
    SBC.from('pengguna_cakupan').select('user_id,kategori,unit')
  ]).then(function(r){
    r.forEach(function(x){ if (x.error) throw x.error; });
    var cak = {};
    (r[3].data || []).forEach(function(c){ (cak[c.user_id] = cak[c.user_id] || []).push(c); });
    return {
      periods: (r[0].data || []).map(function(x){
        return { periode: x.periode, diunggah: (x.diunggah_pada || '').replace('T', ' ').slice(0, 16), pengunggah: x.diunggah_oleh,
          file: x.nama_file, jumlah: x.jumlah_detail, pagu: x.pagu, sd: x.realisasi,
          persen: x.pagu ? x.realisasi / x.pagu : 0, cekPagu: x.cek_pagu, cekReal: x.cek_realisasi };
      }),
      rules: (r[1].data || []).map(function(x){ return [x.kro, x.komponen, x.jenis_aturan, x.kode, x.kategori, x.unit, x.keterangan]; }),
      users: (r[2].data || []).map(function(u){
        var c = cak[u.id] || [];
        return [u.email, u.peran, c.length ? c[0].kategori : '', c.length ? c[0].unit : '', u.aktif ? 'YA' : 'TIDAK', u.keterangan, u.id, 1];
      }),
      domain: '', authUrl: sbDashboardUrl('auth/users'), sheetUrl: sbDashboardUrl('editor')
    };
  });
};
function sbDashboardUrl(bagian){
  var m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(window.SB_CONFIG.url || '');
  return m ? 'https://supabase.com/dashboard/project/' + m[1] + '/' + bagian : 'https://supabase.com/dashboard';
}
SB.simpanPengguna = function(id, peran, kategori, unit, keterangan){
  if (!id) return Promise.reject(new Error('Pilih pengguna dari tabel di atas (tombol Ubah). Akun baru dibuat lewat halaman pendaftaran.'));
  var cak = peran === 'UNIT' ? [{ kategori: kategori, unit: unit || '' }] : [];
  return SBC.rpc('simpan_pengguna', { p_id: id, p_peran: peran, p_aktif: true, p_keterangan: keterangan || '', p_cakupan: cak })
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Pengguna disimpan.' }; });
};
SB.aktifkan = function(id, aktif){
  return SBC.from('pengguna').update({ aktif: aktif }).eq('id', id)
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Status pengguna diperbarui.' }; });
};
SB.hapusPeriode = function(periode){
  return SBC.rpc('hapus_periode', { p_periode: periode }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Data posisi ' + periode + ' dihapus.' }; });
};
SB.terapkanUlang = function(scope){
  var terbaru = BOOT && BOOT.periods.length ? BOOT.periods[BOOT.periods.length - 1].periode : null;
  return SBC.rpc('terapkan_ulang_pemetaan', { p_periode: scope === 'semua' ? null : terbaru }).then(function(r){
    if (r.error) throw r.error;
    return { ok: true, pesan: 'Pemetaan diterapkan ulang ke ' + r.data.baris + ' baris' + (scope === 'semua' ? ' (semua posisi).' : ' (posisi terbaru).') };
  });
};
SB.gantiSandi = function(baru){
  return SBC.auth.updateUser({ password: baru }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Kata sandi diperbarui.' }; });
};
SB.keluar = function(){ return SBC.auth.signOut().then(function(){ location.reload(); }); };
