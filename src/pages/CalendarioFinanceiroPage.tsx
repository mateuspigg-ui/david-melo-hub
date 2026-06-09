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
    <div className="page-container">
      <div className="page-header">
        <div className="space-y-2">
          <div className="page-header-title-container">
            <div className="page-header-bar" />
            <h1 className="page-header-title">Calendário Financeiro</h1>
          </div>
          <p className="page-header-subtitle">Entradas e Saídas • Fluxo de Caixa Mensal</p>
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
