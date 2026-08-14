"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Scale, ShieldCheck, LogOut, Wallet } from "lucide-react";
import { VeloLogo, VeloWordmark } from "@/components/VeloLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n";
import { useWallet, WALLET_LABELS } from "@/lib/wallet";
import { truncateAddress } from "@/lib/utils";

export function Navbar() {
  const { t } = useI18n();
  const { session, disconnect } = useWallet();
  const pathname = usePathname();
  const router = useRouter();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
        pathname.startsWith(href)
          ? "bg-ink-900/5 text-ink-900"
          : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="nav-glass">
      <div className="nav-inner">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="VELO home" className="inline-flex flex-shrink-0 items-center gap-2.5">
            <VeloLogo />
            <VeloWordmark />
          </Link>

          <nav className="flex items-center gap-1" aria-label="Primary">
            {link("/cases", t("nav.cases"))}
            {link("/sealed", t("nav.sealed"))}
            {link("/verify", t("nav.verify"))}
            {link("/peritos", t("nav.peritos"))}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            {session ? (
              <>
                <span
                  className="hidden max-w-[220px] items-center gap-1.5 overflow-hidden rounded-full bg-ink-900/5 px-3 py-1.5 text-[12px] font-semibold text-ink-700 sm:inline-flex"
                  title={session.address}
                >
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-brand-indigo" />
                  <span className="truncate">
                    {session.kind === "demo" ? t("nav.demo") : WALLET_LABELS[session.kind]}
                  </span>
                  {session.kind !== "demo" && (
                    <span className="font-mono text-[11px] text-ink-400">{truncateAddress(session.address)}</span>
                  )}
                </span>
                <button
                  onClick={() => {
                    disconnect();
                    router.push("/");
                  }}
                  aria-label={t("nav.logout")}
                  title={t("nav.logout")}
                  className="btn-ghost inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("nav.logout")}</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="btn-primary shadow-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold"
              >
                <Scale className="h-4 w-4" />
                {t("nav.login")}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
