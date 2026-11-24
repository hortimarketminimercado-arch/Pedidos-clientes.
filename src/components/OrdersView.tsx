import { MessageCircle, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { Order, StoreConfig } from '../types';
import {
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
  buildWhatsAppOrderUrl,
  formatBRL,
  formatOrderDate,
} from '../utils/format';

interface OrdersViewProps {
  store: StoreConfig;
  orders: Order[];
  myOrderCodes: string[];
  onRefresh: () => void;
  onGoToCatalog: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  store,
  orders,
  myOrderCodes,
  onRefresh,
  onGoToCatalog,
}) => {
  const [search, setSearch] = useState('');

  const filteredOrders = useMemo(() => {
    const codeSet = new Set(myOrderCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
    const myOrders = orders.filter((o) => codeSet.has(o.code.toUpperCase()));
    const q = search.trim().toLowerCase();
    if (!q) return myOrders;
    return myOrders.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.items.some((item) => item.name.toLowerCase().includes(q))
    );
  }, [orders, myOrderCodes, search]);

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E8E0] pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#143624]">
            Acompanhamento de Pedidos
          </h1>
          <p className="text-sm text-[#526057] mt-1">
            Consulte o status em tempo real ou reenvie seu pedido pelo WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors self-start cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar status</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-[#6B776F] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nos seus pedidos por código ou produto..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D4DBD0] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-[#E4E8E0] rounded-2xl p-12 text-center space-y-3">
          <ShoppingBag className="w-10 h-10 text-[#8F9B93] mx-auto" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold text-[#143624]">
            Nenhum pedido encontrado
          </p>
          <p className="text-sm text-[#526057]">
            Você ainda não realizou pedidos neste navegador. Faça seu pedido no catálogo para
            acompanhar o status aqui.
          </p>
          <button
            type="button"
            onClick={onGoToCatalog}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] transition-colors cursor-pointer"
          >
            Ir para o catálogo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const meta = ORDER_STATUS_META[order.status];
            return (
              <article
                key={order.id}
                className="bg-white border border-[#E4E8E0] rounded-2xl p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E8E0] pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-[#143624]">
                      {order.code}
                    </span>
                    <span className="text-xs text-[#526057]">
                      {formatOrderDate(order.createdAt)}
                    </span>
                    <span className="text-xs text-[#526057]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-sm font-semibold text-[#161E19]">
                      {order.customerName}
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${meta.tone}`}>
                    {meta.label}
                  </span>
                </div>

                <ul className="space-y-1.5 text-sm">
                  {order.items.map((item) => (
                    <li
                      key={`${order.id}-${item.productId}`}
                      className="flex justify-between gap-4 text-[#435048]"
                    >
                      <span>
                        <strong className="text-[#161E19] tabular-nums">{item.quantity}x</strong>{' '}
                        {item.name} ({item.weightLabel})
                      </span>
                      <span className="tabular-nums font-medium text-[#161E19]">
                        {formatBRL(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#E4E8E0]">
                  <div className="text-xs text-[#526057] space-y-0.5">
                    <p>
                      {order.fulfillmentType === 'retirada'
                        ? 'Retirada na loja'
                        : `${order.address}${order.neighborhood ? ` · ${order.neighborhood}` : ''}`}
                    </p>
                    <p>
                      Pagamento: {PAYMENT_METHOD_LABELS[order.paymentMethod]} · Total:{' '}
                      <strong className="text-sm text-[#143624] tabular-nums">
                        {formatBRL(order.total)}
                      </strong>
                    </p>
                  </div>

                  <a
                    href={buildWhatsAppOrderUrl(store, order)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#EEF3EC] text-[#143624] hover:bg-[#E1EAE0] transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#1F6E43]" />
                    <span>Falar sobre este pedido</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
