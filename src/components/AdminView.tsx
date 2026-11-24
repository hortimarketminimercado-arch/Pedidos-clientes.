import {
  AlertTriangle,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  LogOut,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ScanBarcode,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOGO_URL, PRESET_GALLERY, UNIT_OPTIONS } from '../data/seed';
import type {
  AnalyticsSummary,
  Department,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductInput,
  StoreConfig,
} from '../types';
import { type ProductImageCandidate, lookupProductByEan, searchProductImages } from '../utils/eanLookup';
import {
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
  buildWhatsAppChatUrl,
  formatBRL,
  formatOrderDate,
  matchesSearch,
} from '../utils/format';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ProductImage } from './ProductImage';

interface AdminViewProps {
  store: StoreConfig;
  departments: Department[];
  products: Product[];
  orders: Order[];
  analytics: AnalyticsSummary;
  onSaveStore: (patch: Partial<StoreConfig>) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onUpdateProduct: (id: string, patch: Partial<ProductInput>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onRefresh?: () => void;
  onSignOut?: () => void;
}

type AdminTab = 'overview' | 'products' | 'orders' | 'settings';

interface ProductFormState {
  ean: string;
  name: string;
  description: string;
  department: string;
  unit: string;
  weightLabel: string;
  price: string;
  promoPrice: string;
  stock: string;
  imageUrl: string;
  isDailyOffer: boolean;
  inDigitalFlyer: boolean;
  active: boolean;
}

const EMPTY_FORM: ProductFormState = {
  ean: '',
  name: '',
  description: '',
  department: 'mercearia',
  unit: 'un',
  weightLabel: '1 unidade',
  price: '',
  promoPrice: '',
  stock: '20',
  imageUrl: PRESET_GALLERY[3].url,
  isDailyOffer: false,
  inDigitalFlyer: false,
  active: true,
};

async function compressUploadedImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        } else {
          resolve(String(reader.result || ''));
        }
      };
      img.onerror = () => reject(new Error('Falha ao ler imagem'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Falha ao abrir arquivo'));
    reader.readAsDataURL(file);
  });
}

