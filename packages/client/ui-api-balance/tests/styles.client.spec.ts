/** Balance amount contrast against the shipped light and dark sidebar fills. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const theme = readFileSync(new URL('../../ui-theme/src/styles/design-platform.css', import.meta.url), 'utf8')
const style = readFileSync(new URL('../src/client/BalanceRow.module.css', import.meta.url), 'utf8')
type Color = readonly [number, number, number]

function themeVariables(dark: boolean): Map<string, string> {
  const values = new Map<string, string>()
  for (const [, selector = '', body = ''] of theme.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.includes('data-ds-dark-theme') && !dark) continue
    for (const [, key = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values.set(key, value.trim())
  }
  return values
}

function color(value: string, variables: Map<string, string>): Color {
  const reference = /^var\((--[\w-]+)\)$/.exec(value)
  if (reference?.[1] !== undefined) {
    const resolved = variables.get(reference[1])
    if (resolved === undefined) throw new Error(`Missing theme color: ${reference[1]}`)
    return color(resolved, variables)
  }
  const mix = /^color-mix\(in srgb, (var\(--[\w-]+\)) (\d+)%, (var\(--[\w-]+\))\)$/.exec(value)
  if (mix?.[1] !== undefined && mix[2] !== undefined && mix[3] !== undefined) {
    const left = color(mix[1], variables)
    const right = color(mix[3], variables)
    const weight = Number(mix[2]) / 100
    return [left[0] * weight + right[0] * (1 - weight), left[1] * weight + right[1] * (1 - weight),
      left[2] * weight + right[2] * (1 - weight)]
  }
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value)
  if (rgb !== null) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Unsupported test color: ${value}`)
}

function luminance(rgb: Color): number {
  const linear = rgb.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722
}

it.each([false, true])('keeps all three amount colors readable with dark=%s', (dark) => {
  const variables = themeVariables(dark)
  const background = color('var(--dsw-specific-sidebar-fill)', variables)
  const iconRule = /\.money \{[^}]*color: ([^;]+);/.exec(style)
  if (iconRule?.[1] === undefined) throw new Error('Missing money icon color')
  const iconInk = color(iconRule[1], variables)
  expect((Math.max(luminance(iconInk), luminance(background)) + 0.05)
    / (Math.min(luminance(iconInk), luminance(background)) + 0.05), 'money icon').toBeGreaterThanOrEqual(3)
  for (const tone of ['normal', 'low', 'critical']) {
    const rule = new RegExp(`\\.amount\\[data-tone='${tone}'\\] \\{ color: ([^;]+);`).exec(style)
    if (rule?.[1] === undefined) throw new Error(`Missing ${tone} amount color`)
    const ink = color(rule[1], variables)
    const lighter = Math.max(luminance(ink), luminance(background))
    const darker = Math.min(luminance(ink), luminance(background))
    expect((lighter + 0.05) / (darker + 0.05), tone).toBeGreaterThanOrEqual(4.5)
  }
})
