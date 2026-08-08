"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lock,
  Eye,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wand2,
  FileX2,
  Link2Off,
} from "lucide-react";
import type { CaseFile, SealedBundle, AttestResponse, VerifyResponse } from "@/lib/types";
import { sealCase, verifyBundle, attestCase } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { shortHash } from "@/lib/utils";
import { VerdictBadge } from "@/components/VerdictBadge";

type TamperMode = "none" | "verdict" | "fingerprint" | "truncate";
type Step = "idle" | "sealing" | "sealed" | "attesting" | "attested" | "verifying" | "verified";

const TAMPER_OPTIONS: { mode: TamperMode; labelKey: "action.swapVerdict" | "action.corruptFingerprint" | "action.truncateCustody"; icon: typeof Wand2 }[] = [
  { mode: "verdict", labelKey: "action.swapVerdict", icon: Wand2 },
  { mode: "fingerprint", labelKey: "action.corruptFingerprint", icon: FileX2 },
  { mode: "truncate", labelKey: "action.truncateCustody", icon: Link2Off },
];

export function ActionPanel({ caseFile }: { caseFile: CaseFile }) {
  const { t } = useI18n();
  const { session, isAttestor } = useWallet();
  const { push } = useToast();

  const [step, setStep] = useState<Step>("idle");
  const [bundle, setBundle] = useState<SealedBundle | null>(null);
  const [attestation, setAttestation] = useState<AttestResponse | null>(null);
  const [verification, setVerification] = useState<VerifyResponse | null>(null);
  const [tamper, setTamper] = useState<TamperMode>("none");
  const [busy, setBusy] = useState(false);

  async function handleSeal() {
    setBusy(true);
    try {
      const res = await sealCase(caseFile);
      setBundle(res.bundle as SealedBundle);
      setAttestation(null);
      setVerification(null);
      setTamper("none");
      setStep("sealed");
      if (res.persisted) {
        push(t("toast.sealedPersisted"), "success");
      } else {
        push(t("toast.sealedSuccess"), "success");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : t("toast.sealingFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleAttest() {
    if (!bundle) return;
    if (!isAttestor) {
      push(t("toast.attestRequiresWallet"), "error");
      return;
    }
    setBusy(true);
    setStep("attesting");
    try {
      const res = await attestCase(bundle, session?.name ?? "wallet");
      setAttestation(res);
      setStep("attested");
      push(t("toast.commitmentComputed"), "success");
    } catch (err) {
      setStep("sealed");
      push(err instanceof Error ? err.message : t("toast.attestationFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(mode: TamperMode) {
    if (!bundle) return;
    setBusy(true);
    setTamper(mode);
    setVerification(null);
    try {
      const res = await verifyBundle(bundle, mode);
      setVerification(res);
      setStep("verified");
      if (!res.internallyConsistent) {
        push(`${t("toast.tamperDetectedPrefix")} — ${res.reasons.length} ${t("toast.reasonsVerificationFailed")}`, "error");
      } else {
        push(t("toast.verifiedOffline"), "success");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : t("toast.verificationFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const walletRequired = !isAttestor;

  return (
    <div className="card-solid rounded-3xl p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900">
          {t("action.examinerWorkflow")}
        </h2>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          <span
            className={`h-2 w-2 rounded-full ${walletRequired ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          {walletRequired ? t("action.walletRequired") : `${session?.name} ${t("action.connected")}`}
        </div>
      </div>

      {/* Step 1 — Seal */}
      <div className="mt-5">
        <button
          onClick={handleSeal}
          disabled={busy}
          className="btn-primary shadow-soft flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
        >
          {busy && step === "sealing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {t("detail.seal")} — {t("action.runEngine")}
        </button>
      </div>

      {/* Bundle result */}
      <AnimatePresence>
        {bundle && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-900/8 bg-ink-900/[0.02] p-4">
              <VerdictBadge verdict={bundle.verdict} size="md" />
              <div className="text-[12.5px]">
                <p className="text-ink-500">
                  {t("action.score")} <span className="font-mono font-bold text-ink-900">{bundle.score}</span>
                </p>
                <p className="text-ink-500">
                  {t("action.corroboration")}{" "}
                  <span className="font-mono font-bold text-ink-900">
                    {bundle.corroborationCount}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5 font-mono text-[11.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-400">{t("detail.hash")}</span>
                <span className="text-ink-700" title={bundle.bundleHash}>
                  {shortHash(bundle.bundleHash, 14)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-400">{t("detail.fingerprint")}</span>
                <span className="text-ink-700" title={bundle.analysisFingerprint}>
                  {shortHash(bundle.analysisFingerprint, 14)}
                </span>
              </div>
            </div>

            {/* Step 2 — Attest */}
            <button
              onClick={handleAttest}
              disabled={busy || walletRequired}
              className="btn-ghost flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-50"
            >
              {busy && step === "attesting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {t("detail.attest")} {walletRequired ? `· ${t("action.connectFirst")}` : `· ${session?.name}`}
            </button>

            {attestation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-brand-indigo/20 bg-brand-indigo/5 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-indigo/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-deep">
                    {t("detail.commitment")}
                  </span>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700">
                    {t("detail.pending")}
                  </span>
                </div>
                <p className="mt-2 break-all font-mono text-[12px] text-ink-900">
                  {attestation.commitment}
                </p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
                  {attestation.note}
                </p>
              </motion.div>
            )}

            {/* Step 3 — Verify */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  {t("detail.verify")}
                </span>
                <span className="text-[10.5px] text-ink-400">{t("action.tryBreak")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleVerify("none")}
                  disabled={busy}
                  className="btn-primary flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("action.verifyPristine")}
                </button>
                {TAMPER_OPTIONS.map(({ mode, labelKey, icon: Icon }) => (
                  <button
                    key={mode}
                    onClick={() => handleVerify(mode)}
                    disabled={busy}
                    className={`btn-ghost flex items-center gap-1.5 rounded-full px-3 py-2 text-[11.5px] font-bold ${
                      tamper === mode ? "ring-2 ring-verdict-malice/40" : ""
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-verdict-malice" />
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {verification && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-4 ${
                  verification.internallyConsistent
                    ? "border-emerald-600/20 bg-verdict-noiseBg"
                    : "border-verdict-malice/25 bg-verdict-maliceBg"
                }`}
              >
                <div className="flex items-center gap-2">
                  {verification.internallyConsistent ? (
                    <CheckCircle2 className="h-5 w-5 text-verdict-noise" />
                  ) : (
                    <XCircle className="h-5 w-5 text-verdict-malice" />
                  )}
                  <p
                    className={`text-[13px] font-extrabold ${
                      verification.internallyConsistent ? "text-verdict-noise" : "text-verdict-malice"
                    }`}
                  >
                    {verification.internallyConsistent
                      ? t("verify.passed")
                      : t("verify.tamperedFailed")}
                  </p>
                </div>
                {verification.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-ink-700">
                    {verification.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verdict-malice" />
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
