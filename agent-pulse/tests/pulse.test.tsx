import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-pulse',
  component: 'Pane',
  requestId: 'agent-pulse',
  props: {
    title: 'Claude Pulse',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

test('el router manda una búsqueda a Haiku y el panel muestra su progreso', async ($, on) => {
  const spawned: (string | undefined)[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: '{"tier":"haiku","reason":"búsqueda simple"}', usage: USAGE },
  }))
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a1' }
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Busca dónde se usa parseConfig', description: 'Buscar parseConfig', subagentType: 'Explore' })
  expect(spawned[0]).toBe('haiku')

  await $.tool.call({ tool: 'Grep', pattern: 'parseConfig', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', file_path: '/x.ts', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Buscar parseConfig/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /2 herr\./ }))).toBeTruthy()
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'listo',
    durationMs: 4000,
    isAborted: false,
    turnId: 't1',
    agentId: 'a1',
    reason: 'answer',
    usage: { ...USAGE, model: 'claude-haiku-5-5' },
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /terminó en 4s/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /100% · 2 herr\./ }))).toBeTruthy()
  expect(toasts.some(t => t.includes('terminó'))).toBe(true)
  await ui.unmount()
})

test('en modo sugerir no cambia el modelo', async ($, on) => {
  const spawned: (string | undefined)[] = []
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"tier":"haiku","reason":"x"}', usage: USAGE } }))
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a2' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'pulse', args: 'sugerir' })
  await $.agent.spawn({ prompt: 'Lista los archivos', description: 'Listar', subagentType: 'general-purpose' })
  expect(spawned[0]).toBe(undefined)
})
