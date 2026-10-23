export type PulseTier = 'haiku' | 'sonnet' | 'opus'

export type PulseWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type PulseUsage = {
  windows: PulseWindow[]
  costUsd?: number
  contextPercent?: number
  updatedAt: number
}

export type PulseAgentStatus = 'running' | 'done' | 'failed' | 'aborted'

/** Quién tomó (o intentó tomar) la decisión de modelo. */
export type PulseDecider = 'haiku' | 'sonnet' | 'reglas' | 'workflow'

/** Un paso de la cadena de decisión: lo que pensó y eligió cada decisor. */
export type PulseStep = {
  by: PulseDecider
  tier?: PulseTier
  /** 0–100 */
  confidence?: number
  /** Etiqueta local (reglas o workflow); los modelos no escriben texto libre. */
  thought?: string
  ms?: number
  tokens?: number
  failed?: boolean
}

export type PulseDecision = {
  steps: PulseStep[]
  /** El decisor cuya elección se tomó. */
  decidedBy: PulseDecider
  /** Lo que eligió el decisor, antes del ajuste por uso. */
  picked: PulseTier
  /** Lo que se asignó tras el ajuste por uso. */
  final: PulseTier
  pressureNote?: string
  /** Modelo que pidió quien lanzó el agente (parámetro `model`), si pidió alguno. */
  requested?: string
  /** Modelo de quien lanzó el agente. */
  launcher: string
  /** true si quien lo lanzó era un subagente y no la sesión principal. */
  launcherIsAgent: boolean
  /** false en modo sugerir: solo se mostró. */
  applied: boolean
}

export type PulseAgent = {
  id: string
  description: string
  type: string
  model: string
  parentModel: string
  reason: string
  decision?: PulseDecision
  status: PulseAgentStatus
  startedAt: number
  endedAt?: number
  tools: number
  lastTool?: string
  expected: number
  tokens?: number
}

/** Un modelo pensando ahora mismo para el router. */
export type PulseThinking = {
  key: string
  by: 'haiku' | 'sonnet'
  description: string
  startedAt: number
}

export type PulseLogLevel = 'info' | 'ok' | 'warn' | 'alert' | 'think' | 'assign'

export type PulseLogEntry = { at: number; level: PulseLogLevel; text: string }

export type PulseMode = 'auto' | 'sugerir' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'agent-pulse': {
      usage: PulseUsage
      agents: PulseAgent[]
      log: PulseLogEntry[]
      mode: PulseMode
      tick: number
      thinking: PulseThinking[]
    }
  }
}
