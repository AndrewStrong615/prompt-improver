import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase } from '../types'

const hasDraft = atom({ plugin: 'prompt-improver', key: 'hasDraft' } as const, false)
const phase = atom({ plugin: 'prompt-improver', key: 'phase' } as const, 'idle' as Phase)
const original = atom({ plugin: 'prompt-improver', key: 'original' } as const, null as string | null)
const note = atom({ plugin: 'prompt-improver', key: 'note' } as const, null as string | null)
// Desktop only: the improved prompt, shown in the band (the app's prompt box is out of a mod's reach).
const result = atom({ plugin: 'prompt-improver', key: 'result' } as const, null as string | null)

// Used when there is no conversation to fork yet (before the first turn ends).
const FALLBACK_MODEL = 'opus'

const RULES = `You are an expert prompt engineer. Rewrite the DRAFT below into the prompt the person
should actually send to an AI coding agent (Claude Code) working in their repository.

Make it genuinely more useful, not just longer:
- Keep the person's intent, scope and language exactly. Never add features, goals or opinions they
  did not ask for; never answer or carry out the request yourself.
- Fix spelling, grammar and vague wording. Turn "it", "this", "that thing" into the concrete file,
  feature, error or behaviour they mean, using the conversation so far when it makes that clear.
- Open with one sentence stating the goal. Then, only where they help: relevant context (files,
  components, constraints, what was already tried), the concrete deliverable, and how to verify it
  is done (tests to run, behaviour to check).
- If something important is genuinely ambiguous, add a short line asking the agent to state its
  assumption (or ask) rather than guessing.
- Keep it proportional: a one-line question stays a short, sharper question. Use bullets only when
  there are several distinct requirements. No headings, no preamble, no sign-off, no role-play
  ("You are a...").
- Write in the first person, as the person talking to the agent.

Reply with the rewritten prompt inside <improved_prompt></improved_prompt> tags and nothing else.`

function ask(draft: string, withHistory: boolean): string {
  const where = withHistory
    ? 'Use the conversation above only as context for what the draft refers to. ' +
      'You have no tools here: do not do the task, just rewrite the prompt, quickly.\n\n'
    : ''

  return `${where}${RULES}\n\n<draft>\n${draft}\n</draft>`
}

function extract(reply: string): string | null {
  const m = reply.match(/<improved_prompt>([\s\S]*?)<\/improved_prompt>/)
  const text = (m?.[1] ?? reply).trim()

  return text.length > 0 ? text : null
}

async function improve($: EngineInterface, draft: string): Promise<string | null> {
  // First choice: a fork of this session, so the rewrite knows what you're working on.
  const forked = await $.model.fork({ prompt: ask(draft, true) })
  if (forked.isAnswered) return extract(forked.text)
  if (forked.reason !== 'nothing-to-fork') throw new Error(forked.reason)

  const done = await $.model.complete({
    model: FALLBACK_MODEL,
    prompt: ask(draft, false),
    maxTokens: 4000,
    effort: 'medium',
  })
  if (done.isAnswered) return extract(done.text)
  throw new Error(done.reason)
}

async function run($: EngineInterface): Promise<void> {
  if ((await read($, phase)) === 'working') return

  const box = await $.prompt.read()
  const draft = box.text.trim()
  if (draft.length === 0) {
    $.ui.toast('Type a prompt first, then press Improve.')
    return
  }

  await update($, phase, () => 'working')
  await update($, note, () => null)

  try {
    const better = await improve($, draft)
    const now = await $.prompt.read()

    if (better === null) {
      await update($, phase, () => 'idle')
      $.ui.toast('No improvement came back; your draft is unchanged.')
      return
    }
    if (now.text.trim() !== draft) {
      // The person kept typing while we worked: don't clobber their edits.
      await update($, phase, () => 'idle')
      $.ui.toast('Your draft changed while improving; left it as it is.')
      return
    }

    await update($, original, () => box.text)
    const filled = await $.prompt.fill({ text: better, mode: 'replace' })
    await update($, phase, () => (filled.isFilled ? 'done' : 'idle'))
    if (!filled.isFilled) $.ui.toast('Could not write into the prompt box.')
  } catch (err) {
    await update($, phase, () => 'idle')
    const why = err instanceof Error ? err.message : String(err)
    await update($, note, () => `Improve failed: ${why}`)
  }
}

