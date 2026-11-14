/* js/pages/berita.js — Kelola Berita & Pengumuman (admin keuangan & super admin) */
import { $, esc, toast, errMsg } from '../utils.js';
import { S, FAK_ORDER } from '../state.js';
import { card } from '../ui-components.js';
import { SB, LAMPIRAN_TIPE, LAMPIRAN_MAKS } from '../api.js';
import { refresh } from '../nav.js';
import { JENIS, pillJenis, tglBerita, tglLokal, ukuran, bukaBerita, muatBeritaDasbor } from '../berita.js';

/* list: semua berita; units: {kategori:[unit…]}; edit: berita yang sedang diubah (null = tulis baru); sasaran: [{kategori,unit}] */
var K = { list: null, units: null, edit: null, sasaran: [], memuat: false };

function muat(){
  if (K.memuat) return;
  K.memuat = true;
  Promise.all([SB.beritaKelola(), SB.refUnit()]).then(function(r){
    K.list = r[0]; K.memuat = false;
    var u = {};
    r[1].forEach(function(x){ if (!x.kategori) return; (u[x.kategori] = u[x.kategori] || []); if (x.unit && u[x.kategori].indexOf(x.unit) < 0) u[x.kategori].push(x.unit); });
    Object.keys(u).forEach(function(k){ u[k].sort(function(a, b){ var ia = FAK_ORDER.indexOf(a), ib = FAK_ORDER.indexOf(b); if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1; return a < b ? -1 : 1; }); });
    K.units = u;
    if (S.page === 'kelola-berita') refresh();
  }).catch(function(e){
    K.memuat = false;
    var p = $('page'); if (p && S.page === 'kelola-berita') p.innerHTML = '<div class="glass card">Berita gagal dimuat: ' + esc(errMsg(e)) + '</div>';
  });
}
function muatUlang(){ K.list = null; muatBeritaDasbor(); refresh(); }

function statusBerita(b){
  var now = Date.now();
  if (!b.terbit) return ['st-draf', 'Draf'];
  if (new Date(b.mulai).getTime() > now) return ['st-info', 'Terjadwal'];
  if (b.sampai && new Date(b.sampai).getTime() <= now) return ['st-crit', 'Kedaluwarsa'];
  return ['st-good', 'Tayang'];
}
function labelSasaran(s){ return s.unit || ('Seluruh ' + s.kategori); }
function untukSiapa(b){
  if (b.publik) return '<b>Publik</b><br><span class="note">Halaman login &amp; dasbor</span>';
  if (!b.sasaran.length) return '<b>Internal</b><br><span class="note">Semua pengguna yang masuk</span>';
  return '<b>Internal</b><br><span class="note">' + esc(b.sasaran.map(labelSasaran).join(', ')) + '</span>';
}

/* ---------- tampilan ---------- */
export function renderKelolaBerita(){
  if (!K.list){ muat(); return '<div class="loading">Memuat berita…</div>'; }
  setTimeout(bind, 0);
  return '<div class="page-sec grid">' +
    card('b-form', K.edit ? 'Ubah berita' : 'Tulis berita',
      'Berita <b>publik</b> tampil di halaman login dan bisa dibaca siapa saja — jangan cantumkan data anggaran internal. Berita <b>internal</b> hanya tampil setelah pengguna masuk.', formHtml()) +
    card('b-list', 'Daftar berita', 'Draf, berita terjadwal, dan berita kedaluwarsa hanya terlihat oleh admin.', listHtml()) + '</div>';
}

