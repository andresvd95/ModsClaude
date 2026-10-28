# skill-trail

Mini historial de las skills que usas y la **skill grande** activa del proyecto (Superpowers, Everything Claude Code, Engram…). Un mismo historial para Claude Code, Codex y Hermes, guardado por proyecto en `~/.skill-trail/trail.jsonl`.

## Qué muestra

- **Skill grande**: el marco de trabajo que un plugin carga al iniciar la sesión (por ejemplo, el hook de Superpowers que inyecta *"You have superpowers"*). Si hay varios, manda Superpowers y los demás salen como "también activas". Sin marco, el pack que más usas en el proyecto. Puedes fijarla tú.
- **Más usadas**: las 5 skills con más usos en el proyecto y qué agentes las usaron.
- **Historial**: cada skill cargada, con hora, pack y agente (✳ Claude, ◎ Codex, ☿ Hermes).
- **Barra de estado** (Claude): `skills · ⚡Superpowers · último: brainstorming`.

## En cada agente

| Agente | Qué se registra | Dónde se ve |
| --- | --- | --- |
| Claude Code, en cualquier terminal (Warp, Orca, Windows Terminal) o la app de escritorio | Cada skill que se expande (`/nombre`, herramienta Skill, precarga en subagente) y los marcos que inyectan los hooks de SessionStart | `/trail`, barra de estado |
| Codex | `$skill` en tu mensaje y cada lectura de un `SKILL.md` | `$skill-trail` |
| Hermes | Cada `skill_view` y cada `/skill` | `/skilltrail` |
| Terminal | | `skill-trail`, `skill-trail status` |

## Instalar

Claude Code:

```
/plugin install skill-trail --marketplace andresvd95/ModsClaude
```

Codex, Hermes y el atajo `skill-trail` en la terminal (Node 18+), desde el repo clonado:

```
node skill-trail/cli/skill-trail.mjs install
```

Copia el CLI a `~/.skill-trail/bin`, añade dos hooks a `~/.codex/hooks.json` y la skill `$skill-trail` a `~/.codex/skills`, instala el plugin en `<HERMES_HOME>/plugins/skill-trail` y lo habilita en su `config.yaml`. Respalda los archivos que cambia (`*.skill-trail.bak`). Codex puede pedirte que apruebes los hooks nuevos la primera vez.

## Comandos

| Claude | Terminal / Codex / Hermes | Qué hace |
| --- | --- | --- |
| `/trail` | `skill-trail` | Panel o historial del proyecto |
| `/trail fijar <x>` | `skill-trail fijar <x>` | Fija la skill grande |
| `/trail soltar` | `skill-trail soltar` | Vuelve a detectarla sola |
| `/trail limpiar` | `skill-trail limpiar` | Borra el historial del proyecto |
| | `skill-trail show --all` | Historial de todos los proyectos |
| | `skill-trail uninstall` | Quita hooks y plugin (conserva el historial) |

Sin Node, el panel de Claude sigue funcionando con lo usado en la sesión actual.
