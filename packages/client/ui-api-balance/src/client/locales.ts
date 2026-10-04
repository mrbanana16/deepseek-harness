/** Locale-owned balance and refresh copy. */
export const zh = {
  title: '余额：', loading: '获取中', error: '获取失败', unsupported: '不支持获取', refresh: '刷新余额',
}
/** English balance and refresh copy. */
export const en: Record<keyof typeof zh, string> = {
  title: 'Balance:', loading: 'Loading', error: 'Failed to fetch', unsupported: 'Not supported', refresh: 'Refresh balance',
}
/** Balance dictionary keys. */
export type BalanceKey = keyof typeof zh
