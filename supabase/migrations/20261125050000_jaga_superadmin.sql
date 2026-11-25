-- =====================================================================
-- Pengaman akun Super admin: dari aplikasi (pengguna login), Super admin tidak dapat
-- dinonaktifkan, diturunkan perannya, atau dihapus, dan peran Super admin tidak dapat
-- diberikan ke akun lain. Pemulihan/pergantian lewat SQL (tanpa sesi pengguna) tetap bisa.
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================
create or replace function public.fn_jaga_superadmin() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- SQL Editor / service_role: pemulihan
  if tg_op = 'DELETE' then
    if old.peran = 'SUPERADMIN' then raise exception 'Akun Super admin tidak dapat dihapus.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.peran = 'SUPERADMIN' and (new.peran <> 'SUPERADMIN' or not new.aktif) then
    raise exception 'Akun Super admin tidak dapat dinonaktifkan atau diturunkan perannya.';
  end if;
  if new.peran = 'SUPERADMIN' and (tg_op = 'INSERT' or old.peran <> 'SUPERADMIN') then
    raise exception 'Peran Super admin tidak dapat diberikan ke akun lain.';
  end if;
  return new;
end $$;
revoke all on function public.fn_jaga_superadmin() from public, anon, authenticated;
drop trigger if exists pengguna_jaga_superadmin on public.pengguna;
create trigger pengguna_jaga_superadmin before insert or update or delete on public.pengguna
  for each row execute function public.fn_jaga_superadmin();
