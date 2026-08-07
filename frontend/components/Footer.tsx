"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-ink-900/5 px-4 py-6 text-[12px] text-ink-400">
      <span>© Midnight Hack Buenos Aires 2026 · VELO · Evidence never touches the network</span>
      <span className="inline-flex items-center gap-4">
        <Link href="/cases" className="text-ink-500 underline-offset-3 hover:underline">
          {t("nav.cases")}
        </Link>
        <Link href="/peritos" className="text-ink-500 underline-offset-3 hover:underline">
          {t("nav.peritos")}
        </Link>
        <span className="inline-flex items-center gap-1.5 text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-indigo" />
          ZK · Compact · Midnight
        </span>
      </span>
    </footer>
  );
}
