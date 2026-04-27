import type { EventInventoryReservation } from '@/lib/inventory';
import { categoryLabel, statusLabel } from '@/lib/inventory';

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
};

const escapeHtml = (value?: string | null) =>
  String(value || '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const openReservationPdfPrint = ({
  reservation,
  companyName,
  logoUrl,
  responsibleName,
  guestCount,
}: {
  reservation: EventInventoryReservation;
  companyName: string;
  logoUrl?: string;
  responsibleName?: string;
  guestCount?: number | null;
}) => {
  const foodItems = (reservation.event_inventory_items || []).filter((item) => item.inventory_items?.type === 'food');
  const furnitureItems = (reservation.event_inventory_items || []).filter((item) => item.inventory_items?.type === 'furniture');
  const event = reservation.events;
  const client = event?.clients;

  const win = window.open('', '_blank');
  if (!win) return;

  const now = new Date();

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ficha de Separação de Estoque</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: 'Manrope', Arial, sans-serif; color: #1f2937; margin: 0; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 78px; height: 78px; object-fit: contain; border-radius: 14px; background: #fff9ee; border: 1px solid #e8d9bb; padding: 6px; }
    h1 { font-size: 18px; margin: 0; color: #9a6e2f; letter-spacing: .03em; }
    h2 { font-size: 13px; margin: 18px 0 8px; color: #111827; }
    .meta { text-align: right; font-size: 11px; color: #6b7280; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; font-size: 12px; margin-bottom: 6px; }
    .field { background: #f9fafb; border: 1px solid #eceff3; border-radius: 10px; padding: 8px 10px; }
    .field b { color: #374151; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; display: block; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th { text-align: left; background: #fff7e8; color: #7a5c2a; padding: 8px; border: 1px solid #f1e4ca; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
    .furniture-table { table-layout: fixed; }
    .furniture-photo-cell { width: 168px; min-width: 168px; }
    .thumb { width: 150px; height: 150px; border-radius: 12px; object-fit: cover; border: 1px solid #e5e7eb; display: block; margin: 0 auto; }
    .furniture-notes { word-break: break-word; white-space: normal; }
    .summary { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; background: #fafafa; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 26px; font-size: 11px; }
    .line { border-top: 1px solid #9ca3af; margin-top: 30px; padding-top: 6px; text-align: center; color: #6b7280; }
    footer { position: fixed; bottom: 6mm; left: 16mm; right: 16mm; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ''}
      <div>
        <h1>Ficha de Separação de Estoque</h1>
        <div style="font-size:11px;color:#6b7280;">${escapeHtml(companyName)}</div>
      </div>
    </div>
    <div class="meta">
      <div>Data de geração: ${escapeHtml(now.toLocaleString('pt-BR'))}</div>
      <div>Status da reserva: <b>${escapeHtml(statusLabel(reservation.reservation_status))}</b></div>
    </div>
  </div>

  <h2>Informações do Cliente</h2>
  <div class="grid">
    <div class="field"><b>Cliente</b>${escapeHtml(`${client?.first_name || ''} ${client?.last_name || ''}`.trim() || '-')}</div>
    <div class="field"><b>Telefone</b>${escapeHtml(client?.phone)}</div>
    <div class="field"><b>E-mail</b>${escapeHtml(client?.email)}</div>
    <div class="field"><b>Contrato</b>${escapeHtml((event as any)?.contract?.title || '-')}</div>
  </div>

  <h2>Informações do Evento</h2>
  <div class="grid">
    <div class="field"><b>Evento</b>${escapeHtml(event?.title)}</div>
    <div class="field"><b>Tipo</b>${escapeHtml(event?.event_type)}</div>
    <div class="field"><b>Data</b>${escapeHtml(formatDate(event?.event_date))}</div>
    <div class="field"><b>Local</b>${escapeHtml(event?.location)}</div>
    <div class="field"><b>Número de convidados</b>${guestCount ?? '-'}</div>
    <div class="field"><b>Responsável</b>${escapeHtml(responsibleName || '-')}</div>
  </div>

  <h2>Itens de Alimentação</h2>
  <table>
    <thead><tr><th>Item</th><th>Categoria</th><th>Qtd.</th><th>Unidade</th><th>Local</th><th>Observações</th></tr></thead>
    <tbody>
      ${foodItems.length === 0 ? '<tr><td colspan="6">Nenhum item selecionado.</td></tr>' : foodItems.map((item) => `
        <tr>
          <td>${escapeHtml(item.inventory_items?.name)}</td>
          <td>${escapeHtml(categoryLabel(item.inventory_items?.category || ''))}</td>
          <td>${item.quantity}</td>
          <td>${escapeHtml(item.unit || item.inventory_items?.unit)}</td>
          <td>${escapeHtml(item.inventory_items?.storage_location)}</td>
          <td>${escapeHtml(item.notes)}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2>Mobiliário e Decoração</h2>
  <table class="furniture-table">
    <thead><tr><th>Foto</th><th>Item</th><th>Categoria</th><th>Qtd.</th><th>Cor</th><th>Dimensões</th><th>Local</th><th>Observações</th></tr></thead>
    <tbody>
      ${furnitureItems.length === 0 ? '<tr><td colspan="8">Nenhum item selecionado.</td></tr>' : furnitureItems.map((item) => `
        <tr>
          <td class="furniture-photo-cell">${item.is_rental ? '-' : item.inventory_items?.inventory_item_photos?.[0]?.photo_url ? `<img class="thumb" src="${item.inventory_items.inventory_item_photos[0].photo_url}" />` : '-'}</td>
          <td>${escapeHtml(item.is_rental ? `${item.rental_item_name || 'Peça alugada'} (Aluguel)` : item.inventory_items?.name)}</td>
          <td>${escapeHtml(item.is_rental ? `Aluguel • ${item.rental_supplier || 'Fornecedor não informado'}` : categoryLabel(item.inventory_items?.category || ''))}</td>
          <td>${item.quantity}</td>
          <td>${escapeHtml(item.is_rental ? '-' : item.inventory_items?.color)}</td>
          <td>${escapeHtml(item.is_rental ? '-' : item.inventory_items?.dimensions)}</td>
          <td>${escapeHtml(item.is_rental ? item.rental_supplier : item.inventory_items?.storage_location)}</td>
          <td class="furniture-notes">${escapeHtml(item.notes)}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <div class="summary">
    <strong>Resumo</strong>
    <div style="margin-top:6px;font-size:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
      <div>Total de itens de alimentação: <b>${foodItems.length}</b></div>
      <div>Total de itens mobiliário/decoração: <b>${furnitureItems.length}</b></div>
      <div>Status da reserva: <b>${escapeHtml(statusLabel(reservation.reservation_status))}</b></div>
    </div>
  </div>

  <div class="signatures">
    <div class="line">Assinatura responsável</div>
    <div class="line">Assinatura entrega / check-out</div>
    <div class="line">Assinatura devolução / check-in</div>
  </div>

  <footer>
    <span>${escapeHtml(companyName)} - Ficha de Separação de Estoque</span>
    <span class="pageNumber"></span>
  </footer>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
};
