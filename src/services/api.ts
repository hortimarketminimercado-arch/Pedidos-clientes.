import { type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  INITIAL_STORE,
  createInitialProducts,
  normalizeLogoUrl,
} from '../data/seed';
import { OperationType, db, handleFirestoreError } from '../firebase';
import type {
  CreateOrderPayload,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductInput,
  StoreConfig,
} from '../types';

export const ADMIN_EMAIL = 'hortimarketminimercado@gmail.com';
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_PAYMENTS: PaymentMethod[] = ['pix', 'cartao_link', 'cartao', 'dinheiro'];

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value) {
    return value;
  }
  return new Date().toISOString();
}

function clampStr(value: string | undefined, maxLen: number): string {
  return String(value ?? '').trim().slice(0, maxLen);
}

function sanitizePhone(value: string | undefined): string {
  const cleaned = String(value ?? '')
    .replace(/[^0-9+()\-\s]/g, '')
    .trim()
    .slice(0, 25);
  return cleaned.length >= 8 ? cleaned : INITIAL_STORE.whatsappNumber;
}

function sanitizeStorePayload(store: StoreConfig) {
  const acceptedPayments = (store.acceptedPayments || ['pix', 'cartao_link'])
    .filter((m): m is PaymentMethod => VALID_PAYMENTS.includes(m))
    .slice(0, 4);

  return {
    name: clampStr(store.name, 120) || INITIAL_STORE.name,
    tagline: clampStr(store.tagline, 240),
    whatsappNumber: sanitizePhone(store.whatsappNumber),
    isOpen: Boolean(store.isOpen),
    openingHours: clampStr(store.openingHours, 160),
    address: clampStr(store.address, 200),
    neighborhood: clampStr(store.neighborhood, 120),
    deliveryFee: Math.min(1000, Math.max(0, Number(store.deliveryFee) || 0)),
    freeDeliveryThreshold: Math.min(10000, Math.max(0, Number(store.freeDeliveryThreshold) || 0)),
    flyerTitle: clampStr(store.flyerTitle, 160),
    flyerValidity: clampStr(store.flyerValidity, 240),
    flyerSubtitle: clampStr(store.flyerSubtitle, 240),
    acceptedPayments: acceptedPayments.length > 0 ? acceptedPayments : ['pix'],
    pixKey: clampStr(store.pixKey, 140),
    paymentLinkInfo: clampStr(store.paymentLinkInfo, 300),
    logoUrl: String(normalizeLogoUrl(store.logoUrl)).slice(0, 300000),
    updatedAt: serverTimestamp(),
  };
}

