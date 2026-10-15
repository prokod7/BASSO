import type { AuthContext, OperationalRole } from "@/lib/authz";
export function canAccessOperation(auth: AuthContext, roles: OperationalRole[], permission: string) {
  return roles.includes(auth.role) && (auth.role === "manager" || auth.permissions[permission] !== false);
}
export function snapshotAccess(auth: AuthContext) {
  return {
    cash: canAccessOperation(auth, ["manager", "counter", "finance"], "cash.manage"),
    finance: canAccessOperation(auth, ["manager", "finance"], "finance.view"),
    audit: canAccessOperation(auth, ["manager", "viewer"], "audit.view"),
    campaigns: canAccessOperation(auth, ["manager"], "customers.manage"),
    inventory: canAccessOperation(auth, ["manager", "counter", "finance", "viewer"], "inventory.view"),
    coupons: canAccessOperation(auth, ["manager", "counter", "finance", "viewer"], "menu.manage"),
    integrations: canAccessOperation(auth, ["manager"], "settings.manage"),
  };
}
