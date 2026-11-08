/** Texto de WhatsApp com *negrito* e _itálico_ renderizados como no celular. */
export function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        /^\*[^*\n]+\*$/.test(part) ? <strong key={index}>{part.slice(1, -1)}</strong>
          : /^_[^_\n]+_$/.test(part) ? <em key={index}>{part.slice(1, -1)}</em>
            : part,
      )}
    </p>
  );
}