function sanitizeProductPayload(input: ProductInput) {
  const ean = clampStr(input.ean, 32);
  const price = Math.min(100000, Math.max(0.01, Number(input.price) || 0.01));
  const rawPromo = input.promoPrice;
  const promoPrice =
    typeof rawPromo === 'number' && !Number.isNaN(rawPromo) && rawPromo > 0
      ? Math.min(100000, rawPromo)
      : null;

  const base: Record<string, unknown> = {
    name: clampStr(input.name, 140) || 'Produto',
    description: clampStr(input.description, 500),
    department: clampStr(input.department, 60) || 'mercearia',
    unit: clampStr(input.unit, 30) || 'un',
    weightLabel: clampStr(input.weightLabel, 60) || '1 unidade',
    price,
    promoPrice,
    stock: Math.min(1000000, Math.max(0, Math.floor(Number(input.stock) || 0))),
    imageUrl: String(input.imageUrl || '').trim().slice(0, 300000),
    isDailyOffer: Boolean(input.isDailyOffer),
    inDigitalFlyer: Boolean(input.inDigitalFlyer),
    active: Boolean(input.active),
    updatedAt: serverTimestamp(),
  };

  if (ean) {
    base.ean = ean;
  }

  return base;
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === ADMIN_EMAIL) return true;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export async function ensureFirestoreSeeded(): Promise<void> {
  const storeRef = doc(db, 'storeConfig', 'main');
  try {
    const storeSnap = await getDoc(storeRef);
    if (!storeSnap.exists()) {
      await setDoc(storeRef, sanitizeStorePayload(INITIAL_STORE));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'storeConfig/main');
  }

  try {
    const prodSnap = await getDocs(query(collection(db, 'products'), limit(1)));
    if (prodSnap.empty) {
      const batch = writeBatch(db);
      for (const product of createInitialProducts()) {
        const ref = doc(db, 'products', product.id);
        batch.set(ref, sanitizeProductPayload(product));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

export function subscribeStoreConfig(
  onStore: (store: StoreConfig, existsInDb: boolean) => void
): () => void {
  const ref = doc(db, 'storeConfig', 'main');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onStore(INITIAL_STORE, false);
        return;
      }
      const data = snap.data() as Partial<StoreConfig>;
      onStore(
        {
          ...INITIAL_STORE,
          ...data,
          logoUrl: normalizeLogoUrl(data.logoUrl),
        },
        true
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'storeConfig/main');
    }
  );
}

export function subscribeProducts(
  isDbSeeded: boolean,
  onProducts: (products: Product[]) => void
): () => void {
  const colRef = collection(db, 'products');
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty && !isDbSeeded) {
        onProducts(createInitialProducts());
        return;
      }
      const items: Product[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          ean: typeof data.ean === 'string' ? data.ean : undefined,
          name: String(data.name ?? ''),
          description: String(data.description ?? ''),
          department: String(data.department ?? 'mercearia'),
          unit: String(data.unit ?? 'un'),
          weightLabel: String(data.weightLabel ?? ''),
          price: Number(data.price ?? 0),
          promoPrice: typeof data.promoPrice === 'number' ? data.promoPrice : null,
          stock: Number(data.stock ?? 0),
          imageUrl: String(data.imageUrl ?? ''),
          isDailyOffer: Boolean(data.isDailyOffer),
          inDigitalFlyer: Boolean(data.inDigitalFlyer),
          active: data.active !== false,
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onProducts(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    }
  );
}

export function subscribeAdminOrders(onOrders: (orders: Order[]) => void): () => void {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const orders: Order[] = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          code: String(data.code ?? d.id),
          customerName: String(data.customerName ?? ''),
          customerPhone: String(data.customerPhone ?? ''),
          fulfillmentType: data.fulfillmentType === 'retirada' ? 'retirada' : 'delivery',
          address: String(data.address ?? ''),
          neighborhood: String(data.neighborhood ?? ''),
          complement: String(data.complement ?? ''),
          paymentMethod: (VALID_PAYMENTS.includes(data.paymentMethod as PaymentMethod)
            ? data.paymentMethod
            : 'pix') as PaymentMethod,
          changeFor: String(data.changeFor ?? ''),
          notes: String(data.notes ?? ''),
          items: Array.isArray(data.items) ? (data.items as OrderItem[]) : [],
          subtotal: Number(data.subtotal ?? 0),
          deliveryFee: Number(data.deliveryFee ?? 0),
          total: Number(data.total ?? 0),
          status: (data.status as OrderStatus) || 'novo',
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      onOrders(orders);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    }
  );
}

export interface StoredCustomerOrderRef {
  id: string;
  code: string;
  receipt?: Order;
}

