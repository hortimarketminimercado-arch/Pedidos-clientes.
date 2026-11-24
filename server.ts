import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  INITIAL_DEPARTMENTS,
  INITIAL_STORE,
  computeAnalytics,
  createInitialOrders,
  createInitialProducts,
  normalizeLogoUrl,
} from './src/data/seed.ts';
import type {
  CreateOrderPayload,
  Department,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductInput,
  StoreConfig,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '.data');
const DB_PATH = path.join(DATA_DIR, 'hortimarket.json');

interface DatabaseState {
  store: StoreConfig;
  departments: Department[];
  products: Product[];
  orders: Order[];
  nextOrderNum: number;
}

function loadDatabase(): DatabaseState {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      const mergedStore: StoreConfig = {
        ...INITIAL_STORE,
        ...(parsed.store || {}),
        logoUrl: normalizeLogoUrl(parsed.store?.logoUrl),
      };
      const loaded: DatabaseState = {
        store: mergedStore,
        departments: parsed.departments?.length ? parsed.departments : INITIAL_DEPARTMENTS,
        products: parsed.products?.length ? parsed.products : createInitialProducts(),
        orders: parsed.orders || createInitialOrders(),
        nextOrderNum: parsed.nextOrderNum || 1003,
      };
      if (parsed.store?.logoUrl !== mergedStore.logoUrl) {
        saveDatabase(loaded);
      }
      return loaded;
    }
  } catch {
    // Recreate seed if corrupted
  }
  const initial: DatabaseState = {
    store: INITIAL_STORE,
    departments: INITIAL_DEPARTMENTS,
    products: createInitialProducts(),
    orders: createInitialOrders(),
    nextOrderNum: 1003,
  };
  saveDatabase(initial);
  return initial;
}

function saveDatabase(state: DatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore read-only fs errors
  }
}

