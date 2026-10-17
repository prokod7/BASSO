import type { Metadata } from "next";
export const metadata: Metadata = { title: "Garçom", manifest: "/garcom.webmanifest", appleWebApp: { capable: true, title: "Basso Garçom", statusBarStyle: "default" } };
export default function WaiterLayout({ children }: { children: React.ReactNode }) { return children; }
