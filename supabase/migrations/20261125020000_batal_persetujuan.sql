-- =====================================================================
-- Usulan yang sudah disetujui (belum diinput ke SAKTI) dapat dikembalikan untuk diperbaiki.
-- Sebelumnya "kembalikan" hanya untuk status diajukan, sehingga kesalahan yang ditemukan saat
-- input SAKTI hanya dapat diatasi dengan menghapus usulan. Catatan tetap wajib.
-- Skrip idempoten: aman dijalankan ulang.
-- =====================================================================
create or replace function public.proses_usulan(p_id bigint, p_aksi text, p_catatan text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_status text; h jsonb; v_baru text; v_cat text := coalesce(btrim(p_catatan), '');
begin
  if not public.fn_superadmin() then raise exception 'Hanya Admin perencanaan yang dapat memproses usulan revisi.'; end if;
  select status into v_status from public.usulan_revisi where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if p_aksi = 'setujui' then
    if v_status <> 'diajukan' then raise exception 'Hanya usulan berstatus Diajukan yang dapat disetujui.'; end if;
    h := public.periksa_usulan(p_id);
    if jsonb_array_length(h->'tolak') > 0 then raise exception 'Usulan tidak lagi memenuhi aturan: %', (select string_agg(x, ' ') from jsonb_array_elements_text(h->'tolak') x); end if;
    v_baru := 'disetujui';
  elsif p_aksi = 'kembalikan' then
    if v_status not in ('diajukan', 'disetujui') then
      raise exception 'Hanya usulan berstatus Diajukan atau Disetujui (belum diinput ke SAKTI) yang dapat dikembalikan.';
    end if;
    if length(v_cat) < 3 then raise exception 'Catatan perbaikan wajib diisi saat mengembalikan usulan.'; end if;
    if v_status = 'disetujui' then v_cat := 'Persetujuan dibatalkan — ' || v_cat; end if;
    v_baru := 'dikembalikan';
  else
    raise exception 'Aksi tidak dikenal. Usulan hanya dapat disetujui atau dikembalikan.';
  end if;
  update public.usulan_revisi set status = v_baru, diubah_pada = now(), hasil_periksa = coalesce(h, hasil_periksa) where id = p_id;
  perform public.fn_log_usulan(p_id, v_baru, v_cat);
  return jsonb_build_object('id', p_id, 'status', v_baru);
end;
$function$;
