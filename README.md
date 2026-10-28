<div align="center">

# ⚡ Mods Claude

**Mods para [Claude Code](https://claude.com/claude-code) que te muestran qué está pasando y te ayudan a gastar menos.**

Funcionan dentro de la CLI `claude`, así que van contigo a cualquier terminal: **Warp**, **Orca**, Windows Terminal, iTerm o la app de escritorio.

![Versión](https://img.shields.io/badge/versión-v2.0.1-7C4DFF?style=for-the-badge)
![Claude Code](https://img.shields.io/badge/Claude%20Code-mod-D97757?style=for-the-badge)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-3DA639?style=for-the-badge)
![Idioma](https://img.shields.io/badge/idioma-español-1E88E5?style=for-the-badge)

</div>

---

## 📦 Mods

| Mod | Versión | Qué hace |
| --- | --- | --- |
| [**agent-pulse**](./agent-pulse) | **v2.0.1** | Uso de Claude por sesión (5 h) y semanal, agentes con barra de progreso, un router que **muestra** qué modelo elige para cada agente y quién tomó la decisión, y un orquestador que muestra en vivo qué modelo está pensando y a quién asignó cada tarea. |
| [**skill-trail**](./skill-trail) | **v0.1.0** | Mini historial de las skills que usas y la **skill grande** activa (Superpowers, ECC, Engram…). Funciona en Claude Code, Codex y Hermes, con un historial compartido. |

---

## 🆕 Novedades de la v2

> **v2.0.1 · más ligero:** Pulse mide el pulso de Claude, no se lo acelera. Haiku y Sonnet ya no escriben un texto de razonamiento para narrarlo: devuelven solo modelo y confianza (≤30 tokens de salida, la tarea recortada a 1 500 caracteres). Su razonamiento interno, el que sí decide, se mantiene. La bitácora ya no narra paso a paso: una línea por agente con a quién se asignó.

La v1 elegía el modelo de cada agente en silencio. La v2 **te enseña toda la decisión**:

| | v1 | v2 |
| --- | --- | --- |
| Modelo elegido | ✅ | ✅ |
| **Quién decidió** (Haiku, Sonnet, reglas o workflow) | — | ✅ |
| **Cadena de decisión** con confianza de cada modelo | — | ✅ `Haiku 55% → Opus ⟶ Sonnet 90% → Sonnet` |
| **Quién lanzó** el agente y qué modelo pidió | — | ✅ `lanzó Opus (principal), pidió Opus` |
| **"Haiku / Sonnet pensando…" en vivo** en el panel, la banda y la barra de estado | — | ✅ |
| **Segunda opinión de Sonnet** cuando Haiku duda o propone Opus | — | ✅ |
| Resumen: cuántas decisiones tomó cada modelo y a qué modelo se asignó cada agente | — | ✅ |
| Sin narración que gaste tokens (v2.0.1) | — | ✅ |

---

## 🫀 agent-pulse

> Tu tablero de control para Claude Code: cuánto llevas gastado, qué hace cada agente, con qué modelo y **quién lo eligió**, sin salir de la terminal.

```text
╭─ Claude Pulse ─────────────────────────────────────────────────────────╮
│ USO DE CLAUDE                                                          │
│ Sesión 5h ██████████░░░░░░░░░░░░░░  42%  reinicia en 2h 14m            │
│ Semanal   ████░░░░░░░░░░░░░░░░░░░░  18%  reinicia en 4d 3h             │
│ Contexto 31% · equivalente API $1.84                                   │
│                                                                        │
│ ROUTER modo auto · presión normal                                      │
│ [ auto ] [ sugerir ] [ off ] [ limpiar ]                               │
│ Haiku decide · si duda (<70%) o propone Opus, confirma Sonnet          │
│ Quién decidió: Haiku 2 · Sonnet 1                                      │
│ Asignados a: Haiku 1 · Sonnet 1 · Opus 1                               │
│ 2/3 agentes en un modelo más barato que quien los lanzó                │
│                                                                        │
│ AGENTES 2 activos · 3 en total                                         │
│ ▶ Buscar usos de parseConfig  Explore · Haiku                          │
│   ███████████░░░░░ ≈66% · 11 herr. · 38s · Grep                        │
│   🧭 Haiku 94% → Haiku                                                 │
│   eligió Haiku (94%) · lanzó Opus (principal)                          │
│ ▶ Implementar caché de sesión  general-purpose · Sonnet                │
│   ████░░░░░░░░░░░░ ≈24% · 5 herr. · 1m 12s · Edit                      │
│   🧭 Haiku 58% → Opus ⟶ Sonnet 88% → Sonnet                            │
│   eligió Sonnet (88%) · lanzó Opus (principal), pidió Opus             │
│ ✓ Revisar seguridad del login  security-reviewer · Opus                │
│   ████████████████ 100% · 22 herr. · 3m 40s · 84k tok                  │
│   🧭 Haiku 90% → Opus ⟶ Sonnet 92% → Opus                              │
│                                                                        │
│ ORQUESTADOR                                                            │
│ 🧠 Haiku pensando "Escribir tests del parser" · 2s                     │
│ 14:32 ▶ "Implementar caché de sesión" → Sonnet · decidió Sonnet        │
│ 14:31 ✓ "Revisar seguridad del login" (Opus) terminó en 3m 40s         │
│ 14:30 ▶ "Buscar usos de parseConfig" → Haiku · decidió Haiku           │
╰────────────────────────────────────────────────────────────────────────╯
```

### ✨ Qué te muestra

| | |
| --- | --- |
| 📊 **Uso de Claude** | Ventana de sesión (5 h) y semanal con barra, porcentaje y cuánto falta para que reinicie. También el contexto usado y el costo equivalente de API. |
| 🤖 **Agentes en vivo** | Cada agente que se lanza con `Task`/`Agent`: modelo asignado, barra de progreso, herramienta actual, tiempo y tokens al terminar. |
| 🧭 **Decisión del router** | Por agente: la cadena completa (qué propuso cada modelo y con qué confianza), quién decidió, si el uso obligó a bajar de modelo y quién lanzó el agente. |
| 🧠 **Orquestador** | Muestra en vivo qué modelo está pensando (*Haiku pensando…*, *Sonnet pensando…*) y, al decidir, una sola línea con **a quién asignó la tarea**. También el fin de cada agente y las alertas de uso. Todo local: no gasta tokens. |
| 📟 **Barra de estado** | Siempre a la vista: `pulse · 5h 42% · sem 18% · Haiku pensando · 2 agentes` |
| 📌 **Banda sobre el prompt** | Aparece sola mientras un modelo piensa, mientras corren agentes o cuando el uso pasa de 80 %. Muestra qué modelo eligió cada agente. |

### 🧠 Cómo decide el router

```text
                ┌──────────────────────────┐
   agente  ───▶ │ 🧠 Haiku piensa          │  responde solo modelo + confianza
                └────────────┬─────────────┘
                             │
          ¿confianza < 70 % o propone Opus?
               │ no                     │ sí
               ▼                        ▼
        decide Haiku          ┌──────────────────────┐
                              │ 🧠 Sonnet piensa     │  ve la propuesta de Haiku
                              └──────────┬───────────┘
                                         ▼
                                  decide Sonnet
   (si Haiku no responde → deciden las reglas locales, sin coste)
                             │
                ajuste por uso (≥80 % baja un nivel, ≥95 % todo a Haiku)
                             │
                             ▼
                ▶ asignado a <modelo> · decidió <quién> · lanzó <modelo>
```

| Modelo | Cuándo |
| --- | --- |
| 🟢 **Haiku** | Buscar, localizar archivos, leer, resumir, listar |
| 🔵 **Sonnet** | Implementar, editar código, tests, depuración normal |
| 🟣 **Opus** | Arquitectura, seguridad, depuración difícil, refactors grandes |

Ajuste automático por consumo:

```text
uso < 80 %   →  el modelo que eligió el router
uso ≥ 80 %   →  baja un nivel   (Opus → Sonnet, Sonnet → Haiku)
uso ≥ 95 %   →  todo a Haiku
```

Un workflow que ya fijó el modelo de su agente se respeta (aparece como decisor **Workflow**). Si el router falla por cualquier motivo, **el agente arranca igual**. Te avisa al cruzar **50 %, 80 % y 95 %** (una sola vez por ventana).

### ⌨️ Comandos

| Comando | Qué hace |
| --- | --- |
| `/pulse` | Abre el panel |
| `/pulse auto` | El router decide y aplica el modelo de cada agente *(por defecto)* |
| `/pulse sugerir` | Muestra toda la decisión, pero el agente corre en el modelo que pidió quien lo lanzó |
| `/pulse off` | Apaga el router |
| `/pulse limpiar` | Borra los agentes terminados y la bitácora |

---

## 🧭 skill-trail

> Qué skills estás usando, en qué orden, y cuál es la skill grande que manda en el proyecto.

```text
╭─ Skill Trail ────────────────────────────────────────────────╮
│ SKILL GRANDE                                                 │
│ ⚡ Superpowers · cargada al iniciar (claude)                  │
│ también activas: Everything Claude Code, Engram              │
│ [ actualizar ]                                               │
│                                                              │
│ MÁS USADAS 9 usos · claude, codex, hermes                    │
│   4× superpowers:brainstorming                               │
│   2× code-review                                             │
│                                                              │
│ HISTORIAL                                                    │
│ 14:32 ✳ brainstorming · superpowers · claude                 │
│ 14:10 ◎ code-review · codex                                  │
│ 13:58 ☿ arxiv · research · hermes                            │
╰──────────────────────────────────────────────────────────────╯
```

| | |
| --- | --- |
| ⚡ **Skill grande** | El marco de trabajo que un plugin carga al iniciar (por ejemplo *"You have superpowers"*). Si no hay, el pack que más usas en el proyecto. Puedes fijarla tú. |
| 🧾 **Mini historial** | Cada skill que se carga: con `/nombre`, con la herramienta Skill o precargada en un subagente. Hora, pack y agente. |
| 📟 **Barra de estado** | `skills · ⚡Superpowers · último: brainstorming` |
| 🔗 **Compartido** | Claude Code, Codex y Hermes escriben en el mismo historial (`~/.skill-trail/trail.jsonl`), por proyecto. |

**Dónde se ve en cada agente**

| Agente | Cómo lo registra | Cómo lo ves |
| --- | --- | --- |
| Claude Code (Warp, Orca, Windows Terminal, escritorio) | El mod escucha cada skill y lo que inyectan los plugins al iniciar | `/trail` y la barra de estado |
| Codex | Hooks `UserPromptSubmit` (`$skill`) y `PostToolUse` (lectura de `SKILL.md`) | `$skill-trail` dentro de Codex |
| Hermes | Plugin con `skill_view` y `/skill` | `/skilltrail` dentro de Hermes |
| Cualquier terminal | | `skill-trail` (o `skill-trail status` para una línea) |

| Comando (Claude) | Qué hace |
| --- | --- |
| `/trail` | Abre el panel |
| `/trail fijar superpowers` | Fija la skill grande del proyecto |
| `/trail soltar` | Vuelve a detectarla sola |
| `/trail limpiar` | Borra el historial del proyecto |

Para Codex, Hermes y el atajo de terminal (requiere Node 18+), una vez, desde el repo clonado:

```bash
node skill-trail/cli/skill-trail.mjs install
```

Respalda `~/.codex/hooks.json` y el `config.yaml` de Hermes antes de tocarlos. Para quitarlo: `skill-trail uninstall` (el historial se conserva).

---

## 🚀 Instalación

En una sesión de Claude Code, desde cualquier terminal:

```text
/plugin install agent-pulse --marketplace andresvd95/ModsClaude
```

Responde `y` para añadir el marketplace y elige el alcance **user** para tenerlo en todas tus sesiones.

Desde la shell:

```bash
claude plugin install agent-pulse --marketplace andresvd95/ModsClaude
```

En la app de escritorio: **+** junto al prompt → **Plugins** → **Add marketplace** con `andresvd95/ModsClaude` → **Add plugin**.

Luego abre una sesión nueva y escribe `/pulse`.

### ⬆️ Actualizar desde la v1

```bash
claude plugin marketplace update mods-claude
claude plugin update agent-pulse@mods-claude
```

Después abre una sesión nueva.

Lo mismo para **skill-trail** (cambia el nombre del mod y luego escribe `/trail`):

```text
/plugin install skill-trail --marketplace andresvd95/ModsClaude
```

---

## 📝 Notas

- Los porcentajes de 5 h y semanal llegan con la primera respuesta de la sesión y solo existen en planes de suscripción (Pro / Max).
- El progreso de los agentes es una **estimación**: avanza con cada herramienta que usan y llega a 100 % al terminar.
- Haiku y Sonnet razonan internamente (esfuerzo bajo) y responden solo `{"tier","confidence"}`: nada de texto libre para narrar. El panel, la banda, la bitácora y los avisos se dibujan localmente y no gastan tokens.
- Cada decisión de Haiku cuesta muy poco. Sonnet solo se consulta cuando Haiku duda o propone Opus, y aun así sale mucho más barato que mandar a Opus una tarea que Sonnet hace bien.

## 🛠️ Desarrollo

```bash
claude plugin validate agent-pulse
claude plugin test agent-pulse
claude plugin validate skill-trail
claude plugin test skill-trail
node --test skill-trail/cli/skill-trail.spec.mjs
```

## 📄 Licencia

[MIT](./LICENSE) © andresvd95
