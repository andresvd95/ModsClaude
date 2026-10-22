# agent-pulse

Mod de Claude Code para ver y ahorrar el uso de Claude. Corre dentro de la CLI `claude`, así que funciona igual en Warp, Orca, Windows Terminal o la app de escritorio.

## Qué muestra

- **Uso**: ventana de sesión (5 h) y semanal, con barra, porcentaje y cuánto falta para que reinicie. También el contexto y el costo equivalente de API.
- **Agentes**: cada agente que se lanza con Task/Agent aparece con su modelo, el motivo de esa elección, una barra de progreso estimada (por herramientas usadas), la herramienta actual, el tiempo y los tokens al terminar.
- **Orquestador**: una bitácora que narra lo que pasa (agente lanzado, modelo elegido, terminado, alertas) y toasts en el momento.
- **Barra de estado**: `pulse · 5h 42% · sem 18% · 2 agentes`.
- **Banda sobre el prompt**: aparece solo mientras hay agentes corriendo o cuando el uso pasa de 80 %.

## Router de modelo

Antes de que arranque cada agente, Haiku lee la tarea y elige el modelo más barato que la haga bien:

| Modelo | Para qué |
| --- | --- |
| Haiku | buscar, localizar, leer, resumir, listar |
| Sonnet | implementar, editar, tests, depuración normal |
| Opus | arquitectura, seguridad, depuración difícil, refactors grandes |

Si Haiku no responde, usa reglas por tipo de agente y palabras clave. Con el uso de 5 h o semanal en 80 % o más, baja un nivel; en 95 % o más, todo va a Haiku. Avisa al cruzar 50, 80 y 95 %.

## Comandos

- `/pulse`: abre el panel.
- `/pulse auto`: el router cambia el modelo (por defecto).
- `/pulse sugerir`: solo muestra qué modelo habría elegido.
- `/pulse off`: apaga el router.
- `/pulse limpiar`: borra los agentes terminados y la bitácora.

## Instalar

Desde una terminal (Warp, Orca u otra):

En una sesión de Claude Code:

```
/plugin install agent-pulse --marketplace andresvd95/ModsClaude
```

O desde la shell:

```
claude plugin install agent-pulse --marketplace andresvd95/ModsClaude
```
