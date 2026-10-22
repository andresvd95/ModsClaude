import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type {
  PulseAgent,
  PulseAgentStatus,
  PulseLogLevel,
  PulseMode,
  PulseTier,
  PulseUsage,
  PulseWindow,
} from '../types'

// agent-pulse: uso de Claude (5h / semanal), agentes con progreso,
// router de modelo por agente (clasificador Haiku + reglas) y un
// orquestador que narra lo que pasa en una bitácora, toasts y la barra de estado.

const PANE = 'agent-pulse'
const TITLE = 'Claude Pulse'

const usageAtom = atom({ plugin: 'agent-pulse', key: 'usage' } as const, {
  windows: [],
  updatedAt: 0,
} as PulseUsage)
const agentsAtom = atom({ plugin: 'agent-pulse', key: 'agents' } as const, [] as PulseAgent[])
const logAtom = atom({ plugin: 'agent-pulse', key: 'log' } as const, [])
const modeAtom = atom({ plugin: 'agent-pulse', key: 'mode' } as const, 'auto' as PulseMode)
const tickAtom = atom({ plugin: 'agent-pulse', key: 'tick' } as const, 0)

const TIERS: PulseTier[] = ['haiku', 'sonnet', 'opus']
const TIER_LABEL: Record<PulseTier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
// Llamadas a herramientas que se esperan por nivel: base de la barra estimada.
const EXPECTED_TOOLS: Record<PulseTier, number> = { haiku: 10, sonnet: 18, opus: 28 }
const ALERT_LEVELS = [50, 80, 95]
const WINDOW_LABEL: Record<string, string> = {
  five_hour: 'Sesión 5h',
  seven_day: 'Semanal',
  spend_limit: 'Gasto',
}

type $ = EngineInterface

// ---------- utilidades ----------

function tierOf(model: string | undefined): PulseTier | undefined {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus') || m.includes('fable')) return 'opus'
  return undefined
}

function pct(windows: PulseWindow[], kind: string): number | undefined {
  return windows.find(w => w.kind === kind)?.percentUsed
}

function pressure(usage: PulseUsage): number {
  return Math.max(pct(usage.windows, 'five_hour') ?? 0, pct(usage.windows, 'seven_day') ?? 0)
}

function bar(percent: number, width: number): string {
  const w = Math.max(4, width)
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * w)
  return '█'.repeat(filled) + '░'.repeat(w - filled)
}

function usageColor(percent: number): string {
  if (percent >= 95) return 'error'
  if (percent >= 80) return 'warning'
  if (percent >= 50) return 'suggestion'
  return 'success'
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function resetsIn(now: number, resetsAt: string | undefined): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  return `reinicia en ${duration(at - now)}`
}

