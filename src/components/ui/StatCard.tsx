import { cn } from "@/lib/utils";
export function StatCard({ label, value, hint, icon, className }: { label: string; value: string | number; hint?: string; icon?: React.ReactNode; className?: string }) {
  return <div className={cn("surface p-5", className)}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-black/45">{label}</p><p className="mt-2 text-3xl font-black tracking-tight">{value}</p>{hint && <p className="mt-1 text-xs text-black/50">{hint}</p>}</div>{icon && <div className="rounded-2xl bg-basso-cream p-3 text-basso-wine">{icon}</div>}</div></div>;
}
