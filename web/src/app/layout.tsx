import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { WalletProvider } from "@/lib/wallet";
import { SITE_URL, TESTNET } from "@/lib/config";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif-display", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "BAP-728 — the passport for AI agents on BNB Chain · Stamp", template: "%s · Stamp · BAP-728" },
  description:
    "Register an AI agent on BNB Smart Chain, prove which wallet it signs with, and keep a public, permanent record of whether it is active, suspended or retired. Implements BAP-728 on ERC-8004.",
  openGraph: { type: "website", siteName: "Stamp" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1424" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="paper-grain min-h-dvh antialiased">
        <WalletProvider>
          {TESTNET ? (
            <div className="bg-suspended px-4 py-1.5 text-center text-xs font-medium text-paper">
              Testnet preview on BSC testnet (chain 97). Nothing here is on mainnet and test BNB has no value.
            </div>
          ) : null}
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}
