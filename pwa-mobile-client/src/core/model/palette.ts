export const paletteColors = [
  'redLight',
  'red',
  'redDark',
  'orangeLight',
  'orange',
  'orangeDark',
  'yellow',
  'yellowDark',
  'greenLight',
  'green',
  'greenDark',
  'mint',
  'mintDark',
  'tealLight',
  'teal',
  'tealDark',
  'blueLight',
  'blue',
  'blueDark',
  'indigoLight',
  'indigo',
  'indigoDark',
  'purpleLight',
  'purple',
  'purpleDark',
  'pinkLight',
  'pink',
  'pinkDark',
  'brownLight',
  'brown',
  'brownDark',
  'graphiteLight',
  'graphite',
  'graphiteDark'
] as const

export type PaletteColor = (typeof paletteColors)[number]

const light: Record<PaletteColor, string> = {
  redLight: '#ff6961',
  red: '#ff3b30',
  redDark: '#c4221a',
  orangeLight: '#ffb340',
  orange: '#ff9500',
  orangeDark: '#c96a00',
  yellow: '#ffcc00',
  yellowDark: '#d4a800',
  greenLight: '#6ad88a',
  green: '#34c759',
  greenDark: '#248a3d',
  mint: '#00c7be',
  mintDark: '#00918b',
  tealLight: '#6ac4dc',
  teal: '#30b0c7',
  tealDark: '#1d7f99',
  blueLight: '#4da3ff',
  blue: '#007aff',
  blueDark: '#0055d4',
  indigoLight: '#8583e8',
  indigo: '#5856d6',
  indigoDark: '#3634a3',
  purpleLight: '#c987ec',
  purple: '#af52de',
  purpleDark: '#8231b8',
  pinkLight: '#ff6b8a',
  pink: '#ff2d55',
  pinkDark: '#d30f45',
  brownLight: '#c0a07a',
  brown: '#a2845e',
  brownDark: '#7f6545',
  graphiteLight: '#aeaeb2',
  graphite: '#8e8e93',
  graphiteDark: '#636366'
}

const dark: Record<PaletteColor, string> = {
  redLight: '#ff7a73',
  red: '#ff453a',
  redDark: '#d63a31',
  orangeLight: '#ffb84d',
  orange: '#ff9f0a',
  orangeDark: '#d97a0a',
  yellow: '#ffd60a',
  yellowDark: '#e0b400',
  greenLight: '#6ee28f',
  green: '#30d158',
  greenDark: '#28a745',
  mint: '#63e6e2',
  mintDark: '#1fb5ae',
  tealLight: '#74d0e6',
  teal: '#40c8e0',
  tealDark: '#2a93ad',
  blueLight: '#5ea9ff',
  blue: '#0a84ff',
  blueDark: '#0066e0',
  indigoLight: '#8e8cf0',
  indigo: '#5e5ce6',
  indigoDark: '#4543b8',
  purpleLight: '#d08af5',
  purple: '#bf5af2',
  purpleDark: '#9a42cf',
  pinkLight: '#ff7a95',
  pink: '#ff375f',
  pinkDark: '#e0214f',
  brownLight: '#c8a882',
  brown: '#ac8e68',
  brownDark: '#8a6f4e',
  graphiteLight: '#b4b4b8',
  graphite: '#98989d',
  graphiteDark: '#6e6e73'
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
