"use client";

import { motion } from "framer-motion";
import { Lock, Fingerprint, Eye, ShieldCheck } from "lucide-react";
import { VeloLogo } from "@/components/VeloLogo";

const STEPS = [
  { icon: Lock, label: "Sealed locally", sub: "evidence never moves" },
  { icon: Fingerprint, label: "Fingerprinted", sub: "deterministic hash" },
  { icon: Eye, label: "Attested on-chain", sub: "commitment only" },
  { icon: ShieldCheck, label: "Verified", sub: "ZK proof stands" },
];

const HASHES = [
  "9f2c…a41b",
  "3bd8…c7e2",
  "e571…f09a",
  "12aa…b3d4",
];

export function HeroVisual() {
  return (
    <div className="relative">
      {/* floating background hashes */}
      {HASHES.map((h, i) => (
        <motion.span
          key={h}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0], y: [8, -18] }}
          transition={{ duration: 7 + i, repeat: Infinity, delay: i * 0.9, ease: "easeInOut" }}
          className="pointer-events-none absolute z-0 hidden font-mono text-[11px] text-brand-indigo/40 md:block"
          style={{ left: `${8 + i * 22}%`, top: `${18 + (i % 2) * 40}%` }}
        >
          {h}
        </motion.span>
      ))}

      <div className="card-solid shadow-lift relative z-10 rounded-3xl p-2">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1220] via-[#141c3a] to-[#2a1b5e] p-6">
          {/* moon */}
          <motion.div
            animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-brand-indigo/25 blur-2xl"
          />
          <div className="absolute -left-8 -bottom-10 h-36 w-36 rounded-full bg-brand-cyan/15 blur-2xl" />

          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <VeloLogo className="h-8 w-8" />
                <div>
                  <p className="text-[14px] font-extrabold tracking-tight text-white">VELO-DEMO</p>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/50">
                    sealed case
                  </p>
                </div>
              </div>
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white/90"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                chain live
              </motion.span>
            </div>

            {/* pipeline */}
            <div className="mt-7 space-y-2.5">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.18, duration: 0.5, ease: "easeOut" }}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-3.5 py-3 backdrop-blur-sm"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-cyan-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-white">{s.label}</p>
                      <p className="text-[11px] text-white/55">{s.sub}</p>
                    </div>
                    <motion.span
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4 }}
                      className="text-[10.5px] font-semibold text-cyan-300"
                    >
                      {i + 1 < STEPS.length ? "→" : "✓"}
                    </motion.span>
                  </motion.div>
                );
              })}
            </div>

            {/* commitment */}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/50">
                commitment
              </span>
              <span className="font-mono text-[11.5px] text-cyan-300">
                0x71a4…ec9f
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                salt hidden
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
