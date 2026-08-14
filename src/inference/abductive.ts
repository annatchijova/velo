/**
 * Abductive intent engine — ported verbatim from VIGIA
 * `vigia/inference/abductive_intent_engine.py` (Apache-2.0, engine logic
 * read in full; the 32 hypothesis templates across 12 phases were
 * extracted mechanically from the live module, not retyped).
 *
 * PLACEMENT (docs/PORT-FROM-VIGIA.md section 5.4): this is a HYPOTHESIS
 * GENERATOR, not a verdict producer. In VIGIA the abductive kernel sits
 * outside the verdict path; VELO replicates that boundary by
 * construction — nothing in src/engine/ or src/core/ may import this
 * module, and a regression test enforces it. Cost and coverage are
 * integers (Ockham operationalized, Daubert-friendly); a ranked
 * hypothesis INFORMS a narrative, it never moves a Verdict or a score.
 *
 * Template texts are doctrine, quoted verbatim from the VIGIA source
 * (Spanish prose included) so the two engines stay parity-testable.
 */
import { createHash } from "node:crypto";

/** VIGIA incident-response phases (vigia/tools/visible_variables.py IRPhase). */
export type IRPhase =
  | "reconnaissance"
  | "initial_access"
  | "execution"
  | "persistence"
  | "privilege_escalation"
  | "defense_evasion"
  | "credential_access"
  | "discovery"
  | "lateral_movement"
  | "collection"
  | "exfiltration"
  | "command_and_control"
  | "impact"
  | "cleanup"
  | "unknown";

export interface AbductiveHypothesis {
  hypothesisId: string;
  intentType: string;
  phase: IRPhase;
  requiredArtifacts: string[];
  assumedArtifacts: string[];
  explanation: string;
  whatWouldFalsify: string;
  supportingRules: string[];
}

export interface ScoredHypothesis extends AbductiveHypothesis {
  /** Ockham cost, INTEGER: missing required + explicit assumptions. Lower is better. */
  cost: number;
  /** Integer 0-100: floor((observed required * 100) / total required); 100 when nothing is required. */
  coverageScore: number;
}

export interface AbductiveResult {
  winner: ScoredHypothesis;
  alternatives: ScoredHypothesis[];
  ockhamRationale: string;
  /**
   * SHA-256 over the same sorted-keys JSON the Python engine hashes
   * (byte-for-byte: Python json.dumps separators), so the two engines
   * produce identical hashes for identical inputs — parity-tested.
   */
  resultHash: string;
}

/**
 * Hypothesis templates, extracted verbatim from VIGIA HYPOTHESIS_TEMPLATES.
 * Doctrine lives here: edits are doctrine changes, not refactors.
 */
