"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={cn(
          "flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-basso-paper shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-3xl",
          className,
        )}
      >
        <div className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between border-b border-black/5 bg-basso-paper/95 px-4 pb-2 pt-[calc(.5rem+env(safe-area-inset-top))] backdrop-blur-xl sm:min-h-16 sm:px-5 sm:py-4">
          <h2 className="min-w-0 truncate pr-3 font-display text-lg font-bold sm:text-xl">{title}</h2>
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/5 text-black/70 transition active:scale-95"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={21} />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
