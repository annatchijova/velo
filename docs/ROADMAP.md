# Roadmap

## English

**Hackathon scope (net-new code only, written during the event).** The
deterministic engine and local sealing (layers 1-2), the Compact contract
enforcing the corroboration rule as a circuit constraint (layer 3), a local
frontend and MCP interface exercising seal / attest / verify end-to-end (layer
4), and tests covering thresholds, the corroboration gate, determinism, and
basic adversarial cases (layer 5). Selective disclosure, the anonymous expert
credential, and the blind second-opinion extension are scoped in only as time
allows, and are documented honestly as partial or unimplemented rather than
presented as finished.

**Beyond the hackathon (net-new restriction no longer applies):**

- Replace the event's mini-engine with a production-grade forensic engine
  validated against a large case corpus, piloted against real referrals.
- Run an independent adversarial audit against VELO itself before any real use.
- Selective disclosure with threshold secret-sharing (K-of-N) instead of a
  single grant/deny, and a real accreditation credential with fail-closed
  revocation.
- A multi-expert attestation network, and outside investment conversations once
  the product has real users.
- A judge/reviewer verification panel, an independently published offline
  verifier, and a demonstrated bit-for-bit determinism proof, ahead of any
  mainnet deployment.

## Español

**Alcance del hackathon (solo código net-new, escrito durante el evento).** El
motor determinista y el sellado local (capas 1-2), el contrato Compact que
aplica la regla de corroboración como restricción del circuito (capa 3), un
frontend local e interfaz MCP que ejercitan sellar / atestar / verificar de
punta a punta (capa 4), y tests que cubren umbrales, el gate de corroboración,
determinismo y casos adversariales básicos (capa 5). La divulgación selectiva,
la credencial anónima del perito y la extensión de segunda opinión ciega entran
solo si el tiempo alcanza, y se documentan honestamente como parciales o no
implementadas en vez de presentarse como terminadas.

**Después del hackathon (ya no rige la restricción net-new):**

- Reemplazar el mini-motor del evento por un motor forense de nivel productivo,
  validado contra un corpus de casos grande, con piloto sobre oficios reales.
- Correr una auditoría adversarial independiente sobre VELO mismo antes de
  cualquier uso real.
- Divulgación selectiva con reparto de secreto por umbral (K-de-N) en vez de un
  simple aprobar/rechazar, y una credencial de acreditación real con revocación
  fail-closed.
- Una red de atestación multi-perito, y conversaciones de inversión externa una
  vez que el producto tenga usuarios reales.
- Un panel de verificación para jueces/revisores, un verificador offline
  publicado de forma independiente, y una prueba demostrada de determinismo bit
  a bit, antes de cualquier despliegue en mainnet.
