export type Phase = 'idle' | 'working' | 'done'

declare module 'claude-code' {
  interface PluginState {
    'prompt-improver': {
      hasDraft: boolean
      phase: Phase
      original: string | null
      note: string | null
      result: string | null
      /** Desktop: the improved prompt being edited in the band before it is sent. */
      editing: string | null
    }
  }
}
