"use client";
import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

export interface MapPoint { id: string; latitude: number; longitude: number; label: string; kind: "store" | "driver" | "destination"; updatedAt?: string; }
const iconCache = new Map<string, ReturnType<typeof L.divIcon>>();
function icon(kind: MapPoint["kind"]) {
  const existing=iconCache.get(kind); if(existing)return existing;
  const symbol=kind==="store"?"🍕":kind==="driver"?"🏍️":"📍";
  const made=L.divIcon({className:"lfb-map-marker",html:`<span class="lfb-map-marker__bubble lfb-map-marker__bubble--${kind}"><span>${symbol}</span></span>`,iconSize:[38,38],iconAnchor:[19,34],popupAnchor:[0,-32]});
  iconCache.set(kind,made);return made;
}
export function OperationalMap({ points, className="h-80" }: { points: MapPoint[]; className?: string }) {
  const valid=points.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
  const center=valid[0]?[valid[0].latitude,valid[0].longitude] as [number,number]:undefined;
  const bounds=useMemo(()=>valid.length>1?L.latLngBounds(valid.map(p=>[p.latitude,p.longitude] as [number,number])):undefined,[valid]);
  if(!center)return <div className={`grid place-items-center rounded-2xl bg-basso-paper p-6 text-center text-sm text-black/50 ${className}`}>O mapa será exibido quando as coordenadas da pizzaria, do destino ou do motoboy estiverem configuradas.</div>;
  return <div className={className}><MapContainer center={center} zoom={14} bounds={bounds} boundsOptions={{padding:[35,35]}} scrollWheelZoom={false} className="h-full w-full rounded-2xl"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><>{valid.map(p=><Marker key={p.id} position={[p.latitude,p.longitude]} icon={icon(p.kind)}><Popup><strong>{p.label}</strong>{p.updatedAt&&<><br/><small>Atualizado: {new Date(p.updatedAt).toLocaleString("pt-BR")}</small></>}</Popup></Marker>)}</></MapContainer></div>;
}
