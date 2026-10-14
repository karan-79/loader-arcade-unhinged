export type AnimStyle =
  | 'fight'
  | 'fight-shooter'
  | 'fight-dojo'
  | 'fight-knight'
  | 'chill'
  | 'chill-beach'
  | 'chill-drive'
  | 'chill-meditation'
  | 'off'

declare module 'claude-code' {
  interface PluginState {
    'loader-arcade-unhinged': {
      style: AnimStyle
      isPreviewing: boolean
      isOutro: boolean
      imgFrame: number
    }
  }
}
