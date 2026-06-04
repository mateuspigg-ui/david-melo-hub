import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import logoImg from "@/assets/logo.png";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type ReceiptData = {
  supplierName: string;
  supplierCpfCnpj?: string;
  supplierAddress?: string;
  description: string;
  amount: number;
  discount?: number;
  interest?: number;
  fine?: number;
  paidAmount: number;
  paymentDate: string;
  paymentMethod: string;
  bankAccount?: string;
  documentNumber?: string;
  companyId?: string;
};

type CompanyInfo = {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
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
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
};

const formatCompanyAddress = (c: CompanyInfo): string => {
  const parts: string[] = [];
  if (c.address_street) parts.push(c.address_street);
  if (c.address_number) parts.push(`Nº ${c.address_number}`);
  if (c.address_complement) parts.push(c.address_complement);
  if (c.address_neighborhood) parts.push(c.address_neighborhood);
  if (c.address_city) parts.push(c.address_city);
  if (c.address_state) parts.push(c.address_state);
  if (c.address_zip) parts.push(`CEP: ${c.address_zip}`);
  return parts.join(", ");
};

const getReceiptHtml = (data: ReceiptData, company: CompanyInfo): string => {
  const companyName = company.trade_name || company.legal_name || "David Melo Decoracao & Eventos";
  const companyCnpj = company.cnpj || "";
  const companyAddress = formatCompanyAddress(company);
  const companyIe = company.ie || "";
  const companyPhone = company.phone || "";

  const formattedDate = (() => {
    try {
      const d = new Date(data.paymentDate + "T12:00:00");
      return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return data.paymentDate;
    }
  })();

  const currentDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const city = company.address_city || "Salvador";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo de Pagamento</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #fff; color: #1a1a1a; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 25mm; }

    .company-header { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #1a1a1a; }
    .company-logo { width: 60px; height: 60px; object-fit: contain; }
    .company-details { flex: 1; }
    .company-details .name { font-size: 14px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .company-details .info { font-size: 10px; color: #444; line-height: 1.8; }
    .company-details .info strong { color: #1a1a1a; }

    .receipt-title { font-size: 24px; font-weight: 800; text-align: center; margin: 30px 0; letter-spacing: 4px; text-transform: uppercase; }

    .receipt-body { font-size: 12px; line-height: 2.2; text-align: justify; margin: 25px 0 40px; color: #333; }
    .receipt-body strong { color: #000; }

    .location-date { font-size: 12px; text-align: right; margin: 20px 0; color: #333; }

    .signature-section { margin-top: 100px; text-align: center; }
    .signature-line { width: 300px; margin: 0 auto; border-top: 1px solid #333; padding-top: 8px; }
    .signature-name { font-size: 11px; font-weight: 700; color: #1a1a1a; text-transform: uppercase; }
    .signature-doc { font-size: 10px; color: #555; margin-top: 2px; }

    .amount-highlight { font-weight: 700; }

    @media print {
      body { background: #fff; }
      .page { margin: 0; padding: 15mm 20mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="company-header">
      <img src="${logoImg}" alt="${companyName}" class="company-logo" />
      <div class="company-details">
        <div class="name">${companyName}</div>
        <div class="info">
          ${companyCnpj ? `<strong>CNPJ:</strong> ${companyCnpj}` : ""}
          ${companyIe ? `<br><strong>IE:</strong> ${companyIe}` : ""}
          ${companyAddress ? `<br><strong>Endereço:</strong> ${companyAddress}` : ""}
          ${companyPhone ? `<br><strong>Telefone:</strong> ${companyPhone}` : ""}
        </div>
      </div>
    </div>

    <div class="receipt-title">RECIBO</div>

    <div class="receipt-body">
      Recebemos de <strong>${companyName}</strong>${companyCnpj ? `, inscrito sob o CNPJ n&ordm; <strong>${companyCnpj}</strong>` : ""}, a import&acirc;ncia de
      <strong class="amount-highlight"> ${currencyFmt(data.paidAmount)}</strong>
      ${data.amount !== data.paidAmount ? ` (valor original: ${currencyFmt(data.amount)}${data.discount ? `, desconto: ${currencyFmt(data.discount)}` : ""}${data.interest ? `, juros: ${currencyFmt(data.interest)}` : ""}${data.fine ? `, multa: ${currencyFmt(data.fine)}` : ""})` : ""},
      referente a <strong>${data.description}</strong>,
      em <strong>${formattedDate}</strong>.
    </div>

    <div class="location-date">
      ${city}, ${currentDate}.
    </div>

    <div class="signature-section">
      <div class="signature-line">
        <div class="signature-name">${companyName}</div>
        <div class="signature-doc">${companyCnpj ? `CNPJ: ${companyCnpj}` : ""}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

export const PaymentReceiptDialog = ({ open, onOpenChange, data }: Props) => {
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      supabase.from("companies" as any)
        .select("id, trade_name, legal_name, cnpj, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, phone, ie")
        .order("trade_name")
        .then(({ data: comps }) => {
          setCompanies((comps as any) || []);
          if (data?.companyId) {
            setSelectedCompanyId(data.companyId);
          } else if (comps && comps.length > 0) {
            setSelectedCompanyId(comps[0].id);
          }
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [open, data?.companyId]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  if (!data) return null;

  const handlePrint = () => {
    if (!selectedCompany) return;
    const html = getReceiptHtml(data, selectedCompany);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={logoImg} alt="David Melo" className="w-8 h-8 object-contain" />
            Recibo de Pagamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Empresa Emissora do Recibo</label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId} disabled={loading}>
              <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name || c.legal_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-white border border-border/30 rounded-xl p-5 space-y-3 text-xs">
            {selectedCompany && (
              <div className="flex items-start gap-3 border-b border-border/20 pb-3">
                <img src={logoImg} alt="Logo" className="w-10 h-10 object-contain" />
                <div>
                  <p className="font-bold uppercase tracking-wider">{selectedCompany.trade_name || selectedCompany.legal_name || "—"}</p>
                  {selectedCompany.cnpj && <p className="text-muted-foreground">CNPJ: {selectedCompany.cnpj}</p>}
                  {selectedCompany.ie && <p className="text-muted-foreground">IE: {selectedCompany.ie}</p>}
                  {formatCompanyAddress(selectedCompany) && <p className="text-muted-foreground">{formatCompanyAddress(selectedCompany)}</p>}
                  {selectedCompany.phone && <p className="text-muted-foreground">Tel: {selectedCompany.phone}</p>}
                </div>
              </div>
            )}

            <p className="text-center font-black text-sm uppercase tracking-[0.3em] my-4">Recibo</p>

            <p className="leading-relaxed text-muted-foreground">
              Recebemos de <span className="font-bold text-foreground">{selectedCompany?.trade_name || selectedCompany?.legal_name || "—"}</span>
              {selectedCompany?.cnpj && <>, inscrito sob o CNPJ n&ordm; <span className="font-bold text-foreground">{selectedCompany.cnpj}</span></>}
              {" "}a importancia de{" "}
              <span className="font-bold text-foreground">{currencyFmt(data.paidAmount)}</span>,
              referente a <span className="font-bold text-foreground">{data.description}</span>,
              em <span className="font-bold text-foreground">{data.paymentDate}</span>.
            </p>

            <p className="text-right text-muted-foreground mt-6">
              {selectedCompany?.address_city || "Salvador"} ({selectedCompany?.address_state || "BA"}), {format(new Date(), "dd/MM/yyyy")}.
            </p>

            <div className="flex justify-center pt-10">
              <div className="text-center w-72">
                <div className="border-t border-foreground/40 mb-2" />
                <p className="text-[10px] font-bold uppercase">{selectedCompany?.trade_name || selectedCompany?.legal_name || "DAVID MELO"}</p>
                {selectedCompany?.cnpj && <p className="text-[9px] text-muted-foreground">CNPJ: {selectedCompany.cnpj}</p>}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="font-bold uppercase text-[10px] tracking-widest">
            <X size={14} className="mr-2" /> Fechar
          </Button>
          <Button onClick={handlePrint} disabled={!selectedCompany} className="bg-gradient-gold hover:opacity-90 text-white font-bold">
            <Printer size={14} className="mr-2" /> Salvar / Imprimir PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
