import {
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Tag,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { HERO_IMAGE_URL } from '../data/seed';
import type { CatalogFilter, Department, Product, StoreConfig } from '../types';
import {
  buildWhatsAppChatUrl,
  formatBRL,
  getDiscountPercent,
  matchesSearch,
} from '../utils/format';
import { ProductImage } from './ProductImage';
import { PWAInstallButton } from './PWAControls';

interface CatalogViewProps {
  store: StoreConfig;
  departments: Department[];
  products: Product[];
  cart: Record<string, number>;
  activeFilter: CatalogFilter;
  onFilterChange: (filter: CatalogFilter) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onOpenFlyer: () => void;
}

type SortOption = 'destaques' | 'menor-preco' | 'maior-preco' | 'az';

export const CatalogView: React.FC<CatalogViewProps> = ({
  store,
  departments,
  products,
  cart,
  activeFilter,
  onFilterChange,
  onAddToCart,
  onUpdateQty,
  onOpenFlyer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('destaques');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);
  const dailyOfferCount = useMemo(
    () => activeProducts.filter((p) => p.isDailyOffer).length,
    [activeProducts]
  );

  const sortList = (items: Product[]) => {
    const copy = [...items];
    if (sortBy === 'menor-preco') {
      return copy.sort((a, b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price));
    }
    if (sortBy === 'maior-preco') {
      return copy.sort((a, b) => (b.promoPrice ?? b.price) - (a.promoPrice ?? a.price));
    }
    if (sortBy === 'az') {
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    return copy.sort((a, b) => Number(b.isDailyOffer) - Number(a.isDailyOffer));
  };

  const filteredProducts = useMemo(() => {
    const list = activeProducts.filter((p) => {
      if (activeFilter === 'ofertas' && !p.isDailyOffer) return false;
      if (activeFilter !== 'all' && activeFilter !== 'ofertas' && p.department !== activeFilter) {
        return false;
      }
      return matchesSearch(
        `${p.name} ${p.description} ${p.weightLabel} ${p.unit} ${p.ean || ''}`,
        searchQuery
      );
    });
    return sortList(list);
  }, [activeProducts, activeFilter, searchQuery, sortBy]);

  const groupedSections = useMemo(() => {
    if (activeFilter !== 'all' || searchQuery.trim() !== '') return null;
    return departments
      .map((dept) => ({
        department: dept,
        items: sortList(activeProducts.filter((p) => p.department === dept.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeFilter, searchQuery, departments, activeProducts, sortBy]);

  const deptNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) map[d.id] = d.name;
    return map;
  }, [departments]);

  const whatsappChatUrl = buildWhatsAppChatUrl(
    store.whatsappNumber,
    `Olá! Gostaria de falar com o atendimento do ${store.name}.`
  );

  const renderProductCard = (product: Product) => {
    const qty = cart[product.id] || 0;
    const effectivePrice = product.promoPrice ?? product.price;
    const discount = getDiscountPercent(product.price, product.promoPrice);
    const outOfStock = product.stock <= 0;

    return (
      <article
        key={product.id}
        className="bg-white border border-[#E4E8E0] rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm"
      >
        <div>
          <button
            type="button"
            onClick={() => setSelectedProduct(product)}
            className="w-full block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6E43] cursor-pointer"
          >
            <div className="aspect-[4/3] w-full bg-[#F2F4EE] overflow-hidden relative">
              <ProductImage
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {discount !== null && !outOfStock && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#D95D1A] text-white text-[11px] font-semibold tabular-nums">
                  -{discount}%
                </span>
              )}
              {outOfStock && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#161E19]/85 text-white text-[11px] font-semibold">
                  Esgotado
                </span>
              )}
            </div>
          </button>

          <div className="p-3 sm:p-4 pb-1.5 space-y-1">
            <p className="text-[11px] text-[#526057] truncate">
              <span className="hidden sm:inline">
                {deptNames[product.department] || product.department} ·{' '}
              </span>
              {product.weightLabel}
            </p>
            <button
              type="button"
              onClick={() => setSelectedProduct(product)}
              className="text-left block w-full cursor-pointer"
            >
              <h3 className="font-semibold text-[13px] sm:text-[15px] leading-snug text-[#161E19] hover:text-[#1F6E43] transition-colors line-clamp-2">
                {product.name}
              </h3>
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {product.promoPrice !== null && (
              <p className="text-[11px] text-[#7A877F] line-through tabular-nums leading-tight">
                {formatBRL(product.price)}
              </p>
            )}
            <p className="text-sm sm:text-base font-bold text-[#1F6E43] tabular-nums leading-tight">
              {formatBRL(effectivePrice)}
              <span className="text-[11px] font-normal text-[#526057]">/{product.unit}</span>
            </p>
          </div>

          {outOfStock ? (
            <span className="text-[11px] font-medium text-[#7A877F] whitespace-nowrap">
              Sem est.
            </span>
          ) : qty > 0 ? (
            <div className="inline-flex items-center border border-[#1F6E43] rounded-lg overflow-hidden bg-[#FAFBF8] shrink-0">
              <button
                type="button"
                onClick={() => onUpdateQty(product.id, -1)}
                aria-label={`Diminuir quantidade de ${product.name}`}
                className="p-1.5 text-[#143624] hover:bg-[#E1EAE0] transition-colors cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-1.5 sm:px-2 text-xs font-bold text-[#143624] tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => onUpdateQty(product.id, 1)}
                disabled={qty >= product.stock}
                aria-label={`Aumentar quantidade de ${product.name}`}
                className="p-1.5 text-[#143624] hover:bg-[#E1EAE0] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              aria-label={`Adicionar ${product.name}`}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Adicionar</span>
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 sm:space-y-7">
      <section
        aria-label="Informações da loja"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white border border-[#E4E8E0] rounded-xl px-4 sm:px-5 py-3"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm">
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              store.isOpen ? 'text-[#1F6E43]' : 'text-[#B45309]'
            }`}
          >
            {store.isOpen ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 shrink-0" />
            )}
            <span>{store.isOpen ? 'Loja aberta agora' : 'Loja fechada no momento'}</span>
          </span>

          <span className="hidden sm:inline text-[#CBD2C6]" aria-hidden="true">
            |
          </span>

          <span className="inline-flex items-center gap-1.5 text-[#435048]">
            <Clock className="w-3.5 h-3.5 text-[#6B776F] shrink-0" />
            <span>{store.openingHours}</span>
          </span>

          <span className="hidden md:inline text-[#CBD2C6]" aria-hidden="true">
            |
          </span>

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[#435048]">
            <MapPin className="w-3.5 h-3.5 text-[#6B776F] shrink-0" />
            <span>
              {store.address} · {store.neighborhood}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onFilterChange('ofertas');
              document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold bg-[#FFF4ED] text-[#C2410C] border border-[#FED7AA] hover:bg-[#FFEDD5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Ofertas ({dailyOfferCount})</span>
          </button>

          <a
            href={whatsappChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#165332] transition-colors whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </a>

          <PWAInstallButton variant="subtle" />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch bg-white border border-[#E4E8E0] rounded-2xl overflow-hidden">
        <div className="lg:col-span-6 p-4 sm:p-8 flex flex-col justify-between gap-4 sm:gap-6">
          <div className="space-y-2 sm:space-y-3">
            <p className="text-xs font-semibold tracking-wide text-[#D95D1A]">
              {store.name} · Entrega rápida e retirada na loja
            </p>
            <h1
              className="font-display font-bold text-[#143624] leading-[1.1] tracking-tight"
              style={{
                fontSize: 'clamp(1.5rem, 3.2vw, 2.75rem)',
                textWrap: 'balance',
              }}
            >
              Hortifruti fresco e mercado completo direto na sua casa.
            </h1>
            <p className="hidden sm:block text-sm leading-relaxed text-[#435048] max-w-xl">
              {store.tagline} Frete grátis a partir de{' '}
              <span className="font-semibold text-[#143624] tabular-nums">
                {formatBRL(store.freeDeliveryThreshold)}
              </span>
              , ou retire no balcão sem taxa.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#6B776F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar produto..."
                aria-label="Pesquisar produtos"
                className="w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border border-[#D4DBD0] bg-[#FAFBF8] text-sm text-[#161E19] placeholder:text-[#6B776F] focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30 focus:border-[#1F6E43]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar pesquisa"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#6B776F] hover:text-[#161E19] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenFlyer}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#D95D1A] text-white hover:bg-[#B84A10] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Cartaz Digital</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onFilterChange('ofertas');
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#EEF3EC] text-[#143624] hover:bg-[#E1EAE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Flame className="w-4 h-4 text-[#D95D1A]" />
                <span>Ofertas do Dia</span>
              </button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-6 relative min-h-[260px] lg:min-h-full bg-[#EEF1EA]">
          <ProductImage
            src={HERO_IMAGE_URL}
            alt="Bancada de hortifruti fresco e padaria do Hortimarket Minimercado"
            className="w-full h-full object-cover lg:h-full"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-6 text-white">
            <p className="text-xs font-medium text-white/85">
              Seleção diária · Preços atualizados em tempo real
            </p>
            <p className="text-base font-display font-semibold mt-0.5">{store.flyerTitle}</p>
          </div>
        </div>
      </section>

      <section id="catalogo" className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#E4E8E0] pb-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#143624]">
              Departamentos &amp; Produtos
            </h2>
            <p className="text-xs sm:text-sm text-[#526057] mt-0.5">
              {filteredProducts.length}{' '}
              {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos disponíveis'}
              {searchQuery ? ` para "${searchQuery}"` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="sort-catalog" className="text-xs font-medium text-[#526057]">
              Ordenar:
            </label>
            <select
              id="sort-catalog"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 rounded-lg border border-[#D4DBD0] bg-white text-xs font-medium text-[#161E19] focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
            >
              <option value="destaques">Ofertas em destaque</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-preco">Maior preço</option>
              <option value="az">Ordem alfabética (A–Z)</option>
            </select>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar por departamento"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'all'}
            onClick={() => onFilterChange('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[#143624] text-white'
                : 'bg-white text-[#435048] border border-[#E4E8E0] hover:bg-[#EEF3EC]'
            }`}
          >
            Agrupados por seção
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'ofertas'}
            onClick={() => onFilterChange('ofertas')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeFilter === 'ofertas'
                ? 'bg-[#D95D1A] text-white'
                : 'bg-white text-[#C2410C] border border-[#FED7AA] hover:bg-[#FFF4ED]'
            }`}
          >
            Ofertas do Dia ({dailyOfferCount})
          </button>

          {departments.map((dept) => (
            <button
              key={dept.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === dept.id}
              onClick={() => onFilterChange(dept.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeFilter === dept.id
                  ? 'bg-[#143624] text-white'
                  : 'bg-white text-[#435048] border border-[#E4E8E0] hover:bg-[#EEF3EC]'
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-[#E4E8E0] rounded-2xl p-10 text-center space-y-3">
            <p className="font-display text-lg font-semibold text-[#143624]">
              Nenhum produto encontrado
            </p>
            <p className="text-sm text-[#526057]">
              Tente limpar a busca ou selecionar outro departamento do Hortimarket.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                onFilterChange('all');
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors cursor-pointer"
            >
              Ver todos os produtos
            </button>
          </div>
        ) : groupedSections ? (
          <div className="space-y-8">
            {groupedSections.map(({ department, items }) => (
              <div key={department.id} className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-[#143624]">
                      {department.name}
                    </h3>
                    <p className="text-xs text-[#526057]">{department.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onFilterChange(department.id)}
                    className="text-xs font-semibold text-[#1F6E43] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Ver seção ({items.length})
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  {items.map(renderProductCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {filteredProducts.map(renderProductCard)}
          </div>
        )}
      </section>

      {selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedProduct.name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white border border-[#E4E8E0] rounded-2xl max-w-2xl w-full overflow-hidden grid grid-cols-1 sm:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-[4/3] sm:aspect-auto bg-[#F2F4EE]">
              <ProductImage
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-6 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs text-[#526057]">
                    {deptNames[selectedProduct.department]} · {selectedProduct.weightLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    aria-label="Fechar detalhes"
                    className="p-1 rounded-lg text-[#526057] hover:bg-[#EEF1EA] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-display text-xl font-bold text-[#143624]">
                  {selectedProduct.name}
                </h3>
                <p className="text-sm text-[#435048] leading-relaxed">
                  {selectedProduct.description}
                </p>
                <p className="text-xs text-[#526057] tabular-nums">
                  Disponível em estoque: {selectedProduct.stock} ({selectedProduct.unit})
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-[#E4E8E0]">
                <div>
                  {selectedProduct.promoPrice !== null && (
                    <p className="text-xs text-[#7A877F] line-through tabular-nums">
                      De {formatBRL(selectedProduct.price)}
                    </p>
                  )}
                  <p className="text-2xl font-bold text-[#143624] tabular-nums">
                    {formatBRL(selectedProduct.promoPrice ?? selectedProduct.price)}{' '}
                    <span className="text-sm font-normal text-[#526057]">
                      / {selectedProduct.unit}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  disabled={selectedProduct.stock <= 0}
                  onClick={() => {
                    onAddToCart(selectedProduct);
                    setSelectedProduct(null);
                  }}
                  className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] disabled:bg-[#CBD2C6] transition-colors cursor-pointer"
                >
                  {selectedProduct.stock <= 0 ? 'Produto esgotado' : 'Adicionar à sacola'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
