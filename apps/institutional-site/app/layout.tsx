import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ramo Nessa — O próximo destino é seu",
  description: "Conheça o Ramo Nessa: corridas e entregas para Jericoacoara, Jijoca e Preá. Android via APK, acesso web para iPhone e Android e pré-cadastro de motoristas.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head><link rel="preload" href="/fonts/general-sans-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><meta name="theme-color" content="#111412" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
