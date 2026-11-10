// Troca de tela sem tela de carregamento cheia: uma barra fina no topo enquanto a página monta.
export default function PanelLoading() {
  return <div aria-hidden className="fixed inset-x-0 top-0 z-[200] h-0.5 animate-pulse bg-basso-wine/70" />;
}
