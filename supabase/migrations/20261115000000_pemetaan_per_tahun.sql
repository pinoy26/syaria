-- =====================================================================
-- Pemetaan sumber dana (RKK) & aturan unit kerja PER TAHUN ANGGARAN
--
-- Sebelumnya: satu set pemetaan untuk semua tahun. Unggah RKK menghapus seluruh
-- pemetaan lama, dan "terapkan ulang" bisa mengubah data tahun lalu dengan aturan baru.
-- Sesudahnya: tiap baris pemetaan punya kolom `tahun`. Data realisasi dipetakan memakai
-- pemetaan tahun posisinya; bila tahun itu belum punya pemetaan, dipakai pemetaan
-- tahun terdekat sebelumnya (mis. awal 2027 sebelum RKK 2027 diunggah → pakai 2026).
--
-- Pemetaan yang ada sekarang diberi tahun data yang sudah ada (2026).
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Kolom tahun ----------
alter table public.ref_sumber_dana add column if not exists tahun int;
update public.ref_sumber_dana
   set tahun = coalesce((select min(extract(year from periode))::int from public.periode), extract(year from current_date)::int)
 where tahun is null;
alter table public.ref_sumber_dana alter column tahun set not null;
alter table public.ref_sumber_dana alter column tahun set default extract(year from current_date)::int;
alter table public.ref_sumber_dana drop constraint if exists ref_sumber_dana_pkey;
alter table public.ref_sumber_dana add constraint ref_sumber_dana_pkey primary key (tahun, kunci);

alter table public.ref_unit add column if not exists tahun int;
update public.ref_unit
   set tahun = coalesce((select min(extract(year from periode))::int from public.periode), extract(year from current_date)::int)
 where tahun is null;
alter table public.ref_unit alter column tahun set not null;
alter table public.ref_unit alter column tahun set default extract(year from current_date)::int;
create index if not exists ref_unit_tahun_idx on public.ref_unit (tahun, komponen);

-- ---------- 2. Tahun pemetaan yang berlaku untuk suatu tahun anggaran ----------
-- tahun terdekat <= p_tahun yang punya pemetaan; bila tidak ada, tahun paling awal yang ada
create or replace function public.fn_tahun_pemetaan_unit(p_tahun int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select max(tahun) from ref_unit where tahun <= p_tahun), (select min(tahun) from ref_unit));
$$;
create or replace function public.fn_tahun_pemetaan_sumber(p_tahun int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select max(tahun) from ref_sumber_dana where tahun <= p_tahun), (select min(tahun) from ref_sumber_dana));
$$;

