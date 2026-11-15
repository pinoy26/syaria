-- =====================================================================
-- Monev Anggaran tahap 9: Belanja Redesain — edit salinan kerja usulan (detail & header)
--
-- simpan_salinan(p_id, p_rows): unit menyimpan seluruh salinan kerja usulannya (hasil edit di
-- Belanja Redesain). Simpan TIDAK memeriksa aturan revisi (itu saat "Lanjut & Kirim"), tetapi
-- menjaga keutuhan data:
--   - hanya usulan histori berstatus draf/dikembalikan, milik pengusul (atau Admin perencanaan);
--   - item lama harus berasal dari DIPA basis unit itu; struktur (program s.d. akun, sumber dana)
--     selalu diambil dari DIPA basis, bukan dari kiriman browser (ubah sub komponen/akun = tahap 10);
--   - item baru harus berada di kelompok sub komponen + akun yang ada di DIPA basis unit itu;
--   - item terblokir tidak boleh diubah atau dihapus;
--   - jumlah = round(volume × harga), kecuali volume & harga item lama tidak berubah (jumlah DIPA apa adanya).
-- Setelah disimpan, baris semula → menjadi (usulan_revisi_baris) dihitung ulang dari selisih
-- salinan terhadap DIPA basis sehingga pemeriksaan, matriks dan alur persetujuan tetap sama.
-- =====================================================================

