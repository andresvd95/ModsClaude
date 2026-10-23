import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type {
  PulseAgent,
  PulseAgentStatus,
  PulseDecider,
  PulseDecision,
  PulseLogLevel,
  PulseMode,
  PulseStep,
  PulseThinking,
  PulseTier,
  PulseUsage,
  PulseWindow,
} from '../types'

// agent-pulse v2: uso de Claude (5h / semanal), agentes con progreso, un router
// de modelo que deja ver su decisión (quién lanzó el agente, qué eligió Haiku y
// con cuánta confianza, si consultó a Sonnet y qué se asignó) y un orquestador
// que muestra en vivo qué modelo está pensando y a quién asignó cada tarea.
// Para ahorrar uso, Haiku y Sonnet solo devuelven modelo + confianza: sin texto libre.

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
const thinkingAtom = atom({ plugin: 'agent-pulse', key: 'thinking' } as const, [] as PulseThinking[])

const TIERS: PulseTier[] = ['haiku', 'sonnet', 'opus']
const TIER_LABEL: Record<PulseTier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
const DECIDER_LABEL: Record<PulseDecider, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  reglas: 'Reglas',
  workflow: 'Workflow',
}
// Llamadas a herramientas que se esperan por nivel: base de la barra estimada.
const EXPECTED_TOOLS: Record<PulseTier, number> = { haiku: 10, sonnet: 18, opus: 28 }
const ALERT_LEVELS = [50, 80, 95]
// Por debajo de esta confianza, Haiku pide segunda opinión a Sonnet.
const MIN_CONFIDENCE = 70
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

function modelLabel(model: string | undefined): string {
  const t = tierOf(model)
  return t ? TIER_LABEL[t] : model || '?'
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

const LOG_COLOR: Record<PulseLogLevel, string> = {
  alert: 'error',
  warn: 'warning',
  ok: 'success',
  info: 'text',
  think: 'suggestion',
  assign: 'claude',
}

async function narrate($: $, level: PulseLogLevel, text: string, toast = false) {
  const at = await $.clock.now()
  await update($, logAtom, list => [...(list ?? []), { at, level, text }].slice(-80))
  if (toast) $.ui.toast(text)
}

async function refreshStatus($: $) {
  const usage = await read($, usageAtom)
  const agents = await read($, agentsAtom)
  const thinking = await read($, thinkingAtom)
  const parts: string[] = []
  const five = pct(usage.windows, 'five_hour')
  const week = pct(usage.windows, 'seven_day')
  if (five !== undefined) parts.push(`5h ${Math.round(five)}%`)
  if (week !== undefined) parts.push(`sem ${Math.round(week)}%`)
  if (thinking.length > 0) parts.push(`${TIER_LABEL[thinking[thinking.length - 1]!.by]} pensando`)
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

const TIER_GUIDE = [
  'haiku: búsquedas, localizar archivos, leer y resumir, listar, grep, preguntas de un dato, cambios mecánicos triviales.',
  'sonnet: implementar o editar código, escribir tests, depurar errores comunes, investigación de varios pasos, la mayoría del trabajo.',
  'opus: arquitectura, diseño de sistemas, revisión de seguridad, depuración difícil o concurrente, refactors grandes, planes complejos, decisiones con mucho juicio.',
].join('\n')

// Respuesta mínima: sin texto libre, para gastar los menos tokens posibles.
const ANSWER_FORMAT = 'Responde SOLO con JSON, sin nada más: {"tier":"haiku|sonnet|opus","confidence":0-100}'

const HAIKU_SYSTEM = [
  'Eres el enrutador de modelos para subagentes de Claude Code. Elige el modelo MÁS BARATO que haga bien la tarea.',
  TIER_GUIDE,
  'Sé honesto con la confianza: si dudas entre dos modelos, pon menos de 70.',
  ANSWER_FORMAT,
].join('\n')

const SONNET_SYSTEM = [
  'Eres el segundo revisor del enrutador de modelos para subagentes de Claude Code. Haiku propuso un modelo y pidió tu opinión.',
  'Elige el modelo MÁS BARATO que haga bien la tarea; puedes confirmar o cambiar la propuesta de Haiku.',
  TIER_GUIDE,
  ANSWER_FORMAT,
].join('\n')

type Verdict = { tier: PulseTier; confidence: number }

function parseVerdict(text: string): Verdict | undefined {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return undefined
  try {
    const p = JSON.parse(m[0]) as { tier?: string; confidence?: number }
    const tier = TIERS.find(t => t === p.tier)
    if (!tier) return undefined
    const raw = typeof p.confidence === 'number' ? p.confidence : 80
    const confidence = Math.round(Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw)))
    return { tier, confidence }
  } catch {
    return undefined
  }
}

