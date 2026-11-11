import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-improver',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('the button rewrites the draft and Undo puts it back', async ($, on) => {
  let box = 'fix the bug in it'
  const fills: string[] = []

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', (_, e) => {
    expect(e.prompt).toContain('<draft>\nfix the bug in it\n</draft>')
    return {
      value: {
        isAnswered: true,
        text: '<improved_prompt>Fix the crash in the parser and add a test.</improved_prompt>',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.fill', (_, e) => {
    box = e.text
    fills.push(e.text)
    return { isFilled: true, box: { text: box, cursor: box.length } }
  })
  on('state.get', (_, e, next) => (e.key === 'hasDraft' ? { value: { value: true, version: 1 } } : next(e)))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'improve' })
  expect(fills).toEqual(['Fix the crash in the parser and add a test.'])

  await ui.press({ key: 'undo' })
  expect(fills.at(-1)).toBe('fix the bug in it')
  await ui.unmount()
})

test('on desktop the band takes the draft itself, shows the rewrite and sends it', async ($, on) => {
  const sent: string[] = []

  on('model.fork', (_, e) => {
    expect(e.prompt).toContain('<draft>\nfix the bug in it\n</draft>')
    expect(e.effort).toBe('low')
    return {
      value: {
        isAnswered: true,
        text: '<improved_prompt>Fix the crash in the parser and add a test.</improved_prompt>',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { drop: "captured by the test" }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'draft' })).toBeDefined()

  await ui.input({ key: 'draft', text: '  fix the bug in it ' })
  expect((await ui.find({ text: /Fix the crash in the parser/ }))?.text).toContain('add a test')

  await ui.press({ key: 'send' })
  expect(sent).toEqual(['Fix the crash in the parser and add a test.'])
  expect(await ui.find({ key: 'draft' })).toBeDefined()

  // Edit before sending: the rewrite goes into a field, Enter sends what was typed there.
  await ui.input({ key: 'draft', text: 'fix the bug in it' })
  await ui.press({ key: 'edit' })
  expect((await ui.find({ key: 'edit' }))?.props.value).toBe('Fix the crash in the parser and add a test.')
  await ui.input({ key: 'edit', text: 'Fix the crash in the parser, add a test, and keep the API.' })
  expect(sent.at(-1)).toBe('Fix the crash in the parser, add a test, and keep the API.')
  expect(await ui.find({ key: 'draft' })).toBeDefined()
  await ui.unmount()
})
