export const paletteColors = [
  'red',
  'orange',
  'yellow',
  'green',
  'mint',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'brown',
  'graphite'
] as const

export type PaletteColor = (typeof paletteColors)[number]

const light: Record<PaletteColor, string> = {
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  green: '#34c759',
  mint: '#00c7be',
  teal: '#30b0c7',
  blue: '#007aff',
  indigo: '#5856d6',
  purple: '#af52de',
  pink: '#ff2d55',
  brown: '#a2845e',
  graphite: '#8e8e93'
}

const dark: Record<PaletteColor, string> = {
  red: '#ff453a',
  orange: '#ff9f0a',
  yellow: '#ffd60a',
  green: '#30d158',
  mint: '#63e6e2',
  teal: '#40c8e0',
  blue: '#0a84ff',
  indigo: '#5e5ce6',
  purple: '#bf5af2',
  pink: '#ff375f',
  brown: '#ac8e68',
  graphite: '#98989d'
}

export function isPaletteColor(raw: string): raw is PaletteColor {
  return (paletteColors as readonly string[]).includes(raw)
}

export function paletteHex(color: PaletteColor, scheme: 'light' | 'dark' = 'light'): string {
  return scheme === 'dark' ? dark[color] : light[color]
}

export function paletteVar(color: PaletteColor): string {
  return `var(--palette-${color})`
}

export function paletteCSS(): string {
  const lightRules = paletteColors.map((color) => `  --palette-${color}: ${light[color]};`).join('\n')
  const darkRules = paletteColors.map((color) => `    --palette-${color}: ${dark[color]};`).join('\n')
  return `:root {\n${lightRules}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n${darkRules}\n  }\n}\n`
}
