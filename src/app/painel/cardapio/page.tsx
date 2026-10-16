"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Edit3, Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { AvailabilityFields } from "@/components/internal/AvailabilityFields";
import { PageHeader } from "@/components/internal/PageHeader";
import { NewComboModal } from "@/components/internal/NewComboModal";
import { allProducts, catalog } from "@/lib/catalog";
import { currency, isDemoMode } from "@/lib/utils";
import type { MenuCategory, OrderChannel } from "@/types";

type FlavorRow = { id:string;name:string;category:string;priceGrande:number;priceBroto:number;ingredients:string[];description:string;featured:boolean;active:boolean;availableChannels?:OrderChannel[];availableSchedule?:any;allergens?:string[] };
type ProductRow = { id:string;name:string;description:string;category:string;price:number;active:boolean;stockTracked:boolean;availableChannels?:OrderChannel[];availableSchedule?:any;variant?:string;image?:string;allergens?:string[];config?:Record<string,unknown> };
type AddonRow = { id:string;name:string;price:number;active:boolean;maxQuantity:number };
type Entity = "flavor" | "product" | "addon" | "category";
type EditState = { entity:Entity; row:any } | null;

const channelOptions:Array<{value:OrderChannel;label:string}> = [
  {value:"own_delivery",label:"Entrega"},{value:"pickup",label:"Retirada"},{value:"counter",label:"Balcão"},{value:"dine_in",label:"Salão"},{value:"table_qr",label:"QR da mesa"},{value:"ifood",label:"iFood"},{value:"99food",label:"99Food"}
];
const defaultChannels: OrderChannel[] = ["own_delivery","pickup","counter","dine_in","table_qr"];

