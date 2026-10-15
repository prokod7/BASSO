"use client";
import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { currency } from "@/lib/utils";
import type { ComboConfig } from "@/lib/combos";

type FlavorOption = {
  id: string;
  name: string;
  active: boolean;
  category?: string;
};
type ProductOption = {
  id: string;
  name: string;
  category: string;
  active: boolean;
};
export type EditableCombo = {
  id: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  availableChannels?: string[];
  availableSchedule?: { days?: number[]; start?: string; end?: string };
  image?: string;
  config?: Partial<ComboConfig>;
};
const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const channels = [
  ["own_delivery", "Entrega"],
  ["pickup", "Retirada"],
  ["counter", "Balcão"],
  ["dine_in", "Salão"],
  ["table_qr", "QR da mesa"],
];
export function NewComboModal({
  open,
  flavors,
  products,
  onClose,
  onCreated,
  initial,
}: {
  open: boolean;
  flavors: FlavorOption[];
  products: ProductOption[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  initial?: EditableCombo;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [price, setPrice] = useState(String((initial?.price || 0) / 100));
  const [schedule, setSchedule] = useState(
    initial?.availableSchedule || { days: [0, 1, 2, 3, 4, 5, 6] },
  );
  const [selectedChannels, setChannels] = useState(
    initial?.availableChannels || channels.map((c) => c[0]),
  );
  const [config, setConfig] = useState<Partial<ComboConfig>>({
    grandeQuantity: 1,
    sweetSize: "broto",
    allowHalfHalf: true,
    masses: ["traditional", "integral"],
    grandeFlavors: [],
    sweetFlavors: [],
    beverages: [],
    ...initial?.config,
  });
  const [image,setImage]=useState(initial?.image||"");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  if (!open) return null;
  const sweetIds = config.sweetFlavors || [config.sweetFlavor || "brigadeiro"];
  const cents = Math.round(Number(price.replace(",", ".")) * 100);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  async function save() {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/menu/combos", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          id: initial?.id,
          name,
          description,
          price: cents,
          days: schedule.days,
          start: schedule.start || undefined,
          end: schedule.end || undefined,
          channels: selectedChannels,
          sweetFlavor: sweetIds[0],
          sweetFlavors: sweetIds,
          active: initial?.active ?? true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Falha ao salvar combo.");
      await onCreated();
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setWorking(false);
    }
  }
  async function updateImage(file?:File){
    if(!initial)return;setWorking(true);setMessage("");
    try{let response:Response;
      if(file){const data=new FormData();data.append("entity","product");data.append("id",initial.id);data.append("file",file);response=await fetch("/api/menu/images",{method:"POST",body:data})}
      else response=await fetch("/api/menu/images",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"product",id:initial.id})});
      const body=await response.json();if(!response.ok)throw Error(body.error||"Falha ao alterar foto.");setImage(file?body.url:"");setMessage("Foto salva.");await onCreated();
    }catch(error){setMessage(error instanceof Error?error.message:"Falha ao alterar foto.")}finally{setWorking(false)}
  }
  const choices = (
    label: string,
    options: { id: string; name: string; active: boolean }[],
    ids: string[],
    onChange: (ids: string[]) => void,
  ) => (
    <fieldset className="rounded-2xl border p-4">
      <legend className="px-2 font-bold">{label}</legend>
      <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
        {options.map((f) => (
          <label
            key={f.id}
            className="flex min-h-10 items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={ids.includes(f.id)}
              onChange={() => onChange(toggle(ids, f.id))}
            />
            {f.name}
            {!f.active && " (pausado)"}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Configurar combo"
    >
      <div className="max-h-[92vh] w-full max-w-4xl space-y-5 overflow-y-auto rounded-3xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">
            {initial ? "Editar combo" : "Novo combo"}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            className="btn-ghost"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <p className="text-sm text-black/55">
          Defina a composição, sabores, preço e disponibilidade. Ao salvar, a
          configuração passa a valer nos próximos pedidos.
        </p>
        {message && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            {message}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Nome</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Preço (R$)</span>
            <input
              className="input"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Quantidade de Grandes salgadas</span>
            <select
              className="input"
              value={config.grandeQuantity}
              onChange={(e) =>
                setConfig({ ...config, grandeQuantity: Number(e.target.value) })
              }
            >
              <option value={1}>1 pizza</option>
              <option value={2}>2 pizzas</option>
            </select>
          </label>
          <label>
            <span className="label">Tamanho da pizza doce</span>
            <select
              className="input"
              value={config.sweetSize}
              onChange={(e) =>
                setConfig({
                  ...config,
                  sweetSize: e.target.value as "broto" | "grande",
                })
              }
            >
              <option value="broto">Broto</option>
              <option value="grande">Grande</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="label">Descrição</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={config.allowHalfHalf !== false}
            onChange={(e) =>
              setConfig({ ...config, allowHalfHalf: e.target.checked })
            }
          />
          Permitir meio a meio nas pizzas salgadas
        </label>
        {initial&&<section className="rounded-2xl border p-4"><p className="label">Foto do combo</p>{image&&<img src={image} alt="Foto do combo" className="mb-3 h-32 w-32 rounded-xl object-cover"/>}<label className="block"><span className="label">Enviar foto</span><input type="file" accept="image/*" disabled={working} onChange={e=>{const file=e.target.files?.[0];if(file)void updateImage(file)}}/></label>{image&&<button type="button" className="btn-secondary mt-3" disabled={working} onClick={()=>void updateImage()}>Remover foto</button>}</section>}
      {choices(
          "Sabores salgados",
          flavors.filter((f) => f.category !== "sweet"),
          config.grandeFlavors || [],
          (ids) => setConfig({ ...config, grandeFlavors: ids }),
        )}
        {choices(
          "Sabores doces",
          flavors.filter((f) => f.category === "sweet"),
          sweetIds,
          (ids) =>
            setConfig({ ...config, sweetFlavors: ids, sweetFlavor: ids[0] }),
        )}
        {choices(
          "Refrigerantes inclusos",
          products.filter((p) => p.category === "beverages"),
          config.beverages || [],
          (ids) => setConfig({ ...config, beverages: ids }),
        )}
        <fieldset>
          <legend className="label">Dias de disponibilidade</legend>
          <div className="flex flex-wrap gap-3">
            {days.map((day, i) => (
              <label key={day} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={schedule.days?.includes(i) || false}
                  onChange={() =>
                    setSchedule({
                      ...schedule,
                      days: schedule.days?.includes(i)
                        ? schedule.days.filter((d) => d !== i)
                        : [...(schedule.days || []), i],
                    })
                  }
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">De (opcional)</span>
            <input
              className="input"
              type="time"
              value={schedule.start || ""}
              onChange={(e) =>
                setSchedule({ ...schedule, start: e.target.value })
              }
            />
          </label>
          <label>
            <span className="label">Até (opcional)</span>
            <input
              className="input"
              type="time"
              value={schedule.end || ""}
              onChange={(e) =>
                setSchedule({ ...schedule, end: e.target.value })
              }
            />
          </label>
        </div>
        <fieldset>
          <legend className="label">Canais</legend>
          <div className="flex flex-wrap gap-3">
            {channels.map(([id, label]) => (
              <label key={id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(id)}
                  onChange={() => setChannels(toggle(selectedChannels, id))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="btn-primary min-h-12 w-full"
          disabled={
            working ||
            !name.trim() ||
            !description.trim() ||
            !Number.isFinite(cents) ||
            cents < 0 ||
            !config.grandeFlavors?.length ||
            !sweetIds.length ||
            !config.beverages?.length ||
            !schedule.days?.length ||
            !selectedChannels.length
          }
          onClick={() => void save()}
        >
          {working ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <Save size={17} />
          )}
          Salvar combo • {currency(Number.isFinite(cents) ? cents : 0)}
        </button>
      </div>
    </div>
  );
}