export function subscribeCustomerOrders(
  orderRefs: StoredCustomerOrderRef[],
  onOrders: (orders: Order[]) => void
): () => void {
  const validRefs = orderRefs.filter((r) => VALID_ID_REGEX.test(r.id));
  if (validRefs.length === 0) {
    onOrders([]);
    return () => {};
  }

  const stateMap = new Map<string, Order>();
  for (const ref of validRefs) {
    if (ref.receipt) {
      stateMap.set(ref.id, ref.receipt);
    }
  }
  onOrders(
    Array.from(stateMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );

  const unsubscribes = validRefs.map((ref) => {
    const trackingDocRef = doc(db, 'orderTracking', ref.id);
    return onSnapshot(
      trackingDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const prev = ref.receipt;
          const merged: Order = {
            id: ref.id,
            code: String(data.code ?? prev?.code ?? ref.code),
            customerName: prev?.customerName || 'Seu pedido',
            customerPhone: prev?.customerPhone || '',
            fulfillmentType: data.fulfillmentType === 'retirada' ? 'retirada' : 'delivery',
            address: prev?.address || (data.fulfillmentType === 'retirada' ? 'Retirada na loja' : 'Endereço informado no pedido'),
            neighborhood: prev?.neighborhood || '',
            complement: prev?.complement || '',
            paymentMethod: (VALID_PAYMENTS.includes(data.paymentMethod as PaymentMethod)
              ? data.paymentMethod
              : 'pix') as PaymentMethod,
            changeFor: prev?.changeFor || '',
            notes: prev?.notes || '',
            items: Array.isArray(data.items) ? (data.items as OrderItem[]) : prev?.items || [],
            subtotal: Number(data.subtotal ?? prev?.subtotal ?? 0),
            deliveryFee: Number(data.deliveryFee ?? prev?.deliveryFee ?? 0),
            total: Number(data.total ?? prev?.total ?? 0),
            status: (data.status as OrderStatus) || prev?.status || 'novo',
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
          stateMap.set(ref.id, merged);
          onOrders(
            Array.from(stateMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          );
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `orderTracking/${ref.id}`);
      }
    );
  });

  return () => {
    for (const unsub of unsubscribes) unsub();
  };
}

export async function updateStoreConfig(
  currentStore: StoreConfig,
  patch: Partial<StoreConfig>
): Promise<StoreConfig> {
  const merged: StoreConfig = { ...currentStore, ...patch };
  const payload = sanitizeStorePayload(merged);
  try {
    await setDoc(doc(db, 'storeConfig', 'main'), payload);
    return {
      ...merged,
      logoUrl: payload.logoUrl,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'storeConfig/main');
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = `hm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = sanitizeProductPayload(input);
  try {
    await setDoc(doc(db, 'products', id), payload);
    return {
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `products/${id}`);
  }
}

export async function updateProduct(
  currentProduct: Product,
  patch: Partial<ProductInput>
): Promise<void> {
  const merged: ProductInput = {
    ean: patch.ean !== undefined ? patch.ean : currentProduct.ean,
    name: patch.name !== undefined ? patch.name : currentProduct.name,
    description: patch.description !== undefined ? patch.description : currentProduct.description,
    department: patch.department !== undefined ? patch.department : currentProduct.department,
    unit: patch.unit !== undefined ? patch.unit : currentProduct.unit,
    weightLabel: patch.weightLabel !== undefined ? patch.weightLabel : currentProduct.weightLabel,
    price: patch.price !== undefined ? patch.price : currentProduct.price,
    promoPrice: patch.promoPrice !== undefined ? patch.promoPrice : currentProduct.promoPrice,
    stock: patch.stock !== undefined ? patch.stock : currentProduct.stock,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : currentProduct.imageUrl,
    isDailyOffer: patch.isDailyOffer !== undefined ? patch.isDailyOffer : currentProduct.isDailyOffer,
    inDigitalFlyer:
      patch.inDigitalFlyer !== undefined ? patch.inDigitalFlyer : currentProduct.inDigitalFlyer,
    active: patch.active !== undefined ? patch.active : currentProduct.active,
  };
  const payload = sanitizeProductPayload(merged);
  try {
    await setDoc(doc(db, 'products', currentProduct.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${currentProduct.id}`);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
  }
}

