"use client";

import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { DistrictsManager } from "@/components/internal/DistrictsManager";

export default function DistrictsPage() {
  return <>
    <PageHeader title="Bairros de entrega" icon={MapPin} description="Adicione, pesquise e ajuste a taxa de cada bairro. Vale na hora para o site, o PDV e o robô do WhatsApp."/>
    <DistrictsManager />
  </>;
}
