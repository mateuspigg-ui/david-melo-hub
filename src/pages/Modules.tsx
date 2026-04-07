const PlaceholderPage = ({ title, description }: { title: string; description: string }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <h1 className="text-2xl font-display text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
    <div className="bg-card rounded-xl p-12 border border-border/50 flex flex-col items-center justify-center text-center">
      <p className="text-muted-foreground">Em desenvolvimento</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Esta seção será implementada em breve</p>
    </div>
  </div>
);

export const ContratosPage = () => <PlaceholderPage title="Contratos" description="Gerencie contratos de eventos" />;
export const DocumentosPage = () => <PlaceholderPage title="Documentos" description="Documentos da empresa" />;
export const FornecedoresPage = () => <PlaceholderPage title="Fornecedores" description="Cadastro de fornecedores" />;
export const ClientesPage = () => <PlaceholderPage title="Meus Clientes" description="Gestão de clientes" />;
export const CRMPage = () => <PlaceholderPage title="Gestão de Clientes" description="Pipeline comercial" />;
export const EventosPage = () => <PlaceholderPage title="Eventos" description="Gestão de eventos" />;
export const AgendaPage = () => <PlaceholderPage title="Agenda" description="Calendário de eventos" />;
export const PagamentosPage = () => <PlaceholderPage title="Pagamentos" description="Controle de pagamentos" />;
export const ConciliacaoPage = () => <PlaceholderPage title="Conciliação Bancária" description="Reconciliação financeira" />;
export const ContasPagarPage = () => <PlaceholderPage title="Contas a Pagar" description="Controle de despesas" />;
export const RecebimentosPage = () => <PlaceholderPage title="Recebimentos" description="Valores a receber" />;
export const EquipePage = () => <PlaceholderPage title="Equipe" description="Gestão da equipe" />;
