-- =====================================================================
-- Pencocokan detail RKK ↔ FA Detail: dua penyempurnaan (temuan 2026-11-25, selisih Rp 33.933.000 di 5 detail)
--  1. fn_norm juga membuang kurung siku yang TIDAK TERTUTUP sampai akhir uraian
--     (uraian RKK terpotong, mis. "Biaya Snack [40 ORG x 2 HARI x 3 PRODI x 2 KALI" tanpa "]").
--  2. blokir_item tahap 3: sisa yang belum berpasangan dipasangkan bila pagunya sama dan nama yang satu
--     adalah awal nama yang lain (uraian FA terpotong, mis. "... Administrasi Belanja" vs "... Belanja Pegawai").
-- fn_norm dipakai juga oleh kunci blokir manual (tabel masih kosong saat migrasi ini) dan aturan nama item berblokir.
-- =====================================================================
create or replace function public.fn_norm(t text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''), '\[[^\]]*\]', '', 'g'), '\[[^\]]*$', ''), '\s+', ' ', 'g')));
$$;

create or replace function public.blokir_item(p_versi_id bigint)
returns table (anggaran_id bigint, blokir bigint, dari_rkk boolean, manual boolean, realisasi bigint)
language sql stable security definer set search_path to 'public' as $$
  with v as (select tahun from public.anggaran_versi where id = p_versi_id),
  per as (select max(p.periode) p from public.periode p, v where extract(year from p.periode)::int = v.tahun),
  a as (select x.id, x.urutan, x.prog, x.kro, x.ro, x.sub, x.akun, x.judul, x.judul2, x.uraian, x.jumlah, x.blokir, public.fn_norm(x.uraian) nu,
               row_number() over (partition by x.prog, x.kro, x.ro, x.sub, x.akun, public.fn_norm(x.judul), public.fn_norm(x.judul2), public.fn_norm(x.uraian) order by x.urutan) occ2
          from public.anggaran x where x.versi_id = p_versi_id),
  f0 as (select r.id fid, r.no_item, r.prog, r.kro, r.ro, r.sub, r.akun, public.fn_norm(r.uraian) nu, r.pagu, r.sd
           from public.realisasi r, per where r.periode = per.p),
  -- tahap 1: uraian sama & pagu sama (hanya detail tanpa tanda *)
  a1 as (select a.id, a.prog, a.kro, a.ro, a.sub, a.akun, a.nu, a.jumlah,
                row_number() over (partition by a.prog, a.kro, a.ro, a.sub, a.akun, a.nu, a.jumlah order by a.urutan) o
           from a where not a.blokir),
  f1 as (select f0.fid, f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.nu, f0.pagu,
                row_number() over (partition by f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.nu, f0.pagu order by f0.no_item) o from f0),
  p1 as (select a1.id, f1.fid from a1 join f1 on f1.prog = a1.prog and f1.kro = a1.kro and f1.ro = a1.ro and f1.sub = a1.sub
                                              and f1.akun = a1.akun and f1.nu = a1.nu and f1.pagu = a1.jumlah and f1.o = a1.o),
  -- tahap 2: sisanya menurut urutan
  a2 as (select a.id, a.prog, a.kro, a.ro, a.sub, a.akun, a.nu,
                row_number() over (partition by a.prog, a.kro, a.ro, a.sub, a.akun, a.nu order by a.urutan) o
           from a where not exists (select 1 from p1 where p1.id = a.id)),
  f2 as (select f0.fid, f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.nu,
                row_number() over (partition by f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.nu order by f0.no_item) o
           from f0 where not exists (select 1 from p1 where p1.fid = f0.fid)),
  p2 as (select a2.id, f2.fid from a2 join f2 on f2.prog = a2.prog and f2.kro = a2.kro and f2.ro = a2.ro and f2.sub = a2.sub
                                               and f2.akun = a2.akun and f2.nu = a2.nu and f2.o = a2.o),
  -- tahap 3: sisa yang uraiannya terpotong di salah satu file (nama yang satu = awal nama yang lain, min. 10 huruf)
  --          dan pagunya sama (hanya detail tanpa tanda *)
  a3 as (select a.id, a.prog, a.kro, a.ro, a.sub, a.akun, a.nu, a.jumlah,
                row_number() over (partition by a.prog, a.kro, a.ro, a.sub, a.akun, a.jumlah order by a.urutan) o
           from a where not a.blokir and not exists (select 1 from p1 where p1.id = a.id) and not exists (select 1 from p2 where p2.id = a.id)),
  f3 as (select f0.fid, f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.nu, f0.pagu,
                row_number() over (partition by f0.prog, f0.kro, f0.ro, f0.sub, f0.akun, f0.pagu order by f0.no_item) o
           from f0 where not exists (select 1 from p1 where p1.fid = f0.fid) and not exists (select 1 from p2 where p2.fid = f0.fid)),
  p3 as (select a3.id, f3.fid from a3 join f3 on f3.prog = a3.prog and f3.kro = a3.kro and f3.ro = a3.ro and f3.sub = a3.sub and f3.akun = a3.akun
                                               and f3.pagu = a3.jumlah and f3.o = a3.o
                                               and least(length(a3.nu), length(f3.nu)) >= 10
                                               and (left(a3.nu, length(f3.nu)) = f3.nu or left(f3.nu, length(a3.nu)) = a3.nu)),
  pas as (select id, fid from p1 union all select id, fid from p2 union all select id, fid from p3),
  f as (select pas.id, f0.pagu, f0.sd from pas join f0 on f0.fid = pas.fid),
  ka as (select prog, kro, ro, sub, akun, sum(jumlah) j from a group by 1, 2, 3, 4, 5 having bool_or(blokir)),
  kf as (select prog, kro, ro, sub, akun, sum(pagu) j from f0 group by 1, 2, 3, 4, 5),
  k as (select ka.prog, ka.kro, ka.ro, ka.sub, ka.akun from ka left join kf using (prog, kro, ro, sub, akun) where ka.j > coalesce(kf.j, 0)),
  m as (select b.kunci, b.nilai from public.blokir_manual b, v where b.tahun = v.tahun)
  select a.id,
         (case when a.blokir and k.prog is not null then greatest(0, a.jumlah - coalesce(f.pagu, 0))
               when a.blokir then 0
               else least(coalesce(m.nilai, 0), a.jumlah) end)::bigint,
         a.blokir, (not a.blokir and m.nilai is not null), coalesce(f.sd, 0)::bigint
    from a
    join public.anggaran z on z.id = a.id
    left join f on f.id = a.id
    left join k on k.prog = a.prog and k.kro = a.kro and k.ro = a.ro and k.sub = a.sub and k.akun = a.akun
    left join m on m.kunci = concat_ws('|', a.prog, a.kro, a.ro, a.sub, a.akun, public.fn_norm(a.judul), public.fn_norm(a.judul2), a.nu, a.occ2)
   where public.fn_superadmin() or public.fn_boleh(z.kategori, z.unit);
$$;
