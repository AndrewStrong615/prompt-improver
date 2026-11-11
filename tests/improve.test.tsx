import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-improver',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10 },
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
        usage: { input_tokens: 1, output_tokens: 1 },
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
