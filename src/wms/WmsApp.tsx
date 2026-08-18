import './wms.css';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  Home,
  Menu,
  PackagePlus,
  PackageSearch,
  Save,
  Send,
  Settings2,
  Tags,
  Trash2,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { createContext, FormEvent, Fragment, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { z } from 'zod';
import { clearToken, downloadCsv, getCompanyId, setCompanyId as persistCompanyId, setToken, wmsApi } from './api';
import type {
  Catalogs,
  Company,
  Contact,
  DashboardData,
  ImportOrder,
  InboundOrder,
  AdminUser,
  InventoryBalance,
  InventoryUnit,
  KardexMovement,
  Location,
  OrderItem,
  OutboundOrder,
  Product,
  ProductCategory,
  Role,
  UserSession,
  Warehouse as WarehouseType,
} from './types';

const rolePermissionOptions = [
  ['dashboard:view', 'Ver dashboard'],
  ['products:manage', 'Gestionar productos'],
  ['inventory:view', 'Ver inventario'],
  ['warehouses:manage', 'Gestionar bodegas y ubicaciones'],
  ['inbound:manage', 'Gestionar recepciones'],
  ['outbound:manage', 'Gestionar despachos'],
  ['kardex:view', 'Ver Kardex'],
  ['adjustments:manage', 'Registrar ajustes'],
  ['contacts:manage', 'Gestionar clientes/proveedores'],
  ['reports:view', 'Ver reportes'],
  ['users:manage', 'Gestionar usuarios'],
  ['roles:manage', 'Gestionar roles'],
  ['delete:restricted', 'Eliminar registros permitidos'],
] as const;
const permissionLabel = (permission: string) => rolePermissionOptions.find(([value]) => value === permission)?.[1] ?? permission;
const statusLabels: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  BLOCKED: 'Bloqueado',
  DISPATCHED: 'Despachado',
  SHIPPED: 'Enviado',
  RETURNING: 'En devolucion',
  DRAFT: 'Borrador',
  PENDING: 'Por ingresar',
  REQUESTED: 'Pedido generado',
  RECEIVED: 'Ingresado',
  CANCELLED: 'Cancelada',
};

const movementLabels: Record<string, string> = {
  INBOUND: 'Ingreso',
  RESERVATION: 'Reserva',
  DISPATCH: 'Despacho',
  SHIPMENT: 'Envio',
  ADJUSTMENT_POSITIVE: 'Ajuste positivo',
  ADJUSTMENT_NEGATIVE: 'Ajuste negativo',
  BLOCK: 'Bloqueo',
  UNBLOCK: 'Desbloqueo',
  LOCATION_CHANGE: 'Cambio de ubicacion',
};

type AuthState = {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthContext no disponible');
  return context;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wmsApi
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const session = await wmsApi.login(email, password);
    setToken(session.token);
    setUser(session.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  useEffect(() => {
    if (!user) return undefined;
    let timeoutId = window.setTimeout(() => {
      clearToken();
      setUser(null);
      toast.info('Sesion cerrada por inactividad');
    }, 30 * 60 * 1000);
    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        clearToken();
        setUser(null);
        toast.info('Sesion cerrada por inactividad');
      }, 30 * 60 * 1000);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, resetTimeout, { passive: true }));
    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimeout));
    };
  }, [user]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <ScreenState title="Cargando sesion" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function ScreenState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="wms-shell grid min-h-screen place-items-center p-6">
      <div className="wms-card max-w-md p-6 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-orange-500" />
        <h1 className="text-xl font-bold">{title}</h1>
        {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
      </div>
    </div>
  );
}

