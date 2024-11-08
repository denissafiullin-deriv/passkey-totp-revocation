// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { Database } from '../database.types.ts'

const TOTP_VALIDITY_MINUTES = 10;

const supabase = createClient<Database>(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

interface AuthResponse {
  authorize: {
    user_id: number;
    email: string;
  };
  echo_req: {
    authorize: string;
  };
  msg_type: string;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("not allowed", { status: 400 });
    }

    // Get and verify userId and access token
    let { userId } = await req.json();
    userId = Number(userId);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId must be a number" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization")!;
    const accessToken = authHeader.replace("Bearer ", "");
    const url = "https://green.derivws.com/websockets/authorize?app_id=1";
    const authData = { authorize: accessToken };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(authData),
    });

    const authResponse: AuthResponse = await response.json();
    const authUserId = authResponse.authorize.user_id;
    const authEmail = authResponse.authorize.email;

    if (userId !== authUserId) {
      return new Response(
        JSON.stringify({ error: "provided userId is not verified" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Generate 6-digit TOTP
    const totp = Math.floor(100000 + Math.random() * 900000).toString();

    // Insert new TOTP
    const { data, error } = await supabase
      .from("totp_verification")
      .insert({
        user_id: userId,
        totp_code: totp,
        expires_at: new Date(Date.now() + TOTP_VALIDITY_MINUTES * 60000)
          .toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const RESEND_API_TOKEN: string = Deno.env.get("RESEND_API_TOKEN") ?? "";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_TOKEN}`,
      },
      body: JSON.stringify({
        from: "Tester <onboarding@resend.dev>",
        to: ["denis.safiullin@regentmarkets.com"],
        subject: "Passkeys Revoke Request",
        html: `<strong>${totp}</strong>`,
      }),
    });

    const emailData = await res.json();

    return new Response(
      JSON.stringify({ 
        success: "true",
        email_id: emailData?.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
});
