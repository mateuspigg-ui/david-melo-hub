import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Loader2, CalendarHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventCard } from '@/components/events/EventCard';
import { EventFormDialog } from '@/components/events/EventFormDialog';

const INTERNAL_ACTIVITY_TYPES = ['Reunião', 'Degustação', 'Atendimento ao Cliente', 'Formatação de Festas'];

const EventosPage = () => {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

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

  const filteredEvents = events?.filter((evt) => {
    const isInternal = INTERNAL_ACTIVITY_TYPES.includes(evt.event_type || '');
    if (isInternal) return false;

    return (
      evt.title?.toLowerCase().includes(search.toLowerCase()) ||
      evt.event_type?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase flex items-center gap-2">
            <CalendarHeart className="h-8 w-8 text-gold" />
            Gestão de Eventos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body">
            Gerencie seus eventos, cadastre datas, metas de orçamento e vincule aos seus clientes
          </p>
        </div>
        <Button 
          onClick={() => { setEditingEvent(null); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-semibold shadow-gold px-6 h-11 rounded-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" /> Novo Evento
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Input 
          placeholder="Buscar eventos por título ou tipo..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-md bg-secondary/30 border-border/40 focus:border-gold h-11"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-gold" />
        </div>
      ) : filteredEvents?.length === 0 ? (
        <div className="bg-card premium-shadow rounded-2xl p-20 flex flex-col items-center justify-center text-center border border-border/40">
          <CalendarHeart className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <p className="text-foreground text-lg font-bold mb-2">Nenhum evento encontrado.</p>
          <p className="text-sm text-muted-foreground font-medium">Comece criando um novo evento para popular sua agenda.</p>
          <Button 
            variant="outline" 
            onClick={() => setDialogOpen(true)}
            className="mt-6 border-gold text-gold hover:bg-gold/5"
          >
            Cadastrar Primeiro Evento
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredEvents?.map(evt => (
            <EventCard 
              key={evt.id} 
              event={evt} 
              onClick={(e) => { setEditingEvent(e as any); setDialogOpen(true); }} 
            />
          ))}
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
