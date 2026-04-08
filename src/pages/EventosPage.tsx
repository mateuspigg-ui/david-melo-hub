import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Loader2, CalendarHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventCard } from '@/components/events/EventCard';
import { EventFormDialog } from '@/components/events/EventFormDialog';

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

  const filteredEvents = events?.filter(evt => 
    evt.title?.toLowerCase().includes(search.toLowerCase()) || 
    evt.event_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-gold tracking-wide flex items-center gap-2">
            <CalendarHeart className="h-8 w-8" />
            Gestão de Eventos
          </h1>
          <p className="text-sm text-foreground/60 mt-1 font-body">
            Gerencie seus eventos, cadastre datas, metas de orçamento e vincule aos seus clientes
          </p>
        </div>
        <Button 
          onClick={() => { setEditingEvent(null); setDialogOpen(true); }}
          className="bg-gold hover:bg-gold-light text-dark font-medium shadow-gold"
        >
          <Plus className="w-5 h-5 mr-1" /> Novo Evento
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Input 
          placeholder="Buscar eventos por título ou tipo..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-md bg-dark-surface border-border/40 focus:border-gold"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      ) : filteredEvents?.length === 0 ? (
        <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center text-center border-border/30">
          <p className="text-muted-foreground text-lg mb-2">Nenhum evento encontrado.</p>
          <p className="text-sm text-muted-foreground/60">Comece criando um novo evento para popular esta lista.</p>
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
