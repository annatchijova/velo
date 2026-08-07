# VELO — Casos explicados / Cases Explained

Este documento existe en dos idiomas: los archivos `.json` de `cases/` y
`peritos-syntetic/` están en inglés, pero esta explicación narrativa se
mantiene bilingüe para que se pueda entender el corpus sin depender de la
traducción literal de cada campo.

This document exists in two languages: the `.json` files in `cases/` and
`peritos-syntetic/` are in English, but this narrative explanation stays
bilingual so the corpus can be understood without relying on a literal
translation of every field.

---

## Español

### Caso 1 — El Sacrificio del Peón
Veredicto: MALICE

**¿Qué pasó?**
Un analista senior manda un mail urgente a todos diciendo "cometí un error
grave, dejé una sesión SSH abierta 4 horas, por favor revoquen mis accesos".
Suena como alguien muy honesto que se auto-denuncia.

**¿Qué detecta VELO?**
Pero VELO encuentra que 5 minutos ANTES de ese mail alguien creó una tarea
programada (un cron job) en la máquina. Y durante la "auditoría benigna"
que se hizo por su confesión, un proceso con nombre de sistema empezó a
mandar 2.3 GB por HTTPS a una IP rara.

**¿Por qué es MALICE?**
La confesión no puede ser la causa de un cron job que existía antes de la
confesión. Es como si alguien gritara "¡me robaron!" pero la caja fuerte se
había abierto antes de que empezara el supuesto robo. La confesión ES la
distracción. La premeditación es irrefutable.

**Analogía fintech:**
Es un exchange que anuncia públicamente "tuvimos un bug menor" mientras
por detrás un cron job ya había empezado a mover fondos a una cold wallet
externa.

---

### Caso 2 — La Subasta de Logs Uniformes
Veredicto: SUSPICION

**¿Qué pasó?**
Aparecen 50 entradas de log de fallos de login, una cada 2.000 segundos,
con precisión de milésima. Un sistema simple dice: "50 intentos fallidos =
ataque de fuerza bruta".

**¿Qué detecta VELO?**
VELO mira la memoria y no encuentra ningún programa de fuerza bruta
corriendo, ni ninguna conexión de red que explique esos intentos. Los
logs son demasiado perfectos: los humanos y los ataques reales tienen
varianza, no intervalos exactos de 2.000s.

**¿Por qué es SUSPICION y no MALICE?**
Hay una señal fuerte (los logs), pero solo UNA fuente. No hay corroboración
independiente. VELO no eleva a MALICE si no hay al menos dos fuentes.

**Analogía fintech:**
Una cuenta muestra 50 órdenes de venta idénticas separadas exactamente 2
segundos. Parece manipulación, pero si no hay registro de quién las emitió
ni desde dónde, no podés cerrar la posición. Tenés sospecha, no prueba.

---

### Caso 3 — El Falso Flag
Veredicto: MALICE

**¿Qué pasó?**
Hay un ataque real confirmado: alguien inyectó código en un proceso de
Windows y robó credenciales de memoria (LSASS). Pero encima del ataque,
encontraron strings en cirílico que apuntan a un actor ruso.

**¿Qué detecta VELO?**
Los strings cirílicos están demasiado limpios, demasiado perfectos,
inconsistentes con el nivel técnico del ataque. Es como si un ladrón
profesional dejara su tarjeta de identificación en la escena del crimen.

**¿Por qué es MALICE?**
El ataque es real, pero la atribución es plantada. La malicia no es rusa;
la malicia es de quien plantó la bandera falsa para desviar la investigación.

**Analogía fintech:**
Una wallet hace un drain real de fondos, pero deja metadatos que apuntan a
un exchange conocido. Si los metadatos son demasiado obvios y no cuadran
con la técnica del ataque, es probable que alguien quiera incriminar al
exchange.

---

### Caso 4 — La Cadena Rota
Veredicto: ABSTAIN

**¿Qué pasó?**
Se encuentra un archivo cuyo hash coincide con malware conocido: 47 de 70
motores de antivirus lo detectan. Suena como evidencia de peso.

**¿Qué detecta VELO?**
Pero no hay registro de quién lo extrajo, no hay firma del perito, no hay
foto del disco original, no hay cadena de custodia. Es como encontrar un
arma del crimen en la calle sin saber de dónde salió.

