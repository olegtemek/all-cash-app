import { add, divide, multiply, rounded, subtract } from './decimal'
import { decimalSeparator, interfaceLocale } from './locale'

export const operators = ['+', '−', '×', '÷'] as const
export type AmountOperator = (typeof operators)[number]

export function isOperator(character: string): character is AmountOperator {
  return (operators as readonly string[]).includes(character)
}

function isFirstInOrder(operator: AmountOperator): boolean {
  return operator === '×' || operator === '÷'
}

export function operatorSpokenName(operator: AmountOperator): string {
  switch (operator) {
    case '+':
      return 'плюс'
    case '−':
      return 'минус'
    case '×':
      return 'умножить'
    case '÷':
      return 'разделить'
  }
}

export type AmountKey =
  | { kind: 'digit'; digit: number }
  | { kind: 'separator' }
  | { kind: 'action'; action: AmountOperator }
  | { kind: 'delete' }

export type AmountFailure = 'empty' | 'divisionByZero'

export type AmountValue = { ok: true; value: number } | { ok: false; failure: AmountFailure }

const digitLimit = 15

const wholeFormatter = new Intl.NumberFormat(interfaceLocale, { maximumFractionDigits: 0 })

export class AmountExpression {
  private constructor(public readonly text: string) {}

  static empty(): AmountExpression {
    return new AmountExpression('')
  }

  static fromAmount(amount: number): AmountExpression {
    const value = rounded(amount)
    const text = Number.isInteger(value) ? String(value) : String(value)
    return new AmountExpression(text)
  }

  static fromText(text: string): AmountExpression {
    return new AmountExpression(text)
  }

  get isEmpty(): boolean {
    return this.text.length === 0
  }

  get hasOperator(): boolean {
    return [...this.text].some(isOperator)
  }

  get value(): AmountValue {
    return AmountExpression.evaluate(this.completed)
  }

  get display(): string {
    if (this.isEmpty) return AmountExpression.formatted('0')

    let result = ''
    let number = ''

    for (const character of this.text) {
      if (isOperator(character)) {
        result += `${AmountExpression.formatted(number)} ${character} `
        number = ''
      } else {
        number += character
      }
    }

    return result + AmountExpression.formatted(number)
  }

  get spoken(): string {
    if (this.isEmpty) return '0'

    return [...this.text]
      .map((character) => {
        if (isOperator(character)) return ` ${operatorSpokenName(character)} `
        if (character === '.') return decimalSeparator
        return character
      })
      .join('')
  }

  input(key: AmountKey): AmountExpression {
    switch (key.kind) {
      case 'digit':
        return this.appendDigit(key.digit)
      case 'separator':
        return this.appendSeparator()
      case 'action':
        return this.appendAction(key.action)
      case 'delete':
        return this.deleteBackward()
    }
  }

  clear(): AmountExpression {
    return AmountExpression.empty()
  }

  equals(other: AmountExpression): boolean {
    return this.text === other.text
  }

  private appendDigit(digit: number): AmountExpression {
    const number = this.currentNumber

    if (number === '0') {
      return new AmountExpression(this.text.slice(0, -1) + String(digit))
    }

    const digits = [...number].filter((character) => /[0-9]/.test(character)).length
    if (digits >= digitLimit) return this

    return new AmountExpression(this.text + String(digit))
  }

  private appendSeparator(): AmountExpression {
    const number = this.currentNumber
    if (number.includes('.')) return this
    return new AmountExpression(this.text + (number.length === 0 ? '0.' : '.'))
  }

  private appendAction(action: AmountOperator): AmountExpression {
    const last = this.text.at(-1)
    if (last === undefined) return this

    let text = this.text
    if (isOperator(last) || last === '.') text = text.slice(0, -1)
    if (text.length === 0) return this

    return new AmountExpression(text + action)
  }

  private deleteBackward(): AmountExpression {
    if (this.isEmpty) return this
    return new AmountExpression(this.text.slice(0, -1))
  }

  private get currentNumber(): string {
    let index = this.text.length
    while (index > 0 && !isOperator(this.text[index - 1]!)) index -= 1
    return this.text.slice(index)
  }

  private get completed(): string {
    let source = this.text
    while (source.length > 0) {
      const last = source.at(-1)!
      if (isOperator(last) || last === '.') source = source.slice(0, -1)
      else break
    }
    return source
  }

  private static evaluate(source: string): AmountValue {
    if (source.length === 0) return { ok: false, failure: 'empty' }

    const numbers: number[] = []
    const actions: AmountOperator[] = []
    let number = ''

    for (const character of source) {
      if (!isOperator(character)) {
        number += character
        continue
      }

      const value = Number(number)
      if (number.length === 0 || !Number.isFinite(value)) return { ok: false, failure: 'empty' }
      numbers.push(value)
      actions.push(character)
      number = ''
    }

    const last = Number(number)
    if (number.length === 0 || !Number.isFinite(last)) return { ok: false, failure: 'empty' }
    numbers.push(last)

    let index = 0
    while (index < actions.length) {
      const action = actions[index]!
      if (!isFirstInOrder(action)) {
        index += 1
        continue
      }

      const left = numbers[index]!
      const right = numbers[index + 1]!
      if (action === '÷' && right === 0) return { ok: false, failure: 'divisionByZero' }

      numbers[index] = action === '×' ? multiply(left, right) : divide(left, right)
      numbers.splice(index + 1, 1)
      actions.splice(index, 1)
    }

    let result = numbers[0]!
    actions.forEach((action, position) => {
      const operand = numbers[position + 1]!
      result = action === '+' ? add(result, operand) : subtract(result, operand)
    })

    return { ok: true, value: rounded(result) }
  }

  private static formatted(number: string): string {
    if (number.length === 0) return ''

    const [whole = '', fraction] = number.split('.')
    const value = Number(whole.length === 0 ? '0' : whole)
    let result = wholeFormatter.format(Number.isFinite(value) ? value : 0)

    if (fraction !== undefined) result += decimalSeparator + fraction
    return result
  }
}

export const separatorSymbol = decimalSeparator
