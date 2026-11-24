export type OrderStatus = 'novo' | 'separacao' | 'entrega' | 'concluido' | 'cancelado';

export type PaymentMethod = 'pix' | 'cartao_link' | 'cartao' | 'dinheiro';

export type FulfillmentType = 'delivery' | 'retirada';

export type AppView = 'catalogo' | 'encarte' | 'pedidos' | 'admin';

export type CatalogFilter = 'all' | 'ofertas' | string;

export interface StoreConfig {
  name: string;
  tagline: string;
  whatsappNumber: string;
  isOpen: boolean;
  openingHours: string;
  address: string;
  neighborhood: string;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  flyerTitle: string;
  flyerValidity: string;
  flyerSubtitle: string;
  acceptedPayments: PaymentMethod[];
  pixKey: string;
  paymentLinkInfo: string;
  logoUrl?: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
}

export interface Product {
  id: string;
  ean?: string;
  name: string;
  description: string;
  department: string;
  unit: string;
  weightLabel: string;
  price: number;
  promoPrice: number | null;
  stock: number;
  imageUrl: string;
  isDailyOffer: boolean;
  inDigitalFlyer: boolean;
  active: boolean;
  updatedAt: string;
}

export type ProductInput = Omit<Product, 'id' | 'updatedAt'>;

export interface OrderItem {
  productId: string;
  name: string;
  unit: string;
  weightLabel: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  address: string;
  neighborhood: string;
  complement: string;
  paymentMethod: PaymentMethod;
  changeFor: string;
  notes: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  address: string;
  neighborhood: string;
  complement: string;
  paymentMethod: PaymentMethod;
  changeFor: string;
  notes: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  averageTicket: number;
  lowStockCount: number;
  activeOffersCount: number;
  flyerItemsCount: number;
}