function clock(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function kTokens(n: number | undefined): string {
  if (n === undefined) return ''
  return n >= 1000 ? `${Math.round(n / 1000)}k tok` : `${n} tok`
}

function agentProgress(a: PulseAgent): number {
  if (a.status !== 'running') return 100
  // Curva suave que nunca llega a 100 mientras corre.
  return Math.min(95, Math.round(100 * (1 - Math.exp(-a.tools / a.expected))))
}

function short(text: string, n: number): string {
  return text.length > n ? text.slice(0, Math.max(1, n - 1)) + '…' : text
}

async function narrate($: $, level: PulseLogLevel, text: string, toast = false) {
  const at = await $.clock.now()
  await update($, logAtom, list => [...(list ?? []), { at, level, text }].slice(-60))
  if (toast) $.ui.toast(text)
}

async function refreshStatus($: $) {
  const usage = await read($, usageAtom)
  const agents = await read($, agentsAtom)
  const parts: string[] = []
  const five = pct(usage.windows, 'five_hour')
  const week = pct(usage.windows, 'seven_day')
  if (five !== undefined) parts.push(`5h ${Math.round(five)}%`)
  if (week !== undefined) parts.push(`sem ${Math.round(week)}%`)
  const running = agents.filter(a => a.status === 'running').length
  if (running > 0) parts.push(`${running} agente${running > 1 ? 's' : ''}`)
  $.ui.status(parts.length ? `pulse · ${parts.join(' · ')}` : undefined)
}

// ---------- uso y alertas ----------

async function recordUsage(
  $: $,
  rateLimits: readonly SessionRateLimit[],
  costUsd: number | undefined,
  contextPercent: number | undefined,
) {
  const windows: PulseWindow[] = rateLimits.map(r => ({
    kind: r.kind,
    percentUsed: r.percentUsed,
    resetsAt: r.resetsAt,
  }))
  const now = await $.clock.now()
  await update($, usageAtom, prev => ({
    windows: windows.length ? windows : (prev?.windows ?? []),
    costUsd: costUsd ?? prev?.costUsd,
    contextPercent: contextPercent ?? prev?.contextPercent,
    updatedAt: now,
  }))

  // Alertas una sola vez por ventana (kind + resetsAt) y nivel.
  const alerted = ((await $.store.get('alerts')) ?? {}) as Record<string, number>
  let changed = false
  for (const w of windows) {
    const key = `${w.kind}|${w.resetsAt ?? ''}`
    const level = [...ALERT_LEVELS].reverse().find(l => w.percentUsed >= l)
    if (level === undefined || (alerted[key] ?? 0) >= level) continue
    alerted[key] = level
    changed = true
    const name = WINDOW_LABEL[w.kind] ?? w.kind
    const when = resetsIn(now, w.resetsAt)
    const advice =
      level >= 95
        ? 'todos los agentes nuevos irán a Haiku.'
        : level >= 80
          ? 'los agentes nuevos bajan un nivel de modelo.'
          : 'todo normal, solo aviso.'
    const text = `${name} al ${Math.round(w.percentUsed)}%${when ? ` (${when})` : ''}: ${advice}`
    await narrate($, level >= 80 ? 'alert' : 'warn', text, true)
    if (level >= 95) void $.ui.notify(text, { title: TITLE })
  }
  if (changed) {
    // Poda de ventanas viejas para que el store no crezca.
    const keep = Object.fromEntries(Object.entries(alerted).slice(-20))
    await $.store.set('alerts', keep)
  }
  await refreshStatus($)
}

// ---------- router de modelo ----------

type Pick = { tier: PulseTier; reason: string; source: 'haiku' | 'reglas' }

const ROUTER_SYSTEM = [
  'Eres un enrutador de modelos para subagentes de Claude Code. Elige el modelo MÁS BARATO que haga bien la tarea.',
  'haiku: búsquedas, localizar archivos, leer y resumir, listar, grep, preguntas de un dato, cambios mecánicos triviales.',
  'sonnet: implementar o editar código, escribir tests, depurar errores comunes, investigación de varios pasos, la mayoría del trabajo.',
  'opus: arquitectura, diseño de sistemas, revisión de seguridad, depuración difícil o concurrente, refactors grandes, planes complejos, decisiones con mucho juicio.',
  'Responde SOLO con JSON en una línea: {"tier":"haiku|sonnet|opus","reason":"máximo 8 palabras en español"}',
].join('\n')

function byRules(e: AgentSpawnInput): Pick {
  const type = e.subagentType.toLowerCase()
  const text = `${e.description}\n${e.prompt}`.toLowerCase()
  if (/explore|docs-lookup|search/.test(type)) {
    return { tier: 'haiku', reason: `tipo ${e.subagentType}: exploración`, source: 'reglas' }
  }
  if (/plan|architect|security|review/.test(type)) {
    return { tier: 'opus', reason: `tipo ${e.subagentType}: juicio alto`, source: 'reglas' }
  }
  if (/arquitect|architect|diseñ|design|seguridad|security|vulnerab|race|concurren|deadlock|migraci|refactor/.test(text)) {
    return { tier: 'opus', reason: 'tarea de diseño o riesgo alto', source: 'reglas' }
  }
  if (/\b(busca|buscar|encuentra|localiza|lista|listar|resume|resumir|lee|leer|search|find|locate|list|grep|summari[sz]e|read)\b/.test(text) && text.length < 1500) {
    return { tier: 'haiku', reason: 'búsqueda o lectura simple', source: 'reglas' }
  }
  return { tier: 'sonnet', reason: 'trabajo general', source: 'reglas' }
}

async function classify($: $, e: AgentSpawnInput): Promise<Pick> {
  const ask = [
    `Tipo de agente: ${e.subagentType}`,
    `Descripción: ${e.description}`,
    `Tarea:\n${short(e.prompt, 3000)}`,
  ].join('\n')
  const r = await $.model.complete({
    model: 'haiku',
    system: [{ text: ROUTER_SYSTEM, cache: true }],
    prompt: ask,
    maxTokens: 80,
    effort: 'low',
    timeoutMs: 10000,
  })
  if (r.isAnswered) {
    const m = r.text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { tier?: string; reason?: string }
        const tier = TIERS.find(t => t === parsed.tier)
        if (tier) return { tier, reason: short(parsed.reason ?? 'clasificado por Haiku', 60), source: 'haiku' }
      } catch {
        // cae a reglas
      }
    }
  }
  return byRules(e)
}

