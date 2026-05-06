export type FiscalProviderName = 'plugnotas' | 'focusnfe' | 'enotas';

export type FiscalEnvironment = 'homologation' | 'production';

export type FiscalInvoiceItem = {
  description: string;
  service_code?: string | null;
  quantity: number;
  unit_amount: number;
  total_amount: number;
};

export type FiscalIssuePayload = {
  invoice_id: string;
  company_id: string;
  client_id: string;
  environment: FiscalEnvironment;
  amount_services: number;
  amount_iss: number;
  amount_net: number;
  rps_series?: string | null;
  items: FiscalInvoiceItem[];
};

export type FiscalIssueResult = {
  accepted: boolean;
  provider_reference: string;
  raw?: unknown;
};

export type FiscalCancelPayload = {
  invoice_id: string;
  provider_reference: string;
  reason: string;
  environment: FiscalEnvironment;
};

export type FiscalCancelResult = {
  accepted: boolean;
  raw?: unknown;
};

export type FiscalWebhookNormalizedEvent = {
  provider_reference: string;
  status: 'processing' | 'authorized' | 'rejected' | 'cancelled';
  invoice_number?: string | null;
  verification_code?: string | null;
  pdf_url?: string | null;
  xml_url?: string | null;
  reason?: string | null;
  issued_at?: string | null;
  cancelled_at?: string | null;
  raw?: unknown;
};

export type FiscalProviderConfig = {
  provider: FiscalProviderName;
  environment: FiscalEnvironment;
  api_key?: string | null;
  token?: string | null;
  city_code?: string | null;
};
