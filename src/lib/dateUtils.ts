import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Parses a YYYY-MM-DD date string into a Date object set to local midnight,
 * completely avoiding timezone shift issues.
 */
export const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day);
};

/**
 * Formats a YYYY-MM-DD date string directly to DD/MM/YYYY.
 */
export const formatEventDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('pt-BR');
};

/**
 * Formats a YYYY-MM-DD date string to dd de MMM, yyyy.
 */
export const formatSafeEventDate = (value?: string | null): string => {
  const date = parseLocalDate(value);
  if (!date) return '-';
  return format(date, "dd 'de' MMM, yyyy", { locale: ptBR });
};
