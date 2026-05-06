import type { FiscalProvider } from './provider.ts';
import type { FiscalProviderName } from './types.ts';
import { PlugNotasProvider } from './providers/plugnotas.ts';
import { FocusNFeProvider } from './providers/focusnfe.ts';
import { ENotasProvider } from './providers/enotas.ts';

export type { FiscalProvider } from './provider.ts';
export type * from './types.ts';

export const getFiscalProvider = (provider: FiscalProviderName): FiscalProvider => {
  if (provider === 'plugnotas') return new PlugNotasProvider();
  if (provider === 'focusnfe') return new FocusNFeProvider();
  if (provider === 'enotas') return new ENotasProvider();
  throw new Error(`Provider fiscal não suportado: ${provider}`);
};
