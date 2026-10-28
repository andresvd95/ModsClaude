/** Un uso de skill en el historial compartido (~/.skill-trail/trail.jsonl). */
export type TrailEntry = {
  /** Epoch en ms. */
  at: number
  /** claude | codex | hermes */
  agent: string
  project: string
  skill: string
  /** Plugin o pack que trae la skill (superpowers, ecc…). */
  pack?: string
  /** Cómo llegó: skill, /comando, marco (inyectada al iniciar sesión), lectura… */
  via?: string
  session?: string
}

export type TrailActive = {
  name: string
  label: string
  /** fijada · cargada al iniciar (claude) · N usos */
  source: string
  also?: string[]
}

export type TrailSummary = {
  project?: string
  active?: TrailActive
  recent: TrailEntry[]
  top: [string, number][]
  total: number
  agents: string[]
  /** true si viene del CLI compartido; false si solo son los usos de esta sesión. */
  shared?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'skill-trail': {
      summary: TrailSummary
      cwd: string
    }
  }
}