export default function MenuAdminPage() {
  const [tab,setTab] = useState<Entity>("product");
  const [query,setQuery] = useState("");
  const [categories,setCategories] = useState<MenuCategory[]>([]);
  const [flavors,setFlavors] = useState<FlavorRow[]>(catalog.flavors);
  const [products,setProducts] = useState<ProductRow[]>(allProducts.map(row=>({...row,stockTracked:row.stockTracked||false})));
  const [addons,setAddons] = useState<AddonRow[]>(catalog.addons);
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(true);
  const [editing,setEditing] = useState<EditState>(null);
  const [creatingCombo,setCreatingCombo] = useState(false);
  const [creatingProduct,setCreatingProduct] = useState(false);
  const [creatingCategory,setCreatingCategory] = useState(false);
  const [saving,setSaving] = useState(false);

  async function load() {
    setLoading(true); setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/menu/availability",{cache:"no-store"});
        const body = await response.json();
        if(!response.ok) throw new Error(body.error||"Falha ao consultar cardápio.");
        setCategories(body.categories || []);
        setFlavors(body.flavors || []);
        setProducts(body.products || []);
        setAddons(body.addons || []);
      } else {
        setCategories([
          {id:"traditional",name:"Pizzas Tradicionais",kind:"pizza",sortOrder:0,active:true},
          {id:"premium",name:"Pizzas Premium",kind:"pizza",sortOrder:1,active:true},
          {id:"sweet",name:"Pizzas Doces",kind:"pizza",sortOrder:2,active:true},
          {id:"beverages",name:"Bebidas",kind:"beverage",sortOrder:3,active:true},
          {id:"desserts",name:"Sobremesas",kind:"dessert",sortOrder:4,active:true},
          {id:"combo",name:"Promoções",kind:"combo",sortOrder:5,active:true},
        ]);
      }
    } catch(error) { setMessage(error instanceof Error?error.message:"Falha ao carregar cardápio."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load()},[]);

  const rows = useMemo(()=>{
    const source = tab === "flavor" ? flavors : tab === "product" ? products : tab === "addon" ? addons : categories;
    return source.filter((row:any)=>!query||`${row.name} ${row.description||""} ${(row.ingredients||[]).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  },[tab,flavors,products,addons,categories,query]);

  function updateLocal(entity:Entity,id:string,patch:any) {
    if(entity==="flavor") setFlavors(current=>current.map(row=>row.id===id?{...row,...patch}:row));
    if(entity==="product") setProducts(current=>current.map(row=>row.id===id?{...row,...patch}:row));
    if(entity==="addon") setAddons(current=>current.map(row=>row.id===id?{...row,...patch}:row));
    if(entity==="category") setCategories(current=>current.map(row=>row.id===id?{...row,...patch}:row));
  }

  async function toggle(entity:Entity,row:any) {
    setSaving(true); setMessage("");
    try {
      const active = !row.active;
      if(!isDemoMode()) {
        const endpoint = entity === "category" ? `/api/menu/categories/${row.id}` : "/api/menu/availability";
        const payload = entity === "category" ? {active} : {entity,id:row.id,active};
        const response = await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const body=await response.json(); if(!response.ok) throw new Error(body.error||"Falha ao alterar disponibilidade.");
      }
      updateLocal(entity,row.id,{active});
      setMessage(active?"Item reativado.":"Item pausado. Ele deixa de ser vendido, mas permanece no cadastro.");
    } catch(error){setMessage(error instanceof Error?error.message:"Falha ao alterar item.");}
    finally{setSaving(false)}
  }

  async function archive(entity:"product"|"category",row:any) {
    if(!window.confirm(`Remover “${row.name}” do catálogo? O histórico de pedidos será preservado.`)) return;
    setSaving(true); setMessage("");
    try {
      if(!isDemoMode()) {
        const endpoint = entity === "product" ? `/api/menu/products/${row.id}` : `/api/menu/categories/${row.id}`;
        const response = await fetch(endpoint,{method:"DELETE"});
        const body=await response.json(); if(!response.ok) throw new Error(body.error||"Falha ao remover.");
      }
      setMessage(`${row.name} removido do catálogo. O histórico foi preservado.`);
      await load();
    } catch(error){setMessage(error instanceof Error?error.message:"Falha ao remover item.");}
    finally{setSaving(false)}
  }

  async function saveEdit(draft:any) {
    if(!editing) return;
    setSaving(true); setMessage("");
    try {
      if(!isDemoMode()) {
        if(editing.entity==="category") {
          const response=await fetch(`/api/menu/categories/${draft.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.name,kind:draft.kind,sortOrder:Number(draft.sortOrder||0),active:draft.active})});
          const body=await response.json(); if(!response.ok) throw new Error(body.error||"Falha ao salvar categoria.");
        } else {
          const payload={entity:editing.entity,id:draft.id,active:draft.active,name:draft.name,description:draft.description,ingredients:draft.ingredients,featured:draft.featured,allergens:draft.allergens,variant:draft.variant||null,maxQuantity:draft.maxQuantity,priceGrande:draft.priceGrande,priceBroto:draft.priceBroto,price:draft.price,category:draft.category,stockTracked:draft.stockTracked,channels:draft.availableChannels?.length?draft.availableChannels:undefined,schedule:draft.availableSchedule||{}};
          const response=await fetch("/api/menu/availability",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
          const body=await response.json(); if(!response.ok) throw new Error(body.error||"Falha ao salvar item.");
        }
      }
      setEditing(null); setMessage("Alteração salva e registrada na auditoria."); await load();
    } catch(error){setMessage(error instanceof Error?error.message:"Falha ao salvar item.");}
    finally{setSaving(false)}
  }

  async function createProduct(draft:any) {
    setSaving(true);setMessage("");
    try {
      if(isDemoMode()){setMessage("Criação persistente de produto exige banco configurado.");return;}
      const response=await fetch("/api/menu/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.name,category:draft.category,description:draft.description||"",variant:draft.variant||null,price:draft.price,stockTracked:Boolean(draft.stockTracked),active:true,channels:defaultChannels,allergens:[]})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"Falha ao criar produto.");
      setCreatingProduct(false);await load();setMessage("Produto criado. Agora você pode enviar a foto e ajustar todos os detalhes.");
    } catch(error){setMessage(error instanceof Error?error.message:"Falha ao criar produto.");}
    finally{setSaving(false)}
  }

  async function createCategory(draft:any) {
    setSaving(true);setMessage("");
    try {
      if(isDemoMode()){setMessage("Criação persistente de categoria exige banco configurado.");return;}
      const response=await fetch("/api/menu/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"Falha ao criar categoria.");
      setCreatingCategory(false);await load();setMessage("Categoria criada e pronta para receber produtos.");
    } catch(error){setMessage(error instanceof Error?error.message:"Falha ao criar categoria.");}
    finally{setSaving(false)}
  }

  return <>
    <PageHeader title="Administração do cardápio" icon={BookOpen} description="Controle produtos, categorias, sabores, adicionais, imagens, preços e disponibilidade sem acessar o banco." actions={<div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={()=>setCreatingProduct(true)}><Plus size={17}/>Novo produto</button><button className="btn-secondary" onClick={()=>setCreatingCategory(true)}><Plus size={17}/>Nova categoria</button><button className="btn-secondary" onClick={()=>setCreatingCombo(true)}><Plus size={17}/>Novo combo</button></div>}/>
    {message&&<p className="mb-4 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}
    <div className="mb-5 grid gap-4 sm:grid-cols-4"><Count label="Categorias" value={categories.length}/><Count label="Produtos" value={products.length}/><Count label="Sabores" value={flavors.length}/><Count label="Adicionais" value={addons.length}/></div>
    <section className="surface mb-5 p-4"><div className="flex flex-col gap-3 lg:flex-row"><div className="flex flex-wrap rounded-xl border bg-white p-1">{(["product","category","flavor","addon"] as Entity[]).map(value=><button key={value} className={`min-h-9 rounded-lg px-4 text-xs font-bold ${tab===value?"bg-basso-wine text-white":"text-black/50"}`} onClick={()=>setTab(value)}>{value==="product"?"Produtos":value==="category"?"Categorias":value==="flavor"?"Sabores de pizza":"Adicionais"}</button>)}</div><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17}/><input className="input pl-9" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar por nome, descrição ou ingrediente"/></label><button className="btn-secondary" onClick={()=>void load()} disabled={loading}>{loading?<Loader2 className="animate-spin" size={17}/>:<Save size={17}/>}Atualizar</button></div></section>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-basso-black text-white"><tr><Th>Item</Th><Th>Categoria / tipo</Th>{tab!=="category"&&<Th>Preço</Th>}{tab==="flavor"&&<Th>Broto</Th>}<Th>Status</Th><Th>Ações</Th></tr></thead><tbody className="divide-y divide-black/5">{rows.map((row:any)=><tr key={row.id}><Td><div className="flex items-center gap-3">{row.image&&<img src={row.image} alt="" className="h-12 w-12 rounded-xl border object-cover"/>}<div><strong>{row.name}</strong><p className="mt-1 line-clamp-1 max-w-md text-xs text-black/40">{row.description||row.ingredients?.join(", ")||row.id}</p></div></div></Td><Td>{tab==="product"?(categories.find(category=>category.id===row.category)?.name||row.category):tab==="category"?row.kind:tab==="flavor"?(categories.find(category=>category.id===row.category)?.name||row.category):"Adicional"}</Td>{tab!=="category"&&<Td>{currency(tab==="flavor"?row.priceGrande:row.price)}</Td>}{tab==="flavor"&&<Td>{currency(row.priceBroto)}</Td>}<Td><button disabled={saving} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${row.active?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`} onClick={()=>void toggle(tab,row)}>{row.active?<><Eye size={14}/>Ativo</>:<><EyeOff size={14}/>Pausado</>}</button></Td><Td><div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={()=>setEditing({entity:tab,row:{...row}})}><Edit3 size={16}/>Administrar</button>{(tab==="product"||tab==="category")&&<button className="btn-ghost text-red-700" disabled={saving} onClick={()=>void archive(tab,row)}><Trash2 size={16}/>Remover</button>}</div></Td></tr>)}{!rows.length&&<tr><td colSpan={7} className="p-10 text-center text-black/45">Nenhum item encontrado.</td></tr>}</tbody></table></div></div>
    {editing?.row.category==="combo"?<NewComboModal key={editing.row.id} open flavors={flavors} products={products} initial={editing.row} onClose={()=>setEditing(null)} onCreated={load}/>:editing&&<EditModal entity={editing.entity} initial={editing.row} categories={categories} saving={saving} onClose={()=>setEditing(null)} onSave={saveEdit} onImageChanged={async()=>{await load();}}/>}
    {creatingProduct&&<NewProductModal categories={categories.filter(category=>category.active&&category.kind!=="pizza"&&category.id!=="combo")} saving={saving} onClose={()=>setCreatingProduct(false)} onSave={createProduct}/>} 
    {creatingCategory&&<NewCategoryModal saving={saving} onClose={()=>setCreatingCategory(false)} onSave={createCategory}/>} 
    {creatingCombo&&<NewComboModal key="new" open={creatingCombo} flavors={flavors} products={products} onClose={()=>setCreatingCombo(false)} onCreated={async()=>{await load();setMessage("Novo combo criado.")}}/>}
  </>;
}

function EditModal({entity,initial,categories,saving,onClose,onSave,onImageChanged}:{entity:Entity;initial:any;categories:MenuCategory[];saving:boolean;onClose:()=>void;onSave:(draft:any)=>void;onImageChanged:()=>void}) {
  const [draft,setDraft]=useState({...initial,ingredients:[...(initial.ingredients||[])],allergens:[...(initial.allergens||[])],availableChannels:[...(initial.availableChannels||[])]});
  const [imageBusy,setImageBusy]=useState(false);
  const channels=(draft.availableChannels||[]) as OrderChannel[];
  function toggleChannel(value:OrderChannel){setDraft({...draft,availableChannels:channels.includes(value)?channels.filter(item=>item!==value):[...channels,value]})}
  async function upload(file:File){setImageBusy(true);try{const form=new FormData();form.append("file",file);form.append("entity",entity==="category"?"category":"product");form.append("id",draft.id);const response=await fetch("/api/menu/images",{method:"POST",body:form});const body=await response.json();if(!response.ok)throw new Error(body.error||"Falha ao enviar imagem.");setDraft({...draft,image:body.url});await onImageChanged()}catch(error){alert(error instanceof Error?error.message:"Falha ao enviar imagem.")}finally{setImageBusy(false)}}
  async function removeImage(){setImageBusy(true);try{const response=await fetch("/api/menu/images",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:entity==="category"?"category":"product",id:draft.id})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Falha ao remover imagem.");setDraft({...draft,image:undefined});await onImageChanged()}catch(error){alert(error instanceof Error?error.message:"Falha ao remover imagem.")}finally{setImageBusy(false)}}
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase text-basso-wine">Controle total</p><h2 className="mt-1 font-display text-2xl font-bold">{draft.name}</h2></div><button className="btn-ghost" onClick={onClose}><X/></button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Nome" value={draft.name||""} onChange={value=>setDraft({...draft,name:value})}/>{entity==="category"?<><label><span className="label">Tipo</span><select className="input" value={draft.kind||"general"} onChange={e=>setDraft({...draft,kind:e.target.value})}><option value="general">Produtos</option><option value="beverage">Bebidas</option><option value="dessert">Sobremesas</option><option value="combo">Promoções/combos</option><option value="pizza">Pizzas</option></select></label><label><span className="label">Ordem</span><input className="input" type="number" min={0} value={draft.sortOrder||0} onChange={e=>setDraft({...draft,sortOrder:Number(e.target.value)})}/></label></>:entity==="flavor"?<><Money label="Preço Grande" value={draft.priceGrande} onChange={value=>setDraft({...draft,priceGrande:value})}/><Money label="Preço Broto" value={draft.priceBroto} onChange={value=>setDraft({...draft,priceBroto:value})}/></>:<Money label="Preço" value={draft.price} onChange={value=>setDraft({...draft,price:value})}/>} 
      {entity==="product"&&<><label><span className="label">Categoria</span><select className="input" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{categories.filter(category=>category.active&&category.kind!=="pizza").map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Field label="Variação" value={draft.variant||""} onChange={value=>setDraft({...draft,variant:value})}/><label className="flex items-center gap-2 rounded-xl border p-3 sm:col-span-2"><input type="checkbox" checked={Boolean(draft.stockTracked)} onChange={e=>setDraft({...draft,stockTracked:e.target.checked})}/><span><strong className="text-sm">Controlar estoque deste produto</strong><p className="text-xs text-black/45">Quando ativado, o produto pode ser ocultado automaticamente ao zerar.</p></span></label></>}
      {entity==="addon"&&<label><span className="label">Máximo por pizza</span><select className="input" value={draft.maxQuantity||2} onChange={event=>setDraft({...draft,maxQuantity:Number(event.target.value)})}><option value={1}>1</option><option value={2}>2</option></select></label>}
      {entity!=="category"&&entity!=="addon"&&<label className="sm:col-span-2"><span className="label">Descrição</span><textarea className="textarea" value={draft.description||""} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>}
      {entity==="flavor"&&<label className="sm:col-span-2"><span className="label">Ingredientes, separados por vírgula</span><textarea className="textarea" value={(draft.ingredients||[]).join(", ")} onChange={event=>setDraft({...draft,ingredients:event.target.value.split(",").map(value=>value.trim()).filter(Boolean)})}/></label>}
      {(entity==="product"||entity==="category")&&<div className="sm:col-span-2"><span className="label">Imagem</span><div className="mt-1 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-4">{draft.image?<img src={draft.image} alt="Prévia" className="h-24 w-24 rounded-xl object-cover"/>:<div className="grid h-24 w-24 place-items-center rounded-xl bg-black/5 text-black/30"><ImagePlus/></div>}<div className="flex flex-col gap-2"><label className="btn-secondary cursor-pointer"><ImagePlus size={16}/>{imageBusy?"Enviando...":"Escolher imagem"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={imageBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value=""}}/></label>{draft.image&&<button type="button" className="btn-ghost text-red-700" disabled={imageBusy} onClick={()=>void removeImage()}><Trash2 size={15}/>Remover imagem</button>}<p className="text-xs text-black/45">JPG, PNG, WebP ou AVIF • até 5 MB. Não precisa colar URL.</p></div></div></div>}
      {entity!=="category"&&<label className="sm:col-span-2"><span className="label">Alergênicos, separados por vírgula</span><input className="input" value={(draft.allergens||[]).join(", ")} onChange={event=>setDraft({...draft,allergens:event.target.value.split(",").map(value=>value.trim()).filter(Boolean)})}/></label>}
    </div>
    {(entity==="product"||entity==="flavor")&&<div className="mt-5"><p className="label">Canais disponíveis</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{channelOptions.map(item=><label key={item.value} className="flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold"><input type="checkbox" checked={channels.includes(item.value)} onChange={()=>toggleChannel(item.value)}/>{item.label}</label>)}</div></div>}
    {(entity==="flavor"||entity==="product")&&<AvailabilityFields value={draft.availableSchedule||{}} onChange={availableSchedule=>setDraft({...draft,availableSchedule})}/>}
    <div className="mt-5 flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.active!==false} onChange={event=>setDraft({...draft,active:event.target.checked})}/>Ativo</label>{entity==="flavor"&&<label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(draft.featured)} onChange={event=>setDraft({...draft,featured:event.target.checked})}/>Destaque</label>}</div>
    <button className="btn-primary mt-6 w-full" disabled={saving||imageBusy} onClick={()=>onSave(draft)}>{saving?<Loader2 className="animate-spin"/>:<Save size={17}/>}Salvar alterações</button>
  </div></div>;
}

function NewProductModal({categories,saving,onClose,onSave}:{categories:MenuCategory[];saving:boolean;onClose:()=>void;onSave:(draft:any)=>void}) {
  const [draft,setDraft]=useState({name:"",category:categories[0]?.id||"beverages",description:"",variant:"",price:0,stockTracked:false});
  return <Modal title="Novo produto" onClose={onClose}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome" value={draft.name} onChange={name=>setDraft({...draft,name})}/><label><span className="label">Categoria</span><select className="input" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Money label="Preço" value={draft.price} onChange={price=>setDraft({...draft,price})}/><Field label="Variação" value={draft.variant} onChange={variant=>setDraft({...draft,variant})}/><label className="sm:col-span-2"><span className="label">Descrição</span><textarea className="textarea" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={draft.stockTracked} onChange={e=>setDraft({...draft,stockTracked:e.target.checked})}/>Controlar estoque</label></div><button className="btn-primary mt-6 w-full" disabled={saving||draft.name.trim().length<2||!draft.category} onClick={()=>onSave(draft)}>{saving?<Loader2 className="animate-spin"/>:<Plus size={17}/>}Criar produto</button></Modal>;
}

function NewCategoryModal({saving,onClose,onSave}:{saving:boolean;onClose:()=>void;onSave:(draft:any)=>void}) {
  const [draft,setDraft]=useState({name:"",kind:"general",sortOrder:10,active:true});
  return <Modal title="Nova categoria" onClose={onClose}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome" value={draft.name} onChange={name=>setDraft({...draft,name})}/><label><span className="label">Tipo</span><select className="input" value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}><option value="general">Produtos</option><option value="beverage">Bebidas</option><option value="dessert">Sobremesas</option><option value="combo">Promoções/combos</option></select></label><label><span className="label">Ordem de exibição</span><input className="input" type="number" min={0} value={draft.sortOrder} onChange={e=>setDraft({...draft,sortOrder:Number(e.target.value)})}/></label></div><button className="btn-primary mt-6 w-full" disabled={saving||draft.name.trim().length<2} onClick={()=>onSave(draft)}>{saving?<Loader2 className="animate-spin"/>:<Plus size={17}/>}Criar categoria</button></Modal>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">{title}</h2><button className="btn-ghost" onClick={onClose}><X/></button></div>{children}</div></div>}
function Count({label,value}:{label:string;value:string|number}){return <div className="surface p-4"><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-1 text-2xl font-black text-basso-wine">{value}</p></div>}
function Th({children}:{children:React.ReactNode}){return <th className="px-4 py-3 text-xs uppercase">{children}</th>}
function Td({children}:{children:React.ReactNode}){return <td className="px-4 py-3">{children}</td>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label><span className="label">{label}</span><input className="input" value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Money({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){return <label><span className="label">{label}</span><input className="input" value={(Number(value||0)/100).toFixed(2).replace(".",",")} inputMode="decimal" onChange={event=>{const normalized=event.target.value.replace(/[^0-9,.-]/g,"").replace(",",".");onChange(Math.max(0,Math.round((Number(normalized)||0)*100)))}}/></label>}

