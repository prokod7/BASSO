import { Loader2 } from "lucide-react";
export default function PanelLoading(){return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-basso-wine" size={30}/><p className="mt-3 text-sm font-semibold text-black/45">Sincronizando dados operacionais…</p></div></div>}
