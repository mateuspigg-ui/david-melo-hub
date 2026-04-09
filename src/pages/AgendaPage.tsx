import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isSameWeek, startOfWeek, addDays, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, Loader2, Plus, Pencil, CalendarDays } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ViewMode = 'ano' | 'mes' | 'semana' | 'dia';

const EVENT_TYPES = ['Casamento', 'Formatura', '15 Anos', 'Corporativo', 'Aniversario', 'Outro'];

const AgendaPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewMode>('mes');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  const [form, setForm] = useState({
    event_type: 'Casamento',
    client_id: '',
    event_date: '',
    event_time: '',
    title: '',
    location: '',
    budget_value: '',
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['agenda-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients:client_id(first_name,last_name)')
        .order('event_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['agenda-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, first_name, last_name').order('first_name');
      if (error) throw error;
      return data || [];
    },
  });

  const eventCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((evt: any) => {
      if (!evt.event_date) return;
      map.set(evt.event_date, (map.get(evt.event_date) || 0) + 1);
    });
    return map;
  }, [events]);

  const eventsForSelectedView = useMemo(() => {
    if (view === 'ano') {
      return events.filter((evt: any) => evt.event_date && isSameYear(parseISO(evt.event_date), selectedDate));
    }
    if (view === 'dia') {
      return events.filter((evt: any) => evt.event_date && isSameDay(parseISO(evt.event_date), selectedDate));
    }
    if (view === 'semana') {
      return events.filter((evt: any) => evt.event_date && isSameWeek(parseISO(evt.event_date), selectedDate, { weekStartsOn: 1 }));
    }
    return events.filter((evt: any) => evt.event_date && isSameMonth(parseISO(evt.event_date), selectedDate));
  }, [events, selectedDate, view]);

  const openNewEvent = (date: Date) => {
    setEditingEvent(null);
    setSelectedDate(date);
    setForm({
      event_type: 'Casamento',
      client_id: '',
      event_date: format(date, 'yyyy-MM-dd'),
      event_time: '',
      title: '',
      location: '',
      budget_value: '',
    });
    setDialogOpen(true);
  };

  const openEditEvent = (event: any) => {
    setEditingEvent(event);
    setForm({
      event_type: event.event_type || 'Casamento',
      client_id: event.client_id || '',
      event_date: event.event_date || '',
      event_time: event.event_time || '',
      title: event.title || '',
      location: event.location || '',
      budget_value: event.budget_value != null ? String(event.budget_value) : '',
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title || !form.event_date) throw new Error('Preencha titulo e data_do_evento.');
      const payload = {
        title: form.title,
        event_type: form.event_type,
        client_id: form.client_id || null,
        event_date: form.event_date,
        event_time: form.event_time || null,
        location: form.location || null,
        budget_value: form.budget_value === '' ? 0 : Number(form.budget_value),
      };

      if (editingEvent?.id) {
        const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Evento salvo com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['agenda-events'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, idx) => addDays(start, idx));
  }, [selectedDate]);

  const yearMonths = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, monthIndex) => {
        const monthDate = new Date(selectedDate.getFullYear(), monthIndex, 1);
        const monthEvents = events.filter((evt: any) => evt.event_date && isSameMonth(parseISO(evt.event_date), monthDate));
        return { monthDate, monthEvents };
      }),
    [events, selectedDate]
  );

  const formatCurrency = (value: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase flex items-center gap-3">
            <CalendarClock className="w-8 h-8 text-gold" /> Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Calendario operacional de eventos integrado ao sistema</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['ano', 'mes', 'semana', 'dia'] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant={view === mode ? 'default' : 'outline'}
              onClick={() => setView(mode)}
              className={cn(view === mode ? 'bg-gradient-gold text-white' : '')}
            >
              {mode.toUpperCase()}
            </Button>
          ))}
          <Button className="bg-gradient-gold text-white" onClick={() => openNewEvent(selectedDate)}>
            <Plus className="w-4 h-4 mr-2" /> Novo Evento
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border/40 premium-shadow p-4 md:p-6">
        {view === 'mes' && (
          <Calendar
            mode="single"
            selected={selectedDate}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            onDayClick={(day) => openNewEvent(day)}
            locale={ptBR}
            components={{
              DayContent: ({ date }) => {
                const key = format(date, 'yyyy-MM-dd');
                const count = eventCountByDate.get(key) || 0;
                return (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <span>{date.getDate()}</span>
                    {count > 0 && (
                      <span className="absolute -bottom-1 -right-1 text-[9px] rounded-full bg-gold text-white h-4 min-w-4 px-1 flex items-center justify-center font-bold">
                        {count}
                      </span>
                    )}
                  </div>
                );
              },
            }}
          />
        )}

        {view === 'ano' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-secondary/10 border border-border/30 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Visao anual</p>
                <p className="text-xl font-display text-foreground">{format(selectedDate, 'yyyy')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear() - 1, selectedDate.getMonth(), 1))}>
                  Ano anterior
                </Button>
                <Button variant="outline" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear() + 1, selectedDate.getMonth(), 1))}>
                  Proximo ano
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {yearMonths.map(({ monthDate, monthEvents }) => (
                <button
                  key={monthDate.toISOString()}
                  onClick={() => {
                    setSelectedDate(monthDate);
                    setCalendarMonth(monthDate);
                    setView('mes');
                  }}
                  className="rounded-xl border border-border/40 bg-white p-4 text-left hover:border-gold/50 hover:bg-secondary/10 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-wider text-foreground">{format(monthDate, 'MMMM', { locale: ptBR })}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {monthEvents.length} evento(s)
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    {monthEvents.slice(0, 3).map((evt: any) => (
                      <div key={evt.id} className="text-xs text-muted-foreground truncate">
                        {evt.event_date ? format(parseISO(evt.event_date), 'dd/MM') : '--'} • {evt.title}
                      </div>
                    ))}
                    {monthEvents.length > 3 && (
                      <p className="text-[11px] text-gold font-bold">+{monthEvents.length - 3} adicionais</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'semana' && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const dailyEvents = events.filter((evt: any) => evt.event_date && isSameDay(parseISO(evt.event_date), day));
              return (
                <div key={day.toISOString()} className="rounded-xl border border-border/40 bg-secondary/10 min-h-[220px] p-3">
                  <button className="w-full text-left" onClick={() => openNewEvent(day)}>
                    <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</p>
                    <p className="font-display text-xl text-foreground">{format(day, 'dd')}</p>
                  </button>
                  <div className="space-y-2 mt-3">
                    {dailyEvents.map((evt: any) => (
                      <button key={evt.id} onClick={() => openEditEvent(evt)} className="w-full text-left p-2 rounded-lg bg-white border border-border/30 hover:border-gold/50 transition-colors">
                        <p className="text-xs font-black text-foreground truncate">{evt.title}</p>
                        <p className="text-[10px] text-muted-foreground">{evt.event_time || 'Sem horario'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'dia' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-secondary/10 border border-border/30 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Visao diaria</p>
                <p className="text-xl font-display text-foreground">{format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
              </div>
              <Button onClick={() => openNewEvent(selectedDate)} className="bg-gradient-gold text-white">
                <Plus className="w-4 h-4 mr-2" /> Adicionar Evento
              </Button>
            </div>
            <div className="space-y-3">
              {eventsForSelectedView.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-muted-foreground">
                  Nenhum evento para este dia.
                </div>
              ) : (
                eventsForSelectedView.map((evt: any) => (
                  <button key={evt.id} onClick={() => openEditEvent(evt)} className="w-full rounded-xl border border-border/40 bg-white p-4 text-left hover:border-gold/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-foreground">{evt.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{evt.event_type || 'Sem tipo'} • {evt.event_time || 'Sem horario'}</p>
                      </div>
                      <Pencil className="w-4 h-4 text-gold" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-border/40 premium-shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display uppercase tracking-tight text-foreground">Eventos do Período</h2>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {eventsForSelectedView.length} evento(s)
          </span>
        </div>

        {isLoading ? (
          <div className="py-14 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
          </div>
        ) : eventsForSelectedView.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-muted-foreground">
            Nenhum evento encontrado para esta visualizacao.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {eventsForSelectedView.map((evt: any) => (
              <button
                key={evt.id}
                onClick={() => openEditEvent(evt)}
                className="text-left rounded-xl border border-border/40 bg-secondary/10 hover:bg-secondary/20 hover:border-gold/50 transition-all p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-black text-foreground text-sm truncate">{evt.title}</p>
                  <span className="text-[10px] uppercase tracking-wider font-black text-muted-foreground whitespace-nowrap">
                    {evt.event_time || 'Sem horario'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{evt.event_type || 'Sem tipo'} • {evt.location || 'Local nao informado'}</p>
                <p className="text-[11px] text-gold font-bold mt-2">{formatCurrency(evt.budget_value)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cliente: {evt.clients ? `${evt.clients.first_name || ''} ${evt.clients.last_name || ''}`.trim() || 'Nao vinculado' : 'Nao vinculado'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saveMutation.isPending && setDialogOpen(open)}>
        <DialogContent className="max-w-2xl bg-white border-border/40 text-foreground rounded-2xl p-0 overflow-hidden">
          <div className="p-6 bg-gradient-gold text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display tracking-tight">{editingEvent ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
              <p className="text-[10px] uppercase tracking-widest font-black opacity-80">Agenda Integrada</p>
            </DialogHeader>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>tipo_de_evento</Label>
              <select
                value={form.event_type}
                onChange={(e) => setForm((prev) => ({ ...prev, event_type: e.target.value }))}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/20 px-3 text-sm"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>cliente</Label>
              <select
                value={form.client_id}
                onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/20 px-3 text-sm"
              >
                <option value="">Selecione</option>
                {clients.map((client: any) => (
                  <option key={client.id} value={client.id}>{client.first_name} {client.last_name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>data_do_evento</Label>
              <Input type="date" value={form.event_date} onChange={(e) => setForm((prev) => ({ ...prev, event_date: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>hora_do_evento</Label>
              <Input type="time" value={form.event_time} onChange={(e) => setForm((prev) => ({ ...prev, event_time: e.target.value }))} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>titulo</Label>
              <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Ex: Cerimonia no campo" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>local</Label>
              <Input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Local do evento" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>valor_do_orcamento</Label>
              <Input type="number" value={form.budget_value} onChange={(e) => setForm((prev) => ({ ...prev, budget_value: e.target.value }))} placeholder="0,00" />
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border/20">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} className="bg-gradient-gold text-white" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarDays className="w-4 h-4 mr-2" />}
              {editingEvent ? 'Atualizar Evento' : 'Salvar Evento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgendaPage;
