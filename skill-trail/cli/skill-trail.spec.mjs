// node --test skill-trail/cli/skill-trail.spec.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-trail-'))
process.env.SKILL_TRAIL_HOME = tmp
process.env.CODEX_HOME = path.join(tmp, 'codex')
fs.mkdirSync(path.join(tmp, 'codex', 'skills', 'code-review'), { recursive: true })

const m = await import('./skill-trail.mjs')
const P = path.join(tmp, 'proyecto')
const readAll = () =>
  fs.readFileSync(path.join(tmp, 'trail.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))

test('marco + usos: Superpowers es la skill grande y se deduplica la misma carga', () => {
  m.record({ agent: 'claude', skill: 'superpowers', via: 'marco', session: 's1', project: P })
  m.record({ agent: 'claude', skill: 'engram', via: 'marco', session: 's1', project: P })
  assert.equal(m.record({ agent: 'claude', skill: 'superpowers:brainstorming', pack: 'superpowers', project: P }), true)
  assert.equal(m.record({ agent: 'claude', skill: 'superpowers:brainstorming', pack: 'superpowers', project: P }), false)
  const project = readAll()[0].project
  const s = m.summarize(readAll(), project, {})
  assert.equal(s.active.label, 'Superpowers')
  assert.deepEqual(s.active.also, ['Engram'])
  assert.equal(s.total, 1)
})

test('Codex: lectura de SKILL.md con ruta de Windows y mención $skill', () => {
  const file = 'C:\\Users\\x\\.codex\\plugins\\cache\\engram\\engram\\0.1.1\\skills\\memory\\SKILL.md'
  m.codexHook({ hook_event_name: 'PostToolUse', cwd: P, session_id: 'c1', tool_input: { command: `Get-Content ${file}` } })
  m.codexHook({ hook_event_name: 'UserPromptSubmit', cwd: P, session_id: 'c1', prompt: 'usa $code-review y $HOME' })
  const codex = readAll().filter(e => e.agent === 'codex')
  assert.deepEqual(
    codex.map(e => [e.skill, e.pack, e.via]),
    [
      ['memory', 'engram', 'lectura'],
      ['code-review', undefined, '$mención'],
    ],
  )
})

test('fijar gana a lo detectado', () => {
  const project = readAll()[0].project
  assert.equal(m.summarize(readAll(), project, { [project]: 'ecc' }).active.label, 'Everything Claude Code')
})

test('Hermes: añade y quita skill-trail de plugins.enabled sin tocar lo demás', () => {
  const yaml = 'model: x\r\nplugins:\r\n  enabled:\r\n    - orca-status\r\ncron:\r\n  a: 1\r\n'
  const added = m.editHermesConfig(yaml, true)
  assert.match(added, /- orca-status\r\n    - skill-trail\r\ncron:/)
  assert.equal(m.editHermesConfig(added, true), added)
  assert.equal(m.editHermesConfig(added, false), yaml)
  assert.match(m.editHermesConfig('model: x\n', true), /plugins:\n  enabled:\n    - skill-trail\n/)
})
