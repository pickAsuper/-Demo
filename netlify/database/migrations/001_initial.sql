-- 金额统一保存为“分”，避免 JavaScript 浮点数产生 0.1 + 0.2 的精度问题。
CREATE TABLE products (
  id text PRIMARY KEY,
  name text NOT NULL,
  subtitle text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock integer NOT NULL CHECK (stock >= 0),
  image text NOT NULL,
  color text NOT NULL,
  tag text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

-- client_id 是匿名设备凭据，并不等于正式的用户登录系统。
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents > 0),
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents + shipping_cents),
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, idempotency_key)
);
CREATE INDEX orders_client_created_idx ON orders (client_id, created_at DESC);

-- 保存下单时的名称和价格快照：将来商品改价，历史订单不会跟着变。
CREATE TABLE order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  image text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  UNIQUE (order_id, product_id)
);
