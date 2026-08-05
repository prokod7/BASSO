"use client";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
export function Modal({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={cn("max-h-[94vh] w-full overflow-hidden rounded-t-3xl bg-basso-paper shadow-2xl sm:max-w-2xl sm:rounded-3xl", className)}>
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4"><h2 className="font-display text-xl font-bold">{title}</h2><button className="btn-ghost" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>
      <div className="max-h-[calc(94vh-70px)] overflow-y-auto">{children}</div>
    </div>
  </div>, document.body);
}