function AppShell() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mundiwms-sidebar-collapsed') === 'true');
  const [companyId, setCompanyId] = useState(getCompanyId());
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const companies = useLoad<Company[]>(() => wmsApi.companies(), []);
  const selectedCompany = companies.data?.find((company) => company.id === companyId) ?? companies.data?.[0];
  const dashboard = useLoad<DashboardData>(() => wmsApi.dashboard(), [companyId]);
  const lowStock = dashboard.data?.lowStockProducts ?? [];
  useEffect(() => {
    localStorage.setItem('mundiwms-sidebar-collapsed', String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    if (!selectedCompany) return;
    document.documentElement.style.setProperty('--wms-primary', selectedCompany.primaryColor);
    document.documentElement.dataset.companyTheme = selectedCompany.theme;
  }, [selectedCompany]);
  const nav = [
    ['/', 'Dashboard', Home],
    ['/productos', 'Productos', PackageSearch],
    ['/categorias', 'Categorias', Tags],
    ['/inventario', 'Inventario', Boxes],
    ['/bodegas', 'Bodegas', Warehouse],
    ['/pedidos', 'Generar pedido', ClipboardList],
    ['/recepcion', 'Recepcion', PackagePlus],
    ['/despacho', 'Despacho', Truck],
    ['/kardex', 'Kardex', ClipboardList],
    ['/ajustes', 'Ajustes', Settings2],
    ['/clientes', 'Clientes', Users],
    ['/proveedores', 'Proveedores', Users],
    ['/reportes', 'Reportes', BarChart3],
    ...(user?.role === 'ADMIN' ? [['/administracion', 'Usuarios y roles', Users] as const] : []),
  ] as const;

  return (
    <div className={`wms-shell theme-${selectedCompany?.theme ?? 'orange'}`}>
      <div className={`wms-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`wms-sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
          <div className="wms-brand">
            <span className="wms-logo">CLV</span>
            <div className="wms-brand-text">
              <div>CLV WMS</div>
              <div className="text-xs font-semibold text-slate-500">Gestion ferretera</div>
            </div>
            <button className="wms-button wms-sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label="Guardar menu lateral">
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          <nav className="wms-nav">
            {nav.map(([to, label, Icon]) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="wms-sidebar-session">
            <div className="wms-sidebar-user">
              <div className="text-sm font-bold">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.roleName}</div>
            </div>
            <button
              className="wms-button wms-sidebar-logout"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Cerrar sesion
            </button>
          </div>
        </aside>
        <main className="wms-main">
          <header className="wms-header">
            <div className="wms-header-title flex items-center gap-3">
              <button className="wms-button wms-drawer-toggle" onClick={() => setOpen(true)} aria-label="Abrir menu">
                <Menu size={18} />
              </button>
              <div>
                <h1 className="text-lg font-extrabold">WMS</h1>
                <p className="text-sm text-slate-500">Ferreteria, bodega y distribucion</p>
              </div>
            </div>
            <div className="wms-header-actions flex items-center gap-3">
              {companies.data?.length ? (
                <label className="wms-company-select">
                  <span>Empresa</span>
                  <select
                    value={selectedCompany?.id ?? companyId}
                    onChange={(event) => {
                      persistCompanyId(event.target.value);
                      setCompanyId(event.target.value);
                    }}
                  >
                    {companies.data.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {lowStock.length ? (
                <button className="wms-header-alert" onClick={() => navigate('/')} title="Productos con bajo stock">
                  <AlertTriangle size={16} />
                  <span>{lowStock.length} bajo stock</span>
                </button>
              ) : null}
              <div className="hidden text-right sm:block">
                <div className="text-sm font-bold">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.roleName}</div>
              </div>
            </div>
          </header>
          <div className="wms-content" key={companyId}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/productos" element={<ProductsPage />} />
              <Route path="/categorias" element={<CategoriesPage />} />
              <Route path="/inventario" element={<InventoryPage />} />
              <Route path="/bodegas" element={<WarehousesPage />} />
              <Route path="/pedidos" element={<ImportOrdersPage />} />
              <Route path="/recepcion" element={<InboundPage />} />
              <Route path="/despacho" element={<OutboundPage />} />
              <Route path="/kardex" element={<KardexPage />} />
              <Route path="/ajustes" element={<AdjustmentsPage />} />
              <Route path="/clientes" element={<ContactsPage type="clients" />} />
              <Route path="/proveedores" element={<ContactsPage type="suppliers" />} />
              <Route path="/reportes" element={<ReportsPage />} />
              <Route path="/administracion" element={<AdminPage />} />
            </Routes>
          </div>
        </main>
      </div>
      {open ? <button className="fixed inset-0 z-10 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menu" /> : null}
    </div>
  );
}

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@mundiwms.local');
  const [password, setPassword] = useState('Admin123!');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success('Sesion iniciada');
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo iniciar sesion');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wms-shell grid min-h-screen place-items-center p-5">
      <form className="wms-card w-full max-w-md" onSubmit={submit}>
        <div className="wms-card-body grid gap-5">
          <div className="flex items-center gap-3">
            <span className="wms-logo">CLV</span>
            <div>
              <h1 className="text-2xl font-extrabold">CLV WMS</h1>
              <p className="text-sm text-slate-500">Operacion integral de ferreteria</p>
            </div>
          </div>
          <label className="wms-label">
            Email
            <input className="wms-input" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="wms-label">
            Contrasena
            <input className="wms-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="wms-button primary w-full" disabled={busy}>
            {busy ? 'Validando...' : 'Ingresar'}
          </button>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div>admin@mundiwms.local / Admin123!</div>
            <div>bodega@mundiwms.local / Bodega123!</div>
            <div>supervisor@mundiwms.local / Supervisor123!</div>
          </div>
        </div>
      </form>
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Badge({ value }: { value: string }) {
  const color = ['ACTIVE', 'AVAILABLE', 'RECEIVED', 'DISPATCHED'].includes(value)
    ? 'green'
    : ['DRAFT', 'PENDING', 'REQUESTED', 'RESERVED'].includes(value)
      ? 'amber'
      : ['CANCELLED', 'BLOCKED', 'INACTIVE'].includes(value)
        ? 'red'
        : 'slate';
  return <span className={`wms-badge ${color}`}>{statusLabels[value] ?? value}</span>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="wms-modal-backdrop">
      <section className="wms-modal">
        <div className="wms-card-header">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button className="wms-button" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="wms-card-body">{children}</div>
      </section>
    </div>
  );
}

function DataTable<T>({ data, columns, onRowClick }: { data: T[]; columns: ColumnDef<T>[]; onRowClick?: (row: T) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return (
    <div className="wms-table-wrap">
      <table className="wms-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={onRowClick ? 'wms-clickable-row' : ''} onClick={() => onRowClick?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
          {!data.length ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-slate-500">
                Sin registros
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = () => {
    setLoading(true);
    loader()
      .then(setData)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudo cargar'))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, deps);
  return { data, loading, refresh };
}

function DashboardPage() {
  const { data, loading } = useLoad<DashboardData>(() => wmsApi.dashboard(), []);
  if (loading || !data) return <ScreenState title="Calculando dashboard" />;
  const cards = [
    ['Recepciones abiertas', data.totals.inboundPending],
    ['Despachos abiertos', data.totals.outboundPending],
    ['Pendientes de cierre', data.totals.pendingClosure],
    ['Bajo stock', data.totals.lowStock],
  ];
  return (
    <>
      <PageTitle title="Dashboard" subtitle="Operacion, cierres pendientes y reposicion de inventario" />
      <div className="wms-grid cols-4 mb-5">
        {cards.map(([label, value]) => (
          <div className="wms-card wms-card-body" key={label}>
            <div className="text-sm font-bold text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-extrabold">{value}</div>
          </div>
        ))}
      </div>
      <div className="wms-grid cols-2 mb-5">
        <div className="wms-card">
          <div className="wms-card-header">
            <h3 className="font-extrabold">Productos con mas movimiento</h3>
          </div>
          <div className="wms-card-body h-80">
            <ResponsiveContainer>
              <BarChart data={data.topMovingProducts} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="sku" type="category" width={92} />
                <Tooltip />
                <Bar dataKey="movements" name="Movimientos" fill="#ea580c" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="wms-card">
          <div className="wms-card-header">
            <h3 className="font-extrabold">Productos con bajo stock</h3>
          </div>
          <div className="wms-card-body h-80">
            <ResponsiveContainer>
              <BarChart data={data.lowStockProducts} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sku" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="available" name="Disponible" fill="#ef4444" radius={[6, 6, 0, 0]} />
                <Bar dataKey="stockMin" name="Minimo" fill="#64748b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <MovementsCard movements={data.recentMovements} />
    </>
  );
}

function MovementsCard({ movements }: { movements: KardexMovement[] }) {
  return (
    <div className="wms-card">
      <div className="wms-card-header">
        <h3 className="font-extrabold">Ultimos movimientos</h3>
      </div>
      <DataTable
        data={movements}
        columns={[
          { header: 'Fecha', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
          { header: 'Tipo', accessorKey: 'type' },
          { header: 'SKU', cell: ({ row }) => row.original.product.sku },
          { header: 'Serie', cell: ({ row }) => row.original.inventoryUnit?.serialNumber ?? '-' },
          { header: 'Cantidad', accessorKey: 'quantity' },
          { header: 'Documento', cell: ({ row }) => row.original.documentNo },
        ]}
      />
    </div>
  );
}

const productSchema = z.object({
  sku: z.string().min(2),
  barcode: z.string().optional(),
  barcodesText: z.string().optional(),
  name: z.string().min(3),
  category: z.string().min(2),
  brand: z.string().min(2),
  description: z.string().optional(),
  includesText: z.string().optional(),
  sourceUrl: z.union([z.string().url(), z.literal('')]).optional(),
  unit: z.string().min(1),
  purchasePrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  stockMin: z.coerce.number().int().min(0),
  managesSerial: z.boolean(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  locationDefaults: z.array(z.object({ warehouseId: z.string(), locationId: z.string() })).default([]),
});

type ProductFormValues = z.infer<typeof productSchema>;

const categorySchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function ProductsPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const { data, loading, refresh } = useLoad<Product[]>(() => wmsApi.products(search), [search]);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const rows = data ?? [];
  const removeProduct = async (product: Product) => {
    try {
      const response = await wmsApi.deleteProduct(product.id);
      toast.success(response.mode === 'DELETED' ? 'Producto eliminado' : 'Producto inactivado por tener historial');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar');
    }
  };
  return (
    <>
      <PageTitle
        title="Productos / SKU"
        subtitle="SKU comerciales con unidades fisicas y series asociadas"
        action={
          <button className="wms-button primary" onClick={() => setEditing(null)}>
            <PackagePlus size={16} /> Nuevo producto
          </button>
        }
      />
      <div className="wms-card">
        <div className="wms-card-header">
          <ClearableInput className="max-w-md" placeholder="Buscar por SKU, codigo de barra, nombre, categoria, marca o descripcion" value={search} onChange={setSearch} />
        </div>
        {loading ? <div className="wms-card-body">Cargando...</div> : null}
        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Marca</th>
                <th>Precio venta</th>
                <th>Serie</th>
                <th>Disponible</th>
                <th>Reservado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => {
                const isOpen = expanded === product.id;
                const locations = buildProductLocationRows(product);
                const available = product.inventoryBalances?.filter((balance) => balance.status === 'AVAILABLE').reduce((sum, balance) => sum + balance.quantity, 0) ?? 0;
                const reserved = product.inventoryBalances?.filter((balance) => balance.status === 'RESERVED').reduce((sum, balance) => sum + balance.quantity, 0) ?? 0;
                return (
                  <Fragment key={product.id}>
                    <tr className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : product.id)}>
                      <td>
                        <div className="flex items-start gap-2">
                          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          <div>
                            <div className="font-extrabold">{product.sku}</div>
                            <div className="text-slate-600">{product.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>{product.category}</td>
                      <td>{product.brand}</td>
                      <td>${Number(product.salePrice ?? 0).toFixed(2)}</td>
                      <td>{product.managesSerial ? 'Si' : 'No'}</td>
                      <td>{available}</td>
                      <td>{reserved}</td>
                      <td><Badge value={product.status} /></td>
                      <td>
                        <div className="wms-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="wms-button" onClick={() => setEditing(product)}>
                            Editar
                          </button>
                          <button className="wms-button danger" disabled={!canDelete} title={canDelete ? 'Eliminar producto' : 'Solo administrador o supervisor'} onClick={() => removeProduct(product)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={9} className="bg-slate-50">
                          <div className="grid gap-3">
                            <div className="grid gap-1 text-sm text-slate-700">
                              <div><strong>Codigo de barra:</strong> {product.barcode || '-'}</div>
                              <div><strong>Codigos alternos:</strong> {product.barcodes?.length ? product.barcodes.join(', ') : '-'}</div>
                              <div><strong>Precio compra:</strong> ${Number(product.purchasePrice ?? 0).toFixed(2)}</div>
                              <div><strong>Descripcion:</strong> {product.description || '-'}</div>
                              <div><strong>Incluye:</strong> {product.includes?.length ? product.includes.join(', ') : '-'}</div>
                              <div><strong>Fuente:</strong> {product.sourceUrl ? <a className="text-orange-600 underline" href={product.sourceUrl} target="_blank" rel="noreferrer">Ver catalogo</a> : '-'}</div>
                            </div>
                            <div className="text-sm font-extrabold text-slate-700">Ubicaciones por bodega</div>
                            <table className="wms-inner-table">
                              <thead>
                                <tr>
                                  <th>Bodega</th>
                                  <th>Ubicacion</th>
                                  <th>Disponible</th>
                                  <th>Reservado</th>
                                  <th>Series disponibles/reservadas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {locations.map((location) => (
                                  <tr key={`${location.warehouse}-${location.location}`}>
                                    <td>{location.warehouse}</td>
                                    <td>{location.location}</td>
                                    <td>{location.available}</td>
                                    <td>{location.reserved}</td>
                                    <td>
                                      {location.series.length ? (
                                        <div className="flex flex-wrap gap-2">
                                          {location.series.map((unit) => (
                                            <span className="wms-badge slate" key={unit.id}>
                                              {unit.serialNumber} - {statusLabels[unit.status]}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-500">Sin series activas</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {!locations.length ? (
                                  <tr>
                                    <td colSpan={5} className="text-slate-500">Este producto todavia no tiene ubicaciones registradas.</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500">Sin productos para la busqueda aplicada</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {editing !== undefined && catalogs.data ? <ProductForm product={editing} catalogs={catalogs.data} onClose={() => setEditing(undefined)} onSaved={refresh} /> : null}
    </>
  );
}

function CategoriesPage() {
  const { user } = useAuth();
  const { data, loading, refresh } = useLoad<ProductCategory[]>(() => wmsApi.categories(), []);
  const [editing, setEditing] = useState<ProductCategory | null | undefined>(undefined);
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const removeCategory = async (category: ProductCategory) => {
    try {
      const response = await wmsApi.deleteCategory(category.id);
      toast.success(response.mode === 'DELETED' ? 'Categoria eliminada' : 'Categoria inactivada porque tiene productos');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar');
    }
  };

  return (
    <>
      <PageTitle
        title="Categorias"
        subtitle="Tipos de productos disponibles para el catalogo"
        action={<button className="wms-button primary" onClick={() => setEditing(null)}><Tags size={16} /> Nueva categoria</button>}
      />
      <div className="wms-card">
        {loading ? <div className="wms-card-body">Cargando...</div> : null}
        <DataTable
          data={data ?? []}
          columns={[
            { header: 'Codigo', accessorKey: 'code' },
            { header: 'Nombre', accessorKey: 'name' },
            { header: 'Productos', cell: ({ row }) => row.original._count?.products ?? 0 },
            { header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
            {
              header: 'Acciones',
              cell: ({ row }) => (
                <div className="wms-actions">
                  <button className="wms-button" onClick={() => setEditing(row.original)}>Editar</button>
                  <button className="wms-button danger" disabled={!canDelete} title={canDelete ? 'Eliminar categoria' : 'Solo administrador o supervisor'} onClick={() => removeCategory(row.original)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
      {editing !== undefined ? <CategoryForm category={editing} onClose={() => setEditing(undefined)} onSaved={refresh} /> : null}
    </>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: ProductCategory | null; onClose: () => void; onSaved: () => void }) {
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: category ?? { code: '', name: '', status: 'ACTIVE' },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await wmsApi.saveCategory(values, category?.id);
      toast.success('Categoria guardada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    }
  });

  return (
    <Modal title={category ? 'Editar categoria' : 'Nueva categoria'} onClose={onClose}>
      <form className="wms-grid" onSubmit={submit}>
        <label className="wms-label">
          Codigo
          <input className="wms-input" {...form.register('code')} placeholder="Opcional, se genera con el nombre" />
        </label>
        <label className="wms-label">
          Nombre
          <input className="wms-input" {...form.register('name')} placeholder="Ej. Herramientas" />
        </label>
        <label className="wms-label">
          Estado
          <select className="wms-select" {...form.register('status')}>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </label>
        <div className="wms-actions justify-end">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary"><Save size={16} /> Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

type ProductLocationRow = {
  warehouse: string;
  location: string;
  available: number;
  reserved: number;
  series: InventoryUnit[];
};

function buildProductLocationRows(product: Product): ProductLocationRow[] {
  const map = new Map<string, ProductLocationRow>();
  for (const balance of product.inventoryBalances ?? []) {
    const key = `${balance.warehouseId}-${balance.locationId}`;
    const row =
      map.get(key) ??
      {
        warehouse: balance.warehouse.name,
        location: balance.location.name,
        available: 0,
        reserved: 0,
        series: [],
      };
    if (balance.status === 'AVAILABLE') row.available += balance.quantity;
    if (balance.status === 'RESERVED') row.reserved += balance.quantity;
    map.set(key, row);
  }
  for (const unit of product.inventoryUnits ?? []) {
    const key = `${unit.warehouseId}-${unit.locationId}`;
    const row =
      map.get(key) ??
      {
        warehouse: unit.warehouse.name,
        location: unit.location.name,
        available: 0,
        reserved: 0,
        series: [],
      };
    row.series.push(unit);
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => `${a.warehouse}${a.location}`.localeCompare(`${b.warehouse}${b.location}`));
}

function ProductForm({ product, catalogs, onClose, onSaved }: { product: Product | null; catalogs: Catalogs; onClose: () => void; onSaved: () => void }) {
  const activeCategoryNames = catalogs.categories.filter((category) => category.status === 'ACTIVE').map((category) => category.name);
  const categoryOptions = product?.category && !activeCategoryNames.includes(product.category) ? [...activeCategoryNames, product.category] : activeCategoryNames;
  const [locationDefaults, setLocationDefaults] = useState(
    catalogs.warehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      locationId:
        product?.locationDefaults?.find((entry) => entry.warehouseId === warehouse.id)?.locationId ??
        catalogs.locations.find((location) => location.warehouseId === warehouse.id)?.id ??
        '',
    })),
  );
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          ...product,
          barcode: product.barcode ?? '',
          barcodesText: product.barcodes?.filter((barcode) => barcode !== product.barcode).join('\n') ?? '',
          description: product.description ?? '',
          includesText: product.includes?.join('\n') ?? '',
          sourceUrl: product.sourceUrl ?? '',
          purchasePrice: Number(product.purchasePrice ?? 0),
          salePrice: Number(product.salePrice ?? 0),
          locationDefaults: product.locationDefaults?.map((entry) => ({ warehouseId: entry.warehouseId, locationId: entry.locationId })) ?? [],
        }
      : { sku: '', barcode: '', barcodesText: '', name: '', category: categoryOptions[0] ?? '', brand: '', description: '', includesText: '', sourceUrl: '', unit: 'Unidad', purchasePrice: 0, salePrice: 0, stockMin: 1, managesSerial: false, status: 'ACTIVE', locationDefaults: [] },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const barcodes = values.barcodesText
        ?.split(/[\n,]+/)
        .map((barcode) => barcode.trim())
        .filter(Boolean) ?? [];
      const includes = values.includesText
        ?.split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean) ?? [];
      const { barcodesText, includesText, ...payload } = values;
      await wmsApi.saveProduct({ ...payload, barcodes, includes, locationDefaults: locationDefaults.filter((entry) => entry.locationId) }, product?.id);
      toast.success('Producto guardado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    }
  });
  return (
    <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form className="wms-grid cols-2" onSubmit={submit}>
        <label className="wms-label">
          SKU
          <input className="wms-input" {...form.register('sku')} />
        </label>
        <label className="wms-label">
          Codigo de barra principal
          <input className="wms-input" {...form.register('barcode')} placeholder="Opcional" />
        </label>
        <label className="wms-label">
          Nombre
          <input className="wms-input" {...form.register('name')} />
        </label>
        <label className="wms-label">
          Categoria
          <select className="wms-select" {...form.register('category')} disabled={!categoryOptions.length}>
            {!categoryOptions.length ? <option value="">Cree una categoria primero</option> : null}
            {categoryOptions.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="wms-label">
          Marca
          <input className="wms-input" {...form.register('brand')} />
        </label>
        <label className="wms-label">
          Unidad
          <input className="wms-input" {...form.register('unit')} />
        </label>
        <label className="wms-label col-span-full">
          Descripcion
          <textarea className="wms-textarea" {...form.register('description')} placeholder="Descripcion comercial del producto" />
        </label>
        <label className="wms-label col-span-full">
          Incluye
          <textarea className="wms-textarea" {...form.register('includesText')} placeholder="Uno por linea o separados por coma" />
        </label>
        <label className="wms-label col-span-full">
          URL fuente / catalogo
          <input className="wms-input" {...form.register('sourceUrl')} placeholder="Opcional" />
        </label>
        <label className="wms-label">
          Precio compra
          <input className="wms-input" type="number" step="0.01" {...form.register('purchasePrice')} />
        </label>
        <label className="wms-label">
          Precio venta
          <input className="wms-input" type="number" step="0.01" {...form.register('salePrice')} />
        </label>
        <label className="wms-label">
          Stock minimo
          <input className="wms-input" type="number" {...form.register('stockMin')} />
        </label>
        <label className="wms-label col-span-full">
          Codigos de barra alternos
          <textarea className="wms-textarea" {...form.register('barcodesText')} placeholder="Uno por linea o separados por coma" />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" {...form.register('managesSerial')} />
          Maneja serie
        </label>
        <label className="wms-label">
          Estado
          <select className="wms-select" {...form.register('status')}>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </label>
        <div className="col-span-full grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-extrabold text-slate-700">Ubicacion predeterminada por bodega</div>
          <div className="wms-grid cols-2">
            {catalogs.warehouses.map((warehouse) => {
              const current = locationDefaults.find((entry) => entry.warehouseId === warehouse.id);
              return (
                <label className="wms-label" key={warehouse.id}>
                  {warehouse.name}
                  <select
                    className="wms-select"
                    value={current?.locationId ?? ''}
                    onChange={(event) =>
                      setLocationDefaults((items) =>
                        items.map((entry) => (entry.warehouseId === warehouse.id ? { ...entry, locationId: event.target.value } : entry)),
                      )
                    }
                  >
                    {catalogs.locations
                      .filter((location) => location.warehouseId === warehouse.id)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" className="wms-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="wms-button primary">
            <Save size={16} /> Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InventoryPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moving, setMoving] = useState<InventoryUnit | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const query = `?search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`;
  const { data, loading, refresh } = useLoad(() => wmsApi.inventory(query), [query]);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const balances = data?.balances ?? [];
  const availableSeries = (data?.units ?? []).filter((unit) => unit.serialNumber && ['AVAILABLE', 'RESERVED'].includes(unit.status));
  const rows = filterInventoryRows(buildInventoryRows(balances, availableSeries), search);
  return (
    <>
      <PageTitle
        title="Inventario"
        subtitle="Stock consolidado por SKU; clic en el producto para ver series disponibles y reservadas"
        action={
          <button className="wms-button" onClick={() => setCreatingLocation(true)}>
            Nueva ubicacion
          </button>
        }
      />
      <div className="wms-card">
        <div className="wms-card-header flex-wrap">
          <ClearableInput className="max-w-md" placeholder="Buscar SKU, producto, serie, bodega o ubicacion" value={search} onChange={setSearch} />
          <select className="wms-select max-w-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            <option value="AVAILABLE">Disponible</option>
            <option value="RESERVED">Reservado</option>
            <option value="BLOCKED">Bloqueado</option>
            <option value="RETURNING">En devolucion</option>
          </select>
          <select className="wms-select max-w-xs" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">Todas las bodegas</option>
            {catalogs.data?.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? <div className="wms-card-body">Cargando...</div> : null}
        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Bodega</th>
                <th>Ubicacion</th>
                <th>Disponible</th>
                <th>Reservado</th>
                <th>Otros estados</th>
                <th>Series activas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row.product.id;
                const canExpand = row.product.managesSerial;
                return (
                  <Fragment key={row.product.id}>
                    <tr key={row.product.id} className={canExpand ? 'cursor-pointer' : ''} onClick={() => canExpand && setExpanded(isOpen ? null : row.product.id)}>
                      <td>
                        <div className="flex items-start gap-2">
                          {canExpand ? isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} /> : <span className="w-5" />}
                          <div>
                            <div className="font-extrabold">{row.product.sku}</div>
                            <div className="text-slate-600">{row.product.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.product.category}</td>
                      <td>{row.warehouses.join(', ')}</td>
                      <td>{row.locations.join(', ')}</td>
                      <td>{row.available}</td>
                      <td>{row.reserved}</td>
                      <td>{row.other}</td>
                      <td>{row.series.length}</td>
                    </tr>
                    {isOpen && canExpand ? (
                      <tr key={`${row.product.id}-series`}>
                        <td colSpan={8} className="bg-slate-50">
                          <div className="grid gap-3">
                            <div className="text-sm font-extrabold text-slate-700">Series disponibles y reservadas</div>
                            <table className="wms-inner-table">
                              <thead>
                                <tr>
                                  <th>Serie</th>
                                  <th>Estado</th>
                                  <th>Bodega</th>
                                  <th>Ubicacion</th>
                                  <th>Fecha de ingreso</th>
                                  <th>Accion</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.series.map((unit) => (
                                  <tr key={unit.id}>
                                    <td className="font-bold">{unit.serialNumber}</td>
                                    <td><Badge value={unit.status} /></td>
                                    <td>{unit.warehouse.name}</td>
                                    <td>{unit.location.name}</td>
                                    <td>{new Date(unit.createdAt).toLocaleDateString()}</td>
                                    <td>
                                      <button className="wms-button" onClick={(event) => { event.stopPropagation(); setMoving(unit); }}>
                                        Cambiar ubicacion
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {!row.series.length ? (
                                  <tr>
                                    <td colSpan={6} className="text-slate-500">No hay series disponibles o reservadas para este SKU.</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500">Sin inventario para la busqueda aplicada</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {moving && catalogs.data ? <MoveUnitModal unit={moving} catalogs={catalogs.data} onClose={() => setMoving(null)} onSaved={refresh} /> : null}
      {creatingLocation && catalogs.data ? <LocationForm catalogs={catalogs.data} onClose={() => setCreatingLocation(false)} onSaved={() => { catalogs.refresh(); setCreatingLocation(false); }} /> : null}
    </>
  );
}

type InventoryProductRow = {
  product: Product;
  available: number;
  reserved: number;
  other: number;
  warehouses: string[];
  locations: string[];
  series: InventoryUnit[];
};

function buildInventoryRows(balances: InventoryBalance[], series: InventoryUnit[]): InventoryProductRow[] {
  const map = new Map<string, InventoryProductRow>();
  const balanceProductIds = new Set<string>();
  for (const balance of balances) {
    balanceProductIds.add(balance.productId);
    const row =
      map.get(balance.productId) ??
      {
        product: balance.product,
        available: 0,
        reserved: 0,
        other: 0,
        warehouses: [],
        locations: [],
        series: [],
      };
    if (balance.status === 'AVAILABLE') row.available += balance.quantity;
    else if (balance.status === 'RESERVED') row.reserved += balance.quantity;
    else row.other += balance.quantity;
    if (!row.warehouses.includes(balance.warehouse.name)) row.warehouses.push(balance.warehouse.name);
    if (!row.locations.includes(balance.location.name)) row.locations.push(balance.location.name);
    map.set(balance.productId, row);
  }
  for (const unit of series) {
    const row =
      map.get(unit.productId) ??
      {
        product: unit.product,
        available: 0,
        reserved: 0,
        other: 0,
        warehouses: [unit.warehouse.name],
        locations: [unit.location.name],
        series: [],
      };
    row.series.push(unit);
    if (!row.warehouses.includes(unit.warehouse.name)) row.warehouses.push(unit.warehouse.name);
    if (!row.locations.includes(unit.location.name)) row.locations.push(unit.location.name);
    if (!balanceProductIds.has(unit.productId)) {
      if (unit.status === 'AVAILABLE') row.available += 1;
      else if (unit.status === 'RESERVED') row.reserved += 1;
    }
    map.set(unit.productId, row);
  }
  return Array.from(map.values()).sort((a, b) => a.product.sku.localeCompare(b.product.sku));
}

function filterInventoryRows(rows: InventoryProductRow[], search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => {
    const productText = `${row.product.sku} ${row.product.barcode ?? ''} ${(row.product.barcodes ?? []).join(' ')} ${row.product.name} ${row.product.category} ${row.product.brand} ${row.product.description ?? ''}`.toLowerCase();
    const locationText = `${row.warehouses.join(' ')} ${row.locations.join(' ')}`.toLowerCase();
    const seriesText = row.series.map((unit) => `${unit.serialNumber} ${unit.warehouse.name} ${unit.location.name}`).join(' ').toLowerCase();
    return productText.includes(term) || locationText.includes(term) || seriesText.includes(term);
  });
}

function MoveUnitModal({ unit, catalogs, onClose, onSaved }: { unit: InventoryUnit; catalogs: Catalogs; onClose: () => void; onSaved: () => void }) {
  const [toLocationId, setToLocationId] = useState(unit.locationId);
  const [reason, setReason] = useState(`Reubicacion de ${unit.serialNumber}`);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await wmsApi.saveAdjustment({
        type: 'RELOCATE',
        productId: unit.productId,
        inventoryUnitId: unit.id,
        quantity: 1,
        toLocationId,
        reason,
      });
      toast.success('Ubicacion actualizada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la ubicacion');
    }
  };
  return (
    <Modal title={`Cambiar ubicacion - ${unit.serialNumber}`} onClose={onClose}>
      <form className="wms-grid" onSubmit={submit}>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Ubicacion actual: <strong>{unit.warehouse.name} / {unit.location.name}</strong>
        </div>
        <label className="wms-label">
          Nueva ubicacion
          <select className="wms-select" value={toLocationId} onChange={(event) => setToLocationId(event.target.value)}>
            {catalogs.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.warehouse?.name} / {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="wms-label">
          Motivo
          <textarea className="wms-textarea" value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary">Guardar ubicacion</button>
        </div>
      </form>
    </Modal>
  );
}

function WarehouseForm({ warehouse, onClose, onSaved }: { warehouse: WarehouseType | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [name, setName] = useState(warehouse?.name ?? '');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await wmsApi.saveWarehouse({ code, name }, warehouse?.id);
      toast.success(warehouse ? 'Bodega actualizada' : 'Bodega creada');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la bodega');
    }
  };
  return (
    <Modal title={warehouse ? 'Editar bodega' : 'Nueva bodega'} onClose={onClose}>
      <form className="wms-grid cols-2" onSubmit={submit}>
        <label className="wms-label">
          Codigo
          <input className="wms-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="BQ" required />
        </label>
        <label className="wms-label">
          Nombre
          <input className="wms-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bodega Quito" required />
        </label>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

const locationKindLabels: Record<string, string> = {
  STORAGE: 'Almacenamiento',
  RECEIVING: 'Recepcion',
  DISPATCH: 'Despacho',
  BLOCKED: 'Bloqueados',
};

function locationLayoutCode(location: Pick<Location, 'zone' | 'aisle' | 'rack' | 'level' | 'position' | 'code'>) {
  const parts = [
    location.zone ? `Z${location.zone}` : '',
    location.aisle ? `P${location.aisle}` : '',
    location.rack ? `R${location.rack}` : '',
    location.level ? `N${location.level}` : '',
    location.position ? `U${location.position}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('-').toUpperCase() : location.code;
}

function getLocationStats(location: Location) {
  const balances = location.inventoryBalances ?? [];
  const total = balances.reduce((sum, balance) => sum + balance.quantity, 0);
  const available = balances.filter((balance) => balance.status === 'AVAILABLE').reduce((sum, balance) => sum + balance.quantity, 0);
  const reserved = balances.filter((balance) => balance.status === 'RESERVED').reduce((sum, balance) => sum + balance.quantity, 0);
  const products = new Set(balances.map((balance) => balance.product?.sku).filter(Boolean)).size;
  return { total, available, reserved, products };
}

function compareLocationLayout(a: Location, b: Location) {
  return [a.zone, a.aisle, a.rack, a.level, a.position, a.name].join('|').localeCompare([b.zone, b.aisle, b.rack, b.level, b.position, b.name].join('|'), 'es', { numeric: true });
}

function WarehouseLocationMap({ warehouse, locations, onEdit }: { warehouse: WarehouseType; locations: Location[]; onEdit: (location: Location) => void }) {
  const warehouseLocations = locations.filter((location) => location.warehouseId === warehouse.id).sort(compareLocationLayout);
  const aisles = Array.from(new Set(warehouseLocations.map((location) => location.aisle || 'General'))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  if (!warehouseLocations.length) {
    return <div className="wms-empty-map">Sin ubicaciones creadas para esta bodega.</div>;
  }

  return (
    <div className="wms-location-map">
      {aisles.map((aisle) => {
        const aisleLocations = warehouseLocations.filter((location) => (location.aisle || 'General') === aisle);
        const racks = Array.from(new Set(aisleLocations.map((location) => location.rack || 'Sin rack'))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
        return (
          <section className="wms-aisle" key={aisle}>
            <div className="wms-aisle-title">Pasillo {aisle}</div>
            <div className="wms-rack-row">
              {racks.map((rack) => {
                const rackLocations = aisleLocations.filter((location) => (location.rack || 'Sin rack') === rack).sort(compareLocationLayout);
                return (
                  <div className="wms-rack" key={`${aisle}-${rack}`}>
                    <div className="wms-rack-title">Rack {rack}</div>
                    <div className="wms-slot-grid">
                      {rackLocations.map((location) => {
                        const stats = getLocationStats(location);
                        const state = stats.total === 0 ? 'empty' : stats.reserved > 0 ? 'reserved' : 'filled';
                        return (
                          <button className={`wms-slot ${state}`} key={location.id} onClick={() => onEdit(location)} title={`${location.name} - ${stats.total} unidades`}>
                            <span>{location.level || 'N'}-{location.position || 'P'}</span>
                            <strong>{stats.total}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LocationForm({ catalogs, location, defaultWarehouseId, onClose, onSaved }: { catalogs: Catalogs; location?: Location | null; defaultWarehouseId?: string; onClose: () => void; onSaved: () => void }) {
  const [warehouseId, setWarehouseId] = useState(location?.warehouseId ?? defaultWarehouseId ?? catalogs.warehouses[0]?.id ?? '');
  const [code, setCode] = useState(location?.code ?? '');
  const [name, setName] = useState(location?.name ?? '');
  const [zone, setZone] = useState(location?.zone ?? '');
  const [aisle, setAisle] = useState(location?.aisle ?? '');
  const [rack, setRack] = useState(location?.rack ?? '');
  const [level, setLevel] = useState(location?.level ?? '');
  const [position, setPosition] = useState(location?.position ?? '');
  const [kind, setKind] = useState(location?.kind ?? 'STORAGE');
  const generatedCode = locationLayoutCode({ zone, aisle, rack, level, position, code });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await wmsApi.saveLocation({ warehouseId, code, name, zone, aisle, rack, level, position, kind }, location?.id);
      toast.success(location ? 'Ubicacion actualizada' : 'Ubicacion creada');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la ubicacion');
    }
  };
  return (
    <Modal title={location ? 'Editar ubicacion' : 'Nueva ubicacion de bodega'} onClose={onClose}>
      <form className="wms-grid cols-2" onSubmit={submit}>
        <label className="wms-label">
          Bodega
          <select className="wms-select" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            {catalogs.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </label>
        <label className="wms-label">
          Codigo
          <input className="wms-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="PAS-A1" required />
        </label>
        <div className="col-span-full rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-orange-950">
          Codigo sugerido: <strong>{generatedCode || 'Complete la estructura'}</strong>
          <button type="button" className="wms-button ml-3 min-h-0 py-1 text-xs" onClick={() => setCode(generatedCode)} disabled={!generatedCode}>
            Usar codigo
          </button>
        </div>
        <label className="wms-label col-span-full">
          Nombre
          <input className="wms-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Pasillo A - Rack 1" required />
        </label>
        <label className="wms-label">
          Tipo
          <select className="wms-select" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="STORAGE">Almacenamiento</option>
            <option value="RECEIVING">Recepcion</option>
            <option value="DISPATCH">Despacho</option>
            <option value="BLOCKED">Bloqueados</option>
          </select>
        </label>
        <label className="wms-label">
          Zona
          <input className="wms-input" value={zone} onChange={(event) => setZone(event.target.value)} placeholder="A" />
        </label>
        <label className="wms-label">
          Pasillo
          <input className="wms-input" value={aisle} onChange={(event) => setAisle(event.target.value)} placeholder="01" />
        </label>
        <label className="wms-label">
          Rack
          <input className="wms-input" value={rack} onChange={(event) => setRack(event.target.value)} placeholder="03" />
        </label>
        <label className="wms-label">
          Nivel
          <input className="wms-input" value={level} onChange={(event) => setLevel(event.target.value)} placeholder="02" />
        </label>
        <label className="wms-label">
          Posicion
          <input className="wms-input" value={position} onChange={(event) => setPosition(event.target.value)} placeholder="08" />
        </label>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary">Guardar ubicacion</button>
        </div>
      </form>
    </Modal>
  );
}

function WarehousesPage() {
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null | undefined>(undefined);
  const [editingLocation, setEditingLocation] = useState<{ location: Location | null; warehouseId?: string } | null>(null);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const warehouses = catalogs.data?.warehouses ?? [];
  const locations = catalogs.data?.locations ?? [];
  const removeWarehouse = async (warehouse: WarehouseType) => {
    try {
      await wmsApi.deleteWarehouse(warehouse.id);
      toast.success('Bodega eliminada');
      catalogs.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la bodega');
    }
  };
  const removeLocation = async (location: Location) => {
    try {
      await wmsApi.deleteLocation(location.id);
      toast.success('Ubicacion eliminada');
      catalogs.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la ubicacion');
    }
  };

  return (
    <>
      <PageTitle
        title="Bodegas"
        subtitle="Ubicaciones disponibles dentro de cada bodega"
        action={
          <button className="wms-button primary" onClick={() => setEditingWarehouse(null)}>
            <Warehouse size={16} /> Nueva bodega
          </button>
        }
      />
      <div className="wms-grid cols-2">
        {warehouses.map((warehouse) => {
          const warehouseLocations = locations.filter((location) => location.warehouseId === warehouse.id).sort(compareLocationLayout);
          const occupied = warehouseLocations.filter((location) => getLocationStats(location).total > 0).length;
          const available = warehouseLocations.length - occupied;
          const zones = new Set(warehouseLocations.map((location) => location.zone).filter(Boolean)).size;
          return (
            <section className="wms-card wms-warehouse-card" key={warehouse.id}>
              <div className="wms-card-header">
                <div>
                  <h3 className="text-lg font-extrabold">{warehouse.name}</h3>
                  <p className="text-sm text-slate-500">{warehouse.code}</p>
                </div>
                <div className="wms-actions">
                  <button className="wms-button" onClick={() => setEditingWarehouse(warehouse)}>Editar</button>
                  <button className="wms-button danger" onClick={() => removeWarehouse(warehouse)}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="wms-card-body grid gap-4">
                <div className="wms-location-summary">
                  <div><span>Total</span><strong>{warehouseLocations.length}</strong></div>
                  <div><span>Disponibles</span><strong>{available}</strong></div>
                  <div><span>Ocupadas</span><strong>{occupied}</strong></div>
                  <div><span>Zonas</span><strong>{zones}</strong></div>
                </div>
                <div className="wms-map-header">
                  <div>
                    <h4 className="font-extrabold">Mapa de racks y posiciones</h4>
                    <p className="text-xs text-slate-500">Clic en una posicion para editar su estructura.</p>
                  </div>
                  <button className="wms-button" onClick={() => setEditingLocation({ location: null, warehouseId: warehouse.id })}>
                    Nueva ubicacion
                  </button>
                </div>
                <WarehouseLocationMap warehouse={warehouse} locations={locations} onEdit={(location) => setEditingLocation({ location })} />
                <div className="wms-map-legend">
                  <span><i className="empty" /> Libre</span>
                  <span><i className="filled" /> Con stock</span>
                  <span><i className="reserved" /> Con reserva</span>
                </div>
                <div>
                  <div className="mb-2 text-sm font-extrabold text-slate-700">Listado de ubicaciones disponibles</div>
                  <div className="wms-table-wrap">
                    <table className="wms-table compact">
                      <thead>
                        <tr>
                          <th>Ubicacion</th>
                          <th>Tipo</th>
                          <th>Zona</th>
                          <th>Pasillo</th>
                          <th>Rack</th>
                          <th>Nivel</th>
                          <th>Posicion</th>
                          <th>Stock</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouseLocations.map((location) => {
                          const stats = getLocationStats(location);
                          return (
                            <tr key={location.id}>
                              <td>
                                <div className="font-extrabold">{location.name}</div>
                                <div className="text-xs text-slate-500">{location.code}</div>
                              </td>
                              <td>{locationKindLabels[location.kind ?? 'STORAGE'] ?? location.kind}</td>
                              <td>{location.zone || '-'}</td>
                              <td>{location.aisle || '-'}</td>
                              <td>{location.rack || '-'}</td>
                              <td>{location.level || '-'}</td>
                              <td>{location.position || '-'}</td>
                              <td>{stats.total ? `${stats.total} unid.` : <span className="text-emerald-700 font-bold">Libre</span>}</td>
                              <td>
                                <div className="wms-actions">
                                  <button className="wms-button" onClick={() => setEditingLocation({ location })}>Editar</button>
                                  <button className="wms-button danger" onClick={() => removeLocation(location)}><Trash2 size={15} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!warehouseLocations.length ? (
                          <tr>
                            <td colSpan={9} className="text-center text-slate-500">Sin ubicaciones en esta bodega.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {editingWarehouse !== undefined ? (
        <WarehouseForm
          warehouse={editingWarehouse}
          onClose={() => setEditingWarehouse(undefined)}
          onSaved={() => {
            catalogs.refresh();
            setEditingWarehouse(undefined);
          }}
        />
      ) : null}
      {editingLocation && catalogs.data ? (
        <LocationForm
          catalogs={catalogs.data}
          location={editingLocation.location}
          defaultWarehouseId={editingLocation.warehouseId}
          onClose={() => setEditingLocation(null)}
          onSaved={() => {
            catalogs.refresh();
            setEditingLocation(null);
          }}
        />
      ) : null}
    </>
  );
}

type LookupOption = { id: string; label: string; aliases?: string[] };

function SearchablePicker({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: LookupOption[];
  placeholder?: string;
  onChange: (id: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  const [text, setText] = useState(selected?.label ?? '');
  useEffect(() => {
    setText(selected?.label ?? '');
  }, [selected?.label]);

  const listId = `lookup-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const resolve = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    const match = options.find((option) => [option.label, option.id, ...(option.aliases ?? [])].some((entry) => entry.toLowerCase() === normalized));
    if (match) {
      onChange(match.id);
      setText(match.label);
    }
  };

  return (
    <label className="wms-label">
      {label}
      <input
        className="wms-input"
        list={listId}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          resolve(event.target.value);
        }}
        onBlur={() => resolve(text)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
    </label>
  );
}

function ClearableInput({
  value,
  onChange,
  placeholder,
  className = '',
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <div className={`wms-clearable ${className}`}>
      <input className="wms-input" type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <button type="button" className="wms-clear-button" onClick={() => onChange('')} aria-label="Limpiar busqueda">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function ProductSkuPicker({
  catalogs,
  productId,
  onChange,
  activeOnly = false,
}: {
  catalogs: Catalogs;
  productId: string;
  onChange: (productId: string) => void;
  activeOnly?: boolean;
}) {
  const productOptions = activeOnly ? catalogs.products.filter((entry) => entry.status === 'ACTIVE') : catalogs.products;
  const product = catalogs.products.find((entry) => entry.id === productId);
  const [sku, setSku] = useState(product?.sku ?? '');
  const listId = useMemo(() => `product-sku-options-${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    setSku(product?.sku ?? '');
  }, [product?.sku]);

  const selectSku = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    const match = productOptions.find(
      (entry) =>
        entry.sku.toLowerCase() === normalized ||
        entry.barcode?.toLowerCase() === normalized ||
        entry.barcodes?.some((barcode) => barcode.toLowerCase() === normalized),
    );
    if (match) {
      onChange(match.id);
      setSku(match.sku);
    }
  };

  return (
    <div className="wms-product-picker">
      <label className="wms-label">
        SKU
        <input
          className="wms-input"
          list={listId}
          value={sku}
          placeholder="Escanee o escriba SKU"
          onChange={(event) => {
            setSku(event.target.value);
            selectSku(event.target.value);
          }}
          onBlur={() => selectSku(sku)}
        />
        <datalist id={listId}>
          {productOptions.flatMap((entry) => [
            <option key={entry.id} value={entry.sku} />,
            ...(entry.barcodes ?? []).map((barcode) => <option key={`${entry.id}-${barcode}`} value={barcode} />),
          ])}
        </datalist>
      </label>
      <label className="wms-label">
        Descripcion
        <input className="wms-input" value={product?.name ?? ''} readOnly />
      </label>
    </div>
  );
}

function ContactPicker({
  label,
  contacts,
  value,
  onChange,
}: {
  label: string;
  contacts: Contact[];
  value: string;
  onChange: (id: string) => void;
}) {
  const contact = contacts.find((entry) => entry.id === value);
  const [name, setName] = useState(contact?.name ?? '');
  const [taxId, setTaxId] = useState(contact?.taxId ?? '');
  const nameListId = useMemo(() => `contact-name-${Math.random().toString(36).slice(2)}`, []);
  const taxListId = useMemo(() => `contact-tax-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name);
    setTaxId(contact.taxId);
  }, [contact]);

  const selectContact = (raw: string, field: 'name' | 'taxId') => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      onChange('');
      setName('');
      setTaxId('');
      return;
    }
    const match = contacts.find((entry) => (field === 'name' ? entry.name : entry.taxId).toLowerCase() === normalized);
    if (match) {
      onChange(match.id);
      setName(match.name);
      setTaxId(match.taxId);
      return;
    }
    onChange('');
    if (field === 'name') {
      setTaxId('');
    } else {
      setName('');
    }
  };

  return (
    <div className="wms-contact-picker">
      <label className="wms-label">
        {label}
        <input
          className="wms-input"
          list={nameListId}
          value={name}
          placeholder={`Nombre de ${label.toLowerCase()}`}
          onChange={(event) => {
            setName(event.target.value);
            selectContact(event.target.value, 'name');
          }}
          onBlur={() => selectContact(name, 'name')}
        />
        <datalist id={nameListId}>
          {contacts.map((entry) => (
            <option key={entry.id} value={entry.name} />
          ))}
        </datalist>
      </label>
      <label className="wms-label">
        RUC / identificacion
        <input
          className="wms-input"
          list={taxListId}
          value={taxId}
          placeholder="Escanee o escriba RUC"
          onChange={(event) => {
            setTaxId(event.target.value);
            selectContact(event.target.value, 'taxId');
          }}
          onBlur={() => selectContact(taxId, 'taxId')}
        />
        <datalist id={taxListId}>
          {contacts.map((entry) => (
            <option key={entry.id} value={entry.taxId} />
          ))}
        </datalist>
      </label>
    </div>
  );
}

function getProductDefaultLocation(catalogs: Catalogs, productId: string, warehouseId: string) {
  return catalogs.products.find((product) => product.id === productId)?.locationDefaults?.find((entry) => entry.warehouseId === warehouseId)?.locationId;
}

function getWarehouseDispatchLocation(catalogs: Catalogs, warehouseId: string) {
  return catalogs.locations.find((location) => location.warehouseId === warehouseId && location.code === 'DES')?.id;
}

function getAvailableInWarehouse(catalogs: Catalogs, productId: string, warehouseId: string) {
  return catalogs.products
    .find((product) => product.id === productId)
    ?.inventoryBalances?.filter((balance) => balance.warehouseId === warehouseId && balance.status === 'AVAILABLE')
    .reduce((sum, balance) => sum + balance.quantity, 0) ?? 0;
}

type OrderPayload = {
  supplierId?: string;
  clientId?: string;
  warehouseId: string;
  locationId: string;
  purchaseOrder?: string;
  status: string;
  notes: string;
  carrierName?: string;
  guideNumber?: string;
  items: OrderItem[];
};

function OrderReview({
  catalogs,
  mode,
  payload,
  estimatedOrderNo,
  onEdit,
  onConfirm,
}: {
  catalogs: Catalogs;
  mode: 'inbound' | 'outbound';
  payload: OrderPayload;
  estimatedOrderNo: string;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const party = mode === 'inbound'
    ? catalogs.suppliers.find((item) => item.id === payload.supplierId)
    : catalogs.clients.find((item) => item.id === payload.clientId);
  const warehouse = catalogs.warehouses.find((item) => item.id === payload.warehouseId);
  return (
    <div className="wms-grid">
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
        <div className="font-extrabold">{mode === 'inbound' ? 'Confirmar recepcion' : 'Confirmar despacho'}</div>
        <div>Numero de orden: {estimatedOrderNo}</div>
        <div>{mode === 'inbound' ? 'Proveedor' : 'Cliente'}: {party?.name ?? '-'}</div>
        <div>Bodega: {warehouse?.name ?? '-'}</div>
        <div>Orden de compra: {payload.purchaseOrder || '-'}</div>
      </div>
      <div className="wms-table-wrap">
        <table className="wms-table compact">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripcion</th>
              <th>Cantidad</th>
              <th>Series</th>
            </tr>
          </thead>
          <tbody>
            {payload.items.map((item, index) => {
              const product = catalogs.products.find((entry) => entry.id === item.productId);
              return (
                <tr key={`${item.productId}-${index}`}>
                  <td>{product?.sku ?? '-'}</td>
                  <td>{product?.name ?? '-'}</td>
                  <td>{item.quantity}</td>
                  <td>{item.serialNumbers.length ? item.serialNumbers.join(', ') : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="wms-actions justify-end">
        <button type="button" className="wms-button" onClick={onEdit}>Editar</button>
        <button type="button" className="wms-button primary" onClick={onConfirm}>
          {mode === 'inbound' ? 'Ingresar recepcion' : 'Crear despacho'}
        </button>
      </div>
    </div>
  );
}

function ShipmentReview({
  order,
  onSend,
  onEdit,
  onClose,
}: {
  order: OutboundOrder;
  onSend: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`Enviar despacho ${order.orderNo}`} onClose={onClose}>
      <div className="wms-grid">
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
          <div className="font-extrabold">Cliente: {order.client.name}</div>
          <div>Bodega: {order.warehouse.name}</div>
          <div>Orden de compra: {order.purchaseOrder || '-'}</div>
          <div>Documento: {order.orderNo}</div>
        </div>
        <div className="wms-table-wrap">
          <table className="wms-table compact">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripcion</th>
                <th>Cantidad</th>
                <th>Series</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id ?? item.productId}>
                  <td>{item.product?.sku}</td>
                  <td>{item.product?.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.serialNumbers.length ? item.serialNumbers.join(', ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wms-actions justify-end">
          <button className="wms-button" onClick={onEdit}>Editar</button>
          <button className="wms-button primary" onClick={onSend}>Enviar</button>
        </div>
      </div>
    </Modal>
  );
}

function OrderDetailModal({ type, order, onClose }: { type: 'inbound' | 'outbound'; order: InboundOrder | OutboundOrder; onClose: () => void }) {
  const party = 'supplier' in order ? order.supplier : order.client;
  return (
    <Modal title={`${type === 'inbound' ? 'Detalle recepcion' : 'Detalle despacho'} ${order.orderNo}`} onClose={onClose}>
      <div className="wms-grid">
        <div className="wms-detail-grid">
          <div><span>Documento</span><strong>{order.orderNo}</strong></div>
          <div><span>{type === 'inbound' ? 'Proveedor' : 'Cliente'}</span><strong>{party.name}</strong></div>
          <div><span>Identificacion/RUC</span><strong>{party.taxId}</strong></div>
          <div><span>Bodega</span><strong>{order.warehouse.name}</strong></div>
          <div><span>Orden de compra</span><strong>{order.purchaseOrder || '-'}</strong></div>
          <div><span>Estado</span><strong><Badge value={order.status} /></strong></div>
          <div><span>Usuario</span><strong>{order.createdBy?.name ?? '-'}</strong></div>
          <div><span>Fecha creacion</span><strong>{new Date(order.createdAt).toLocaleString()}</strong></div>
          <div><span>Fecha cierre</span><strong>{order.confirmedAt ? new Date(order.confirmedAt).toLocaleString() : '-'}</strong></div>
          {'carrierName' in order ? <div><span>Transportista</span><strong>{order.carrierName || '-'}</strong></div> : null}
          {'guideNumber' in order ? <div><span>Guia</span><strong>{order.guideNumber || '-'}</strong></div> : null}
          <div className="wms-detail-wide"><span>Observacion</span><strong>{order.notes || '-'}</strong></div>
        </div>
        <div className="wms-table-wrap">
          <table className="wms-table compact">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripcion</th>
                <th>Cantidad</th>
                <th>Series</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id ?? item.productId}>
                  <td>{item.product?.sku ?? '-'}</td>
                  <td>{item.product?.name ?? '-'}</td>
                  <td>{item.quantity}</td>
                  <td>{item.serialNumbers.length ? item.serialNumbers.join(', ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function OrderForm({
  catalogs,
  availableUnits,
  initialOrder,
  initialDraft,
  mode,
  onSubmit,
  onCancel,
}: {
  catalogs: Catalogs;
  availableUnits?: InventoryUnit[];
  initialOrder?: InboundOrder | OutboundOrder | null;
  initialDraft?: Partial<OrderPayload> | null;
  mode: 'inbound' | 'outbound';
  onSubmit: (payload: OrderPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultWarehouse = initialOrder?.warehouseId ?? initialDraft?.warehouseId ?? '';
  const defaultLocation =
    (mode === 'outbound' ? getWarehouseDispatchLocation(catalogs, defaultWarehouse) : undefined) ??
    catalogs.locations.find((location) => location.warehouseId === defaultWarehouse)?.id ??
    '';
  const [partyId, setPartyId] = useState(
    mode === 'inbound'
      ? ((initialOrder as InboundOrder | undefined)?.supplierId ?? initialDraft?.supplierId ?? '')
      : ((initialOrder as OutboundOrder | undefined)?.clientId ?? initialDraft?.clientId ?? ''),
  );
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse);
  const [locationId, setLocationId] = useState(initialOrder?.locationId ?? defaultLocation);
  const [notes, setNotes] = useState(initialOrder?.notes ?? initialDraft?.notes ?? '');
  const [purchaseOrder, setPurchaseOrder] = useState(initialOrder?.purchaseOrder ?? initialDraft?.purchaseOrder ?? '');
  const [carrierName, setCarrierName] = useState((initialOrder as InboundOrder | undefined)?.carrierName ?? initialDraft?.carrierName ?? '');
  const [guideNumber, setGuideNumber] = useState((initialOrder as InboundOrder | undefined)?.guideNumber ?? initialDraft?.guideNumber ?? '');
  const defaultProductId = '';
  const defaultProductLocation = getProductDefaultLocation(catalogs, defaultProductId, defaultWarehouse) ?? defaultLocation;
  const [items, setItems] = useState<OrderItem[]>(
    initialOrder?.items?.length
      ? initialOrder.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          locationId: item.locationId ?? defaultProductLocation,
          serialNumbers: item.serialNumbers,
        }))
      : initialDraft?.items?.length
        ? initialDraft.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            locationId: item.locationId ?? getProductDefaultLocation(catalogs, item.productId, defaultWarehouse) ?? defaultProductLocation,
            serialNumbers: item.serialNumbers ?? [],
          }))
      : [{ productId: defaultProductId, quantity: 1, locationId: defaultProductLocation, serialNumbers: [] }],
  );
  const [serialDrafts, setSerialDrafts] = useState<Record<number, string>>({});
  const [reviewPayload, setReviewPayload] = useState<OrderPayload | null>(null);
  const estimatedOrderNo = useMemo(() => {
    if (initialOrder?.orderNo) return initialOrder.orderNo;
    return `${mode === 'inbound' ? 'IN' : 'OUT'}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  }, [initialOrder?.orderNo, mode]);

  const locations = catalogs.locations.filter((location) => location.warehouseId === warehouseId);
  const updateItem = (index: number, patch: Partial<OrderItem>) => setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'draft' ? 'draft' : 'final';
    if (!partyId) {
      toast.error(`Seleccione ${mode === 'inbound' ? 'proveedor' : 'cliente'}`);
      return;
    }
    if (!warehouseId) {
      toast.error('Seleccione bodega');
      return;
    }
    if (!locationId) {
      toast.error('La bodega seleccionada no tiene ubicacion disponible');
      return;
    }
    const validItems = items.filter((item) => item.productId);
    if (!validItems.length) {
      toast.error('Ingrese al menos un SKU');
      return;
    }
    const payload = {
      ...(mode === 'inbound' ? { supplierId: partyId } : { clientId: partyId }),
      warehouseId,
      locationId,
      purchaseOrder,
      status: intent === 'draft' ? 'DRAFT' : mode === 'inbound' ? 'PENDING' : 'DISPATCHED',
      notes,
      carrierName,
      guideNumber,
      items: validItems,
    };
    if (intent === 'draft') {
      try {
        await onSubmit(payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Operacion no completada');
      }
      return;
    }
    setReviewPayload(payload);
  };

  if (reviewPayload) {
    return (
      <OrderReview
        catalogs={catalogs}
        mode={mode}
        payload={reviewPayload}
        estimatedOrderNo={estimatedOrderNo}
        onEdit={() => setReviewPayload(null)}
        onConfirm={() => onSubmit(reviewPayload).catch((error) => toast.error(error instanceof Error ? error.message : 'Operacion no completada'))}
      />
    );
  }

  return (
    <form className="wms-grid" onSubmit={submit}>
      <div className="wms-grid cols-2">
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
          <div className="text-xs font-bold uppercase text-orange-800">Numero de orden</div>
          <div className="text-lg font-extrabold text-orange-950">{estimatedOrderNo}</div>
        </div>
        <ContactPicker label={mode === 'inbound' ? 'Proveedor' : 'Cliente'} contacts={mode === 'inbound' ? catalogs.suppliers : catalogs.clients} value={partyId} onChange={setPartyId} />
        <label className="wms-label">
          Orden de compra
          <input className="wms-input" value={purchaseOrder} onChange={(event) => setPurchaseOrder(event.target.value)} placeholder={mode === 'inbound' ? 'OC proveedor / compra' : 'OC del cliente'} />
        </label>
        <label className="wms-label">
          Bodega
          <select
            className="wms-select"
            value={warehouseId}
            onChange={(event) => {
              const nextWarehouseId = event.target.value;
              const nextLocationId = getWarehouseDispatchLocation(catalogs, nextWarehouseId) ?? catalogs.locations.find((location) => location.warehouseId === nextWarehouseId)?.id ?? '';
              setWarehouseId(event.target.value);
              setLocationId(nextLocationId);
              setItems((current) => current.map((item) => ({ ...item, locationId: getProductDefaultLocation(catalogs, item.productId, nextWarehouseId) ?? nextLocationId })));
            }}
          >
            <option value="">Seleccione bodega</option>
            {catalogs.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mode === 'inbound' ? (
        <div className="wms-grid cols-2">
          <label className="wms-label">
            Transportista
            <input className="wms-input" value={carrierName} onChange={(event) => setCarrierName(event.target.value)} placeholder="Opcional" />
          </label>
          <label className="wms-label">
            Numero de guia
            <input className="wms-input" value={guideNumber} onChange={(event) => setGuideNumber(event.target.value)} placeholder="Opcional" />
          </label>
        </div>
      ) : null}
      <label className="wms-label">
        Observacion
        <textarea className="wms-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="wms-grid">
        {items.map((item, index) => {
          const product = catalogs.products.find((entry) => entry.id === item.productId);
          const serialOptions = availableUnits?.filter((unit) => unit.productId === item.productId && unit.warehouseId === warehouseId && unit.status === 'AVAILABLE' && unit.serialNumber) ?? [];
          return (
            <div className="wms-order-line-card" key={`${item.productId || 'blank'}-${index}`}>
              <div className="wms-order-line">
                <ProductSkuPicker
                  catalogs={catalogs}
                  productId={item.productId}
                  activeOnly={mode === 'outbound'}
                  onChange={(productId) =>
                    updateItem(index, {
                      productId,
                      locationId: getProductDefaultLocation(catalogs, productId, warehouseId) ?? locationId,
                      serialNumbers: [],
                    })
                  }
                />
                <label className="wms-label">
                  Cantidad
                  <input className="wms-input" type="number" min={1} value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                </label>
                {mode === 'outbound' ? (
                  <label className="wms-label">
                    Disponible bodega
                    <input className="wms-input" value={item.productId ? getAvailableInWarehouse(catalogs, item.productId, warehouseId) : ''} readOnly />
                  </label>
                ) : null}
                <button type="button" className="wms-button danger self-end" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Quitar
                </button>
              </div>
              {product?.managesSerial ? (
                mode === 'inbound' ? (
                  <div className="wms-grid">
                    <label className="wms-label">
                      Series una por linea o separadas por coma
                      <textarea
                        className="wms-textarea"
                        value={item.serialNumbers.join('\n')}
                        onChange={(event) =>
                          updateItem(index, {
                            serialNumbers: event.target.value
                              .split(/[\n,]+/)
                              .map((serial) => serial.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <label className="wms-label">
                      Escanear o escribir serie
                      <input
                        className="wms-input"
                        list={`serial-options-${index}`}
                        value={serialDrafts[index] ?? ''}
                        onChange={(event) => setSerialDrafts((current) => ({ ...current, [index]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          const scanned = (serialDrafts[index] ?? '').trim().toUpperCase();
                          const unit = serialOptions.find((entry) => entry.serialNumber?.toUpperCase() === scanned);
                          if (!unit || item.serialNumbers.includes(unit.serialNumber!)) return;
                          const next = [...item.serialNumbers, unit.serialNumber!];
                          updateItem(index, { serialNumbers: next, quantity: next.length });
                          setSerialDrafts((current) => ({ ...current, [index]: '' }));
                        }}
                      />
                      <datalist id={`serial-options-${index}`}>
                        {serialOptions.map((unit) => (
                          <option key={unit.id} value={unit.serialNumber ?? ''} />
                        ))}
                      </datalist>
                    </label>
                    <div className="text-sm font-bold text-slate-700">Series disponibles</div>
                    <div className="grid max-h-40 gap-2 overflow-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                      {serialOptions.map((unit) => (
                        <label key={unit.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.serialNumbers.includes(unit.serialNumber!)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...item.serialNumbers, unit.serialNumber!]
                                : item.serialNumbers.filter((serial) => serial !== unit.serialNumber);
                              updateItem(index, { serialNumbers: next, quantity: next.length || item.quantity });
                            }}
                          />
                          {unit.serialNumber} - {unit.location.name}
                        </label>
                      ))}
                      {!serialOptions.length ? <span className="text-sm text-slate-500">Sin series disponibles</span> : null}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="wms-actions justify-between">
        <button type="button" className="wms-button" onClick={() => setItems((current) => [...current, { productId: '', quantity: 1, locationId, serialNumbers: [] }])}>
          Agregar producto
        </button>
        <div className="wms-actions">
          <button type="button" className="wms-button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="wms-button" name="intent" value="draft">
            <Save size={16} />
            Guardar borrador
          </button>
          <button className="wms-button primary" name="intent" value="final">
            {mode === 'outbound' ? <Send size={16} /> : <Save size={16} />}
            {mode === 'outbound' ? 'Finalizar despacho' : 'Finalizar recepcion'}
          </button>
        </div>
      </div>
    </form>
  );
}

function InboundPage() {
  const [creating, setCreating] = useState(false);
  const [prefillOrder, setPrefillOrder] = useState<InboundOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<InboundOrder | null>(null);
  const [sourceImportOrder, setSourceImportOrder] = useState<ImportOrder | null>(null);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const orders = useLoad(() => wmsApi.inbound(), []);
  const importOrders = useLoad(() => wmsApi.importOrders(), []);
  const pendingImportOrders = (importOrders.data ?? []).filter((order) => order.status === 'REQUESTED');
  const refresh = () => {
    orders.refresh();
    importOrders.refresh();
  };
  const action = async (promise: Promise<unknown>, message: string) => {
    try {
      await promise;
      toast.success(message);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operacion no completada');
    }
  };
  return (
    <>
      <PageTitle title="Recepcion de mercaderia" subtitle="Crea, edita, cancela y confirma entradas con Kardex" action={<button className="wms-button primary" onClick={() => setCreating(true)}><PackagePlus size={16} /> Nueva recepcion</button>} />
      {pendingImportOrders.length ? (
        <div className="wms-card mb-5">
          <div className="wms-card-header">
            <div>
              <h3 className="text-base font-extrabold">Pedidos pendientes de recibir</h3>
              <p className="text-sm text-slate-500">Seleccione un pedido generado y complete bodega, ubicacion y series al recibir.</p>
            </div>
          </div>
          <DataTable
            data={pendingImportOrders}
            columns={[
              { header: 'Pedido', accessorKey: 'orderNo' },
              { header: 'Proveedor', cell: ({ row }) => row.original.supplier.name },
              { header: 'OC', cell: ({ row }) => row.original.purchaseOrder || '-' },
              { header: 'Items', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} x${item.quantity}`).join(', ') },
              { header: 'Fecha', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
              {
                header: 'Accion',
                cell: ({ row }) => (
                  <button className="wms-button primary" onClick={() => { setSourceImportOrder(row.original); setCreating(true); }}>
                    Recibir
                  </button>
                ),
              },
            ]}
          />
        </div>
      ) : null}
      <OrdersTable
        type="inbound"
        data={orders.data ?? []}
        onView={(order) => setDetailOrder(order as InboundOrder)}
        onEdit={(order) => {
          setPrefillOrder(order as InboundOrder);
          setCreating(true);
        }}
        onConfirm={(id) => action(wmsApi.confirmInbound(id), 'Recepcion confirmada')}
        onCancel={(id) => action(wmsApi.cancelInbound(id), 'Recepcion cancelada')}
      />
      {creating && catalogs.data ? (
        <Modal title={prefillOrder ? 'Editar recepcion' : sourceImportOrder ? `Recibir pedido ${sourceImportOrder.orderNo}` : 'Nueva recepcion'} onClose={() => { setCreating(false); setPrefillOrder(null); setSourceImportOrder(null); }}>
          <OrderForm
            catalogs={catalogs.data}
            mode="inbound"
            initialOrder={prefillOrder}
            initialDraft={sourceImportOrder ? {
              supplierId: sourceImportOrder.supplierId,
              purchaseOrder: sourceImportOrder.purchaseOrder ?? '',
              notes: `Recepcion generada desde pedido ${sourceImportOrder.orderNo}`,
              items: sourceImportOrder.items.map((item) => ({ productId: item.productId, quantity: item.quantity, serialNumbers: [] })),
            } : null}
            onCancel={() => { setCreating(false); setPrefillOrder(null); setSourceImportOrder(null); }}
            onSubmit={async (payload) => {
              const order = await wmsApi.saveInbound(payload, prefillOrder?.id);
              if (payload.status === 'PENDING') {
                await wmsApi.confirmInbound(order.id);
                if (sourceImportOrder) await wmsApi.completeImportOrder(sourceImportOrder.id);
                toast.success('Recepcion ingresada al inventario');
              } else {
                toast.success('Recepcion guardada como borrador');
              }
              setCreating(false);
              setPrefillOrder(null);
              setSourceImportOrder(null);
              refresh();
            }}
          />
        </Modal>
      ) : null}
      {detailOrder ? <OrderDetailModal type="inbound" order={detailOrder} onClose={() => setDetailOrder(null)} /> : null}
    </>
  );
}

function OutboundPage() {
  const [creating, setCreating] = useState(false);
  const [prefillOrder, setPrefillOrder] = useState<OutboundOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<OutboundOrder | null>(null);
  const [shippingReview, setShippingReview] = useState<OutboundOrder | null>(null);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const orders = useLoad(() => wmsApi.outbound(), []);
  const inventory = useLoad(() => wmsApi.inventory('?status=AVAILABLE'), []);
  const refresh = () => {
    orders.refresh();
    inventory.refresh();
  };
  const action = async (promise: Promise<unknown>, message: string) => {
    try {
      await promise;
      toast.success(message);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operacion no completada');
    }
  };
  return (
    <>
      <PageTitle title="Despachos / envio" subtitle="Prepara despachos y confirma el envio final" action={<button className="wms-button primary" onClick={() => setCreating(true)}><Send size={16} /> Nuevo despacho</button>} />
      <OrdersTable
        type="outbound"
        data={orders.data ?? []}
        onView={(order) => setDetailOrder(order as OutboundOrder)}
        onEdit={(order) => {
          setPrefillOrder(order as OutboundOrder);
          setCreating(true);
        }}
        onReserve={(id) => action(wmsApi.reserveOutbound(id), 'Stock reservado')}
        onConfirm={(id) => action(wmsApi.dispatchOutbound(id), 'Despacho confirmado')}
        onShip={(id) => {
          const order = orders.data?.find((item) => item.id === id) as OutboundOrder | undefined;
          if (order) setShippingReview(order);
        }}
        onCancel={(id) => action(wmsApi.cancelOutbound(id), 'Orden cancelada')}
      />
      {creating && catalogs.data ? (
        <Modal title={prefillOrder ? 'Editar despacho' : 'Nueva salida'} onClose={() => { setCreating(false); setPrefillOrder(null); }}>
          <OrderForm
            catalogs={catalogs.data}
            availableUnits={inventory.data?.units}
            initialOrder={prefillOrder}
            mode="outbound"
            onCancel={() => { setCreating(false); setPrefillOrder(null); }}
            onSubmit={async (payload) => {
              const order = await wmsApi.saveOutbound(payload, prefillOrder?.id);
              toast.success(payload.status === 'DRAFT' ? 'Despacho guardado y stock reservado' : 'Despacho finalizado');
              if (payload.status === 'DISPATCHED') {
                setShippingReview(order as OutboundOrder);
              }
              setCreating(false);
              setPrefillOrder(null);
              refresh();
            }}
          />
        </Modal>
      ) : null}
      {shippingReview ? (
        <ShipmentReview
          order={shippingReview}
          onClose={() => setShippingReview(null)}
          onSend={() => action(wmsApi.shipOutbound(shippingReview.id), 'Envio confirmado').then(() => setShippingReview(null))}
          onEdit={() => {
            action(wmsApi.cancelOutbound(shippingReview.id), 'Despacho liberado para edicion').then(() => {
              setPrefillOrder(shippingReview);
              setShippingReview(null);
              setCreating(true);
            });
          }}
        />
      ) : null}
      {detailOrder ? <OrderDetailModal type="outbound" order={detailOrder} onClose={() => setDetailOrder(null)} /> : null}
    </>
  );
}

function OrdersTable({
  type,
  data,
  onView,
  onEdit,
  onConfirm,
  onReserve,
  onShip,
  onCancel,
}: {
  type: 'inbound' | 'outbound';
  data: (InboundOrder | OutboundOrder)[];
  onView: (order: InboundOrder | OutboundOrder) => void;
  onEdit: (order: InboundOrder | OutboundOrder) => void;
  onConfirm: (id: string) => void;
  onReserve?: (id: string) => void;
  onShip?: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="wms-card">
      <DataTable
        data={data}
        columns={[
          { header: 'Documento', accessorKey: 'orderNo' },
          { header: type === 'inbound' ? 'Proveedor' : 'Cliente', cell: ({ row }) => ('supplier' in row.original ? row.original.supplier.name : row.original.client.name) },
          { header: 'OC', cell: ({ row }) => row.original.purchaseOrder || '-' },
          { header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
          { header: 'Items', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} x${item.quantity}`).join(', ') },
          { header: 'Fecha', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
          {
            header: 'Acciones',
            cell: ({ row }) => (
              <div className="wms-actions" onClick={(event) => event.stopPropagation()}>
                {['DRAFT', 'PENDING', 'RESERVED'].includes(row.original.status) ? (
                  <button className="wms-button" onClick={() => onEdit(row.original)}>
                    Editar
                  </button>
                ) : null}
                {type === 'outbound' && row.original.status === 'DISPATCHED' ? (
                  <button className="wms-button primary" onClick={() => onShip?.(row.original.id)}>
                    Enviar
                  </button>
                ) : null}
                {['DRAFT', 'PENDING', 'RESERVED'].includes(row.original.status) ? (
                  <button className="wms-button primary" onClick={() => onConfirm(row.original.id)}>
                    {type === 'outbound' ? 'Finalizar despacho' : 'Confirmar'}
                  </button>
                ) : null}
                {['DRAFT', 'PENDING', 'RESERVED', 'DISPATCHED'].includes(row.original.status) && row.original.status !== 'SHIPPED' ? (
                  <button className="wms-button danger" onClick={() => onCancel(row.original.id)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        onRowClick={onView}
      />
    </div>
  );
}

type ImportOrderPayload = {
  supplierId: string;
  purchaseOrder?: string;
  status: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
};

function printImportOrderPdf(order: ImportOrder) {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>${item.product?.sku ?? '-'}</td>
          <td>${item.product?.name ?? '-'}</td>
          <td>${item.quantity}</td>
        </tr>
      `,
    )
    .join('');
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    toast.error('El navegador bloqueo la ventana del PDF');
    return;
  }
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${order.orderNo}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          h1 { margin: 0 0 6px; font-size: 22px; }
          .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; margin: 18px 0; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #d1d5db; padding: 9px 10px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <h1>Pedido de importacion ${order.orderNo}</h1>
        <div class="meta">
          <div><strong>Proveedor:</strong> ${order.supplier.name}</div>
          <div><strong>RUC:</strong> ${order.supplier.taxId}</div>
          <div><strong>Orden de compra:</strong> ${order.purchaseOrder || '-'}</div>
          <div><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleString()}</div>
          <div><strong>Estado:</strong> ${statusLabels[order.status] ?? order.status}</div>
        </div>
        <table>
          <thead>
            <tr><th>SKU</th><th>Descripcion</th><th>Cantidad pedida</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

function ImportOrderForm({
  catalogs,
  initialOrder,
  onSubmit,
  onCancel,
}: {
  catalogs: Catalogs;
  initialOrder?: ImportOrder | null;
  onSubmit: (payload: ImportOrderPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [supplierId, setSupplierId] = useState(initialOrder?.supplierId ?? '');
  const [purchaseOrder, setPurchaseOrder] = useState(initialOrder?.purchaseOrder ?? '');
  const [notes, setNotes] = useState(initialOrder?.notes ?? '');
  const [items, setItems] = useState(
    initialOrder?.items.length
      ? initialOrder.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      : [{ productId: '', quantity: 1 }],
  );
  const updateItem = (index: number, patch: Partial<{ productId: string; quantity: number }>) => setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'draft' ? 'DRAFT' : 'REQUESTED';
    const validItems = items.filter((item) => item.productId && item.quantity > 0);
    if (!supplierId) return toast.error('Seleccione proveedor');
    if (!validItems.length) return toast.error('Ingrese al menos un producto');
    await onSubmit({ supplierId, purchaseOrder, status: intent, notes, items: validItems });
  };

  return (
    <form className="wms-grid" onSubmit={submit}>
      <div className="wms-grid cols-2">
        <ContactPicker label="Proveedor" contacts={catalogs.suppliers} value={supplierId} onChange={setSupplierId} />
        <label className="wms-label">
          Orden de compra
          <input className="wms-input" value={purchaseOrder} onChange={(event) => setPurchaseOrder(event.target.value)} placeholder="OC de importacion" />
        </label>
      </div>
      <label className="wms-label">
        Observacion
        <textarea className="wms-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="wms-grid">
        {items.map((item, index) => (
          <div className="wms-order-line-card" key={`${item.productId || 'blank'}-${index}`}>
            <div className="wms-order-line import">
              <ProductSkuPicker catalogs={catalogs} productId={item.productId} activeOnly onChange={(productId) => updateItem(index, { productId })} />
              <label className="wms-label">
                Cantidad pedida
                <input className="wms-input" type="number" min={1} value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
              </label>
              <button type="button" className="wms-button danger self-end" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="wms-actions justify-between">
        <button type="button" className="wms-button" onClick={() => setItems((current) => [...current, { productId: '', quantity: 1 }])}>
          Agregar producto
        </button>
        <div className="wms-actions">
          <button type="button" className="wms-button" onClick={onCancel}>Cancelar</button>
          <button className="wms-button" name="intent" value="draft"><Save size={16} /> Guardar borrador</button>
          <button className="wms-button primary" name="intent" value="final"><ClipboardList size={16} /> Generar pedido</button>
        </div>
      </div>
    </form>
  );
}

function ImportOrdersPage() {
  const [creating, setCreating] = useState(false);
  const [prefillOrder, setPrefillOrder] = useState<ImportOrder | null>(null);
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const orders = useLoad(() => wmsApi.importOrders(), []);
  const refresh = () => orders.refresh();
  const action = async (promise: Promise<unknown>, message: string) => {
    try {
      await promise;
      toast.success(message);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operacion no completada');
    }
  };
  return (
    <>
      <PageTitle title="Generar nuevo pedido" subtitle="Pedido esperado de importacion; no incluye series hasta la recepcion final" action={<button className="wms-button primary" onClick={() => setCreating(true)}><ClipboardList size={16} /> Nuevo pedido</button>} />
      <div className="wms-card">
        <DataTable
          data={orders.data ?? []}
          columns={[
            { header: 'Pedido', accessorKey: 'orderNo' },
            { header: 'Proveedor', cell: ({ row }) => row.original.supplier.name },
            { header: 'OC', cell: ({ row }) => row.original.purchaseOrder || '-' },
            { header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
            { header: 'Items', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} x${item.quantity}`).join(', ') },
            { header: 'Fecha', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
            {
              header: 'Acciones',
              cell: ({ row }) => (
                <div className="wms-actions" onClick={(event) => event.stopPropagation()}>
                  {row.original.status !== 'CANCELLED' ? (
                    <>
                      <button className="wms-button" onClick={() => { setPrefillOrder(row.original); setCreating(true); }}>Editar</button>
                      <button className="wms-button" onClick={() => printImportOrderPdf(row.original)}><FileDown size={16} /> PDF</button>
                      <button className="wms-button danger" onClick={() => action(wmsApi.cancelImportOrder(row.original.id), 'Pedido cancelado')}>Cancelar</button>
                    </>
                  ) : (
                    <button className="wms-button" onClick={() => printImportOrderPdf(row.original)}><FileDown size={16} /> PDF</button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
      {creating && catalogs.data ? (
        <Modal title={prefillOrder ? 'Editar pedido' : 'Generar nuevo pedido'} onClose={() => { setCreating(false); setPrefillOrder(null); }}>
          <ImportOrderForm
            catalogs={catalogs.data}
            initialOrder={prefillOrder}
            onCancel={() => { setCreating(false); setPrefillOrder(null); }}
            onSubmit={async (payload) => {
              await wmsApi.saveImportOrder(payload, prefillOrder?.id);
              toast.success(payload.status === 'DRAFT' ? 'Pedido guardado como borrador' : 'Pedido generado');
              setCreating(false);
              setPrefillOrder(null);
              refresh();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function KardexPage() {
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = `?search=${encodeURIComponent(search)}${product ? `&product=${encodeURIComponent(product)}` : ''}${type ? `&type=${type}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const { data } = useLoad(() => wmsApi.kardex(query), [query]);
  const rows = data ?? [];
  return (
    <>
      <PageTitle
        title="Kardex / movimientos"
        subtitle="Historial generado por recepciones, reservas, despachos y ajustes"
        action={<button className="wms-button" onClick={() => downloadCsv('kardex.csv', rows.map(flatMovement))}><FileDown size={16} /> CSV</button>}
      />
      <div className="wms-card">
        <div className="wms-card-header flex-wrap">
          <ClearableInput className="max-w-xs" placeholder="Serie, SKU, producto o categoria" value={search} onChange={setSearch} />
          <ClearableInput className="max-w-xs" placeholder="Filtro exclusivo SKU o producto" value={product} onChange={setProduct} />
          <select className="wms-select max-w-xs" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Todos</option>
            {['INBOUND', 'RESERVATION', 'DISPATCH', 'SHIPMENT', 'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE', 'BLOCK', 'UNBLOCK', 'LOCATION_CHANGE'].map((item) => (
              <option key={item} value={item}>{movementLabels[item] ?? item}</option>
            ))}
          </select>
          <input className="wms-input max-w-[160px]" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="wms-input max-w-[160px]" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <DataTable
          data={rows}
          columns={[
            { header: 'Fecha', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
            { header: 'Tipo', cell: ({ row }) => movementLabels[row.original.type] ?? row.original.type },
            { header: 'SKU', cell: ({ row }) => row.original.product.sku },
            { header: 'Producto', cell: ({ row }) => row.original.product.name },
            { header: 'Serie', cell: ({ row }) => row.original.inventoryUnit?.serialNumber ?? '-' },
            { header: 'Cantidad', accessorKey: 'quantity' },
            { header: 'Bodega', cell: ({ row }) => row.original.warehouse.name },
            { header: 'Usuario', cell: ({ row }) => row.original.user?.name ?? '-' },
            { header: 'Documento', accessorKey: 'documentNo' },
          ]}
        />
      </div>
    </>
  );
}

function flatMovement(row: KardexMovement): Record<string, unknown> {
  return {
    fecha: row.createdAt,
    tipo: movementLabels[row.type] ?? row.type,
    sku: row.product.sku,
    producto: row.product.name,
    serie: row.inventoryUnit?.serialNumber ?? '',
    cantidad: row.quantity,
    bodega: row.warehouse.name,
    ubicacion: row.location.name,
    usuario: row.user?.name ?? '',
    documento: row.documentNo,
    observacion: row.observation,
  };
}

function AdjustmentsPage() {
  const catalogs = useLoad(() => wmsApi.catalogs(), []);
  const inventory = useLoad(() => wmsApi.inventory(''), []);
  const [type, setType] = useState('POSITIVE');
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [serials, setSerials] = useState('');
  const [reason, setReason] = useState('');
  const product = catalogs.data?.products.find((item) => item.id === productId);
  const units = (inventory.data?.units ?? []).filter((unit) => unit.productId === productId);
  useEffect(() => {
    if (catalogs.data && !productId) {
      setProductId(catalogs.data.products[0]?.id ?? '');
      setWarehouseId(catalogs.data.warehouses[0]?.id ?? '');
      setLocationId(catalogs.data.locations[0]?.id ?? '');
      setToLocationId(catalogs.data.locations[1]?.id ?? catalogs.data.locations[0]?.id ?? '');
    }
  }, [catalogs.data, productId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await wmsApi.saveAdjustment({
        type,
        productId,
        inventoryUnitId: unitId || undefined,
        quantity,
        warehouseId,
        locationId,
        toLocationId,
        serialNumbers: serials.split(/[\n,]+/).map((serial) => serial.trim()).filter(Boolean),
        reason,
      });
      toast.success('Ajuste registrado');
      setReason('');
      inventory.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo ajustar');
    }
  };
  return (
    <>
      <PageTitle title="Ajustes de inventario" subtitle="Ajustes positivos, negativos, bloqueos, desbloqueos y reubicaciones" />
      <form className="wms-card wms-card-body wms-grid cols-2" onSubmit={submit}>
        <label className="wms-label">
          Tipo
          <select className="wms-select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="POSITIVE">Ajuste positivo</option>
            <option value="NEGATIVE">Ajuste negativo</option>
            <option value="BLOCK">Bloquear unidad</option>
            <option value="UNBLOCK">Desbloquear unidad</option>
            <option value="RELOCATE">Cambiar ubicacion</option>
          </select>
        </label>
        <label className="wms-label">
          Producto
          <select className="wms-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
            {catalogs.data?.products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} - {item.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'POSITIVE' ? (
          <>
            <label className="wms-label">
              Cantidad
              <input className="wms-input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
            <label className="wms-label">
              Bodega
              <select className="wms-select" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                {catalogs.data?.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </select>
            </label>
            <label className="wms-label">
              Ubicacion
              <select className="wms-select" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                {catalogs.data?.locations.filter((location) => location.warehouseId === warehouseId).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            {product?.managesSerial ? (
              <label className="wms-label">
                Series
                <textarea className="wms-textarea" value={serials} onChange={(event) => setSerials(event.target.value)} />
              </label>
            ) : null}
          </>
        ) : (
          <>
            <label className="wms-label">
              Unidad / serie
              <select className="wms-select" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                <option value="">Seleccion automatica si aplica</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.serialNumber ?? unit.id.slice(0, 8)} - {statusLabels[unit.status]}
                  </option>
                ))}
              </select>
            </label>
            {type === 'RELOCATE' ? (
              <label className="wms-label">
                Nueva ubicacion
                <select className="wms-select" value={toLocationId} onChange={(event) => setToLocationId(event.target.value)}>
                  {catalogs.data?.locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.warehouse?.name} - {location.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        )}
        <label className="wms-label col-span-full">
          Motivo obligatorio
          <textarea className="wms-textarea" value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <div className="col-span-full flex justify-end">
          <button className="wms-button primary">
            <Save size={16} /> Registrar ajuste
          </button>
        </div>
      </form>
    </>
  );
}

const contactSchema = z.object({
  name: z.string().min(3),
  taxId: z.string().min(5),
  contact: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email(),
  address: z.string().min(5),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

type ContactFormValues = z.infer<typeof contactSchema>;

function ContactsPage({ type }: { type: 'clients' | 'suppliers' }) {
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const { data, refresh } = useLoad(() => wmsApi.contacts(type), [type]);
  const removeContact = async (contact: Contact) => {
    try {
      const response = await wmsApi.deleteContact(type, contact.id);
      toast.success(response.mode === 'DELETED' ? 'Registro eliminado' : 'Registro inactivado por tener historial');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar');
    }
  };
  return (
    <>
      <PageTitle
        title={type === 'clients' ? 'Clientes' : 'Proveedores'}
        subtitle={type === 'clients' ? 'Clientes y ordenes de salida asociadas' : 'Proveedores y ordenes de entrada asociadas'}
        action={<button className="wms-button primary" onClick={() => setEditing(null)}><Users size={16} /> Nuevo</button>}
      />
      <div className="wms-card">
        <DataTable
          data={data ?? []}
          columns={[
            { header: 'Nombre', accessorKey: 'name' },
            { header: 'Identificacion/RUC', accessorKey: 'taxId' },
            { header: 'Contacto', accessorKey: 'contact' },
            { header: 'Telefono', accessorKey: 'phone' },
            { header: 'Email', accessorKey: 'email' },
            { header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
            {
              header: 'Acciones',
              cell: ({ row }) => (
                <div className="wms-actions">
                  <button className="wms-button" onClick={() => setEditing(row.original)}>Editar</button>
                  <button className="wms-button danger" disabled={!canDelete} title={canDelete ? 'Eliminar registro' : 'Solo administrador o supervisor'} onClick={() => removeContact(row.original)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
      {editing !== undefined ? <ContactForm type={type} contact={editing} onClose={() => setEditing(undefined)} onSaved={refresh} /> : null}
    </>
  );
}

function ContactForm({ type, contact, onClose, onSaved }: { type: 'clients' | 'suppliers'; contact: Contact | null; onClose: () => void; onSaved: () => void }) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: contact ?? { name: '', taxId: '', contact: '', phone: '', email: '', address: '', status: 'ACTIVE' },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await wmsApi.saveContact(type, values, contact?.id);
      toast.success('Registro guardado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    }
  });
  return (
    <Modal title={contact ? 'Editar registro' : 'Nuevo registro'} onClose={onClose}>
      <form className="wms-grid cols-2" onSubmit={submit}>
        {(['name', 'taxId', 'contact', 'phone', 'email', 'address'] as const).map((field) => (
          <label className="wms-label" key={field}>
            {field}
            <input className="wms-input" {...form.register(field)} />
          </label>
        ))}
        <label className="wms-label">
          Estado
          <select className="wms-select" {...form.register('status')}>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </label>
        <div className="col-span-full flex justify-end gap-2">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary"><Save size={16} /> Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const roles = useLoad(() => wmsApi.roles(), []);
  const users = useLoad(() => wmsApi.users(), []);
  const [editingUser, setEditingUser] = useState<AdminUser | null | undefined>(undefined);
  const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined);
  const refresh = () => {
    roles.refresh();
    users.refresh();
  };
  if (user?.role !== 'ADMIN') return <ScreenState title="Solo administrador" detail="Esta seccion requiere permisos de administrador." />;
  return (
    <>
      <PageTitle title="Usuarios y roles" subtitle="Administracion de accesos del sistema" />
      <div className="wms-grid cols-2">
        <div className="wms-card">
          <div className="wms-card-header">
            <h3 className="font-extrabold">Usuarios</h3>
            <button className="wms-button primary" onClick={() => setEditingUser(null)}>Nuevo usuario</button>
          </div>
          <DataTable
            data={users.data ?? []}
            columns={[
              { header: 'Nombre', accessorKey: 'name' },
              { header: 'Email', accessorKey: 'email' },
              { header: 'Rol', cell: ({ row }) => row.original.role.name },
              { header: 'Estado', cell: ({ row }) => row.original.isActive ? 'Activo' : 'Inactivo' },
              {
                header: 'Acciones',
                cell: ({ row }) => (
                  <div className="wms-actions">
                    <button className="wms-button" onClick={() => setEditingUser(row.original)}>Editar</button>
                    <button
                      className="wms-button danger"
                      disabled={!row.original.isActive || row.original.id === user.id}
                      onClick={async () => {
                        await wmsApi.deleteUser(row.original.id);
                        toast.success('Usuario desactivado');
                        users.refresh();
                      }}
                    >
                      Desactivar
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
        <div className="wms-card">
          <div className="wms-card-header">
            <h3 className="font-extrabold">Roles</h3>
            <button className="wms-button primary" onClick={() => setEditingRole(null)}>Nuevo rol</button>
          </div>
          <DataTable
            data={roles.data ?? []}
            columns={[
              { header: 'Codigo', accessorKey: 'code' },
              { header: 'Nombre', accessorKey: 'name' },
              {
                header: 'Permisos',
                cell: ({ row }) => (
                  <div className="wms-permission-chips">
                    {row.original.permissions?.length ? row.original.permissions.map((permission) => <span key={permission}>{permissionLabel(permission)}</span>) : <span>Sin permisos</span>}
                  </div>
                ),
              },
              { header: 'Usuarios', cell: ({ row }) => row.original._count?.users ?? 0 },
              {
                header: 'Acciones',
                cell: ({ row }) => (
                  <div className="wms-actions">
                    <button className="wms-button" onClick={() => setEditingRole(row.original)}>Editar</button>
                    <button
                      className="wms-button danger"
                      disabled={(row.original._count?.users ?? 0) > 0}
                      onClick={async () => {
                        await wmsApi.deleteRole(row.original.id);
                        toast.success('Rol eliminado');
                        roles.refresh();
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
      {editingUser !== undefined && roles.data ? <UserForm user={editingUser} roles={roles.data} onClose={() => setEditingUser(undefined)} onSaved={refresh} /> : null}
      {editingRole !== undefined ? <RoleForm role={editingRole} onClose={() => setEditingRole(undefined)} onSaved={refresh} /> : null}
    </>
  );
}

function UserForm({ user, roles, onClose, onSaved }: { user: AdminUser | null; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(user?.roleId ?? roles[0]?.id ?? '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await wmsApi.saveUser({ name, email, password, roleId, isActive }, user?.id);
    toast.success('Usuario guardado');
    onSaved();
    onClose();
  };
  return (
    <Modal title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <form className="wms-grid" onSubmit={submit}>
        <label className="wms-label">Nombre<input className="wms-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="wms-label">Email<input className="wms-input" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="wms-label">Contrasena<input className="wms-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={user ? 'Dejar vacio para mantener' : 'Obligatoria'} /></label>
        <label className="wms-label">
          Rol
          <select className="wms-select" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Activo</label>
        <div className="wms-actions justify-end">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function RoleForm({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const togglePermission = (permission: string) => {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await wmsApi.saveRole({ code, name, permissions }, role?.id);
    toast.success('Rol guardado');
    onSaved();
    onClose();
  };
  return (
    <Modal title={role ? 'Editar rol' : 'Nuevo rol'} onClose={onClose}>
      <form className="wms-grid" onSubmit={submit}>
        <label className="wms-label">Codigo<input className="wms-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="ADMIN" /></label>
        <label className="wms-label">Nombre<input className="wms-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Administrador" /></label>
        <div className="wms-label">
          Permisos del rol
          <div className="wms-permission-grid">
            {rolePermissionOptions.map(([value, label]) => (
              <label key={value} className="wms-permission-option">
                <input type="checkbox" checked={permissions.includes(value)} onChange={() => togglePermission(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="wms-actions justify-end">
          <button type="button" className="wms-button" onClick={onClose}>Cancelar</button>
          <button className="wms-button primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function ReportsPage() {
  const [type, setType] = useState('stock');
  const { data, refresh } = useLoad(() => wmsApi.reports(`?type=${type}`), [type]);
  const rows = useMemo(() => normalizeReportRows(type, data ?? []), [type, data]);
  return (
    <>
      <PageTitle
        title="Reportes"
        subtitle="Reportes consultados desde PostgreSQL con exportacion CSV"
        action={<button className="wms-button" onClick={() => downloadCsv(`${type}.csv`, rows)}><FileDown size={16} /> CSV</button>}
      />
      <div className="wms-card">
        <div className="wms-card-header">
          <select className="wms-select max-w-sm" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="stock">Stock actual</option>
            <option value="low-stock">Stock bajo minimo</option>
            <option value="available-serials">Series disponibles</option>
            <option value="dispatched-serials">Series despachadas</option>
            <option value="movements">Movimientos por fecha</option>
            <option value="inbound-suppliers">Entradas por proveedor</option>
            <option value="outbound-clients">Salidas por cliente</option>
          </select>
          <button className="wms-button" onClick={refresh}>Actualizar</button>
        </div>
        <ReportTable rows={rows} />
      </div>
    </>
  );
}

function normalizeReportRows(type: string, data: unknown[]): Record<string, unknown>[] {
  if (type === 'stock') {
    return (data as InventoryBalance[]).map((row) => ({ sku: row.product.sku, producto: row.product.name, bodega: row.warehouse.name, ubicacion: row.location.name, estado: statusLabels[row.status], cantidad: row.quantity }));
  }
  if (type === 'available-serials' || type === 'dispatched-serials') {
    return (data as InventoryUnit[]).map((row) => ({ sku: row.product.sku, producto: row.product.name, serie: row.serialNumber, bodega: row.warehouse.name, ubicacion: row.location.name, estado: statusLabels[row.status] }));
  }
  if (type === 'movements') return (data as KardexMovement[]).map(flatMovement);
  if (type === 'inbound-suppliers') {
    return (data as InboundOrder[]).map((row) => ({ documento: row.orderNo, orden_compra: row.purchaseOrder ?? '', proveedor: row.supplier.name, estado: statusLabels[row.status], items: row.items.length, fecha: row.createdAt }));
  }
  if (type === 'outbound-clients') {
    return (data as OutboundOrder[]).map((row) => ({ documento: row.orderNo, orden_compra: row.purchaseOrder ?? '', cliente: row.client.name, estado: statusLabels[row.status], items: row.items.length, fecha: row.createdAt }));
  }
  return data as Record<string, unknown>[];
}

function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {}).map<ColumnDef<Record<string, unknown>>>((key) => ({ header: key, accessorKey: key }));
  return <DataTable data={rows} columns={columns} />;
}

export function WmsApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<RequireAuth><AppShell /></RequireAuth>} />
      </Routes>
    </AuthProvider>
  );
}
