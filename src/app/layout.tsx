import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "La Forneria Basso", template: "%s | La Forneria Basso" },
  description: "Pizzaria artesanal com massa de longa fermentação em Rio Grande da Serra.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/basso-favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/icon-192.png"
  }
};
export const viewport: Viewport = { themeColor: "#5a111a", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><CartProvider>{children}</CartProvider><PwaRegister /></body></html>;
}
