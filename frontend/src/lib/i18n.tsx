"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "es";

const dict = {
  en: {
    // Nav
    "nav.cases": "Cases",
    "nav.peritos": "Examiners",
    "nav.login": "Connect",
    "nav.logout": "Disconnect",
    "nav.demo": "Demo mode",

    // Landing
    "landing.badge": "Midnight · Zero-knowledge",
    "landing.title1": "The verdict is visible.",
    "landing.title2": "The victim is not.",
    "landing.subtitle":
      "VELO seals forensic evidence locally, proves it with zero-knowledge on Midnight, and publishes only the verdict — never the raw evidence.",
    "landing.cta": "Enter the case ledger",
    "landing.ctaSecondary": "How it works",
    "landing.feature1.title": "Sealed locally",
    "landing.feature1.desc": "Evidence never leaves the expert's machine. Only the commitment and the verdict travel.",
    "landing.feature2.title": "Daubert gate as circuit",
    "landing.feature2.desc": "MALICE requires ≥2 independent sources — enforced as a ZK constraint, not a promise.",
    "landing.feature3.title": "Verdict visible, victim not",
    "landing.feature3.desc": "The court sees the verdict and the proof. The raw evidence stays sealed and private.",
    "landing.how.title": "How it works",
    "landing.how1": "Analyze locally",
    "landing.how2": "Seal the bundle",
    "landing.how3": "Attest on Midnight",
    "landing.how4": "Verify independently",
    "landing.how.tag": "Audited · Sealed · ZK-proven",
    "landing.stats1.title": "Deterministic",
    "landing.stats1.desc": "Same evidence → same fingerprint, forever",
    "landing.stats2.title": "Air-gapped in spirit",
    "landing.stats2.desc": "Engine runs on the expert's machine",
    "landing.stats3.title": "Dual ledger",
    "landing.stats3.desc": "Verdict public, witness private",

    // Login
    "login.title": "Examiner access",
    "login.subtitle": "The public ledger is open. Connect a wallet to attest cases.",
    "login.lace": "Connect Lace",
    "login.1am": "Connect 1AM",
    "login.demo": "Continue as anonymous examiner",
    "login.demo.desc": "View and seal cases locally. Attest requires a wallet.",
    "login.or": "or",
    "login.installing": "Install wallet",
    "login.connected": "Connected",
    "login.address": "Address",

    // Cases
    "cases.title": "Case ledger",
    "cases.subtitle":
      "Ten synthetic cases the engine classifies across all four verdicts. 100% fictional, zero PII.",
    "cases.search": "Search by ID, name, or description",
    "cases.filter": "Verdict",
    "cases.all": "All",
    "cases.grid": "Grid",
    "cases.table": "Table",
    "cases.empty": "No matching cases",
    "cases.emptyDesc": "Try a different search or clear the verdict filter.",
    "cases.count": "cases",
    "cases.open": "Open",

    // Case detail
    "detail.back": "Back to ledger",
    "detail.evidence": "Evidence artifacts",
    "detail.detectors": "Detectors fired",
    "detail.verdict": "Verdict",
    "detail.score": "Score",
    "detail.corroboration": "Corroboration",
    "detail.devil": "Devil's advocate",
    "detail.custody": "Custody chain",
    "detail.peirce": "Peirce chain",
    "peirce.firstness": "Firstness",
    "peirce.firstness.hint": "what presents itself",
    "peirce.secondness": "Secondness",
    "peirce.secondness.hint": "the resisting fact",
    "peirce.thirdness": "Thirdness",
    "peirce.thirdness.hint": "the interpreted rule",
    "hero.badge": "local demo",
    "hero.sealed": "Sealed locally",
    "hero.sealed.sub": "evidence never moves",
    "hero.fingerprinted": "Fingerprinted",
    "hero.fingerprinted.sub": "deterministic hash",
    "hero.attest": "Attestation",
    "hero.attest.sub": "commitment only — not deployed yet",
    "hero.verified": "Verified locally",
    "hero.verified.sub": "hashes recompute; on-chain proof pending",
    "detail.seal": "Seal",
    "detail.attest": "Attest",
    "detail.verify": "Verify",
    "detail.sealed": "Sealed",
    "detail.attested": "Attested",
    "detail.verified": "Verified",
    "detail.pending": "Contract pending",
    "detail.local": "Local proof",
    "detail.hash": "Bundle hash",
    "detail.fingerprint": "Analysis fingerprint",
    "detail.commitment": "Commitment",
    "detail.demoQuote": "Demo quote",
    "detail.expected": "Expected verdict",
    "detail.engine": "Engine verdict",

    // Verdicts
    "verdict.MALICE": "Malice",
    "verdict.SUSPICION": "Suspicion",
    "verdict.NOISE": "Noise",
    "verdict.ABSTAIN": "Abstain",

    // Common
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.success": "Success",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
  },
  es: {
    "nav.cases": "Casos",
    "nav.peritos": "Peritos",
    "nav.login": "Conectar",
    "nav.logout": "Desconectar",
    "nav.demo": "Modo demo",

    "landing.badge": "Midnight · Conocimiento cero",
    "landing.title1": "El veredicto se ve.",
    "landing.title2": "La víctima no.",
    "landing.subtitle":
      "VELO sella evidencia forense localmente, la prueba con conocimiento cero en Midnight, y publica solo el veredicto — nunca la evidencia cruda.",
    "landing.cta": "Entrar al registro de casos",
    "landing.ctaSecondary": "Cómo funciona",
    "landing.feature1.title": "Sellado local",
    "landing.feature1.desc": "La evidencia nunca sale de la máquina del perito. Solo viajan el commitment y el veredicto.",
    "landing.feature2.title": "Gate Daubert como circuito",
    "landing.feature2.desc": "MALICE requiere ≥2 fuentes independientes — forzado como restricción ZK, no como promesa.",
    "landing.feature3.title": "Veredicto visible, víctima no",
    "landing.feature3.desc": "El tribunal ve el veredicto y la prueba. La evidencia cruda queda sellada y privada.",
    "landing.how.title": "Cómo funciona",
    "landing.how1": "Analizar localmente",
    "landing.how2": "Sellar el bundle",
    "landing.how3": "Atestar en Midnight",
    "landing.how4": "Verificar independientemente",
    "landing.how.tag": "Auditado · Sellado · ZK-probado",
    "landing.stats1.title": "Determinista",
    "landing.stats1.desc": "Misma evidencia → mismo fingerprint, para siempre",
    "landing.stats2.title": "Air-gapped en espíritu",
    "landing.stats2.desc": "El motor corre en la máquina del perito",
    "landing.stats3.title": "Dual ledger",
    "landing.stats3.desc": "Veredicto público, witness privado",

    "login.title": "Acceso de perito",
    "login.subtitle": "El ledger público está abierto. Conectá una wallet para atestar casos.",
    "login.lace": "Conectar Lace",
    "login.1am": "Conectar 1AM",
    "login.demo": "Continuar como examinador anónimo",
    "login.demo.desc": "Ver y sellar casos localmente. Atestar requiere wallet.",
    "login.or": "o",
    "login.installing": "Instalar wallet",
    "login.connected": "Conectado",
    "login.address": "Dirección",

    "cases.title": "Registro de casos",
    "cases.subtitle":
      "Diez casos sintéticos que el motor clasifica en los cuatro veredictos. 100% ficticios, cero PII.",
    "cases.search": "Buscar por ID, nombre o descripción",
    "cases.filter": "Veredicto",
    "cases.all": "Todos",
    "cases.grid": "Grilla",
    "cases.table": "Tabla",
    "cases.empty": "No hay casos coincidentes",
    "cases.emptyDesc": "Probá otra búsqueda o limpiá el filtro de veredicto.",
    "cases.count": "casos",
    "cases.open": "Abrir",

    "detail.back": "Volver al registro",
    "detail.evidence": "Artefactos de evidencia",
    "detail.detectors": "Detectores disparados",
    "detail.verdict": "Veredicto",
    "detail.score": "Score",
    "detail.corroboration": "Corroboración",
    "detail.devil": "Abogado del diablo",
    "detail.custody": "Cadena de custodia",
    "detail.peirce": "Cadena de Peirce",
    "peirce.firstness": "Primeridad",
    "peirce.firstness.hint": "lo que se presenta",
    "peirce.secondness": "Segundidad",
    "peirce.secondness.hint": "el hecho que resiste",
    "peirce.thirdness": "Terceridad",
    "peirce.thirdness.hint": "la regla interpretada",
    "hero.badge": "demo local",
    "hero.sealed": "Sellado localmente",
    "hero.sealed.sub": "la evidencia nunca se mueve",
    "hero.fingerprinted": "Con huella",
    "hero.fingerprinted.sub": "hash determinista",
    "hero.attest": "Atestación",
    "hero.attest.sub": "solo el commitment — todavía sin desplegar",
    "hero.verified": "Verificado localmente",
    "hero.verified.sub": "los hashes recomputan; prueba on-chain pendiente",
    "detail.seal": "Sellar",
    "detail.attest": "Atestar",
    "detail.verify": "Verificar",
    "detail.sealed": "Sellado",
    "detail.attested": "Atestado",
    "detail.verified": "Verificado",
    "detail.pending": "Contrato pendiente",
    "detail.local": "Prueba local",
    "detail.hash": "Bundle hash",
    "detail.fingerprint": "Analysis fingerprint",
    "detail.commitment": "Commitment",
    "detail.demoQuote": "Cita demo",
    "detail.expected": "Veredicto esperado",
    "detail.engine": "Veredicto del motor",

    "verdict.MALICE": "Malicia",
    "verdict.SUSPICION": "Sospecha",
    "verdict.NOISE": "Ruido",
    "verdict.ABSTAIN": "Abstención",

    "common.loading": "Cargando…",
    "common.error": "Error",
    "common.success": "Éxito",
    "common.cancel": "Cancelar",
    "common.confirm": "Confirmar",
  },
} as const;

type Dict = typeof dict.en;
type Key = keyof Dict;

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("velo-lang") as Lang | null;
    if (stored === "en" || stored === "es") {
      setLangState(stored);
    }
  }, []);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("velo-lang", newLang);
  };

  const t = (key: Key): string => dict[lang][key] ?? dict.en[key] ?? key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
