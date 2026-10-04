// @vitest-environment jsdom
/** Loader activation, real sidebar placement, refresh, localization, and disposal. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as sidebarApply, inject as sidebarInject } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

const runtimes = new Set<SlotTestRuntime>()
afterEach(async () => {
  try { for (const runtime of runtimes) await runtime.dispose() }
  finally { runtimes.clear(); cleanup() }
})

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('zh')
  let provider = 'deepseek-official'
  const query = vi.fn().mockResolvedValue({ ok: true, value: { status: 'ready', amount: 10.99 } })
  const unmount = vi.fn(async () => {})
  const mount = vi.spyOn(runtime.remote, '$mount').mockResolvedValue(unmount)
  await runtime.ctx.plugin({
    apply(ctx: Context) { ctx.provide('remote.apiBalance', { get: query }) },
  }).await()
  const modelCatalog = vi.fn(async () => ({ ok: true, value: {
    default: { provider, model: 'test-model' }, groups: [], failures: [], routableProviders: [],
  } }))
  runtime.remote.provideNamespaces({ session: { modelCatalog } })
  Object.defineProperty(runtime.remote, Service.tracker, { value: { property: 'ctx', associate: 'remote' } })
  Object.defineProperty(runtime.remote, 'apiBalance', {
    get(this: { ctx: Context }): { get: typeof query } {
      return Reflect.get(this.ctx, 'remote.apiBalance') as { get: typeof query }
    },
  })
  await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never)
      ctx.provide('layout', { toggleSidebar: vi.fn(), selectPanel: vi.fn() } as never)
      ctx.provide('uiWorkspace', { startSession: vi.fn() } as never)
      ctx.provide('locale', locale)
      ctx.effect(() => locale.register('common', { zh: commonZh, en: commonEn }), 'balance test: common locale')
      ctx.slots.installLocale(locale)
      ctx.slots.inject('sidebar.settings', () => ctx.slots.register({ name: 'sidebar.settings' }, () => <button>Settings fixture</button>))
    },
  })
  function Frame({ renderSlot }: PropsRuntime<'root'> & PropsRenderSlots<'sidebar'>) {
    return <aside>{renderSlot('sidebar', { collapsed: false, width: 300 })}</aside>
  }
  await runtime.root.declare({ sidebar: { kind: 'single', scope: 'root' } }, Frame)
  await runtime.mount({ inject: [...sidebarInject], apply: sidebarApply })
  const backend = runtime.ctx.plugin(Loader)
  await backend.await()
  const loader = runtime.ctx.get('loader')
  if (loader === undefined) throw new Error('Loader did not activate')
  loader.builtins.include = Include
  loader.builtins['api-balance'] = { inject: [...inject], apply }
  await loader.create({ name: 'cordis:include', config: {
    path: pathToFileURL(resolve('packages/client/ui-api-balance/tests/fixtures/client.cordis.yml')).href,
  } })
  await loader.await()
  const view = runtime.renderRoot()
  await view.findByText('¥10.99')
  return { runtime, locale, backend, view, query, mount, unmount, setProvider: (value: string) => { provider = value } }
}

it('renders immediately above Settings, queries once, and refreshes through the generated Remote', async () => {
  const { view, query, mount, locale, backend, unmount } = await bench()
  const amount = view.getByRole('status')
  const settings = view.getByRole('button', { name: 'Settings fixture' })
  expect(amount.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(query).toHaveBeenCalledTimes(1)
  expect(mount).toHaveBeenCalledTimes(1)
  expect(view.container.querySelector('[data-slot="sidebar.footer.action"]')).toMatchSnapshot('balance above settings')
  query.mockResolvedValueOnce({ ok: true, value: { status: 'ready', amount: 0.09 } })
  fireEvent.click(view.getByRole('button', { name: '刷新余额' }))
  await view.findByText('¥0.09')
  expect(view.getByRole('status').getAttribute('data-tone')).toBe('critical')
  expect(query).toHaveBeenCalledTimes(2)
  await act(async () => { locale.setLocale('en') })
  expect(view.getByText('Balance:')).toBeTruthy()
  expect(view.getByRole('button', { name: 'Refresh balance' })).toBeTruthy()
  await act(async () => { await backend.dispose() })
  await waitFor(() => { expect(view.queryByRole('status')).toBeNull() })
  expect(unmount).toHaveBeenCalledTimes(1)
  expect(view.getByRole('button', { name: 'Settings fixture' })).toBeTruthy()
})

it('shows unsupported after provider changes and keeps its cached balance when returning', async () => {
  const { runtime, view, query, setProvider } = await bench()
  setProvider('external')
  await act(async () => { runtime.remote.emit('settings/document-updated', ['test-settings', 1]) })
  await view.findByText('不支持获取')
  fireEvent.click(view.getByRole('button', { name: '刷新余额' }))
  await waitFor(() => { expect(view.getByRole('status').textContent).toBe('不支持获取') })
  expect(query).toHaveBeenCalledTimes(1)
  setProvider('deepseek-official')
  await act(async () => { runtime.remote.emit('settings/document-updated', ['test-settings', 2]) })
  await view.findByText('¥10.99')
  expect(query).toHaveBeenCalledTimes(1)
})

it('follows the active conversation provider projection without fetching again', async () => {
  const { runtime, view, query } = await bench()
  const id = await runtime.sessions.add({ id: 'balance-conversation' })
  const reference = runtime.sessions.retain(id, { source: 'mainView' })
  try {
    await reference.ready
    await runtime.sessions.setProjection(id, 'modelSelection', {
      lastUsed: null, next: { provider: 'external', model: 'test-model' },
    })
    await view.findByText('不支持获取')
    expect(query).toHaveBeenCalledTimes(1)
    await runtime.sessions.setProjection(id, 'modelSelection', {
      lastUsed: null, next: { provider: 'deepseek-official', model: 'test-model' },
    })
    await view.findByText('¥10.99')
    expect(query).toHaveBeenCalledTimes(1)
  } finally { await act(async () => { reference.release() }) }
})
