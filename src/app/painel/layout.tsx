import { AdminShell } from "@/components/internal/AdminShell";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
