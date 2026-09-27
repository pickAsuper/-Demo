import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Grid2X2,
  Headphones,
  Leaf,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import type { Config, Customer, Order, Product } from "./types";
import { api, money } from "./api";
import Guide from "./Guide";

type Page = "shop" | "orders" | "guide" | "settings";
type Cart = Record<string, number>;
const categories = ["全部好物", "桌面数码", "办公文具", "生活方式"];
const image = (name: string) => `./goods/${name}.svg`;

function loadCart(): Cart {
  try {
    const saved = JSON.parse(localStorage.getItem("mono-cart") || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([key, value]) =>
          /^[a-z]+$/.test(key) &&
          Number.isInteger(value) &&
          Number(value) > 0 &&
          Number(value) <= 99,
      ),
    ) as Cart;
  } catch {
    return {};
  }
}

// 原生 dialog 提供焦点圈定与 Escape 关闭；关闭后浏览器会恢复原来的焦点。
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "modal wide" : "modal"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("shop");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [connected, setConnected] = useState(false);
  const [category, setCategory] = useState("全部好物");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [cart, setCart] = useState<Cart>(loadCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [success, setSuccess] = useState<Order | null>(null);
  const [toast, setToast] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await api<Product[]>("/products"));
      setConnected(true);
    } catch (e) {
      setError((e as Error).message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrderError("");
    try {
      setOrders(await api<Order[]>("/orders"));
    } catch (e) {
      setOrderError((e as Error).message);
    } finally {
      setOrdersLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    void window.shopDesktop?.getConfig().then((c) => {
      setConfig(c);
      setApiUrl(c.apiUrl);
    });
  }, [refresh]);
  useEffect(() => {
    if (page === "orders") void refreshOrders();
  }, [page, refreshOrders]);
  useEffect(() => {
    localStorage.setItem("mono-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const lines = products
    .filter((p) => cart[p.id])
    .map((product) => ({ product, quantity: cart[product.id] }));
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.product.priceCents * line.quantity,
    0,
  );
  const shipping = subtotal > 0 && subtotal < 29900 ? 1200 : 0;
  const unavailable =
    Object.keys(cart).some((id) => !products.some((p) => p.id === id)) ||
    lines.some((l) => l.quantity > l.product.stock);
  const visibleProducts = products
    .filter(
      (p) =>
        (category === "全部好物" || p.category === category) &&
        `${p.name} ${p.subtitle} ${p.category}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.priceCents - b.priceCents
        : sort === "high"
          ? b.priceCents - a.priceCents
          : 0,
    );

  function add(product: Product) {
    if ((cart[product.id] || 0) >= Math.min(product.stock, 99)) {
      setToast("已达到可购买数量");
      return;
    }
    setCart((current) => ({
      ...current,
      [product.id]: (current[product.id] || 0) + 1,
    }));
    setToast(`已加入购物车：${product.name}`);
  }
  function updateQuantity(id: string, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }
  function closeCart() {
    if (!submittingRef.current) {
      setCartOpen(false);
      setCheckout(false);
      setCheckoutError("");
    }
  }
  async function placeOrder(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || unavailable || !lines.length) return;
    submittingRef.current = true;
    setSubmitting(true);
    setCheckoutError("");
    // 网络超时后保留请求和幂等键，再点击下单也不会创建两笔相同订单。
    const body = {
      customer,
      items: lines
        .map((l) => ({ productId: l.product.id, quantity: l.quantity }))
        .sort((a, b) => a.productId.localeCompare(b.productId)),
    };
    const fingerprint = JSON.stringify(body);
    let pending: { fingerprint: string; key: string } | null = null;
    try {
      pending = JSON.parse(
        localStorage.getItem("mono-pending-checkout") || "null",
      );
    } catch {
      /* 损坏的缓存可安全重建。 */
    }
    if (pending?.fingerprint !== fingerprint)
      pending = { fingerprint, key: crypto.randomUUID() };
    localStorage.setItem("mono-pending-checkout", JSON.stringify(pending));
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body,
        idempotencyKey: pending!.key,
      });
      localStorage.removeItem("mono-pending-checkout");
      setCart({});
      setCartOpen(false);
      setCheckout(false);
      setSuccess(order);
      setCustomer({ name: "", phone: "", address: "" });
      void refresh();
      void refreshOrders();
    } catch (e) {
      setCheckoutError((e as Error).message);
      void refresh();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!window.shopDesktop) return;
    setSaving(true);
    setSettingsError("");
    try {
      const c = await window.shopDesktop.setApiUrl(apiUrl.trim());
      setConfig(c);
      setApiUrl(c.apiUrl);
      setOrders([]);
      setProducts([]);
      await refresh();
      setToast("连接地址已保存");
    } catch (e) {
      setSettingsError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="titlebar">
        <span>拾物商店</span>
        <span>让日常，多一点喜欢</span>
        <span className="titlebar-version">
          {window.shopDesktop ? "桌面版" : "网页版"}{" "}
          {config?.version || "0.1.0"}
        </span>
      </div>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage("shop")}
          aria-label="拾物首页"
        >
          <span className="brand-symbol">
            <ShoppingBag size={26} strokeWidth={1.7} />
          </span>
          <span>
            拾物<small>Mono Shop</small>
          </span>
        </button>
        <div className="sidebar-label">我的商店</div>
        <nav aria-label="主导航">
          <button
            className={page === "shop" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("shop")}
          >
            <Grid2X2 size={19} />
            发现好物
            <span className="nav-dot" />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setCheckout(false);
              setCartOpen(true);
            }}
          >
            <ShoppingBag size={19} />
            购物车{count > 0 && <span className="nav-count">{count}</span>}
          </button>
          <button
            className={page === "orders" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("orders")}
          >
            <Package size={19} />
            我的订单
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">探索更多</div>
        <button
          className={page === "guide" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("guide")}
        >
          <BookOpen size={19} />
          开发学习指南
          <ArrowUpRight size={15} className="nav-end" />
        </button>
        <button
          className={page === "settings" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("settings")}
        >
          <Settings2 size={19} />
          连接设置
        </button>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="demo-note-icon">
              <Sparkles size={18} />
            </span>
            <strong>小商店，大有学问。</strong>
            <p>
              从一次下单，了解一个
              <br />
              桌面应用如何运转。
            </p>
            <button onClick={() => setPage("guide")}>
              开始探索 <ArrowRight size={15} />
            </button>
          </div>
          <button className="connection" onClick={() => setPage("settings")}>
            <span className={connected ? "status-dot online" : "status-dot"} />
            {connected
              ? "商店服务已连接"
              : loading
                ? "正在连接商店…"
                : "商店服务未连接"}
            <ChevronRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">访</span>
            <span>
              访客体验<small>本机专属购物空间</small>
            </span>
            <CircleHelp size={17} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            拾物商店
            <ChevronRight size={14} />
            <strong>
              {
                {
                  shop: "发现好物",
                  orders: "我的订单",
                  guide: "开发学习指南",
                  settings: "连接设置",
                }[page]
              }
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">演示商店</span>
            <button
              className="header-cart"
              onClick={() => {
                setCheckout(false);
                setCartOpen(true);
              }}
              aria-label={`打开购物车，${count} 件商品`}
            >
              <ShoppingBag size={18} />
              <span>购物车</span>
              <b>{count}</b>
            </button>
          </div>
        </header>
        {page === "shop" && (
          <section className="shop-page page-section">
            <div className="shop-heading">
              <div>
                <span className="section-kicker">认真挑选，日常所爱</span>
                <h1>
                  发现值得拥有的好物<span>。</span>
                </h1>
              </div>
              <p>给桌面一点新意，给生活一点灵感。</p>
            </div>
            <section className="hero">
              <div className="hero-content">
                <span className="hero-tag">
                  <span />
                  本期精选 · 理想桌面
                </span>
                <h2>
                  好的日常，
                  <br />
                  从喜欢的桌面开始。
                </h2>
                <p>
                  留一点空间给专注，
                  <br />
                  也留一点喜欢给自己。
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setCategory("桌面数码");
                    document
                      .getElementById("catalog")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  探索桌面好物
                  <ArrowRight size={17} />
                </button>
                <div className="hero-caption">用心选物，让每一天都顺手。</div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-orbit" />
                <img className="hero-keyboard" src={image("keyboard")} alt="" />
                <img
                  className="hero-headphones"
                  src={image("headphones")}
                  alt=""
                />
                <div className="art-label">
                  <span />
                  专注的声音<small>Cloud 无线耳机</small>
                </div>
                <span className="hero-edition">秋日桌面提案 / 2026</span>
              </div>
            </section>
            <div className="benefits">
              <span>
                <Truck size={19} />满 ¥299 免运费
              </span>
              <span>
                <Leaf size={18} />
                为日常用心挑选
              </span>
              <span>
                <Headphones size={18} />
                有温度的桌面陪伴
              </span>
              <span className="benefit-tip">学习用 Demo，不产生真实交易</span>
            </div>
            <section id="catalog" className="catalog">
              <div className="catalog-title">
                <h2>
                  好物清单 <span>{products.length} 件精选</span>
                </h2>
                <div className="catalog-tools">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="搜索商品"
                      placeholder="搜一搜心仪好物"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="清除搜索"
                        onClick={() => setQuery("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  <label className="sort">
                    <SlidersHorizontal size={16} />
                    <select
                      aria-label="商品排序"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="featured">精选排序</option>
                      <option value="low">价格从低到高</option>
                      <option value="high">价格从高到低</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="categories" aria-label="商品分类">
                {categories.map((c) => (
                  <button
                    key={c}
                    className={category === c ? "selected" : ""}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {error ? (
                <div className="empty-state error-state" role="alert">
                  <Package size={36} />
                  <h3>商店暂时还没开门</h3>
                  <p>{error}</p>
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={16} />
                    重新连接
                  </button>
                </div>
              ) : loading ? (
                <div className="product-grid" aria-label="正在加载商品">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : visibleProducts.length ? (
                <div className="product-grid">
                  {visibleProducts.map((product) => (
                    <article className="product-card" key={product.id}>
                      <button
                        className="product-image"
                        style={{ background: product.color }}
                        onClick={() => setDetail(product)}
                        aria-label={`查看${product.name}详情`}
                      >
                        {product.tag && (
                          <span className="product-tag">{product.tag}</span>
                        )}
                        <img src={image(product.image)} alt={product.name} />
                        <span className="image-more">
                          <ArrowUpRight size={17} />
                        </span>
                      </button>
                      <div className="product-info">
                        <span className="product-category">
                          {product.category}
                        </span>
                        <button
                          className="product-name"
                          onClick={() => setDetail(product)}
                        >
                          {product.name}
                        </button>
                        <p>{product.subtitle}</p>
                        <div className="product-bottom">
                          <strong>{money(product.priceCents)}</strong>
                          <button
                            className="add-button"
                            onClick={() => add(product)}
                            disabled={!product.stock}
                            aria-label={`加入购物车：${product.name}`}
                          >
                            <Plus size={17} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={32} />
                  <h3>还没有找到这件好物</h3>
                  <p>试试其他关键词，或看看全部商品。</p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("全部好物");
                    }}
                  >
                    查看全部好物
                  </button>
                </div>
              )}
            </section>
            <footer className="page-footer">
              <span>拾物 · 少一点将就，多一点喜欢。</span>
              <span>为学习而生的桌面商店</span>
            </footer>
          </section>
        )}
        {page === "orders" && (
          <section className="page-section orders-page">
            <div className="page-heading">
              <div>
                <span className="section-kicker">每一份喜欢，都有记录</span>
                <h1>我的订单</h1>
                <p>当前设备最近 50 笔订单 · 演示订单不会真实付款或发货</p>
              </div>
              <button
                className="secondary"
                onClick={refreshOrders}
                disabled={ordersLoading}
              >
                <RefreshCw size={16} />
                刷新订单
              </button>
            </div>
            {orderError && (
              <div className="inline-error" role="alert">
                {orderError}
              </div>
            )}
            {ordersLoading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                <p>正在读取订单…</p>
              </div>
            ) : orders.length ? (
              <div className="order-list">
                {orders.map((order) => (
                  <article className="order-card" key={order.id}>
                    <div className="order-heading">
                      <div>
                        <strong>{order.orderNumber}</strong>
                        <small>
                          {new Date(order.createdAt).toLocaleString("zh-CN")}
                        </small>
                      </div>
                      <span className="order-status">
                        <span />
                        待发货 · 演示
                      </span>
                    </div>
                    {order.items.map((item) => (
                      <div className="order-line" key={item.productId}>
                        <img src={image(item.image)} alt="" />
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {money(item.priceCents)} × {item.quantity}
                          </small>
                        </div>
                        <b>{money(item.priceCents * item.quantity)}</b>
                      </div>
                    ))}
                    <div className="order-footer">
                      <span>
                        {order.customer.name} ·{" "}
                        {order.customer.phone.replace(
                          /(\d{3})\d{4}(\d{4})/,
                          "$1****$2",
                        )}
                        <small>{order.customer.address}</small>
                      </span>
                      <span>
                        含运费 {money(order.shippingCents)}
                        <strong>合计 {money(order.totalCents)}</strong>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              !orderError && (
                <div className="empty-state">
                  <Package size={42} />
                  <h3>第一份喜欢，还在路上</h3>
                  <p>挑选一件好物，体验完整的下单流程。</p>
                  <button className="primary" onClick={() => setPage("shop")}>
                    去发现好物
                    <ArrowRight size={16} />
                  </button>
                </div>
              )
            )}
          </section>
        )}
        {page === "guide" && <Guide />}
        {page === "settings" && (
          <section className="page-section settings-page">
            <div className="page-heading">
              <div>
                <span className="section-kicker">让桌面连接你的商店</span>
                <h1>连接设置</h1>
                <p>本地学习时使用默认地址；部署后改成你的服务器地址。</p>
              </div>
            </div>
            <form className="settings-card" onSubmit={saveSettings}>
              <div className="settings-card-heading">
                <Settings2 size={22} />
                <h2>商店服务</h2>
                <span
                  className={connected ? "status-dot online" : "status-dot"}
                />
              </div>
              <label>
                API 服务器地址
                <input
                  type="url"
                  required
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3001"
                  disabled={!config}
                />
              </label>
              <p className="field-help">
                远程服务请使用 HTTPS 根地址，无需附加 /api。更改后立即生效。
              </p>
              {!config && (
                <p className="inline-info">
                  网页版自动连接当前网站的商店服务，无需修改地址。 Electron
                  桌面端可在这里切换到已部署的网站。
                </p>
              )}
              {settingsError && (
                <p className="inline-error" role="alert">
                  {settingsError}
                </p>
              )}
              <button className="primary" disabled={!config || saving}>
                {saving ? "连接中…" : "保存并连接"}
                <ArrowRight size={16} />
              </button>
            </form>
            <div className="settings-explainer">
              <h3>安装包与数据库是什么关系？</h3>
              <p>
                桌面应用通过 API
                读取商品和提交订单。数据库运行在服务端，用户的电脑不需要安装
                PostgreSQL，也不会拿到数据库密码。
              </p>
              <p>
                当前项目采用匿名设备体验。清除应用数据会丢失本机订单访问凭据，请只填写虚构的收货信息。
              </p>
            </div>
          </section>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {detail && (
        <Modal title="好物详情" onClose={() => setDetail(null)} wide>
          <div className="detail-layout">
            <div className="detail-image" style={{ background: detail.color }}>
              <img src={image(detail.image)} alt={detail.name} />
            </div>
            <div className="detail-copy">
              <span className="section-kicker">{detail.category}</span>
              <h2>{detail.name}</h2>
              <p>{detail.description}</p>
              <strong className="detail-price">
                {money(detail.priceCents)}
              </strong>
              <span className="stock">
                库存{" "}
                {products.find((p) => p.id === detail.id)?.stock ??
                  detail.stock}{" "}
                件 · 满 ¥299 免运费
              </span>
              <button
                className="primary"
                disabled={!detail.stock}
                onClick={() =>
                  add(products.find((p) => p.id === detail.id) || detail)
                }
              >
                <Plus size={17} />
                加入购物车
              </button>
            </div>
          </div>
        </Modal>
      )}
      {cartOpen && (
        <Modal
          title={checkout ? "确认这份喜欢" : `购物车 · ${count} 件好物`}
          onClose={closeCart}
          wide
        >
          {!count ? (
            <div className="empty-state">
              <ShoppingBag size={40} />
              <h3>留个位置，给喜欢的好物</h3>
              <p>购物车还是空的，去挑选一些日常灵感吧。</p>
              <button
                className="primary"
                onClick={() => {
                  closeCart();
                  setPage("shop");
                }}
              >
                去逛逛
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form onSubmit={placeOrder} className="checkout-layout">
              <div className="cart-content">
                {!connected && (
                  <p className="inline-error">
                    当前服务未连接，请连接服务后再结算。
                  </p>
                )}
                {unavailable && (
                  <p className="inline-error">
                    部分商品库存不足或已下架，请减少数量或清空后重新选购。
                  </p>
                )}
                {lines.map(({ product, quantity }) => (
                  <div className="cart-line" key={product.id}>
                    <img
                      src={image(product.image)}
                      alt=""
                      style={{ background: product.color }}
                    />
                    <div className="cart-line-info">
                      <strong>{product.name}</strong>
                      <small>{money(product.priceCents)}</small>
                      <div className="quantity">
                        <button
                          type="button"
                          aria-label={`减少${product.name}`}
                          onClick={() =>
                            updateQuantity(product.id, quantity - 1)
                          }
                          disabled={submitting}
                        >
                          <Minus size={13} />
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          aria-label={`增加${product.name}`}
                          onClick={() =>
                            updateQuantity(product.id, quantity + 1)
                          }
                          disabled={
                            submitting ||
                            quantity >= Math.min(product.stock, 99)
                          }
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="cart-line-end">
                      <strong>{money(product.priceCents * quantity)}</strong>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`移除${product.name}`}
                        disabled={submitting}
                        onClick={() => updateQuantity(product.id, 0)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {!checkout && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={submitting}
                    onClick={() => setCart({})}
                  >
                    清空购物车
                  </button>
                )}
                {checkout && (
                  <fieldset disabled={submitting} className="customer-fields">
                    <legend>
                      收货信息 <small>请使用虚构信息体验</small>
                    </legend>
                    <div className="field-row">
                      <label>
                        收货人
                        <input
                          required
                          maxLength={40}
                          autoComplete="off"
                          placeholder="例如：小拾"
                          value={customer.name}
                          onChange={(e) =>
                            setCustomer({ ...customer, name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        手机号码
                        <input
                          required
                          inputMode="tel"
                          pattern="1[3-9][0-9]{9}"
                          maxLength={11}
                          autoComplete="off"
                          placeholder="例如：13800000000"
                          value={customer.phone}
                          onChange={(e) =>
                            setCustomer({ ...customer, phone: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      收货地址
                      <textarea
                        required
                        minLength={5}
                        maxLength={200}
                        rows={2}
                        autoComplete="off"
                        placeholder="例如：演示市拾物路 100 号"
                        value={customer.address}
                        onChange={(e) =>
                          setCustomer({ ...customer, address: e.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                )}
              </div>
              <aside className="order-summary">
                <h3>订单小计</h3>
                <div>
                  <span>商品金额</span>
                  <span>{money(subtotal)}</span>
                </div>
                <div>
                  <span>运费</span>
                  <span>{shipping ? money(shipping) : "免运费"}</span>
                </div>
                <p className="shipping-hint">
                  {shipping
                    ? `再选 ${money(29900 - subtotal)} 即可免运费`
                    : "这份喜欢，包邮送达"}
                </p>
                <div className="summary-total">
                  <span>合计</span>
                  <strong>{money(subtotal + shipping)}</strong>
                </div>
                {checkoutError && (
                  <p className="inline-error" role="alert">
                    {checkoutError}
                  </p>
                )}
                {checkout ? (
                  <>
                    <button
                      className="primary full"
                      type="submit"
                      disabled={
                        submitting || unavailable || !connected || !lines.length
                      }
                    >
                      {submitting ? (
                        <>
                          <LoaderCircle size={17} className="spin" />
                          正在下单…
                        </>
                      ) : (
                        <>
                          提交演示订单
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-button full"
                      disabled={submitting}
                      onClick={() => {
                        setCheckout(false);
                        setCheckoutError("");
                      }}
                    >
                      返回购物车
                    </button>
                  </>
                ) : (
                  <button
                    className="primary full"
                    type="button"
                    disabled={unavailable || !connected || !lines.length}
                    onClick={() => setCheckout(true)}
                  >
                    去结算
                    <ArrowRight size={16} />
                  </button>
                )}
                <p className="demo-disclaimer">
                  仅演示下单流程
                  <br />
                  不会扣款，不会真实发货
                </p>
              </aside>
            </form>
          )}
        </Modal>
      )}
      {success && (
        <Modal title="订单已创建" onClose={() => setSuccess(null)}>
          <div className="success-content">
            <span className="success-icon">
              <Check size={32} />
            </span>
            <h2>喜欢的好物，已安排。</h2>
            <p>演示订单已保存，可以在「我的订单」查看。</p>
            <div className="success-receipt">
              <span>
                订单编号<strong>{success.orderNumber}</strong>
              </span>
              <span>
                订单金额<strong>{money(success.totalCents)}</strong>
              </span>
            </div>
            <p className="demo-disclaimer">
              这是演示订单，不会真实扣款或发货。
            </p>
            <button
              className="primary full"
              onClick={() => {
                setSuccess(null);
                setPage("orders");
              }}
            >
              查看我的订单
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