// The desktop app's prompt box can't be read or filled by a mod, so the band takes the draft itself.
async function runDesktop($: EngineInterface, draft: string): Promise<void> {
  if ((await read($, phase)) === 'working') return
  if (draft.trim().length === 0) {
    $.ui.toast('Type a prompt first, then press Enter.')
    return
  }

  await update($, phase, () => 'working')
  await update($, note, () => null)
  try {
    const better = await improve($, draft.trim())
    if (better === null) $.ui.toast('No improvement came back.')
    await update($, result, () => better)
  } catch (err) {
    await update($, note, () => `Improve failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, phase, () => 'idle')
  }
}

async function undo($: EngineInterface): Promise<void> {
  const was = await read($, original)
  if (was !== null) await $.prompt.fill({ text: was, mode: 'replace' })
  await update($, original, () => null)
  await update($, phase, () => 'idle')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'improve',
      description: 'Rewrite the text after /improve into a stronger prompt and put it in the prompt box',
    })
    const box = await $.prompt.read()
    await update($, hasDraft, () => box.text.trim().length > 0)

    return next(e)
  })

  on('command.run', { command: 'improve' }, async ($, e) => {
    const draft = e.args.trim()
    if (draft.length === 0) {
      return { text: 'Usage: /improve <your prompt>. Or type a prompt and press ✨ Improve prompt.' }
    }
    try {
      const better = await improve($, draft)
      if (better === null) return { text: 'No improvement came back.' }
      await update($, original, () => draft)
      const filled = await $.prompt.fill({ text: better, mode: 'replace' })
      await update($, phase, () => (filled.isFilled ? 'done' : 'idle'))

      return { text: filled.isFilled ? 'Improved prompt is in the prompt box: review it, then send.' : better }
    } catch (err) {
      return { text: `Improve failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('prompt.change', async ($, e, next) => {
    const isFilled = e.text.trim().length > 0
    if ((await read($, hasDraft)) !== isFilled) await update($, hasDraft, () => isFilled)

    // A submit, a clear or a fresh edit by the person ends the "improved" state.
    if (e.origin.kind !== 'plugin' && (await read($, phase)) === 'done') {
      if (e.origin.kind === 'clear' || !isFilled) await update($, original, () => null)
      await update($, phase, () => 'idle')
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Keep whatever another mod (complex-mode) draws here, under this mod's own row.
    const mine = await (async () => {
      const state = await read($, phase)
      const message = await read($, note)

      if (e.surface === 'desktop') {
        const { Box, Button, Input, Text } = $.ui.resolve(e)
        const better = await read($, result)
        const isActive = state === 'working' || better !== null

        return (
          <Box
            borderStyle="round"
            borderColor={isActive ? 'claude' : 'subtle'}
            paddingX={1}
            flexDirection="column"
            gap={1}
          >
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
              <Text weight="semibold">
                ✨ {better !== null ? 'Improved prompt' : 'Prompt improver'}
              </Text>
              {state === 'working' && (
                <Text size="footnote" color="claude">
                  Improving…
                </Text>
              )}
            </Box>

            {state === 'working' ? (
              <Text size="footnote" color="subtle">
                Rewriting your draft into a clear, specific prompt.
              </Text>
            ) : better !== null ? (
              <>
                <Box borderStyle="round" borderColor="subtle" paddingX={1}>
                  <Text>{better}</Text>
                </Box>
                <Box flexDirection="row" justifyContent="flex-end" gap={1}>
                  <Button key="clear" label="Start over" onPress={() => update($, result, () => null)} />
                  <Button
                    key="copy"
                    label="Copy"
                    onPress={async () => {
                      const copied = await $.ui.copy({ text: better, surface: e.surface })
                      $.ui.toast(copied.isCopied ? 'Copied. Paste it into the prompt box.' : 'Could not copy; select the text instead.')
                    }}
                  />
                  <Button
                    key="send"
                    variant="primary"
                    label="Send it"
                    onPress={async () => {
                      await update($, result, () => null)
                      $.prompt.submit({ text: better }).catch(() => $.ui.toast('Could not send; copy it instead.'))
                    }}
                  />
                </Box>
              </>
            ) : (
              <>
                <Input
                  key="draft"
                  placeholder="Type a rough prompt, then press Enter to improve it"
                  submitLabel="improve"
                  rows={2}
                  onSubmit={value => void runDesktop($, value)}
                />
                {message !== null && (
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
                    <Text size="footnote" color="error">
                      {message}
                    </Text>
                    <Button key="dismiss" label="Dismiss" onPress={() => update($, note, () => null)} />
                  </Box>
                )}
              </>
            )}
          </Box>
        )
      }

      const draft = await read($, hasDraft)
      const canUndo = (await read($, original)) !== null
      if (!draft && state === 'idle' && message === null) return null

      const { Box, Button, Text } = $.ui.resolve(e)

      if (state === 'working') {
        return (
          <Box>
            <Text color="claude">✨ Improving your prompt…</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="row" gap={1}>
          {draft && (
            <Button
              key="improve"
              label={state === 'done' ? '✨ Improve again' : '✨ Improve prompt'}
              hotkey="i"
              onPress={() => run($)}
            />
          )}
          {canUndo && <Button key="undo" label="↩ Undo" hotkey="u" onPress={() => undo($)} />}
          {state === 'done' && <Text dimColor>Improved. Edit it or send it.</Text>}
          {message !== null && <Text color="error">{message}</Text>}
          {message !== null && (
            <Button key="dismiss" label="Dismiss" onPress={() => update($, note, () => null)} />
          )}
        </Box>
      )
    })()
    const below = await next(e)
    if (mine === null) return below
    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1}>
        {below}
        {mine}
      </Box>
    )
  })
}