**¿Por qué es ABSTAIN?**
Sin provenance, la evidencia es inadmisible. VELO no se deja seducir por el
hash. Bajo la regla Daubert, si no podés probar que no fue plantada, no
entrás.

**Analogía fintech:**
Alguien presenta una transacción de 10 millones como prueba de fraude, pero
no puede decir de qué bloque salió, qué wallet la firmó ni cuándo fue
minada. Es solo un número en pantalla.

---

### Caso 5 — La Convergencia de Cuatro Fuentes
Veredicto: MALICE

**¿Qué pasó?**
Una máquina está comprometida, pero la evidencia viene de cuatro lugares
independientes:
1. Memoria: hay inyección de código en lsass.exe.
2. Red: hay un beacon DNS cada 5 minutos a un dominio malicioso.
3. Disco: hay una DLL maliciosa haciéndose pasar por Windows Defender.
4. TPM (chip de hardware): confirma que el arranque fue limpio, así que el
   ataque no fue antes de encender la máquina.

**¿Por qué es MALICE?**
Tres fuentes independientes (memoria, red, disco) apuntan al mismo
compromiso y el motor las corrobora directamente. La cuarta, el TPM,
confirma que el arranque fue limpio — descarta que el ataque haya sido
anterior al encendido — pero el conjunto de detectores actual no tiene
una categoría para "atestación de hardware", así que esa cuarta señal
queda como contexto que refuerza el caso sin sumar al conteo numérico
del motor. No pueden haber sido fabricadas juntas: es el caso estrella
de corroboración de todos modos.

**Analogía fintech:**
Para mover fondos de una custodia institucional se requieren 3 de 4 firmas.
Acá tenés 3 firmas independientes que dicen lo mismo, más una cuarta
verificación de integridad de hardware que hoy el sistema no cuenta como
firma pero sí usa para descartar una hipótesis rival.

---

### Caso 6 — El Vacío Quirúrgico
Veredicto: MALICE

**¿Qué pasó?**
Encontraron que un archivo de 2KB en /tmp fue borrado con "shred" usando
7 pasadas de sobreescritura más zeroing. Es el método militar para borrar
discos.

**¿Qué detecta VELO?**
La asimetría entre el tamaño del archivo (2KB, un texto corto) y el esfuerzo
para destruirlo no tiene sentido legítimo. Nadie pasa 7 veces un borrador.

**¿Por qué es MALICE?**
El esfuerzo de destrucción revela el valor de lo que se quiso ocultar.

**Analogía fintech:**
Alguien paga 50.000 dólares en comisiones para mover 100 dólares entre
wallets. La operación en sí no importa; el esfuerzo desproporcionado delata
que está lavando algo.

---

### Caso 7 — El Ventrílocuo
Veredicto: MALICE

**¿Qué pasó?**
Un proceso llamado svchost.exe está corriendo. Tiene hash válido y firma
digital de Microsoft. Suena legítimo. Pero está ejecutándose desde
C:\Users\Public\Downloads, su proceso padre es cmd.exe, y mantiene conexión
persistente a una IP rara.

**¿Qué detecta VELO?**
El binario es real, pero el contexto es falso. Es como un ladrón que usa
un uniforme de policía original: el uniforme es auténtico, pero está en el
lugar equivocado, con la actitud equivocada y pidiendo cosas que no
corresponden.

**¿Por qué es MALICE?**
La firma digital válida no limpia el comportamiento anómalo.

**Analogía fintech:**
Una API key legítima de una institución grande hace transferencias desde
una IP en un país donde no opera y a una cuenta nunca antes usada. La key
es real, pero el contexto delata el abuso.

---

### Caso 8 — La Mise en Place Alterada
Veredicto: MALICE

**¿Qué pasó?**
Un commit en el repositorio dice "limpiando logs redundantes". Es un cambio
de una sola línea en deploy.sh: redirige los errores de autenticación a
/dev/null y agrega "|| true", que hace que el script siga como si nada aunque
la autenticación falle.

**¿Qué detecta VELO?**
La superficie es mínima e inocente, pero el impacto es catastrófico: todo
fallo de autenticación queda silenciado. Después del deploy hay 47 fallos de
login que no generaron ninguna alerta.

