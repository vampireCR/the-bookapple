import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { challenge_id, poll_verifier } = await request.json().catch(() => ({}));
  if (typeof challenge_id !== "string" || typeof poll_verifier !== "string") {
    return json({ error: "Invalid request" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration error" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: challenge, error } = await admin
    .from("qr_login_challenges")
    .select("id,poll_verifier_hash,status,approved_user_id,expires_at")
    .eq("id", challenge_id)
    .maybeSingle();

  if (error || !challenge || challenge.poll_verifier_hash !== await sha256(poll_verifier)) {
    return json({ status: "invalid" });
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await admin.from("qr_login_challenges").update({ status: "expired" }).eq("id", challenge_id).eq("status", "pending");
    return json({ status: "expired" });
  }
  if (challenge.status === "pending") return json({ status: "pending" });
  if (challenge.status === "consumed") return json({ status: "consumed" });
  if (challenge.status !== "approved" || !challenge.approved_user_id) return json({ status: "invalid" });

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(challenge.approved_user_id);
  if (userError || !userData.user?.email) return json({ status: "invalid" });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) return json({ error: "Could not create one-time login token" }, 500);

  const { data: consumed } = await admin.from("qr_login_challenges")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", challenge_id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();

  if (!consumed) return json({ status: "consumed" });
  return json({ status: "approved", token_hash: tokenHash });
});
