import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Lock, LogIn, MessageCircle, ShieldAlert, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AdminView } from './components/AdminView';
import { CartDrawer } from './components/CartDrawer';
import { CatalogView } from './components/CatalogView';
import { FlyerView } from './components/FlyerView';
import { Logo } from './components/Logo';
import { OrdersView } from './components/OrdersView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import {
  INITIAL_DEPARTMENTS,
  INITIAL_STORE,
  computeAnalytics,
  createInitialProducts,
} from './data/seed';
import { auth, googleProvider } from './firebase';
import {
  ADMIN_EMAIL,
  type StoredCustomerOrderRef,
  checkUserIsAdmin,
  createProduct,
  deleteProduct,
  ensureFirestoreSeeded,
  subscribeAdminOrders,
  subscribeCustomerOrders,
  subscribeProducts,
  subscribeStoreConfig,
  updateOrderStatus,
  updateProduct,
  updateStoreConfig,
} from './services/api';
import type {
  AppView,
  CatalogFilter,
  Department,
  Order,
  Product,
  StoreConfig,
} from './types';
import { buildWhatsAppChatUrl, formatBRL } from './utils/format';

const CART_STORAGE_KEY = 'hortimarket_cart_v1';
const MY_ORDERS_KEY = 'hortimarket_my_orders_v2';

function checkAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    params.get('admin') === '1' ||
    params.get('admin') === 'true' ||
    hash === '#admin'
  );
}

function loadStoredOrderRefs(): StoredCustomerOrderRef[] {
  try {
    const saved = localStorage.getItem(MY_ORDERS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredCustomerOrderRef =>
        Boolean(item && typeof item.id === 'string' && typeof item.code === 'string')
    );
  } catch {
    return [];
  }
}

