import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration error" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const challengeId = crypto.randomUUID();
  const approvalVerifier = randomToken();
  const pollVerifier = randomToken();
  const displayCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const { error } = await admin.from("qr_login_challenges").insert({
    id: challengeId,
    approval_verifier_hash: await sha256(approvalVerifier),
    poll_verifier_hash: await sha256(pollVerifier),
    display_code: displayCode,
    expires_at: expiresAt,
    status: "pending",
  });
  if (error) return json({ error: "Could not create QR challenge" }, 500);

  const siteUrl = Deno.env.get("SITE_URL") || "https://vampirecr.github.io/the-bookapple/";
  const approvalUrl = `${siteUrl.replace(/\/$/, "")}/#qr=${encodeURIComponent(challengeId)}&v=${encodeURIComponent(approvalVerifier)}&c=${displayCode}`;
  try {
    const qrSvg = await QRCode.toString(approvalUrl, { type: "svg", width: 240, margin: 2 });
    return json({
      challenge_id: challengeId,
      poll_verifier: pollVerifier,
      display_code: displayCode,
      qr_svg: qrSvg,
      expires_at: expiresAt,
    });
  } catch {
    await admin.from("qr_login_challenges").delete().eq("id", challengeId);
    return json({ error: "Could not render QR code" }, 500);
  }
});
