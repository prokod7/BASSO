/* eslint-disable @next/next/no-img-element */
import { VENDRA_SIGNATURE_COLORS, VENDRA_SIGNATURE_PATHS, VENDRA_SIGNATURE_VIEWBOX, VENDRA_URL, type VendraVariante } from "@/lib/vendra";

function MaybeLink({ href, label, className, children }: { href: string | null; label: string; className?: string; children: React.ReactNode }) {
  if (!href) return <span className={className}>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={className}>{children}</a>;
}

/** "Desenvolvido por Vendra" (arte oficial). Clicável quando houver site configurado. */
export function VendraAssinatura({ variante = "claro", altura = 16, link = true, className }: { variante?: VendraVariante; altura?: number; link?: boolean; className?: string }) {
  const cores = VENDRA_SIGNATURE_COLORS[variante];
  const svg = <svg viewBox={VENDRA_SIGNATURE_VIEWBOX} height={altura} role="img" aria-label="Desenvolvido por Vendra" className="block w-auto">
    {VENDRA_SIGNATURE_PATHS.map((p) => <path key={p.part} fill={cores[p.part]} d={p.d} />)}
  </svg>;
  return <MaybeLink href={link ? VENDRA_URL : null} label="Desenvolvido por Vendra" className={`inline-flex opacity-80 transition hover:opacity-100 ${className ?? ""}`}>{svg}</MaybeLink>;
}

/** Logo da Vendra para o menu escuro: completa ou só o símbolo (menu recolhido). */
export function VendraMarcaMenu({ recolhido }: { recolhido: boolean }) {
  return <MaybeLink href={VENDRA_URL} label="Desenvolvido por Vendra" className="flex justify-center opacity-50 transition hover:opacity-90">
    {recolhido
      ? <img src="/assets/vendra/vendra-simbolo-fundo-escuro.svg" alt="Vendra" className="h-5 w-auto" />
      : <img src="/assets/vendra/vendra-logo-horizontal-fundo-escuro.svg" alt="Vendra" className="h-5 w-auto" />}
  </MaybeLink>;
}
