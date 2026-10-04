/** Official balance endpoint, live credential selection, redaction, and Loader lifetime. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import ApiBalanceQuery from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => {
  try { await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) }
  finally { vi.unstubAllGlobals() }
})

async function bench() {
  const ctx = new Context()
  roots.push(ctx)
  let apiKeyEnv = 'SELECTED_KEY'
  let baseURL = 'https://api.deepseek.com/anthropic'
  let active = true
  const credential = vi.fn(async (ref: string) => ({ value: ref === 'SELECTED_KEY' ? 'sk-first-test' : 'sk-second-test' }))
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([]))
  ctx.provide('llm', {
    listProviders: () => active ? [{ id: 'deepseek-official' }] : [],
    listConfigurableProviders: () => [{ provider: 'deepseek-official', settingsNs: 'custom-provider-id', settingsPath: [] }],
  } as never)
  ctx.provide('settings', { describe: () => [{ ns: 'custom-provider-id', value: { apiKeyEnv, baseURL } }] } as never)
  ctx.provide('credentials', { resolve: credential } as never)
  const fiber = ctx.plugin(Loader)
  await fiber.await()
  const loader = ctx.get('loader')
  if (loader === undefined) throw new Error('Loader did not activate')
  loader.builtins.include = Include
  loader.builtins['api-balance'] = ApiBalanceQuery
  await loader.create({ name: 'cordis:include', config: {
    path: pathToFileURL(resolve('packages/client/ui-api-balance/tests/fixtures/host.cordis.yml')).href,
  } })
  await loader.await()
  const query = ctx.get('apiBalanceQuery') as ApiBalanceQuery | undefined
  if (query === undefined) throw new Error('Balance query did not activate')
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ is_available: true,
    balance_infos: [{ currency: 'CNY', total_balance: '10.99', granted_balance: '1.00', topped_up_balance: '9.99' }],
  }))
  vi.stubGlobal('fetch', fetcher)
  return { ctx, query, fetcher, credential,
    setKey: (value: string) => { apiKeyEnv = value },
    setEndpoint: (value: string) => { baseURL = value },
    deactivate: () => { active = false },
  }
}

describe('balance Host plugin through Loader', () => {
  it('reads the configured credential reference for every refresh and exposes only CNY total', async () => {
    const { query, credential, fetcher, setKey } = await bench()
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'ready', amount: 10.99 })
    expect(credential).toHaveBeenCalledWith('SELECTED_KEY')
    expect(fetcher).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', expect.objectContaining({
      headers: { Authorization: 'Bearer sk-first-test', Accept: 'application/json' }, redirect: 'error',
    }))
    setKey('OTHER_KEY')
    fetcher.mockResolvedValueOnce(Response.json({ is_available: false,
      balance_infos: [{ currency: 'USD', total_balance: '100' }, { currency: 'CNY', total_balance: '0.09' }],
    }))
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'ready', amount: 0.09 })
    expect(credential).toHaveBeenLastCalledWith('OTHER_KEY')
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual({ Authorization: 'Bearer sk-second-test', Accept: 'application/json' })
  })

  it('does not send external or disabled-provider credentials to DeepSeek', async () => {
    const { query, fetcher, credential, setEndpoint, deactivate } = await bench()
    expect(await query.get('external', new AbortController().signal)).toEqual({ status: 'unsupported' })
    setEndpoint('https://gateway.example/anthropic')
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'unsupported' })
    deactivate()
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'unsupported' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(credential).not.toHaveBeenCalled()
  })

  it.each([
    { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 'not a number' }] },
    { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '' }] },
    { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '9'.repeat(400) }] },
    { balance_infos: [] },
  ])('rejects invalid external JSON without leaking its content', async (payload) => {
    const { query, fetcher } = await bench()
    fetcher.mockResolvedValueOnce(Response.json(payload))
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'error' })
  })

  it('reports missing keys, HTTP failures, and non-CNY balances', async () => {
    const { query, fetcher, credential } = await bench()
    credential.mockResolvedValueOnce(undefined as never)
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'error' })
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValueOnce(new Response('private provider error', { status: 401 }))
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'error' })
    fetcher.mockResolvedValueOnce(Response.json({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '3' }] }))
    expect(await query.get('deepseek-official', new AbortController().signal)).toEqual({ status: 'unsupported' })
  })

  it('unloads the service, aborts its fetch, and awaits request settlement', async () => {
    const { ctx, query, fetcher } = await bench()
    const started = Promise.withResolvers<AbortSignal>()
    fetcher.mockImplementationOnce(async (_url, init) => {
      const signal = init?.signal
      if (signal == null) throw new Error('Missing fetch signal')
      started.resolve(signal)
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('Aborted test fetch')) }, { once: true })
      })
    })
    const pending = query.get('deepseek-official', new AbortController().signal)
    const signal = await started.promise
    await ctx.fiber.dispose()
    expect(signal.aborted).toBe(true)
    expect(await pending).toEqual({ status: 'error' })
    expect(ctx.get('apiBalanceQuery')).toBeUndefined()
  })
})
