import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.INITIAL_USER_PASSWORD;
if (!url || !serviceRole || !password) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e INITIAL_USER_PASSWORD.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("INITIAL_USER_PASSWORD deve ter pelo menos 12 caracteres.");
  process.exit(1);
}

const client = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [
  { email: "gestor@laforneriabasso.com.br", displayName: "Gestor", role: "manager" },
  { email: "atendente1@laforneriabasso.com.br", displayName: "Atendente 1", role: "counter" },
  { email: "atendente2@laforneriabasso.com.br", displayName: "Atendente 2", role: "counter" },
  { email: "atendente3@laforneriabasso.com.br", displayName: "Atendente 3", role: "counter" },
  { email: "garcom1@laforneriabasso.com.br", displayName: "Garçom 1", role: "waiter" },
  { email: "garcom2@laforneriabasso.com.br", displayName: "Garçom 2", role: "waiter" },
  { email: "garcom3@laforneriabasso.com.br", displayName: "Garçom 3", role: "waiter" }
] as const;

async function findUser(email: string) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found || data.users.length < 100) return found;
    page += 1;
  }
  return undefined;
}

for (const account of users) {
  let authUser = await findUser(account.email);
  if (!authUser) {
    const { data, error } = await client.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: account.displayName, role: account.role }
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`Criado: ${account.email}`);
  } else {
    const { error } = await client.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { display_name: account.displayName, role: account.role }
    });
    if (error) throw error;
    console.log(`Atualizado: ${account.email}`);
  }
  const { error: profileError } = await client.from("profiles").upsert({
    id: authUser.id,
    display_name: account.displayName,
    role: account.role,
    active: true
  }, { onConflict: "id" });
  if (profileError) throw profileError;
}

console.log("Sete contas operacionais sincronizadas. Troque a senha no primeiro acesso.");
