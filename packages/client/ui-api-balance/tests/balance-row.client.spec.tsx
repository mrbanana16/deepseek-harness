// @vitest-environment jsdom
/** Localized status, currency formatting, threshold colors, and icon-only refresh. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BalanceRow } from '../src/client/BalanceRow.tsx'
import type { BalanceRowProps } from '../src/client/BalanceRow.tsx'
import type { BalanceState } from '../src/client/model.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
function row(state: BalanceState, wide = true) {
  const refresh = vi.fn()
  const props = {
    wide, refresh,
    t: (key: keyof typeof zh) => zh[key],
    useBalance: (select: (value: BalanceState) => unknown) => select(state),
  } as BalanceRowProps
  return { refresh, ...render(<BalanceRow {...props} />) }
}

it.each([
  [10.99, '¥10.99', 'normal'], [1, '¥1.00', 'normal'], [0.999, '¥1.00', 'low'],
  [0.1, '¥0.10', 'low'], [0.099, '¥0.10', 'critical'], [0, '¥0.00', 'critical'],
] as const)('formats %s and uses its unrounded threshold', (amount, text, tone) => {
  const { refresh } = row({ status: 'ready', amount })
  expect(screen.getByText('余额：')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe(text)
  expect(screen.getByRole('status').getAttribute('data-tone')).toBe(tone)
  const button = screen.getByRole('button', { name: '刷新余额' })
  expect(button.textContent).toBe('')
  fireEvent.click(button)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it.each([['loading', '获取中'], ['error', '获取失败'], ['unsupported', '不支持获取']] as const)(
  'shows %s in place and disables refresh only during loading', (status, text) => {
    row({ status })
    expect(screen.getByRole('status').textContent).toBe(text)
    expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(status === 'loading')
  },
)

it('keeps the rail refreshable with an accessible balance', () => {
  const { refresh } = row({ status: 'ready', amount: 10.99 }, false)
  const button = screen.getByRole('button', { name: '余额：¥10.99 · 刷新余额' })
  expect(button.textContent).toBe('')
  expect(button.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor')
  expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  fireEvent.click(button)
  expect(refresh).toHaveBeenCalledTimes(1)
})
