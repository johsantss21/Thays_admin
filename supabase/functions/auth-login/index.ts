import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { login, senha } = body;

    if (!login || !senha) {
      return new Response(
        JSON.stringify({ error: "Campos 'login' e 'senha' são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loginStr = String(login).trim();
    const senhaStr = String(senha);

    // Determine if login is email or username
    const isEmail = loginStr.includes("@");
    let emailToUse = loginStr;

    if (!isEmail) {
      // Look up by username first, then fallback to name
      let { data: appUser, error: lookupError } = await adminClient
        .from("app_users")
        .select("email, status, tentativas_login")
        .eq("username", loginStr)
        .maybeSingle();

      // Fallback: search by name (case-insensitive)
      if (!appUser) {
        const { data: byName } = await adminClient
          .from("app_users")
          .select("email, status, tentativas_login")
          .ilike("name", loginStr)
          .maybeSingle();
        appUser = byName;
        lookupError = null;
      }

      if (lookupError || !appUser) {
        return new Response(
          JSON.stringify({ error: "Usuário não encontrado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (appUser.status === "suspenso") {
        return new Response(
          JSON.stringify({ error: "Usuário suspenso. Entre em contato com o administrador." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check brute force (max 5 attempts)
      if ((appUser.tentativas_login || 0) >= 5) {
        return new Response(
          JSON.stringify({ error: "Conta bloqueada por excesso de tentativas. Contate o administrador." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      emailToUse = appUser.email;
    }

    // Check if Supabase Auth user exists for this email
    const { data: { users: existingAuthUsers } } = await adminClient.auth.admin.listUsers();
    const authUserExists = existingAuthUsers?.some((u: any) => u.email === emailToUse);

    // If user exists in app_users but not in Supabase Auth (legacy/broken creation),
    // create the auth account now using the password they're providing
    if (!authUserExists && !isEmail) {
      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email: emailToUse,
        password: senhaStr,
        email_confirm: true,
      });

      if (createError) {
        console.error("Failed to create auth user:", createError);
      } else if (createdUser?.user) {
        // Update app_users with the real user_id
        await adminClient
          .from("app_users")
          .update({ user_id: createdUser.user.id, tentativas_login: 0 })
          .eq("email", emailToUse);
      }
    }

    // Authenticate using Supabase Auth (handles bcrypt internally)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: emailToUse,
      password: senhaStr,
    });

    if (authError || !authData.session) {
      // Increment failed attempts
      if (!isEmail) {
        const { data: current } = await adminClient
          .from("app_users")
          .select("tentativas_login, email")
          .ilike("name", loginStr)
          .maybeSingle();

        if (current) {
          await adminClient
            .from("app_users")
            .update({ tentativas_login: (current.tentativas_login || 0) + 1 })
            .eq("email", current.email);
        } else {
          // Try by username
          const { data: byUsername } = await adminClient
            .from("app_users")
            .select("tentativas_login, email")
            .eq("username", loginStr)
            .maybeSingle();

          if (byUsername) {
            await adminClient
              .from("app_users")
              .update({ tentativas_login: (byUsername.tentativas_login || 0) + 1 })
              .eq("email", byUsername.email);
          }
        }
      }

      return new Response(
        JSON.stringify({ error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Reset failed attempts and update last login
    await adminClient
      .from("app_users")
      .update({ tentativas_login: 0, last_login_at: new Date().toISOString() })
      .eq("user_id", userId);

    // Fetch full app_user profile with role
    const { data: appUserFull } = await adminClient
      .from("app_users")
      .select("*, roles(name, description)")
      .eq("user_id", userId)
      .maybeSingle();

    // Fetch user_roles (admin/moderator/user)
    const { data: userRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (userRoles || []).map((r: any) => r.role);
    const nivelAcesso = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "user";

    // Log successful login in system_audit_logs
    await adminClient.from("system_audit_logs").insert({
      event_type: "USER_LOGIN",
      entity_type: "user",
      entity_id: userId,
      status: "success",
      payload_json: {
        method: isEmail ? "email" : "username",
        login: loginStr,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
        user: {
          id: userId,
          email: authData.user.email,
          nome: appUserFull?.name || authData.user.email,
          username: appUserFull?.username || null,
          nivel_acesso: nivelAcesso,
          roles,
          role_name: (appUserFull?.roles as any)?.name || null,
          status: appUserFull?.status || "ativo",
          permissoes: appUserFull ? {
            cargo: appUserFull.cargo,
            departamento: appUserFull.departamento,
            tipo_vinculo: appUserFull.tipo_vinculo,
          } : {},
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno de autenticação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
