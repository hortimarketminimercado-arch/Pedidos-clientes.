import {
  Check,
  CheckCircle2,
  Copy,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { createOrder } from '../services/api';
import type { FulfillmentType, Order, PaymentMethod, Product, StoreConfig } from '../types';
import {
  PAYMENT_METHOD_LABELS,
  buildWhatsAppOrderMessage,
  buildWhatsAppOrderUrl,
  formatBRL,
} from '../utils/format';
import { ProductImage } from './ProductImage';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  store: StoreConfig;
  products: Product[];
  cart: Record<string, number>;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onOrderCreated: (order: Order) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  onClose,
  store,
  products,
  cart,
  onUpdateQty,
  onRemoveItem,
  onOrderCreated,
}) => {
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const availablePayments = useMemo<PaymentMethod[]>(
    () => (store.acceptedPayments?.length ? store.acceptedPayments : ['pix', 'cartao_link']),
    [store.acceptedPayments]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(availablePayments[0]);
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  const selectedPayment = availablePayments.includes(paymentMethod)
    ? paymentMethod
    : availablePayments[0];

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const product = products.find((p) => p.id === id);
          if (!product || qty <= 0) return null;
          const unitPrice = product.promoPrice ?? product.price;
          return {
            product,
            quantity: qty,
            unitPrice,
            lineTotal: Number((unitPrice * qty).toFixed(2)),
          };
        })
        .filter((line): line is NonNullable<typeof line> => line !== null),
    [cart, products]
  );

  const subtotal = useMemo(
    () => Number(cartLines.reduce((acc, l) => acc + l.lineTotal, 0).toFixed(2)),
    [cartLines]
  );

  const deliveryFee =
    fulfillmentType === 'retirada' || subtotal === 0 || subtotal >= store.freeDeliveryThreshold
      ? 0
      : store.deliveryFee;

  const total = Number((subtotal + deliveryFee).toFixed(2));
  const missingForFreeDelivery = Math.max(0, store.freeDeliveryThreshold - subtotal);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const result = await createOrder(
        {
          customerName,
          customerPhone,
          fulfillmentType,
          address,
          neighborhood,
          complement,
          paymentMethod: selectedPayment,
          changeFor,
          notes,
          items: cartLines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        },
        store,
        products
      );
      if (!result.order) {
        setErrorMsg(result.error || 'Não foi possível concluir seu pedido.');
        return;
      }
      setCreatedOrder(result.order);
      onOrderCreated(result.order);
      const waUrl = buildWhatsAppOrderUrl(store, result.order);
      const anchor = document.createElement('a');
      anchor.href = waUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setErrorMsg('Erro ao enviar o pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySummary = async () => {
    if (!createdOrder) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppOrderMessage(createdOrder));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyPix = async () => {
    if (!store.pixKey) return;
    try {
      await navigator.clipboard.writeText(store.pixKey);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleClose = () => {
    setCreatedOrder(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sacola de compras e finalização"
      className="fixed inset-0 z-50 flex justify-end bg-black/45"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-[#FAFBF8] h-full flex flex-col border-l border-[#D4DBD0]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white border-b border-[#E4E8E0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#143624]" />
            <h2 className="font-display text-lg font-bold text-[#143624]">
              {createdOrder ? `Pedido ${createdOrder.code}` : 'Sua Sacola'}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar sacola"
            className="p-2 rounded-lg text-[#526057] hover:bg-[#EEF1EA] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {createdOrder ? (
            <div className="space-y-5">
              <div className="bg-[#DCFCE7] border border-[#BBF7D0] rounded-xl p-5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-display font-bold text-[#143624]">
                    Pedido {createdOrder.code} registrado!
                  </p>
                  <p className="text-xs text-[#166534] leading-relaxed">
                    Seu pedido já entrou na fila do Hortimarket e o WhatsApp da loja foi acionado
                    automaticamente. Se não abriu na sua tela, clique no botão abaixo para enviar.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#E4E8E0] pb-3">
                  <span className="text-xs font-semibold text-[#526057]">Resumo dos itens</span>
                  <span className="text-xs font-mono text-[#143624]">{createdOrder.code}</span>
                </div>

                <ul className="space-y-2.5 text-sm">
                  {createdOrder.items.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between gap-3">
                      <span className="text-[#161E19]">
                        <span className="font-semibold tabular-nums">{item.quantity}x</span>{' '}
                        {item.name}{' '}
                        <span className="text-xs text-[#526057]">({item.weightLabel})</span>
                      </span>
                      <span className="font-semibold text-[#143624] tabular-nums shrink-0">
                        {formatBRL(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-[#E4E8E0] pt-3 space-y-1.5 text-xs text-[#526057]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatBRL(createdOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className="tabular-nums">
                      {createdOrder.deliveryFee === 0
                        ? 'Grátis'
                        : formatBRL(createdOrder.deliveryFee)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#143624] pt-1">
                    <span>Total</span>
                    <span className="tabular-nums">{formatBRL(createdOrder.total)}</span>
                  </div>
                </div>

                <div className="border-t border-[#E4E8E0] pt-3 text-xs text-[#435048] space-y-1.5">
                  <p>
                    <strong className="text-[#143624]">Recebimento:</strong>{' '}
                    {createdOrder.fulfillmentType === 'retirada'
                      ? 'Retirada na loja'
                      : `${createdOrder.address} · ${createdOrder.neighborhood}${
                          createdOrder.complement ? ` (${createdOrder.complement})` : ''
                        }`}
                  </p>
                  <p>
                    <strong className="text-[#143624]">Intenção de pagamento:</strong>{' '}
                    {PAYMENT_METHOD_LABELS[createdOrder.paymentMethod] ||
                      createdOrder.paymentMethod}
                    {createdOrder.paymentMethod === 'dinheiro' && createdOrder.changeFor
                      ? ` (Troco para ${createdOrder.changeFor})`
                      : ''}
                  </p>

                  {createdOrder.paymentMethod === 'pix' && store.pixKey && (
                    <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-lg p-3 mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#143624]">Chave Pix da loja</p>
                        <p className="font-mono text-xs text-[#161E19] truncate">{store.pixKey}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyPix()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] shrink-0 cursor-pointer"
                      >
                        {copiedPix ? (
                          <Check className="w-3.5 h-3.5 text-[#1F6E43]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedPix ? 'Copiada!' : 'Copiar Pix'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                <a
                  href={buildWhatsAppOrderUrl(store, createdOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl text-sm font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar Pedido no WhatsApp da Loja</span>
                </a>

                <button
                  type="button"
                  onClick={() => void handleCopySummary()}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
                >
                  {copiedSummary ? (
                    <Check className="w-3.5 h-3.5 text-[#1F6E43]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedSummary ? 'Resumo copiado!' : 'Copiar resumo para área de transferência'}
                  </span>
                </button>
              </div>
            </div>
          ) : cartLines.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-12 h-12 text-[#8F9B93] mx-auto" strokeWidth={1.5} />
              <p className="font-display text-lg font-semibold text-[#143624]">
                Sua sacola está vazia
              </p>
              <p className="text-sm text-[#526057] max-w-xs mx-auto">
                Adicione frutas, verduras ou itens do encarte digital para iniciar seu pedido.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white border border-[#E4E8E0] rounded-xl p-3.5 text-xs text-[#435048]">
                {missingForFreeDelivery > 0 ? (
                  <span>
                    Adicione mais{' '}
                    <strong className="text-[#143624] tabular-nums">
                      {formatBRL(missingForFreeDelivery)}
                    </strong>{' '}
                    para ganhar entrega grátis.
                  </span>
                ) : (
                  <span className="font-semibold text-[#1F6E43]">
                    Entrega grátis desbloqueada neste pedido!
                  </span>
                )}
              </div>

              <div className="bg-white border border-[#E4E8E0] rounded-xl divide-y divide-[#E4E8E0]">
                {cartLines.map(({ product, quantity, unitPrice, lineTotal }) => (
                  <div key={product.id} className="p-4 flex items-center gap-3.5">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#F2F4EE] shrink-0">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#161E19] truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-[#526057] tabular-nums">
                        {formatBRL(unitPrice)} / {product.unit} · {product.weightLabel}
                      </p>

                      <div className="flex items-center gap-3 mt-2">
                        <div className="inline-flex items-center border border-[#D4DBD0] rounded-lg overflow-hidden bg-[#FAFBF8]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(product.id, -1)}
                            aria-label="Diminuir"
                            className="p-1.5 text-[#143624] hover:bg-[#EEF1EA] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-bold tabular-nums">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(product.id, 1)}
                            disabled={quantity >= product.stock}
                            aria-label="Aumentar"
                            className="p-1.5 text-[#143624] hover:bg-[#EEF1EA] disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveItem(product.id)}
                          aria-label={`Remover ${product.name}`}
                          className="p-1.5 text-[#7A877F] hover:text-[#B91C1C] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm font-bold text-[#143624] tabular-nums shrink-0">
                      {formatBRL(lineTotal)}
                    </p>
                  </div>
                ))}
              </div>

              <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-4">
                  <h3 className="font-display text-base font-bold text-[#143624]">
                    Dados para entrega e automação
                  </h3>

                  <div className="grid grid-cols-2 gap-2 p-1 bg-[#EEF1EA] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('delivery')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        fulfillmentType === 'delivery'
                          ? 'bg-white text-[#143624] shadow-sm'
                          : 'text-[#526057]'
                      }`}
                    >
                      Entrega Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('retirada')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        fulfillmentType === 'retirada'
                          ? 'bg-white text-[#143624] shadow-sm'
                          : 'text-[#526057]'
                      }`}
                    >
                      Retirar na Loja (Grátis)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#435048] mb-1">
                        Seu nome *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex: Maria Clara"
                        className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#435048] mb-1">
                        WhatsApp / Telefone *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                      />
                    </div>
                  </div>

                  {fulfillmentType === 'delivery' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[#435048] mb-1">
                          Rua e número *
                        </label>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Ex: Rua das Flores, 240"
                          className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#435048] mb-1">
                            Bairro
                          </label>
                          <input
                            type="text"
                            value={neighborhood}
                            onChange={(e) => setNeighborhood(e.target.value)}
                            placeholder="Ex: Centro"
                            className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#435048] mb-1">
                            Complemento
                          </label>
                          <input
                            type="text"
                            value={complement}
                            onChange={(e) => setComplement(e.target.value)}
                            placeholder="Apto, bloco, ref."
                            className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <label className="block text-xs font-medium text-[#435048]">
                      Intenção de pagamento (formas aceitas pela loja)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availablePayments.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`py-2.5 px-3 rounded-lg text-xs font-semibold border text-left transition-colors cursor-pointer ${
                            selectedPayment === method
                              ? 'bg-[#143624] text-white border-[#143624]'
                              : 'bg-white text-[#435048] border-[#D4DBD0] hover:bg-[#EEF3EC]'
                          }`}
                        >
                          {PAYMENT_METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>

                    {selectedPayment === 'pix' && (
                      <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-lg px-3 py-2 text-xs text-[#435048]">
                        {store.pixKey ? (
                          <span>
                            Chave Pix da loja:{' '}
                            <strong className="font-mono text-[#143624]">{store.pixKey}</strong>{' '}
                            (você também pode copiar após confirmar).
                          </span>
                        ) : (
                          <span>
                            Chave Pix enviada automaticamente no atendimento pelo WhatsApp.
                          </span>
                        )}
                      </div>
                    )}

                    {selectedPayment === 'cartao_link' && (
                      <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-lg px-3 py-2 text-xs text-[#435048]">
                        {store.paymentLinkInfo ||
                          'Enviamos o link de pagamento online por cartão de crédito direto no seu WhatsApp.'}
                      </div>
                    )}

                    {selectedPayment === 'dinheiro' && (
                      <input
                        type="text"
                        value={changeFor}
                        onChange={(e) => setChangeFor(e.target.value)}
                        placeholder="Precisa de troco para quanto? Ex: R$ 100,00"
                        className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-xs focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#435048] mb-1">
                      Observações para separação (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Frutas mais maduras, interfone não funciona..."
                      className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-xs focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-xs font-semibold text-[#B91C1C] bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-3.5 py-2.5">
                    {errorMsg}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>

        {!createdOrder && cartLines.length > 0 && (
          <div className="bg-white border-t border-[#E4E8E0] p-6 space-y-3">
            <div className="space-y-1 text-xs text-[#526057]">
              <div className="flex justify-between">
                <span>Subtotal dos produtos</span>
                <span className="tabular-nums font-medium">{formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxa de entrega</span>
                <span className="tabular-nums font-medium">
                  {deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#143624] pt-1">
                <span>Total do pedido</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </div>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={submitting}
              className="w-full py-3.5 px-5 rounded-xl text-sm font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Registrando pedido...' : 'Confirmar Pedido e Gerar WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
