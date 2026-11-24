import {
  INITIAL_DEPARTMENTS,
  INITIAL_STORE,
  computeAnalytics,
  createInitialOrders,
  createInitialProducts,
  normalizeLogoUrl,
} from '../data/seed';
import type {
  AnalyticsSummary,
  CreateOrderPayload,
  Department,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductInput,
  StoreConfig,
} from '../types';

const STORE_KEY = 'hm_local_store_v1';
const PRODUCTS_KEY = 'hm_local_products_v1';
const ORDERS_KEY = 'hm_local_orders_v1';
const NEXT_ORDER_KEY = 'hm_local_next_order_v1';

function notifyOrdersUpdated(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('hortimarket_sync');
      bc.postMessage({ type: 'orders-updated', at: Date.now() });
      bc.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function readLocal<T>(key: string, fallbackFactory: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const value = fallbackFactory();
      localStorage.setItem(key, JSON.stringify(value));
      return value;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallbackFactory();
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export interface BootstrapData {
  store: StoreConfig;
  departments: Department[];
  products: Product[];
  orders: Order[];
  analytics: AnalyticsSummary;
}

export interface BootstrapOptions {
  admin?: boolean;
  myOrderCodes?: string[];
}

export async function fetchBootstrapData(options?: BootstrapOptions): Promise<BootstrapData> {
  const isAdmin = Boolean(options?.admin);
  const myCodes = (options?.myOrderCodes || []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const ordersUrl = isAdmin
    ? '/api/orders'
    : `/api/orders?scope=customer&codes=${encodeURIComponent(myCodes.join(','))}`;

  const [storeRes, productsRes, ordersRes, analyticsRes] = await Promise.all([
    fetchJson<{ store: StoreConfig; departments?: Department[] }>('/api/store'),
    fetchJson<{ products: Product[] }>('/api/products'),
    fetchJson<{ orders: Order[] }>(ordersUrl),
    isAdmin ? fetchJson<{ analytics: AnalyticsSummary }>('/api/analytics') : Promise.resolve(null),
  ]);

  if (storeRes?.store && productsRes?.products && ordersRes?.orders) {
    const mergedStore: StoreConfig = {
      ...INITIAL_STORE,
      ...storeRes.store,
      logoUrl: normalizeLogoUrl(storeRes.store.logoUrl),
    };
    writeLocal(STORE_KEY, mergedStore);
    writeLocal(PRODUCTS_KEY, productsRes.products);
    if (isAdmin) {
      writeLocal(ORDERS_KEY, ordersRes.orders);
    }
    return {
      store: mergedStore,
      departments: storeRes.departments || INITIAL_DEPARTMENTS,
      products: productsRes.products,
      orders: ordersRes.orders,
      analytics:
        analyticsRes?.analytics || computeAnalytics(productsRes.products, ordersRes.orders),
    };
  }

  const rawLocalStore = readLocal(STORE_KEY, () => INITIAL_STORE);
  const store: StoreConfig = {
    ...INITIAL_STORE,
    ...rawLocalStore,
    logoUrl: normalizeLogoUrl(rawLocalStore.logoUrl),
  };
  writeLocal(STORE_KEY, store);
  const products = readLocal(PRODUCTS_KEY, createInitialProducts);
  const allOrders = readLocal(ORDERS_KEY, createInitialOrders);
  const visibleOrders = isAdmin
    ? allOrders
    : allOrders.filter((o) => myCodes.includes(o.code.toUpperCase()));
  return {
    store,
    departments: INITIAL_DEPARTMENTS,
    products,
    orders: visibleOrders,
    analytics: computeAnalytics(products, visibleOrders),
  };
}

export async function updateStoreConfig(patch: Partial<StoreConfig>): Promise<StoreConfig> {
  const res = await fetchJson<{ store: StoreConfig }>('/api/store', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res?.store) {
    writeLocal(STORE_KEY, res.store);
    return res.store;
  }
  const updated = { ...readLocal(STORE_KEY, () => INITIAL_STORE), ...patch };
  writeLocal(STORE_KEY, updated);
  return updated;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const res = await fetchJson<{ product: Product }>('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res?.product) return res.product;

  const current = readLocal(PRODUCTS_KEY, createInitialProducts);
  const created: Product = {
    ...input,
    id: `hm-${Date.now().toString(36)}`,
    updatedAt: new Date().toISOString(),
  };
  writeLocal(PRODUCTS_KEY, [created, ...current]);
  return created;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product | null> {
  const res = await fetchJson<{ product: Product }>(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res?.product) return res.product;

  const current = readLocal(PRODUCTS_KEY, createInitialProducts);
  const idx = current.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: Product = {
    ...current[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  current[idx] = updated;
  writeLocal(PRODUCTS_KEY, current);
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await fetchJson<{ deletedId: string }>(`/api/products/${id}`, {
    method: 'DELETE',
  });
  if (!res?.deletedId) {
    const current = readLocal(PRODUCTS_KEY, createInitialProducts);
    writeLocal(
      PRODUCTS_KEY,
      current.filter((p) => p.id !== id)
    );
  }
}

export async function createOrder(
  payload: CreateOrderPayload
): Promise<{ order?: Order; error?: string }> {
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.order) {
        const created = data.order as Order;
        const localOrders = readLocal(ORDERS_KEY, createInitialOrders);
        writeLocal(ORDERS_KEY, [created, ...localOrders.filter((o) => o.id !== created.id)]);
        notifyOrdersUpdated();
        return { order: created };
      }
      if (!res.ok) return { error: data.error || 'Não foi possível registrar seu pedido.' };
    }
  } catch {
    // Fallback to local mode
  }

  const store = readLocal(STORE_KEY, () => INITIAL_STORE);
  const products = readLocal(PRODUCTS_KEY, createInitialProducts);
  const orders = readLocal(ORDERS_KEY, createInitialOrders);

  if (!payload.customerName.trim() || !payload.customerPhone.trim()) {
    return { error: 'Informe seu nome e telefone/WhatsApp.' };
  }
  if (payload.fulfillmentType === 'delivery' && !payload.address.trim()) {
    return { error: 'Informe o endereço completo para entrega.' };
  }

  const items: OrderItem[] = [];
  for (const itemReq of payload.items) {
    const product = products.find((p) => p.id === itemReq.productId && p.active);
    if (!product) {
      return { error: 'Um dos produtos selecionados não está mais disponível.' };
    }
    const qty = Math.max(1, Math.floor(itemReq.quantity));
    if (product.stock < qty) {
      return { error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.` };
    }
    const unitPrice = product.promoPrice ?? product.price;
    items.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      weightLabel: product.weightLabel,
      unitPrice,
      quantity: qty,
      subtotal: Number((unitPrice * qty).toFixed(2)),
    });
  }

  const now = new Date().toISOString();
  for (const item of items) {
    const prod = products.find((p) => p.id === item.productId);
    if (prod) {
      prod.stock = Math.max(0, prod.stock - item.quantity);
      prod.updatedAt = now;
    }
  }

  const subtotal = Number(items.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));
  const deliveryFee =
    payload.fulfillmentType === 'retirada' || subtotal >= store.freeDeliveryThreshold
      ? 0
      : store.deliveryFee;
  const total = Number((subtotal + deliveryFee).toFixed(2));
  const nextNum = readLocal(NEXT_ORDER_KEY, () => 1003);
  writeLocal(NEXT_ORDER_KEY, nextNum + 1);

  const createdOrder: Order = {
    id: `ord-${nextNum}`,
    code: `HM-${nextNum}`,
    customerName: payload.customerName.trim(),
    customerPhone: payload.customerPhone.trim(),
    fulfillmentType: payload.fulfillmentType,
    address: payload.fulfillmentType === 'delivery' ? payload.address.trim() : 'Retirada na loja',
    neighborhood:
      payload.fulfillmentType === 'delivery' ? payload.neighborhood.trim() : store.neighborhood,
    complement: payload.complement.trim(),
    paymentMethod: payload.paymentMethod,
    changeFor: payload.changeFor.trim(),
    notes: payload.notes.trim(),
    items,
    subtotal,
    deliveryFee,
    total,
    status: 'novo',
    createdAt: now,
    updatedAt: now,
  };

  writeLocal(PRODUCTS_KEY, products);
  writeLocal(ORDERS_KEY, [createdOrder, ...orders]);
  notifyOrdersUpdated();
  return { order: createdOrder };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const res = await fetchJson<{ order: Order }>(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (res?.order) return;

  const orders = readLocal(ORDERS_KEY, createInitialOrders);
  const found = orders.find((o) => o.id === orderId);
  if (found) {
    found.status = status;
    found.updatedAt = new Date().toISOString();
    writeLocal(ORDERS_KEY, orders);
  }
}
