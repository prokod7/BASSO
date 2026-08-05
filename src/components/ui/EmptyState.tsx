import { PackageOpen } from "lucide-react";
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="surface flex min-h-56 flex-col items-center justify-center p-8 text-center"><div className="mb-4 rounded-2xl bg-basso-cream p-4 text-basso-wine"><PackageOpen/></div><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-2 max-w-md text-sm text-black/55">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
