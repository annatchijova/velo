"use client";

import Link from "next/link";
import { ArrowRight, Lock, Scale, Eye, Moon, Cpu, BookOpenCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { HeroVisual } from "@/components/HeroVisual";
import { useWallet } from "@/lib/wallet";

export default function LandingPage() {
  const { t } = useI18n();
  const { session } = useWallet();

  const heroCtaHref = session ? "/cases" : "/login";

  const features = [
    {
      icon: Lock,
      title: t("landing.feature1.title"),
      desc: t("landing.feature1.desc"),
    },
    {
      icon: Scale,
      title: t("landing.feature2.title"),
      desc: t("landing.feature2.desc"),
    },
    {
      icon: Eye,
      title: t("landing.feature3.title"),
      desc: t("landing.feature3.desc"),
    },
  ];

  const stats = [
    { icon: Cpu, title: t("landing.stats1.title"), desc: t("landing.stats1.desc") },
    { icon: Moon, title: t("landing.stats2.title"), desc: t("landing.stats2.desc") },
    { icon: BookOpenCheck, title: t("landing.stats3.title"), desc: t("landing.stats3.desc") },
  ];

  const how = [t("landing.how1"), t("landing.how2"), t("landing.how3"), t("landing.how4")];

  return (
    <section className="mx-auto max-w-7xl px-4 pb-8 pt-8">
      {/* Hero */}
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-ink-900/8 bg-white px-2 py-1 pl-3 shadow-soft">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo/10 px-2.5 py-1 text-[11.5px] font-bold text-brand-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-indigo shadow-[0_0_0_4px_rgba(99,102,241,0.16)]" />
              {t("landing.badge")}
            </span>
          </div>

          <h1 className="animate-fade-up mt-5 font-display text-[clamp(38px,5.2vw,62px)] font-extrabold leading-[0.96] tracking-[-0.035em] text-ink-900">
            {t("landing.title1")}
            <br />
            <span className="brand-text font-bold italic">{t("landing.title2")}</span>
          </h1>

          <p className="animate-fade-up mt-5 max-w-[540px] text-[17.5px] leading-[1.62] text-ink-700">
            {t("landing.subtitle")}
          </p>

          <div className="animate-fade-up mt-6 flex flex-wrap gap-3">
            <Link
              href={heroCtaHref}
              className="btn-primary shadow-soft inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            >
              {t("landing.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="btn-ghost inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
            >
              {t("landing.ctaSecondary")}
            </a>
          </div>

          <div className="animate-fade-up mt-6 grid max-w-[540px] grid-cols-1 gap-2.5 sm:grid-cols-3">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="card-solid flex items-start gap-2.5 rounded-2xl p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-indigo/10 text-brand-deep">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-bold leading-tight text-ink-900">{s.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-[1.35] text-ink-500">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="animate-fade-up">
          <HeroVisual />
        </div>
      </div>

      {/* Features */}
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="card-solid card-hover rounded-3xl p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-indigo/10 text-brand-deep">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold tracking-tight text-ink-900">
                {f.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{f.desc}</p>
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div
        id="how"
        className="glass-subtle mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-4"
      >
        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
          {t("landing.how.title")}
        </span>
        {how.map((h, i) => (
          <span key={h} className="flex items-center gap-2.5">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${
                i === how.length - 1 ? "brand-gradient text-white" : "bg-ink-900 text-white"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-[13px] font-semibold text-ink-700">{h}</span>
            {i < how.length - 1 && <span className="ml-1 text-ink-400">→</span>}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-ink-500">
          <Lock className="h-3.5 w-3.5 text-brand-deep" />
          {t("landing.how.tag")}
        </span>
      </div>
    </section>
  );
}
