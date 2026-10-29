import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/** Geist (SIL OFL 1.1), a fonte da marca; servida pelo próprio site. */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "EntrePátios", template: "%s · EntrePátios" },
  description: "Rede privada de oportunidades automotivas entre lojistas.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body className="min-h-screen bg-neutral-100 font-sans text-marinho-900 antialiased">
        {children}
      </body>
    </html>
  );
}
