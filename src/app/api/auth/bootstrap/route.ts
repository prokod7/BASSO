import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findInitialOperationalUser } from "@/lib/initial-users";

export const dynamic = "force-dynamic";

async function findAuthUserByEmail(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (found || data.users.length < 100) return found;
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      return NextResponse.json(
        { error: "O primeiro acesso automático não é necessário no modo demonstração." },
        { status: 400 },
      );
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        { error: "Supabase administrativo não configurado. Verifique SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { email?: string; password?: string }
      | null;

    const email = body?.email?.trim().toLowerCase() || "";
    const password = body?.password || "";
    const account = findInitialOperationalUser(email);

    if (!account || !password) {
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const configuredPassword = process.env[account.passwordEnv];
    if (!configuredPassword) {
      return NextResponse.json(
        {
          error: `A senha inicial desta conta ainda não foi configurada na Vercel (${account.passwordEnv}).`,
          code: "INITIAL_PASSWORD_MISSING",
        },
        { status: 503 },
      );
    }

    if (configuredPassword.length < 10) {
      return NextResponse.json(
        {
          error: `${account.passwordEnv} precisa ter pelo menos 10 caracteres.`,
          code: "INITIAL_PASSWORD_WEAK",
        },
        { status: 503 },
      );
    }

    if (password !== configuredPassword) {
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    let authUser = await findAuthUserByEmail(client, account.email);

    if (!authUser) {
      const { data, error } = await client.auth.admin.createUser({
        email: account.email,
        password: configuredPassword,
        email_confirm: true,
        user_metadata: {
          display_name: account.displayName,
          role: account.role,
          must_change_password: true,
        },
      });
      if (error) throw error;
      authUser = data.user;
    } else {
      const { data, error } = await client.auth.admin.updateUserById(authUser.id, {
        password: configuredPassword,
        email_confirm: true,
        user_metadata: {
          ...authUser.user_metadata,
          display_name: account.displayName,
          role: account.role,
          must_change_password: true,
        },
      });
      if (error) throw error;
      authUser = data.user;
    }

    if (!authUser) {
      return NextResponse.json({ error: "Não foi possível preparar o usuário." }, { status: 500 });
    }

    const { error: profileError } = await client.from("profiles").upsert(
      {
        id: authUser.id,
        display_name: account.displayName,
        role: account.role,
        active: true,
        must_change_password: true,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    return NextResponse.json({
      ok: true,
      message: "Acesso preparado com sucesso. Entrando no painel...",
      user: account.email,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao preparar o acesso." },
      { status: 500 },
    );
  }
}