export default function App() {
  const [adminEnabled, setAdminEnabled] = useState<boolean>(() => checkAdminRoute());
  const [view, setView] = useState<AppView>(() => (checkAdminRoute() ? 'admin' : 'catalogo'));
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
  const [cartOpen, setCartOpen] = useState(false);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecking, setAdminChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const syncRoute = () => {
      const nextAdmin = checkAdminRoute();
      setAdminEnabled(nextAdmin);
      setView((prev) => {
        if (nextAdmin && prev !== 'admin') return 'admin';
        if (!nextAdmin && prev === 'admin') return 'catalogo';
        return prev;
      });
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }
      setAdminChecking(true);
      try {
        const ok = await checkUserIsAdmin(user);
        setIsAdmin(ok);
      } finally {
        setAdminChecking(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const [store, setStore] = useState<StoreConfig>(INITIAL_STORE);
  const [isDbSeeded, setIsDbSeeded] = useState(false);
  const [departments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [products, setProducts] = useState<Product[]>(createInitialProducts);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const [myOrderRefs, setMyOrderRefs] = useState<StoredCustomerOrderRef[]>(loadStoredOrderRefs);

  const myOrderCodes = useMemo(() => myOrderRefs.map((r) => r.code), [myOrderRefs]);

  useEffect(() => {
    const unsubStore = subscribeStoreConfig((nextStore, existsInDb) => {
      setStore(nextStore);
      setIsDbSeeded(existsInDb);
      setLoading(false);
    });
    return () => unsubStore();
  }, []);

  useEffect(() => {
    const unsubProducts = subscribeProducts(isDbSeeded, (nextProducts) => {
      setProducts(nextProducts);
    });
    return () => unsubProducts();
  }, [isDbSeeded]);

  useEffect(() => {
    if (!authReady || !adminEnabled || !isAdmin) return;
    void ensureFirestoreSeeded();
    const unsubOrders = subscribeAdminOrders((nextOrders) => {
      setOrders(nextOrders);
    });
    return () => unsubOrders();
  }, [authReady, adminEnabled, isAdmin]);

  useEffect(() => {
    if (!authReady || (adminEnabled && isAdmin)) return;
    const unsubCustomerOrders = subscribeCustomerOrders(myOrderRefs, (nextOrders) => {
      setOrders(nextOrders);
    });
    return () => unsubCustomerOrders();
  }, [authReady, adminEnabled, isAdmin, myOrderRefs]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage errors
    }
  }, [cart]);

  const analytics = useMemo(() => computeAnalytics(products, orders), [products, orders]);

  const cartSummary = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const product = products.find((p) => p.id === id);
      if (!product || qty <= 0) continue;
      count += qty;
      total += (product.promoPrice ?? product.price) * qty;
    }
    return { count, total };
  }, [cart, products]);

  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const current = prev[product.id] || 0;
      if (current >= product.stock) return prev;
      return { ...prev, [product.id]: current + 1 };
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    setCart((prev) => {
      const nextQty = (prev[productId] || 0) + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      if (product && nextQty > product.stock) return prev;
      return { ...prev, [productId]: nextQty };
    });
  };

  const handleAdminGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao autenticar com o Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Não foi possível entrar com o Google. Libere pop-ups e tente novamente.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleAdminSignOut = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBF8] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Logo logoUrl={store.logoUrl} />
          <p className="text-sm text-[#526057]">Carregando Hortimarket Delivery...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFBF8] text-[#161E19]">
      <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#E4E8E0]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => {
              setView('catalogo');
              setCatalogFilter('all');
            }}
            className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6E43] rounded-lg cursor-pointer"
          >
            <Logo logoUrl={store.logoUrl} />
          </button>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#435048]"
          >
            <button
              type="button"
              onClick={() => {
                setView('catalogo');
                setCatalogFilter('all');
              }}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                view === 'catalogo' && catalogFilter !== 'ofertas'
                  ? 'text-[#143624] font-semibold border-b-2 border-[#1F6E43]'
                  : 'hover:text-[#143624]'
              }`}
            >
              Catálogo
            </button>

            <button
              type="button"
              onClick={() => {
                setView('catalogo');
                setCatalogFilter('ofertas');
                setTimeout(() => {
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }, 40);
              }}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                view === 'catalogo' && catalogFilter === 'ofertas'
                  ? 'text-[#D95D1A] font-semibold border-b-2 border-[#D95D1A]'
                  : 'hover:text-[#D95D1A]'
              }`}
            >
              Ofertas do Dia
            </button>

            <button
              type="button"
              onClick={() => setView('encarte')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                view === 'encarte'
                  ? 'text-[#143624] font-semibold border-b-2 border-[#1F6E43]'
                  : 'hover:text-[#143624]'
              }`}
            >
              Encarte Digital
            </button>

            <button
              type="button"
              onClick={() => setView('pedidos')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                view === 'pedidos'
                  ? 'text-[#143624] font-semibold border-b-2 border-[#1F6E43]'
                  : 'hover:text-[#143624]'
              }`}
            >
              Meus Pedidos
            </button>

            {adminEnabled && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                  view === 'admin'
                    ? 'text-[#143624] font-semibold border-b-2 border-[#1F6E43]'
                    : 'hover:text-[#143624]'
                }`}
              >
                Painel Admin
              </button>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="tabular-nums">
              {cartSummary.count > 0
                ? `Sacola (${cartSummary.count}) · ${formatBRL(cartSummary.total)}`
                : 'Sacola (0)'}
            </span>
          </button>
        </div>
      </header>

      <div className="no-print md:hidden bg-white border-b border-[#E4E8E0] px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setView('catalogo');
            setCatalogFilter('all');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
            view === 'catalogo' && catalogFilter !== 'ofertas'
              ? 'bg-[#143624] text-white'
              : 'text-[#435048]'
          }`}
        >
          Catálogo
        </button>

        <button
          type="button"
          onClick={() => {
            setView('catalogo');
            setCatalogFilter('ofertas');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
            view === 'catalogo' && catalogFilter === 'ofertas'
              ? 'bg-[#D95D1A] text-white'
              : 'text-[#C2410C]'
          }`}
        >
          Ofertas do Dia
        </button>

        <button
          type="button"
          onClick={() => setView('encarte')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
            view === 'encarte' ? 'bg-[#143624] text-white' : 'text-[#435048]'
          }`}
        >
          Encarte Digital
        </button>

        <button
          type="button"
          onClick={() => setView('pedidos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
            view === 'pedidos' ? 'bg-[#143624] text-white' : 'text-[#435048]'
          }`}
        >
          Pedidos
        </button>

        {adminEnabled && (
          <button
            type="button"
            onClick={() => setView('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
              view === 'admin' ? 'bg-[#143624] text-white' : 'text-[#435048]'
            }`}
          >
            Admin
          </button>
        )}
      </div>

      <main className="flex-1">
        {view === 'catalogo' && (
          <CatalogView
            store={store}
            departments={departments}
            products={products}
            cart={cart}
            activeFilter={catalogFilter}
            onFilterChange={setCatalogFilter}
            onAddToCart={handleAddToCart}
            onUpdateQty={handleUpdateQty}
            onOpenFlyer={() => setView('encarte')}
          />
        )}

        {view === 'encarte' && (
          <FlyerView
            store={store}
            products={products}
            cart={cart}
            onAddToCart={handleAddToCart}
            onUpdateQty={handleUpdateQty}
            onBackToCatalog={() => setView('catalogo')}
          />
        )}

        {view === 'pedidos' && (
          <OrdersView
            store={store}
            orders={orders}
            myOrderCodes={myOrderCodes}
            onRefresh={() => setMyOrderRefs([...myOrderRefs])}
            onGoToCatalog={() => setView('catalogo')}
          />
        )}

        {adminEnabled && view === 'admin' && (
          <>
            {!authReady || adminChecking ? (
              <div className="max-w-md mx-auto my-16 px-4 text-center space-y-3">
                <p className="text-sm text-[#526057]">Verificando acesso administrativo...</p>
              </div>
            ) : !authUser ? (
              <div className="max-w-md mx-auto my-12 px-4">
                <div className="bg-white border border-[#E4E8E0] rounded-2xl p-6 sm:p-8 text-center space-y-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#EEF3EC] text-[#143624] flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h1 className="font-display text-xl font-bold text-[#143624]">
                      Painel Administrativo
                    </h1>
                    <p className="text-xs text-[#526057] leading-relaxed">
                      Faça login com a conta Google autorizada da loja ({ADMIN_EMAIL}) para
                      receber pedidos em tempo real e gerenciar produtos.
                    </p>
                  </div>
                  {authError && (
                    <p className="text-xs font-semibold text-[#B91C1C] bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-3 py-2">
                      {authError}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => void handleAdminGoogleLogin()}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{signingIn ? 'Conectando...' : 'Entrar com Google'}</span>
                  </button>
                </div>
              </div>
            ) : !isAdmin ? (
              <div className="max-w-md mx-auto my-12 px-4">
                <div className="bg-white border border-[#E4E8E0] rounded-2xl p-6 sm:p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h1 className="font-display text-xl font-bold text-[#143624]">
                      Acesso não autorizado
                    </h1>
                    <p className="text-xs text-[#526057] leading-relaxed">
                      A conta <strong className="text-[#143624]">{authUser.email}</strong> não
                      possui permissão administrativa. Entre com{' '}
                      <strong className="text-[#143624]">{ADMIN_EMAIL}</strong>.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await handleAdminSignOut();
                        await handleAdminGoogleLogin();
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors cursor-pointer"
                    >
                      Trocar conta Google
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('catalogo')}
                      className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-white border border-[#D4DBD0] text-[#435048] hover:bg-[#EEF3EC] transition-colors cursor-pointer"
                    >
                      Voltar para loja
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <AdminView
                store={store}
                departments={departments}
                products={products}
                orders={orders}
                analytics={analytics}
                onSaveStore={async (patch) => {
                  const updated = await updateStoreConfig(store, patch);
                  setStore(updated);
                }}
                onCreateProduct={async (input) => {
                  await createProduct(input);
                }}
                onUpdateProduct={async (id, patch) => {
                  const current = products.find((p) => p.id === id);
                  if (current) {
                    await updateProduct(current, patch);
                  }
                }}
                onDeleteProduct={async (id) => {
                  await deleteProduct(id);
                  setCart((prev) => {
                    const copy = { ...prev };
                    delete copy[id];
                    return copy;
                  });
                }}
                onUpdateOrderStatus={async (orderId, status) => {
                  await updateOrderStatus(orderId, status);
                }}
                onSignOut={() => void handleAdminSignOut()}
              />
            )}
          </>
        )}
      </main>

      <footer className="no-print border-t border-[#E4E8E0] bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 sm:pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#526057]">
          <div className="space-y-1.5">
            <Logo size="sm" logoUrl={store.logoUrl} />
            <p className="font-semibold text-[#143624]">{store.name}</p>
            <p>
              {store.address} · {store.neighborhood} · {store.openingHours}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setView('encarte')}
              className="hover:text-[#143624] cursor-pointer"
            >
              Cartaz Digital
            </button>
            <button
              type="button"
              onClick={() => setView('pedidos')}
              className="hover:text-[#143624] cursor-pointer"
            >
              Acompanhar Pedidos
            </button>
            {adminEnabled && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className="hover:text-[#143624] cursor-pointer"
              >
                Acesso Administrativo
              </button>
            )}
            <PWAInstallButton variant="subtle" />
          </div>
        </div>
      </footer>

      {!adminEnabled && view !== 'admin' && (
        <a
          href={buildWhatsAppChatUrl(
            store.whatsappNumber,
            `Olá! Estou no ${store.name} e gostaria de falar com um atendente para tirar uma dúvida.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar com Atendente pelo WhatsApp"
          className="no-print fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold bg-[#1F6E43] text-white shadow-lg hover:bg-[#143624] transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6E43] focus-visible:ring-offset-2"
        >
          <MessageCircle className="w-4 h-4 shrink-0" />
          <span>Falar com Atendente</span>
        </a>
      )}

      <OfflineIndicator />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        store={store}
        products={products}
        cart={cart}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={(productId) =>
          setCart((prev) => {
            const copy = { ...prev };
            delete copy[productId];
            return copy;
          })
        }
        onOrderCreated={(createdOrder) => {
          setCart({});
          const nextRefs: StoredCustomerOrderRef[] = [
            { id: createdOrder.id, code: createdOrder.code, receipt: createdOrder },
            ...myOrderRefs.filter((r) => r.id !== createdOrder.id),
          ];
          setMyOrderRefs(nextRefs);
          try {
            localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(nextRefs));
          } catch {
            // Ignore storage errors
          }
        }}
      />
    </div>
  );
}