const db: DatabaseState = loadDatabase();

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'novo',
  'separacao',
  'entrega',
  'concluido',
  'cancelado',
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.get('/api/store', (_req, res) => {
    res.json({ store: db.store, departments: db.departments });
  });

  app.put('/api/store', (req, res) => {
    const patch = (req.body || {}) as Partial<StoreConfig>;
    db.store = {
      ...db.store,
      ...patch,
      deliveryFee:
        typeof patch.deliveryFee === 'number' && patch.deliveryFee >= 0
          ? patch.deliveryFee
          : db.store.deliveryFee,
      freeDeliveryThreshold:
        typeof patch.freeDeliveryThreshold === 'number' && patch.freeDeliveryThreshold >= 0
          ? patch.freeDeliveryThreshold
          : db.store.freeDeliveryThreshold,
    };
    saveDatabase(db);
    res.json({ store: db.store });
  });

  app.get('/api/products', (_req, res) => {
    res.json({ products: db.products });
  });

  app.post('/api/products', (req, res) => {
    const body = (req.body || {}) as Partial<ProductInput>;
    if (!body.name || typeof body.price !== 'number' || body.price <= 0) {
      res.status(400).json({ error: 'Nome e preço válido são obrigatórios.' });
      return;
    }
    const now = new Date().toISOString();
    const created: Product = {
      id: `hm-${Date.now().toString(36)}`,
      ean: body.ean ? String(body.ean).trim() : undefined,
      name: String(body.name).trim(),
      description: String(body.description || '').trim(),
      department: String(body.department || 'mercearia'),
      unit: String(body.unit || 'un'),
      weightLabel: String(body.weightLabel || '1 unidade').trim(),
      price: Number(body.price),
      promoPrice:
        typeof body.promoPrice === 'number' && body.promoPrice > 0 ? Number(body.promoPrice) : null,
      stock: Math.max(0, Math.floor(Number(body.stock ?? 0))),
      imageUrl: String(body.imageUrl || ''),
      isDailyOffer: Boolean(body.isDailyOffer),
      inDigitalFlyer: Boolean(body.inDigitalFlyer),
      active: body.active !== undefined ? Boolean(body.active) : true,
      updatedAt: now,
    };
    db.products = [created, ...db.products];
    saveDatabase(db);
    res.status(201).json({ product: created });
  });

  app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const idx = db.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    const patch = (req.body || {}) as Partial<ProductInput>;
    const current = db.products[idx];
    const updated: Product = {
      ...current,
      ...patch,
      id: current.id,
      promoPrice:
        patch.promoPrice === null
          ? null
          : typeof patch.promoPrice === 'number' && patch.promoPrice > 0
            ? patch.promoPrice
            : current.promoPrice,
      stock:
        typeof patch.stock === 'number' && !Number.isNaN(patch.stock)
          ? Math.max(0, Math.floor(patch.stock))
          : current.stock,
      updatedAt: new Date().toISOString(),
    };
    db.products[idx] = updated;
    saveDatabase(db);
    res.json({ product: updated });
  });

  app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const before = db.products.length;
    db.products = db.products.filter((p) => p.id !== id);
    if (db.products.length === before) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    saveDatabase(db);
    res.json({ deletedId: id });
  });

  app.get('/api/orders', (req, res) => {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : '';
    const rawCodes = typeof req.query.codes === 'string' ? req.query.codes : '';
    if (scope === 'customer' || req.query.codes !== undefined) {
      const codeSet = new Set(
        rawCodes
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      );
      if (codeSet.size === 0) {
        res.json({ orders: [] });
        return;
      }
      res.json({
        orders: db.orders.filter((o) => codeSet.has(o.code.toUpperCase())),
      });
      return;
    }
    res.json({ orders: db.orders });
  });

  app.post('/api/orders', (req, res) => {
    const payload = (req.body || {}) as Partial<CreateOrderPayload>;
    if (!payload.customerName?.trim() || !payload.customerPhone?.trim()) {
      res.status(400).json({ error: 'Informe seu nome e telefone/WhatsApp.' });
      return;
    }
    if (payload.fulfillmentType === 'delivery' && !payload.address?.trim()) {
      res.status(400).json({ error: 'Informe o endereço completo para entrega.' });
      return;
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      res.status(400).json({ error: 'A sacola está vazia.' });
      return;
    }

    const orderItems: OrderItem[] = [];
    for (const reqItem of payload.items) {
      const product = db.products.find((p) => p.id === reqItem.productId && p.active);
      if (!product) {
        res.status(400).json({ error: 'Um dos produtos selecionados não está mais disponível.' });
        return;
      }
      const qty = Math.max(1, Math.floor(Number(reqItem.quantity) || 1));
      if (product.stock < qty) {
        res
          .status(400)
          .json({ error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.` });
        return;
      }
      const unitPrice = product.promoPrice ?? product.price;
      orderItems.push({
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
    for (const item of orderItems) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        prod.updatedAt = now;
      }
    }

    const subtotal = Number(orderItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));
    const fulfillmentType = payload.fulfillmentType === 'retirada' ? 'retirada' : 'delivery';
    const deliveryFee =
      fulfillmentType === 'retirada' || subtotal >= db.store.freeDeliveryThreshold
        ? 0
        : db.store.deliveryFee;
    const total = Number((subtotal + deliveryFee).toFixed(2));

    const orderNum = db.nextOrderNum++;
    const order: Order = {
      id: `ord-${orderNum}`,
      code: `HM-${orderNum}`,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      fulfillmentType,
      address: fulfillmentType === 'delivery' ? (payload.address || '').trim() : 'Retirada na loja',
      neighborhood:
        fulfillmentType === 'delivery'
          ? (payload.neighborhood || '').trim()
          : db.store.neighborhood,
      complement: (payload.complement || '').trim(),
      paymentMethod: payload.paymentMethod || 'pix',
      changeFor: (payload.changeFor || '').trim(),
      notes: (payload.notes || '').trim(),
      items: orderItems,
      subtotal,
      deliveryFee,
      total,
      status: 'novo',
      createdAt: now,
      updatedAt: now,
    };

    db.orders = [order, ...db.orders];
    saveDatabase(db);
    res.status(201).json({ order });
  });

  app.patch('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const status = req.body?.status as OrderStatus;
    if (!VALID_ORDER_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Status de pedido inválido.' });
      return;
    }
    const order = db.orders.find((o) => o.id === id);
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json({ order });
  });

  app.get('/api/analytics', (_req, res) => {
    res.json({ analytics: computeAnalytics(db.products, db.orders) });
  });

  const httpServer = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Hortimarket Delivery server listening on http://localhost:${port}`);
  });
}

startServer();
