import type { Order, OrderStatus, PaymentMethod, StoreConfig } from '../types';

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function getDiscountPercent(price: number, promoPrice: number | null): number | null {
  if (promoPrice === null || promoPrice <= 0 || promoPrice >= price) return null;
  return Math.round(((price - promoPrice) / price) * 100);
}

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: string }> = {
  novo: {
    label: 'Novo pedido',
    tone: 'text-[#B45309] bg-[#FEF3C7] border-[#FDE68A]',
  },
  separacao: {
    label: 'Em separação',
    tone: 'text-[#1D4ED8] bg-[#DBEAFE] border-[#BFDBFE]',
  },
  entrega: {
    label: 'Saiu para entrega',
    tone: 'text-[#6D28D9] bg-[#EDE9FE] border-[#DDD6FE]',
  },
  concluido: {
    label: 'Entregue',
    tone: 'text-[#15803D] bg-[#DCFCE7] border-[#BBF7D0]',
  },
  cancelado: {
    label: 'Cancelado',
    tone: 'text-[#B91C1C] bg-[#FEE2E2] border-[#FECACA]',
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cartao_link: 'Cartão de crédito (Link online)',
  cartao: 'Cartão na entrega',
  dinheiro: 'Dinheiro',
};

const SEARCH_SYNONYMS: Array<[RegExp, string]> = [
  [/\bh2oh?\b/gi, 'h2oh'],
  [/\bcoca\b/gi, 'coca cola'],
  [/\bpao\b/gi, 'pão'],
  [/\blimao\b/gi, 'limão'],
  [/\bmacaa?\b/gi, 'maçã'],
  [/\bagua\b/gi, 'água'],
  [/\bbrocolis\b/gi, 'brócolis'],
  [/\borganica?\b/gi, 'orgânica'],
];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSearch(haystack: string, query: string): boolean {
  const normQuery = normalizeText(query);
  if (!normQuery) return true;
  const normHaystack = normalizeText(haystack);
  if (
    normQuery
      .split(' ')
      .filter(Boolean)
      .every((term) => normHaystack.includes(term))
  ) {
    return true;
  }

  let expanded = query;
  for (const [pattern, replacement] of SEARCH_SYNONYMS) {
    expanded = expanded.replace(pattern, replacement);
  }
  const normExpanded = normalizeText(expanded);
  if (normExpanded !== normQuery) {
    return normExpanded
      .split(' ')
      .filter(Boolean)
      .every((term) => normHaystack.includes(term));
  }
  return false;
}

export function buildSearchQueries(rawQuery: string): string[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];
  let expanded = trimmed;
  for (const [pattern, replacement] of SEARCH_SYNONYMS) {
    expanded = expanded.replace(pattern, replacement);
  }
  const stripUnits = (val: string) =>
    val
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|lt|litros?|kg|g|gr|mg|un|und|pct|cx)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

  return Array.from(
    new Set([expanded, stripUnits(expanded), trimmed, stripUnits(trimmed)].filter((s) => s.length >= 2))
  );
}

export function sanitizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildWhatsAppChatUrl(phone: string, message?: string): string {
  const digits = sanitizeDigits(phone);
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  const base = `https://wa.me/${full}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function buildWhatsAppOrderMessage(order: Order): string {
  const lines: string[] = [
    `*PEDIDO ${order.code} — HORTIMARKET DELIVERY*`,
    `Cliente: ${order.customerName}`,
    `Telefone: ${order.customerPhone}`,
    '',
    '*Itens do pedido:*',
    ...order.items.map(
      (item) => `• ${item.quantity}x ${item.name} (${item.weightLabel}) — ${formatBRL(item.subtotal)}`
    ),
    '',
    `Subtotal: ${formatBRL(order.subtotal)}`,
    `Entrega: ${order.deliveryFee === 0 ? 'Grátis' : formatBRL(order.deliveryFee)}`,
    `*Total: ${formatBRL(order.total)}*`,
    '',
    order.fulfillmentType === 'retirada'
      ? 'Recebimento: Retirada na loja'
      : `Endereço: ${order.address}${order.neighborhood ? `, ${order.neighborhood}` : ''}${
          order.complement ? ` (${order.complement})` : ''
        }`,
    `Intenção de pagamento: ${PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}${
      order.paymentMethod === 'dinheiro' && order.changeFor ? ` (Troco para ${order.changeFor})` : ''
    }`,
  ];
  if (order.notes) {
    lines.push(`Observações: ${order.notes}`);
  }
  return lines.join('\n');
}

export function buildWhatsAppOrderUrl(store: StoreConfig, order: Order): string {
  return buildWhatsAppChatUrl(store.whatsappNumber, buildWhatsAppOrderMessage(order));
}

export function formatOrderDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
