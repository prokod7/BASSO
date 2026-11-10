import type { LucideIcon } from "lucide-react";
export function PageHeader({ title, description, icon: Icon, actions }: { title: string; description: string; icon?: LucideIcon; actions?: React.ReactNode }) {
  return <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-3">{Icon && <span className="grid h-11 w-11 place-items-center rounded-2xl bg-basso-wine text-white"><Icon size={22}/></span>}<h1 className="page-title">{title}</h1></div><p className="mt-2 hidden max-w-3xl text-sm sm:block leading-relaxed text-black/50">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}
