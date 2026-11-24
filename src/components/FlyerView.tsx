import { ArrowLeft, Check, Minus, Plus, Printer, Share2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { Product, StoreConfig } from '../types';
import { formatBRL, getDiscountPercent } from '../utils/format';
import { Logo } from './Logo';
import { ProductImage } from './ProductImage';

interface FlyerViewProps {
  store: StoreConfig;
  products: Product[];
  cart: Record<string, number>;
  onAddToCart: (product: Product) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onBackToCatalog: () => void;
}

export const FlyerView: React.FC<FlyerViewProps> = ({
  store,
  products,
  cart,
  onAddToCart,
  onUpdateQty,
  onBackToCatalog,
}) => {
  const [copiedShare, setCopiedShare] = useState(false);

  const flyerProducts = useMemo(
    () =>
      products.filter(
        (p) => p.active && (p.inDigitalFlyer || p.promoPrice !== null)
      ),
    [products]
  );

  const handleShare = async () => {
    const shareUrl = window.location.origin;
    const shareText = `${store.flyerTitle} — ${store.name}\n${store.flyerValidity}\nPeça online com entrega rápida!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: store.flyerTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToCatalog}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar para o catálogo</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
          >
            {copiedShare ? (
              <Check className="w-3.5 h-3.5 text-[#1F6E43]" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span>{copiedShare ? 'Link copiado!' : 'Compartilhar encarte'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / Salvar PDF</span>
          </button>
        </div>
      </div>

      <section className="bg-white border border-[#D4DBD0] rounded-2xl overflow-hidden">
        <header className="bg-[#143624] text-white px-6 sm:px-8 py-7 flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-block bg-white px-3 py-1.5 rounded-xl">
              <Logo size="sm" logoUrl={store.logoUrl} />
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white pt-1">
              {store.flyerTitle}
            </h1>
            <p className="text-sm text-[#D8E6DD] max-w-xl">{store.flyerSubtitle}</p>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-xl p-4 text-xs space-y-1.5 min-w-[240px]">
            <p className="font-semibold text-[#FDE68A]">Validade do encarte</p>
            <p className="text-white/90 leading-relaxed">{store.flyerValidity}</p>
            <p className="text-white/75 pt-1">
              {store.address} · {store.neighborhood}
            </p>
            <p className="text-white/75">{store.openingHours}</p>
          </div>
        </header>

        <div className="p-6 sm:p-8">
          {flyerProducts.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="font-display text-lg font-semibold text-[#143624]">
                Nenhum produto selecionado para o encarte digital
              </p>
              <p className="text-sm text-[#526057]">
                Ative a opção “No Encarte” no painel administrativo para exibir ofertas aqui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {flyerProducts.map((product) => {
                const effectivePrice = product.promoPrice ?? product.price;
                const discount = getDiscountPercent(product.price, product.promoPrice);
                const qty = cart[product.id] || 0;
                const outOfStock = product.stock <= 0;

                return (
                  <article
                    key={product.id}
                    className="border border-[#E4E8E0] rounded-xl overflow-hidden bg-[#FAFBF8] flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[4/3] bg-[#EEF1EA] relative overflow-hidden">
                        <ProductImage
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                        {discount !== null && (
                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-[#D95D1A] text-white text-xs font-bold tabular-nums">
                            {discount}% OFF
                          </span>
                        )}
                      </div>

                      <div className="p-3 sm:p-4 pb-1.5 space-y-1">
                        <p className="text-[11px] font-medium text-[#526057] truncate">
                          {product.weightLabel}
                        </p>
                        <h2 className="font-semibold text-[13px] sm:text-sm text-[#161E19] leading-snug line-clamp-2">
                          {product.name}
                        </h2>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 pt-1.5 flex items-end justify-between gap-1.5">
                      <div className="min-w-0">
                        {product.promoPrice !== null && (
                          <p className="text-[11px] text-[#7A877F] line-through tabular-nums">
                            {formatBRL(product.price)}
                          </p>
                        )}
                        <p className="text-base sm:text-xl font-display font-bold text-[#D95D1A] tabular-nums leading-none">
                          {formatBRL(effectivePrice)}
                        </p>
                        <p className="text-[11px] text-[#526057] mt-0.5">/{product.unit}</p>
                      </div>

                      <div className="no-print shrink-0">
                        {outOfStock ? (
                          <span className="text-[11px] font-medium text-[#7A877F]">Esgotado</span>
                        ) : qty > 0 ? (
                          <div className="inline-flex items-center border border-[#1F6E43] rounded-lg overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(product.id, -1)}
                              aria-label="Remover"
                              className="p-1.5 text-[#143624] hover:bg-[#E1EAE0] cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-1.5 sm:px-2 text-xs font-bold tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(product.id, 1)}
                              disabled={qty >= product.stock}
                              aria-label="Adicionar"
                              className="p-1.5 text-[#143624] hover:bg-[#E1EAE0] disabled:opacity-40 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAddToCart(product)}
                            aria-label={`Adicionar ${product.name} à sacola`}
                            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <span className="sm:hidden">+</span>
                            <span className="hidden sm:inline">+ Sacola</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="bg-[#F2F4EE] border-t border-[#E4E8E0] px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#526057]">
          <span>
            {store.name} · WhatsApp: {store.whatsappNumber}
          </span>
          <span>Clique em “+ Sacola” em qualquer oferta do encarte para pedir pelo delivery.</span>
        </footer>
      </section>
    </div>
  );
};
