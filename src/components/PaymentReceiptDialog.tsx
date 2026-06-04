import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";
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
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao: "Cartao de Credito",
  dinheiro: "Dinheiro",
  transferencia: "Transferencia Bancaria",
};

const getReceiptHtml = (data: ReceiptData, company: CompanyInfo | null): string => {
  const companyName = company?.trade_name || company?.legal_name || "David Melo Decoracao & Eventos";
  const companyCnpj = company?.cnpj || "";
  const formattedDate = (() => {
    try {
      const d = new Date(data.paymentDate + "T12:00:00");
      return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return data.paymentDate;
    }
  })();

  const currentDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const city = "Salvador";

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

    /* Header com dados da empresa */
    .company-header { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 1px solid #ddd; }
    .company-logo { width: 60px; height: 60px; object-fit: contain; }
    .company-details { flex: 1; }
    .company-details .name { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .company-details .info { font-size: 10px; color: #444; line-height: 1.6; }
    .company-details .info strong { color: #1a1a1a; }

    /* Titulo RECIBO */
    .receipt-title { font-size: 22px; font-weight: 800; text-align: center; margin: 30px 0; letter-spacing: 3px; text-transform: uppercase; }

    /* Corpo do recibo */
    .receipt-body { font-size: 12px; line-height: 2; text-align: justify; margin: 25px 0 40px; color: #333; }
    .receipt-body strong { color: #000; }

    /* Local e data */
    .location-date { font-size: 12px; text-align: right; margin: 20px 0; color: #333; }

    /* Assinatura */
    .signature-section { margin-top: 80px; text-align: center; }
    .signature-line { width: 280px; margin: 0 auto; border-top: 1px solid #333; padding-top: 8px; }
    .signature-name { font-size: 11px; font-weight: 700; color: #1a1a1a; }
    .signature-doc { font-size: 10px; color: #555; margin-top: 2px; }

    /* Valor por extenso (decorativo) */
    .amount-extenso { font-size: 10px; color: #666; font-style: italic; margin-top: 10px; }

    /* Valor destaque */
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
        </div>
      </div>
    </div>

    <div class="receipt-title">RECIBO</div>

    <div class="receipt-body">
      Recebemos de <strong>${data.supplierName}</strong>${data.supplierCpfCnpj ? `, CNPJ: <strong>${data.supplierCpfCnpj}</strong>` : ""} a import&acirc;ncia de
      <strong class="amount-highlight"> ${currencyFmt(data.paidAmount)}</strong>,
      referente a <strong>${data.description}</strong>,
      em <strong>${formattedDate}</strong>.
    </div>

    ${data.discount && data.discount > 0 ? `<div style="font-size:10px;color:#666;margin-bottom:5px;">Desconto aplicado: ${currencyFmt(data.discount)}</div>` : ""}
    ${data.interest && data.interest > 0 ? `<div style="font-size:10px;color:#666;margin-bottom:5px;">Juros: ${currencyFmt(data.interest)}</div>` : ""}
    ${data.fine && data.fine > 0 ? `<div style="font-size:10px;color:#666;margin-bottom:5px;">Multa: ${currencyFmt(data.fine)}</div>` : ""}

    <div class="location-date">
      ${city} (${format(new Date(), "dd/MM/yyyy", { locale: ptBR })}).
    </div>

    <div class="signature-section">
      <div class="signature-line">
        <div class="signature-name">DAVID MELO DECORACAO & EVENTOS</div>
        <div class="signature-doc">${companyCnpj ? `CNPJ: ${companyCnpj}` : ""}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

export const PaymentReceiptDialog = ({ open, onOpenChange, data }: Props) => {
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    if (open && data?.companyId) {
      supabase.from("companies" as any).select("trade_name, legal_name, cnpj").eq("id", data.companyId).single()
        .then(({ data: comp }) => setCompany(comp as any))
        .catch(() => setCompany(null));
    }
  }, [open, data?.companyId]);

  if (!data) return null;

  const handlePrint = () => {
    const html = getReceiptHtml(data, company);
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

        <div className="bg-white border border-border/30 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-start gap-3 border-b border-border/20 pb-3">
            <img src={logoImg} alt="David Melo" className="w-10 h-10 object-contain" />
            <div>
              <p className="font-bold uppercase tracking-wider">{company?.trade_name || company?.legal_name || "David Melo"}</p>
              {company?.cnpj && <p className="text-muted-foreground">CNPJ: {company.cnpj}</p>}
            </div>
          </div>

          <p className="text-center font-black text-sm uppercase tracking-[0.3em] my-4">Recibo</p>

          <p className="leading-relaxed text-muted-foreground">
            Recebemos de <span className="font-bold text-foreground">{data.supplierName}</span>
            {data.supplierCpfCnpj && <>, CNPJ: <span className="font-bold text-foreground">{data.supplierCpfCnpj}</span></>}
            {" "}a importancia de{" "}
            <span className="font-bold text-foreground">{currencyFmt(data.paidAmount)}</span>,
            referente a <span className="font-bold text-foreground">{data.description}</span>,
            em <span className="font-bold text-foreground">{data.paymentDate}</span>.
          </p>

          <p className="text-right text-muted-foreground mt-6">
            Salvador (BA), {format(new Date(), "dd/MM/yyyy")}.
          </p>

          <div className="flex justify-center pt-10">
            <div className="text-center w-64">
              <div className="border-t border-foreground/40 mb-2" />
              <p className="text-[10px] font-bold uppercase">DAVID MELO DECORACAO & EVENTOS</p>
              {company?.cnpj && <p className="text-[9px] text-muted-foreground">CNPJ: {company.cnpj}</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={handlePrint} className="bg-gradient-gold hover:opacity-90 text-white font-bold">
            <Printer size={14} className="mr-2" /> Salvar / Imprimir PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
