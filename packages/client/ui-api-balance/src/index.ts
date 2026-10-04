/** Host query of the official DeepSeek API balance with the active provider credential. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type {} from '@deepseek-ai/dsh-settings'
import type { ApiBalanceResult } from './types.ts'

/** Deadline for an official balance request. */
export interface Config {
  /** Maximum request duration, including reading the response JSON. */
  timeoutMs: number
}

const providerConfig = schema.object({ apiKeyEnv: schema.string().min(1), baseURL: schema.string().optional() })
const balanceResponse = schema.object({
  is_available: schema.boolean(),
  balance_infos: schema.array(schema.object({
    currency: schema.enum(['CNY', 'USD']),
    total_balance: schema.string().regex(/^-?\d+(?:\.\d+)?$/),
  })),
})

/** Authenticated Host Remote for API-key balance, without exposing credentials. */
export default class ApiBalanceQuery extends TypertRemoteService {
  static inject = ['llm', 'settings', 'credentials']
  static Config: z<Partial<Config>, Config> = z.object({
    timeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(10000),
  })
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<ApiBalanceResult>>()

  /**
   * @param ctx - Host with provider, settings, and credential services.
   * @param config - balance request deadline.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'apiBalanceQuery', { namespace: 'apiBalance' })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.pending)
    }, 'api-balance: request lifetime')
  }

  /**
   * Read the CNY total balance for the configured official API-key route.
   * @param provider - provider selected in the requesting browser.
   * @param signal - requesting Remote call lifetime.
   * @returns balance, unsupported provider/currency, or a redacted failure.
   */
  @Remote
  async get(provider: string, signal: AbortSignal): Promise<ApiBalanceResult> {
    const operation = this.read(provider, signal).finally(() => { this.pending.delete(operation) })
    this.pending.add(operation)
    return operation
  }

  private async read(provider: string, signal: AbortSignal): Promise<ApiBalanceResult> {
    if (provider !== 'deepseek-official'
      || !this.ctx.llm.listProviders().some(row => row.id === provider)) return { status: 'unsupported' }
    try {
      const route = this.ctx.llm.listConfigurableProviders().find(row => row.provider === provider)
      if (route === undefined) return { status: 'unsupported' }
      const descriptor = this.ctx.settings.describe().find(row => row.ns === route.settingsNs)
      const options = providerConfig.parse(descriptor?.value)
      const environment = launchEnvironmentOf(this.ctx)
      const endpoint = new URL(options.baseURL ?? environment.get('DEEPSEEK_BASE_URL')?.value ?? 'https://api.deepseek.com/anthropic')
      if (endpoint.origin !== 'https://api.deepseek.com') return { status: 'unsupported' }
      const credential = await this.ctx.credentials.resolve(credentialRef(options.apiKeyEnv))
      if (credential === undefined) return { status: 'error' }
      const key = assertUsableApiKey(credential.value, 'api-balance', options.apiKeyEnv)
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(this.config.timeoutMs)]),
        redirect: 'error',
      })
      if (!response.ok) {
        await response.body?.cancel()
        return { status: 'error' }
      }
      const data = balanceResponse.parse(await response.json())
      const cny = data.balance_infos.find(row => row.currency === 'CNY')
      if (cny === undefined) return { status: 'unsupported' }
      const amount = Number(cny.total_balance)
      return Number.isFinite(amount) ? { status: 'ready', amount } : { status: 'error' }
    } catch (error) {
      // Provider and transport failures expose no credential or response body to the browser.
      void error
      return { status: 'error' }
    }
  }
}
