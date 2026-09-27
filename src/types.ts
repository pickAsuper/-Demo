export interface Product {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  image: string;
  color: string;
  tag: string;
}
export interface Customer {
  name: string;
  phone: string;
  address: string;
}
export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  customer: Customer;
  items: {
    productId: string;
    name: string;
    image: string;
    priceCents: number;
    quantity: number;
  }[];
}
export interface Config {
  apiUrl: string;
  version: string;
  platform: string;
}
export interface ApiRequest {
  path: string;
  method?: string;
  body?: unknown;
  clientId?: string;
  idempotencyKey?: string;
}
declare global {
  interface Window {
    shopDesktop?: {
      request: (
        request: ApiRequest,
      ) => Promise<{ ok: boolean; status: number; data: unknown }>;
      getConfig: () => Promise<Config>;
      setApiUrl: (url: string) => Promise<Config>;
    };
  }
}
