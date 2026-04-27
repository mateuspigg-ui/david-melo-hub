import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Loader2, CalendarHeart, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventCard } from '@/components/events/EventCard';
import { EventFormDialog } from '@/components/events/EventFormDialog';
import { cn } from '@/lib/utils';

const INTERNAL_ACTIVITY_TYPES = ['Reunião', 'Degustação', 'Atendimento ao Cliente', 'Formatação de Festas'];

const EventosPage = () => {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          clients:client_id (first_name, last_name),
          leads:lead_id (title)
        `)
        .order('event_date', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  const filteredEvents = useMemo(() => {
    return (events || [])
      .filter((evt: any) => {
        const isInternal = INTERNAL_ACTIVITY_TYPES.includes(evt.event_type || '');
        if (isInternal) return false;

        return (
          evt.title?.toLowerCase().includes(search.toLowerCase()) ||
          evt.event_type?.toLowerCase().includes(search.toLowerCase())
        );
      })
      .sort((a: any, b: any) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [events, search]);

  return (
  return (
    <div className="space-y-12 animate-fade-in max-w-[1700px] mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Gestão de Eventos</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Agenda Executiva e Orçamentos</p>
        </div>
        <Button 
          onClick={() => { setEditingEvent(null); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-14 px-10 rounded-2xl shadow-gold uppercase text-[11px] tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={20} className="mr-3" /> Novo Evento
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
        {/* Search */}
        <div className="relative group max-w-xl flex-1">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-gold transition-colors z-10" />
          <Input 
            placeholder="Buscar eventos por título ou tipo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-14 bg-white/50 backdrop-blur-sm border-border/30 focus:border-gold/50 h-14 rounded-2xl transition-all focus:ring-4 focus:ring-gold/5 premium-shadow text-sm font-medium"
          />
        </div>

        <div className="flex items-center gap-2 bg-white/30 backdrop-blur-md p-1.5 rounded-2xl border border-border/10 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setViewMode('cards')}
            className={cn(
              "h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
              viewMode === 'cards' ? 'bg-white text-gold shadow-sm border border-gold/10' : 'text-muted-foreground/60 hover:text-gold hover:bg-gold/5'
            )}
          >
            <LayoutGrid size={14} className="mr-2" /> Cards
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setViewMode('list')}
            className={cn(
              "h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
              viewMode === 'list' ? 'bg-white text-gold shadow-sm border border-gold/10' : 'text-muted-foreground/60 hover:text-gold hover:bg-gold/5'
            )}
          >
            <List size={14} className="mr-2" /> Lista
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex justify-center items-center py-32 bg-white/30 backdrop-blur-md rounded-[40px] border border-border/10 mx-2">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-gold/40" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold/40">Sincronizando Agenda...</p>
          </div>
        </div>
      ) : filteredEvents?.length === 0 ? (
        <div className="mx-2 bg-white/40 backdrop-blur-md rounded-[40px] p-24 border border-border/20 text-center flex flex-col items-center justify-center premium-shadow">
          <div className="w-20 h-20 rounded-3xl bg-secondary/30 flex items-center justify-center mb-6">
            <CalendarHeart size={40} className="text-muted-foreground/30" />
          </div>
          <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Nenhum evento agendado</h3>
          <p className="text-xs text-muted-foreground/60 mt-2 font-black uppercase tracking-widest max-w-xs leading-relaxed">
            {search ? 'Nenhum resultado para sua busca. Tente novos termos.' : 'Sua agenda está livre. Comece a planejar seu próximo grande evento.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 px-2">
          {filteredEvents?.map((evt: any) => (
            <EventCard 
              key={evt.id} 
              event={evt} 
              onClick={(e) => { setEditingEvent(e as any); setDialogOpen(true); }} 
            />
          ))}
        </div>
      ) : (
        <div className="mx-2 bg-white rounded-[32px] border border-border/30 premium-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/20 border-b border-border/10">
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Descrição do Evento</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Tipo / Categoria</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Cliente Vinculado</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Cronograma</th>
                  <th className="text-right py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/5">
                {filteredEvents?.map((evt: any) => (
                  <tr key={evt.id} className="group hover:bg-gold/5 transition-colors duration-300">
                    <td className="py-6 px-8">
                      <p className="font-bold text-foreground text-base tracking-tight uppercase group-hover:text-gold transition-colors">{evt.title}</p>
                    </td>
                    <td className="py-6 px-8">
                      <span className="px-3 py-1 rounded-full bg-secondary/50 border border-border/10 text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                        {evt.event_type || 'Social'}
                      </span>
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gold/5 flex items-center justify-center text-gold text-[10px] font-black border border-gold/10">
                          {evt.clients ? evt.clients.first_name[0] : (evt.leads?.title[0] || 'E')}
                        </div>
                        <span className="text-xs font-bold text-foreground/80 tracking-wide">
                          {evt.clients ? `${evt.clients.first_name} ${evt.clients.last_name}` : (evt.leads?.title || 'Não Identificado')}
                        </span>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground tracking-widest uppercase">
                          {evt.event_date ? new Date(evt.event_date).toLocaleDateString('pt-BR') : '—'}
                        </p>
                        {evt.event_time && <p className="text-[9px] text-muted-foreground/50 font-black uppercase tracking-[0.2em]">{evt.event_time.substring(0, 5)}h</p>}
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => { setEditingEvent(evt as any); setDialogOpen(true); }} 
                          className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-gold hover:bg-gold/10 rounded-xl"
                        >
                          Configurar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EventFormDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        onSaved={refetch}
      />
    </div>
  );
};

export default EventosPage;
