#!/usr/bin/env node
// skill-trail: historial de skills y "skill grande" activa, compartido entre
// Claude Code, Codex y Hermes. Sin dependencias: solo Node 18+.
//
//   skill-trail                     historial del proyecto actual
//   skill-trail show [--all] [--n 20] [--project <dir>]
//   skill-trail status [--project <dir>]   una línea, para barras de estado
//   skill-trail json [--project <dir>]     resumen en JSON (lo usa el mod de Claude)
//   skill-trail fijar <pack|skill>         fija la skill grande del proyecto
//   skill-trail soltar                     vuelve a detectarla sola
//   skill-trail limpiar [--all]            borra el historial del proyecto (o todo)
//   skill-trail record --agent a --skill s [--pack p] [--via v] [--project dir]
//   skill-trail hook codex                 hook de Codex (lee JSON por stdin)
//   skill-trail install | uninstall        Codex + Hermes + atajo en la terminal

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.SKILL_TRAIL_HOME || path.join(os.homedir(), '.skill-trail')
const TRAIL = path.join(HOME, 'trail.jsonl')
const PINS = path.join(HOME, 'pins.json')
const MAX_LINES = 4000
const DEDUPE_MS = 2 * 60 * 1000

// Packs que se comportan como marco de trabajo (la "skill grande").
const FRAMEWORKS = {
  superpowers: 'Superpowers',
  ecc: 'Everything Claude Code',
  engram: 'Engram',
  'octopus-agents': 'Octopus Agents',
  vedev: 'vedev',
  gsd: 'Get Shit Done',
  bmad: 'BMAD',
}

// ---------- datos ----------