function underPressure(pick: Pick, load: number): Pick {
  if (load >= 95 && pick.tier !== 'haiku') {
    return { ...pick, tier: 'haiku', reason: `${pick.reason} · límite ≥95% → Haiku` }
  }
  if (load >= 80 && pick.tier !== 'haiku') {
    const lower = TIERS[TIERS.indexOf(pick.tier) - 1]!
    return { ...pick, tier: lower, reason: `${pick.reason} · uso ≥80% → baja a ${TIER_LABEL[lower]}` }
  }
  return pick
}

// ---------- registro ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const stored = (await $.store.get('mode')) as PulseMode | undefined
    if (stored === 'auto' || stored === 'sugerir' || stored === 'off') {
      await $.state.set({ plugin: 'agent-pulse', key: 'mode' }, stored)
    }

    await $.command.register({
      name: 'pulse',
      description: 'Claude Pulse: abre el panel o cambia el router (auto | sugerir | off | limpiar)',
      argumentHint: '[auto|sugerir|off|limpiar]',
    })

    try {
      const u = await $.session.usage()
      await recordUsage($, u.rateLimits, u.cost?.usd, u.context.percent)
    } catch {
      await refreshStatus($)
    }

    // Reloj para tiempos transcurridos mientras hay agentes corriendo.
    $.clock.every(3000, () => {
      void (async () => {
        const agents = await read($, agentsAtom)
        if (agents.some(a => a.status === 'running')) {
          await update($, tickAtom, n => (n ?? 0) + 1)
        }
      })()
    })

    return result
  })

  on('command.run', { command: 'pulse' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto' || arg === 'sugerir' || arg === 'off') {
      await $.state.set({ plugin: 'agent-pulse', key: 'mode' }, arg)
      await $.store.set('mode', arg)
      await narrate($, 'info', `Router en modo ${arg}.`)
      return { text: `Claude Pulse: router en modo ${arg}.` }
    }
    if (arg === 'limpiar') {
      await update($, agentsAtom, list => (list ?? []).filter(a => a.status === 'running'))
      await $.state.set({ plugin: 'agent-pulse', key: 'log' }, [])
      return { text: 'Claude Pulse: agentes terminados y bitácora limpiados.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Claude Pulse abierto.' }
  })

  // Uso: cada vez que una ventana se mueve un punto o cambia el costo.
  on('session.measure', async ($, e, next) => {
    await recordUsage($, e.rateLimits, e.cost?.usd, e.context.percent)
    return next(e)
  })

  // Router + alta del agente en el tablero.
  on('agent.spawn', async ($, e, next) => {
    if (e.resume || e.fork || e.isTeammate) return next(e)

    const mode = await read($, modeAtom)
    const usage = await read($, usageAtom)
    const load = pressure(usage)

    let pick: Pick | undefined
    if (mode !== 'off') {
      // Un workflow que ya fijó modelo se respeta, salvo presión de uso.
      const fixed = e.workflow && tierOf(e.model)
      pick = fixed
        ? { tier: fixed, reason: 'modelo fijado por el workflow', source: 'reglas' }
        : await classify($, e)
      pick = underPressure(pick, load)
    }

    const apply = pick !== undefined && mode === 'auto'
    const result = await next(apply ? { ...e, model: pick!.tier } : e)
    if (result.deny !== undefined || !result.agentId) return result

    const tier = tierOf(result.model) ?? pick?.tier ?? 'sonnet'
    const agent: PulseAgent = {
      id: result.agentId,
      description: e.description || e.subagentType,
      type: e.subagentType,
      model: result.model,
      parentModel: e.parentModel,
      reason: pick
        ? `${apply ? '' : `sugerido ${TIER_LABEL[pick.tier]} · `}${pick.reason} (${pick.source})`
        : 'router apagado',
      status: 'running',
      startedAt: await $.clock.now(),
      tools: 0,
      expected: EXPECTED_TOOLS[tier],
    }
    await update($, agentsAtom, list => [...(list ?? []), agent].slice(-40))
    await narrate(
      $,
      'info',
      `▶ "${short(agent.description, 40)}" (${agent.type}) → ${TIER_LABEL[tier]}: ${agent.reason}`,
      true,
    )
    await refreshStatus($)
    return result
  }).catch(($, e, next) => next(e)) // si el router falla, el agente arranca igual

  // Progreso: cada herramienta que usa un agente avanza su barra.
  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      const tool = String(e.tool)
      await update($, agentsAtom, list =>
        (list ?? []).map(a => (a.id === id ? { ...a, tools: a.tools + 1, lastTool: tool } : a)),
      )
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // el conteo nunca bloquea una herramienta

  // Fin de cada agente.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) return result
    const id = e.agentId
    const agents = await read($, agentsAtom)
    const agent = agents.find(a => a.id === id)
    if (!agent || agent.status !== 'running') return result

    const status: PulseAgentStatus =
      e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'failed'
    const u = e.usage
    const tokens = u
      ? u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0)
      : undefined
    const endedAt = await $.clock.now()
    await update($, agentsAtom, list =>
      (list ?? []).map(a =>
        a.id === id ? { ...a, status, endedAt, tokens, model: u?.model ?? a.model } : a,
      ),
    )
    const icon = status === 'done' ? '✓' : status === 'aborted' ? '■' : '✗'
    const verb = status === 'done' ? 'terminó' : status === 'aborted' ? 'se detuvo' : 'falló'
    await narrate(
      $,
      status === 'done' ? 'ok' : 'warn',
      `${icon} "${short(agent.description, 40)}" ${verb} en ${duration(e.durationMs)} · ${agent.tools} herramientas${tokens ? ` · ${kTokens(tokens)}` : ''}`,
      true,
    )
    const left = (await read($, agentsAtom)).filter(a => a.status === 'running').length
    if (left === 0) await narrate($, 'ok', 'Todos los agentes terminaron.')
    await refreshStatus($)
    return result
  })

  // ---------- dibujo ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const usage = await read($, usageAtom)
    const agents = await read($, agentsAtom)
    const log = await read($, logAtom)
    const mode = await read($, modeAtom)
    await read($, tickAtom)

    const now = await $.clock.now()
    const cols = e.props.bodyColumns ?? 60
    const barW = Math.max(6, Math.min(24, cols - 34))
    const load = pressure(usage)
    const running = agents.filter(a => a.status === 'running')
    const finished = agents.filter(a => a.status !== 'running').slice(-8).reverse()
    const cheaper = agents.filter(a => {
      const mine = tierOf(a.model)
      const parent = tierOf(a.parentModel)
      return mine && parent && TIERS.indexOf(mine) < TIERS.indexOf(parent)
    }).length

    const known = ['five_hour', 'seven_day']
    const usageRows = known
      .map(kind => usage.windows.find(w => w.kind === kind))
      .concat(usage.windows.filter(w => !known.includes(w.kind)))
      .filter((w): w is PulseWindow => w !== undefined)

    const agentRow = (a: PulseAgent) => {
      const p = agentProgress(a)
      const icon = a.status === 'running' ? '▶' : a.status === 'done' ? '✓' : a.status === 'aborted' ? '■' : '✗'
      const color = a.status === 'running' ? 'claude' : a.status === 'done' ? 'success' : 'error'
      const time = duration((a.endedAt ?? now) - a.startedAt)
      return (
        <Box key={`a-${a.id}`} flexDirection="column">
          <Text>
            <Text color={color}>{icon} </Text>
            <Text bold>{short(a.description, Math.max(12, cols - 24))}</Text>
            <Text dimColor>
              {' '}
              {a.type} · {TIER_LABEL[tierOf(a.model) ?? 'sonnet']}
            </Text>
          </Text>
          <Text>
            {'  '}
            <Text color={color}>{bar(p, barW)}</Text>
            <Text dimColor>
              {' '}
              {a.status === 'running' ? `≈${p}%` : '100%'} · {a.tools} herr. · {time}
              {a.status === 'running' && a.lastTool ? ` · ${a.lastTool}` : ''}
              {a.tokens ? ` · ${kTokens(a.tokens)}` : ''}
            </Text>
          </Text>
          <Text dimColor>
            {'  '}
            {short(a.reason, Math.max(20, cols - 4))}
          </Text>
        </Box>
      )
    }

    const extras = [
      usage.contextPercent !== undefined ? `Contexto ${usage.contextPercent}%` : '',
      usage.costUsd !== undefined ? `equivalente API $${usage.costUsd.toFixed(2)}` : '',
    ].filter(Boolean)

    return (
      <Box flexDirection="column">
        <Text bold>USO DE CLAUDE</Text>
        {usageRows.length === 0 && (
          <Text dimColor>Sin lectura aún: aparece tras la primera respuesta (plan de suscripción).</Text>
        )}
        {usageRows.map(w => (
          <Text>
            {(WINDOW_LABEL[w.kind] ?? w.kind).padEnd(10)}
            <Text color={usageColor(w.percentUsed)}>{bar(w.percentUsed, barW)}</Text>
            <Text bold> {String(Math.round(w.percentUsed)).padStart(3)}%</Text>
            <Text dimColor> {resetsIn(now, w.resetsAt)}</Text>
          </Text>
        ))}
        {extras.length > 0 && <Text dimColor>{extras.join(' · ')}</Text>}

        <Text> </Text>
        <Text bold>
          ROUTER <Text dimColor>modo {mode}</Text>{' '}
          <Text color={usageColor(load)}>
            {load >= 95 ? '· todo a Haiku' : load >= 80 ? '· bajando un nivel' : '· presión normal'}
          </Text>
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="m-auto" label="auto" variant={mode === 'auto' ? 'primary' : 'secondary'} onPress={() => setMode($, 'auto')} />
          <Button key="m-sug" label="sugerir" variant={mode === 'sugerir' ? 'primary' : 'secondary'} onPress={() => setMode($, 'sugerir')} />
          <Button key="m-off" label="off" variant={mode === 'off' ? 'primary' : 'secondary'} onPress={() => setMode($, 'off')} />
          <Button
            key="clear"
            label="limpiar"
            onPress={() => update($, agentsAtom, list => (list ?? []).filter(a => a.status === 'running'))}
          />
        </Box>
        {agents.length > 0 && (
          <Text dimColor>
            {cheaper}/{agents.length} agentes en un modelo más barato que el principal
          </Text>
        )}

        <Text> </Text>
        <Text bold>
          AGENTES <Text dimColor>{running.length} activos · {agents.length} en total</Text>
        </Text>
        {agents.length === 0 && <Text dimColor>Ningún agente lanzado todavía.</Text>}
        {running.map(agentRow)}
        {finished.map(agentRow)}

        <Text> </Text>
        <Text bold>ORQUESTADOR</Text>
        {log.length === 0 && <Text dimColor>Aquí te cuento lo que pasa.</Text>}
        {log
          .slice(-30)
          .reverse()
          .map(entry => (
            <Text>
              <Text dimColor>{clock(entry.at)} </Text>
              <Text
                color={
                  entry.level === 'alert'
                    ? 'error'
                    : entry.level === 'warn'
                      ? 'warning'
                      : entry.level === 'ok'
                        ? 'success'
                        : 'text'
                }
              >
                {short(entry.text, Math.max(20, cols - 7))}
              </Text>
            </Text>
          ))}
      </Box>
    )
  })

  // Banda sobre el prompt: visible solo con agentes corriendo o uso ≥80%.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, usageAtom)
    const agents = await read($, agentsAtom)
    await read($, tickAtom)
    const running = agents.filter(a => a.status === 'running')
    const load = pressure(usage)
    if (running.length === 0 && load < 80) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns ?? 80
    const now = await $.clock.now()
    const five = pct(usage.windows, 'five_hour')
    const week = pct(usage.windows, 'seven_day')
    const aw = Math.max(6, Math.min(16, cols - 50))

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>pulse </Text>
          {five !== undefined && (
            <Text color={usageColor(five)}>
              5h {bar(five, 8)} {Math.round(five)}%{' '}
            </Text>
          )}
          {week !== undefined && (
            <Text color={usageColor(week)}>
              sem {bar(week, 8)} {Math.round(week)}%
            </Text>
          )}
          <Text dimColor>  /pulse para el panel</Text>
        </Text>
        {running.slice(0, 4).map(a => (
          <Text>
            <Text color="claude">▶ </Text>
            {short(a.description, Math.max(10, cols - aw - 34))}{' '}
            <Text color="claude">{bar(agentProgress(a), aw)}</Text>
            <Text dimColor>
              {' '}
              {TIER_LABEL[tierOf(a.model) ?? 'sonnet']} · {a.tools} herr. · {duration(now - a.startedAt)}
            </Text>
          </Text>
        ))}
        {running.length > 4 && <Text dimColor>  +{running.length - 4} agentes más</Text>}
      </Box>
    )
  })
}

async function setMode($: $, mode: PulseMode) {
  await $.state.set({ plugin: 'agent-pulse', key: 'mode' }, mode)
  await $.store.set('mode', mode)
  await narrate($, 'info', `Router en modo ${mode}.`)
}
