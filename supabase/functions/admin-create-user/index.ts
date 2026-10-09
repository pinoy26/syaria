// supabase/functions/admin-create-user/index.ts
// Membuat akun pengguna baru (auth) + menetapkan peran/cakupannya, dipanggil oleh admin dari app.
// Memakai service_role di sisi server saja — tidak pernah dikirim ke klien.
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

    // 1) pastikan pemanggil adalah admin keuangan yang aktif
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who, error: whoErr } = await caller.auth.getUser();
    if (whoErr || !who.user) return json({ error: "Sesi tidak valid, silakan masuk ulang." }, 401);

    const { data: profil, error: profilErr } = await caller
      .from("pengguna").select("peran,aktif").eq("id", who.user.id).maybeSingle();
    if (profilErr) return json({ error: profilErr.message }, 400);
    if (!profil || profil.peran !== "ADMIN" || !profil.aktif) {
      return json({ error: "Hanya admin keuangan yang bisa menambah pengguna." }, 403);
    }

    // 2) validasi input
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const peran = String(body.peran || "UNIT");
    const kategori = String(body.kategori || "");
    const unit = String(body.unit || "");
    const keterangan = String(body.keterangan || "");
    if (!email) return json({ error: "Email wajib diisi." }, 400);
    if (password.length < 8) return json({ error: "Kata sandi minimal 8 karakter." }, 400);
    if (!["ADMIN", "PIMPINAN", "UNIT"].includes(peran)) return json({ error: "Peran tidak dikenal." }, 400);

    // 3) buat akun auth + tetapkan peran/cakupan (pakai service_role, bypass RLS)
    const admin = createClient(url, serviceKey);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);

    // simpan_pengguna memverifikasi sendiri pemanggilnya lewat auth.uid() —
    // panggil pakai identitas admin yang login (caller), bukan service_role
    const cakupan = peran === "UNIT" ? [{ kategori, unit: unit || "" }] : [];
    const { error: rpcErr } = await caller.rpc("simpan_pengguna", {
      p_id: created.user!.id, p_peran: peran, p_aktif: true,
      p_keterangan: keterangan, p_cakupan: cakupan,
    });
    if (rpcErr) {
      await admin.auth.admin.deleteUser(created.user!.id);
      return json({ error: rpcErr.message }, 400);
    }

    return json({ ok: true, pesan: "Pengguna " + email + " berhasil dibuat.", id: created.user!.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