export const AdminView: React.FC<AdminViewProps> = ({
  store,
  departments,
  products,
  orders,
  analytics,
  onSaveStore,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateOrderStatus,
  onRefresh,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [productSearch, setProductSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'modal' | 'quick'>('modal');
  const [eanLoading, setEanLoading] = useState(false);
  const [eanFeedback, setEanFeedback] = useState<string | null>(null);

  const [imgQuery, setImgQuery] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgFeedback, setImgFeedback] = useState<string | null>(null);
  const [imgResults, setImgResults] = useState<ProductImageCandidate[]>([]);

  const [storeForm, setStoreForm] = useState<StoreConfig>(store);
  const [savingStore, setSavingStore] = useState(false);
  const [storeSavedBanner, setStoreSavedBanner] = useState(false);
  const [copiedCustomerLink, setCopiedCustomerLink] = useState(false);

  useEffect(() => {
    setStoreForm(store);
  }, [store]);

  const [inlineDrafts, setInlineDrafts] = useState<
    Record<string, { price: string; promoPrice: string; stock: string }>
  >({});

  const deptNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) map[d.id] = d.name;
    return map;
  }, [departments]);

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        if (deptFilter !== 'all' && p.department !== deptFilter) return false;
        return matchesSearch(
          `${p.name} ${p.description} ${p.ean || ''} ${p.weightLabel} ${p.unit}`,
          productSearch
        );
      }),
    [products, productSearch, deptFilter]
  );

  const newOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'novo').length,
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const list =
      orderStatusFilter === 'all'
        ? [...orders]
        : orders.filter((o) => o.status === orderStatusFilter);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, orderStatusFilter]);

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.active && p.stock <= 5),
    [products]
  );

  const resetSearchHelpers = () => {
    setEanFeedback(null);
    setImgFeedback(null);
    setImgResults([]);
    setImgQuery('');
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    resetSearchHelpers();
    setModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      ean: product.ean || '',
      name: product.name,
      description: product.description,
      department: product.department,
      unit: product.unit,
      weightLabel: product.weightLabel,
      price: product.price.toFixed(2),
      promoPrice: product.promoPrice === null ? '' : product.promoPrice.toFixed(2),
      stock: String(product.stock),
      imageUrl: product.imageUrl,
      isDailyOffer: product.isDailyOffer,
      inDigitalFlyer: product.inDigitalFlyer,
      active: product.active,
    });
    resetSearchHelpers();
    setImgQuery(product.name);
    setModalOpen(true);
  };

  const lookupEanCode = async (rawEan: string) => {
    const clean = rawEan.replace(/\D/g, '');
    if (!clean) return;
    setForm((prev) => ({ ...prev, ean: clean }));
    setEanLoading(true);
    setEanFeedback('Buscando informações e imagem pelo código EAN...');
    try {
      const res = await lookupProductByEan(clean);
      if (res.found) {
        setForm((prev) => ({
          ...prev,
          ean: clean,
          name: res.name || prev.name,
          weightLabel: res.weightLabel || prev.weightLabel,
          description: res.description || prev.description,
          department: res.department || prev.department,
          imageUrl: res.imageUrl || prev.imageUrl,
        }));
        if (res.name) setImgQuery(res.name);
        setEanFeedback(
          res.imageUrl
            ? `Produto identificado (${res.sourceLabel}) com imagem automática preenchida.`
            : `Produto identificado (${res.sourceLabel}). Use "Buscar imagem (PNG)" para escolher uma foto.`
        );
      } else {
        setEanFeedback(
          `Código EAN ${clean} gravado. Produto não encontrado na base pública — preencha o nome e busque a imagem PNG abaixo.`
        );
      }
    } finally {
      setEanLoading(false);
    }
  };

  const handleBarcodeDetected = async (rawCode: string) => {
    setScannerOpen(false);
    const clean = rawCode.replace(/\D/g, '');
    if (!clean) return;

    if (scannerMode === 'quick') {
      const existing = products.find((p) => p.ean === clean);
      if (existing) {
        openEditProductModal(existing);
        setEanFeedback(
          `Produto já cadastrado encontrado pelo EAN ${clean}. Edite preço ou estoque abaixo.`
        );
        return;
      }
      setEditingProduct(null);
      setForm({ ...EMPTY_FORM, ean: clean });
      resetSearchHelpers();
      setModalOpen(true);
      await lookupEanCode(clean);
    } else {
      await lookupEanCode(clean);
    }
  };

  const handleSearchImages = async (overrideQuery?: string) => {
    const term = (overrideQuery ?? (imgQuery || form.name || form.ean)).trim();
    if (!term) {
      setImgFeedback('Digite o nome do produto para buscar imagens.');
      return;
    }
    setImgQuery(term);
    setImgLoading(true);
    setImgFeedback(null);
    try {
      const found = await searchProductImages(term);
      setImgResults(found);
      if (found.length > 0) {
        setImgFeedback(`${found.length} imagens encontradas para "${term}".`);
        if (!form.imageUrl) {
          setForm((prev) => ({ ...prev, imageUrl: found[0].url }));
        }
      } else {
        setImgFeedback(
          `Nenhuma imagem encontrada para "${term}". Tente só a marca ou nome principal (ex: "h2oh" ou "tomate").`
        );
      }
    } finally {
      setImgLoading(false);
    }
  };

  const handleLocalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressUploadedImage(file);
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch {
      // Ignore invalid image file
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = Number(form.price.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) return;

    const parsedPromo = form.promoPrice.trim()
      ? Number(form.promoPrice.replace(',', '.'))
      : null;
    const promoPrice =
      parsedPromo !== null && !Number.isNaN(parsedPromo) && parsedPromo > 0 ? parsedPromo : null;
    const stock = Math.max(0, Math.floor(Number(form.stock) || 0));

    setSavingProduct(true);
    try {
      const payload: ProductInput = {
        ean: form.ean.trim() || undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        department: form.department,
        unit: form.unit,
        weightLabel: form.weightLabel.trim() || form.unit,
        price: parsedPrice,
        promoPrice,
        stock,
        imageUrl: form.imageUrl.trim() || PRESET_GALLERY[0].url,
        isDailyOffer: form.isDailyOffer,
        inDigitalFlyer: form.inDigitalFlyer,
        active: form.active,
      };
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, payload);
      } else {
        await onCreateProduct(payload);
      }
      setModalOpen(false);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSaveInlineRow = async (product: Product) => {
    const draft = inlineDrafts[product.id];
    if (!draft) return;
    const parsedPrice = Number(draft.price.replace(',', '.'));
    const parsedPromo = draft.promoPrice.trim()
      ? Number(draft.promoPrice.replace(',', '.'))
      : null;
    const parsedStock = Math.max(0, Math.floor(Number(draft.stock)));

    await onUpdateProduct(product.id, {
      price: !Number.isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : product.price,
      promoPrice:
        parsedPromo !== null && !Number.isNaN(parsedPromo) && parsedPromo > 0 ? parsedPromo : null,
      stock: !Number.isNaN(parsedStock) ? parsedStock : product.stock,
    });
    setInlineDrafts((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  const toggleAcceptedPayment = (method: PaymentMethod) => {
    const current = storeForm.acceptedPayments || ['pix', 'cartao_link'];
    const exists = current.includes(method);
    if (exists && current.length === 1) return;
    const next = exists ? current.filter((m) => m !== method) : [...current, method];
    setStoreForm({ ...storeForm, acceptedPayments: next });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E4E8E0] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#143624]">
            Gestão Hortimarket
          </h1>
          <p className="text-sm text-[#526057] mt-1">
            Cadastre direto do produto físico com leitor EAN, gerencie preços, estoque e pedidos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/`);
                setCopiedCustomerLink(true);
                setTimeout(() => setCopiedCustomerLink(false), 2500);
              } catch {
                // Ignore clipboard error
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
          >
            {copiedCustomerLink ? (
              <Check className="w-4 h-4 text-[#1F6E43]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>{copiedCustomerLink ? 'Link copiado!' : 'Copiar link do cliente'}</span>
          </button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Ver loja</span>
          </a>

          <button
            type="button"
            onClick={() => {
              const nextOpen = !store.isOpen;
              setStoreForm((prev) => ({ ...prev, isOpen: nextOpen }));
              void onSaveStore({ isOpen: nextOpen });
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              store.isOpen
                ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0] hover:bg-[#BBF7D0]/60'
                : 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A] hover:bg-[#FDE68A]/60'
            }`}
          >
            {store.isOpen ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            <span>{store.isOpen ? 'Loja Aberta' : 'Loja Fechada'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScannerMode('quick');
              setScannerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[#D95D1A] text-white hover:bg-[#B84A10] transition-colors cursor-pointer"
          >
            <ScanBarcode className="w-4 h-4" />
            <span>Ler Código de Barras</span>
          </button>

          <button
            type="button"
            onClick={openNewProductModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo produto</span>
          </button>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title="Sair da conta administrativa"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#526057] hover:text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'overview', label: 'Visão Geral & Vendas', icon: BarChart3 },
            { id: 'products', label: `Produtos & Preços (${products.length})`, icon: Package },
            { id: 'orders', label: `Pedidos (${orders.length})`, icon: ShoppingBag },
            { id: 'settings', label: 'Configurações da Loja', icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'settings') setStoreForm(store);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#143624] text-white'
                  : 'bg-white text-[#435048] border border-[#E4E8E0] hover:bg-[#EEF3EC]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'orders' && newOrdersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#D95D1A] text-white text-[10px] font-bold tabular-nums">
                  {newOrdersCount} novo{newOrdersCount > 1 ? 's' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {newOrdersCount > 0 && activeTab !== 'orders' && (
        <div className="bg-[#FFF4ED] border border-[#FED7AA] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[#9A3412]">
            Você tem {newOrdersCount} pedido{newOrdersCount > 1 ? 's' : ''} novo
            {newOrdersCount > 1 ? 's' : ''} aguardando separação.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#D95D1A] text-white hover:bg-[#B84A10] transition-colors cursor-pointer"
          >
            Ver pedidos agora
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-1.5">
              <p className="text-xs font-medium text-[#526057]">Faturamento total</p>
              <p className="font-display text-2xl font-bold text-[#143624] tabular-nums">
                {formatBRL(analytics.totalRevenue)}
              </p>
              <p className="text-xs text-[#6B776F] tabular-nums">
                Hoje: {formatBRL(analytics.todayRevenue)}
              </p>
            </div>

            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-1.5">
              <p className="text-xs font-medium text-[#526057]">Pedidos registrados</p>
              <p className="font-display text-2xl font-bold text-[#143624] tabular-nums">
                {analytics.totalOrders}
              </p>
              <p className="text-xs text-[#D95D1A] font-medium tabular-nums">
                {analytics.pendingOrders} em andamento
              </p>
            </div>

            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-1.5">
              <p className="text-xs font-medium text-[#526057]">Ticket médio</p>
              <p className="font-display text-2xl font-bold text-[#143624] tabular-nums">
                {formatBRL(analytics.averageTicket)}
              </p>
              <p className="text-xs text-[#6B776F] tabular-nums">
                {analytics.activeOffersCount} ofertas do dia ativas
              </p>
            </div>

            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-1.5">
              <p className="text-xs font-medium text-[#526057]">Alertas de estoque</p>
              <p className="font-display text-2xl font-bold text-[#143624] tabular-nums">
                {analytics.lowStockCount}
              </p>
              <p className="text-xs text-[#6B776F] tabular-nums">
                {analytics.flyerItemsCount} itens no encarte digital
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-[#143624]">
                  Pedidos recentes
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-semibold text-[#1F6E43] hover:underline cursor-pointer"
                >
                  Ver todos
                </button>
              </div>
              <div className="divide-y divide-[#E4E8E0]">
                {orders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#161E19]">
                        <span className="font-mono text-xs text-[#526057] mr-2">
                          {order.code}
                        </span>
                        {order.customerName}
                      </p>
                      <p className="text-xs text-[#526057]">
                        {formatOrderDate(order.createdAt)} · {order.items.length} itens
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#143624] tabular-nums">
                        {formatBRL(order.total)}
                      </p>
                      <p className="text-xs text-[#526057]">
                        {ORDER_STATUS_META[order.status].label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-[#143624]">
                  Reposição necessária (estoque ≤ 5)
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className="text-xs font-semibold text-[#1F6E43] hover:underline cursor-pointer"
                >
                  Gerenciar estoque
                </button>
              </div>
              {lowStockProducts.length === 0 ? (
                <p className="text-sm text-[#526057] py-6">
                  Todos os produtos ativos estão com estoque confortável.
                </p>
              ) : (
                <div className="divide-y divide-[#E4E8E0]">
                  {lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      className="py-3 flex items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-[#161E19]">{p.name}</p>
                        <p className="text-xs text-[#526057]">
                          {deptNames[p.department]} · {p.weightLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B45309] tabular-nums">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {p.stock} {p.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditProductModal(p)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#EEF3EC] text-[#143624] hover:bg-[#E1EAE0] cursor-pointer"
                        >
                          Repor
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white border border-[#E4E8E0] rounded-xl p-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B776F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar produto por nome, código EAN, unidade ou peso..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#D4DBD0] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
            >
              <option value="all">Todos os departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-[#E4E8E0] rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="border-b border-[#E4E8E0] bg-[#FAFBF8] text-xs font-semibold text-[#526057]">
                  <th className="py-3 px-4">Produto / EAN</th>
                  <th className="py-3 px-3">Unidade / Peso</th>
                  <th className="py-3 px-3">Preço (R$)</th>
                  <th className="py-3 px-3">Oferta (R$)</th>
                  <th className="py-3 px-3">Estoque</th>
                  <th className="py-3 px-3 text-center">Oferta Dia</th>
                  <th className="py-3 px-3 text-center">No Encarte</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E8E0] text-sm">
                {filteredProducts.map((product) => {
                  const draft = inlineDrafts[product.id];
                  const hasDraft = Boolean(draft);
                  return (
                    <tr key={product.id} className="hover:bg-[#FAFBF8]">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#F2F4EE] shrink-0">
                            <ProductImage
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-[#161E19]">{product.name}</p>
                            <p className="text-xs text-[#526057]">
                              {deptNames[product.department]}
                              {product.ean ? (
                                <span className="font-mono"> · EAN {product.ean}</span>
                              ) : null}
                              {product.active ? '' : ' · Oculto'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-xs text-[#435048]">
                        {product.unit} · {product.weightLabel}
                      </td>

                      <td className="py-3 px-3">
                        <input
                          type="text"
                          aria-label={`Preço de ${product.name}`}
                          value={draft ? draft.price : product.price.toFixed(2)}
                          onChange={(e) =>
                            setInlineDrafts((prev) => ({
                              ...prev,
                              [product.id]: {
                                price: e.target.value,
                                promoPrice:
                                  prev[product.id]?.promoPrice ??
                                  (product.promoPrice === null ? '' : product.promoPrice.toFixed(2)),
                                stock: prev[product.id]?.stock ?? String(product.stock),
                              },
                            }))
                          }
                          className="w-20 px-2 py-1 rounded border border-[#D4DBD0] text-xs font-mono tabular-nums"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <input
                          type="text"
                          aria-label={`Preço promocional de ${product.name}`}
                          placeholder="—"
                          value={
                            draft
                              ? draft.promoPrice
                              : product.promoPrice === null
                                ? ''
                                : product.promoPrice.toFixed(2)
                          }
                          onChange={(e) =>
                            setInlineDrafts((prev) => ({
                              ...prev,
                              [product.id]: {
                                price: prev[product.id]?.price ?? product.price.toFixed(2),
                                promoPrice: e.target.value,
                                stock: prev[product.id]?.stock ?? String(product.stock),
                              },
                            }))
                          }
                          className="w-20 px-2 py-1 rounded border border-[#D4DBD0] text-xs font-mono tabular-nums"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <input
                          type="number"
                          min={0}
                          aria-label={`Estoque de ${product.name}`}
                          value={draft ? draft.stock : String(product.stock)}
                          onChange={(e) =>
                            setInlineDrafts((prev) => ({
                              ...prev,
                              [product.id]: {
                                price: prev[product.id]?.price ?? product.price.toFixed(2),
                                promoPrice:
                                  prev[product.id]?.promoPrice ??
                                  (product.promoPrice === null ? '' : product.promoPrice.toFixed(2)),
                                stock: e.target.value,
                              },
                            }))
                          }
                          className="w-16 px-2 py-1 rounded border border-[#D4DBD0] text-xs font-mono tabular-nums"
                        />
                      </td>

                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Oferta do dia: ${product.name}`}
                          checked={product.isDailyOffer}
                          onChange={(e) =>
                            void onUpdateProduct(product.id, { isDailyOffer: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#D95D1A] cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`No encarte digital: ${product.name}`}
                          checked={product.inDigitalFlyer}
                          onChange={(e) =>
                            void onUpdateProduct(product.id, { inDigitalFlyer: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#1F6E43] cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {hasDraft && (
                            <button
                              type="button"
                              onClick={() => void handleSaveInlineRow(product)}
                              title="Salvar alterações rápidas"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] cursor-pointer"
                            >
                              <Save className="w-3 h-3" />
                              <span>Salvar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditProductModal(product)}
                            aria-label={`Editar ${product.name}`}
                            className="p-1.5 rounded-lg text-[#435048] hover:bg-[#EEF1EA] cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteProduct(product.id)}
                            aria-label={`Excluir ${product.name}`}
                            className="p-1.5 rounded-lg text-[#7A877F] hover:text-[#B91C1C] hover:bg-[#FEE2E2]/50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'novo', label: 'Novos' },
                  { id: 'separacao', label: 'Em separação' },
                  { id: 'entrega', label: 'Em entrega' },
                  { id: 'concluido', label: 'Entregues' },
                  { id: 'cancelado', label: 'Cancelados' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(opt.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    orderStatusFilter === opt.id
                      ? 'bg-[#143624] text-white'
                      : 'bg-white border border-[#E4E8E0] text-[#435048] hover:bg-[#EEF3EC]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar pedidos</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const statusMeta = ORDER_STATUS_META[order.status];
              return (
                <article
                  key={order.id}
                  className="bg-white border border-[#E4E8E0] rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E8E0] pb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-[#143624]">
                        {order.code}
                      </span>
                      <span className="text-sm font-semibold text-[#161E19]">
                        {order.customerName}
                      </span>
                      <span className="text-xs text-[#526057] font-mono">
                        {order.customerPhone}
                      </span>
                      <span className="text-xs text-[#526057]">
                        {formatOrderDate(order.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusMeta.tone}`}
                      >
                        {statusMeta.label}
                      </span>
                      <select
                        aria-label={`Alterar status do pedido ${order.code}`}
                        value={order.status}
                        onChange={(e) =>
                          void onUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                        }
                        className="px-2.5 py-1 rounded-lg border border-[#D4DBD0] text-xs font-medium bg-white"
                      >
                        <option value="novo">Novo pedido</option>
                        <option value="separacao">Em separação</option>
                        <option value="entrega">Saiu para entrega</option>
                        <option value="concluido">Entregue</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#435048]">
                    <div className="space-y-1">
                      <p className="font-semibold text-[#143624]">Itens do pedido</p>
                      <ul className="space-y-1">
                        {order.items.map((item) => (
                          <li key={item.productId} className="flex justify-between gap-2">
                            <span>
                              {item.quantity}x {item.name} ({item.weightLabel})
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatBRL(item.subtotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-1.5">
                      <p>
                        <strong className="text-[#143624]">Entrega:</strong>{' '}
                        {order.fulfillmentType === 'retirada'
                          ? 'Retirada na loja'
                          : `${order.address}${order.neighborhood ? `, ${order.neighborhood}` : ''}${
                              order.complement ? ` (${order.complement})` : ''
                            }`}
                      </p>
                      <p>
                        <strong className="text-[#143624]">Intenção de pagamento:</strong>{' '}
                        {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                        {order.paymentMethod === 'dinheiro' && order.changeFor
                          ? ` (Troco para ${order.changeFor})`
                          : ''}
                      </p>
                      {order.notes && (
                        <p>
                          <strong className="text-[#143624]">Obs:</strong> {order.notes}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-sm font-bold text-[#143624] tabular-nums">
                          Total: {formatBRL(order.total)}
                        </span>
                        <a
                          href={buildWhatsAppChatUrl(
                            order.customerPhone,
                            `Olá ${order.customerName}! Atualização do seu pedido ${order.code} no ${store.name}: status "${statusMeta.label}".`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EEF3EC] text-[#143624] hover:bg-[#E1EAE0]"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-[#1F6E43]" />
                          <span>Chamar cliente no WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingStore(true);
            try {
              await onSaveStore(storeForm);
              setStoreSavedBanner(true);
              setTimeout(() => setStoreSavedBanner(false), 3000);
            } finally {
              setSavingStore(false);
            }
          }}
          className="bg-white border border-[#E4E8E0] rounded-2xl p-6 sm:p-8 max-w-3xl space-y-6"
        >
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-[#143624]">
              Identidade, Pagamentos &amp; Encarte Digital
            </h2>
            <p className="text-xs text-[#526057]">
              Alterações salvas aqui atualizam imediatamente a vitrine, o checkout de pagamento e o
              tabloide digital.
            </p>
          </div>

          {storeSavedBanner && (
            <div className="bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] rounded-xl px-4 py-3 text-xs font-semibold">
              Configurações da loja atualizadas com sucesso.
            </div>
          )}

          <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#143624] border border-[#D4DBD0] shrink-0">
              <ProductImage
                src={storeForm.logoUrl || DEFAULT_LOGO_URL}
                alt="Prévia da logo do mercado"
                className={`w-full h-full object-cover ${
                  (storeForm.logoUrl || DEFAULT_LOGO_URL) === DEFAULT_LOGO_URL ? 'scale-[1.04]' : ''
                }`}
              />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-semibold text-[#143624]">
                Logo do mercado (cabeçalho e encarte digital)
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="url"
                  value={storeForm.logoUrl || ''}
                  onChange={(e) => setStoreForm({ ...storeForm, logoUrl: e.target.value })}
                  placeholder="Cole a URL da imagem da logo..."
                  className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-[#D4DBD0] bg-white text-xs"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Enviar imagem</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        const dataUrl = await compressUploadedImage(file);
                        setStoreForm((prev) => ({ ...prev, logoUrl: dataUrl }));
                      } catch {
                        // Ignore invalid file
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setStoreForm({ ...storeForm, logoUrl: DEFAULT_LOGO_URL })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#435048] hover:bg-[#EEF1EA] cursor-pointer"
                >
                  Restaurar padrão
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Nome do mercado
              </label>
              <input
                type="text"
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">
                WhatsApp da loja (DDI + DDD + número)
              </label>
              <input
                type="text"
                value={storeForm.whatsappNumber}
                onChange={(e) => setStoreForm({ ...storeForm, whatsappNumber: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Horário de funcionamento
              </label>
              <input
                type="text"
                value={storeForm.openingHours}
                onChange={(e) => setStoreForm({ ...storeForm, openingHours: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">Endereço</label>
              <input
                type="text"
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">Bairro</label>
              <input
                type="text"
                value={storeForm.neighborhood}
                onChange={(e) => setStoreForm({ ...storeForm, neighborhood: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Taxa de entrega padrão (R$)
              </label>
              <input
                type="number"
                step="0.10"
                min={0}
                value={storeForm.deliveryFee}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, deliveryFee: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Frete grátis a partir de (R$)
              </label>
              <input
                type="number"
                step="1"
                min={0}
                value={storeForm.freeDeliveryThreshold}
                onChange={(e) =>
                  setStoreForm({
                    ...storeForm,
                    freeDeliveryThreshold: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2 pt-3 border-t border-[#E4E8E0] space-y-3">
              <p className="text-xs font-semibold text-[#143624]">
                Intenções de pagamento aceitas pela loja no checkout
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {(['pix', 'cartao_link', 'cartao', 'dinheiro'] as PaymentMethod[]).map((method) => {
                  const checked = (storeForm.acceptedPayments || []).includes(method);
                  return (
                    <label
                      key={method}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-[#E4E8E0] bg-[#FAFBF8] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAcceptedPayment(method)}
                        className="w-4 h-4 accent-[#1F6E43]"
                      />
                      <span className="font-medium text-[#161E19]">
                        {PAYMENT_METHOD_LABELS[method]}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Chave Pix da loja
                  </label>
                  <input
                    type="text"
                    value={storeForm.pixKey || ''}
                    onChange={(e) => setStoreForm({ ...storeForm, pixKey: e.target.value })}
                    placeholder="CPF, CNPJ, celular ou e-mail Pix"
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Orientação para Link de Cartão Online
                  </label>
                  <input
                    type="text"
                    value={storeForm.paymentLinkInfo || ''}
                    onChange={(e) =>
                      setStoreForm({ ...storeForm, paymentLinkInfo: e.target.value })
                    }
                    placeholder="Ex: Enviamos o link pelo WhatsApp após confirmar."
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 pt-3 border-t border-[#E4E8E0]">
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Título do Cartaz Digital (Encarte)
              </label>
              <input
                type="text"
                value={storeForm.flyerTitle}
                onChange={(e) => setStoreForm({ ...storeForm, flyerTitle: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#435048] mb-1">
                Validade e observações do encarte
              </label>
              <input
                type="text"
                value={storeForm.flyerValidity}
                onChange={(e) => setStoreForm({ ...storeForm, flyerValidity: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D4DBD0] text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingStore}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingStore ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingProduct ? 'Editar produto' : 'Cadastrar produto'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E4E8E0] rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E4E8E0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#143624]">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#526057] hover:bg-[#EEF1EA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="space-y-4">
              <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-xl p-3.5 space-y-2.5">
                <label className="block text-xs font-semibold text-[#143624]">
                  Código de Barras (EAN) — leitura direta no produto físico
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.ean}
                    onChange={(e) => setForm({ ...form, ean: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void lookupEanCode(form.ean);
                      }
                    }}
                    placeholder="Escaneie ou digite o EAN (ex: 7891000100103)"
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-[#D4DBD0] bg-white text-sm font-mono"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setScannerMode('modal');
                      setScannerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#D95D1A] text-white hover:bg-[#B84A10] cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Ler Câmera</span>
                  </button>

                  <button
                    type="button"
                    disabled={eanLoading || !form.ean.trim()}
                    onClick={() => void lookupEanCode(form.ean)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] disabled:opacity-50 cursor-pointer"
                  >
                    {eanLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ScanBarcode className="w-3.5 h-3.5" />
                    )}
                    <span>Buscar EAN</span>
                  </button>
                </div>
                {eanFeedback && <p className="text-xs text-[#435048]">{eanFeedback}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#435048] mb-1">
                  Nome do produto *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Leite Integral Parmalat 1L"
                  className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Departamento
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Unidade de venda
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm bg-white"
                  >
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Peso / Medida *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.weightLabel}
                    onChange={(e) => setForm({ ...form, weightLabel: e.target.value })}
                    placeholder="Ex: 500 g, 1 L, 1 kg"
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Preço normal (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="9.90"
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Preço oferta (R$)
                  </label>
                  <input
                    type="text"
                    value={form.promoPrice}
                    onChange={(e) => setForm({ ...form, promoPrice: e.target.value })}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#435048] mb-1">
                    Qtd. em estoque *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#435048] mb-1">
                  Descrição curta
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalhes de frescor, marca ou preparo..."
                  className="w-full px-3 py-2 rounded-lg border border-[#D4DBD0] text-sm"
                />
              </div>

              <div className="bg-[#FAFBF8] border border-[#E4E8E0] rounded-xl p-3.5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-white border border-[#D4DBD0] shrink-0">
                    <ProductImage
                      src={form.imageUrl}
                      alt={form.name || 'Prévia do produto'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-semibold text-[#143624]">
                      Imagem do produto (PNG automática, câmera ou galeria)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={imgQuery}
                        onChange={(e) => setImgQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSearchImages();
                          }
                        }}
                        placeholder={form.name || 'Ex: h2o 1.5 L, tomate, coca cola...'}
                        className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border border-[#D4DBD0] bg-white text-xs"
                      />

                      <button
                        type="button"
                        disabled={imgLoading}
                        onClick={() => void handleSearchImages()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] disabled:opacity-50 cursor-pointer"
                      >
                        {imgLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>Buscar imagem (PNG)</span>
                      </button>

                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] cursor-pointer">
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>Enviar Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => void handleLocalImageUpload(e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {imgFeedback && <p className="text-xs text-[#435048]">{imgFeedback}</p>}
                  </div>
                </div>

                {imgResults.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1">
                    {imgResults.slice(0, 12).map((cand) => {
                      const selected = form.imageUrl === cand.url;
                      return (
                        <button
                          key={cand.url}
                          type="button"
                          onClick={() => setForm({ ...form, imageUrl: cand.url })}
                          className={`group rounded-lg overflow-hidden border p-1 bg-white text-left cursor-pointer ${
                            selected
                              ? 'border-[#1F6E43] ring-2 ring-[#1F6E43]/30'
                              : 'border-[#E4E8E0] hover:border-[#1F6E43]/50'
                          }`}
                        >
                          <div className="aspect-square bg-[#F2F4EE] rounded overflow-hidden">
                            <ProductImage
                              src={cand.url}
                              alt={cand.title}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <p className="text-[10px] text-[#526057] truncate mt-1">
                            {cand.format} · {cand.source}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-[#526057]">
                    Ou escolha uma foto padrão do mercado:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_GALLERY.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: preset.url })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                          form.imageUrl === preset.url
                            ? 'bg-[#143624] text-white border-[#143624]'
                            : 'bg-white text-[#435048] border-[#D4DBD0] hover:bg-[#EEF3EC]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-5 pt-1 text-xs font-medium text-[#161E19]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDailyOffer}
                    onChange={(e) => setForm({ ...form, isDailyOffer: e.target.checked })}
                    className="w-4 h-4 accent-[#D95D1A]"
                  />
                  <span>Destacar como Oferta do Dia</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.inDigitalFlyer}
                    onChange={(e) => setForm({ ...form, inDigitalFlyer: e.target.checked })}
                    className="w-4 h-4 accent-[#1F6E43]"
                  />
                  <span>Exibir no Encarte Digital</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 accent-[#143624]"
                  />
                  <span>Produto visível no catálogo</span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E4E8E0]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#435048] hover:bg-[#EEF1EA] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] disabled:opacity-50 cursor-pointer"
                >
                  {savingProduct
                    ? 'Salvando...'
                    : editingProduct
                      ? 'Salvar alterações'
                      : 'Cadastrar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleBarcodeDetected(code)}
      />
    </div>
  );
};
