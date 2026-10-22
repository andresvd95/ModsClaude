export type PulseTier = 'haiku' | 'sonnet' | 'opus'

export type PulseWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type PulseUsage = {
  windows: PulseWindow[]
  costUsd?: number
  contextPercent?: number
  updatedAt: number
}

export type PulseAgentStatus = 'running' | 'done' | 'failed' | 'aborted'

export type PulseAgent = {
  id: string
  description: string
  type: string
  model: string
  parentModel: string
  reason: string
  status: PulseAgentStatus
  startedAt: number
  endedAt?: number
  tools: number
  lastTool?: string
  expected: number
  tokens?: number
}

export type PulseLogLevel = 'info' | 'ok' | 'warn' | 'alert'

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
    }
  }
}
