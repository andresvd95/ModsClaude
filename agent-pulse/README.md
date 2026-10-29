# agent-pulse v2

Mod de Claude Code para ver y ahorrar el uso de Claude. Corre dentro de la CLI `claude`, así que funciona igual en Warp, Orca, Windows Terminal o la app de escritorio.

## Qué muestra

- **Uso**: ventana de sesión (5 h) y semanal, con barra, porcentaje y cuánto falta para que reinicie. También el contexto y el costo equivalente de API.
- **Agentes**: cada agente que se lanza con Task/Agent aparece con su modelo, una barra de progreso estimada (por herramientas usadas), la herramienta actual, el tiempo y los tokens al terminar.
- **Decisión del router** (nuevo en v2): por agente, la cadena de decisión (`Haiku 55% → Opus ⟶ Sonnet 90% → Sonnet`), quién decidió y con qué confianza, el ajuste por uso si lo hubo y quién lanzó el agente y qué modelo pidió.
- **Orquestador** (mejorado en v2): mientras un modelo piensa aparece arriba como `🧠 Haiku pensando "…" · 2s`; al decidir, una sola línea con a quién se asignó la tarea y quién decidió. Sin narración paso a paso.
- **Barra de estado**: `pulse · 5h 42% · sem 18% · Haiku pensando · 2 agentes`.
- **Banda sobre el prompt**: aparece mientras un modelo piensa, mientras corren agentes o cuando el uso pasa de 80 %.

## Router de modelo

**Prioridad: el usuario, luego la skill, luego el mod.** El mod se adapta a lo que una skill (vedev, OctopusAgents u otra) defina y solo toma el control cuando ninguna skill dice nada.

0. **Una skill fijó el modelo**: si el prompt del agente empieza con una línea `modelo-fijado: haiku|sonnet|opus`, el mod la respeta tal cual. No consulta a Haiku ni a Sonnet (no gasta uso) y la presión de uso no la baja: solo avisa en el panel. Aparece como `decidió Skill`.
1. **Haiku piensa**: lee la tarea (recortada a 1 500 caracteres), quién la lanzó y qué modelo pidió, y responde solo modelo y confianza (0–100), en ≤30 tokens.
2. Si Haiku **duda** (confianza < 70 %) o **propone Opus**, **piensa Sonnet** con la propuesta de Haiku a la vista y decide él.
3. Si Haiku no responde, deciden **reglas** por tipo de agente y palabras clave, sin coste.
4. Un **workflow** que ya fijó modelo se respeta.
5. **Ajuste por uso**: con 5 h o semanal en 80 % o más baja un nivel; en 95 % o más, todo va a Haiku.

| Modelo | Para qué |
| --- | --- |
| Haiku | buscar, localizar, leer, resumir, listar |
| Sonnet | implementar, editar, tests, depuración normal |
| Opus | arquitectura, seguridad, depuración difícil, refactors grandes |

Avisa al cruzar 50, 80 y 95 %. Si el router falla, el agente arranca igual.

## Comandos

- `/pulse`: abre el panel.
- `/pulse auto`: el router decide y aplica el modelo (por defecto).
- `/pulse sugerir`: muestra toda la decisión sin cambiar el modelo.
- `/pulse off`: apaga el router.
- `/pulse limpiar`: borra los agentes terminados y la bitácora.

## Instalar

En una sesión de Claude Code:

```
/plugin install agent-pulse --marketplace andresvd95/ModsClaude
```

O desde la shell:

```
claude plugin install agent-pulse --marketplace andresvd95/ModsClaude
```

## Cambios

- **2.1.0**: las skills tienen más peso que el mod. Una línea `modelo-fijado: <modelo>` al inicio del prompt del agente fija el modelo: el router no se consulta, la presión de uso no lo baja (solo avisa) y el panel muestra `decidió Skill`. Sin esa línea, el router funciona como antes.
- **2.0.1**: sin narración que gaste tokens. Haiku y Sonnet ya no escriben texto de razonamiento (devuelven solo modelo + confianza, ≤30 tokens); la tarea se recorta a 1 500 caracteres; la bitácora deja una línea por agente en vez de narrar cada paso.
- **2.0.0**: el router muestra quién decidió, la cadena de decisión con confianza, lo que pensó cada modelo y quién lanzó el agente. Segunda opinión de Sonnet cuando Haiku duda o propone Opus. El orquestador narra en vivo cuándo piensan Haiku y Sonnet y a quién asignan la tarea.
- **0.1.0**: uso 5 h / semanal, agentes con progreso, router Haiku + reglas, bitácora.
