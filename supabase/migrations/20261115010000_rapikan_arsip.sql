-- =====================================================================
-- Rapikan arsip tahun anggaran yang sudah selesai
--
-- Untuk tahun anggaran LAMA (lebih kecil dari tahun posisi data terbaru), sisakan satu
-- posisi per bulan — posisi terakhir di bulan itu (termasuk posisi akhir Desember) —
-- lalu hapus posisi lain di tahun itu. Baris realisasi ikut terhapus lewat
-- FOREIGN KEY realisasi.periode ... ON DELETE CASCADE (sama seperti hapus_periode).
--
-- Tahun anggaran berjalan ditolak. Hanya super admin.
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

create or replace function public.rapikan_arsip(p_tahun int)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_terbaru int := (select max(extract(year from periode))::int from public.periode);
  v_posisi_hapus int; v_posisi_sisa int; v_baris_hapus int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya super admin yang boleh merapikan arsip.'; end if;
  if p_tahun is null or v_terbaru is null or p_tahun >= v_terbaru then
    raise exception 'Tahun anggaran % masih berjalan atau belum selesai — hanya tahun sebelum % yang bisa dirapikan.', p_tahun, v_terbaru;
  end if;

  drop table if exists _sisa;
  create temp table _sisa on commit drop as
    select max(periode) as periode
      from public.periode
     where extract(year from periode)::int = p_tahun
     group by date_trunc('month', periode);

  select count(*) into v_posisi_sisa from _sisa;
  select count(*) into v_baris_hapus
    from public.realisasi
   where extract(year from periode)::int = p_tahun and periode not in (select periode from _sisa);

  delete from public.periode
   where extract(year from periode)::int = p_tahun
     and periode not in (select periode from _sisa);
  get diagnostics v_posisi_hapus = row_count;

  return jsonb_build_object('tahun', p_tahun, 'posisi_dihapus', v_posisi_hapus,
                            'posisi_disisakan', v_posisi_sisa, 'baris_dihapus', v_baris_hapus);
end;
$function$;

revoke all on function public.rapikan_arsip(int) from anon;
grant execute on function public.rapikan_arsip(int) to authenticated, service_role;
