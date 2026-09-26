/* config.js — isi dengan data project Supabase Anda.
   Supabase → Project Settings → API:
     Project URL        → url
     anon / public key  → anonKey   (kunci publik; aman berada di repo selama RLS aktif)
   JANGAN pernah menaruh service_role key di berkas ini. */
window.SB_CONFIG = {
  url: 'GANTI_DENGAN_PROJECT_URL',      // contoh: https://abcdefgh.supabase.co
  anonKey: 'GANTI_DENGAN_ANON_KEY'
};