**¿Por qué es MALICE?**
Un cambio mínimo con impacto máximo en seguridad, disfrazado de limpieza.

**Analogía fintech:**
Alguien propone "cambiar un comentario" en el smart contract de una
custodia, pero en realidad modifica una línea que hace que las firmas
requeridas pasen de 3 a 0 en cierto caso límite.

---

### Caso 9 — El Cebo del Falso Layman
Veredicto: SUSPICION

**¿Qué pasó?**
Un usuario de administración manda ticket de soporte diciendo "no sé qué
toqué, pantalla negra con letras verdes, no entro al Excel". La captura que
adjunta muestra un exploit de kernel (dirty pipe) ejecutándose al 45%.

**¿Qué detecta VELO?**
Un usuario "no técnico" no puede llegar accidentalmente a ejecutar un
exploit de kernel. Pero VELO revisa la memoria y no encuentra el proceso,
ni el historial de comandos, ni la descarga del exploit. Solo hay la
captura.

**¿Por qué es SUSPICION y no MALICE?**
Es una señal muy fuerte de teatro forense, pero una sola fuente. Hace falta
una segunda corroboración para MALICE.

**Analogía fintech:**
Alguien publica una captura de pantalla mostrando una transacción sospechosa
en un exchange, pero no hay registro en la blockchain, no hay hash, no hay
firma. Puede ser verdad o puede ser un montaje.

---

### Caso 10 — Día Normal de Oficina
Veredicto: NOISE

**¿Qué pasó?**
Una mañana común: se abre una planilla, se navega a documentación técnica,
se escriben logs normales del sistema. Nada extraño.

**¿Qué detecta VELO?**
Ningún detector dispara. No hay inconsistencias temporales, no hay
anti-forense, no hay anomalías de ruta o proceso.

**¿Por qué es NOISE?**
No hay evidencia de malicia ni de sospecha. VELO no inventa amenazas.

**Analogía fintech:**
Un día sin alertas de fraude, sin movimientos inusuales, sin órdenes
anómalas. Todo en rango normal.

---

### Caso 11 — Las Dos Credenciales
Veredicto: SUSPICION

**¿Qué pasó?**
Un lector de acceso físico registra que la credencial de un empleado abre
la puerta del datacenter en el Edificio A a las 14:00:00. Cinco segundos
después, el log de VPN muestra esa misma credencial iniciando sesión desde
una IP residencial a 900km de distancia.

**¿Qué detecta VELO?**
Nadie puede estar físicamente en un lugar y conectarse por VPN desde otro a
900km en cinco segundos. La contradicción es real y la detecta el motor
(red vs. estado del host) — pero es una sola señal, de una sola fuente
(el log de acceso físico es contexto, no un segundo detector disparado).

**¿Por qué es SUSPICION y no MALICE?**
Es exactamente la misma regla que el Caso 2: una contradicción fuerte no
alcanza sola. El gate de corroboración de Daubert exige al menos dos
fuentes independientes antes de comprometerse con MALICE, y acá solo hay
una.

**Por qué importa para el frontend:**
Este caso, junto con el Caso 12, se usa para probar que un perito ve el
detalle completo solo de los casos que él mismo atestiguó
(`cases_attested`); de los casos de otros peritos, solo ve el veredicto,
nunca los artefactos ni la identidad de quién los atestiguó.

---

### Caso 12 — La Renuncia Silenciosa
Veredicto: SUSPICION

**¿Qué pasó?**
El agente DLP de una notebook registra la copia de 4.200 archivos a un
dispositivo removible la noche anterior a que el empleado anuncie su
renuncia. Pero el registro de dispositivos USB del mismo equipo no muestra
ninguna conexión en esa ventana.

**¿Qué detecta VELO?**
Dos fuentes se contradicen: el log DLP dice que hubo una copia masiva, el
registro de dispositivos dice que no hubo dispositivo conectado.

**¿Por qué es SUSPICION y no MALICE?**
Es una contradicción fuerte entre dos logs del mismo equipo, pero no hay
una tercera fuente independiente que determine cuál de los dos miente.
VELO no eleva a MALICE con una sola contradicción sin resolver.

