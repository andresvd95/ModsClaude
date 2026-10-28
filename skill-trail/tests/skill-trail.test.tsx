import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'skill-trail',
  component: 'Pane',
  requestId: 'skill-trail',
  props: {
    title: 'Skill Trail',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('sin CLI: detecta Superpowers al iniciar y anota cada skill en el historial', async ($, on) => {
  const status: (string | undefined)[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', (_, e) => (status.push(e.text), { value: undefined }))
  on('command.register', () => ({ value: { command: 'trail' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'sin node' } }))
  on('classic.SessionStart', () => ({ additionalContext: ['<EXTREMELY_IMPORTANT>You have superpowers.</EXTREMELY_IMPORTANT>'] }))
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'startup' })
  await $.skill.prompt({ skill: 'superpowers:brainstorming', text: 'x', pluginName: 'superpowers', source: 'plugin' })
  await $.skill.prompt({ skill: 'fixes', text: 'y', source: 'userSettings' })

  expect(status[status.length - 1]).toBe('skills · ⚡Superpowers · último: fixes')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /⚡ Superpowers/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /brainstorming/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /solo esta sesión/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('con CLI: muestra el resumen compartido, con usos de Codex y Hermes', async ($, on) => {
  const calls: string[][] = []
  const summary = {
    active: { name: 'superpowers', label: 'Superpowers', source: 'cargada al iniciar (claude)', also: ['Engram'] },
    recent: [
      { at: 1, agent: 'codex', project: '/proyecto', skill: 'code-review', via: 'lectura' },
      { at: 0, agent: 'hermes', project: '/proyecto', skill: 'arxiv', pack: 'research', via: 'skill_view' },
    ],
    top: [['code-review', 3]],
    total: 4,
    agents: ['codex', 'hermes'],
  }
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'trail' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    calls.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv.includes('json') ? JSON.stringify(summary) : '', stderr: '' } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'trail', args: 'fijar superpowers' })
  expect(r.text).toContain('fijada en superpowers')
  expect(calls.some(a => a.includes('fijar') && a.includes('superpowers') && a.includes('/proyecto'))).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /también activas: Engram/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /code-review/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /research · hermes/ })).toBeTruthy()
  await ui.unmount()
})