export async function createOrder(
  payload: CreateOrderPayload,
  store: StoreConfig,
  products: Product[]
): Promise<{ order?: Order; error?: string }> {
  const customerName = clampStr(payload.customerName, 120);
  const customerPhone = clampStr(payload.customerPhone, 30);
  if (!customerName || customerPhone.length < 6) {
    return { error: 'Informe seu nome e telefone/WhatsApp válido.' };
  }
  const fulfillmentType = payload.fulfillmentType === 'retirada' ? 'retirada' : 'delivery';
  const address =
    fulfillmentType === 'delivery' ? clampStr(payload.address, 220) : 'Retirada na loja';
  if (fulfillmentType === 'delivery' && !address) {
    return { error: 'Informe o endereço completo para entrega.' };
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { error: 'A sacola está vazia.' };
  }

  const orderItems: OrderItem[] = [];
  for (const reqItem of payload.items.slice(0, 60)) {
    const product = products.find((p) => p.id === reqItem.productId && p.active);
    if (!product) {
      return { error: 'Um dos produtos selecionados não está mais disponível.' };
    }
    const qty = Math.min(1000, Math.max(1, Math.floor(Number(reqItem.quantity) || 1)));
    if (product.stock < qty) {
      return {
        error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`,
      };
    }
    const unitPrice = Number((product.promoPrice ?? product.price).toFixed(2));
    const subtotal = Number((unitPrice * qty).toFixed(2));
    orderItems.push({
      productId: clampStr(product.id, 80),
      name: clampStr(product.name, 140),
      unit: clampStr(product.unit, 30) || 'un',
      weightLabel: clampStr(product.weightLabel, 60) || '1 unidade',
      unitPrice,
      quantity: qty,
      subtotal,
    });
  }

  const subtotal = Number(orderItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));
  const deliveryFee =
    fulfillmentType === 'retirada' || subtotal >= store.freeDeliveryThreshold
      ? 0
      : Number(store.deliveryFee.toFixed(2));
  const total = Number((subtotal + deliveryFee).toFixed(2));

  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const timeCode = Date.now().toString(36).slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, '0');
  const code = `HM-${timeCode}${rand}`;
  const orderId = `ord-${Date.now().toString(36)}-${rand.toLowerCase()}`;

  const paymentMethod: PaymentMethod = VALID_PAYMENTS.includes(payload.paymentMethod)
    ? payload.paymentMethod
    : 'pix';

  const neighborhood =
    fulfillmentType === 'delivery'
      ? clampStr(payload.neighborhood, 120)
      : clampStr(store.neighborhood, 120);
  const complement = clampStr(payload.complement, 120);
  const changeFor = clampStr(payload.changeFor, 60);
  const notes = clampStr(payload.notes, 400);

  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);

  const orderDocData = {
    code,
    customerName,
    customerPhone,
    fulfillmentType,
    address,
    neighborhood,
    complement,
    paymentMethod,
    changeFor,
    notes,
    items: orderItems,
    subtotal,
    deliveryFee,
    total,
    status: 'novo' as OrderStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const trackingDocData = {
    orderId,
    code,
    fulfillmentType,
    paymentMethod,
    items: orderItems,
    subtotal,
    deliveryFee,
    total,
    status: 'novo' as OrderStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.set(doc(db, 'orders', orderId), orderDocData);
  batch.set(doc(db, 'orderTracking', orderId), trackingDocData);

  try {
    await batch.commit();
  } catch (error) {
    console.error('Erro ao gravar pedido no Firestore:', error);
    return { error: 'Não foi possível enviar o pedido para a loja. Verifique sua conexão e tente novamente.' };
  }

  const createdOrder: Order = {
    id: orderId,
    code,
    customerName,
    customerPhone,
    fulfillmentType,
    address,
    neighborhood,
    complement,
    paymentMethod,
    changeFor,
    notes,
    items: orderItems,
    subtotal,
    deliveryFee,
    total,
    status: 'novo',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { order: createdOrder };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const trackingRef = doc(db, 'orderTracking', orderId);
  try {
    const trackingSnap = await getDoc(trackingRef);
    const batch = writeBatch(db);
    batch.update(orderRef, { status, updatedAt: serverTimestamp() });
    if (trackingSnap.exists()) {
      batch.update(trackingRef, { status, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function updateProductQuick(
  id: string,
  patch: Partial<ProductInput>,
  products: Product[]
): Promise<void> {
  const current = products.find((p) => p.id === id);
  if (!current) return;
  await updateProduct(current, patch);
}

export { updateDoc };
