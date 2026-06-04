import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Company = {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  phone: string | null;
  ie: string | null;
  created_at?: string;
};

type CompanyFiscalSettings = {
  id: string;
  company_id: string;
  provider: string;
  environment: "homologation" | "production";
  municipal_registration: string | null;
  tax_regime: string | null;
  cnae: string | null;
  service_code_default: string | null;
  iss_rate: number;
  rps_series: string | null;
  next_rps_number: number | null;
  provider_account_ref: string | null;
};

const cleanDigits = (value: string) => value.replace(/\D/g, "").slice(0, 14);

const maskDocument = (value: string) => {
  const digits = cleanDigits(value);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
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
    return "Já existe um cadastro com esse documento. Revise CPF/CNPJ e tente novamente.";
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
  const [form, setForm] = useState({ legal_name: "", trade_name: "", cnpj: "", address_street: "", address_number: "", address_complement: "", address_neighborhood: "", address_city: "", address_state: "", address_zip: "", phone: "", ie: "" });
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [fiscalForm, setFiscalForm] = useState({
    provider: "focus_nfe",
    environment: "homologation",
    municipal_registration: "",
    tax_regime: "",
    cnae: "",
    service_code_default: "",
    iss_rate: "0",
    rps_series: "",
    next_rps_number: "",
    provider_account_ref: "",
  });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, legal_name, trade_name, cnpj, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, phone, ie, created_at")
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

  const { data: fiscalSettings = [] } = useQuery({
    queryKey: ["company-fiscal-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_fiscal_settings")
        .select("*");
      if (error) throw error;
      return (data || []) as CompanyFiscalSettings[];
    },
  });

  const selectedFiscalSettings = useMemo(
    () => fiscalSettings.find((item) => item.company_id === selectedCompanyId) || null,
    [fiscalSettings, selectedCompanyId]
  );

  const resetForm = () => {
    setForm({ legal_name: "", trade_name: "", cnpj: "", address_street: "", address_number: "", address_complement: "", address_neighborhood: "", address_city: "", address_state: "", address_zip: "", phone: "", ie: "" });
    setEditingCompany(null);
  };

  const fillFiscalForm = (settings: CompanyFiscalSettings | null) => {
    if (!settings) {
      setFiscalForm({
        provider: "focus_nfe",
        environment: "homologation",
        municipal_registration: "",
        tax_regime: "",
        cnae: "",
        service_code_default: "",
        iss_rate: "0",
        rps_series: "",
        next_rps_number: "",
        provider_account_ref: "",
      });
      return;
    }

    setFiscalForm({
      provider: settings.provider || "focus_nfe",
      environment: settings.environment || "homologation",
      municipal_registration: settings.municipal_registration || "",
      tax_regime: settings.tax_regime || "",
      cnae: settings.cnae || "",
      service_code_default: settings.service_code_default || "",
      iss_rate: String(settings.iss_rate ?? 0),
      rps_series: settings.rps_series || "",
      next_rps_number: settings.next_rps_number ? String(settings.next_rps_number) : "",
      provider_account_ref: settings.provider_account_ref || "",
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        legal_name: form.legal_name.trim() || null,
        trade_name: form.trade_name.trim() || null,
        cnpj: cleanDigits(form.cnpj) || null,
        address_street: form.address_street.trim() || null,
        address_number: form.address_number.trim() || null,
        address_complement: form.address_complement.trim() || null,
        address_neighborhood: form.address_neighborhood.trim() || null,
        address_city: form.address_city.trim() || null,
        address_state: form.address_state.trim() || null,
        address_zip: form.address_zip.trim() || null,
        phone: form.phone.trim() || null,
        ie: form.ie.trim() || null,
      };

      if (!payload.legal_name && !payload.trade_name) {
        throw new Error("Informe ao menos Razão Social ou Nome Fantasia.");
      }

      if (payload.cnpj && payload.cnpj.length !== 11 && payload.cnpj.length !== 14) {
        throw new Error("Documento inválido. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
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

  const saveFiscalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa para salvar as configurações fiscais.");

      const issRate = Number(fiscalForm.iss_rate.replace(",", "."));
      if (!Number.isFinite(issRate) || issRate < 0 || issRate > 100) {
        throw new Error("Alíquota ISS inválida. Informe um valor entre 0 e 100.");
      }

      const nextRps = fiscalForm.next_rps_number.trim();
      const parsedNextRps = nextRps ? Number(nextRps) : null;
      if (parsedNextRps != null && (!Number.isInteger(parsedNextRps) || parsedNextRps < 1)) {
        throw new Error("Próximo RPS inválido. Informe um número inteiro maior que zero.");
      }

      const payload = {
        company_id: selectedCompanyId,
        provider: fiscalForm.provider.trim() || "focus_nfe",
        environment: fiscalForm.environment,
        municipal_registration: fiscalForm.municipal_registration.trim() || null,
        tax_regime: fiscalForm.tax_regime.trim() || null,
        cnae: fiscalForm.cnae.trim() || null,
        service_code_default: fiscalForm.service_code_default.trim() || null,
        iss_rate: issRate,
        rps_series: fiscalForm.rps_series.trim() || null,
        next_rps_number: parsedNextRps,
        provider_account_ref: fiscalForm.provider_account_ref.trim() || null,
      };

      if (selectedFiscalSettings?.id) {
        const { error } = await (supabase as any)
          .from("company_fiscal_settings")
          .update(payload)
          .eq("id", selectedFiscalSettings.id);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase as any).from("company_fiscal_settings").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-fiscal-settings"] });
      toast({ title: "Configuração fiscal salva" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar fiscal", description: String(error?.message || "Tente novamente."), variant: "destructive" });
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
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Cadastro de CPF/CNPJ</p>
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
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">CPF / CNPJ</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-secondary/5 transition-colors">
                    <td className="py-4 px-6 font-bold">{company.trade_name || "-"}</td>
                    <td className="py-4 px-6">{company.legal_name || "-"}</td>
                    <td className="py-4 px-6">{maskDocument(company.cnpj || "") || "-"}</td>
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
                              cnpj: maskDocument(company.cnpj || ""),
                              address_street: company.address_street || "",
                              address_number: company.address_number || "",
                              address_complement: company.address_complement || "",
                              address_neighborhood: company.address_neighborhood || "",
                              address_city: company.address_city || "",
                              address_state: company.address_state || "",
                              address_zip: company.address_zip || "",
                              phone: company.phone || "",
                              ie: company.ie || "",
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

      <div className="bg-white premium-shadow rounded-2xl border border-border/40 p-6 md:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-display tracking-tight uppercase">Configuração Fiscal (NFSe)</h2>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Configure os parâmetros de emissão por empresa.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Empresa *</Label>
            <Select
              value={selectedCompanyId}
              onValueChange={(value) => {
                setSelectedCompanyId(value);
                const next = fiscalSettings.find((item) => item.company_id === value) || null;
                fillFiscalForm(next);
              }}
            >
              <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.trade_name || company.legal_name || "Empresa"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Provedor</Label>
            <Input value={fiscalForm.provider} onChange={(e) => setFiscalForm({ ...fiscalForm, provider: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Ambiente</Label>
            <Select value={fiscalForm.environment} onValueChange={(v) => setFiscalForm({ ...fiscalForm, environment: v as "homologation" | "production" })}>
              <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homologation">Homologação</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Inscrição Municipal</Label>
            <Input value={fiscalForm.municipal_registration} onChange={(e) => setFiscalForm({ ...fiscalForm, municipal_registration: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Regime Tributário</Label>
            <Input value={fiscalForm.tax_regime} onChange={(e) => setFiscalForm({ ...fiscalForm, tax_regime: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">CNAE</Label>
            <Input value={fiscalForm.cnae} onChange={(e) => setFiscalForm({ ...fiscalForm, cnae: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Código Serviço Padrão</Label>
            <Input value={fiscalForm.service_code_default} onChange={(e) => setFiscalForm({ ...fiscalForm, service_code_default: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Alíquota ISS (%)</Label>
            <Input value={fiscalForm.iss_rate} onChange={(e) => setFiscalForm({ ...fiscalForm, iss_rate: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Série RPS</Label>
            <Input value={fiscalForm.rps_series} onChange={(e) => setFiscalForm({ ...fiscalForm, rps_series: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Próximo Número RPS</Label>
            <Input value={fiscalForm.next_rps_number} onChange={(e) => setFiscalForm({ ...fiscalForm, next_rps_number: e.target.value.replace(/\D/g, "") })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Referência da Conta no Provedor</Label>
            <Input value={fiscalForm.provider_account_ref} onChange={(e) => setFiscalForm({ ...fiscalForm, provider_account_ref: e.target.value })} className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-end border-t border-border/20 pt-4">
          <Button
            onClick={() => saveFiscalMutation.mutate()}
            disabled={saveFiscalMutation.isPending || !selectedCompanyId}
            className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest"
          >
            {saveFiscalMutation.isPending ? "Salvando..." : selectedFiscalSettings ? "Atualizar Configuração Fiscal" : "Salvar Configuração Fiscal"}
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1">
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
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">CPF / CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: maskDocument(e.target.value) })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg"
              />
            </div>

            <div className="pt-2 border-t border-border/20 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Endereço</p>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Logradouro</Label>
                  <Input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} placeholder="Rua, Avenida..." className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Nº</Label>
                  <Input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} placeholder="Nº" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Complemento</Label>
                <Input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} placeholder="Sala, Andar..." className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Bairro</Label>
                <Input value={form.address_neighborhood} onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value })} placeholder="Bairro" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Cidade</Label>
                  <Input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} placeholder="Cidade" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">UF</Label>
                  <Input value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg uppercase" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">CEP</Label>
                  <Input value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} placeholder="00000-000" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Inscrição Estadual</Label>
                <Input value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value })} placeholder="IE" className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg" />
              </div>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
