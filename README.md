<div align="center">

# ⚡ Mods Claude

**Mods para [Claude Code](https://claude.com/claude-code) que te muestran qué está pasando y te ayudan a gastar menos.**

Funcionan dentro de la CLI `claude`, así que van contigo a cualquier terminal: **Warp**, **Orca**, Windows Terminal, iTerm o la app de escritorio.

![Claude Code](https://img.shields.io/badge/Claude%20Code-mod-D97757?style=for-the-badge)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-3DA639?style=for-the-badge)
![Idioma](https://img.shields.io/badge/idioma-español-1E88E5?style=for-the-badge)

</div>

---

## 📦 Mods

| Mod | Qué hace |
| --- | --- |
| [**agent-pulse**](./agent-pulse) | Uso de Claude por sesión (5 h) y semanal, agentes con barra de progreso, router que elige el modelo de cada agente y un orquestador que te cuenta todo. |

---

## 🫀 agent-pulse

> Tu tablero de control para Claude Code: cuánto llevas gastado, qué hace cada agente y con qué modelo, sin salir de la terminal.

```text
╭─ Claude Pulse ───────────────────────────────────────────────╮
│ USO DE CLAUDE                                                │
│ Sesión 5h ██████████░░░░░░░░░░░░░░  42%  reinicia en 2h 14m  │
│ Semanal   ████░░░░░░░░░░░░░░░░░░░░  18%  reinicia en 4d 3h   │
│ Contexto 31% · equivalente API $1.84                         │
│                                                              │
│ ROUTER modo auto · presión normal                            │
│ [ auto ] [ sugerir ] [ off ] [ limpiar ]                     │
│ 3/4 agentes en un modelo más barato que el principal         │
│                                                              │
│ AGENTES 2 activos · 4 en total                               │
│ ▶ Buscar usos de parseConfig  Explore · Haiku                │
│   ███████████░░░░░ ≈66% · 11 herr. · 38s · Grep              │
│   búsqueda de código simple (haiku)                          │
│ ▶ Implementar caché de sesión  general-purpose · Sonnet      │
│   ████░░░░░░░░░░░░ ≈24% · 5 herr. · 1m 12s · Edit            │
│ ✓ Revisar seguridad del login  security-reviewer · Opus      │
│   ████████████████ 100% · 22 herr. · 3m 40s · 84k tok        │
│                                                              │
│ ORQUESTADOR                                                  │
│ 14:32 ▶ "Buscar usos de parseConfig" → Haiku: búsqueda…      │
│ 14:31 ✓ "Revisar seguridad del login" terminó en 3m 40s      │
│ 14:28 Sesión 5h al 50% (reinicia en 2h 30m): solo aviso.     │
╰──────────────────────────────────────────────────────────────╯
```

### ✨ Qué te muestra

| | |
| --- | --- |
| 📊 **Uso de Claude** | Ventana de sesión (5 h) y semanal con barra, porcentaje y cuánto falta para que reinicie. También el contexto usado y el costo equivalente de API. |
| 🤖 **Agentes en vivo** | Cada agente que se lanza con `Task`/`Agent`: modelo, por qué se eligió, barra de progreso, herramienta actual, tiempo y tokens al terminar. |
| 🧭 **Orquestador** | Una bitácora que narra lo que pasa (agente lanzado, modelo elegido, terminado, alertas) más avisos al momento. No gasta tokens. |
| 📟 **Barra de estado** | Siempre a la vista: `pulse · 5h 42% · sem 18% · 2 agentes` |
| 📌 **Banda sobre el prompt** | Aparece sola mientras corren agentes o cuando el uso pasa de 80 %, y desaparece cuando no hace falta. |

### 🧠 Router de modelo

Antes de que arranque cada agente, **Haiku lee la tarea y elige el modelo más barato que la haga bien**:

| Modelo | Cuándo |
| --- | --- |
| 🟢 **Haiku** | Buscar, localizar archivos, leer, resumir, listar |
| 🔵 **Sonnet** | Implementar, editar código, tests, depuración normal |
| 🟣 **Opus** | Arquitectura, seguridad, depuración difícil, refactors grandes |

Y se ajusta solo a tu consumo:

```text
uso < 80 %   →  el modelo que eligió el router
uso ≥ 80 %   →  baja un nivel   (Opus → Sonnet, Sonnet → Haiku)
uso ≥ 95 %   →  todo a Haiku
```

Si Haiku no responde, usa reglas por tipo de agente y palabras clave, así que **ningún agente se queda sin arrancar**. Te avisa al cruzar **50 %, 80 % y 95 %** (una sola vez por ventana).

### ⌨️ Comandos

| Comando | Qué hace |
| --- | --- |
| `/pulse` | Abre el panel |
| `/pulse auto` | El router cambia el modelo de cada agente *(por defecto)* |
| `/pulse sugerir` | Solo muestra qué modelo habría elegido, sin cambiar nada |
| `/pulse off` | Apaga el router |
| `/pulse limpiar` | Borra los agentes terminados y la bitácora |

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

---

## 📝 Notas

- Los porcentajes de 5 h y semanal llegan con la primera respuesta de la sesión y solo existen en planes de suscripción (Pro / Max).
- El progreso de los agentes es una **estimación**: avanza con cada herramienta que usan y llega a 100 % al terminar.
- Cada clasificación con Haiku cuesta muy poco, mucho menos de lo que ahorra mandar una búsqueda a Haiku en vez de a Opus.

## 🛠️ Desarrollo

```bash
claude plugin validate agent-pulse
claude plugin test agent-pulse
```

## 📄 Licencia

[MIT](./LICENSE) © andresvd95
