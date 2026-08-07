import {
  FileText,
  Cpu,
  ScrollText,
  Wifi,
  Database,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { Artifact, ArtifactType } from "@/lib/types";
import { shortHash, formatDate } from "@/lib/utils";
import { useI18n, localized } from "@/lib/i18n";

const TYPE_ICON: Record<ArtifactType, LucideIcon> = {
  file: FileText,
  process: Cpu,
  log: ScrollText,
  network: Wifi,
  registry: Database,
  dns_record: Globe,
};

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  const { t, lang } = useI18n();
  return (
    <div className="space-y-3">
      {artifacts.map((a) => {
        const Icon = TYPE_ICON[a.type];
        return (
          <div key={a.id} className="card-solid rounded-2xl p-4 transition hover:border-brand-indigo/20">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-indigo/10 text-brand-indigo">
                <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-ink-900">{a.id}</span>
                  <span className="rounded-full bg-ink-900/5 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-500">
                    {t(`artifactType.${a.type}`)}
                  </span>
                  <span className="text-[11.5px] text-ink-400">{formatDate(a.timestamp)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{localized(lang, a.description, a.description_es)}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-500">
                  <span className="truncate">
                    <span className="font-semibold text-ink-400">{t("field.source")}</span> {a.source}
                  </span>
                  <span className="truncate">
                    <span className="font-semibold text-ink-400">{t("field.process")}</span> {a.process}
                  </span>
                  <span className="truncate font-mono" title={a.path}>
                    <span className="font-sans font-semibold text-ink-400">{t("field.path")}</span> {a.path}
                  </span>
                  <span>
                    <span className="font-semibold text-ink-400">{t("field.entropy")}</span>{" "}
                    <span className="font-mono">{(a.entropyMilliBits / 1000).toFixed(2)}</span> bits/B
                  </span>
                </div>
                {a.markers.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {a.markers.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-tier-malice/20 bg-verdict-maliceBg px-2 py-0.5 font-mono text-[10.5px] font-semibold text-verdict-malice"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-semibold text-ink-400">{t("field.provenance")}</span>
                  {a.provenanceChain.map((h) => (
                    <span key={h} className="rounded bg-ink-900/5 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-500" title={h}>
                      {shortHash(h, 8)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
