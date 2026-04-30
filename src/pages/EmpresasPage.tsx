import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Company = {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  created_at?: string;
};

const cleanDigits = (value: string) => value.replace(/\D/g, "").slice(0, 14);

const maskCnpj = (value: string) => {
  const digits = cleanDigits(value);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const getFriendlyCompanyError = (error: any) => {
  const message = String(error?.message || "");
  if (/could not find the table|schema cache/i.test(message)) {
    return "Tabela de empresas não encontrada no banco. Verifique as migrations do Supabase.";
  }
  if (/duplicate key|already exists|unique/i.test(message)) {
    return "Já existe uma empresa com esses dados. Revise o CNPJ e tente novamente.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Seu usuário não tem permissão para gerenciar empresas.";
  }
  return message || "Não foi possível salvar a empresa.";
};

export default function EmpresasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [form, setForm] = useState({ legal_name: "", trade_name: "", cnpj: "" });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, legal_name, trade_name, cnpj, created_at")
        .order("trade_name", { ascending: true });
      if (error) throw error;
      return (data || []) as Company[];
    },
  });

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) => {
      const haystack = `${company.trade_name || ""} ${company.legal_name || ""} ${company.cnpj || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [companies, search]);

  const resetForm = () => {
    setForm({ legal_name: "", trade_name: "", cnpj: "" });
    setEditingCompany(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        legal_name: form.legal_name.trim() || null,
        trade_name: form.trade_name.trim() || null,
        cnpj: cleanDigits(form.cnpj) || null,
      };

      if (!payload.legal_name && !payload.trade_name) {
        throw new Error("Informe ao menos Razão Social ou Nome Fantasia.");
      }

      if (editingCompany) {
        const { error } = await (supabase as any).from("companies").update(payload).eq("id", editingCompany.id);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase as any).from("companies").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-select"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingCompany ? "Empresa atualizada" : "Empresa cadastrada com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: getFriendlyCompanyError(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-select"] });
      toast({ title: "Empresa excluída" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir", description: getFriendlyCompanyError(error), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Empresas</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Cadastro de CNPJs</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-12 px-8 rounded-xl shadow-gold uppercase text-[11px] tracking-widest"
        >
          <Plus className="w-4 h-4 mr-2" /> Nova Empresa
        </Button>
      </div>

      <div className="relative flex-1 max-w-xl px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-11 bg-white border-border/30 focus:border-gold h-11 rounded-xl premium-shadow"
        />
      </div>

      <div className="bg-white premium-shadow rounded-2xl border border-border/40 overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-muted-foreground font-bold">Carregando empresas...</div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Building2 className="w-12 h-12 mx-auto text-gold/30" />
            <p className="font-bold text-lg">Nenhuma empresa encontrada</p>
            <p className="text-sm text-muted-foreground">Cadastre o primeiro CNPJ para habilitar os filtros financeiros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/10 border-b border-border/20">
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Nome Fantasia</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Razão Social</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">CNPJ</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-secondary/5 transition-colors">
                    <td className="py-4 px-6 font-bold">{company.trade_name || "-"}</td>
                    <td className="py-4 px-6">{company.legal_name || "-"}</td>
                    <td className="py-4 px-6">{maskCnpj(company.cnpj || "") || "-"}</td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCompany(company);
                            setForm({
                              legal_name: company.legal_name || "",
                              trade_name: company.trade_name || "",
                              cnpj: maskCnpj(company.cnpj || ""),
                            });
                            setDialogOpen(true);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-gold hover:bg-gold/10"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm("Excluir esta empresa?")) deleteMutation.mutate(company.id);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Nome Fantasia</Label>
              <Input
                value={form.trade_name}
                onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                placeholder="Ex: David Melo Produções"
                className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Razão Social</Label>
              <Input
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                placeholder="Ex: David Melo Produções LTDA"
                className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest">
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest"
            >
              {saveMutation.isPending ? "Salvando..." : editingCompany ? "Salvar alterações" : "Cadastrar empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
