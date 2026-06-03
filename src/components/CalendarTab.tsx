import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

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
      navigate(`/contas-pagar?edit=${entry.entityId}`);
    } else if (entry.source === "recebimento" && entry.paymentId) {
      navigate(`/recebimentos?edit=${entry.paymentId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-10 w-10 rounded-xl hover:bg-gold/10"
          >
            <ChevronLeft size={18} />
          </Button>
          <h2 className="text-2xl font-display text-foreground tracking-tight min-w-[200px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-10 w-10 rounded-xl hover:bg-gold/10"
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-xl text-[10px] font-bold uppercase tracking-widest border-gold/20 hover:bg-gold/10"
          >
            mês atual
          </Button>
        </div>
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => setEditMode(!editMode)}
          className={cn(
            "rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
            editMode
              ? "bg-gold text-white hover:bg-gold/90 shadow-gold-sm"
              : "border-gold/20 hover:bg-gold/10"
          )}
        >
          <Pencil size={14} className="mr-2" />
          {editMode ? "Edição ativa" : "Habilitar edição"}
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-[24px] border border-border/30 premium-shadow overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/20 bg-gold/5">
          {weekDays.map((d) => (
            <div key={d} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-gold/80 border-r border-border/10 last:border-r-0">
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

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[130px] border-r border-b border-border/10 last:border-r-0 p-2.5 transition-colors relative",
                  !inMonth && "bg-muted/30",
                  inMonth && "bg-white hover:bg-gold/[0.02]",
                  today && "bg-gold/[0.04]",
                )}
              >
                {/* Day number */}
                <div className="flex items-start justify-between mb-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
                      today && "bg-gold text-white shadow-gold-sm",
                      !today && inMonth && "text-foreground/80",
                      !inMonth && "text-muted-foreground/30",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* SALDO */}
                {dayItems.length > 0 && (
                  <div className={cn(
                    "text-[10px] font-black mb-2 pb-1.5 border-b border-dashed",
                    balance > 0 && "text-blue-600 border-blue-200",
                    balance < 0 && "text-red-500 border-red-200",
                    balance === 0 && "text-muted-foreground/50 border-border/20",
                  )}>
                    <span className="uppercase tracking-wider opacity-60">Saldo: </span>
                    <span className="tabular-nums">{currencyFmt(balance)}</span>
                  </div>
                )}

                {/* Entries */}
                <div className="space-y-1">
                  {showEntradas.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleEntryClick(item)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-all",
                        editMode && "cursor-pointer hover:bg-blue-50 ring-1 ring-blue-200",
                        !editMode && "cursor-default",
                        item.status === "paid" && "opacity-50",
                      )}
                    >
                      <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center shrink-0">
                        <ArrowUpCircle size={10} className="text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 tabular-nums truncate">
                        {currencyFmt(item.amount)}
                      </span>
                    </button>
                  ))}
                  {showSaidas.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleEntryClick(item)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-all",
                        editMode && "cursor-pointer hover:bg-red-50 ring-1 ring-red-200",
                        !editMode && "cursor-default",
                        item.status === "paid" && "opacity-50",
                      )}
                    >
                      <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center shrink-0">
                        <ArrowDownCircle size={10} className="text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-red-500 tabular-nums truncate">
                        {currencyFmt(item.amount)}
                      </span>
                    </button>
                  ))}
                  {dayItems.length > 6 && (
                    <span className="text-[9px] font-bold text-gold px-1">
                      mais +{dayItems.length - 6}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 px-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
            <ArrowUpCircle size={10} className="text-white" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Entradas (Recebimentos)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center">
            <ArrowDownCircle size={10} className="text-white" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Saídas (Contas a Pagar)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-gold shadow-gold-sm" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Hoje</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Saldo</span>
          <span className="text-[10px] font-bold text-muted-foreground/40">= Entradas - Saídas</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarTab;