export const HYPOTHESIS_TEMPLATES: Readonly<Partial<Record<IRPhase, readonly AbductiveHypothesis[]>>> = Object.freeze({
  "defense_evasion": [
    {
      hypothesisId: "H_DE_001",
      intentType: "log_fabrication",
      phase: "defense_evasion",
      requiredArtifacts: ["timestamp_uniformity", "process_memory_contradiction", "log_gap_intervals"],
      assumedArtifacts: [],
      explanation: "Atacante fabricó logs para simular actividad normal. Los intervalos son demasiado uniformes (naturaleza no es así) y ningún proceso en memoria los genera.",
      whatWouldFalsify: "Esta hipótesis es falsa si encontramos el proceso que genera los logs y sus timestamps tienen variabilidad natural (desviación estándar > 0.1s entre eventos).",
      supportingRules: ["RULE_DE_001: Uniformidad temporal en logs de sistema = artificial", "RULE_DE_002: Proceso ausente en memoria = origen no-legítimo"],
    },
    {
      hypothesisId: "H_DE_002",
      intentType: "log_deletion_after_exfil",
      phase: "defense_evasion",
      requiredArtifacts: ["log_deletion", "event_log_clearing"],
      assumedArtifacts: ["exfiltration_occurred", "attacker_wants_stealth"],
      explanation: "Atacante borró logs DESPUÉS de exfiltrar datos. La eliminación es post-hoc, no preventiva.",
      whatWouldFalsify: "Falsa si no hay evidencia de transferencia de datos (network flows, data volume anomaly) en las 24h previas.",
      supportingRules: ["RULE_DE_003: Log deletion + data transfer previo = cover-up post-exfil"],
    },
    {
      hypothesisId: "H_DE_003",
      intentType: "anti_forensics_preparation",
      phase: "defense_evasion",
      requiredArtifacts: ["artifact_overwrite", "file_timestamp_modification"],
      assumedArtifacts: ["attacker_has_advanced_tools", "attacker_expects_investigation"],
      explanation: "Atacante preparó anti-forensics ANTES de actuar. Manipuló timestamps y sobrescribió artefactos conocidos. Requiere conocimiento de herramientas forenses.",
      whatWouldFalsify: "Falsa si las herramientas de anti-forensics no están presentes en el sistema (no hay binarios de CCleaner, BCWipe, etc.)",
      supportingRules: ["RULE_DE_004: Timestamp manipulation = anti-forensics avanzado"],
    },
  ],
  "persistence": [
    {
      hypothesisId: "H_PE_001",
      intentType: "single_persistence",
      phase: "persistence",
      requiredArtifacts: ["registry_modifications"],
      assumedArtifacts: [],
      explanation: "Atacante instaló un único mecanismo de persistencia vía registry. Mínima huella, máxima simplicidad.",
      whatWouldFalsify: "Falsa si no hay modificaciones de registry en los últimos 7 días o si las modificaciones son de software legítimo (firma válida).",
      supportingRules: ["RULE_PE_001: Registry Run key = persistencia básica"],
    },
    {
      hypothesisId: "H_PE_002",
      intentType: "multi_mechanism_persistence",
      phase: "persistence",
      requiredArtifacts: ["registry_modifications", "scheduled_task_creation", "service_installation"],
      assumedArtifacts: [],
      explanation: "Atacante instaló múltiples mecanismos de persistencia (registry + scheduled task + service). Redundancia sin supuestos extra — todo está en los datos.",
      whatWouldFalsify: "Falsa si los 3 artefactos no fueron creados por el mismo proceso/parent PID en una ventana temporal coherente (< 1 hora).",
      supportingRules: ["RULE_PE_002: Múltiples persistencias con mismo origen = intencionalidad"],
    },
    {
      hypothesisId: "H_PE_003",
      intentType: "redundant_persistence",
      phase: "persistence",
      requiredArtifacts: ["registry_modifications", "scheduled_task_creation", "service_installation"],
      assumedArtifacts: ["attacker_expects_detection", "attacker_wants_high_availability"],
      explanation: "Atacante instaló múltiples mecanismos de persistencia. Solo se explica si anticipa que algunos serán detectados/eliminados. Requiere suponer intención defensiva del atacante.",
      whatWouldFalsify: "Falsa si el sistema es un sandbox/entorno de prueba donde la redundancia es configuración normal del admin.",
      supportingRules: ["RULE_PE_003: >2 persistencias = expectativa de detección"],
    },
  ],
  "lateral_movement": [
    {
      hypothesisId: "H_LM_001",
      intentType: "pass_the_hash",
      phase: "lateral_movement",
      requiredArtifacts: ["lateral_movement_auth", "ticket_usage_from_different_ip"],
      assumedArtifacts: [],
      explanation: "Atacante reutilizó hash de credencial para moverse lateralmente. Autenticación válida desde IP no asociada al usuario.",
      whatWouldFalsify: "Falsa si el usuario tiene registro de VPN/rotación de IP legítima en el período.",
      supportingRules: ["RULE_LM_001: Auth desde IP nueva + ticket reutilizado = PtH"],
    },
  ],
  "exfiltration": [
    {
      hypothesisId: "H_XF_001",
      intentType: "bulk_data_exfiltration",
      phase: "exfiltration",
      requiredArtifacts: ["outbound_data_transfer", "data_volume"],
      assumedArtifacts: [],
      explanation: "Atacante exfiltró volumen masivo de datos. Máxima cobertura, mínimos supuestos.",
      whatWouldFalsify: "Falsa si la transferencia es backup automatizado con política de retención documentada.",
      supportingRules: ["RULE_XF_001: Volumen + outbound = exfiltración intencional"],
    },
  ],
  "reconnaissance": [
    {
      hypothesisId: "H_RE_001",
      intentType: "targeted_reconnaissance",
      phase: "reconnaissance",
      requiredArtifacts: ["port_scans", "dns_enumeration", "http_crawling"],
      assumedArtifacts: [],
      explanation: "Atacante realizó reconocimiento activo del objetivo: escaneo de puertos, enumeración DNS, y crawling HTTP. Todo es observable en los logs de red. Indica intención de compromiso planificado, no oportunista.",
      whatWouldFalsify: "Falsa si las consultas provienen de un motor de búsqueda legítimo (Googlebot, Bingbot) o si el escaneo es de un auditor interno.",
      supportingRules: ["RULE_RE_001: Port scan + DNS enum + HTTP crawl = reconocimiento activo", "RULE_RE_002: Patrón secuencial (puertos 80→443→8080) = no es aleatorio"],
    },
    {
      hypothesisId: "H_RE_002",
      intentType: "osint_gathering",
      phase: "reconnaissance",
      requiredArtifacts: ["whois_queries", "social_media_osint"],
      assumedArtifacts: ["attacker_knows_employee_names"],
      explanation: "Atacante recolectó inteligencia de fuentes abiertas (OSINT): WHOIS para infraestructura, social media para nombres/cargos.",
      whatWouldFalsify: "Falsa si las queries WHOIS provienen de un registrar legítimo en proceso de transferencia de dominio.",
      supportingRules: ["RULE_RE_003: WHOIS + social media = OSINT direccionado"],
    },
    {
      hypothesisId: "H_RE_003",
      intentType: "opportunistic_scanning",
      phase: "reconnaissance",
      requiredArtifacts: ["port_scans"],
      assumedArtifacts: ["attacker_is_shodan_bot", "no_specific_target"],
      explanation: "Atacante realizó escaneo masivo no direccionado. Solo port_scan observable. Consistente con Shodan o botnet masivo.",
      whatWouldFalsify: "Falsa si el escaneo es parte de un penetration test contratado y documentado.",
      supportingRules: ["RULE_RE_004: Solo port scan masivo = no hay intención específica"],
    },
  ],
  "initial_access": [
    {
      hypothesisId: "H_IA_001",
      intentType: "spearphishing_execution",
      phase: "initial_access",
      requiredArtifacts: ["phishing_email_delivered", "malicious_attachment_executed"],
      assumedArtifacts: [],
      explanation: "Atacante obtuvo acceso inicial vía spearphishing: email malicioso entregado, adjunto ejecutado por la víctima.",
      whatWouldFalsify: "Falsa si el email tiene SPF/DKIM/DMARC válidos y el adjunto está firmado por la organización.",
      supportingRules: ["RULE_IA_001: Phishing + ejecución de adjunto = acceso inicial clásico"],
    },
    {
      hypothesisId: "H_IA_002",
      intentType: "exploitation_public_facing",
      phase: "initial_access",
      requiredArtifacts: ["exploitation_public_facing_app", "shell_established"],
      assumedArtifacts: [],
      explanation: "Atacante explotó una aplicación expuesta a internet (web server, VPN gateway, RDP) para establecer shell.",
      whatWouldFalsify: "Falsa si la conexión proviene de un pentester autorizado o si el 'exploit' es un health check automatizado.",
      supportingRules: ["RULE_IA_003: Exploit + shell sin credenciales = vulnerabilidad pública"],
    },
    {
      hypothesisId: "H_IA_003",
      intentType: "supply_chain_compromise",
      phase: "initial_access",
      requiredArtifacts: ["hardware_additions"],
      assumedArtifacts: ["attacker_has_physical_access", "compromised_vendor"],
      explanation: "Atacante introdujo hardware malicioso a través de la cadena de suministro. Requiere suponer acceso físico o relación de confianza con vendor.",
      whatWouldFalsify: "Falsa si el hardware es IT asset management autorizado y la variante de firmware es estándar corporativa.",
      supportingRules: ["RULE_IA_004: Hardware no autorizado + sin registro = supply chain"],
    },
  ],
  "execution": [
    {
      hypothesisId: "H_EX_001",
      intentType: "command_line_abuse",
      phase: "execution",
      requiredArtifacts: ["command_line_execution", "script_execution"],
      assumedArtifacts: [],
      explanation: "Atacante ejecutó comandos y scripts directamente en el sistema. Patrón clásico post-exploitation: cmd.exe, PowerShell, bash.",
      whatWouldFalsify: "Falsa si los comandos son de un admin legítimo durante sesión de mantenimiento documentada.",
      supportingRules: ["RULE_EX_001: Cmd + script + no parent legítimo = ejecución atacante"],
    },
    {
      hypothesisId: "H_EX_002",
      intentType: "scheduled_task_abuse",
      phase: "execution",
      requiredArtifacts: ["scheduled_task_execution", "service_execution"],
      assumedArtifacts: [],
      explanation: "Atacante abusó de mecanismos legítimos: scheduled task o service para ejecutar payload sin interacción humana.",
      whatWouldFalsify: "Falsa si el scheduled task fue creado por GPO corporativa y el binario está firmado por la organización.",
      supportingRules: ["RULE_EX_002: Task/Service + binario no firmado = abuso"],
    },
    {
      hypothesisId: "H_EX_003",
      intentType: "powershell_living_off_the_land",
      phase: "execution",
      requiredArtifacts: ["powershell_abuse", "encoded_commands"],
      assumedArtifacts: ["attacker_avoids_disk_touch"],
      explanation: "Atacante usó PowerShell con comandos codificados (base64, -enc) para ejecutar sin escribir a disco. Técnica LOTL.",
      whatWouldFalsify: "Falsa si el PowerShell es un script de administración legítimo que usa encoding por legibilidad.",
      supportingRules: ["RULE_EX_003: PowerShell -enc + sin script en disco = LOTL"],
    },
  ],
  "privilege_escalation": [
    {
      hypothesisId: "H_PE_004",
      intentType: "token_impersonation",
      phase: "privilege_escalation",
      requiredArtifacts: ["token_impersonation", "process_injection"],
      assumedArtifacts: [],
      explanation: "Atacante escaló privilegios vía robo de token de proceso privilegiado seguido de inyección en proceso legítimo.",
      whatWouldFalsify: "Falsa si el proceso que recibe la inyección es un debugger legítimo o una herramienta de EDR con firma válida.",
      supportingRules: ["RULE_PV_001: Token steal + injection = privesc sin exploit"],
    },
    {
      hypothesisId: "H_PE_005",
      intentType: "exploit_vulnerability",
      phase: "privilege_escalation",
      requiredArtifacts: ["exploit_vulnerability", "kernel_mode_execution"],
      assumedArtifacts: [],
      explanation: "Atacante explotó una vulnerabilidad de escalada local para ejecutar en modo kernel.",
      whatWouldFalsify: "Falsa si el driver vulnerable es un hotfix desplegado por IT y el 'exploit' es un test de regresión.",
      supportingRules: ["RULE_PV_002: Kernel execution = exploit de LPE"],
    },
    {
      hypothesisId: "H_PE_006",
      intentType: "kerberoasting",
      phase: "privilege_escalation",
      requiredArtifacts: ["kerberoasting_indicators", "ticket_granting_service_request"],
      assumedArtifacts: ["attacker_has_domain_access"],
      explanation: "Atacante solicitó tickets de servicio Kerberos para cuentas con SPN y los crackeó offline.",
      whatWouldFalsify: "Falsa si las solicitudes TGS provienen de un script de auditoría de contraseñas de servicio.",
      supportingRules: ["RULE_PV_003: TGS request + SPN + cracking = Kerberoasting"],
    },
  ],
  "credential_access": [
    {
      hypothesisId: "H_CA_001",
      intentType: "credential_dumping",
      phase: "credential_access",
      requiredArtifacts: ["credential_dumping", "lsass_access"],
      assumedArtifacts: [],
      explanation: "Atacante accedió a LSASS para extraer hashes de credenciales. Técnica estándar: Mimikatz, Procdump.",
      whatWouldFalsify: "Falsa si LSASS fue accedido por un EDR legítimo con política documentada.",
      supportingRules: ["RULE_CA_001: LSASS access + dump = credential extraction"],
    },
    {
      hypothesisId: "H_CA_002",
      intentType: "brute_force",
      phase: "credential_access",
      requiredArtifacts: ["brute_force_attempts", "failed_logon_spike"],
      assumedArtifacts: [],
      explanation: "Atacante intentó adivinar credenciales vía fuerza bruta: múltiples intentos fallidos en ventana corta.",
      whatWouldFalsify: "Falsa si son intentos fallidos de un usuario que olvidó contraseña, sin patrón de diccionario.",
      supportingRules: ["RULE_CA_002: Failed logon spike + diccionario = brute force"],
    },
    {
      hypothesisId: "H_CA_003",
      intentType: "keylogger_deployment",
      phase: "credential_access",
      requiredArtifacts: ["keylogger_activity", "input_capture_indicators"],
      assumedArtifacts: ["attacker_wants_long_term_cred_theft"],
      explanation: "Atacante desplegó keylogger para capturar credenciales en tiempo real. Requiere suponer intención de robo continuo.",
      whatWouldFalsify: "Falsa si es una herramienta de RPA o software de asistencia remota autorizado con logging para debugging.",
      supportingRules: ["RULE_CA_003: Keylogger + no RPA policy = cred theft"],
    },
  ],
  "command_and_control": [
    {
      hypothesisId: "H_C2_001",
      intentType: "domain_fronting_beacon",
      phase: "command_and_control",
      requiredArtifacts: ["beaconing_pattern", "domain_fronting_indicators"],
      assumedArtifacts: [],
      explanation: "Atacante estableció comunicación C2 vía domain fronting: tráfico aparentemente legítimo a CDN que comunica con servidor atacante.",
      whatWouldFalsify: "Falsa si el tráfico es de una aplicación empresarial legítima que usa el mismo CDN.",
      supportingRules: ["RULE_C2_001: CDN traffic + SNI mismatch = domain fronting", "RULE_C2_002: Intervalo regular = beacon"],
    },
    {
      hypothesisId: "H_C2_002",
      intentType: "dns_tunnel_c2",
      phase: "command_and_control",
      requiredArtifacts: ["dns_c2_queries", "domain_generation_algorithm"],
      assumedArtifacts: [],
      explanation: "Atacante usa DNS como canal C2: queries TXT/A con payload codificado, o DGA para evadir blacklists.",
      whatWouldFalsify: "Falsa si las queries DNS son de un software de actualización que usa TXT records para verificación.",
      supportingRules: ["RULE_C2_003: TXT queries + DGA = DNS tunnel"],
    },
    {
      hypothesisId: "H_C2_003",
      intentType: "dead_drop_resolver",
      phase: "command_and_control",
      requiredArtifacts: ["dead_drop_resolver", "social_media_c2"],
      assumedArtifacts: ["attacker_reads_public_platforms"],
      explanation: "Atacante usa plataformas públicas (Twitter, GitHub) como C2: publica instrucciones ofuscadas, el malware las lee periódicamente.",
      whatWouldFalsify: "Falsa si las conexiones son de un usuario legítimo y el payload es un documento público.",
      supportingRules: ["RULE_C2_004: GitHub/Twitter + patrones = dead drop"],
    },
  ],
  "collection": [
    {
      hypothesisId: "H_CO_001",
      intentType: "data_staging_for_exfil",
      phase: "collection",
      requiredArtifacts: ["data_staging_directory", "archive_collection"],
      assumedArtifacts: [],
      explanation: "Atacante está recolectando y preparando datos para exfiltración: archivos copiados a staging, comprimidos. Fase previa a exfiltración.",
      whatWouldFalsify: "Falsa si es un backup automatizado de la organización y el archivo es .bak programado por IT.",
      supportingRules: ["RULE_CO_001: Staging + archive = preparación exfil"],
    },
    {
      hypothesisId: "H_CO_002",
      intentType: "clipboard_and_screen_capture",
      phase: "collection",
      requiredArtifacts: ["clipboard_collection", "screen_capture"],
      assumedArtifacts: [],
      explanation: "Atacante recolecta información de sesiones activas: capturas de pantalla para documentos, clipboard para credenciales.",
      whatWouldFalsify: "Falsa si es software de monitoring de empleados (DLP) con política de consentimiento.",
      supportingRules: ["RULE_CO_002: Screen cap + clipboard = espionaje activo"],
    },
    {
      hypothesisId: "H_CO_003",
      intentType: "audio_and_video_surveillance",
      phase: "collection",
      requiredArtifacts: ["audio_capture"],
      assumedArtifacts: ["attacker_wants_conversations", "long_term_eavesdropping"],
      explanation: "Atacante activó micrófono para capturar conversaciones. Indica APT sofisticado con intención de espionaje verbal.",
      whatWouldFalsify: "Falsa si es una app de videoconferencia legítima (Teams, Zoom) con indicador de grabación visible.",
      supportingRules: ["RULE_CO_003: Mic access + sin app de conferencia = espionaje"],
    },
  ],
  "impact": [
    {
      hypothesisId: "H_IM_001",
      intentType: "ransomware_deployment",
      phase: "impact",
      requiredArtifacts: ["ransomware_note", "file_encryption_indicators"],
      assumedArtifacts: [],
      explanation: "Atacante desplegó ransomware: nota de rescate visible, archivos cifrados, mensaje de pago. Intención financiera explícita.",
      whatWouldFalsify: "Falsa si el 'ransomware note' es mensaje de IT sobre política de cifrado corporativo (BitLocker).",
      supportingRules: ["RULE_IM_001: Ransom note + files renamed = ransomware"],
    },
    {
      hypothesisId: "H_IM_002",
      intentType: "wiper_destruction",
      phase: "impact",
      requiredArtifacts: ["data_destruction", "disk_wipe_activity"],
      assumedArtifacts: [],
      explanation: "Atacante destruyó datos intencionalmente sin pedir rescate: sobrescritura de sectores, destrucción de backups. Sabotaje.",
      whatWouldFalsify: "Falsa si es resultado de un disk cleanup tool mal configurado, o un secure erase autorizado.",
      supportingRules: ["RULE_IM_002: Destrucción + no rescate = sabotaje"],
    },
    {
      hypothesisId: "H_IM_003",
      intentType: "defacement_and_humiliation",
      phase: "impact",
      requiredArtifacts: ["defacement_indicator", "service_stop"],
      assumedArtifacts: ["attacker_wants_publicity"],
      explanation: "Atacante modificó sitios web para enviar mensaje político/ideológico. Intención de publicidad (hacktivismo).",
      whatWouldFalsify: "Falsa si es un rediseño autorizado o error de deployment de CMS verificable en pipeline CI/CD.",
      supportingRules: ["RULE_IM_003: Defacement + mensaje = hacktivismo"],
    },
  ],
});

