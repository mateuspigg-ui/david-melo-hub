import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";
import { format } from "date-fns";
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

const getReceiptHtml = (data: ReceiptData): string => {
  const methodLabel = PAYMENT_METHOD_LABEL[data.paymentMethod] || data.paymentMethod;
  const formattedDate = (() => {
    try {
      return format(new Date(data.paymentDate + "T12:00:00"), "dd/MM/yyyy");
    } catch {
      return data.paymentDate;
    }
  })();

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
    .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #C5A059; padding-bottom: 25px; }
    .logo { width: 80px; height: 80px; margin: 0 auto 12px; object-fit: contain; }
    .company-name { font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #1a1a1a; text-transform: uppercase; }
    .company-tagline { font-size: 9px; font-weight: 600; letter-spacing: 4px; color: #C5A059; text-transform: uppercase; margin-top: 4px; }
    .receipt-title { font-size: 18px; font-weight: 700; text-align: center; margin: 30px 0; color: #333; letter-spacing: 2px; text-transform: uppercase; }
    .receipt-number { font-size: 10px; color: #999; text-align: center; margin-top: -25px; margin-bottom: 20px; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #C5A059; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    .field { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee; }
    .field-label { font-size: 11px; font-weight: 600; color: #666; }
    .field-value { font-size: 11px; font-weight: 500; color: #1a1a1a; text-align: right; }
    .amount-box { background: #f8f8f8; border: 2px solid #C5A059; border-radius: 8px; padding: 20px; margin: 25px 0; }
    .amount-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .amount-row.total { border-top: 2px solid #C5A059; margin-top: 8px; padding-top: 10px; }
    .amount-label { font-size: 12px; font-weight: 600; color: #555; }
    .amount-value { font-size: 12px; font-weight: 700; color: #1a1a1a; }
    .amount-row.total .amount-label { font-size: 14px; font-weight: 800; color: #C5A059; }
    .amount-row.total .amount-value { font-size: 16px; font-weight: 800; color: #C5A059; }
    .declaration { font-size: 11px; line-height: 1.8; color: #555; margin: 30px 0; text-align: justify; }
    .declaration strong { color: #1a1a1a; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; }
    .signature { text-align: center; width: 45%; }
    .signature-line { border-top: 1px solid #333; margin-bottom: 8px; }
    .signature-name { font-size: 11px; font-weight: 600; color: #333; }
    .signature-role { font-size: 9px; color: #999; margin-top: 2px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
    .footer-text { font-size: 8px; color: #bbb; letter-spacing: 1px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; padding: 15mm 20mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img src="${logoImg}" alt="David Melo" class="logo" />
      <div class="company-name">David Melo</div>
      <div class="company-tagline">Decoracao & Eventos</div>
    </div>

    <div class="receipt-title">Recibo de Pagamento</div>
    <div class="receipt-number">Documento: ${data.documentNumber || "---"}</div>

    <div class="section">
      <div class="section-title">Dados do Fornecedor / Credor</div>
      <div class="field">
        <span class="field-label">Nome / Razao Social</span>
        <span class="field-value">${data.supplierName}</span>
      </div>
      ${data.supplierCpfCnpj ? `<div class="field"><span class="field-label">CPF / CNPJ</span><span class="field-value">${data.supplierCpfCnpj}</span></div>` : ""}
      ${data.supplierAddress ? `<div class="field"><span class="field-label">Endereco</span><span class="field-value">${data.supplierAddress}</span></div>` : ""}
    </div>

    <div class="section">
      <div class="section-title">Detalhes do Pagamento</div>
      <div class="field">
        <span class="field-label">Descricao</span>
        <span class="field-value">${data.description}</span>
      </div>
      <div class="field">
        <span class="field-label">Data do Pagamento</span>
        <span class="field-value">${formattedDate}</span>
      </div>
      <div class="field">
        <span class="field-label">Forma de Pagamento</span>
        <span class="field-value">${methodLabel}</span>
      </div>
      ${data.bankAccount ? `<div class="field"><span class="field-label">Conta Bancaria</span><span class="field-value">${data.bankAccount}</span></div>` : ""}
      ${data.documentNumber ? `<div class="field"><span class="field-label">Nr. Documento / Comprovante</span><span class="field-value">${data.documentNumber}</span></div>` : ""}
    </div>

    <div class="amount-box">
      <div class="amount-row">
        <span class="amount-label">Valor Original</span>
        <span class="amount-value">${currencyFmt(data.amount)}</span>
      </div>
      ${data.discount && data.discount > 0 ? `<div class="amount-row"><span class="amount-label">(-) Desconto</span><span class="amount-value">${currencyFmt(data.discount)}</span></div>` : ""}
      ${data.interest && data.interest > 0 ? `<div class="amount-row"><span class="amount-label">(+) Juros</span><span class="amount-value">${currencyFmt(data.interest)}</span></div>` : ""}
      ${data.fine && data.fine > 0 ? `<div class="amount-row"><span class="amount-label">(+) Multa</span><span class="amount-value">${currencyFmt(data.fine)}</span></div>` : ""}
      <div class="amount-row total">
        <span class="amount-label">VALOR PAGO</span>
        <span class="amount-value">${currencyFmt(data.paidAmount)}</span>
      </div>
    </div>

    <div class="declaration">
      Declaro que recebi o valor acima indicado a titulo de pagamento referente a <strong>${data.description}</strong>,
      dando plena e total quitação pelo valor recebido.
    </div>

    <div class="signatures">
      <div class="signature">
        <div class="signature-line"></div>
        <div class="signature-name">${data.supplierName}</div>
        <div class="signature-role">Recebedor(a)</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="signature-name">David Melo</div>
        <div class="signature-role">Pagador(a)</div>
      </div>
    </div>

    <div class="footer">
      <p class="footer-text">DAVID MELO DECORACAO & EVENTOS - DOCUMENTO GERADO PELO SISTEMA</p>
    </div>
  </div>
</body>
</html>`;
};

export const PaymentReceiptDialog = ({ open, onOpenChange, data }: Props) => {
  if (!data) return null;

  const handlePrint = () => {
    const html = getReceiptHtml(data);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleDownload = () => {
    const html = getReceiptHtml(data);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibo-${data.supplierName.replace(/\s+/g, "_")}-${data.paymentDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
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

        <div className="bg-white border border-border/30 rounded-xl p-6 space-y-4 text-sm">
          <div className="text-center border-b-2 border-gold pb-3">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gold">David Melo</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Decoracao & Eventos</p>
            <p className="text-sm font-bold mt-2 uppercase tracking-wider">Recibo de Pagamento</p>
          </div>

          <div className="space-y-1 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 border-b border-border/20 pb-1">Fornecedor</p>
            <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Nome:</span><span className="font-bold">{data.supplierName}</span></div>
            {data.supplierCpfCnpj && <div className="flex justify-between"><span className="text-muted-foreground font-semibold">CPF/CNPJ:</span><span className="font-bold">{data.supplierCpfCnpj}</span></div>}
          </div>

          <div className="space-y-1 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold mb-2 border-b border-border/20 pb-1">Pagamento</p>
            <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Descricao:</span><span className="font-bold text-right max-w-[60%]">{data.description}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Data:</span><span className="font-bold">{data.paymentDate}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Forma:</span><span className="font-bold">{PAYMENT_METHOD_LABEL[data.paymentMethod] || data.paymentMethod}</span></div>
            {data.bankAccount && <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Conta:</span><span className="font-bold">{data.bankAccount}</span></div>}
            {data.documentNumber && <div className="flex justify-between"><span className="text-muted-foreground font-semibold">Nr. Documento:</span><span className="font-bold">{data.documentNumber}</span></div>}
          </div>

          <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">Valor Original:</span><span className="font-bold">{currencyFmt(data.amount)}</span></div>
            {data.discount && data.discount > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">(-) Desconto:</span><span className="font-bold text-emerald-600">-{currencyFmt(data.discount)}</span></div>}
            {data.interest && data.interest > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">(+) Juros:</span><span className="font-bold text-amber-600">+{currencyFmt(data.interest)}</span></div>}
            {data.fine && data.fine > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">(+) Multa:</span><span className="font-bold text-red-500">+{currencyFmt(data.fine)}</span></div>}
            <div className="flex justify-between text-sm font-black border-t border-gold/30 pt-2 mt-1"><span className="text-gold uppercase tracking-wider">Valor Pago:</span><span className="text-gold">{currencyFmt(data.paidAmount)}</span></div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic leading-relaxed">
            Declaro que recebi o valor acima a titulo de pagamento, dando plena e total quitacao.
          </p>

          <div className="flex justify-between pt-8">
            <div className="text-center w-[45%]">
              <div className="border-t border-foreground/40 mb-2" />
              <p className="text-[10px] font-bold">{data.supplierName}</p>
              <p className="text-[8px] text-muted-foreground uppercase">Recebedor(a)</p>
            </div>
            <div className="text-center w-[45%]">
              <div className="border-t border-foreground/40 mb-2" />
              <p className="text-[10px] font-bold">David Melo</p>
              <p className="text-[8px] text-muted-foreground uppercase">Pagador(a)</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDownload} className="border-gold/40 text-gold hover:bg-gold hover:text-white">
            <Download size={14} className="mr-2" /> Salvar
          </Button>
          <Button onClick={handlePrint} className="bg-gradient-gold hover:opacity-90 text-white font-bold">
            <Printer size={14} className="mr-2" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
