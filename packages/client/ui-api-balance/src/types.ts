/** Display-safe outcomes of the official API-key balance query. */
export type ApiBalanceResult =
  | { status: 'ready'; amount: number }
  | { status: 'unsupported' }
  | { status: 'error' }
