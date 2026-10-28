---
name: skill-trail
description: Muestra el historial de skills usadas en este proyecto y la skill grande activa (Superpowers, ECC, etc.), compartido entre Claude Code, Codex y Hermes. Úsala cuando el usuario pregunte qué skills está usando, cuál está activa, o diga "skill-trail".
---

# skill-trail

Ejecuta este comando en el directorio del proyecto y muestra su salida tal cual al usuario, sin resumirla:

```bash
node ~/.skill-trail/bin/skill-trail.mjs show --n 15
```

Otras órdenes, si el usuario las pide:

- `node ~/.skill-trail/bin/skill-trail.mjs fijar <nombre>`: fija la skill grande del proyecto.
- `node ~/.skill-trail/bin/skill-trail.mjs soltar`: vuelve a detectarla sola.
- `node ~/.skill-trail/bin/skill-trail.mjs show --all`: historial de todos los proyectos.
- `node ~/.skill-trail/bin/skill-trail.mjs limpiar`: borra el historial del proyecto (pide confirmación antes).