create or replace function public.simpan_salinan(p_id bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; v_pagu bigint; v_n int; r record;
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
  select * from jsonb_to_recordset(p_rows) as d(anggaran_id bigint, urutan numeric, judul text, judul2 text, uraian text,
                                                volume numeric, satuan text, harga numeric, prog text, kro text, ro text, sub text, akun text);
  drop table if exists pg_temp._basis;
  create temp table _basis on commit drop as
  select * from public.anggaran where versi_id = u.versi_id and kategori = u.kategori and unit is not distinct from u.unit;

  if exists (select 1 from _salinan where urutan is null) then raise exception 'Urutan baris tidak lengkap. Muat ulang halaman.'; end if;
  select anggaran_id into r from _salinan where anggaran_id is not null group by anggaran_id having count(*) > 1 limit 1;
  if found then raise exception 'Item DIPA tercatat ganda pada salinan. Muat ulang halaman.'; end if;
  if exists (select 1 from _salinan s where s.anggaran_id is not null and not exists (select 1 from _basis b where b.id = s.anggaran_id)) then
    raise exception 'Ada item yang bukan berasal dari DIPA basis unit ini.';
  end if;
  for r in select b.uraian from _basis b where b.blokir and not exists (select 1 from _salinan s where s.anggaran_id = b.id) limit 1 loop
    raise exception 'Item terblokir "%" tidak dapat dihapus.', r.uraian;
  end loop;
  for r in select b.uraian from _salinan s join _basis b on b.id = s.anggaran_id
            where b.blokir and (coalesce(btrim(s.uraian), '') <> b.uraian or s.volume is distinct from b.volume or s.harga is distinct from b.harga
                                or coalesce(btrim(s.satuan), '') <> b.satuan or coalesce(btrim(s.judul), '') <> b.judul or coalesce(btrim(s.judul2), '') <> b.judul2) limit 1 loop
    raise exception 'Item terblokir "%" tidak dapat diubah.', r.uraian;
  end loop;
  if exists (select 1 from _salinan where length(btrim(coalesce(uraian, ''))) < 2) then
    raise exception 'Uraian setiap detail wajib diisi (minimal 2 karakter).';
  end if;
  for r in select s.uraian from _salinan s where s.anggaran_id is null and not exists (
             select 1 from _basis b where b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.sub = s.sub and b.akun = s.akun) limit 1 loop
    raise exception 'Detail baru "%" tidak berada di sub komponen/akun milik unit ini.', r.uraian;
  end loop;
  for r in select s.uraian from _salinan s left join _basis b on b.id = s.anggaran_id
            where (b.id is null or s.volume is distinct from b.volume or s.harga is distinct from b.harga)
              and (s.volume is null or s.harga is null or s.volume < 0 or s.harga < 0) limit 1 loop
    raise exception 'Volume dan harga satuan "%" wajib diisi dan tidak boleh negatif.', r.uraian;
  end loop;

  -- salinan baru: struktur selalu dari DIPA basis
  delete from public.usulan_salinan where usulan_id = p_id;
  insert into public.usulan_salinan (usulan_id, anggaran_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                     sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian, volume, satuan, harga, jumlah, blokir)
  select p_id, s.anggaran_id, s.urutan, k.prog, k.prog_n, k.keg, k.keg_n, k.kro, k.kro_n, k.ro, k.ro_n, k.komp, k.komp_n,
         k.sub, k.sub_n, k.akun, k.akun_n, k.sumber, k.kategori, k.unit,
         coalesce(btrim(s.judul), ''), coalesce(btrim(s.judul2), ''), btrim(s.uraian), s.volume, coalesce(btrim(s.satuan), ''), s.harga,
         case when a.id is not null and s.volume is not distinct from a.volume and s.harga is not distinct from a.harga then a.jumlah
              else round(s.volume * s.harga)::bigint end,
         coalesce(a.blokir, false)
    from _salinan s
    left join _basis a on a.id = s.anggaran_id
    cross join lateral (select * from _basis b
                         where (a.id is not null and b.id = a.id)
                            or (a.id is null and b.prog = s.prog and b.kro = s.kro and b.ro = s.ro and b.sub = s.sub and b.akun = s.akun)
                         order by b.urutan limit 1) k;

  -- baris semula → menjadi dari selisih salinan terhadap DIPA basis
  delete from public.usulan_revisi_baris where usulan_id = p_id;
  insert into public.usulan_revisi_baris (usulan_id, urutan, aksi, anggaran_id, prog, keg, kro, ro, komp, sub, akun, sumber, kategori, unit,
                                          judul, judul2, uraian, s_volume, s_satuan, s_harga, s_jumlah, m_volume, m_satuan, m_harga, m_jumlah, blokir)
  select p_id, row_number() over (order by x.ur, x.aksi), x.aksi, x.aid, x.prog, x.keg, x.kro, x.ro, x.komp, x.sub, x.akun, x.sumber, x.kategori, x.unit,
         x.judul, x.judul2, x.uraian, x.sv, x.ss, x.sh, x.sj, x.mv, x.ms, x.mh, x.mj, x.blokir
    from (
      select s.urutan ur, 'ubah' aksi, b.id aid, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             b.volume sv, b.satuan ss, b.harga sh, b.jumlah sj, s.volume mv, s.satuan ms, s.harga mh, s.jumlah mj, b.blokir
        from public.usulan_salinan s join _basis b on b.id = s.anggaran_id
       where s.usulan_id = p_id and (s.volume is distinct from b.volume or s.harga is distinct from b.harga or s.satuan <> b.satuan
                                     or s.uraian <> b.uraian or s.judul <> b.judul or s.judul2 <> b.judul2 or s.jumlah <> b.jumlah)
      union all
      select s.urutan, 'tambah', null, s.prog, s.keg, s.kro, s.ro, s.komp, s.sub, s.akun, s.sumber, s.kategori, s.unit, s.judul, s.judul2, s.uraian,
             null, '', null, 0, s.volume, s.satuan, s.harga, s.jumlah, false
        from public.usulan_salinan s where s.usulan_id = p_id and s.anggaran_id is null
      union all
      select b.urutan, 'hapus', b.id, b.prog, b.keg, b.kro, b.ro, b.komp, b.sub, b.akun, b.sumber, b.kategori, b.unit, b.judul, b.judul2, b.uraian,
             b.volume, b.satuan, b.harga, b.jumlah, null, '', null, 0, b.blokir
        from _basis b where not exists (select 1 from public.usulan_salinan s where s.usulan_id = p_id and s.anggaran_id = b.id)
    ) x;
  get diagnostics v_n = row_count;

  select coalesce(sum(jumlah), 0) into v_pagu from public.usulan_salinan where usulan_id = p_id;
  update public.usulan_revisi set pagu_usulan = v_pagu, diubah_pada = now(), hasil_periksa = public.periksa_usulan(p_id) where id = p_id;
  return jsonb_build_object('id', p_id, 'pagu', v_pagu, 'selisih', v_pagu - u.pagu_awal, 'perubahan', v_n,
                            'periksa', (select hasil_periksa from public.usulan_revisi where id = p_id));
end;
$function$;

revoke all on function public.simpan_salinan(bigint, jsonb) from public, anon;
grant execute on function public.simpan_salinan(bigint, jsonb) to authenticated, service_role;