function byRules(e: AgentSpawnInput): { tier: PulseTier; thought: string } {
  const type = e.subagentType.toLowerCase()
  const text = `${e.description}\n${e.prompt}`.toLowerCase()
  if (/explore|docs-lookup|search/.test(type)) return { tier: 'haiku', thought: `tipo ${e.subagentType}: exploración` }
  if (/plan|architect|security|review/.test(type)) return { tier: 'opus', thought: `tipo ${e.subagentType}: juicio alto` }
  if (/arquitect|architect|diseñ|design|seguridad|security|vulnerab|race|concurren|deadlock|migraci|refactor/.test(text)) {
    return { tier: 'opus', thought: 'tarea de diseño o riesgo alto' }
  }
  if (/\b(busca|buscar|encuentra|localiza|lista|listar|resume|resumir|lee|leer|search|find|locate|list|grep|summari[sz]e|read)\b/.test(text) && text.length < 1500) {
    return { tier: 'haiku', thought: 'búsqueda o lectura simple' }
  }
  return { tier: 'sonnet', thought: 'trabajo general' }
}

// Un modelo "piensa": se marca en vivo en el panel, la banda y la barra de estado
// mientras dura la llamada. No se le pide texto libre ni se narra paso a paso.
async function think(
  $: $,
  by: 'haiku' | 'sonnet',
  key: string,
  description: string,
  system: string,
  prompt: string,
): Promise<PulseStep> {
  const startedAt = await $.clock.now()
  const id = `${key}|${by}`
  await update($, thinkingAtom, list => [...(list ?? []), { key: id, by, description, startedAt }])
  await refreshStatus($)
  try {
    const r = await $.model.complete({
      model: by,
      system: [{ text: system, cache: true }],
      prompt,
      maxTokens: 30,
      effort: 'low',
      timeoutMs: by === 'haiku' ? 10000 : 15000,
    })
    const ms = (await $.clock.now()) - startedAt
    const tokens = r.usage.input_tokens + r.usage.output_tokens
    const v = r.isAnswered ? parseVerdict(r.text) : undefined
    if (!v) return { by, ms, tokens, failed: true }
    return { by, tier: v.tier, confidence: v.confidence, ms, tokens }
  } finally {
    await update($, thinkingAtom, list => (list ?? []).filter(t => t.key !== id))
    await refreshStatus($)
  }
}

