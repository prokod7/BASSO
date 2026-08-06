import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INITIAL_OPERATIONAL_USERS } from "@/lib/initial-users";

export const dynamic = "force-dynamic";

async function findAuthUserByEmail(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLocaleLowerCase("pt-BR") === email.toLocaleLowerCase("pt-BR"),
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

    const { count, error: managerError } = await client
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "manager")
      .eq("active", true);
    if (managerError) throw managerError;

    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          error: "O administrador inicial já foi criado. Entre com o e-mail e a senha cadastrados.",
          code: "ALREADY_CONFIGURED",
        },
        { status: 409 },
      );
    }

    const configuredPassword = process.env.INITIAL_USER_PASSWORD;
    if (!configuredPassword) {
      return NextResponse.json(
        {
          error:
            "Cadastre INITIAL_USER_PASSWORD na Vercel, faça um redeploy e tente novamente. A senha precisa ter pelo menos 12 caracteres.",
          code: "INITIAL_PASSWORD_MISSING",
        },
        { status: 503 },
      );
    }
    if (configuredPassword.length < 12) {
      return NextResponse.json(
        {
          error: "INITIAL_USER_PASSWORD precisa ter pelo menos 12 caracteres.",
          code: "INITIAL_PASSWORD_WEAK",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as { password?: string } | null;
    if (!body?.password || body.password !== configuredPassword) {
      return NextResponse.json(
        { error: "A senha informada não corresponde à INITIAL_USER_PASSWORD configurada." },
        { status: 401 },
      );
    }

    const synchronized: string[] = [];
    for (const account of INITIAL_OPERATIONAL_USERS) {
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

      const { error: profileError } = await client.from("profiles").upsert(
        {
          id: authUser.id,
          display_name: account.displayName,
          role: account.role,
          active: true,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;
      synchronized.push(account.email);
    }

    return NextResponse.json({
      ok: true,
      message: "Acesso inicial criado com sucesso.",
      users: synchronized,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar o acesso inicial." },
      { status: 500 },
    );
  }
}
