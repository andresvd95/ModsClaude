import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-pulse',
  component: 'Pane',
  requestId: 'agent-pulse',
  props: {
    title: 'Claude Pulse',
    isFocused: false,
    bodyColumns: 120,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

function answer(json: object) {
  return { value: { isAnswered: true, text: JSON.stringify(json), usage: USAGE } }
}

test('Haiku decide una búsqueda con confianza: se ve quién eligió, el modelo y el progreso', async ($, on) => {
  const spawned: (string | undefined)[] = []
  const asked: string[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    asked.push(e.model)
    return answer({ tier: 'haiku', confidence: 92, thought: 'búsqueda simple de un símbolo' })
  })
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a1' }
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Busca dónde se usa parseConfig', description: 'Buscar parseConfig', subagentType: 'Explore' })
  expect(spawned[0]).toBe('haiku')
  expect(asked).toEqual(['haiku']) // seguro: no consulta a Sonnet

  await $.tool.call({ tool: 'Grep', pattern: 'parseConfig', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', file_path: '/x.ts', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Buscar parseConfig/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /2 herr\./ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Haiku 92% → Haiku/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /eligió Haiku \(92%\)/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Quién decidió: .*Haiku 1/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /→ Haiku · decidió Haiku/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /pensando|💭/ })).toBeFalsy() // sin narración paso a paso
    await ui.unmount()
  }
  expect(toasts.some(t => t.includes('→ Haiku'))).toBe(true)

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
  expect(await ui.find({ type: 'Text', text: /terminó en 4s/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /100% · 2 herr\./ })).toBeTruthy()
  await ui.unmount()
})

test('si Haiku duda, piensa Sonnet y su elección es la que se asigna', async ($, on) => {
  const spawned: (string | undefined)[] = []
  const asked: string[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    asked.push(e.model)
    return e.model === 'haiku'
      ? answer({ tier: 'opus', confidence: 55, thought: 'quizá requiere diseño' })
      : answer({ tier: 'sonnet', confidence: 90, thought: 'es implementar un endpoint, basta Sonnet' })
  })
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a3' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({
    prompt: 'Implementa el endpoint /health',
    description: 'Endpoint health',
    subagentType: 'general-purpose',
    model: 'opus',
  })
  expect(asked).toEqual(['haiku', 'sonnet'])
  expect(spawned[0]).toBe('sonnet')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Haiku 55% → Opus ⟶ Sonnet 90% → Sonnet/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /→ Sonnet · decidió Sonnet/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /eligió Sonnet \(90%\) · lanzó .*pidió Opus/ })).toBeTruthy()
  await ui.unmount()
})

test('mientras Haiku piensa, el panel y la banda lo muestran en vivo', async ($, on) => {
  let release: (v: unknown) => void = () => {}
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => new Promise(r => (release = () => r(answer({ tier: 'sonnet', confidence: 88, thought: 'editar código' })))))
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'claude-opus-5-5', agentId: 'a4' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const pending = $.agent.spawn({ prompt: 'Arregla el test roto', description: 'Arreglar test', subagentType: 'general-purpose' })

  let found = false
  for (let i = 0; i < 20 && !found; i++) {
    await new Promise(r => setTimeout(r, 10))
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    found = Boolean(await ui.find({ type: 'Text', text: /🧠 Haiku pensando/ }))
    await ui.unmount()
  }
  expect(found).toBe(true)
  const band = await $.ui.mount({ plugin: 'agent-pulse', component: 'AbovePrompt', props: { bodyColumns: 100 }, surface: 'terminal' } as never)
  expect(await band.find({ type: 'Text', text: /Haiku pensando a quién asignar/ })).toBeTruthy()
  await band.unmount()

  release(undefined)
  await pending
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /→ Sonnet · decidió Haiku/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /pensando/ })).toBeFalsy() // al terminar, ya no hay nadie pensando
  await ui.unmount()
})

test('en modo sugerir muestra la decisión sin cambiar el modelo', async ($, on) => {
  const spawned: (string | undefined)[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => answer({ tier: 'haiku', confidence: 95, thought: 'listar archivos' }))
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a2' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'pulse', args: 'sugerir' })
  await $.agent.spawn({ prompt: 'Lista los archivos', description: 'Listar', subagentType: 'general-purpose' })
  expect(spawned[0]).toBe(undefined)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /sugiere Haiku \(decidió Haiku\), corre en Opus/ })).toBeTruthy()
  await ui.unmount()
})

test('si Haiku no responde, deciden las reglas y el agente arranca igual', async ($, on) => {
  const spawned: (string | undefined)[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a5' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Revisa la seguridad del login', description: 'Seguridad login', subagentType: 'security-reviewer' })
  expect(spawned[0]).toBe('opus')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Haiku ✗ ⟶ Reglas → Opus/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /decidió Reglas/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /eligió Reglas: tipo security-reviewer/ })).toBeTruthy()
  await ui.unmount()
})

test('para ahorrar uso, Haiku solo devuelve modelo y confianza, con pocos tokens', async ($, on) => {
  const reqs: { maxTokens?: number; system?: string; prompt: string }[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => (reqs.push(e), answer({ tier: 'sonnet', confidence: 85 })))
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'claude-opus-5-5', agentId: 'a6' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x'.repeat(5000), description: 'Tarea larga', subagentType: 'general-purpose' })
  expect(reqs.length).toBe(1)
  expect(reqs[0]!.maxTokens).toBeLessThanOrEqual(30)
  expect(reqs[0]!.system ?? '').not.toMatch(/thought|razonamiento/)
  expect(reqs[0]!.prompt.length).toBeLessThan(2000)
})

test('si una skill fija el modelo, manda sobre el router y no se consulta a Haiku', async ($, on) => {
  const spawned: (string | undefined)[] = []
  const asked: string[] = []
  mock.store(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pulse' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    asked.push(e.model)
    return answer({ tier: 'haiku', confidence: 95 })
  })
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'claude-opus-5-5', agentId: 'a7' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({
    prompt: 'modelo-fijado: opus\nRevisa la arquitectura del módulo de facturación',
    description: 'Revisión crítica',
    subagentType: 'general-purpose',
  })
  expect(spawned[0]).toBe('opus') // la skill gana aunque Haiku habría elegido otro
  expect(asked).toEqual([]) // el router ni siquiera piensa: no gasta uso
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /decidió Skill/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /eligió Skill: modelo fijado por la skill/ })).toBeTruthy()
  await ui.unmount()
})
