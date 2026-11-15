-- =====================================================================
-- Monev Anggaran — tahap 1: simpan RKK (Rincian Kertas Kerja Satker) utuh per versi
--
-- Setiap unggahan RKK = satu versi (tanggal posisi) per tahun anggaran, berisi seluruh
-- item detail: hierarki Program → … → Akun → judul (>, >>) → item, volume, satuan,
-- harga satuan, jumlah, sumber dana, tanda blokir (*), serta unit kerja hasil pemetaan.
-- Hak baca sama dengan tabel realisasi (fn_boleh per unit), tulis khusus Admin perencanaan.
--
-- Juga: pesan galat "super admin" di fungsi database diganti "Admin perencanaan".
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Tabel ----------
create table if not exists public.anggaran_versi (
  id            bigint generated always as identity primary key,
  tahun         int    not null check (tahun between 2000 and 2100),
  posisi        date   not null unique,                 -- tanggal posisi RKK (unggah ulang tanggal sama = ganti)
  nama_file     text   not null default '',
  diunggah_pada timestamptz not null default now(),
  diunggah_oleh text   not null default '',
  jumlah_item   int    not null default 0,
  pagu          bigint not null default 0,              -- total jumlah item (pagu DIPA termasuk blokir)
  item_blokir   int    not null default 0,              -- banyaknya item bertanda *
  pagu_item_blokir bigint not null default 0            -- jumlah pagu item bertanda * (bukan nilai blokirnya)
);
create index if not exists anggaran_versi_tahun_idx on public.anggaran_versi (tahun, posisi);

create table if not exists public.anggaran (
  id        bigint generated always as identity primary key,
  versi_id  bigint not null references public.anggaran_versi(id) on delete cascade,
  urutan    int    not null,                            -- urutan baris seperti di RKK SAKTI
  prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
  komp text, komp_n text, sub text, sub_n text, akun text, akun_n text,
  sumber    text   not null default '',
  kategori  text, unit text,
  judul     text   not null default '',                 -- judul kelompok "> …"
  judul2    text   not null default '',                 -- sub judul ">> …"
  uraian    text   not null,
  volume    numeric,
  satuan    text   not null default '',
  harga     numeric,
  jumlah    bigint not null default 0,
  blokir    boolean not null default false              -- bertanda * di RKK
);
create index if not exists anggaran_versi_idx on public.anggaran (versi_id, urutan);
create index if not exists anggaran_unit_idx  on public.anggaran (versi_id, kategori, unit);

-- ---------- 2. RLS: baca sesuai cakupan unit (sama dengan realisasi), tulis khusus Admin perencanaan ----------
alter table public.anggaran_versi enable row level security;
alter table public.anggaran       enable row level security;

drop policy if exists anggaran_versi_lihat  on public.anggaran_versi;
drop policy if exists anggaran_versi_kelola on public.anggaran_versi;
create policy anggaran_versi_lihat  on public.anggaran_versi for select to authenticated using (public.fn_peran() <> '');
create policy anggaran_versi_kelola on public.anggaran_versi for all    to authenticated using (public.fn_superadmin()) with check (public.fn_superadmin());

drop policy if exists anggaran_lihat  on public.anggaran;
drop policy if exists anggaran_kelola on public.anggaran;
create policy anggaran_lihat  on public.anggaran for select to authenticated using (public.fn_boleh(kategori, unit));
create policy anggaran_kelola on public.anggaran for all    to authenticated using (public.fn_superadmin()) with check (public.fn_superadmin());

revoke all on public.anggaran_versi, public.anggaran from anon;
grant select on public.anggaran_versi, public.anggaran to authenticated;