-- ---------- 3. Pemetaan unit kerja per tahun ----------
create or replace function public.fn_unit(p_kro text, p_komp text, p_sub text, p_tahun int)
 returns table(kategori text, unit text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_kode text := upper(split_part(coalesce(p_sub, ''), '.', 2));
  v_huruf text := left(v_kode, 1);
  v_komp text := lpad(coalesce(p_komp, ''), 3, '0');
  v_th int := public.fn_tahun_pemetaan_unit(p_tahun);
  r record;
begin
  for r in
    select * from public.ref_unit
    where tahun = v_th
      and komponen = v_komp
      and (kro = '*' or kro = p_kro)
    order by case jenis_aturan when 'KODE_LENGKAP' then 1 when 'HURUF_PERTAMA' then 2 else 3 end, id
  loop
    if r.jenis_aturan = 'KODE_LENGKAP' and upper(r.kode) = v_kode then
      kategori := r.kategori; unit := r.unit; return next; return;
    elsif r.jenis_aturan = 'HURUF_PERTAMA' and upper(r.kode) = v_huruf then
      kategori := r.kategori; unit := r.unit; return next; return;
    elsif r.jenis_aturan = 'KOMPONEN' then
      kategori := r.kategori; unit := r.unit; return next; return;
    end if;
  end loop;
  kategori := 'Rektorat'; unit := 'Lainnya'; return next;
end;
$function$;

-- versi lama (3 argumen) dipertahankan untuk kompatibilitas: memakai aturan tahun terbaru
create or replace function public.fn_unit(p_kro text, p_komp text, p_sub text)
 returns table(kategori text, unit text)
 language sql stable security definer set search_path to 'public'
as $function$
  select * from public.fn_unit(p_kro, p_komp, p_sub, (select max(tahun) from public.ref_unit));
$function$;

-- ---------- 4. Unggah realisasi: pakai pemetaan tahun posisinya ----------
create or replace function public.simpan_realisasi(p_periode date, p_label text, p_nama_file text, p_cek_pagu bigint, p_cek_realisasi bigint, p_rows jsonb)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_email text := coalesce((select email from public.pengguna where id = auth.uid()), '');
  v_jumlah int; v_pagu bigint; v_lock bigint; v_real bigint; v_sisa bigint; v_tanpa_sumber int;
  v_tahun int; v_th_sumber int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya super admin yang boleh mengunggah data.'; end if;
  if p_periode is null then raise exception 'Tanggal posisi data wajib diisi.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Tidak ada baris data yang dikirim.';
  end if;
  v_tahun := extract(year from p_periode)::int;
  v_th_sumber := public.fn_tahun_pemetaan_sumber(v_tahun);

  insert into public.periode as p (periode, label, nama_file, diunggah_pada, diunggah_oleh, cek_pagu, cek_realisasi)
  values (p_periode, coalesce(p_label,''), coalesce(p_nama_file,''), now(), v_email, coalesce(p_cek_pagu,0), coalesce(p_cek_realisasi,0))
  on conflict (periode) do update
    set label = excluded.label, nama_file = excluded.nama_file, diunggah_pada = now(),
        diunggah_oleh = excluded.diunggah_oleh, cek_pagu = excluded.cek_pagu, cek_realisasi = excluded.cek_realisasi;

  delete from public.realisasi where periode = p_periode;

  insert into public.realisasi (periode, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                                sub, sub_n, akun, akun_n, sumber, kategori, unit, no_item, uraian,
                                pagu, lock_pagu, lalu, ini, sd, sisa)
  select p_periode,
         d.prog, d.prog_n, d.keg, d.keg_n, d.kro, d.kro_n, d.ro, d.ro_n, lpad(d.komp,3,'0'), d.komp_n,
         d.sub, d.sub_n, d.akun, d.akun_n,
         coalesce(s.sumber, ''), u.kategori, u.unit, d.no_item, d.uraian,
         d.pagu, d.lock_pagu, d.lalu, d.ini, d.sd, d.sisa
  from jsonb_to_recordset(p_rows) as d(
         prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
         komp text, komp_n text, sub text, sub_n text, akun text, akun_n text,
         no_item text, uraian text, pagu bigint, lock_pagu bigint, lalu bigint, ini bigint, sd bigint, sisa bigint)
  left join public.ref_sumber_dana s
         on s.tahun = v_th_sumber
        and s.kunci = d.prog || '|' || d.kro || '|' || d.ro || '|' || d.sub || '|' || d.akun
  cross join lateral public.fn_unit(d.kro, d.komp, d.sub, v_tahun) u;

  select count(*), coalesce(sum(pagu),0), coalesce(sum(lock_pagu),0), coalesce(sum(sd),0), coalesce(sum(sisa),0),
         count(*) filter (where sumber = '')
    into v_jumlah, v_pagu, v_lock, v_real, v_sisa, v_tanpa_sumber
    from public.realisasi where periode = p_periode;

  update public.periode
     set jumlah_detail = v_jumlah, pagu = v_pagu, lock_pagu = v_lock, realisasi = v_real, sisa = v_sisa
   where periode = p_periode;

  return jsonb_build_object('periode', p_periode, 'jumlah', v_jumlah, 'pagu', v_pagu,
                            'realisasi', v_real, 'sisa', v_sisa, 'tanpa_sumber', v_tanpa_sumber,
                            'tahun_sumber', v_th_sumber, 'tahun_unit', public.fn_tahun_pemetaan_unit(v_tahun));
end;
$function$;

-- ---------- 5. Unggah RKK: hanya mengganti pemetaan tahun yang diunggah ----------
drop function if exists public.simpan_rkk(jsonb);
create or replace function public.simpan_rkk(p_rows jsonb, p_tahun int default null)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_jumlah int; v_tahun int := coalesce(p_tahun, extract(year from current_date)::int);
begin
  if not public.fn_superadmin() then raise exception 'Hanya super admin yang boleh mengunggah RKK.'; end if;
  if v_tahun < 2000 or v_tahun > 2100 then raise exception 'Tahun anggaran tidak valid: %', v_tahun; end if;
  delete from public.ref_sumber_dana where tahun = v_tahun;
  insert into public.ref_sumber_dana (tahun, kunci, prog, kro, ro, sub, akun, sumber)
  select v_tahun, d.kunci, d.prog, d.kro, d.ro, d.sub, d.akun, d.sumber
  from jsonb_to_recordset(p_rows) as d(kunci text, prog text, kro text, ro text, sub text, akun text, sumber text)
  on conflict (tahun, kunci) do update set sumber = excluded.sumber;
  select count(*) into v_jumlah from public.ref_sumber_dana where tahun = v_tahun;
  return jsonb_build_object('jumlah', v_jumlah, 'tahun', v_tahun);
end;
$function$;

-- ---------- 6. Terapkan ulang: tiap baris memakai pemetaan tahun posisinya ----------
create or replace function public.terapkan_ulang_pemetaan(p_periode date default null::date)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_n int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya super admin yang boleh menerapkan ulang pemetaan.'; end if;
  update public.realisasi r
     set kategori = x.kategori,
         unit     = x.unit,
         sumber   = coalesce(x.sumber, r.sumber)
    from (
      select r2.id, u.kategori, u.unit, s.sumber
        from public.realisasi r2
        cross join lateral public.fn_unit(r2.kro, r2.komp, r2.sub, extract(year from r2.periode)::int) u
        left join public.ref_sumber_dana s
               on s.tahun = public.fn_tahun_pemetaan_sumber(extract(year from r2.periode)::int)
              and s.kunci = r2.prog || '|' || r2.kro || '|' || r2.ro || '|' || r2.sub || '|' || r2.akun
       where p_periode is null or r2.periode = p_periode
    ) x
   where x.id = r.id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('baris', v_n);
end;
$function$;

-- ---------- 7. Salin aturan unit kerja ke tahun anggaran baru ----------
create or replace function public.salin_aturan_unit(p_dari int, p_ke int)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_n int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya super admin yang boleh menyalin aturan unit kerja.'; end if;
  if p_ke < 2000 or p_ke > 2100 or p_dari = p_ke then raise exception 'Tahun tujuan tidak valid.'; end if;
  if exists (select 1 from public.ref_unit where tahun = p_ke) then
    raise exception 'Aturan unit kerja tahun % sudah ada.', p_ke;
  end if;
  insert into public.ref_unit (tahun, kro, komponen, jenis_aturan, kode, kategori, unit, keterangan)
  select p_ke, kro, komponen, jenis_aturan, kode, kategori, unit, keterangan
    from public.ref_unit where tahun = p_dari order by id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Tidak ada aturan unit kerja di tahun %.', p_dari; end if;
  return jsonb_build_object('baris', v_n, 'dari', p_dari, 'ke', p_ke);
end;
$function$;

-- hak eksekusi sama seperti fungsi lain (pengecekan super admin ada di dalam fungsi)
revoke all on function public.simpan_rkk(jsonb, int) from anon;
revoke all on function public.salin_aturan_unit(int, int) from anon;
grant execute on function public.fn_tahun_pemetaan_unit(int), public.fn_tahun_pemetaan_sumber(int),
  public.fn_unit(text, text, text, int), public.simpan_rkk(jsonb, int), public.salin_aturan_unit(int, int)
  to authenticated, service_role;
