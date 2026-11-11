export type Phase = 'idle' | 'working' | 'done'

declare module 'claude-code' {
  interface PluginState {
    'prompt-improver': {
      hasDraft: boolean
      phase: Phase
      original: string | null
      note: string | null
    }
  }
}
