import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import CalendarTab from '@/components/CalendarTab';

const CalendarioFinanceiroPage = () => {
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-select-cal'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('companies')
        .select('id, legal_name, trade_name, cnpj')
        .order('trade_name', { ascending: true });
      if (error) return [];
      return data || [];
    },
  });

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Calendário Financeiro</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">Entradas e Saídas • Fluxo de Caixa Mensal</p>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="px-2">
          <div className="bg-white rounded-2xl border border-border/30 p-4 max-w-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Empresa / CNPJ</p>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="h-11 w-full rounded-xl border border-border/40 px-3 text-sm"
            >
              <option value="all">Consolidado (todas as empresas)</option>
              {companies.map((company: any) => (
                <option key={company.id} value={company.id}>
                  {(company.trade_name || company.legal_name || 'Empresa')} {company.cnpj ? `- ${company.cnpj}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="px-2">
        <CalendarTab selectedCompany={selectedCompany} />
      </div>
    </div>
  );
};

export default CalendarioFinanceiroPage;