/** Mirrors VIGIA _score_hypothesis: integer arithmetic only, exact-string matching. */
function scoreHypothesis(template: AbductiveHypothesis, observedNames: ReadonlySet<string>): ScoredHypothesis {
  const observedRequired = template.requiredArtifacts.filter((req) => observedNames.has(req));
  const missingRequired = template.requiredArtifacts.filter((req) => !observedNames.has(req));

  const totalRequired = template.requiredArtifacts.length;
  const coverageScore = totalRequired > 0 ? Math.floor((observedRequired.length * 100) / totalRequired) : 100;
  const cost = missingRequired.length + template.assumedArtifacts.length;

  return {
    ...template,
    requiredArtifacts: [...template.requiredArtifacts],
    assumedArtifacts: [...missingRequired, ...template.assumedArtifacts],
    cost,
    coverageScore,
    supportingRules: [
      ...template.supportingRules,
      `OBSERVED: ${observedRequired.length}/${totalRequired}`,
      `MISSING: ${missingRequired.length}`,
      `EXPLICIT_ASSUMPTIONS: ${template.assumedArtifacts.length}`,
    ],
  };
}

/** Mirrors VIGIA _build_ockham_rationale, text kept verbatim. */
function buildOckhamRationale(winner: ScoredHypothesis, runnersUp: ScoredHypothesis[]): string {
  let rationale =
    `GANADORA: ${winner.hypothesisId}\n` +
    `  Costo Ockham: ${winner.cost} supuestos\n` +
    `  Cobertura: ${winner.coverageScore}% de datos requeridos\n` +
    `  Explicación: ${winner.explanation}\n\n`;
  if (runnersUp.length > 0) {
    rationale += "DESCARTADAS:\n";
    for (const runner of runnersUp.slice(0, 3)) {
      const extraCost = runner.cost - winner.cost;
      rationale += `  ${runner.hypothesisId}: costo=${runner.cost} (+${extraCost} supuestos extra), cobertura=${runner.coverageScore}%\n`;
    }
  }
  return rationale;
}

