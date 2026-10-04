/** Registers the API balance Remote contribution and the sidebar footer row. */
import type { ModelSelectionProjection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import balanceRemote from '@deepseek-ai/dsh-client-ui-api-balance/remote'
import { BalanceModel } from './model.ts'
import { BalanceRow, type BalanceInjected } from './BalanceRow.tsx'
import { en, zh, type BalanceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** API-key balance and refresh action. */
    apiBalance: BalanceKey
  }
}

/** Required services for balance transport, model selection, and localized rendering. */
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'sessions']

/**
 * Mount a disposable balance row and fetch once for the page's official route.
 * @param ctx - browser plugin context.
 * @returns disposer after mounting the generated balance Remote namespace.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(balanceRemote)
  const consumer = ctx.inject(['remote.apiBalance'], (ctx) => {
    const model = new BalanceModel(async (provider, signal) => {
      const result = await ctx.remote.apiBalance.get(provider, signal)
      return result.ok ? result.value : { status: 'error' }
    })
    ctx.effect(() => ctx.locale.register('apiBalance', { zh, en }), 'api-balance: dictionaries')
    let defaultProvider: string | undefined
    let selectionEpoch = 0
    let selectedSource: ObservableSnapshot<unknown> | undefined
    let stopSelected: (() => void) | undefined
    const syncSelection = (): void => {
      const list = ctx.sessions.list.getSnapshot()
      const current = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
      const source = current === undefined ? undefined
        : ctx.sessions.binding(current.id)?.session.projections.faceOf('modelSelection')
      if (source !== selectedSource) {
        stopSelected?.()
        selectedSource = source
        stopSelected = source?.subscribe(syncSelection)
      }
      const projected = (selectedSource?.getSnapshot() as ModelSelectionProjection | undefined)
        ?? (current === undefined ? undefined : list.projectionsBySession[current.id]?.values.modelSelection)
      model.select(projected?.next?.provider ?? defaultProvider)
    }
    const readDefault = async (): Promise<boolean> => {
      const epoch = ++selectionEpoch
      try {
        const result = await ctx.remote.session.modelCatalog()
        if (epoch !== selectionEpoch) return false
        if (!result.ok) { model.selectionFailed(); return false }
        defaultProvider = result.value.default.provider
        syncSelection()
        return true
      } catch (error) {
        // Balance status owns failures reading the default provider.
        void error
        if (epoch === selectionEpoch) model.selectionFailed()
        return false
      }
    }
    ctx.effect(() => {
      const stops = [
        ctx.sessions.list.subscribe(syncSelection),
        ctx.remote.$on('settings/document-updated', () => { void readDefault() }),
        ctx.remote.$on('llm/adapters-updated', () => { void readDefault() }),
      ]
      syncSelection()
      void readDefault()
      return async () => {
        selectionEpoch++
        stopSelected?.()
        for (const stop of stops) stop()
        await model.dispose()
      }
    }, 'api-balance: selected provider and query lifetime')
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action', id: 'api-balance', order: 100, locale: 'apiBalance',
      inject: (): BalanceInjected => ({
        hooks: { balance: model.state },
        refresh: () => { void readDefault().then(ready => ready ? model.refresh() : undefined) },
      }),
    }, BalanceRow))
  })
  await consumer
  return unmount
}
