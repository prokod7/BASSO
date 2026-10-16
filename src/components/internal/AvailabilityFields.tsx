"use client";
type Schedule = { days?: number[]; start?: string; end?: string };
export function AvailabilityFields({
  value,
  onChange,
}: {
  value: Schedule;
  onChange: (value: Schedule) => void;
}) {
  const days = value.days || [0, 1, 2, 3, 4, 5, 6];
  return (
    <fieldset className="mt-5 rounded-2xl border p-4">
      <legend className="px-2 font-bold">
        Dias e horários de disponibilidade
      </legend>
      <div className="flex flex-wrap gap-3">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day, i) => (
          <label key={day} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={days.includes(i)}
              onChange={() =>
                onChange({
                  ...value,
                  days: days.includes(i)
                    ? days.filter((d) => d !== i)
                    : [...days, i],
                })
              }
            />
            {day}
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label>
          <span className="label">A partir de</span>
          <input
            className="input"
            type="time"
            value={value.start || ""}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Até</span>
          <input
            className="input"
            type="time"
            value={value.end || ""}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-black/50">
        Sem horário definido: disponível durante todo o funcionamento da loja.
        Dias e horários usam o fuso de São Paulo.
      </p>
    </fieldset>
  );
}