/**
 * Byte-identical reproduction of Python's
 * `json.dumps({"winner":..,"cost":..,"coverage":..,"phase":..}, sort_keys=True)`
 * for this flat, escape-free dict (default separators: ", " and ": ").
 */
function pythonSortedJson(cost: number, coverage: number, phase: string, winner: string): string {
  return `{"cost": ${cost}, "coverage": ${coverage}, "phase": "${phase}", "winner": "${winner}"}`;
}

function emptyResult(phase: IRPhase): AbductiveResult {
  return {
    winner: {
      hypothesisId: "NO_HYPOTHESIS",
      intentType: "unknown",
      phase,
      requiredArtifacts: [],
      assumedArtifacts: [],
      cost: 999,
      coverageScore: 0,
      explanation: "No hay templates definidos para esta fase.",
      whatWouldFalsify: "N/A — no hay hipótesis que falsificar.",
      supportingRules: [],
    },
    alternatives: [],
    ockhamRationale: `No hay templates de hipótesis para ${phase}.`,
    resultHash: "",
  };
}

/**
 * Mirrors VIGIA infer_habit: score every candidate for the phase, sort by
 * (cost asc, coverage desc, required-count asc) — the sort is stable in
 * both engines, so template order breaks any remaining ties identically —
 * and return the winner with up to four runners-up in the rationale.
 *
 * INFORM-ONLY: the result ranks explanations for a narrative or report.
 * It carries no authority over any sealed value.
 */
export function inferIntent(observedArtifactNames: readonly string[], phase: IRPhase): AbductiveResult {
  const candidates = HYPOTHESIS_TEMPLATES[phase] ?? [];
  if (candidates.length === 0) return emptyResult(phase);

  const observedNames = new Set(observedArtifactNames);
  const scored = candidates.map((t) => scoreHypothesis(t, observedNames));
  scored.sort((a, b) => a.cost - b.cost || b.coverageScore - a.coverageScore || a.requiredArtifacts.length - b.requiredArtifacts.length);

  const winner = scored[0]!;
  const rationale = buildOckhamRationale(winner, scored.length > 1 ? scored.slice(1, 5) : []);
  const resultHash = createHash("sha256")
    .update(pythonSortedJson(winner.cost, winner.coverageScore, phase, winner.hypothesisId), "utf8")
    .digest("hex");

  return { winner, alternatives: scored.slice(1), ockhamRationale: rationale, resultHash };
}