**Por qué importa para el frontend:**
Este caso es atestiguado por un perito distinto al del Caso 11
(`VELO-PERITO-006`). Sirve para probar, desde el otro lado, que ese perito
ve completo VELO-012 pero solo el veredicto de VELO-011 — y viceversa para
`VELO-PERITO-001`.

---

### Caso 13 — El Envío Anónimo
Veredicto: ABSTAIN

**¿Qué pasó?**
Aparece un PDF en la carpeta de evidencia compartida acusando a un
empleado de exfiltración. No hay quién lo subió, no hay registro de carga,
no hay cadena de custodia.

**¿Qué detecta VELO?**
Es el mismo patrón que el Caso 4: una afirmación grave sin ningún origen
verificable.

**¿Por qué es ABSTAIN?**
Sin cadena de custodia no hay nada que evaluar. VELO se abstiene, no
importa cuán grave sea la acusación.

**Por qué importa para el frontend:**
Este caso no fue atestiguado por ningún perito, a propósito. Sirve para
probar que un caso sin atestación no aparece en el "mis casos" de nadie —
solo existiría en una cola pública de casos pendientes, sin veredicto
visible.

---

### Resumen de veredictos

- **MALICE**: casos 1, 3, 5, 6, 7, 8
- **SUSPICION**: casos 2, 9, 11, 12
- **ABSTAIN**: casos 4, 13
- **NOISE**: caso 10

**La regla de oro:**
- MALICE necesita score alto Y al menos 2 fuentes independientes.
- SUSPICION es señal fuerte pero sin corroboración.
- ABSTAIN es evidencia que no se puede admitir.
- NOISE es actividad normal.

---

## English

### Case 1 — The Pawn Sacrifice
Verdict: MALICE

**What happened?**
A senior analyst sends an urgent mail to everyone saying "I made a
serious mistake, I left an SSH session open for 4 hours, please revoke my
access." It sounds like someone very honest self-reporting.

**What does VELO detect?**
But VELO finds that 5 minutes BEFORE that mail, someone created a
scheduled task (a cron job) on the machine. And during the "benign audit"
triggered by the confession, a process with a system name started
sending 2.3 GB over HTTPS to a strange IP.

**Why is it MALICE?**
The confession cannot be the cause of a cron job that existed before the
confession. It's as if someone screamed "I got robbed!" but the safe had
already been opened before the supposed robbery began. The confession IS
the distraction. The premeditation is irrefutable.

**Fintech analogy:**
It's an exchange that publicly announces "we had a minor bug" while
behind the scenes a cron job had already started moving funds to an
external cold wallet.

---

### Case 2 — The Uniform Log Auction
Verdict: SUSPICION

**What happened?**
Fifty login-failure log entries appear, one every 2,000 seconds, with
millisecond precision. A naive system says: "50 failed attempts =
brute-force attack."

**What does VELO detect?**
VELO checks memory and finds no brute-force tool running, and no network
connection that explains those attempts. The logs are too perfect: humans
and real attacks have variance, not exact 2,000s intervals.

**Why SUSPICION and not MALICE?**
There's a strong signal (the logs), but only ONE source. There's no
independent corroboration. VELO doesn't escalate to MALICE without at
least two sources.

**Fintech analogy:**
An account shows 50 identical sell orders exactly 2 seconds apart. It
looks like manipulation, but if there's no record of who issued them or
from where, you can't close the position. You have suspicion, not proof.

---

### Case 3 — The False Flag
Verdict: MALICE

**What happened?**
There's a confirmed real attack: someone injected code into a Windows
process and stole credentials from memory (LSASS). But on top of the
attack, they found Cyrillic strings pointing to a Russian actor.

**What does VELO detect?**
The Cyrillic strings are too clean, too perfect, inconsistent with the
attack's technical level. It's as if a professional thief left their ID
card at the crime scene.

**Why is it MALICE?**
The attack is real, but the attribution is planted. The malice isn't
Russian; the malice belongs to whoever planted the false flag to divert
the investigation.

**Fintech analogy:**
A wallet suffers a real drain of funds, but leaves metadata pointing to a
known exchange. If the metadata is too obvious and doesn't match the
attack's technique, someone is likely trying to incriminate the exchange.

