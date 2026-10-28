import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TrailEntry, TrailSummary } from '../types'

// skill-trail: mini historial de las skills que se usan y la "skill grande"
// activa (Superpowers, ECC…). El historial vive en ~/.skill-trail/trail.jsonl,
// que también llenan Codex y Hermes, a través del CLI que trae el mod.

const PANE = 'skill-trail'
const TITLE = 'Skill Trail'

const EMPTY: TrailSummary = { recent: [], top: [], total: 0, agents: [] }
const summaryAtom = atom({ plugin: 'skill-trail', key: 'summary' } as const, EMPTY)
const cwdAtom = atom({ plugin: 'skill-trail', key: 'cwd' } as const, '')

// Marcos de trabajo que un plugin inyecta al iniciar la sesión.
const FRAMEWORKS: { key: string; label: string; test: RegExp }[] = [
  { key: 'superpowers', label: 'Superpowers', test: /superpowers/i },
  { key: 'ecc', label: 'Everything Claude Code', test: /\bECC[:\s]|everything-claude-code/ },
  { key: 'engram', label: 'Engram', test: /\bengram\b/i },
  { key: 'octopus-agents', label: 'Octopus Agents', test: /octopus-agents/i },
  { key: 'vedev', label: 'vedev', test: /\bvedev\b/i },
  { key: 'gsd', label: 'Get Shit Done', test: /get shit done/i },
  { key: 'bmad', label: 'BMAD', test: /\bBMAD\b/ },
]
const AGENT_ICON: Record<string, string> = { claude: '✳', codex: '◎', hermes: '☿' }

type $ = EngineInterface

// ---------- utilidades ----------

function shortSkill(skill: string): string {
  const i = skill.indexOf(':')
  return i > 0 ? skill.slice(i + 1) : skill
}

function packOf(e: TrailEntry): string | undefined {
  if (e.pack) return e.pack
  const i = e.skill.indexOf(':')
  return i > 0 ? e.skill.slice(0, i) : undefined
}

function short(text: string, n: number): string {
  return text.length > n ? text.slice(0, Math.max(1, n - 1)) + '…' : text
}

