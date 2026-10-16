import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/server/auth/next";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const heading = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-heading" });

export const metadata: Metadata = {
  title: { default: "Abyss Arena — Draft competitivo de Genshin Impact", template: "%s · Abyss Arena" },
  description: "Monte decks com orçamento de pontos, faça bans e picks em tempo real e dispute speedruns do Abismo Espiral.",
};

export const viewport: Viewport = { themeColor: "#12151f", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="pt-BR" className={`${body.variable} ${heading.variable} dark`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <SiteHeader user={user} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
