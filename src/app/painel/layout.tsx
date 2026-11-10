import { AdminShell } from "@/components/internal/AdminShell";
import { PrintHost } from "@/components/print/PrintHost";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}<PrintHost /></AdminShell>;
}