function when(at: number, now: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(now).toDateString() === d.toDateString()
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

function detectFrameworks(text: string): string[] {
  return FRAMEWORKS.filter(f => f.test.test(text)).map(f => f.key)
}

// Sin Node o sin CLI: el panel sigue con lo usado en esta sesión.
function addLocal(s: TrailSummary, e: TrailEntry): TrailSummary {
  if (e.via === 'marco') {
    const label = FRAMEWORKS.find(f => f.key === e.skill)?.label ?? e.skill
    return s.active ? s : { ...s, active: { name: e.skill, label, source: 'cargada al iniciar (claude)' }, shared: false }
  }
  const counts = new Map(s.top)
  counts.set(e.skill, (counts.get(e.skill) ?? 0) + 1)
  return {
    ...s,
    recent: [e, ...s.recent].slice(0, 40),
    top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    total: s.total + 1,
    agents: s.agents.includes('claude') ? s.agents : [...s.agents, 'claude'],
    shared: false,
  }
}

async function cli($: $, args: string[]): Promise<string | undefined> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/cli/skill-trail.mjs`, ...args], { timeoutMs: 8000 })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch {
    return undefined
  }
}

function statusText(s: TrailSummary): string | undefined {
  const parts: string[] = []
  if (s.active) parts.push(`⚡${s.active.label}`)
  const last = s.recent[0]
  if (last) parts.push(`último: ${shortSkill(last.skill)}`)
  return parts.length ? `skills · ${parts.join(' · ')}` : undefined
}

async function refresh($: $) {
  const cwd = await read($, cwdAtom)
  const out = await cli($, ['json', '--project', cwd || '.'])
  if (out) {
    try {
      const parsed = JSON.parse(out) as TrailSummary
      await $.state.set({ plugin: 'skill-trail', key: 'summary' }, { ...parsed, shared: true })
    } catch {
      // se queda el resumen anterior
    }
  }
  $.ui.status(statusText(await read($, summaryAtom)))
}

async function recordUse($: $, e: Omit<TrailEntry, 'at' | 'agent' | 'project'>) {
  const cwd = await read($, cwdAtom)
  const args = ['record', '--agent', 'claude', '--skill', e.skill, '--project', cwd || '.']
  if (e.pack) args.push('--pack', e.pack)
  if (e.via) args.push('--via', e.via)
  if (e.session) args.push('--session', e.session)
  const ok = await cli($, args)
  if (ok === undefined) {
    const entry: TrailEntry = { ...e, at: await $.clock.now(), agent: 'claude', project: cwd }
    await update($, summaryAtom, s => addLocal(s ?? EMPTY, entry))
    $.ui.status(statusText(await read($, summaryAtom)))
    return
  }
  await refresh($)
}

// ---------- registro ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.state.set({ plugin: 'skill-trail', key: 'cwd' }, e.cwd)
    await $.command.register({
      name: 'trail',
      description: 'Skill Trail: historial de skills y skill grande activa (fijar <x> | soltar | limpiar)',
      argumentHint: '[fijar <nombre>|soltar|limpiar]',
    })
    await refresh($)
    return result
  })

  // La skill grande: lo que los plugins inyectan al arrancar (p. ej. "You have superpowers").
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const text = (result.additionalContext ?? []).join('\n')
    const found = detectFrameworks(text)
    if (found.length) {
      if (e.cwd) await $.state.set({ plugin: 'skill-trail', key: 'cwd' }, e.cwd)
      for (const key of found) await recordUse($, { skill: key, via: 'marco', session: e.session_id })
    }
    return result
  }).catch(($, e, next) => next(e))

  // Cada skill que se carga: /nombre, la herramienta Skill o precargada en un subagente.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    await recordUse($, { skill: e.skill, pack: e.pluginName, via: String(e.source) })
    return result
  }).catch(($, e, next) => next(e)) // registrar nunca bloquea una skill

  on('command.run', { command: 'trail' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const cwd = (await read($, cwdAtom)) || '.'
    const v = verb.toLowerCase()
    if (v === 'fijar' && rest.length) {
      await cli($, ['fijar', rest.join(' '), '--project', cwd])
      await refresh($)
      return { text: `Skill Trail: skill grande fijada en ${rest.join(' ')}.` }
    }
    if (v === 'soltar') {
      await cli($, ['soltar', '--project', cwd])
      await refresh($)
      return { text: 'Skill Trail: la skill grande vuelve a detectarse sola.' }
    }
    if (v === 'limpiar') {
      await cli($, ['limpiar', '--project', cwd])
      await $.state.set({ plugin: 'skill-trail', key: 'summary' }, EMPTY)
      await refresh($)
      return { text: 'Skill Trail: historial del proyecto borrado.' }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Skill Trail abierto.' }
  })

  // ---------- dibujo ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, summaryAtom)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns ?? 60
    const pinned = s.active?.source === 'fijada'

    return (
      <Box flexDirection="column">
        <Text bold>SKILL GRANDE</Text>
        {s.active ? (
          <Text>
            <Text bold color="claude">⚡ {s.active.label}</Text>
            <Text dimColor> · {s.active.source}</Text>
          </Text>
        ) : (
          <Text dimColor>Ninguna detectada todavía. Fíjala con /trail fijar &lt;nombre&gt;.</Text>
        )}
        {s.active?.also && s.active.also.length > 0 && (
          <Text dimColor>también activas: {s.active.also.join(', ')}</Text>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="refresh" label="actualizar" onPress={() => refresh($)} />
          {pinned && (
            <Button
              key="unpin"
              label="soltar"
              onPress={async () => {
                await cli($, ['soltar', '--project', (await read($, cwdAtom)) || '.'])
                await refresh($)
              }}
            />
          )}
        </Box>

        <Text> </Text>
        <Text bold>
          MÁS USADAS{' '}
          <Text dimColor>
            {s.total} usos · {s.agents.length ? s.agents.join(', ') : 'sin agentes'}
            {s.shared === false ? ' · solo esta sesión' : ''}
          </Text>
        </Text>
        {s.top.length === 0 && <Text dimColor>Nada todavía.</Text>}
        {s.top.map(([skill, n]) => (
          <Text key={`t-${skill}`}>
            <Text color="suggestion">{String(n).padStart(3)}×</Text> {short(skill, Math.max(12, cols - 6))}
          </Text>
        ))}

        <Text> </Text>
        <Text bold>HISTORIAL</Text>
        {s.recent.length === 0 && <Text dimColor>Aún no se ha usado ninguna skill en este proyecto.</Text>}
        {s.recent.slice(0, 20).map((r, i) => {
          const pack = packOf(r)
          return (
            <Text key={`r-${i}-${r.at}`}>
              <Text dimColor>{when(r.at, now)} </Text>
              <Text color={r.agent === 'claude' ? 'claude' : 'suggestion'}>{AGENT_ICON[r.agent] ?? '•'} </Text>
              <Text bold>{short(shortSkill(r.skill), Math.max(10, cols - 30))}</Text>
              <Text dimColor>
                {pack ? ` · ${pack}` : ''} · {r.agent}
              </Text>
            </Text>
          )
        })}
        <Text> </Text>
        <Text dimColor>✳ Claude · ◎ Codex · ☿ Hermes — /trail fijar &lt;x&gt; · /trail soltar · /trail limpiar</Text>
      </Box>
    )
  })
}
