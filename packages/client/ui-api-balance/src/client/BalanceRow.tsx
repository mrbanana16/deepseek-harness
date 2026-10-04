/** Sidebar balance presentation with an accessible icon-only refresh action. */
import { ICON_REGULAR_STROKE, IconRefreshOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { BalanceState } from './model.ts'
import css from './BalanceRow.module.css'

/** Private query callbacks and the renderer-bound balance source. */
export interface BalanceInjected {
  /** Fetch the current provider's balance manually. */
  refresh: () => void
  /** Reactive source consumed through the framework hook. */
  hooks: { balance: ObservableSnapshot<BalanceState> }
}

/** Composed sidebar footer props. */
export type BalanceRowProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'apiBalance'> & InjectFace<BalanceInjected>

/**
 * Render the amount or query status above Settings.
 * @param props - sidebar geometry, localized copy, and query source.
 * @returns balance row, or its refreshable money icon in the collapsed rail.
 */
export function BalanceRow({ wide, useBalance, refresh, t }: BalanceRowProps) {
  const state = useBalance(value => value)
  const text = state.status === 'ready' ? `¥${state.amount.toFixed(2)}` : t(state.status)
  const tone = state.status === 'ready' ? state.amount < 0.1 ? 'critical' : state.amount < 1 ? 'low' : 'normal' : undefined
  const label = `${t('title')}${text}`
  const icon = (
    <svg className={css.money} width={18} height={18} viewBox="0 0 16 16" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" strokeWidth={ICON_REGULAR_STROKE}>
      <circle cx={8} cy={8} r={6.25} />
      <path d="M10.1 5.6C9.7 5 8.9 4.7 8 4.7C6.8 4.7 5.9 5.3 5.9 6.2C5.9 8.4 10.1 7.6 10.1 9.8C10.1 10.7 9.2 11.3 8 11.3C7.1 11.3 6.3 11 5.9 10.4M8 3.7V12.3"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (!wide) return (
    <Tooltip label={`${label} · ${t('refresh')}`} side="right">
      <button type="button" className={css.rail} aria-label={`${label} · ${t('refresh')}`}
        disabled={state.status === 'loading'} onClick={refresh}>{icon}</button>
    </Tooltip>
  )
  return (
    <div className={css.row}>
      {icon}
      <span className={css.title}>{t('title')}</span>
      <span className={css.amount} data-tone={tone} role="status" aria-live="polite">{text}</span>
      <Tooltip label={t('refresh')}>
        <button type="button" className={css.refresh} aria-label={t('refresh')}
          disabled={state.status === 'loading'} onClick={refresh}>
          <IconRefreshOutlineRegular size={16} />
        </button>
      </Tooltip>
    </div>
  )
}
