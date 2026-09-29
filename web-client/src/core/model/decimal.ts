
export const scale = 100

export function rounded(value: number): number {
  if (!Number.isFinite(value)) return 0
  const shifted = value * scale
  const rounding = shifted < 0 ? -0.5 : 0.5
  return Math.trunc(shifted + rounding + Number.EPSILON * Math.sign(shifted) * Math.abs(shifted)) / scale
}

export function add(...values: number[]): number {
  return rounded(values.reduce((sum, value) => sum + Math.round(value * scale), 0) / scale)
}

export function subtract(left: number, right: number): number {
  return add(left, -right)
}

export function multiply(left: number, right: number): number {
  return rounded((Math.round(left * scale) * Math.round(right * scale)) / (scale * scale))
}

export function divide(left: number, right: number): number {
  return rounded(left / right)
}

export function sum(values: number[]): number {
  return add(...values)
}
