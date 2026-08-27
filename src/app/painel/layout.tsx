import { AdminShell } from "@/components/internal/AdminShell";
import { BrowserPrintMode } from "@/components/internal/BrowserPrintMode";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell><BrowserPrintMode />{children}</AdminShell>;
}
