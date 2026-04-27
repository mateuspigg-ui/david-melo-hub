const MONEY_LOCALE_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export const maskCurrencyInput = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', MONEY_LOCALE_OPTIONS);
};

export const formatCurrencyInput = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString('pt-BR', MONEY_LOCALE_OPTIONS);
  }
  return maskCurrencyInput(value);
};

export const parseCurrencyInput = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return value;

  const normalized = String(value).trim();
  if (!normalized) return NaN;

  if (normalized.includes(',')) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;

  const digits = normalized.replace(/\D/g, '');
  if (!digits) return NaN;
  return Number(digits) / 100;
};