function listHtml(){
  if (!K.list.length) return '<div class="empty">Belum ada berita. Tulis berita pertama lewat formulir di atas.</div>';
  return '<div class="tbl"><table><thead><tr><th>Berita</th><th>Tampil untuk</th><th>Status</th><th>Masa tayang</th><th class="n">Lampiran</th><th></th></tr></thead><tbody>' +
    K.list.map(function(b){
      var s = statusBerita(b);
      return '<tr' + (K.edit && K.edit.id === b.id ? ' class="b-sedang"' : '') + '><td><div class="nw-meta">' + pillJenis(b.jenis) + (b.disematkan ? '<span class="nw-tag">Disematkan</span>' : '') + '</div><b>' + esc(b.judul) + '</b></td>' +
        '<td>' + untukSiapa(b) + '</td>' +
        '<td><span class="pill ' + s[0] + '"><i></i>' + s[1] + '</span></td>' +
        '<td>' + tglBerita(b.mulai) + '<br><span class="note">s.d. ' + (b.sampai ? tglBerita(b.sampai) : 'tanpa batas') + '</span></td>' +
        '<td class="n">' + b.lampiran.length + '</td>' +
        '<td class="row-actions"><button class="btn" type="button" data-blihat="' + b.id + '">Lihat</button><button class="btn" type="button" data-bedit="' + b.id + '">Ubah</button><button class="btn" type="button" data-bhapus="' + b.id + '">Hapus</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function formHtml(){
  var b = K.edit || {}, j = b.jenis || 'info', terbit = !!b.terbit;
  var kat = Object.keys(K.units || {});
  var lamp = (b.lampiran || []).map(function(l){
    return '<li><span>' + esc(l.nama) + ' <span class="note">' + (l.mime === 'application/pdf' ? 'PDF' : 'Foto') + ' · ' + ukuran(l.ukuran) + '</span></span><button class="btn" type="button" data-lhapus="' + l.id + '">Hapus</button></li>';
  }).join('');
  return '<form id="bForm" class="b-form" novalidate>' +
    '<label class="f" for="bJudul">Judul<input type="text" id="bJudul" maxlength="200" required value="' + esc(b.judul || '') + '"></label>' +
    '<label class="f" for="bIsi">Isi berita<textarea id="bIsi" rows="7" maxlength="20000" placeholder="Teks biasa. Baris baru dipertahankan.">' + esc(b.isi || '') + '</textarea></label>' +
    '<div class="form">' +
      '<label class="f" for="bJenis">Jenis<select id="bJenis">' + Object.keys(JENIS).map(function(k){ return '<option value="' + k + '"' + (k === j ? ' selected' : '') + '>' + JENIS[k][1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f" for="bMulai">Mulai tayang<input type="date" id="bMulai" value="' + (b.mulai ? tglLokal(b.mulai) : tglLokal(new Date().toISOString())) + '"></label>' +
      '<label class="f" for="bSampai">Berakhir (opsional)<input type="date" id="bSampai" value="' + (b.sampai ? tglLokal(b.sampai) : '') + '"></label>' +
      '<label class="f" for="bTautan">Tautan (opsional)<input type="url" id="bTautan" placeholder="https://…" value="' + esc(b.tautan || '') + '"></label>' +
    '</div>' +
    '<fieldset class="b-box"><legend class="eyebrow">Tampil untuk</legend>' +
      '<label class="chk"><input type="radio" name="bPublik" value="1"' + (b.publik ? ' checked' : '') + '><span><b>Publik</b> — halaman login dan dasbor, bisa dibaca siapa saja</span></label>' +
      '<label class="chk"><input type="radio" name="bPublik" value="0"' + (!b.publik ? ' checked' : '') + '><span><b>Internal</b> — hanya pengguna yang sudah masuk</span></label>' +
      '<div id="bSasaranWrap" class="b-sasaran">' +
        '<p class="note">Sasaran unit (opsional). Kosongkan untuk semua pengguna. Pimpinan dan admin selalu melihat semua berita internal.</p>' +
        '<div class="tools"><select id="bKat" aria-label="Kategori sasaran">' + kat.map(function(k){ return '<option>' + esc(k) + '</option>'; }).join('') + '</select>' +
        '<select id="bUnit" aria-label="Unit sasaran"></select><button type="button" class="btn" id="bTambahSasaran">Tambah sasaran</button></div>' +
        '<div id="bChips" class="b-chips"></div>' +
      '</div>' +
    '</fieldset>' +
    '<label class="chk"><input type="checkbox" id="bSemat"' + (b.disematkan ? ' checked' : '') + '><span>Sematkan — tampil paling atas dan sebagai banner di halaman Ringkasan</span></label>' +
    '<fieldset class="b-box"><legend class="eyebrow">Lampiran</legend>' +
      (lamp ? '<ul class="b-lamp" id="bLampLama">' + lamp + '</ul>' : '') +
      '<label class="f" for="bFile">Tambah PDF atau foto (JPG, PNG, WEBP) · maks. 10 MB per berkas<input type="file" id="bFile" multiple accept="application/pdf,image/jpeg,image/png,image/webp"></label>' +
      '<div id="bFileInfo" class="note"></div>' +
    '</fieldset>' +
    '<div id="bMsg" class="status-box" role="status" aria-live="polite" hidden></div>' +
    '<div class="tools"><button type="submit" class="btn primary" id="bTerbit">' + (terbit ? 'Simpan perubahan' : 'Terbitkan') + '</button>' +
      '<button type="button" class="btn" id="bDraf">' + (terbit ? 'Tarik jadi draf' : 'Simpan sebagai draf') + '</button>' +
      (K.edit ? '<button type="button" class="btn" id="bBatal">Batal ubah</button>' : '') + '</div>' +
  '</form>';
}

/* ---------- interaksi ---------- */
function msg(type, text){
  var m = $('bMsg'); if (!m) return;
  m.className = 'status-box s-' + type; m.hidden = false;
  m.innerHTML = (type === 'busy' ? '<span class="spin" aria-hidden="true"></span>' : '') + '<span></span>';
  m.lastChild.textContent = text;
}
function sibuk(on){ ['bTerbit', 'bDraf', 'bBatal'].forEach(function(id){ if ($(id)) $(id).disabled = on; }); }
function berkasDipilih(){
  var fs = [].slice.call(($('bFile') && $('bFile').files) || []), salah = [];
  fs.forEach(function(f){
    if (!LAMPIRAN_TIPE[f.type]) salah.push(f.name + ' (jenis berkas tidak diterima)');
    else if (f.size > LAMPIRAN_MAKS) salah.push(f.name + ' (' + ukuran(f.size) + ', lebih dari 10 MB)');
  });
  return { files: fs, salah: salah };
}
function tampilChips(){
  var h = $('bChips'); if (!h) return;
  h.innerHTML = K.sasaran.length
    ? K.sasaran.map(function(s, i){ return '<span class="chip">' + esc(labelSasaran(s)) + '<button type="button" class="icon" data-sx="' + i + '" aria-label="Hapus sasaran ' + esc(labelSasaran(s)) + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>'; }).join('')
    : '<span class="note">Untuk semua pengguna yang masuk.</span>';
  [].forEach.call(h.querySelectorAll('[data-sx]'), function(b){ b.onclick = function(){ K.sasaran.splice(+b.getAttribute('data-sx'), 1); tampilChips(); }; });
}
function isiUnit(){
  var k = $('bKat').value, list = (K.units && K.units[k]) || [];
  $('bUnit').innerHTML = '<option value="">Seluruh ' + esc(k) + '</option>' + list.map(function(u){ return '<option>' + esc(u) + '</option>'; }).join('');
}
function cariBerita(id){ return K.list.filter(function(b){ return String(b.id) === String(id); })[0]; }
/* tanggal 'YYYY-MM-DD' dari input → awal/akhir hari menurut zona waktu perangkat */
function awalHari(s){ var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]).toISOString(); }
function akhirHari(s){ var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 23, 59, 59).toISOString(); }

function bind(){
  if (!$('bForm')) return;
  var publikChange = function(){ var pub = document.querySelector('input[name=bPublik]:checked').value === '1'; $('bSasaranWrap').hidden = pub; };
  [].forEach.call(document.querySelectorAll('input[name=bPublik]'), function(r){ r.onchange = publikChange; });
  publikChange();
  if ($('bKat')){ $('bKat').onchange = isiUnit; if ($('bKat').options.length) isiUnit(); }
  tampilChips();
  $('bTambahSasaran').onclick = function(){
    if (!$('bKat').value) return;
    var s = { kategori: $('bKat').value, unit: $('bUnit').value };
    if (!K.sasaran.some(function(x){ return x.kategori === s.kategori && x.unit === s.unit; })) K.sasaran.push(s);
    tampilChips();
  };
  $('bFile').onchange = function(){
    var p = berkasDipilih(), info = $('bFileInfo');
    info.className = p.salah.length ? 'note neg' : 'note';
    info.textContent = p.salah.length ? 'Tidak bisa dilampirkan: ' + p.salah.join('; ') + '.' : (p.files.length ? p.files.length + ' berkas akan diunggah saat disimpan.' : '');
  };
  $('bForm').onsubmit = function(e){ e.preventDefault(); simpan(true); };
  $('bDraf').onclick = function(){ simpan(false); };
  if ($('bBatal')) $('bBatal').onclick = function(){ K.edit = null; K.sasaran = []; refresh(); };

  [].forEach.call(document.querySelectorAll('[data-lhapus]'), function(b){ b.onclick = function(){
    var l = K.edit && K.edit.lampiran.filter(function(x){ return String(x.id) === b.getAttribute('data-lhapus'); })[0];
    if (!l || !confirm('Hapus lampiran "' + l.nama + '"? Berkas langsung dihapus dari penyimpanan.')) return;
    b.disabled = true;
    SB.hapusLampiran(l).then(function(){
      K.edit.lampiran = K.edit.lampiran.filter(function(x){ return x !== l; });
      var li = b.closest('li'); if (li) li.remove();
      toast('Lampiran dihapus.', 'ok');
    }).catch(function(e){ b.disabled = false; toast('Gagal menghapus lampiran: ' + errMsg(e), 'err'); });
  }; });
  [].forEach.call(document.querySelectorAll('[data-blihat]'), function(b){ b.onclick = function(){ var x = cariBerita(b.getAttribute('data-blihat')); if (x) bukaBerita(x); }; });
  [].forEach.call(document.querySelectorAll('[data-bedit]'), function(b){ b.onclick = function(){
    var x = cariBerita(b.getAttribute('data-bedit')); if (!x) return;
    K.edit = JSON.parse(JSON.stringify(x)); K.sasaran = x.sasaran.map(function(s){ return { kategori: s.kategori, unit: s.unit || '' }; });
    refresh(); window.scrollTo(0, 0);
  }; });
  [].forEach.call(document.querySelectorAll('[data-bhapus]'), function(b){ b.onclick = function(){
    var x = cariBerita(b.getAttribute('data-bhapus')); if (!x) return;
    if (!confirm('Hapus berita "' + x.judul + '"' + (x.lampiran.length ? ' beserta ' + x.lampiran.length + ' lampirannya' : '') + '? Tindakan ini tidak bisa dibatalkan.')) return;
    b.disabled = true;
    SB.hapusBerita(x).then(function(){
      if (K.edit && K.edit.id === x.id){ K.edit = null; K.sasaran = []; }
      toast('Berita dihapus.', 'ok'); muatUlang();
    }).catch(function(e){ b.disabled = false; toast('Gagal menghapus berita: ' + errMsg(e), 'err'); });
  }; });
}

function simpan(terbit){
  var judul = $('bJudul').value.trim(), isi = $('bIsi').value.replace(/\s+$/, ''), tautan = $('bTautan').value.trim();
  var mulaiStr = $('bMulai').value, sampaiStr = $('bSampai').value;
  var publik = document.querySelector('input[name=bPublik]:checked').value === '1';
  var p = berkasDipilih();
  if (judul.length < 3){ msg('err', 'Judul minimal 3 karakter.'); $('bJudul').focus(); return; }
  if (!mulaiStr){ msg('err', 'Isi tanggal mulai tayang.'); $('bMulai').focus(); return; }
  if (sampaiStr && sampaiStr < mulaiStr){ msg('err', 'Tanggal berakhir tidak boleh sebelum tanggal mulai tayang.'); $('bSampai').focus(); return; }
  if (tautan && !/^https:\/\/\S+$/i.test(tautan)){ msg('err', 'Tautan harus diawali https:// dan tanpa spasi.'); $('bTautan').focus(); return; }
  if (p.salah.length){ msg('err', 'Perbaiki lampiran dulu. Tidak bisa dilampirkan: ' + p.salah.join('; ') + '.'); return; }

  var data = { judul: judul, isi: isi, jenis: $('bJenis').value, publik: publik, disematkan: $('bSemat').checked, terbit: terbit,
    mulai: awalHari(mulaiStr), sampai: sampaiStr ? akhirHari(sampaiStr) : null, tautan: tautan || null };
  var editId = K.edit && K.edit.id, urut = K.edit ? K.edit.lampiran.length : 0, idTersimpan = null;
  sibuk(true); msg('busy', 'Menyimpan berita…');
  SB.simpanBerita(editId, data, publik ? [] : K.sasaran).then(function(id){
    idTersimpan = id;
    return p.files.reduce(function(rantai, f, i){
      return rantai.then(function(){
        msg('busy', 'Mengunggah lampiran ' + (i + 1) + ' dari ' + p.files.length + ': ' + f.name + '…');
        return SB.unggahLampiran(id, f, urut + i);
      });
    }, Promise.resolve());
  }).then(function(){
    toast(terbit ? 'Berita disimpan dan diterbitkan.' : 'Berita disimpan sebagai draf.', 'ok');
    K.edit = null; K.sasaran = []; muatUlang();
  }).catch(function(e){
    if (idTersimpan){
      /* berita sudah tersimpan tetapi sebagian lampiran gagal: muat ulang agar tidak tercipta berita ganda saat mencoba lagi */
      toast('Berita tersimpan, tetapi lampiran gagal diunggah: ' + errMsg(e) + ' Gunakan tombol Ubah untuk mencoba lagi.', 'err');
      K.edit = null; K.sasaran = []; muatUlang(); return;
    }
    sibuk(false); msg('err', 'Gagal menyimpan: ' + errMsg(e));
  });
}
