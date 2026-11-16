-- =====================================================================
-- Usulan revisi seluruh satker (pilihan "Semua" pada kolom Unit, khusus Super admin)
--
-- Satu usulan berisi seluruh DIPA (semua fakultas, unit, rektorat): kategori & unit = null,
-- lintas_unit = true. Dipakai Super admin untuk efisiensi/optimalisasi/kebutuhan mendesak lintas unit.
--   - hanya dapat dibentuk bila tidak ada usulan aktif lain pada TA itu, dan selama usulan seluruh
--     satker aktif, unit tidak dapat membentuk usulan (keduanya mengubah item DIPA yang sama);
--   - simpan_salinan memakai seluruh DIPA sebagai basis; detail baru ikut unit pemilik sub komponennya.
-- =====================================================================

create unique index if not exists usulan_satker_aktif on public.usulan_revisi (tahun)
  where histori and kategori is null and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui');

-- penjaga unit usulan histori: pertahankan juga tanda lintas_unit (usulan seluruh satker)
create or replace function public.fn_jaga_unit_histori() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if old.histori then new.kategori := old.kategori; new.unit := old.unit; new.lintas_unit := old.lintas_unit; end if;
  return new;
end $$;

create or replace function public.buat_histori(p_versi_id bigint, p_kategori text, p_unit text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_satker boolean := coalesce(p_kategori, '') = ''; v_label text;
  v_peran text := public.fn_peran(); v record; v_akhir bigint; a record;
  v_id bigint; v_no int; v_judul text; v_n int; v_pagu bigint; v_item int;
begin
  if v_peran not in ('UNIT', 'ADMIN', 'SUPERADMIN') then raise exception 'Peran Anda tidak dapat membuat usulan revisi.'; end if;
  select * into v from public.anggaran_versi where id = p_versi_id;
  if not found then raise exception 'Versi RKK (histori awal) tidak ditemukan.'; end if;
  select id into v_akhir from public.anggaran_versi where tahun = v.tahun order by posisi desc limit 1;
  if v_akhir <> v.id then raise exception 'Histori awal harus DIPA terakhir TA %. Muat ulang halaman.', v.tahun; end if;
  if v_satker then
    if not public.fn_superadmin() then raise exception 'Usulan revisi seluruh satker hanya dapat dibentuk Super admin.'; end if;
  elsif not (public.fn_superadmin() or public.fn_boleh(p_kategori, p_unit)) then
    raise exception 'Unit tersebut di luar cakupan Anda.';
  end if;
  v_label := case when v_satker then 'seluruh satker' else coalesce(nullif(p_unit, ''), p_kategori) end;

  select count(*), coalesce(sum(jumlah), 0) into v_item, v_pagu from public.anggaran
   where versi_id = v.id and (v_satker or (kategori = p_kategori and unit is not distinct from nullif(p_unit, '')));
  if v_item = 0 then raise exception 'Unit % tidak memiliki anggaran pada RKK ini.', v_label; end if;

  -- usulan seluruh satker & usulan unit tidak boleh berjalan bersamaan (mengubah item yang sama)
  if v_satker then
    select string_agg(coalesce(nullif(unit, ''), kategori, 'satker') || ' (' || status || ')', ', ') into v_label from public.usulan_revisi
     where tahun = v.tahun and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui');
    if v_label is not null then
      raise exception 'Masih ada usulan revisi aktif: %. Selesaikan atau batalkan lebih dulu sebelum membentuk usulan seluruh satker.', v_label;
    end if;
    v_label := 'seluruh satker';
  else
    select id, judul, status into a from public.usulan_revisi
     where tahun = v.tahun and histori and kategori is null and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui') limit 1;
    if found then
      raise exception 'Sedang ada % untuk seluruh satker (status %). Usulan unit dapat dibentuk setelah usulan itu selesai.', a.judul, a.status;
    end if;
    select id, judul, status into a from public.usulan_revisi
     where tahun = v.tahun and kategori = p_kategori and coalesce(unit, '') = coalesce(p_unit, '')
       and status in ('draf', 'diajukan', 'dikembalikan', 'disetujui') limit 1;
    if found then
      raise exception 'Unit % masih memiliki % (status %). Selesaikan atau batalkan usulan itu lebih dulu.', v_label, a.judul, a.status;
    end if;
  end if;

  v_no := coalesce(v.revisi_ke, 0) + 1;
  v_judul := 'Usulan Revisi ke ' || v_no;
  select count(*) into v_n from public.usulan_revisi
   where tahun = v.tahun and coalesce(kategori, '') = coalesce(p_kategori, '') and coalesce(unit, '') = coalesce(p_unit, '') and revisi_ke = v_no;
  if v_n > 0 then v_judul := v_judul || ' (' || (v_n + 1) || ')'; end if;

  insert into public.usulan_revisi (tahun, versi_id, kategori, unit, lintas_unit, judul, alasan, histori, revisi_ke, pagu_awal, pagu_usulan, dibuat_oleh, dibuat_email)
  values (v.tahun, v.id, nullif(p_kategori, ''), nullif(p_unit, ''), v_satker, v_judul, '', true, v_no, v_pagu, v_pagu, auth.uid(),
          coalesce((select email from public.pengguna where id = auth.uid()), ''))
  returning id into v_id;

  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select v_id, x.id, x.urutan, x.prog, x.prog_n, x.keg, x.keg_n, x.kro, x.kro_n, x.ro, x.ro_n, x.komp, x.komp_n,
         x.sub, x.sub_n, x.akun, x.akun_n, x.sumber, x.kategori, x.unit, x.judul, x.judul2, x.uraian, x.volume, x.satuan, x.harga, x.jumlah, x.blokir
    from public.anggaran x
   where x.versi_id = v.id and (v_satker or (x.kategori = p_kategori and x.unit is not distinct from nullif(p_unit, '')));

  perform public.fn_log_usulan(v_id, 'dibuat', case when v_satker then 'Seluruh satker · ' else '' end || 'Histori awal: DIPA – Revisi ke ' || coalesce(v.revisi_ke::text, '?') ||
                                               ' (posisi ' || to_char(v.posisi, 'DD-MM-YYYY') || ')');
  return jsonb_build_object('id', v_id, 'judul', v_judul, 'item', v_item, 'pagu', v_pagu);
end;
$function$;

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

revoke all on function public.buat_histori(bigint, text, text), public.simpan_salinan(bigint, jsonb) from public, anon;
grant execute on function public.buat_histori(bigint, text, text), public.simpan_salinan(bigint, jsonb) to authenticated, service_role;
