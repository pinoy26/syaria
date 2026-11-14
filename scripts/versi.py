#!/usr/bin/env python3
"""Pasang/perbarui penanda versi (?v=...) pada semua berkas JS & CSS lokal.

Tujuan: setelah pembaruan diunggah ke GitHub Pages, browser pasti mengambil SEMUA
berkas baru bersamaan — tidak tercampur index.html baru dengan modul JS lama dari cache
(GitHub Pages menyimpan berkas di cache browser hingga 10 menit).

Setiap modul memakai penanda versi yang SAMA di semua tempat ia di-import; bila berbeda,
browser memuat modul yang sama dua kali dan state aplikasi terpecah.

Jalankan dari folder proyek SEBELUM commit:   python3 scripts/versi.py
Versi = tanggal-jam saat ini (UTC), mis. 202611141530. Bisa juga: python3 scripts/versi.py <versi>
"""
import re, sys, glob, os, datetime

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
versi = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.utcnow().strftime('%Y%m%d%H%M')
if not re.fullmatch(r'[0-9A-Za-z._-]+', versi):
    sys.exit('Versi hanya boleh berisi huruf, angka, titik, garis bawah, atau minus.')

def ganti(path, pola, fungsi):
    s = open(path, encoding='utf-8').read()
    baru, n = re.subn(pola, fungsi, s)
    if baru != s:
        open(path, 'w', encoding='utf-8').write(baru)
    return n

total = 0
# import antar-modul: from './x.js' / from '../x.js'  (URL absolut/CDN tidak disentuh)
for f in sorted(glob.glob(os.path.join(AKAR, 'js', '**', '*.js'), recursive=True)):
    total += ganti(f, r"""(from\s+['"])(\.{1,2}/[^'"?]+\.js)(\?v=[^'"]*)?(['"])""",
                   lambda m: m.group(1) + m.group(2) + '?v=' + versi + m.group(4))
# index.html: styles.css, config.js, js/main.js
total += ganti(os.path.join(AKAR, 'index.html'),
               r"""((?:href|src)=")((?:styles\.css)|(?:config\.js)|(?:js/main\.js))(\?v=[^"]*)?(")""",
               lambda m: m.group(1) + m.group(2) + '?v=' + versi + m.group(4))
print('Versi %s dipasang pada %d rujukan berkas.' % (versi, total))
