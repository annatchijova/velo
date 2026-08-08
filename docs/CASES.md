# Demo Cases

Fourteen synthetic cases the engine is designed to classify, spanning all four
verdicts. Each is fictional, contains no PII, and exists to exercise a specific
detector or gate.

## English

| # | Case | Verdict | What it exercises |
|---|---|---|---|
| 1 | Confession preceded by a scheduled task created before the "mistake" it confesses to | `MALICE` | Temporal gate — effect cannot precede cause |
| 2 | 50 login failures at suspiciously exact 2000ms intervals, no corroborating process or connection | `SUSPICION` | Anomalous-regularity detector, single source, no corroboration |
| 3 | A real credential-theft attack with cyrillic strings planted on top, too clean for the attack's skill level | `MALICE` | Anti-forensic / false-flag detector |
| 4 | A file hash matches known malware, but there is no extraction record, no examiner signature, no custody chain | `ABSTAIN` | Provenance requirement — a strong signal without chain of custody is inadmissible either way |
| 5 | Four independent sources (memory, network, disk, hardware root of trust) converge on the same compromise | `MALICE` | Corroboration gate satisfied with margin |
| 6 | A 2KB file securely wiped with a 7-pass overwrite — effort wildly disproportionate to the file's apparent size | `MALICE` | Disproportionate-destruction detector |
| 7 | A legitimately signed system binary running from the wrong path, wrong parent process, talking to a suspicious IP | `MALICE` | Context-vs-signature mismatch — a valid signature does not clear anomalous behavior |
| 8 | A one-line commit labeled "cleanup" that silently disables authentication-failure alerts | `MALICE` | Minimal-surface, maximal-impact detector |
| 9 | A "non-technical" support ticket whose attached screenshot shows a kernel exploit mid-execution, with no corroborating process trace | `SUSPICION` | Staged-evidence detector, single source |
| 10 | An ordinary morning of routine activity | `NOISE` | Negative case — no detector should fire |
| 11 | A badge opens a datacenter door while the same credential logs in over VPN 900 km away, five seconds later | `SUSPICION` | Cross-source contradiction — physically impossible, but one contradiction from one source |
| 12 | A DLP log records 4,200 files copied to a removable device the night before a resignation; the device registry shows nothing was ever connected | `SUSPICION` | Log vs. device registry — one of the two is lying, and nothing says which |
| 13 | An unsigned PDF appears in the evidence intake folder accusing a named employee, with no submitter and no acquisition record | `ABSTAIN` | Provenance requirement, again — a serious claim with no traceable origin is not evidence yet |
| 14 | Same clean artifacts as case 10, same valid custody, same score of zero — but the proxy log rotated before anyone asked for it and the second machine was never imaged | `ABSTAIN` | **Absence of evidence is not evidence of absence.** Declared coverage gaps degrade a *negative* finding |

**The rule underlying all fourteen:** `MALICE` requires a high score *and* at least
two independent sources; `SUSPICION` is a strong signal without corroboration;
`ABSTAIN` is evidence that cannot be admitted regardless of what it seems to
show; `NOISE` is normal activity — the engine does not manufacture threats.

---

## Español

| # | Caso | Veredicto | Qué ejercita |
|---|---|---|---|
| 1 | Una confesión precedida por una tarea programada creada antes del "error" que confiesa | `MALICE` | Gate temporal — el efecto no puede preceder a la causa |
| 2 | 50 fallos de login a intervalos sospechosamente exactos de 2000ms, sin proceso ni conexión que lo corrobore | `SUSPICION` | Detector de regularidad anómala, una sola fuente, sin corroboración |
| 3 | Un ataque real de robo de credenciales con strings en cirílico plantados encima, demasiado prolijos para el nivel técnico del ataque | `MALICE` | Detector de bandera falsa / anti-forense |
| 4 | Un hash de archivo coincide con malware conocido, pero no hay registro de extracción, ni firma del perito, ni cadena de custodia | `ABSTAIN` | Requisito de proveniencia — una señal fuerte sin cadena de custodia es inadmisible en cualquier sentido |
| 5 | Cuatro fuentes independientes (memoria, red, disco, raíz de confianza de hardware) convergen en el mismo compromiso | `MALICE` | Gate de corroboración cumplido con margen |
| 6 | Un archivo de 2KB borrado de forma segura con 7 pasadas de sobreescritura — esfuerzo absurdamente desproporcionado para su tamaño aparente | `MALICE` | Detector de destrucción desproporcionada |
| 7 | Un binario del sistema firmado legítimamente, corriendo desde la ruta equivocada, con el proceso padre equivocado, hablando con una IP sospechosa | `MALICE` | Discordancia contexto-vs-firma — una firma válida no limpia el comportamiento anómalo |
| 8 | Un commit de una línea etiquetado "limpieza" que silenciosamente desactiva las alertas de fallo de autenticación | `MALICE` | Detector de superficie mínima, impacto máximo |
| 9 | Un ticket de soporte "no técnico" cuya captura adjunta muestra un exploit de kernel en ejecución, sin rastro de proceso que lo corrobore | `SUSPICION` | Detector de evidencia escenificada, una sola fuente |
| 10 | Una mañana normal de actividad de rutina | `NOISE` | Caso negativo — ningún detector debería dispararse |
| 11 | Una credencial abre la puerta del datacenter mientras la misma identidad inicia sesión por VPN a 900 km, cinco segundos después | `SUSPICION` | Contradicción entre fuentes — físicamente imposible, pero es una sola contradicción de una sola fuente |
| 12 | Un log de DLP registra 4.200 archivos copiados a un dispositivo extraíble la noche previa a una renuncia; el registro de dispositivos dice que nunca se conectó ninguno | `SUSPICION` | Log contra registro de dispositivos — uno de los dos miente, y nada dice cuál |
| 13 | Aparece un PDF sin firmar en la carpeta de ingreso acusando a un empleado, sin remitente ni registro de adquisición | `ABSTAIN` | Requisito de proveniencia, otra vez — una afirmación grave sin origen rastreable todavía no es evidencia |
| 14 | Los mismos artefactos limpios que el caso 10, la misma custodia válida, el mismo score cero — pero el log del proxy rotó antes de que alguien lo pidiera y la segunda máquina nunca se imagenó | `ABSTAIN` | **La ausencia de evidencia no es evidencia de ausencia.** Los huecos de cobertura declarados degradan un hallazgo *negativo* |

**La regla detrás de los catorce:** `MALICE` exige un score alto *y* al menos dos
fuentes independientes; `SUSPICION` es una señal fuerte sin corroboración;
`ABSTAIN` es evidencia que no se puede admitir sin importar lo que parezca
mostrar; `NOISE` es actividad normal — el motor no inventa amenazas.
