import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import EditContaPagarDialog from "@/components/EditContaPagarDialog";
import EditRecebimentoDialog from "@/components/EditRecebimentoDialog";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameMonth, isSameDay, isToday,
  eachDayOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Pencil, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type CalendarEntry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  status: "paid" | "pending";
  source: "recebimento" | "conta_pagar";
  entityId: string;
  paymentId?: string;
  entityExtra?: any;
};

const PAID_STATUS = ["paid", "pago"] as const;
const isPaid = (s: string | null | undefined, pa: string | null | undefined) =>
  PAID_STATUS.includes((s || "").toLowerCase() as any) || !!pa;

const weekDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const CalendarTab = ({ selectedCompany }: { selectedCompany: string }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editMode, setEditMode] = useState(false);
  const [editPagarOpen, setEditPagarOpen] = useState(false);
  const [editPagarId, setEditPagarId] = useState("");
  const [editRecOpen, setEditRecOpen] = useState(false);
  const [editRecPaymentId, setEditRecPaymentId] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const { data: payables = [] } = useQuery({
    queryKey: ["calendar-payables", monthStartStr, monthEndStr, selectedCompany],
    queryFn: async () => {
      let q = (supabase as any)
        .from("accounts_payable")
        .select("id, description, amount, due_date, payment_status, paid_at, company_id, suppliers(company_name)")
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .order("due_date");
      if (selectedCompany !== "all") q = q.eq("company_id", selectedCompany);
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as any[];
    },
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ["calendar-receivables", monthStartStr, monthEndStr, selectedCompany],
    queryFn: async () => {
      let q = (supabase as any)
        .from("payment_installments")
        .select("id, payment_id, installment_number, due_date, amount, status, paid_at, payments(client_id, company_id, clients(first_name, last_name), events(title))")
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .order("due_date");
      const { data, error } = await q;
      if (error) return [];
      let results = (data || []) as any[];
      if (selectedCompany !== "all") {
        results = results.filter((r: any) => r.payments?.company_id === selectedCompany);
      }
      return results;
    },
  });

  const entries: CalendarEntry[] = useMemo(() => {
    const items: CalendarEntry[] = [];

    for (const p of payables) {
      items.push({
        id: p.id,
        date: p.due_date,
        type: "saida",
        description: p.description || "Despesa",
        amount: Number(p.amount || 0),
        status: isPaid(p.payment_status, p.paid_at) ? "paid" : "pending",
        source: "conta_pagar",
        entityId: p.id,
        entityExtra: p,
      });
    }

    for (const r of receivables) {
      const clientName = r.payments?.clients
        ? `${r.payments.clients.first_name || ""} ${r.payments.clients.last_name || ""}`.trim()
        : "";
      const eventName = r.payments?.events?.title || "";
      const desc = [clientName, eventName].filter(Boolean).join(" - ") || `Parcela ${r.installment_number}`;

      items.push({
        id: r.id,
        date: r.due_date,
        type: "entrada",
        description: desc,
        amount: Number(r.amount || 0),
        status: isPaid(r.status, r.paid_at) ? "paid" : "pending",
        source: "recebimento",
        entityId: r.id,
        paymentId: r.payment_id,
        entityExtra: r,
      });
    }

    return items;
  }, [payables, receivables]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);

  const dayBalance = (date: string) => {
    const items = entriesByDate[date] || [];
    return items.reduce((sum, i) => sum + (i.type === "entrada" ? i.amount : -i.amount), 0);
  };

  const handleEntryClick = (entry: CalendarEntry) => {
    if (!editMode) return;

    if (entry.source === "conta_pagar") {
      setEditPagarId(entry.entityId);
      setEditPagarOpen(true);
    } else if (entry.source === "recebimento" && entry.paymentId) {
      setEditRecPaymentId(entry.paymentId);
      setEditRecOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-9 w-9 rounded-xl hover:bg-gold/10 text-foreground/60"
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-xl font-display text-foreground tracking-tight min-w-[180px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-9 w-9 rounded-xl hover:bg-gold/10 text-foreground/60"
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-lg text-[9px] font-bold uppercase tracking-widest border-border/30 hover:bg-gold/5 hover:border-gold/30 text-muted-foreground h-8"
          >
            mes atual
          </Button>
        </div>
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => setEditMode(!editMode)}
          className={cn(
            "rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all h-8",
            editMode
              ? "bg-gold text-white hover:bg-gold/90 shadow-[0_2px_8px_rgba(197,160,89,0.3)]"
              : "border-border/30 hover:bg-gold/5 hover:border-gold/30 text-muted-foreground"
          )}
        >
          <Pencil size={12} className="mr-1.5" />
          {editMode ? "Edicao ativa" : "Habilitar edicao"}
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-[28px] border border-border/20 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-gradient-to-r from-gold via-gold-light to-gold">
          {weekDays.map((d) => (
            <div key={d} className="py-3.5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/90 border-r border-white/10 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {calDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const dayItems = entriesByDate[dateStr] || [];
            const balance = dayBalance(dateStr);
            const showEntradas = dayItems.filter((i) => i.type === "entrada");
            const showSaidas = dayItems.filter((i) => i.type === "saida");
            const totalItems = showEntradas.length + showSaidas.length;
            const visibleItems = 4;

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[140px] border-r border-b border-border/[0.06] last:border-r-0 p-3 transition-all duration-200 relative group",
                  !inMonth && "bg-stone-50/80",
                  inMonth && "bg-white hover:bg-gold/[0.015]",
                  today && "bg-gradient-to-br from-gold/[0.04] to-gold/[0.08] ring-1 ring-inset ring-gold/10",
                )}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all",
                      today && "bg-gold text-white shadow-[0_2px_8px_rgba(197,160,89,0.4)]",
                      !today && inMonth && "text-foreground/70 group-hover:text-foreground",
                      !inMonth && "text-muted-foreground/25",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayItems.length > 0 && (
                    <span className={cn(
                      "text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md",
                      balance > 0 && "text-emerald-600 bg-emerald-50",
                      balance < 0 && "text-red-500 bg-red-50",
                      balance === 0 && "text-muted-foreground/40 bg-muted/30",
                    )}>
                      {currencyFmt(balance)}
                    </span>
                  )}
                </div>

                {/* Entries */}
                {dayItems.length > 0 && (
                  <div className="space-y-0.5">
                    {showEntradas.slice(0, 2).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleEntryClick(item)}
                        className={cn(
                          "w-full flex items-center gap-1 px-1.5 py-[3px] rounded-md text-left transition-all duration-150",
                          editMode && "cursor-pointer hover:bg-blue-50/80 hover:shadow-sm",
                          !editMode && "cursor-default",
                          item.status === "paid" && "opacity-40",
                        )}
                      >
                        <div className="w-[5px] h-[5px] rounded-full bg-blue-500 shrink-0" />
                        <span className="text-[9px] font-semibold text-blue-600/80 tabular-nums truncate">
                          {currencyFmt(item.amount)}
                        </span>
                      </button>
                    ))}
                    {showSaidas.slice(0, 2).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleEntryClick(item)}
                        className={cn(
                          "w-full flex items-center gap-1 px-1.5 py-[3px] rounded-md text-left transition-all duration-150",
                          editMode && "cursor-pointer hover:bg-red-50/80 hover:shadow-sm",
                          !editMode && "cursor-default",
                          item.status === "paid" && "opacity-40",
                        )}
                      >
                        <div className="w-[5px] h-[5px] rounded-full bg-red-400 shrink-0" />
                        <span className="text-[9px] font-semibold text-red-400/80 tabular-nums truncate">
                          {currencyFmt(item.amount)}
                        </span>
                      </button>
                    ))}
                    {totalItems > visibleItems && (
                      <span className="text-[8px] font-bold text-gold/70 px-1.5 block">
                        +{totalItems - visibleItems} mais
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Entradas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Saidas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gold flex items-center justify-center">
            <span className="text-[7px] font-bold text-white">3</span>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Hoje</span>
        </div>
      </div>

      {editPagarId && (
        <EditContaPagarDialog open={editPagarOpen} onOpenChange={setEditPagarOpen} itemId={editPagarId} />
      )}
      {editRecPaymentId && (
        <EditRecebimentoDialog open={editRecOpen} onOpenChange={setEditRecOpen} paymentId={editRecPaymentId} />
      )}
    </div>
  );
};

export default CalendarTab;
