import type {
  FiscalCancelPayload,
  FiscalCancelResult,
  FiscalIssuePayload,
  FiscalIssueResult,
  FiscalWebhookNormalizedEvent,
} from './types.ts';

export interface FiscalProvider {
  issueInvoice(payload: FiscalIssuePayload): Promise<FiscalIssueResult>;
  cancelInvoice(payload: FiscalCancelPayload): Promise<FiscalCancelResult>;
  normalizeWebhook(payload: unknown, headers?: Headers): FiscalWebhookNormalizedEvent;
}