---

### Case 4 — The Broken Chain
Verdict: ABSTAIN

**What happened?**
A file is found whose hash matches known malware: 47 of 70 antivirus
engines detect it. It sounds like strong evidence.

**What does VELO detect?**
But there's no record of who extracted it, no examiner signature, no
image of the original disk, no chain of custody. It's like finding a
murder weapon on the street with no idea where it came from.

**Why is it ABSTAIN?**
Without provenance, the evidence is inadmissible. VELO doesn't get
seduced by the hash. Under the Daubert rule, if you can't prove it wasn't
planted, it doesn't get in.

**Fintech analogy:**
Someone presents a 10-million transaction as proof of fraud, but can't
say which block it came from, which wallet signed it, or when it was
mined. It's just a number on a screen.

---

### Case 5 — The Four-Source Convergence
Verdict: MALICE

**What happened?**
A machine is compromised, but the evidence comes from four independent
places:
1. Memory: code injection in lsass.exe.
2. Network: a DNS beacon every 5 minutes to a malicious domain.
3. Disk: a malicious DLL posing as Windows Defender.
4. TPM (hardware chip): confirms the boot was clean, so the attack wasn't
   before the machine was powered on.

**Why is it MALICE?**
Three independent sources (memory, network, disk) point to the same
compromise, and the engine corroborates them directly. The fourth, the
TPM, confirms the boot was clean — ruling out the attack predating power-on
— but the current detector suite has no category for "hardware
attestation," so that fourth signal stays as context that strengthens the
case without adding to the engine's numeric count. They still cannot have
been fabricated together: it's the flagship corroboration case regardless.

**Fintech analogy:**
Moving funds from an institutional custody setup requires 3 of 4
signatures. Here you have 3 independent signatures saying the same thing,
plus a fourth hardware-integrity check that the system doesn't count as a
signature today but does use to rule out a rival explanation.

---

### Case 6 — The Surgical Void
Verdict: MALICE

**What happened?**
They found that a 2KB file in /tmp was deleted with "shred" using 7
overwrite passes plus zeroing. It's the military-grade method for wiping
disks.

**What does VELO detect?**
The asymmetry between the file's size (2KB, a short text) and the effort
to destroy it has no legitimate explanation. Nobody wipes a text file
seven times.

**Why is it MALICE?**
The destruction effort reveals the value of what was meant to be hidden.

**Fintech analogy:**
Someone pays $50,000 in fees to move $100 between wallets. The operation
itself doesn't matter; the disproportionate effort gives away that
something is being laundered.

---

### Case 7 — The Ventriloquist
Verdict: MALICE

**What happened?**
A process called svchost.exe is running. It has a valid hash and a
Microsoft digital signature. It sounds legitimate. But it's running from
C:\Users\Public\Downloads, its parent process is cmd.exe, and it keeps a
persistent connection to a strange IP.

**What does VELO detect?**
The binary is real, but the context is fake. It's like a thief wearing a
genuine police uniform: the uniform is authentic, but it's in the wrong
place, with the wrong attitude, asking for things it shouldn't.

**Why is it MALICE?**
A valid digital signature doesn't clean up anomalous behavior.

**Fintech analogy:**
A legitimate API key from a large institution makes transfers from an IP
in a country where it doesn't operate, to an account never used before.
The key is real, but the context gives away the abuse.

---

### Case 8 — The Altered Mise en Place
Verdict: MALICE

**What happened?**
A commit in the repository says "cleaning up redundant logs." It's a
single-line change in deploy.sh: it redirects authentication errors to
/dev/null and adds "|| true," which makes the script continue as if
nothing happened even if authentication fails.

**What does VELO detect?**
The surface is minimal and innocent-looking, but the impact is
catastrophic: every authentication failure gets silenced. After the
deploy there are 47 login failures that generated no alert at all.

**Why is it MALICE?**
A minimal change with maximum security impact, disguised as cleanup.

**Fintech analogy:**
Someone proposes "changing a comment" in a custody smart contract, but
actually modifies a line that makes the required signatures drop from 3
to 0 in a certain edge case.

---

### Case 9 — The False-Layman Bait
Verdict: SUSPICION

