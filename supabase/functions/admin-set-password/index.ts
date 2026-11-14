// supabase/functions/admin-set-password/index.ts
// Mengganti kata sandi akun pengguna lain, dipanggil super admin dari halaman Kelola Pengguna.
// Hanya super admin yang boleh memanggil ini — memakai service_role di sisi server saja.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    // 1) pastikan pemanggil adalah super admin yang aktif
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who, error: whoErr } = await caller.auth.getUser();
    if (whoErr || !who.user) return json({ error: "Sesi tidak valid, silakan masuk ulang." }, 401);

    const { data: profil, error: profilErr } = await caller
      .from("pengguna").select("peran,aktif").eq("id", who.user.id).maybeSingle();
    if (profilErr) return json({ error: profilErr.message }, 400);
    if (!profil || profil.peran !== "SUPERADMIN" || !profil.aktif) {
      return json({ error: "Hanya super admin yang bisa mengganti kata sandi pengguna lain." }, 403);
    }

    // 2) validasi input
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const password = String(body.password || "");
    if (!id) return json({ error: "ID pengguna wajib diisi." }, 400);
    if (password.length < 8) return json({ error: "Kata sandi minimal 8 karakter." }, 400);
    if (id === who.user.id) return json({ error: "Untuk akun sendiri, gunakan menu Ubah sandi." }, 400);

    // 3) ganti kata sandi (service_role, bypass RLS)
    const admin = createClient(url, serviceKey);
    const { error: updErr } = await admin.auth.admin.updateUserById(id, { password });
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, pesan: "Kata sandi pengguna berhasil diganti." });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
