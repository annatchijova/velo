import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { WalletProvider } from "@/lib/wallet";
import { ToastProvider } from "@/components/Toast";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VELO — Zero-knowledge forensic attestation on Midnight",
  description:
    "The verdict is visible. The victim is not. Seal forensic evidence locally, prove it with zero-knowledge on Midnight, and never expose the raw evidence.",
  keywords: ["Midnight", "zero-knowledge", "forensics", "evidence", "privacy", "Compact"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="font-sans">
        <I18nProvider>
          <WalletProvider>
            <ToastProvider>
              <div className="app-bg">
                <Navbar />
                <a href="#main" className="skip-link">
                  Skip to content
                </a>
                <main id="main">{children}</main>
                <Footer />
              </div>
            </ToastProvider>
          </WalletProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
