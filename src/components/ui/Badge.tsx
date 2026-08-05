import { cn } from "@/lib/utils";
export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "wine" | "info"; className?: string }) {
  const tones = {
    neutral: "bg-black/5 text-black/65", success: "bg-emerald-100 text-emerald-800", warning: "bg-amber-100 text-amber-800", danger: "bg-red-100 text-red-800", wine: "bg-basso-wine/10 text-basso-wine", info: "bg-blue-100 text-blue-800"
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold", tones[tone], className)}>{children}</span>;
}
