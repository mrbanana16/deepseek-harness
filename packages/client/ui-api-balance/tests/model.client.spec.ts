/** Balance query frequency, provider switches, and late response isolation. */
import { describe, expect, it, vi } from 'vitest'
import { BalanceModel } from '../src/client/model.ts'
import type { ApiBalanceResult } from '../src/types.ts'

describe('page balance query', () => {
  it('queries once on the official route and refreshes only on request', async () => {
    const query = vi.fn().mockResolvedValue({ status: 'ready', amount: 10.99 })
    const model = new BalanceModel(query)
    try {
      model.select('deepseek-official')
      await model.refresh()
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 10.99 })
      expect(query).toHaveBeenCalledTimes(1)
      model.select('external')
      expect(model.state.getSnapshot()).toEqual({ status: 'unsupported' })
      await model.refresh()
      model.select('deepseek-official')
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 10.99 })
      expect(query).toHaveBeenCalledTimes(1)
      query.mockResolvedValue({ status: 'ready', amount: 0.09 })
      await model.refresh()
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 0.09 })
      expect(query).toHaveBeenCalledTimes(2)
    } finally { await model.dispose() }
  })

  it('keeps a late official reply hidden while another provider is selected', async () => {
    const result = Promise.withResolvers<ApiBalanceResult>()
    const query = vi.fn(() => result.promise)
    const model = new BalanceModel(query)
    try {
      model.select('deepseek-official')
      const pending = model.refresh()
      model.select('external')
      result.resolve({ status: 'ready', amount: 12 })
      await pending
      expect(model.state.getSnapshot()).toEqual({ status: 'unsupported' })
      model.select('deepseek-official')
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 12 })
      expect(query).toHaveBeenCalledTimes(1)
    } finally { result.resolve({ status: 'error' }); await model.dispose() }
  })

  it('reports rejected queries and permits manual recovery', async () => {
    const query = vi.fn().mockRejectedValue(new Error('private transport detail'))
    const model = new BalanceModel(query)
    try {
      model.select('deepseek-official')
      await model.refresh()
      expect(model.state.getSnapshot()).toEqual({ status: 'error' })
      query.mockResolvedValue({ status: 'ready', amount: 1 })
      await model.refresh()
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 1 })
    } finally { await model.dispose() }
  })

  it('aborts and awaits an outstanding query without publishing after disposal', async () => {
    const started = Promise.withResolvers<AbortSignal>()
    const finished = Promise.withResolvers<ApiBalanceResult>()
    const model = new BalanceModel((_provider, signal) => { started.resolve(signal); return finished.promise })
    model.select('deepseek-official')
    const signal = await started.promise
    const dispose = model.dispose()
    expect(signal.aborted).toBe(true)
    finished.resolve({ status: 'ready', amount: 2 })
    await dispose
    expect(model.state.getSnapshot()).toEqual({ status: 'loading' })
    model.select('external')
    await model.refresh()
    expect(model.state.getSnapshot()).toEqual({ status: 'loading' })
  })
  it('keeps selection read failures visible until the provider resolves', async () => {
    const query = vi.fn().mockResolvedValue({ status: 'ready', amount: 2 })
    const model = new BalanceModel(query)
    try {
      model.selectionFailed()
      await model.refresh()
      expect(model.state.getSnapshot()).toEqual({ status: 'error' })
      expect(query).not.toHaveBeenCalled()
      model.select('deepseek-official')
      await model.refresh()
      model.selectionFailed()
      expect(model.state.getSnapshot()).toEqual({ status: 'error' })
      model.select('deepseek-official')
      expect(model.state.getSnapshot()).toEqual({ status: 'ready', amount: 2 })
      expect(query).toHaveBeenCalledTimes(1)
    } finally { await model.dispose() }
  })

})
