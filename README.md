# prompt-improver

A Claude Code mod that adds a **✨ Improve prompt** button above the prompt box. Type a rough prompt, press
the button, and your draft is rewritten into a clear, specific prompt before you send it. Nothing is sent
for you: the improved text goes back into the box to review, edit or send.

## What it does

- **✨ Improve prompt** appears above the prompt box whenever you have a draft (hotkey `i` once the row has
  focus). It rewrites the draft in place.
- **↩ Undo** (hotkey `u`) puts your original draft back. **✨ Improve again** runs it once more.
- `/improve <text>` does the same from a slash command.
- If you keep typing while it works, your draft is left untouched.
- **In the Claude desktop app**, a mod can't read or fill the app's prompt box, so the band above it has its own
  text box: type a rough prompt there and press Enter. The improved prompt appears in the band with **Send it**,
  **Copy** and **Start over**.

The rewrite keeps your intent and scope (it never adds goals or does the task), fixes typos and vague words
("it", "that thing") into the actual file, error or feature, opens with a one-line goal, and adds context, the
deliverable and how to verify it only where they help. A short question stays a short, sharper question.

It runs as a side request over your current conversation, so it knows what you are working on. Before the
first turn has finished it falls back to a standalone call to Opus.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-improver --marketplace andrewstrong615/prompt-improver
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

From a shell:

```bash
claude plugin install prompt-improver --marketplace andrewstrong615/prompt-improver
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `andrewstrong615/prompt-improver`, then **Add plugin**.

## Develop

`claude plugin validate .` checks the manifest and hooks; `claude plugin test .` runs `tests/`.
