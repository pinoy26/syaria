-- =====================================================================
-- Aturan realisasi per detail (disepakati 2026-11-16): detail yang sudah terealisasi
--   - tidak boleh dihapus atau dipindah ke sub komponen/akun lain;
--   - jumlah menjadi tidak boleh DITURUNKAN sampai di bawah realisasinya (posisi data realisasi terakhir TA itu);
--     detail yang sejak DIPA sudah melebihi pagu (realisasi > jumlah) tetap boleh dibiarkan atau dinaikkan.
-- Item berblokir tetap memakai aturan blokir (jumlah ≥ blokir + realisasi).
-- Diperiksa saat Simpan (simpan_salinan: ditolak) dan saat Lanjut & Kirim / persetujuan (periksa_usulan).
-- =====================================================================

create or replace function public.simpan_salinan(p_id bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; v_pagu bigint; v_n int; r record; v_unit boolean := public.fn_peran() = 'UNIT';
begin
  select * into u from public.usulan_revisi where id = p_id and (dibuat_oleh = auth.uid() or public.fn_superadmin());
  if not found then raise exception 'Usulan tidak ditemukan atau bukan milik Anda.'; end if;
  if not u.histori then raise exception 'Usulan ini dibuat dengan formulir lama; ubah lewat formulir usulan.'; end if;
  if u.status not in ('draf', 'dikembalikan') then raise exception 'Usulan yang sudah diajukan tidak dapat diubah.'; end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Rincian anggaran usulan tidak boleh kosong.';
  end if;

  drop table if exists pg_temp._salinan;
  create temp table _salinan on commit drop as
  select d.anggaran_id, d.urutan, d.judul, d.judul2, d.uraian, d.volume, d.satuan, d.harga,
         d.prog, d.kro, d.ro, d.komp, btrim(d.sub) sub, btrim(d.sub_n) sub_n, btrim(d.akun) akun, d.sumber
    from jsonb_to_recordset(p_rows) as d(anggaran_id bigint, urutan numeric, judul text, judul2 text, uraian text,
                                         volume numeric, satuan text, harga numeric, prog text, kro text, ro text, komp text,
                                         sub text, sub_n text, akun text, sumber text);
  drop table if exists pg_temp._basis;
  create temp table _basis on commit drop as
  select * from public.anggaran where versi_id = u.versi_id
     and (u.kategori is null or (kategori = u.kategori and unit is not distinct from u.unit));   -- kategori null = usulan seluruh satker
  drop table if exists pg_temp._real;
  create temp table _real on commit drop as
  select z.prog, z.kro, z.ro, z.sub, z.akun, sum(z.sd)::bigint sd from public.realisasi z
   where z.periode = (select max(periode) from public.periode where extract(year from periode)::int = u.tahun)
   group by 1, 2, 3, 4, 5;

  -- keutuhan baris
  if exists (select 1 from _salinan where urutan is null) then raise exception 'Urutan baris tidak lengkap. Muat ulang halaman.'; end if;
  select anggaran_id into r from _salinan where anggaran_id is not null group by anggaran_id having count(*) > 1 limit 1;
  if found then raise exception 'Item DIPA tercatat ganda pada salinan. Muat ulang halaman.'; end if;
  if exists (select 1 from _salinan s where s.anggaran_id is not null and not exists (select 1 from _basis b where b.id = s.anggaran_id)) then
    raise exception 'Ada item yang bukan berasal dari DIPA basis unit ini.';
  end if;
  if exists (select 1 from _salinan where length(btrim(coalesce(uraian, ''))) < 2) then
    raise exception 'Uraian setiap detail wajib diisi (minimal 2 karakter).';
  end if;
  for r in select s.uraian from _salinan s left join _basis b on b.id = s.anggaran_id
            where (b.id is null or s.volume is distinct from b.volume or s.harga is distinct from b.harga)
              and (s.volume is null or s.harga is null or s.volume < 0 or s.harga < 0) limit 1 loop
    raise exception 'Volume dan harga satuan "%" wajib diisi dan tidak boleh negatif.', r.uraian;
  end loop;

  -- struktur: tetap di komponen milik unit; sub komponen & akun boleh berubah dengan syarat
  for r in select s.uraian from _salinan s join _basis b on b.id = s.anggaran_id
            where s.prog is distinct from b.prog or s.kro is distinct from b.kro or s.ro is distinct from b.ro or s.komp is distinct from b.komp limit 1 loop
    raise exception 'Item "%" tidak dapat dipindah ke komponen lain.', r.uraian;
  end loop;
  for r in select s.uraian from _salinan s where s.anggaran_id is null and not exists (
             select 1 from _basis b where b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.komp = s.komp) limit 1 loop
    raise exception 'Detail baru "%" tidak berada di komponen milik unit ini.', r.uraian;
  end loop;
  for r in select distinct s.sub from _salinan s
            where left(coalesce(s.sub, ''), length(coalesce(s.komp, '')) + 1) <> coalesce(s.komp, '') || '.'
               or substr(coalesce(s.sub, ''), length(coalesce(s.komp, '')) + 2) !~ '^[A-Z0-9]{1,4}$' limit 1 loop
    raise exception 'Kode sub komponen "%" tidak valid (1–4 huruf kapital/angka, mis. AA).', r.sub;
  end loop;
  if exists (select 1 from _salinan where length(coalesce(sub_n, '')) < 3) then
    raise exception 'Uraian sub komponen wajib diisi (minimal 3 karakter).';
  end if;
  for r in select distinct s.sub from _salinan s
            where not exists (select 1 from _basis b where b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.sub = s.sub)
              and exists (select 1 from public.anggaran x where x.versi_id = u.versi_id and x.prog = s.prog and x.kro = s.kro and x.ro = s.ro and x.sub = s.sub) limit 1 loop
    raise exception 'Kode sub komponen % sudah dipakai unit lain di DIPA.', r.sub;
  end loop;
  for r in select distinct s.akun from _salinan s where not exists (select 1 from public.ref_akun a where a.kode = s.akun and length(a.kode) = 6) limit 1 loop
    raise exception 'Akun % tidak ada di Bagan Akun Standar.', r.akun;
  end loop;
  if v_unit and exists (select 1 from _salinan s left join _basis b on b.id = s.anggaran_id
                         where left(s.akun, 2) = '51' and (b.id is null or b.akun <> s.akun)) then
    raise exception 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.';
  end if;
  for r in select s.uraian from _salinan s join _basis b on b.id = s.anggaran_id
            where s.sumber is not null and s.sumber <> b.sumber limit 1 loop
    raise exception 'Sumber dana item "%" tidak dapat diubah.', r.uraian;
  end loop;
  for r in select s.uraian from _salinan s where s.anggaran_id is null and not exists (select 1 from _basis b where b.sumber = coalesce(s.sumber, '')) limit 1 loop
    raise exception 'Sumber dana detail baru "%" tidak dikenal.', r.uraian;
  end loop;
  -- sub komponen lama yang diubah (kode/uraian) harus belum ada realisasinya
  for r in select b.sub, b.sub_n, coalesce(sum(x.sd), 0)::bigint sd
             from (select distinct b.prog, b.kro, b.ro, b.sub, b.sub_n from _salinan s join _basis b on b.id = s.anggaran_id
                    where s.sub <> b.sub or s.sub_n is distinct from b.sub_n) b
             left join _real x on x.prog = b.prog and x.kro = b.kro and x.ro = b.ro and x.sub = b.sub
            group by 1, 2 having coalesce(sum(x.sd), 0) > 0 limit 1 loop
    raise exception 'Sub komponen % sudah memiliki realisasi Rp %; kode dan uraiannya tidak dapat diubah.', r.sub, public.fn_rp(r.sd);
  end loop;
  -- akun lama yang diganti harus belum ada realisasinya di sub komponen itu
  for r in select b.sub, b.akun, coalesce(x.sd, 0) sd
             from (select distinct b.prog, b.kro, b.ro, b.sub, b.akun from _salinan s join _basis b on b.id = s.anggaran_id where s.akun <> b.akun) b
             left join _real x on x.prog = b.prog and x.kro = b.kro and x.ro = b.ro and x.sub = b.sub and x.akun = b.akun
            where coalesce(x.sd, 0) > 0 limit 1 loop
    raise exception 'Akun % di sub komponen % sudah memiliki realisasi Rp %; akun tidak dapat diganti.', r.akun, r.sub, public.fn_rp(r.sd);
  end loop;

  -- blokir per item: bagian yang diblokir tidak boleh digeser, dipindah, atau dihapus
  drop table if exists pg_temp._blokir;
  create temp table _blokir on commit drop as
  select k.* from public.blokir_item(u.versi_id) k join _basis b on b.id = k.anggaran_id where k.blokir > 0;
  for r in select b.uraian, k.blokir from _blokir k join _basis b on b.id = k.anggaran_id
            where not exists (select 1 from _salinan s where s.anggaran_id = k.anggaran_id) limit 1 loop
    raise exception 'Item "%" memiliki blokir Rp % dan tidak dapat dihapus.', r.uraian, public.fn_rp(r.blokir);
  end loop;
  for r in select b.uraian from _salinan s join _basis b on b.id = s.anggaran_id join _blokir k on k.anggaran_id = b.id
            where coalesce(btrim(s.uraian), '') <> b.uraian or coalesce(btrim(s.judul), '') <> b.judul or coalesce(btrim(s.judul2), '') <> b.judul2
               or s.sub <> b.sub or s.akun <> b.akun limit 1 loop
    raise exception 'Item berblokir "%" tidak dapat diganti uraian/header-nya atau dipindah sub komponen/akun.', r.uraian;
  end loop;
  for r in select b.uraian, b.jumlah, k.blokir, k.realisasi,
                  case when s.volume is not distinct from b.volume and s.harga is not distinct from b.harga then b.jumlah
                       else round(coalesce(s.volume, 0) * coalesce(s.harga, 0))::bigint end baru
             from _salinan s join _basis b on b.id = s.anggaran_id join _blokir k on k.anggaran_id = b.id loop
    if r.blokir >= r.jumlah and r.baru <> r.jumlah then
      raise exception 'Item "%" diblokir penuh (Rp %) dan tidak dapat diubah.', r.uraian, public.fn_rp(r.blokir);
    elsif r.baru < r.blokir + r.realisasi then
      raise exception 'Jumlah "%" minimal Rp % (blokir Rp % + realisasi Rp %).', r.uraian, public.fn_rp(r.blokir + r.realisasi), public.fn_rp(r.blokir), public.fn_rp(r.realisasi);
    end if;
  end loop;

  -- detail yang sudah terealisasi (tanpa blokir; item berblokir sudah dijaga di atas):
  -- tidak boleh dihapus/dipindah dan jumlah menjadi tidak boleh di bawah realisasinya
  drop table if exists pg_temp._real;
  create temp table _real on commit drop as
  select k.anggaran_id, k.realisasi from public.blokir_item(u.versi_id) k join _basis b on b.id = k.anggaran_id where k.realisasi > 0 and k.blokir = 0;
  for r in select b.uraian, x.realisasi from _real x join _basis b on b.id = x.anggaran_id
            where not exists (select 1 from _salinan s where s.anggaran_id = b.id) limit 1 loop
    raise exception 'Detail "%" sudah terealisasi Rp % dan tidak dapat dihapus.', r.uraian, public.fn_rp(r.realisasi);
  end loop;
  for r in select b.uraian, x.realisasi,
                  case when s.volume is not distinct from b.volume and s.harga is not distinct from b.harga then b.jumlah
                       else round(s.volume * s.harga)::bigint end baru, b.jumlah semula
             from _salinan s join _basis b on b.id = s.anggaran_id join _real x on x.anggaran_id = b.id loop
    if r.baru < r.realisasi and r.baru < r.semula then   -- hanya bila diturunkan (detail yang sejak DIPA sudah melebihi pagu tidak menghalangi)
      raise exception 'Jumlah "%" menjadi Rp %, di bawah realisasinya Rp %. Detail yang sudah terealisasi tidak boleh lebih kecil dari realisasinya.', r.uraian, public.fn_rp(r.baru), public.fn_rp(r.realisasi);
    end if;
  end loop;

  -- salinan baru: program s.d. komponen dari DIPA basis; sub komponen & akun dari salinan
  delete from public.usulan_salinan where usulan_id = p_id;
  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select p_id, s.anggaran_id, s.urutan, k.prog, k.prog_n, k.keg, k.keg_n, k.kro, k.kro_n, k.ro, k.ro_n, k.komp, k.komp_n,
         s.sub, s.sub_n, s.akun, coalesce(nullif(ra.nama, ''), k.akun_n), case when a.id is not null then a.sumber else s.sumber end,
         k.kategori, k.unit,
         coalesce(btrim(s.judul), ''), coalesce(btrim(s.judul2), ''), btrim(s.uraian), s.volume, coalesce(btrim(s.satuan), ''), s.harga,
         case when a.id is not null and s.volume is not distinct from a.volume and s.harga is not distinct from a.harga then a.jumlah
              else round(s.volume * s.harga)::bigint end,
         coalesce(a.blokir, false)
    from _salinan s
    left join _basis a on a.id = s.anggaran_id
    left join public.ref_akun ra on ra.kode = s.akun
    cross join lateral (select * from _basis b
                         where (a.id is not null and b.id = a.id)
                            or (a.id is null and b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.komp = s.komp)
                         order by (b.sub = s.sub) desc, b.urutan limit 1) k;   -- detail baru ikut unit pemilik sub komponennya

  -- baris semula → menjadi; item yang pindah sub komponen/akun = hapus (lama) + tambah (baru)
  delete from public.usulan_revisi_baris where usulan_id = p_id;
  insert into public.usulan_revisi_baris (usulan_id, urutan, aksi, anggaran_id, prog, keg, kro, ro, komp, sub, akun, sumber, kategori, unit,
                                          judul, judul2, uraian, s_volume, s_satuan, s_harga, s_jumlah, m_volume, m_satuan, m_harga, m_jumlah, blokir)
  select p_id, row_number() over (order by x.ur, x.aksi), x.aksi, x.aid, x.prog, x.keg, x.kro, x.ro, x.komp, x.sub, x.akun, x.sumber, x.kategori, x.unit,
         x.judul, x.judul2, x.uraian, x.sv, x.ss, x.sh, x.sj, x.mv, x.ms, x.mh, x.mj, x.blokir
    from (
      select s.urutan ur, 'ubah' aksi, b.id aid, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             b.volume sv, b.satuan ss, b.harga sh, b.jumlah sj, s.volume mv, s.satuan ms, s.harga mh, s.jumlah mj, b.blokir
        from public.usulan_salinan s join _basis b on b.id = s.anggaran_id
       where s.usulan_id = p_id and s.sub = b.sub and s.akun = b.akun
         and (s.volume is distinct from b.volume or s.harga is distinct from b.harga or s.satuan <> b.satuan or s.uraian <> b.uraian
              or s.judul <> b.judul or s.judul2 <> b.judul2 or s.jumlah <> b.jumlah or s.sub_n is distinct from b.sub_n)
      union all
      select s.urutan, 'tambah', null, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             null, '', null, 0, s.volume, s.satuan, s.harga, s.jumlah, false
        from public.usulan_salinan s left join _basis b on b.id = s.anggaran_id
       where s.usulan_id = p_id and (s.anggaran_id is null or s.sub <> b.sub or s.akun <> b.akun)
      union all
      select b.urutan, 'hapus', b.id, b.prog, b.keg, b.kro, b.ro, b.komp, b.sub, b.akun, b.sumber, b.kategori, b.unit, b.judul, b.judul2, b.uraian,
             b.volume, b.satuan, b.harga, b.jumlah, null, '', null, 0, b.blokir
        from _basis b
       where not exists (select 1 from public.usulan_salinan s where s.usulan_id = p_id and s.anggaran_id = b.id and s.sub = b.sub and s.akun = b.akun)
    ) x;
  get diagnostics v_n = row_count;

  select coalesce(sum(jumlah), 0) into v_pagu from public.usulan_salinan where usulan_id = p_id;
  update public.usulan_revisi set pagu_usulan = v_pagu, diubah_pada = now(), hasil_periksa = public.periksa_usulan(p_id) where id = p_id;
  return jsonb_build_object('id', p_id, 'pagu', v_pagu, 'selisih', v_pagu - u.pagu_awal, 'perubahan', v_n,
                            'periksa', (select hasil_periksa from public.usulan_revisi where id = p_id));
end;
$function$;

create or replace function public.periksa_usulan(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  u record; r record; v_peran text; v_delta bigint; v_periode date; v_n int;
  v_tolak text[] := '{}'; v_telaah text[] := '{}';
  n53 bigint; t53 bigint; n52 bigint; t52 bigint; n524 bigint; t524 bigint;
begin
  select * into u from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  select peran into v_peran from public.pengguna where id = u.dibuat_oleh;

  if not exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id) then
    v_tolak := v_tolak || 'Usulan belum berisi perubahan.'::text;
  end if;

  select coalesce(sum(m_jumlah - s_jumlah), 0) into v_delta from public.usulan_revisi_baris where usulan_id = p_id;
  if v_delta <> 0 then
    v_tolak := v_tolak || format('Usulan tidak seimbang: selisih Rp %s. Pagu yang dikurangi harus sama dengan yang ditambahkan.', public.fn_rp(v_delta));
  end if;

  if exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id group by sumber having sum(m_jumlah - s_jumlah) <> 0) then
    v_tolak := v_tolak || 'Pergeseran antar sumber dana (RM ↔ PNBP) tidak diperbolehkan.'::text;
  end if;

  if v_peran = 'UNIT' and exists (select 1 from public.usulan_revisi_baris where usulan_id = p_id and left(akun, 2) = '51') then
    v_tolak := v_tolak || 'Akun 51 (Belanja Pegawai) dikunci untuk fakultas/unit.'::text;
  end if;

  -- blokir per item (dari RKK − FA Detail, atau blokir manual Admin perencanaan):
  -- bagian yang diblokir tidak boleh digeser; item blokir penuh / berblokir tidak boleh dihapus
  for r in
    select b.uraian, b.aksi, b.m_jumlah, k.blokir bl, k.realisasi sd, a.jumlah j
      from public.usulan_revisi_baris b
      join public.blokir_item(u.versi_id) k on k.anggaran_id = b.anggaran_id
      join public.anggaran a on a.id = b.anggaran_id
     where b.usulan_id = p_id and k.blokir > 0
       and (b.aksi = 'hapus' or (k.blokir >= a.jumlah and b.m_jumlah <> a.jumlah) or b.m_jumlah < k.blokir + k.realisasi)
  loop
    v_tolak := v_tolak || case when r.aksi = 'hapus' then format('Item "%s" memiliki blokir Rp %s dan tidak dapat dihapus.', r.uraian, public.fn_rp(r.bl))
                               when r.bl >= r.j then format('Item "%s" diblokir penuh (Rp %s) dan tidak dapat diubah.', r.uraian, public.fn_rp(r.bl))
                               else format('Jumlah "%s" minimal Rp %s (blokir Rp %s + realisasi Rp %s).', r.uraian, public.fn_rp(r.bl + r.sd), public.fn_rp(r.bl), public.fn_rp(r.sd)) end;
  end loop;

  -- detail yang sudah terealisasi (tanpa blokir): tidak boleh dihapus/dipindah, jumlah ≥ realisasi
  for r in
    select b.uraian, b.aksi, b.m_jumlah, k.realisasi sd
      from public.usulan_revisi_baris b
      join public.blokir_item(u.versi_id) k on k.anggaran_id = b.anggaran_id
     where b.usulan_id = p_id and k.blokir = 0 and k.realisasi > 0 and (b.aksi = 'hapus' or (b.m_jumlah < k.realisasi and b.m_jumlah < b.s_jumlah))
  loop
    v_tolak := v_tolak || case when r.aksi = 'hapus' then format('Detail "%s" sudah terealisasi Rp %s dan tidak dapat dihapus atau dipindah.', r.uraian, public.fn_rp(r.sd))
                               else format('Jumlah "%s" menjadi Rp %s, di bawah realisasinya Rp %s.', r.uraian, public.fn_rp(r.m_jumlah), public.fn_rp(r.sd)) end;
  end loop;

  select count(distinct coalesce(kategori, '') || '|' || coalesce(unit, '')) into v_n from public.usulan_revisi_baris where usulan_id = p_id;
  if v_n > 1 and coalesce(v_peran, '') <> 'SUPERADMIN' then
    v_tolak := v_tolak || 'Pergeseran antar fakultas/unit hanya dapat dilakukan Admin perencanaan.'::text;
  end if;
  if v_peran = 'UNIT' and exists (
       select 1 from public.usulan_revisi_baris b where b.usulan_id = p_id and not exists (
         select 1 from public.pengguna_cakupan c where c.user_id = u.dibuat_oleh and c.kategori = b.kategori and (c.unit = '' or c.unit = b.unit))) then
    v_tolak := v_tolak || 'Usulan memuat item di luar cakupan unit Anda.'::text;
  end if;

  -- pagu kelompok (sub komponen + akun) tidak boleh di bawah realisasi posisi terakhir tahun itu
  select max(periode) into v_periode from public.periode where extract(year from periode)::int = u.tahun;
  if v_periode is not null then
    for r in
      with d as (select prog, kro, ro, sub, akun, sum(m_jumlah - s_jumlah) delta from public.usulan_revisi_baris
                  where usulan_id = p_id group by 1,2,3,4,5 having sum(m_jumlah - s_jumlah) < 0),
           g as (select prog, kro, ro, sub, akun, sum(jumlah) pagu from public.anggaran where versi_id = u.versi_id group by 1,2,3,4,5),
           s as (select prog, kro, ro, sub, akun, sum(sd) sd from public.realisasi where periode = v_periode group by 1,2,3,4,5)
      select d.sub, d.akun, (g.pagu + d.delta)::bigint baru, coalesce(s.sd, 0)::bigint sd
        from d join g using (prog, kro, ro, sub, akun) left join s using (prog, kro, ro, sub, akun)
       where g.pagu + d.delta < coalesce(s.sd, 0)
    loop
      v_tolak := v_tolak || format('Pagu sub komponen %s akun %s menjadi Rp %s, di bawah realisasinya Rp %s.', r.sub, r.akun, public.fn_rp(r.baru), public.fn_rp(r.sd));
    end loop;
  end if;

  -- perlu telaah: arah pergeseran antar kelompok jenis belanja (neto per kelompok)
  select coalesce(sum(d) filter (where k = '53'  and d > 0), 0), coalesce(sum(d) filter (where k = '53'  and d < 0), 0),
         coalesce(sum(d) filter (where k = '52'  and d > 0), 0), coalesce(sum(d) filter (where k = '52'  and d < 0), 0),
         coalesce(sum(d) filter (where k = '524' and d > 0), 0), coalesce(sum(d) filter (where k = '524' and d < 0), 0)
    into n53, t53, n52, t52, n524, t524
    from (select case when akun like '53%' then '53' when akun like '524%' then '524' when akun like '52%' then '52' else 'lain' end k,
                 sum(m_jumlah - s_jumlah) d
            from public.usulan_revisi_baris where usulan_id = p_id group by 1) x;
  if n53 > 0 and (t52 < 0 or t524 < 0) then v_telaah := v_telaah || 'Pergeseran dari belanja barang (52) ke belanja modal (53).'::text; end if;
  if t53 < 0 and (n52 > 0 or n524 > 0) then v_telaah := v_telaah || 'Pergeseran dari belanja modal (53) ke belanja barang (52).'::text; end if;
  if n524 > 0 and t52 < 0 then v_telaah := v_telaah || 'Pergeseran dari akun 52 lainnya ke perjalanan dinas (524).'::text; end if;

  return jsonb_build_object('tolak', to_jsonb(v_tolak), 'telaah', to_jsonb(v_telaah), 'selisih', v_delta, 'diperiksa', now());
end;
$function$;

revoke all on function public.periksa_usulan(bigint) from public, anon, authenticated;
revoke all on function public.simpan_salinan(bigint, jsonb) from public, anon;
grant execute on function public.simpan_salinan(bigint, jsonb) to authenticated, service_role;