function taskText(e: AgentSpawnInput): string {
  return [
    `Lanzado por: ${e.parentModel}${e.parentAgentId ? ' (un subagente)' : ' (sesión principal)'}`,
    e.model ? `Modelo que pidió quien lo lanzó: ${e.model}` : '',
    `Tipo de agente: ${e.subagentType}`,
    `Descripción: ${e.description}`,
    `Tarea:\n${short(e.prompt, 1500)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

type Choice = { steps: PulseStep[]; decidedBy: PulseDecider; picked: PulseTier }

async function decide($: $, e: AgentSpawnInput): Promise<Choice> {
  // Un workflow que ya fijó modelo se respeta (salvo presión de uso).
  const fixed = e.workflow ? tierOf(e.model) : undefined
  if (fixed) {
    return {
      steps: [{ by: 'workflow', tier: fixed, thought: 'modelo fijado por el workflow' }],
      decidedBy: 'workflow',
      picked: fixed,
    }
  }

  const key = e.tool_use_id || `${e.description}|${await $.clock.now()}`
  const label = e.description || e.subagentType
  const ask = taskText(e)
  const steps: PulseStep[] = []

  const haiku = await think($, 'haiku', key, label, HAIKU_SYSTEM, ask)
  steps.push(haiku)

  // Segunda opinión: Haiku duda, o propone Opus (lo caro merece confirmarse).
  const unsure = haiku.tier !== undefined && (haiku.confidence ?? 100) < MIN_CONFIDENCE
  const pricey = haiku.tier === 'opus'
  if (unsure || pricey) {
    const sonnet = await think(
      $,
      'sonnet',
      key,
      label,
      SONNET_SYSTEM,
      `${ask}\n\nPropuesta de Haiku: ${haiku.tier} (confianza ${haiku.confidence}%)`,
    )
    steps.push(sonnet)
    if (sonnet.tier) return { steps, decidedBy: 'sonnet', picked: sonnet.tier }
    return { steps, decidedBy: 'haiku', picked: haiku.tier! }
  }
  if (haiku.tier) return { steps, decidedBy: 'haiku', picked: haiku.tier }

  // Haiku no respondió: reglas locales, sin coste.
  const rules = byRules(e)
  steps.push({ by: 'reglas', tier: rules.tier, thought: rules.thought })
  return { steps, decidedBy: 'reglas', picked: rules.tier }
}

function underPressure(tier: PulseTier, load: number): { tier: PulseTier; note?: string } {
  if (load >= 95 && tier !== 'haiku') {
    return { tier: 'haiku', note: `uso ${Math.round(load)}% ≥95% → Haiku` }
  }
  if (load >= 80 && tier !== 'haiku') {
    const lower = TIERS[TIERS.indexOf(tier) - 1]!
    return { tier: lower, note: `uso ${Math.round(load)}% ≥80% → baja a ${TIER_LABEL[lower]}` }
  }
  return { tier }
}

/** "Haiku 55% → Opus ⟶ Sonnet 90% → Sonnet" */
function chainText(d: PulseDecision): string {
  return d.steps
    .map(s =>
      s.failed
        ? `${DECIDER_LABEL[s.by]} ✗`
        : `${DECIDER_LABEL[s.by]}${s.confidence !== undefined ? ` ${s.confidence}%` : ''} → ${s.tier ? TIER_LABEL[s.tier] : '?'}`,
    )
    .join(' ⟶ ')
}

function launcherText(d: PulseDecision): string {
  const who = `${modelLabel(d.launcher)}${d.launcherIsAgent ? ' (subagente)' : ' (principal)'}`
  return d.requested ? `lanzó ${who}, pidió ${modelLabel(d.requested)}` : `lanzó ${who}`
}

/** "eligió Sonnet (90%)" o, con reglas o workflow, "eligió Reglas: tipo Explore". */
function decidedText(d: PulseDecision): string {
  const s = d.steps.find(x => x.by === d.decidedBy && !x.failed)
  const detail = s?.confidence !== undefined ? ` (${s.confidence}%)` : s?.thought ? `: ${s.thought}` : ''
  return `eligió ${DECIDER_LABEL[d.decidedBy]}${detail}`
}

// ---------- registro ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const stored = (await $.store.get('mode')) as PulseMode | undefined
    if (stored === 'auto' || stored === 'sugerir' || stored === 'off') {
      await $.state.set({ plugin: 'agent-pulse', key: 'mode' }, stored)
    }
    // Un pensamiento a medias de antes de una recarga ya no está corriendo.
    await $.state.set({ plugin: 'agent-pulse', key: 'thinking' }, [])

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

    // Reloj para tiempos transcurridos mientras hay agentes corriendo o modelos pensando.
    $.clock.every(1000, () => {
      void (async () => {
        const agents = await read($, agentsAtom)
        const thinking = await read($, thinkingAtom)
        if (thinking.length > 0 || agents.some(a => a.status === 'running')) {
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

    let decision: PulseDecision | undefined
    if (mode !== 'off') {
      const choice = await decide($, e)
      const adjusted = underPressure(choice.picked, load)
      decision = {
        ...choice,
        final: adjusted.tier,
        pressureNote: adjusted.note,
        requested: e.model,
        launcher: e.parentModel,
        launcherIsAgent: e.parentAgentId !== undefined,
        applied: mode === 'auto',
      }
    }

    const result = await next(decision?.applied ? { ...e, model: decision.final } : e)
    if (result.deny !== undefined || !result.agentId) return result

    const tier = tierOf(result.model) ?? decision?.final ?? 'sonnet'
    const desc = e.description || e.subagentType
    const reason = decision
      ? `${decision.applied ? '' : `sugerido ${TIER_LABEL[decision.final]} · `}${decidedText(decision)}${decision.pressureNote ? ` · ${decision.pressureNote}` : ''}`
      : 'router apagado'
    const agent: PulseAgent = {
      id: result.agentId,
      description: desc,
      type: e.subagentType,
      model: result.model,
      parentModel: e.parentModel,
      reason,
      decision,
      status: 'running',
      startedAt: await $.clock.now(),
      tools: 0,
      expected: EXPECTED_TOOLS[tier],
    }
    await update($, agentsAtom, list => [...(list ?? []), agent].slice(-40))

    // Una sola línea por agente: a quién se asignó y quién lo decidió.
    if (!decision) {
      await narrate($, 'assign', `▶ "${short(desc, 40)}" → ${TIER_LABEL[tier]} · router apagado`)
    } else if (decision.applied) {
      await narrate(
        $,
        'assign',
        `▶ "${short(desc, 40)}" → ${TIER_LABEL[tier]} · decidió ${DECIDER_LABEL[decision.decidedBy]}${decision.pressureNote ? ` · ${decision.pressureNote}` : ''}`,
        true,
      )
    } else {
      await narrate(
        $,
        'assign',
        `💡 "${short(desc, 40)}" → sugiere ${TIER_LABEL[decision.final]} (decidió ${DECIDER_LABEL[decision.decidedBy]}), corre en ${TIER_LABEL[tier]}`,
      )
    }
    await refreshStatus($)
    return result
  }).catch(async ($, e, next) => {
    // Si el router falla, el agente arranca igual y nada queda "pensando".
    await $.state.set({ plugin: 'agent-pulse', key: 'thinking' }, [])
    return next(e)
  })

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
      `${icon} "${short(agent.description, 40)}" (${modelLabel(u?.model ?? agent.model)}) ${verb} en ${duration(e.durationMs)} · ${agent.tools} herramientas${tokens ? ` · ${kTokens(tokens)}` : ''}`,
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
    const thinking = await read($, thinkingAtom)
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
    const decided = agents.filter(a => a.decision)
    const byDecider = (Object.keys(DECIDER_LABEL) as PulseDecider[])
      .map(d => ({ d, n: decided.filter(a => a.decision!.decidedBy === d).length }))
      .filter(x => x.n > 0)
    const byTier = TIERS.map(t => ({ t, n: agents.filter(a => tierOf(a.model) === t).length })).filter(
      x => x.n > 0,
    )

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
      const d = a.decision
      return (
        <Box key={`a-${a.id}`} flexDirection="column">
          <Text>
            <Text color={color}>{icon} </Text>
            <Text bold>{short(a.description, Math.max(12, cols - 24))}</Text>
            <Text dimColor> {a.type} · </Text>
            <Text color="claude" bold>
              {modelLabel(a.model)}
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
          {d ? (
            <Box flexDirection="column">
              <Text>
                {'  '}
                <Text color="suggestion">🧭 {short(chainText(d), Math.max(20, cols - 6))}</Text>
              </Text>
              <Text dimColor>
                {'  '}
                {short(
                  `${decidedText(d)}${d.pressureNote ? ` · ${d.pressureNote}` : ''}${d.applied ? '' : ' · solo sugerido'} · ${launcherText(d)}`,
                  Math.max(20, cols - 4),
                )}
              </Text>
            </Box>
          ) : (
            <Text dimColor>
              {'  '}
              {short(a.reason, Math.max(20, cols - 4))}
            </Text>
          )}
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
        <Text dimColor>{`Haiku decide · si duda (<${MIN_CONFIDENCE}%) o propone Opus, confirma Sonnet · sin respuesta, reglas`}</Text>
        {byDecider.length > 0 && (
          <Text>
            <Text dimColor>Quién decidió: </Text>
            {byDecider.map(x => `${DECIDER_LABEL[x.d]} ${x.n}`).join(' · ')}
          </Text>
        )}
        {byTier.length > 0 && (
          <Text>
            <Text dimColor>Asignados a: </Text>
            {byTier.map(x => `${TIER_LABEL[x.t]} ${x.n}`).join(' · ')}
          </Text>
        )}
        {agents.length > 0 && (
          <Text dimColor>
            {cheaper}/{agents.length} agentes en un modelo más barato que quien los lanzó
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
        {thinking.map(t => (
          <Text key={`t-${t.key}`}>
            <Text color="suggestion" bold>
              🧠 {TIER_LABEL[t.by]} pensando
            </Text>
            <Text> "{short(t.description, Math.max(10, cols - 30))}"</Text>
            <Text dimColor> · {duration(now - t.startedAt)}</Text>
          </Text>
        ))}
        {log.length === 0 && thinking.length === 0 && <Text dimColor>Aquí te cuento lo que pasa.</Text>}
        {log
          .slice(-30)
          .reverse()
          .map(entry => (
            <Text>
              <Text dimColor>{clock(entry.at)} </Text>
              <Text color={LOG_COLOR[entry.level] ?? 'text'} bold={entry.level === 'assign'}>
                {short(entry.text, Math.max(20, cols - 7))}
              </Text>
            </Text>
          ))}
      </Box>
    )
  })

  // Banda sobre el prompt: visible con modelos pensando, agentes corriendo o uso ≥80%.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, usageAtom)
    const agents = await read($, agentsAtom)
    const thinking = await read($, thinkingAtom)
    await read($, tickAtom)
    const running = agents.filter(a => a.status === 'running')
    const load = pressure(usage)
    if (running.length === 0 && thinking.length === 0 && load < 80) return next(e)

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
        {thinking.map(t => (
          <Text key={`bt-${t.key}`}>
            <Text color="suggestion">🧠 {TIER_LABEL[t.by]} pensando a quién asignar </Text>
            "{short(t.description, Math.max(10, cols - 46))}"
            <Text dimColor> · {duration(now - t.startedAt)}</Text>
          </Text>
        ))}
        {running.slice(0, 4).map(a => (
          <Text>
            <Text color="claude">▶ </Text>
            {short(a.description, Math.max(10, cols - aw - 44))}{' '}
            <Text color="claude">{bar(agentProgress(a), aw)}</Text>
            <Text dimColor>
              {' '}
              {modelLabel(a.model)}
              {a.decision ? ` (eligió ${DECIDER_LABEL[a.decision.decidedBy]})` : ''} · {a.tools} herr. ·{' '}
              {duration(now - a.startedAt)}
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
