"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Ghost, CheckCircle2, ExternalLink } from "lucide-react";
import { VeloLogo, VeloWordmark } from "@/components/VeloLogo";
import { useI18n } from "@/lib/i18n";
import { useWallet, WALLET_INSTALL_URLS, WALLET_LABELS, type WalletKind } from "@/lib/wallet";
import { useToast } from "@/components/Toast";

export default function LoginPage() {
  const { t } = useI18n();
  const { connect, connecting, error, detected } = useWallet();
  const { push } = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<WalletKind | null>(null);

  const walletOptions: { kind: WalletKind; note: string; installed: boolean }[] = [
    {
      kind: "lace",
      note: "Cardano + Midnight wallet. Local proof server required.",
      installed: detected.lace ?? false,
    },
    {
      kind: "1am",
      note: "Native Midnight wallet. In-browser ZK proving, zero dust.",
      installed: detected["1am"] ?? false,
    },
  ];

  async function handleConnect(kind: WalletKind) {
    setSelected(kind);
    const ok = await connect(kind);
    if (ok) {
      push(`Connected as ${WALLET_LABELS[kind]}`, "success");
      router.push("/cases");
    }
  }

  async function handleDemo() {
    setSelected("demo");
    const ok = await connect("demo");
    if (ok) {
      push("Anonymous examiner mode — you can view and seal, but not attest.", "info");
      router.push("/cases");
    }
  }

  return (
    <section className="login-bg relative flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden px-4 py-10">
      {/* animated orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-drift absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-indigo/25 blur-3xl" />
        <div className="animate-drift absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-brand-cyan/20 blur-3xl" style={{ animationDelay: "-7s" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="rounded-3xl border border-white/10 bg-white/95 p-8 shadow-lift backdrop-blur-xl">
          <div className="flex justify-center">
            <div className="flex items-center gap-2">
              <VeloLogo className="h-8 w-8" />
              <VeloWordmark />
            </div>
          </div>

          <div className="mt-7 text-center">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900">
              {t("login.title")}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-500">{t("login.subtitle")}</p>
          </div>

          <div className="mt-7 space-y-3">
            {walletOptions.map(({ kind, note, installed }) => (
              <button
                key={kind}
                onClick={() => handleConnect(kind)}
                disabled={connecting}
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-ink-900/10 bg-white p-4 text-left transition hover:border-brand-indigo/30 hover:shadow-glow disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[11px] font-extrabold text-white">
                  {kind === "lace" ? "L" : "1"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
                    {WALLET_LABELS[kind]}
                    {installed && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-400">{note}</span>
                </span>
                {installed ? (
                  <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-indigo" />
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-deep">
                    <ExternalLink className="h-3 w-3" />
                    {t("login.installing")}
                  </span>
                )}
              </button>
            ))}

            {!detected.lace && !detected["1am"] && (
              <p className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-800">
                No Midnight wallet detected. Install{" "}
                <a
                  href={WALLET_INSTALL_URLS.lace}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline underline-offset-2"
                >
                  Lace
                </a>{" "}
                or{" "}
                <a
                  href={WALLET_INSTALL_URLS["1am"]}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline underline-offset-2"
                >
                  1AM
                </a>
                , refresh, and connect.
              </p>
            )}

            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-ink-300">
              <span className="h-px flex-1 bg-ink-900/10" />
              {t("login.or")}
              <span className="h-px flex-1 bg-ink-900/10" />
            </div>

            <button
              onClick={handleDemo}
              disabled={connecting}
              className="btn-ghost flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold disabled:opacity-60"
            >
              {connecting && selected === "demo" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ghost className="h-4 w-4" />
              )}
              {t("login.demo")}
            </button>
            <p className="text-center text-[11px] text-ink-400">{t("login.demo.desc")}</p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-verdict-malice/15 bg-verdict-maliceBg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-verdict-malice"
            >
              {error}
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-white/60">
          The case ledger is public. Attestation is permanent — it cannot be withdrawn, only
          contradicted by a later one.
        </p>
      </motion.div>
    </section>
  );
}