**What happened?**
An admin user sends a support ticket saying "I don't know what I
touched, black screen with green letters, I can't get into Excel." The
attached screenshot shows a kernel exploit (dirty pipe) running at 45%.

**What does VELO detect?**
A "non-technical" user can't accidentally end up running a kernel
exploit. But VELO checks memory and finds no process, no command
history, no download of the exploit. There's only the screenshot.

**Why SUSPICION and not MALICE?**
It's a very strong signal of forensic theater, but a single source. A
second corroboration is needed for MALICE.

**Fintech analogy:**
Someone posts a screenshot showing a suspicious transaction on an
exchange, but there's no blockchain record, no hash, no signature. It
could be true or it could be staged.

---

### Case 10 — A Normal Day at the Office
Verdict: NOISE

**What happened?**
An ordinary morning: a spreadsheet is opened, someone browses technical
documentation, normal system logs are written. Nothing unusual.

**What does VELO detect?**
No detector fires. No temporal inconsistencies, no anti-forensic markers,
no path or process anomalies.

**Why is it NOISE?**
There's no evidence of malice, not even of suspicion. VELO doesn't invent
threats.

**Fintech analogy:**
A day with no fraud alerts, no unusual movements, no anomalous orders.
Everything within normal range.

---

### Case 11 — The Two Badges
Verdict: SUSPICION

**What happened?**
A physical access reader logs an employee's badge opening the datacenter
door in Building A at 14:00:00. Five seconds later, the VPN log shows
that same credential logging in from a residential IP 900km away.

**What does VELO detect?**
Nobody can be physically in one place and connect via VPN from another
900km away within five seconds. The contradiction is real and the engine
catches it (network vs. host state) — but it's one signal from one
source (the physical access log is context, not a second fired
detector).

**Why SUSPICION and not MALICE?**
Same rule as Case 2: a strong contradiction isn't enough by itself. The
Daubert corroboration gate needs at least two independent sources before
committing to MALICE, and here there's only one.

**Why it matters for the frontend:**
This case, together with Case 12, is used to prove that an examiner sees
the full detail only of the cases they themselves attested
(`cases_attested`); for other examiners' cases, they see only the
verdict, never the artifacts or the identity of who attested them.

---

### Case 12 — The Quiet Resignation
Verdict: SUSPICION

**What happened?**
A laptop's DLP agent logs 4,200 files copied to a removable device the
night before the employee announces their resignation. But that same
machine's USB device registry shows no connection in that window.

**What does VELO detect?**
Two sources contradict each other: the DLP log says there was a bulk
copy, the device registry says no device was ever connected.

**Why SUSPICION and not MALICE?**
It's a strong contradiction between two logs from the same machine, but
there's no independent third source to determine which of the two is
lying. VELO doesn't escalate to MALICE on a single unresolved
contradiction.

**Why it matters for the frontend:**
This case is attested by a different examiner than Case 11
(`VELO-PERITO-006`). It's used to prove, from the other side, that this
examiner sees VELO-012 in full but only the verdict of VELO-011 — and
vice versa for `VELO-PERITO-001`.

---

### Case 13 — The Anonymous Drop
Verdict: ABSTAIN

**What happened?**
A PDF appears in the shared evidence folder accusing an employee of
exfiltration. There's no record of who uploaded it, no upload log, no
chain of custody.

**What does VELO detect?**
It's the same pattern as Case 4: a serious claim with no verifiable
origin whatsoever.

**Why is it ABSTAIN?**
Without a chain of custody there's nothing to evaluate. VELO abstains, no
matter how serious the accusation is.

**Why it matters for the frontend:**
This case was deliberately left unattested by any examiner. It's used to
prove that a case with no attestation doesn't appear in anyone's "my
cases" — it would only exist in a public pending-cases queue, with no
verdict shown.

---

### Verdict summary

- **MALICE**: cases 1, 3, 5, 6, 7, 8
- **SUSPICION**: cases 2, 9, 11, 12
- **ABSTAIN**: cases 4, 13
- **NOISE**: case 10

**The golden rule:**
- MALICE needs a high score AND at least 2 independent sources.
- SUSPICION is a strong signal but without corroboration.
- ABSTAIN is evidence that cannot be admitted.
- NOISE is normal activity.