function normProject(p) {
  return path.resolve(p || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function readTrail() {
  let text = ''
  try {
    text = fs.readFileSync(TRAIL, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // línea rota: se ignora
    }
  }
  return out
}

function writeTrail(entries) {
  fs.mkdirSync(HOME, { recursive: true })
  fs.writeFileSync(TRAIL, entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''))
}

function readPins() {
  try {
    return JSON.parse(fs.readFileSync(PINS, 'utf8'))
  } catch {
    return {}
  }
}

function writePins(pins) {
  fs.mkdirSync(HOME, { recursive: true })
  fs.writeFileSync(PINS, JSON.stringify(pins, null, 2))
}

export function record({ agent, skill, pack, via, project, session, at }) {
  if (!skill) return false
  const entry = {
    at: at ?? Date.now(),
    agent: agent || 'otro',
    project: normProject(project),
    skill: String(skill),
    ...(pack ? { pack: String(pack) } : {}),
    ...(via ? { via: String(via) } : {}),
    ...(session ? { session: String(session) } : {}),
  }
  const all = readTrail()
  // Misma skill, mismo agente y proyecto en menos de 2 min: es la misma carga.
  const dup = all
    .slice(-30)
    .some(
      e =>
        e.agent === entry.agent &&
        e.project === entry.project &&
        e.skill === entry.skill &&
        entry.at - e.at < DEDUPE_MS,
    )
  if (dup) return false
  fs.mkdirSync(HOME, { recursive: true })
  if (all.length >= MAX_LINES) {
    writeTrail([...all.slice(-(MAX_LINES / 2)), entry])
  } else {
    fs.appendFileSync(TRAIL, JSON.stringify(entry) + '\n')
  }
  return true
}

// ---------- resumen ----------

function packOf(e) {
  if (e.pack) return e.pack
  const i = e.skill.indexOf(':')
  return i > 0 ? e.skill.slice(0, i) : undefined
}

function shortSkill(e) {
  const i = e.skill.indexOf(':')
  return i > 0 ? e.skill.slice(i + 1) : e.skill
}

export function summarize(entries, project, pins = readPins()) {
  const mine = project ? entries.filter(e => e.project === project) : entries
  const uses = mine.filter(e => e.via !== 'marco')
  const count = new Map()
  const packCount = new Map()
  for (const e of uses) {
    count.set(e.skill, (count.get(e.skill) ?? 0) + 1)
    const p = packOf(e)
    if (p) packCount.set(p, (packCount.get(p) ?? 0) + 1)
  }

  // Skill grande: 1) fijada, 2) marco detectado al iniciar sesión, 3) el pack más usado.
  let active
  const pin = project ? pins[project] : undefined
  if (pin) {
    active = { name: pin, label: FRAMEWORKS[pin] ?? pin, source: 'fijada' }
  } else {
    // Los marcos que inyectó el último arranque de sesión; manda el de más prioridad.
    const last = [...mine].reverse().find(e => e.via === 'marco')
    const marcos = last
      ? [...new Set(mine.filter(e => e.via === 'marco' && e.session === last.session).map(e => e.skill))]
      : []
    const order = Object.keys(FRAMEWORKS)
    marcos.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    const frameworkUse = [...packCount.entries()]
      .filter(([p]) => FRAMEWORKS[p])
      .sort((a, b) => b[1] - a[1])[0]
    const top = [...packCount.entries()].sort((a, b) => b[1] - a[1])[0]
    if (marcos.length) {
      const [main, ...also] = marcos
      active = {
        name: main,
        label: FRAMEWORKS[main] ?? main,
        source: `cargada al iniciar (${last.agent})`,
        also: also.map(m => FRAMEWORKS[m] ?? m),
      }
    } else if (frameworkUse) {
      active = { name: frameworkUse[0], label: FRAMEWORKS[frameworkUse[0]], source: `${frameworkUse[1]} usos` }
    } else if (top && top[1] >= 2) {
      active = { name: top[0], label: FRAMEWORKS[top[0]] ?? top[0], source: `${top[1]} usos` }
    }
  }

  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const agents = [...new Set(uses.map(e => e.agent))]
  return { project, active, recent: uses.slice(-40).reverse(), top, total: uses.length, agents, packs: [...packCount.entries()].sort((a, b) => b[1] - a[1]) }
}

// ---------- salida ----------

const tty = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = s => c('1', s)
const dim = s => c('2', s)
const accent = s => c('38;5;173', s)
const AGENT_ICON = { claude: '✳', codex: '◎', hermes: '☿' }

function clock(at) {
  const d = new Date(at)
  const pad = n => String(n).padStart(2, '0')
  const today = new Date().toDateString() === d.toDateString()
  return today ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

function show(sum, n) {
  const lines = []
  lines.push(bold('SKILL GRANDE'))
  lines.push(
    sum.active
      ? `  ${accent('⚡ ' + sum.active.label)} ${dim('· ' + sum.active.source)}` +
          (sum.active.also?.length ? dim(` · también: ${sum.active.also.join(', ')}`) : '')
      : dim('  Ninguna detectada todavía (usa "skill-trail fijar <nombre>" para elegirla).'),
  )
  lines.push('')
  lines.push(bold('MÁS USADAS') + dim(`  ${sum.total} usos · ${sum.agents.join(', ') || 'sin agentes'}`))
  if (sum.top.length === 0) lines.push(dim('  Nada todavía.'))
  for (const [skill, k] of sum.top) lines.push(`  ${String(k).padStart(3)}× ${skill}`)
  lines.push('')
  lines.push(bold('HISTORIAL'))
  if (sum.recent.length === 0) lines.push(dim('  Aún no se ha usado ninguna skill aquí.'))
  for (const e of sum.recent.slice(0, n)) {
    const pack = packOf(e)
    lines.push(
      `  ${dim(clock(e.at))} ${AGENT_ICON[e.agent] ?? '•'} ${bold(shortSkill(e))}` +
        dim(`${pack ? ` · ${pack}` : ''} · ${e.agent}${e.via ? ` · ${e.via}` : ''}`),
    )
  }
  return lines.join('\n')
}

function statusLine(sum) {
  const parts = []
  if (sum.active) parts.push(`⚡${sum.active.label}`)
  const last = sum.recent[0]
  if (last) parts.push(`último: ${shortSkill(last)}`)
  return parts.length ? `skills · ${parts.join(' · ')}` : 'skills · sin uso aún'
}

// ---------- Codex ----------

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

// Ruta de un SKILL.md → { skill, pack }; el pack es el plugin que lo trae.
export function fromSkillPath(p) {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  const i = parts.lastIndexOf('SKILL.md')
  if (i < 2 || parts[i - 2] !== 'skills') return undefined
  const skill = parts[i - 1]
  const cache = parts.indexOf('cache')
  // .../plugins/cache/<marketplace>/<plugin>/<versión>/skills/<skill>/SKILL.md
  const pack = cache > 0 && parts[cache - 1] === 'plugins' ? parts[cache + 2] : undefined
  return pack ? { skill, pack } : { skill }
}

function codexSkillNames() {
  const names = new Map()
  const roots = [path.join(codexHome(), 'skills'), path.join(os.homedir(), '.agents', 'skills')]
  for (const root of roots) {
    try {
      for (const d of fs.readdirSync(root)) names.set(d.toLowerCase(), { skill: d })
    } catch {}
  }
  const cache = path.join(codexHome(), 'plugins', 'cache')
  try {
    for (const market of fs.readdirSync(cache))
      for (const plugin of fs.readdirSync(path.join(cache, market)))
        for (const ver of fs.readdirSync(path.join(cache, market, plugin)))
          try {
            for (const s of fs.readdirSync(path.join(cache, market, plugin, ver, 'skills')))
              names.set(s.toLowerCase(), { skill: s, pack: plugin })
          } catch {}
  } catch {}
  return names
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

export function codexHook(input) {
  const event = input.hook_event_name
  const project = input.cwd
  const session = input.session_id
  if (event === 'UserPromptSubmit' && typeof input.prompt === 'string') {
    // Invocación explícita en Codex: "$nombre-de-skill".
    const known = codexSkillNames()
    for (const m of input.prompt.matchAll(/\$([A-Za-z0-9][\w.:-]*)/g)) {
      const hit = known.get(m[1].toLowerCase())
      if (hit) record({ agent: 'codex', project, session, via: '$mención', ...hit })
    }
    return
  }
  if (event === 'PostToolUse') {
    // Codex carga una skill leyendo su SKILL.md con la shell.
    const blob = JSON.stringify(input.tool_input ?? {}).replace(/\\\\/g, '/')
    for (const m of blob.matchAll(/[^"'\s]*skills\/+[^"'\s/]+\/+SKILL\.md/gi)) {
      const hit = fromSkillPath(m[0])
      if (hit) record({ agent: 'codex', project, session, via: 'lectura', ...hit })
    }
  }
}

// ---------- instalación ----------

const SELF = fileURLToPath(import.meta.url)
const BIN = path.join(HOME, 'bin')
const INSTALLED = path.join(BIN, 'skill-trail.mjs')
const HOOK_MARK = 'skill-trail.mjs hook codex'

function slash(p) {
  return p.replace(/\\/g, '/')
}

function hermesHomes() {
  const homes = new Set()
  if (process.env.HERMES_HOME) homes.add(process.env.HERMES_HOME)
  homes.add(path.join(os.homedir(), '.hermes'))
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) homes.add(path.join(process.env.LOCALAPPDATA, 'hermes'))
  return [...homes].filter(h => fs.existsSync(path.join(h, 'config.yaml')))
}

// Añade o quita "skill-trail" de plugins.enabled sin tocar el resto del YAML.
export function editHermesConfig(text, add) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const top = lines.findIndex(l => /^plugins:\s*$/.test(l))
  if (top < 0) {
    return add ? text.replace(/\s*$/, nl) + `plugins:${nl}  enabled:${nl}    - skill-trail${nl}` : text
  }
  let en = -1
  for (let i = top + 1; i < lines.length && /^(\s|$)/.test(lines[i]); i++) {
    if (/^\s+enabled:\s*$/.test(lines[i])) en = i
  }
  if (en < 0) {
    if (!add) return text
    lines.splice(top + 1, 0, '  enabled:', '    - skill-trail')
    return lines.join(nl)
  }
  let i = en + 1
  let found = -1
  let indent = '    '
  for (; i < lines.length && /^\s+-\s/.test(lines[i]); i++) {
    indent = lines[i].match(/^(\s+)/)[1]
    if (/^\s+-\s+skill-trail\s*$/.test(lines[i])) found = i
  }
  if (add && found < 0) lines.splice(i, 0, `${indent}- skill-trail`)
  else if (!add && found >= 0) lines.splice(found, 1)
  else return text
  return lines.join(nl)
}

function install() {
  const done = []
  const here = path.dirname(SELF)
  fs.mkdirSync(BIN, { recursive: true })
  if (path.resolve(SELF) !== path.resolve(INSTALLED)) fs.copyFileSync(SELF, INSTALLED)
  done.push(`CLI → ${INSTALLED}`)

  // Atajo "skill-trail" en la terminal (Warp, Orca, Windows Terminal…).
  const localBin = path.join(os.homedir(), '.local', 'bin')
  if (fs.existsSync(localBin)) {
    fs.writeFileSync(path.join(localBin, 'skill-trail.cmd'), `@echo off\r\nnode "${INSTALLED}" %*\r\n`)
    fs.writeFileSync(path.join(localBin, 'skill-trail'), `#!/bin/sh\nexec node "${slash(INSTALLED)}" "$@"\n`, { mode: 0o755 })
    done.push(`atajo "skill-trail" → ${localBin}`)
  }

  // Codex: hooks + skill $skill-trail.
  const ch = codexHome()
  if (fs.existsSync(ch)) {
    const hooksFile = path.join(ch, 'hooks.json')
    let conf = { hooks: {} }
    try {
      conf = JSON.parse(fs.readFileSync(hooksFile, 'utf8'))
      fs.copyFileSync(hooksFile, hooksFile + '.skill-trail.bak')
    } catch {}
    conf.hooks ??= {}
    const cmd = `node ${slash(INSTALLED)} hook codex`
    for (const ev of ['UserPromptSubmit', 'PostToolUse']) {
      const list = (conf.hooks[ev] ??= [])
      const has = list.some(g => (g.hooks ?? []).some(h => String(h.command).includes(HOOK_MARK)))
      if (!has) list.push({ hooks: [{ type: 'command', command: cmd, timeout: 5 }] })
    }
    fs.writeFileSync(hooksFile, JSON.stringify(conf, null, 2) + '\n')
    done.push(`Codex hooks → ${hooksFile}`)

    const skillDir = path.join(ch, 'skills', 'skill-trail')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.copyFileSync(path.join(here, '..', 'codex', 'SKILL.md'), path.join(skillDir, 'SKILL.md'))
    done.push(`Codex skill $skill-trail → ${skillDir}`)
  }

  // Hermes: plugin + habilitarlo en config.yaml.
  for (const hh of hermesHomes()) {
    const dest = path.join(hh, 'plugins', 'skill-trail')
    fs.mkdirSync(dest, { recursive: true })
    for (const f of ['plugin.yaml', '__init__.py']) fs.copyFileSync(path.join(here, '..', 'hermes', f), path.join(dest, f))
    const cfg = path.join(hh, 'config.yaml')
    const before = fs.readFileSync(cfg, 'utf8')
    const after = editHermesConfig(before, true)
    if (after !== before) {
      fs.copyFileSync(cfg, cfg + '.skill-trail.bak')
      fs.writeFileSync(cfg, after)
    }
    done.push(`Hermes plugin → ${dest}`)
  }
  return done
}

function uninstall() {
  const done = []
  const ch = codexHome()
  const hooksFile = path.join(ch, 'hooks.json')
  try {
    const conf = JSON.parse(fs.readFileSync(hooksFile, 'utf8'))
    for (const ev of Object.keys(conf.hooks ?? {})) {
      conf.hooks[ev] = conf.hooks[ev].filter(g => !(g.hooks ?? []).some(h => String(h.command).includes(HOOK_MARK)))
      if (conf.hooks[ev].length === 0) delete conf.hooks[ev]
    }
    fs.writeFileSync(hooksFile, JSON.stringify(conf, null, 2) + '\n')
    done.push('Codex hooks quitados')
  } catch {}
  fs.rmSync(path.join(ch, 'skills', 'skill-trail'), { recursive: true, force: true })
  for (const hh of hermesHomes()) {
    fs.rmSync(path.join(hh, 'plugins', 'skill-trail'), { recursive: true, force: true })
    const cfg = path.join(hh, 'config.yaml')
    fs.writeFileSync(cfg, editHermesConfig(fs.readFileSync(cfg, 'utf8'), false))
    done.push(`Hermes plugin quitado de ${hh}`)
  }
  for (const f of ['skill-trail.cmd', 'skill-trail']) fs.rmSync(path.join(os.homedir(), '.local', 'bin', f), { force: true })
  done.push('Historial conservado en ' + HOME)
  return done
}

// ---------- CLI ----------

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

function main(argv) {
  const [cmd = 'show', ...args] = argv
  const project = args.includes('--all') ? undefined : normProject(flag(args, 'project'))
  switch (cmd) {
    case 'show': {
      const n = Number(flag(args, 'n') ?? 20)
      console.log(show(summarize(readTrail(), project), n))
      return
    }
    case 'status':
      console.log(statusLine(summarize(readTrail(), project)))
      return
    case 'json':
      console.log(JSON.stringify(summarize(readTrail(), project)))
      return
    case 'record':
      record({
        agent: flag(args, 'agent'),
        skill: flag(args, 'skill'),
        pack: flag(args, 'pack'),
        via: flag(args, 'via'),
        session: flag(args, 'session'),
        project: flag(args, 'project'),
      })
      return
    case 'fijar': {
      const name = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'))
      if (!name) return console.log('Uso: skill-trail fijar <pack o skill>')
      const pins = readPins()
      pins[project] = name
      writePins(pins)
      console.log(`Skill grande de este proyecto: ${name}`)
      return
    }
    case 'soltar': {
      const pins = readPins()
      delete pins[project]
      writePins(pins)
      console.log('Skill grande: vuelve a detectarse sola.')
      return
    }
    case 'limpiar':
      writeTrail(project ? readTrail().filter(e => e.project !== project) : [])
      console.log(project ? 'Historial del proyecto borrado.' : 'Historial borrado.')
      return
    case 'hook':
      if (args[0] === 'codex') {
        try {
          codexHook(JSON.parse(readStdin() || '{}'))
        } catch {
          // Un hook nunca debe romper al agente.
        }
      }
      return
    case 'install':
      for (const l of install()) console.log('✓ ' + l)
      return
    case 'uninstall':
      for (const l of uninstall()) console.log('✓ ' + l)
      return
    default:
      console.log('Comandos: show, status, json, fijar, soltar, limpiar, record, hook codex, install, uninstall')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) main(process.argv.slice(2))
