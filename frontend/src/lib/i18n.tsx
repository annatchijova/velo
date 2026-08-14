"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "es";

const dict = {
  en: {
    // Nav
    "nav.cases": "Cases",
    "nav.peritos": "Examiners",
    "nav.sealed": "Sealed ledger",
    "nav.verify": "Verify",
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
      "Synthetic cases the engine classifies across all four verdicts. 100% fictional, zero PII.",
    "cases.search": "Search by ID, name, or description",
    "cases.filter": "Verdict",
    "cases.all": "All",
    "cases.grid": "Grid",
    "cases.table": "Table",
    "cases.empty": "No matching cases",
    "cases.emptyDesc": "Try a different search or clear the verdict filter.",
    "cases.count": "cases",
    "cases.open": "Open",
    "cases.colId": "ID",
    "cases.colCase": "Case",
    "cases.colDetails": "Details",
    "cases.source": "source",
    "cases.sources": "sources",
    "cases.artifact": "artifact",
    "cases.artifacts": "artifacts",
    "field.source": "source",
    "field.process": "process",
    "field.path": "path",
    "field.entropy": "entropy",
    "field.provenance": "provenance",

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
    "detail.seal": "Seal",
    "detail.attest": "Attest",
    "detail.verify": "Verify",
    "detail.sealed": "Sealed",
    "detail.attested": "Attested",
    "detail.verified": "Verified",
    "detail.pending": "Browser signing pending",
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

    // Artifact types
    "artifactType.file": "File",
    "artifactType.process": "Process",
    "artifactType.log": "Log",
    "artifactType.network": "Network",
    "artifactType.registry": "Registry",
    "artifactType.dns_record": "DNS record",

    // Detectors
    "detector.temporal": "Temporal",
    "detector.cross_source": "Cross-source",
    "detector.anti_forensic": "Anti-forensic",
    "detector.narrative": "Narrative",
    "detector.process": "Process / path",

    // Action panel (attack simulation)
    "action.swapVerdict": "Swap verdict",
    "action.corruptFingerprint": "Corrupt fingerprint",
    "action.truncateCustody": "Truncate custody chain",
    "action.examinerWorkflow": "Examiner workflow",
    "action.walletRequired": "wallet required to attest",
    "action.connected": "connected",
    "action.runEngine": "run the deterministic engine",
    "action.connectFirst": "connect wallet first",
    "action.tryBreak": "try to break it",
    "action.attestLocalOnly": "local only",
    "action.attestHowExpert":
      "Attestation is proved and submitted from your own machine — the wallet seed, the proof server and the evidence never touch this site. From the repo root, run:",
    "action.attestHowEnv":
      "Required env: MIDNIGHT_NETWORK_ID, MIDNIGHT_STORAGE_PASSWORD, MIDNIGHT_WALLET_MNEMONIC. Add VELO_API_URL and VELO_API_KEY to link the attestation back to this deployment's ledger.",
    "action.attestHowReplay":
      "The contract's replay guard refuses a second attestation of the same analysis — re-running is safe.",
    "action.attestHowView": "Afterwards, check the result on the verification panel:",
    "action.attestHowDemo":
      "Attestation requires a registered expert wallet and the local proving CLI. Demo mode can seal and verify, but not attest.",
    "action.verifyPristine": "Verify pristine",
    "action.score": "score",
    "action.corroboration": "corroboration",
    "toast.sealingFailed": "Sealing failed",
    "toast.attestationFailed": "Attestation failed",
    "toast.verificationFailed": "Verification failed",
    "toast.sealedSuccess": "Bundle sealed locally — nothing has touched the network.",
    "toast.sealedPersisted": "Bundle sealed and persisted to the public ledger.",
    "toast.attestRequiresWallet": "Attestation requires a connected Midnight wallet.",
    "toast.commitmentComputed": "Commitment computed — the verdict is bound to the sealed fingerprint.",
    "toast.tamperDetectedPrefix": "Tamper detected",
    "toast.reasonsVerificationFailed": "reason(s) verification failed.",
    "toast.verifiedOffline": "Bundle verified offline — hashes recomputed and match.",
    "verify.passed": "Verification passed — the bundle is untampered.",
    "verify.tamperedFailed": "Tampering detected — verification failed.",

    // Hero visual (landing page)
    "hero.step1Label": "Sealed locally",
    "hero.step1Sub": "evidence never moves",
    "hero.step2Label": "Fingerprinted",
    "hero.step2Sub": "deterministic hash",
    "hero.step3Label": "Attestation",
    "hero.step3Sub": "commitment on-chain, from the expert's machine",
    "hero.step4Label": "Verified",
    "hero.step4Sub": "hashes recompute; ledger readable on-chain",
    "hero.sealedCase": "sealed case",
    "hero.chainLive": "local demo",
    "hero.commitment": "commitment",
    "hero.saltHidden": "salt hidden",

    // Peirce chain (semiotic triad)
    "peirce.firstness": "Firstness",
    "peirce.firstnessHint": "what presents itself",
    "peirce.secondness": "Secondness",
    "peirce.secondnessHint": "the resisting fact",
    "peirce.thirdness": "Thirdness",
    "peirce.thirdnessHint": "the interpreted rule",

    // Examiners (peritos)
    "peritos.attestations": "Attestations",
    "status.valid": "valid",
    "status.expired": "expired",
    "cases.loadFailed": "Failed to load cases",
    "detail.engineReproduces": "engine reproduces it",
    "detail.mismatch": "mismatch",
    "detail.custodyInvalid": "Custody chain invalid.",
    "detail.coverage": "What was not examined",
    "detail.coverageNote":
      "These sources should have been examined and were not. A negative finding is not supportable over evidence that was never available, so the engine abstains instead of reporting NOISE. This does not weaken a positive finding: an unrelated log rotating does not erase evidence of what is there.",
    "detail.coverageFull":
      "No gaps declared. The analyst is asserting that every source expected for this case was examined — which is what makes a NOISE verdict here mean \"nothing was found\" rather than \"nothing was looked at\".",
    "detail.reasoning": "Engine reasoning",
    "detail.reasoningSealed":
      "Shown verbatim, in English, in both languages: this exact sentence is hashed into the analysis fingerprint, so a translation would not be what was sealed.",
    "detail.event": "event",
    "detail.events": "events",

    // Common
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.success": "Success",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.none": "none",

    // Sealed ledger
    "sealed.title": "Sealed case ledger",
    "sealed.subtitle":
      "Every case an expert sealed and chose to persist. Public reads, no account needed — the verdict is visible, the evidence is not.",
    "sealed.all": "All",
    "sealed.empty": "No sealed cases match this filter yet.",
    "sealed.attested": "Attested on-chain",
    "sealed.pending": "Not attested yet",
    "sealed.sealedBy": "Sealed by",
    "sealed.notConfiguredTitle": "Persistence is not configured on this deployment",
    "sealed.notConfiguredBody":
      "This environment runs without a database, so seals stay in the browser (demo behavior). The ledger appears once a database adapter is configured.",
    "sealed.loadFailed": "Could not load the sealed ledger.",

    // Verify panel
    "verify.title": "Verify a sealed case",
    "verify.subtitle":
      "Query by sealed case id or by commitment. Internal consistency and custody are recomputed; the on-chain state is read from the deployed contract and labelled separately.",
    "verify.placeholder": "Sealed case id or 64-hex commitment",
    "verify.action": "Verify",
    "verify.hint": "Reads are public and require no account.",
    "verify.failed": "Verification failed. Try again.",
    "verify.notFound": "Nothing matches that id or commitment on this deployment.",
    "verify.onChain": "On-chain attestation",
    "verify.chainVerified": "Chain-verified",
    "verify.expertReported": "Expert-reported",
    "verify.status": "Status",
    "verify.attested": "Attested",
    "verify.notAttested": "Not attested",
    "verify.unavailable": "Chain status unavailable",
    "verify.ledgerVerdict": "Ledger verdict",
    "verify.commitment": "Commitment",
    "verify.chainVerifiedNote":
      "This commitment is recorded on the deployed contract's ledger with the verdict shown. The ledger proves the attestation exists and follows the rules; it does not prove the underlying analysis is correct.",
    "verify.expertReportedNote":
      "This attestation is recorded by the expert but not confirmed on-chain (or the chain is unreachable). Treat it as a claim, not a verified fact.",
    "verify.integrity": "Internal consistency & custody",
    "verify.consistent": "The bundle is internally consistent (hashes and custody chain recompute).",
    "verify.inconsistent": "The bundle failed internal consistency checks.",
    "verify.custody": "Custody chain",
    "verify.custodyValid": "valid",
    "verify.custodyInvalid": "invalid",
    "verify.sealedCase": "Sealed case",
    "verify.caseId": "Case",
    "verify.verdict": "Verdict",
    "verify.sealedBy": "Sealed by",
    "verify.sealedAt": "Sealed at",
  },
  es: {
    "nav.cases": "Casos",
    "nav.peritos": "Peritos",
    "nav.login": "Conectar",
    "nav.logout": "Desconectar",
    "nav.demo": "Modo demo",
    "nav.sealed": "Ledger de sellados",
    "nav.verify": "Verificar",

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
      "Casos sintéticos que el motor clasifica en los cuatro veredictos. 100% ficticios, cero PII.",
    "cases.search": "Buscar por ID, nombre o descripción",
    "cases.filter": "Veredicto",
    "cases.all": "Todos",
    "cases.grid": "Grilla",
    "cases.table": "Tabla",
    "cases.empty": "No hay casos coincidentes",
    "cases.emptyDesc": "Probá otra búsqueda o limpiá el filtro de veredicto.",
    "cases.count": "casos",
    "cases.open": "Abrir",
    "cases.colId": "ID",
    "cases.colCase": "Caso",
    "cases.colDetails": "Detalles",
    "cases.source": "fuente",
    "cases.sources": "fuentes",
    "cases.artifact": "artefacto",
    "cases.artifacts": "artefactos",
    "field.source": "fuente",
    "field.process": "proceso",
    "field.path": "path",
    "field.entropy": "entropía",
    "field.provenance": "proveniencia",

    "detail.back": "Volver al registro",
    "detail.evidence": "Artefactos de evidencia",
    "detail.detectors": "Detectores disparados",
    "detail.verdict": "Veredicto",
    "detail.score": "Score",
    "detail.corroboration": "Corroboración",
    "detail.devil": "Abogado del diablo",
    "detail.custody": "Cadena de custodia",
    "detail.peirce": "Cadena de Peirce",
    "detail.seal": "Sellar",
    "detail.attest": "Atestar",
    "detail.verify": "Verificar",
    "detail.sealed": "Sellado",
    "detail.attested": "Atestado",
    "detail.verified": "Verificado",
    "detail.pending": "Firma en navegador pendiente",
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

    "artifactType.file": "Archivo",
    "artifactType.process": "Proceso",
    "artifactType.log": "Log",
    "artifactType.network": "Red",
    "artifactType.registry": "Registro",
    "artifactType.dns_record": "Registro DNS",

    "detector.temporal": "Temporal",
    "detector.cross_source": "Cruce de fuentes",
    "detector.anti_forensic": "Anti-forense",
    "detector.narrative": "Narrativa",
    "detector.process": "Proceso / path",

    "action.swapVerdict": "Cambiar veredicto",
    "action.corruptFingerprint": "Corromper fingerprint",
    "action.truncateCustody": "Truncar cadena de custodia",
    "action.examinerWorkflow": "Flujo del perito",
    "action.walletRequired": "hace falta wallet para atestar",
    "action.connected": "conectado",
    "action.runEngine": "corre el motor determinista",
    "action.connectFirst": "conectá la wallet primero",
    "action.tryBreak": "intentá romperlo",
    "action.attestLocalOnly": "solo local",
    "action.attestHowExpert":
      "La atestación se prueba y se envía desde tu propia máquina — la seed de la wallet, el proof server y la evidencia nunca tocan este sitio. Desde la raíz del repo, corré:",
    "action.attestHowEnv":
      "Env requerido: MIDNIGHT_NETWORK_ID, MIDNIGHT_STORAGE_PASSWORD, MIDNIGHT_WALLET_MNEMONIC. Agregá VELO_API_URL y VELO_API_KEY para vincular la atestación al ledger de este despliegue.",
    "action.attestHowReplay":
      "El replay guard del contrato rechaza una segunda atestación del mismo análisis — re-ejecutar es seguro.",
    "action.attestHowView": "Después, verificá el resultado en el panel de verificación:",
    "action.attestHowDemo":
      "La atestación requiere una wallet de perito registrada y el CLI de proving local. El modo demo puede sellar y verificar, pero no atestar.",
    "action.verifyPristine": "Verificar sin alterar",
    "action.score": "score",
    "action.corroboration": "corroboración",
    "toast.sealingFailed": "Falló el sellado",
    "toast.attestationFailed": "Falló la atestación",
    "toast.verificationFailed": "Falló la verificación",
    "toast.sealedSuccess": "Bundle sellado localmente — nada tocó la red.",
    "toast.sealedPersisted": "Bundle sellado y persistido en el ledger público.",
    "toast.attestRequiresWallet": "Atestar requiere una wallet de Midnight conectada.",
    "toast.commitmentComputed": "Commitment calculado — el veredicto queda atado al fingerprint sellado.",
    "toast.tamperDetectedPrefix": "Alteración detectada",
    "toast.reasonsVerificationFailed": "razón(es) por las que falló la verificación.",
    "toast.verifiedOffline": "Bundle verificado offline — los hashes se recalcularon y coinciden.",
    "verify.passed": "Verificación exitosa — el bundle no fue alterado.",
    "verify.tamperedFailed": "Alteración detectada — falló la verificación.",

    "hero.step1Label": "Sellado local",
    "hero.step1Sub": "la evidencia nunca se mueve",
    "hero.step2Label": "Con fingerprint",
    "hero.step2Sub": "hash determinista",
    "hero.step3Label": "Atestación",
    "hero.step3Sub": "commitment on-chain, desde la máquina del perito",
    "hero.step4Label": "Verificado",
    "hero.step4Sub": "los hashes recomputan; ledger legible on-chain",
    "hero.sealedCase": "caso sellado",
    "hero.chainLive": "demo local",
    "hero.commitment": "commitment",
    "hero.saltHidden": "salt oculto",

    "peirce.firstness": "Primeridad",
    "peirce.firstnessHint": "lo que se presenta",
    "peirce.secondness": "Segundidad",
    "peirce.secondnessHint": "el hecho que resiste",
    "peirce.thirdness": "Terceridad",
    "peirce.thirdnessHint": "la regla interpretada",

    "peritos.attestations": "Atestaciones",
    "status.valid": "válido",
    "status.expired": "expirado",
    "cases.loadFailed": "No se pudieron cargar los casos",
    "detail.engineReproduces": "el motor lo reproduce",
    "detail.mismatch": "no coincide",
    "detail.custodyInvalid": "Cadena de custodia inválida.",
    "detail.coverage": "Qué no se examinó",
    "detail.coverageNote":
      "Estas fuentes debían examinarse y no se examinaron. Un hallazgo negativo no se sostiene sobre evidencia que nunca estuvo disponible, así que el motor se abstiene en vez de informar RUIDO. Esto no debilita un hallazgo positivo: que un log no relacionado haya rotado no borra la evidencia de lo que sí está.",
    "detail.coverageFull":
      "No se declararon huecos. El perito afirma que se examinó toda fuente esperable para este caso — que es lo que hace que acá RUIDO signifique \"no se encontró nada\" y no \"no se miró nada\".",
    "detail.reasoning": "Razonamiento del motor",
    "detail.reasoningSealed":
      "Se muestra textual, en inglés, en ambos idiomas: esta oración exacta se hashea dentro del fingerprint del análisis, así que una traducción no sería lo que se selló.",
    "detail.event": "evento",
    "detail.events": "eventos",

    "common.loading": "Cargando…",
    "common.error": "Error",
    "common.success": "Éxito",
    "common.cancel": "Cancelar",
    "common.confirm": "Confirmar",
    "common.none": "ninguno",

    // Ledger de sellados
    "sealed.title": "Ledger de casos sellados",
    "sealed.subtitle":
      "Cada caso que un perito selló y eligió persistir. Lecturas públicas, sin cuenta — el veredicto se ve, la evidencia no.",
    "sealed.all": "Todos",
    "sealed.empty": "Todavía no hay casos sellados con este filtro.",
    "sealed.attested": "Atestados on-chain",
    "sealed.pending": "Sin atestar aún",
    "sealed.sealedBy": "Sellado por",
    "sealed.notConfiguredTitle": "La persistencia no está configurada en este despliegue",
    "sealed.notConfiguredBody":
      "Este entorno corre sin base de datos, así que los sellos quedan en el navegador (comportamiento demo). El ledger aparece cuando se configure un adaptador de base de datos.",
    "sealed.loadFailed": "No se pudo cargar el ledger de sellados.",

    // Panel de verificación
    "verify.title": "Verificar un caso sellado",
    "verify.subtitle":
      "Consulta por id de caso sellado o por commitment. La consistencia interna y la custodia se recalculan; el estado on-chain se lee del contrato desplegado y se etiqueta por separado.",
    "verify.placeholder": "Id de caso sellado o commitment de 64 hex",
    "verify.action": "Verificar",
    "verify.hint": "Las lecturas son públicas y no requieren cuenta.",
    "verify.failed": "La verificación falló. Probá de nuevo.",
    "verify.notFound": "Nada coincide con ese id o commitment en este despliegue.",
    "verify.onChain": "Atestación on-chain",
    "verify.chainVerified": "Verificado en cadena",
    "verify.expertReported": "Reportado por el perito",
    "verify.status": "Estado",
    "verify.attested": "Atestado",
    "verify.notAttested": "No atestado",
    "verify.unavailable": "Estado de cadena no disponible",
    "verify.ledgerVerdict": "Veredicto en el ledger",
    "verify.commitment": "Commitment",
    "verify.chainVerifiedNote":
      "Este commitment está registrado en el ledger del contrato desplegado con el veredicto mostrado. El ledger prueba que la atestación existe y sigue las reglas; no prueba que el análisis subyacente sea correcto.",
    "verify.expertReportedNote":
      "Esta atestación fue registrada por el perito pero no está confirmada on-chain (o la cadena no es alcanzable). Tratala como una afirmación, no como un hecho verificado.",
    "verify.integrity": "Consistencia interna y custodia",
    "verify.consistent": "El bundle es internamente consistente (hashes y cadena de custodia recalculados).",
    "verify.inconsistent": "El bundle falló las verificaciones de consistencia interna.",
    "verify.custody": "Cadena de custodia",
    "verify.custodyValid": "válida",
    "verify.custodyInvalid": "inválida",
    "verify.sealedCase": "Caso sellado",
    "verify.caseId": "Caso",
    "verify.verdict": "Veredicto",
    "verify.sealedBy": "Sellado por",
    "verify.sealedAt": "Sellado el",
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

/**
 * Picks the Spanish sibling of a corpus field when the UI is in Spanish,
 * falling back to the English one.
 *
 * The synthetic corpus is bilingual in place — `name` / `name_es` on the
 * same object — rather than as a parallel set of translated files. A
 * second copy of the corpus is exactly the duplication red team F5 was
 * about, and it drifted once already.
 *
 * The fallback is deliberate: a case that has not been translated yet
 * shows English rather than an empty panel. A missing translation should
 * degrade to readable, never to blank.
 */
export function localized<T>(lang: Lang, en: T, es: T | undefined): T {
  return lang === "es" && es !== undefined ? es : en;
}
