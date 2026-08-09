export const INITIAL_OPERATIONAL_USERS = [
  {
    email: "adscompedro@gmail.com",
    displayName: "Administrador PedidoPro",
    role: "manager",
    passwordEnv: "INITIAL_PASSWORD_ADSCOMPEDRO",
  },
  {
    email: "gestor@laforneriabasso.com.br",
    displayName: "Gestor",
    role: "manager",
    passwordEnv: "INITIAL_PASSWORD_GESTOR",
  },
  {
    email: "atendente1@laforneriabasso.com.br",
    displayName: "Atendente 1",
    role: "counter",
    passwordEnv: "INITIAL_PASSWORD_ATENDENTE1",
  },
  {
    email: "atendente2@laforneriabasso.com.br",
    displayName: "Atendente 2",
    role: "counter",
    passwordEnv: "INITIAL_PASSWORD_ATENDENTE2",
  },
  {
    email: "atendente3@laforneriabasso.com.br",
    displayName: "Atendente 3",
    role: "counter",
    passwordEnv: "INITIAL_PASSWORD_ATENDENTE3",
  },
  {
    email: "garcom1@laforneriabasso.com.br",
    displayName: "Garçom 1",
    role: "waiter",
    passwordEnv: "INITIAL_PASSWORD_GARCOM1",
  },
  {
    email: "garcom2@laforneriabasso.com.br",
    displayName: "Garçom 2",
    role: "waiter",
    passwordEnv: "INITIAL_PASSWORD_GARCOM2",
  },
  {
    email: "garcom3@laforneriabasso.com.br",
    displayName: "Garçom 3",
    role: "waiter",
    passwordEnv: "INITIAL_PASSWORD_GARCOM3",
  },
] as const;

export type InitialOperationalUser = (typeof INITIAL_OPERATIONAL_USERS)[number];

export function findInitialOperationalUser(email: string) {
  const normalized = email.trim().toLowerCase();
  return INITIAL_OPERATIONAL_USERS.find((account) => account.email.toLowerCase() === normalized);
}
