/** Browser-owned balance query result, retained across sidebar remounts. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ApiBalanceResult } from '../types.ts'

/** Balance status visible in the sidebar. */
export type BalanceState = ApiBalanceResult | { status: 'loading' }

/** One page's result, fetched on first supported selection and explicit refresh. */
export class BalanceModel {
  /** Bare source bound by the slot renderer to useBalance. */
  readonly state = createSnapshotStore<BalanceState>({ status: 'loading' })
  private readonly lifetime = new AbortController()
  private provider: string | undefined
  private cached: BalanceState | undefined
  private pending: Promise<void> | undefined

  /** @param query - authenticated balance operation returning only display-safe data. */
  constructor(private readonly query: (provider: string, signal: AbortSignal) => Promise<ApiBalanceResult>) {}

  /**
   * Change the displayed provider without polling its balance.
   * @param provider - selected provider, or undefined while resolving it.
   */
  select(provider: string | undefined): void {
    if (this.lifetime.signal.aborted || this.provider === provider) return
    this.provider = provider
    if (provider === undefined) { this.state.set({ status: 'loading' }); return }
    if (provider !== 'deepseek-official') { this.state.set({ status: 'unsupported' }); return }
    if (this.cached !== undefined) { this.state.set(this.cached); return }
    void this.refresh()
  }

  /**
   * Query once; repeated clicks share the outstanding request.
   * @returns completion after the visible outcome settles.
   */
  async refresh(): Promise<void> {
    if (this.lifetime.signal.aborted || this.provider === undefined) return
    if (this.provider !== 'deepseek-official') { this.state.set({ status: 'unsupported' }); return }
    if (this.pending !== undefined) return this.pending
    this.cached = { status: 'loading' }
    this.state.set(this.cached)
    this.pending = this.query(this.provider, this.lifetime.signal).then((result) => {
      this.cached = result
    }).catch((error: unknown) => {
      // The row reports rejected transport calls without exposing their messages.
      void error
      this.cached = { status: 'error' }
    }).finally(() => {
      this.pending = undefined
      if (!this.lifetime.signal.aborted && this.provider === 'deepseek-official' && this.cached !== undefined) {
        this.state.set(this.cached)
      }
    })
    return this.pending
  }

  /** Show a provider-selection read failure without starting a balance request. */
  selectionFailed(): void {
    if (this.lifetime.signal.aborted) return
    this.provider = undefined
    this.state.set({ status: 'error' })
  }

  /**
   * Cancel outstanding work and prevent updates after plugin disposal.
   * @returns completion after the outstanding query settles.
   */
  async dispose(): Promise<void> { this.lifetime.abort(); await this.pending }
}
