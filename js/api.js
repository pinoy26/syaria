/* js/api.js — Lapisan Supabase: autentikasi, baca data, unggah, kelola pengguna */
import { BOOT } from './state.js?v=202611280611';
import { parseRealisasi, parseRKK, parseRKKLengkap } from './parser.js?v=202611280611';

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
      SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan,hak').eq('id', user.id).maybeSingle(),
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
        uid: user.id, email: (p && p.email) || user.email, via: 'sandi', allowed: aktif,
        role: p ? p.peran : '', all: !!p && (p.peran === 'ADMIN' || p.peran === 'SUPERADMIN' || p.peran === 'PIMPINAN' || p.peran === 'PERENCANAAN'),
        hak: (p && p.hak) || [],
        scopes: cak.map(function(c){ return { kat: c.kategori, unit: c.unit }; })
      };
      /* peran baca seluruh satker: cakupan (bila ada) adalah cakupan usulan revisi, bukan pembatas data */
      if (sess.all){ sess.cakUsulan = sess.scopes; sess.scopes = []; }
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
SB.unggah = function(jenis, tanggal, namaFile, rowsX, tahun, revisi){
  if (jenis === 'RKK'){
    /* RKK disimpan utuh per versi (Monev Anggaran) + memperbarui pemetaan sumber dana tahun itu.
       RKK SAKTI tidak memuat tahun anggaran: tahun dipilih admin. */
    var h = parseRKKLengkap(rowsX);
    if (h.total.selisih) h.warnings.unshift('Jumlah item (' + h.total.item + ') berbeda dari total baris Program (' + h.total.program + ').');
    var nRev = null;
    return SBC.rpc('simpan_rkk_lengkap', { p_tahun: tahun, p_posisi: tanggal, p_nama_file: namaFile || '', p_rows: h.items }).then(function(r){
      if (r.error) throw r.error;
      var d = r.data || {};
      /* nomor revisi DIPA: kosong = otomatis menurut urutan unggahan; diisi = koreksi Admin perencanaan */
      var lanjut = (revisi != null && revisi !== '' && d.versi) ? rpc('atur_revisi_versi', { p_id: d.versi, p_revisi: +revisi }) : Promise.resolve();
      return lanjut.then(function(){ return SBC.from('anggaran_versi').select('revisi_ke').eq('id', d.versi).maybeSingle(); })
        .then(function(x){ nRev = x && x.data ? x.data.revisi_ke : null; return d; });
    }).then(function(d){
      var rp = function(v){ return new Intl.NumberFormat('id-ID').format(Math.round(v || 0)); };
      return { ok: true, periode: null, peringatan: h.warnings, subBaru: [],
        pesan: 'RKK TA ' + d.tahun + ' posisi ' + tanggal + (nRev != null ? ' (DIPA – Revisi ke ' + nRev + ')' : '') + ' tersimpan: ' + rp(d.jumlah_item) + ' item, pagu Rp ' + rp(d.pagu) +
          (d.item_blokir ? ', ' + d.item_blokir + ' item bertanda blokir (*)' : '') + '. Pemetaan sumber dana diperbarui (' + rp(d.akun_sumber) + ' akun). ' +
          'Klik "Terapkan ke posisi terbaru" bila data realisasi tahun ini sudah pernah diunggah.' };
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
    SBC.from('pengguna').select('id,email,nama,peran,aktif,keterangan,hak').order('email'),
    SBC.from('pengguna_cakupan').select('user_id,kategori,unit'),
    SBC.from('anggaran_versi').select('*').order('posisi')
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
      /* indeks 0–6 dipakai juga oleh Kelola Pengguna (kategori=4, unit=5); tahun anggaran aturan di indeks 7 */
      rules: (r[1].data || []).map(function(x){ return [x.kro, x.komponen, x.jenis_aturan, x.kode, x.kategori, x.unit, x.keterangan, x.tahun]; }),
      users: (r[2].data || []).map(function(u){
        var c = cak[u.id] || [];
        return [u.email, u.peran, c.length ? c[0].kategori : '', c.length ? c[0].unit : '', u.aktif ? 'YA' : 'TIDAK', u.keterangan, u.id, 1, u.hak || []];
      }),
      rkk: (r[4].data || []).map(function(v){ return { id: v.id, revisi: v.revisi_ke, posisi: v.posisi, tahun: v.tahun, file: v.nama_file, diunggah: (v.diunggah_pada || '').replace('T', ' ').slice(0, 16), pengunggah: v.diunggah_oleh, item: v.jumlah_item, pagu: v.pagu, blokir: v.item_blokir }; }),
      domain: '', sheetUrl: sbDashboardUrl('editor')
    };
  });
};
function sbDashboardUrl(bagian){
  var m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(window.SB_CONFIG.url || '');
  return m ? 'https://supabase.com/dashboard/project/' + m[1] + '/' + bagian : 'https://supabase.com/dashboard';
}
/* kategori kosong = semua unit (cakupan usulan Admin perencanaan/keuangan) */
SB.simpanPengguna = function(id, peran, kategori, unit, keterangan, hak){
  if (!id) return Promise.reject(new Error('Pilih pengguna dari tabel di atas (tombol Ubah), atau gunakan "Buat pengguna baru".'));
  var cak = kategori ? [{ kategori: kategori, unit: unit || '' }] : [];
  return SBC.rpc('simpan_pengguna', { p_id: id, p_peran: peran, p_aktif: true, p_keterangan: keterangan || '', p_cakupan: cak, p_hak: hak || [] })
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Pengguna disimpan.' }; });
};
/* ---------- buat akun pengguna baru (lewat Edge Function, memakai service_role di server) ---------- */
SB.buatPengguna = function(email, password, peran, kategori, unit, keterangan, hak){
  /* Edge Function hanya mengenal peran lama: akun Admin perencanaan / akun berhak dibuat sebagai Pimpinan (baca saja),
     lalu peran & haknya ditetapkan lewat simpan_pengguna */
  var duaLangkah = peran === 'PERENCANAAN' || (hak && hak.length);
  return SB._buatAkun(email, password, duaLangkah ? 'PIMPINAN' : peran, kategori, unit, keterangan).then(function(r){
    if (!duaLangkah) return r;
    if (!r.id) throw new Error('Akun ' + email + ' dibuat sebagai Pimpinan, tetapi perannya belum dapat ditetapkan. Ubah perannya lewat tombol Ubah.');
    return SB.simpanPengguna(r.id, peran, kategori, unit, keterangan, hak).then(function(){ return r; });
  });
};
SB._buatAkun = function(email, password, peran, kategori, unit, keterangan){
  return SBC.functions.invoke('admin-create-user', {
    body: { email: email, password: password, peran: peran, kategori: kategori, unit: unit, keterangan: keterangan }
  }).then(function(r){
    if (r.data && r.data.error) throw new Error(r.data.error);
    if (r.error){
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') return ctx.json().then(function(j){ throw new Error((j && j.error) || r.error.message); });
      throw new Error(r.error.message);
    }
    return { ok: true, pesan: (r.data && r.data.pesan) || 'Pengguna dibuat.', id: r.data && r.data.id };
  });
};
/* ---------- hapus akun pengguna (lewat Edge Function, memakai service_role di server) ---------- */
SB.hapusPengguna = function(id){
  return SBC.functions.invoke('admin-delete-user', { body: { id: id } }).then(function(r){
    if (r.data && r.data.error) throw new Error(r.data.error);
    if (r.error){
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') return ctx.json().then(function(j){ throw new Error((j && j.error) || r.error.message); });
      throw new Error(r.error.message);
    }
    return { ok: true, pesan: (r.data && r.data.pesan) || 'Pengguna dihapus.' };
  });
};
/* ---------- ganti kata sandi pengguna lain (lewat Edge Function, khusus super admin) ---------- */
SB.aturSandi = function(id, password){
  return SBC.functions.invoke('admin-set-password', { body: { id: id, password: password } }).then(function(r){
    if (r.data && r.data.error) throw new Error(r.data.error);
    if (r.error){
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') return ctx.json().then(function(j){ throw new Error((j && j.error) || r.error.message); });
      throw new Error(r.error.message);
    }
    return { ok: true, pesan: (r.data && r.data.pesan) || 'Kata sandi diganti.' };
  });
};
/* salin aturan unit kerja ke tahun anggaran baru (titik awal yang bisa diubah) */
SB.salinAturanUnit = function(dari, ke){
  return SBC.rpc('salin_aturan_unit', { p_dari: dari, p_ke: ke }).then(function(r){
    if (r.error) throw r.error;
    return { ok: true, pesan: r.data.baris + ' aturan unit kerja TA ' + dari + ' disalin ke TA ' + ke + '. Ubah di sheet Ref_Unit bila ada perubahan pemilik kode.' };
  });
};
/* rapikan arsip tahun anggaran yang sudah selesai: sisakan posisi terakhir tiap bulan */
SB.rapikanArsip = function(tahun){
  return SBC.rpc('rapikan_arsip', { p_tahun: tahun }).then(function(r){
    if (r.error) throw r.error;
    var d = r.data || {};
    return { ok: true, pesan: 'Arsip TA ' + d.tahun + ' dirapikan: ' + d.posisi_dihapus + ' posisi (' + d.baris_dihapus + ' baris) dihapus, ' + d.posisi_disisakan + ' posisi akhir bulan disisakan.' };
  });
};
/* ---------- Monev Anggaran: versi RKK & item (RLS membatasi item sesuai cakupan unit) ---------- */
var CACHE_AG = { versi: null, item: {} };
SB.lupakanCacheAnggaran = function(){ CACHE_AG = { versi: null, item: {} }; };
SB.anggaranVersi = function(){
  if (CACHE_AG.versi) return CACHE_AG.versi;
  return CACHE_AG.versi = SBC.from('anggaran_versi').select('id,tahun,posisi,revisi_ke,jumlah_item,pagu,item_blokir,pagu_item_blokir').order('posisi').then(function(r){
    if (r.error) throw r.error; return r.data || [];
  }).catch(function(e){ CACHE_AG.versi = null; throw e; });
};
var KOLOM_ANGGARAN = 'id,urutan,prog,prog_n,keg,keg_n,kro,kro_n,ro,ro_n,komp,komp_n,sub,sub_n,akun,akun_n,sumber,kategori,unit,judul,judul2,uraian,volume,satuan,harga,jumlah,blokir';
SB.anggaranItem = function(versiId){
  if (CACHE_AG.item[versiId]) return CACHE_AG.item[versiId];
  return CACHE_AG.item[versiId] = sbAll(function(){ return SBC.from('anggaran').select(KOLOM_ANGGARAN).eq('versi_id', versiId).order('urutan'); })
    .then(function(rs){ return rs.map(function(x){ x.jumlah = +x.jumlah || 0; x.harga = x.harga == null ? null : +x.harga; x.volume = x.volume == null ? null : +x.volume; x.a2 = String(x.akun || '').slice(0, 2); return x; }); })
    .catch(function(e){ delete CACHE_AG.item[versiId]; throw e; });
};
/* ---------- Usulan revisi anggaran (penulisan selalu lewat fungsi database yang memeriksa aturan) ---------- */
function rpc(nama, arg){ return SBC.rpc(nama, arg).then(function(r){ if (r.error) throw r.error; return r.data; }); }
SB.usulanDaftar = function(){
  return SBC.from('usulan_revisi').select('*').order('diubah_pada', { ascending: false }).then(function(r){ if (r.error) throw r.error; return r.data || []; });
};
SB.usulanDetail = function(id){
  return Promise.all([
    SBC.from('usulan_revisi').select('*').eq('id', id).maybeSingle(),
    SBC.from('usulan_revisi_baris').select('*').eq('usulan_id', id).order('urutan'),
    SBC.from('usulan_revisi_log').select('*').eq('usulan_id', id).order('waktu')
  ]).then(function(r){
    r.forEach(function(x){ if (x.error) throw x.error; });
    if (!r[0].data) throw new Error('Usulan tidak ditemukan atau Anda tidak berhak melihatnya.');
    var num = function(b){ ['s_jumlah', 'm_jumlah'].forEach(function(k){ b[k] = +b[k] || 0; }); ['s_volume', 's_harga', 'm_volume', 'm_harga'].forEach(function(k){ b[k] = b[k] == null ? null : +b[k]; }); return b; };
    return { u: r[0].data, baris: (r[1].data || []).map(num), log: r[2].data || [] };
  });
};
SB.simpanUsulan = function(id, versiId, judul, alasan, baris){ return rpc('simpan_usulan', { p_id: id || null, p_versi_id: versiId, p_judul: judul, p_alasan: alasan, p_baris: baris }); };
SB.ajukanUsulan = function(id){ return rpc('ajukan_usulan', { p_id: id }); };
SB.hapusUsulan = function(id){ return rpc('hapus_usulan', { p_id: id }); };
SB.prosesUsulan = function(id, aksi, catatan){ return rpc('proses_usulan', { p_id: id, p_aksi: aksi, p_catatan: catatan || '' }); };
SB.catatNoRevisi = function(id, no, catatan){ return rpc('catat_no_revisi', { p_id: id, p_no: no, p_catatan: catatan || '' }); };
SB.selesaikanUsulan = function(id, catatan){ return rpc('selesaikan_usulan', { p_id: id, p_catatan: catatan || '' }); };
/* ---------- tahap 8: Status Histori, label revisi DIPA, Bagan Akun Standar, pagu unit per versi ---------- */
SB.buatHistori = function(versiId, kategori, unit){ return rpc('buat_histori', { p_versi_id: versiId, p_kategori: kategori, p_unit: unit || '' }); };
SB.aturRevisiVersi = function(id, n){ return rpc('atur_revisi_versi', { p_id: id, p_revisi: n }).then(function(r){ CACHE_AG.versi = null; return r; }); };
SB.paguUnitVersi = function(){ return rpc('pagu_unit_versi', {}).then(function(rs){ return (rs || []).map(function(x){ x.pagu = +x.pagu || 0; return x; }); }); };
SB.refAkun = function(){
  return SBC.from('ref_akun').select('kode,nama,asal').order('kode').then(function(r){ if (r.error) throw r.error; return r.data || []; });
};
/* ---------- tahap 9: salinan kerja usulan (Belanja Redesain) ---------- */
SB.salinan = function(usulanId){
  return sbAll(function(){ return SBC.from('usulan_salinan').select('id,anggaran_id,urutan,' + KOLOM_ANGGARAN.replace('id,urutan,', '')).eq('usulan_id', usulanId).order('urutan'); })
    .then(function(rs){ return rs.map(function(x){ x.jumlah = +x.jumlah || 0; x.urutan = +x.urutan; x.harga = x.harga == null ? null : +x.harga; x.volume = x.volume == null ? null : +x.volume; return x; }); });
};
/* nilai blokir per item (RKK − FA Detail, atau blokir manual) & realisasi item; dihitung di database */
SB.blokirItem = function(versiId){
  /* hasil fungsi bisa > 1000 baris (batas satu permintaan): ambil per halaman */
  return sbAll(function(){ return SBC.rpc('blokir_item', { p_versi_id: versiId }).order('anggaran_id'); }).then(function(rs){ var m = {}; (rs || []).forEach(function(x){ m[x.anggaran_id] = { blokir: +x.blokir || 0, rkk: !!x.dari_rkk, manual: !!x.manual, realisasi: +x.realisasi || 0 }; }); return m; });
};
/* realisasi per sub komponen + akun (posisi terakhir tahun RKK) — syarat ubah sub komponen/akun */
SB.realisasiKelompok = function(versiId){
  return sbAll(function(){ return SBC.rpc('realisasi_kelompok', { p_versi_id: versiId }).order('sub').order('akun'); })
    .then(function(rs){ var m = {}; (rs || []).forEach(function(x){ var k = [x.prog, x.kro, x.ro, x.sub].join('|'); m[k] = (m[k] || 0) + (+x.sd || 0); m[k + '|' + x.akun] = (m[k + '|' + x.akun] || 0) + (+x.sd || 0); }); return m; });
};
var CACHE_BAS = null;
SB.bagianAkun = function(){ return CACHE_BAS || (CACHE_BAS = SB.refAkun().then(function(l){ return l.filter(function(a){ return /^\d{6}$/.test(a.kode); }); }).catch(function(e){ CACHE_BAS = null; throw e; })); };
SB.aturBlokirManual = function(anggaranId, nilai){ return rpc('atur_blokir_manual', { p_anggaran_id: anggaranId, p_nilai: nilai }); };
SB.simpanSalinan = function(usulanId, rows){ return rpc('simpan_salinan', { p_id: usulanId, p_rows: rows }); };
/* ---------- tahap 11: Pengajuan Revisi (isian surat, lampiran, Lanjut & Kirim) ---------- */
var BKT = 'usulan';
function tipeBerkas(nama){ var e = String(nama || '').toLowerCase().split('.').pop(); return { pdf: 'application/pdf', zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[e] || ''; }
SB.tipeBerkas = tipeBerkas;
SB.simpanPengajuan = function(id, data){ return rpc('simpan_pengajuan', { p_id: id, p_data: data }); };
SB.jenisUsulan = function(id){ return rpc('jenis_usulan', { p_id: id }).then(function(r){ return r || []; }); };
SB.kirimUsulan = function(id){ return rpc('kirim_usulan', { p_id: id }); };
/* unggah ke Storage, catat di usulan (server memeriksa ukuran & tipe), lalu buang berkas lama */
SB.unggahBerkasUsulan = function(id, jenis, file){
  var tipe = tipeBerkas(file.name), ext = file.name.toLowerCase().split('.').pop(), path = id + '/' + jenis + '-' + Date.now() + '.' + ext;
  return pastikanSesi().then(function(){ return SBC.storage.from(BKT).upload(path, file, { contentType: tipe, upsert: false }); }).then(function(u){
    if (u.error) throw u.error;
    return rpc('atur_lampiran', { p_id: id, p_jenis: jenis, p_path: path, p_nama: file.name }).catch(function(e){
      return SBC.storage.from(BKT).remove([path]).then(function(){ throw e; });
    });
  }).then(function(r){ if (r && r.lama) SBC.storage.from(BKT).remove([r.lama]); return r; });
};
SB.hapusBerkasUsulan = function(id, jenis){
  return rpc('atur_lampiran', { p_id: id, p_jenis: jenis, p_path: '', p_nama: '' }).then(function(r){ if (r && r.lama) return SBC.storage.from(BKT).remove([r.lama]).then(function(){ return r; }); return r; });
};
/* buang semua berkas usulan (sebelum usulan dibatalkan); gagal dihapus tidak menghalangi pembatalan */
SB.bersihkanLampiran = function(id){
  return SBC.storage.from(BKT).list(String(id), { limit: 100 }).then(function(r){
    var p = (r.data || []).map(function(o){ return id + '/' + o.name; });
    return p.length ? SBC.storage.from(BKT).remove(p) : null;
  }).catch(function(){ return null; });
};
SB.urlBerkas = function(path, nama){
  return SBC.storage.from(BKT).createSignedUrl(path, 600, nama ? { download: nama } : undefined).then(function(r){ if (r.error) throw r.error; return r.data.signedUrl; });
};
/* templat surat usulan: berkas di folder templat/, lokasinya dicatat di pengaturan */
SB.templatSurat = function(){
  return SBC.from('pengaturan').select('kunci,nilai').in('kunci', ['templat_surat_usulan', 'templat_surat_usulan_nama']).then(function(r){
    if (r.error) throw r.error; var m = {}; (r.data || []).forEach(function(x){ m[x.kunci] = x.nilai; });
    return m.templat_surat_usulan ? { path: m.templat_surat_usulan, nama: m.templat_surat_usulan_nama || 'Templat surat usulan' } : null;
  });
};
SB.unggahTemplat = function(file, lama){
  var ext = file.name.toLowerCase().split('.').pop(), path = 'templat/surat-usulan-' + Date.now() + '.' + ext;
  return pastikanSesi().then(function(){ return SBC.storage.from(BKT).upload(path, file, { contentType: tipeBerkas(file.name), upsert: false }); }).then(function(u){
    if (u.error) throw u.error;
    return SBC.from('pengaturan').upsert([{ kunci: 'templat_surat_usulan', nilai: path, keterangan: 'Templat surat usulan revisi (Storage usulan)' },
      { kunci: 'templat_surat_usulan_nama', nilai: file.name, keterangan: 'Nama berkas templat surat usulan revisi' }]);
  }).then(function(r){ if (r.error) throw r.error; if (lama) SBC.storage.from(BKT).remove([lama]); return { path: path, nama: file.name }; });
};
SB.hapusTemplat = function(lama){
  return SBC.from('pengaturan').delete().in('kunci', ['templat_surat_usulan', 'templat_surat_usulan_nama']).then(function(r){
    if (r.error) throw r.error; return lama ? SBC.storage.from(BKT).remove([lama]) : null;
  });
};
/* ---------- periode revisi fakultas/unit (dibuka & ditutup Super admin) ---------- */
SB.periodeRevisi = function(){
  return SBC.from('periode_revisi').select('*').order('mulai', { ascending: false }).then(function(r){ if (r.error) throw r.error; return r.data || []; });
};
SB.aturPeriode = function(id, data){ return rpc('atur_periode_revisi', { p_id: id || null, p_data: data }); };
SB.tutupPeriode = function(id){ return rpc('tutup_periode_revisi', { p_id: id }); };
SB.hapusPeriode = function(id){ return rpc('hapus_periode_revisi', { p_id: id }); };
SB.hapusRKK = function(posisi){
  return SBC.rpc('hapus_rkk', { p_posisi: posisi }).then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'RKK posisi ' + posisi + ' dihapus.' }; });
};
SB.aktifkan = function(id, aktif){
  return SBC.from('pengguna').update({ aktif: aktif }).eq('id', id)
    .then(function(r){ if (r.error) throw r.error; return { ok: true, pesan: 'Status pengguna diperbarui.' }; });
};
SB.hapusPeriode = function(periode){
  return SBC.rpc('hapus_periode', { p_periode: periode }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Data posisi ' + periode + ' dihapus.' }; });
};
/* "semua" dibatasi ke tahun anggaran posisi terbaru: aturan pemetaan tahun berjalan tidak boleh mengubah data
   tahun anggaran sebelumnya. Fungsi database dipanggil per posisi (p_periode), tidak pernah dengan null (= semua tahun). */
SB.terapkanUlang = function(scope, onProgres){
  var ps = BOOT && BOOT.periods.length ? BOOT.periods : [], terbaru = ps.length ? ps[ps.length - 1].periode : null;
  if (!terbaru) return Promise.reject(new Error('Belum ada data posisi.'));
  var th = terbaru.slice(0, 4);
  var target = scope === 'semua' ? ps.filter(function(p){ return p.periode.slice(0, 4) === th; }).map(function(p){ return p.periode; }) : [terbaru];
  var total = 0;
  return target.reduce(function(rantai, per, i){
    return rantai.then(function(){
      if (onProgres) onProgres(i + 1, target.length, per);
      return SBC.rpc('terapkan_ulang_pemetaan', { p_periode: per }).then(function(r){ if (r.error) throw r.error; total += (r.data && r.data.baris) || 0; });
    });
  }, Promise.resolve()).then(function(){
    return { ok: true, pesan: 'Pemetaan diterapkan ulang ke ' + total + ' baris' + (scope === 'semua' ? ' (' + target.length + ' posisi tahun anggaran ' + th + ').' : ' (posisi terbaru).') };
  });
};
SB.gantiSandi = function(baru){
  return SBC.auth.updateUser({ password: baru }).then(function(r){
    if (r.error) throw r.error; return { ok: true, pesan: 'Kata sandi diperbarui.' }; });
};
SB.keluar = function(){ return SBC.auth.signOut().then(function(){ location.reload(); }); };

/* ---------- Berita & Pengumuman (tabel pengumuman*, bucket Storage privat 'pengumuman') ---------- */
export var LAMPIRAN_TIPE = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export var LAMPIRAN_MAKS = 10 * 1024 * 1024;
var BERITA_KOLOM = 'id,judul,isi,jenis,bentuk,durasi,publik,disematkan,terbit,mulai,sampai,tautan,dibuat_pada,pengumuman_lampiran(id,path,nama,mime,ukuran,urutan)';
function rapikanBerita(x){
  x.lampiran = (x.pengumuman_lampiran || []).sort(function(a, b){ return a.urutan - b.urutan || a.id - b.id; });
  x.sasaran = x.pengumuman_sasaran || [];
  delete x.pengumuman_lampiran; delete x.pengumuman_sasaran;
  return x;
}
/* berita yang sedang tayang. publikSaja=true untuk halaman login; batas = jumlah maksimal (kosong = semua);
   bentuk = 'redaksi' / 'flayer' (kosong = keduanya).
   RLS sudah menyaring draf/kedaluwarsa untuk non-admin; filter di sini menjaga admin juga hanya melihat yang tayang. */
export var FLAYER_MAKS = 5 * 1024 * 1024;
SB.beritaTayang = function(publikSaja, batas, bentuk){
  var now = new Date().toISOString();
  var q = SBC.from('pengumuman').select(BERITA_KOLOM, { count: 'exact' })
    .eq('terbit', true).lte('mulai', now).or('sampai.is.null,sampai.gt."' + now + '"');
  if (publikSaja) q = q.eq('publik', true);
  if (bentuk) q = q.eq('bentuk', bentuk);
  q = q.order('disematkan', { ascending: false }).order('mulai', { ascending: false }).order('id', { ascending: false });
  if (batas) q = q.limit(batas);
  return q.then(function(r){
    if (r.error) throw r.error;
    return { items: (r.data || []).map(rapikanBerita), total: r.count || 0 };
  });
};
/* satu berita menurut id (untuk tautan langsung #berita-<id>); null bila tidak ada / tidak boleh dibaca */
SB.beritaSatu = function(id){
  return SBC.from('pengumuman').select(BERITA_KOLOM).eq('id', id).maybeSingle().then(function(r){
    if (r.error) throw r.error; return r.data ? rapikanBerita(r.data) : null;
  });
};
/* semua berita termasuk draf & kedaluwarsa (admin) */
SB.beritaKelola = function(){
  return SBC.from('pengumuman').select(BERITA_KOLOM + ',pengumuman_sasaran(kategori,unit)')
    .order('dibuat_pada', { ascending: false }).then(function(r){
      if (r.error) throw r.error; return (r.data || []).map(rapikanBerita);
    });
};
SB.refUnit = function(){
  return SBC.from('ref_unit').select('kategori,unit').then(function(r){ if (r.error) throw r.error; return r.data || []; });
};
/* pastikan masih ada sesi login sebelum menulis; tanpa sesi, permintaan terkirim sebagai pengunjung anonim
   dan database menolaknya dengan pesan teknis "permission denied" */
function pastikanSesi(){
  return SBC.auth.getSession().then(function(r){
    if (!r.data || !r.data.session) throw new Error('Sesi login Anda sudah berakhir. Silakan masuk kembali, lalu ulangi.');
  });
}
/* simpan berita (baru bila id kosong) lalu ganti daftar sasarannya; mengembalikan id */
SB.simpanBerita = function(id, data, sasaran){
  return pastikanSesi().then(function(){ return simpanBerita(id, data, sasaran); });
};
function simpanBerita(id, data, sasaran){
  var q = id ? SBC.from('pengumuman').update(data).eq('id', id).select('id').single()
             : SBC.from('pengumuman').insert(data).select('id').single();
  return q.then(function(r){
    if (r.error) throw r.error;
    var pid = r.data.id;
    return SBC.from('pengumuman_sasaran').delete().eq('pengumuman_id', pid).then(function(d){
      if (d.error) throw d.error;
      if (!sasaran.length) return pid;
      return SBC.from('pengumuman_sasaran').insert(sasaran.map(function(s){ return { pengumuman_id: pid, kategori: s.kategori, unit: s.unit || '' }; }))
        .then(function(i){ if (i.error) throw i.error; return pid; });
    });
  });
}
SB.unggahLampiran = function(pid, file, urutan){
  var ext = LAMPIRAN_TIPE[file.type];
  if (!ext) return Promise.reject(new Error(file.name + ': hanya PDF, JPG, PNG, atau WEBP yang diterima.'));
  if (file.size > LAMPIRAN_MAKS) return Promise.reject(new Error(file.name + ': ukuran lebih dari 10 MB.'));
  var path = pid + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  var bucket = SBC.storage.from('pengumuman');
  return pastikanSesi().then(function(){ return bucket.upload(path, file, { contentType: file.type, upsert: false }); }).then(function(u){
    if (u.error) throw u.error;
    return SBC.from('pengumuman_lampiran').insert({ pengumuman_id: pid, path: path, nama: file.name.slice(0, 200), mime: file.type, ukuran: file.size, urutan: urutan || 0 })
      .then(function(r){ if (r.error){ bucket.remove([path]); throw r.error; } });
  });
};
/* berkas dihapus dulu dari Storage, baru datanya — agar tidak ada berkas yatim */
SB.hapusLampiran = function(l){
  return pastikanSesi().then(function(){ return SBC.storage.from('pengumuman').remove([l.path]).then(function(s){
    if (s.error) throw s.error;
    return SBC.from('pengumuman_lampiran').delete().eq('id', l.id).then(function(r){ if (r.error) throw r.error; });
  });
  });
};
SB.hapusBerita = function(b){
  var paths = (b.lampiran || []).map(function(l){ return l.path; });
  var p = pastikanSesi().then(function(){ return paths.length ? SBC.storage.from('pengumuman').remove(paths).then(function(s){ if (s.error) throw s.error; }) : null; });
  return p.then(function(){ return SBC.from('pengumuman').delete().eq('id', b.id); }).then(function(r){ if (r.error) throw r.error; });
};
/* tautan sementara (1 jam) untuk membuka lampiran; hanya terbit bila RLS mengizinkan pembaca */
SB.urlLampiran = function(paths){
  if (!paths.length) return Promise.resolve({});
  return SBC.storage.from('pengumuman').createSignedUrls(paths, 3600).then(function(r){
    if (r.error) throw r.error;
    var m = {}; (r.data || []).forEach(function(x){ if (x.signedUrl) m[x.path] = x.signedUrl; }); return m;
  });
};
