"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, BadgeCheck, BadgeX, Clock, Fingerprint, ShieldCheck } from "lucide-react";
import type { PeritoFile } from "@/lib/types";
import { fetchPeritos, fetchCases } from "@/lib/api";
import type { CaseFile } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { shortHash } from "@/lib/utils";

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string; icon: typeof BadgeCheck }> = {
  VALID: { color: "#047857", bg: "#ECFDF5", label: "Valid", icon: BadgeCheck },
  EXPIRED: { color: "#B45309", bg: "#FFFBEB", label: "Expired", icon: Clock },
  REVOKED: { color: "#BE123C", bg: "#FFF1F3", label: "Revoked", icon: BadgeX },
};

function isActiveAtAttestation(perito: PeritoFile, caseId: string): boolean {
  return perito.credential_status_at_attestation[caseId] === "VALID";
}

export default function PeritosPage() {
  const { t } = useI18n();
  const [peritos, setPeritos] = useState<PeritoFile[] | null>(null);
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPeritos(), fetchCases().catch(() => [])])
      .then(([p, c]) => {
        setPeritos(p);
        setCases(c);
      })
      .catch((e) => setError(e.message));
  }, []);

  const attestedCount = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of peritos ?? []) {
      for (const cid of p.cases_attested) {
        map.set(cid, [...(map.get(cid) ?? []), p.public_alias]);
      }
    }
    return map;
  }, [peritos]);

  const unclaimed = useMemo(
    () => cases.filter((c) => !attestedCount.has(c.case_id)),
    [cases, attestedCount],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 pt-7">
      <div className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
        Layer 6 · Anonymous credential
      </div>
      <h1 className="mt-3 font-display text-[34px] font-extrabold tracking-[-0.03em] text-ink-900">
        {t("nav.peritos")}
      </h1>
      <p className="mt-2 max-w-[640px] text-[14.5px] leading-relaxed text-ink-500">
        Synthetic accreditation profiles exercising the anonymous-credential design: the circuit
        proves Merkle membership and credential validity at the exact attestation time — without
        revealing which examiner attested.
      </p>

      {error && (
        <div className="mt-6 rounded-2xl border border-verdict-malice/20 bg-verdict-maliceBg p-6 text-[13.5px] font-semibold text-verdict-malice">
          {error}
        </div>
      )}

      {!peritos && !error && (
        <div className="mt-8 flex items-center gap-2 py-16 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {peritos?.map((p) => (
          <div key={p.perito_id} className="card-solid card-hover flex flex-col rounded-3xl p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-900 font-display text-[15px] font-extrabold text-white">
                  {p.public_alias.slice(-2)}
                </span>
                <div>
                  <p className="font-mono text-[12px] font-bold text-ink-400">{p.perito_id}</p>
                  <p className="text-[14px] font-extrabold text-ink-900">{p.public_alias}</p>
                </div>
              </div>
              <span className="rounded-full bg-ink-900/5 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-500">
                {p.jurisdiction_model}
              </span>
            </div>

            <p className="mt-3 text-[12.5px] text-ink-500">
              {p.specialty} · {p.years_active} yrs · {p.continuing_education_hours_last_cycle}h CE
            </p>

            <div className="mt-3 flex items-center gap-2 text-[11.5px]">
              <Fingerprint className="h-3.5 w-3.5 text-brand-indigo" />
              <span className="font-semibold text-ink-400">credential</span>
              <span className="font-mono text-ink-700">{p.credential_id_synthetic}</span>
            </div>

            {p.credential_periods && p.credential_periods.length > 0 && (
              <div className="mt-3 space-y-1.5 rounded-2xl bg-amber-500/5 p-3">
                {p.credential_periods.map((per, i) => (
                  <div key={i} className="text-[11px] leading-snug text-ink-600">
                    <span className="font-bold text-ink-800">
                      {per.valid_from.slice(0, 10)} → {per.valid_until.slice(0, 10)}
                    </span>
                    {per.reason && <p className="mt-0.5 italic text-ink-500">{per.reason}</p>}
                  </div>
                ))}
                <p className="text-[10.5px] font-semibold text-amber-700">
                  Gap between periods — vigencia must fail in the hole even though membership holds.
                </p>
              </div>
            )}

            <div className="mt-4 border-t border-ink-900/5 pt-3">
              <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-400">
                {t("peritos.attestations")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.cases_attested.length === 0 && (
                  <span className="text-[12px] italic text-ink-400">{t("common.none")}</span>
                )}
                {p.cases_attested.map((cid) => {
                  const st = STATUS_STYLE[p.credential_status_at_attestation[cid] ?? "VALID"];
                  const Icon = st.icon;
                  return (
                    <Link
                      key={cid}
                      href={`/cases/${cid}`}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-bold"
                      style={{ background: st.bg, color: st.color }}
                    >
                      <Icon className="h-3 w-3" />
                      {cid}
                      <span className="opacity-70">· {isActiveAtAttestation(p, cid) ? t("status.valid") : t("status.expired")}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Unclaimed queue */}
      {unclaimed.length > 0 && (
        <div className="card-solid mt-6 rounded-3xl border-dashed p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ink-400" />
            <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-ink-700">
              Unclaimed cases — attested by no examiner
            </h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {unclaimed.map((c) => (
              <Link
                key={c.case_id}
                href={`/cases/${c.case_id}`}
                className="rounded-full border border-dashed border-ink-900/20 bg-ink-900/[0.02] px-3 py-1.5 font-mono text-[12px] font-bold text-ink-500 transition hover:border-brand-indigo/40 hover:text-ink-900"
              >
                {c.case_id} · {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Adversarial spotlight */}
      <div className="mt-6 rounded-3xl border border-brand-indigo/15 bg-brand-indigo/5 p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-brand-deep">
          Adversarial design note
        </p>
        <p className="mt-2 max-w-[760px] text-[13px] leading-relaxed text-ink-700">
          VELO-PERITO-005 belongs to the accredited Merkle tree (membership always passes) but
          has a genuine validity gap between 2026-02-01 and 2026-06-01. Attesting VELO-006 during
          that gap must fail on validity, not membership — the same fail-closed shape as
          VELO-004&apos;s abstention on a broken custody chain. VELO-005 is attested by two
          examiners (VELO-PERITO-003 and 004) — the blind second opinion, where each attests the
          same case_commitment independently without seeing the other&apos;s analysis.
        </p>
      </div>
    </section>
  );
}