-- ---------- 3. Simpan RKK lengkap (sekaligus memperbarui pemetaan sumber dana tahun itu) ----------
create or replace function public.simpan_rkk_lengkap(p_tahun int, p_posisi date, p_nama_file text, p_rows jsonb)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_email text := coalesce((select email from public.pengguna where id = auth.uid()), '');
  v_id bigint; v_item int; v_pagu bigint; v_bintang int; v_pagu_bintang bigint; v_akun int;
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang boleh mengunggah RKK.'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > 2100 then raise exception 'Tahun anggaran tidak valid: %', p_tahun; end if;
  if p_posisi is null then raise exception 'Tanggal posisi RKK wajib diisi.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Tidak ada item RKK yang dikirim.'; end if;

  insert into public.anggaran_versi as v (tahun, posisi, nama_file, diunggah_oleh)
  values (p_tahun, p_posisi, coalesce(p_nama_file, ''), v_email)
  on conflict (posisi) do update
    set tahun = excluded.tahun, nama_file = excluded.nama_file, diunggah_pada = now(), diunggah_oleh = excluded.diunggah_oleh
  returning id into v_id;

  delete from public.anggaran where versi_id = v_id;

  insert into public.anggaran (versi_id, urutan, prog, prog_n, keg, keg_n, kro, kro_n, ro, ro_n, komp, komp_n,
                               sub, sub_n, akun, akun_n, sumber, kategori, unit, judul, judul2, uraian,
                               volume, satuan, harga, jumlah, blokir)
  select v_id, d.urutan, d.prog, d.prog_n, d.keg, d.keg_n, d.kro, d.kro_n, d.ro, d.ro_n, lpad(d.komp, 3, '0'), d.komp_n,
         d.sub, d.sub_n, d.akun, d.akun_n, coalesce(d.sumber, ''), u.kategori, u.unit,
         coalesce(d.judul, ''), coalesce(d.judul2, ''), d.uraian, d.volume, coalesce(d.satuan, ''), d.harga,
         coalesce(d.jumlah, 0), coalesce(d.blokir, false)
  from jsonb_to_recordset(p_rows) as d(
         urutan int, prog text, prog_n text, keg text, keg_n text, kro text, kro_n text, ro text, ro_n text,
         komp text, komp_n text, sub text, sub_n text, akun text, akun_n text, sumber text,
         judul text, judul2 text, uraian text, volume numeric, satuan text, harga numeric, jumlah bigint, blokir boolean)
  cross join lateral public.fn_unit(d.kro, d.komp, d.sub, p_tahun) u;

  select count(*), coalesce(sum(jumlah), 0), count(*) filter (where blokir), coalesce(sum(jumlah) filter (where blokir), 0)
    into v_item, v_pagu, v_bintang, v_pagu_bintang
    from public.anggaran where versi_id = v_id;
  update public.anggaran_versi
     set jumlah_item = v_item, pagu = v_pagu, item_blokir = v_bintang, pagu_item_blokir = v_pagu_bintang
   where id = v_id;

  -- pemetaan sumber dana tahun itu diperbarui dari RKK yang sama (menggantikan simpan_rkk)
  delete from public.ref_sumber_dana where tahun = p_tahun;
  insert into public.ref_sumber_dana (tahun, kunci, prog, kro, ro, sub, akun, sumber)
  select distinct on (k) p_tahun, k, prog, kro, ro, sub, akun, sumber
    from (select prog || '|' || kro || '|' || ro || '|' || sub || '|' || akun as k, prog, kro, ro, sub, akun, sumber
            from public.anggaran where versi_id = v_id and sumber <> '') x
   order by k;
  get diagnostics v_akun = row_count;

  return jsonb_build_object('versi', v_id, 'tahun', p_tahun, 'posisi', p_posisi, 'jumlah_item', v_item, 'pagu', v_pagu,
                            'item_blokir', v_bintang, 'pagu_item_blokir', v_pagu_bintang, 'akun_sumber', v_akun);
end;
$function$;

-- hapus satu versi RKK (pemetaan sumber dana tidak ikut dihapus)
create or replace function public.hapus_rkk(p_posisi date)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang boleh menghapus RKK.'; end if;
  delete from public.anggaran_versi where posisi = p_posisi;
  return jsonb_build_object('posisi', p_posisi, 'status', 'dihapus');
end;
$function$;

revoke all on function public.simpan_rkk_lengkap(int, date, text, jsonb) from anon;
revoke all on function public.hapus_rkk(date) from anon;
grant execute on function public.simpan_rkk_lengkap(int, date, text, jsonb), public.hapus_rkk(date) to authenticated, service_role;

-- ---------- 4. Pesan galat: "super admin" → "Admin perencanaan" ----------
-- definisi fungsi dibuat ulang apa adanya, hanya teks pesannya yang diganti (hak eksekusi tetap)
do $$
declare r record; d text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ilike '%super admin%'
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'Hanya super admin', 'Hanya Admin perencanaan');
    d := replace(d, 'super admin', 'Admin perencanaan');
    execute d;
  end loop;
end $$;
