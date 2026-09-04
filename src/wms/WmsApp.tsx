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
  MapPinned,
  PackagePlus,
  PackageSearch,
  Printer,
  Route as RouteIcon,
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
  AuditLog,
  InventoryBalance,
  InventoryUnit,
  KardexMovement,
  Location,
  OrderItem,
  OutboundOrder,
  PickingPlan,
  Product,
  ProductCategory,
  ReportAnalytics,
  Role,
  UserSession,
  Warehouse as WarehouseType,
} from './types';

const rolePermissionOptions = [
  ['dashboard:view', 'Ver dashboard'],
  ['products:manage', 'Gestionar productos'],
  ['inventory:view', 'Ver inventario'],
  ['warehouses:manage', 'Gestionar bodegas y ubicaciones'],
  ['cycle-count:manage', 'Gestionar conteo ciclico'],
  ['cycle-count:approve', 'Aprobar diferencias de conteo'],
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
  PACKING: 'Packing',
  BLOCKED: 'Bloqueado',
  DISPATCHED: 'Despachado',
  SHIPPED: 'Enviado',
  RETURNING: 'En devolucion',
  DRAFT: 'Borrador',
  PENDING: 'Por ingresar',
  REQUESTED: 'Pedido generado',
  PARTIAL: 'Recibido parcial',
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

function companyDisplayName(company?: Pick<Company, 'id' | 'code' | 'name'> | null) {
  if (!company) return '';
  if (['company_ferremayor', 'company_mundimaquinas'].includes(company.id) || ['FERREMAYOR', 'MUNDIMAQUINAS', 'CARVATEL', 'CARVATEL-MATRIZ'].includes(company.code)) {
    return 'Carvatel';
  }
  if (['company_ferrilopez', 'company_sirumaz'].includes(company.id) || ['FERRILOPEZ', 'SIRUMAZ', 'CARVATEL-SUC', 'CARVATEL-TIENDA'].includes(company.code)) {
    return 'Carvatel Sucursal';
  }
  return company.name;
}

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
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-red-600" />
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
    ['/conteo-ciclico', 'Conteo ciclico', ClipboardList],
    ['/picking', 'Picking guiado', RouteIcon],
    ['/packing', 'Packing', PackagePlus],
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
    <div className={`wms-shell theme-${selectedCompany?.theme ?? 'red'}`}>
      <div className={`wms-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`wms-sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
          <div className="wms-brand">
            <span className="wms-logo">CTV</span>
            <div className="wms-brand-text">
              <div>Carvatel WMS</div>
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
                        {companyDisplayName(company)}
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
              <Route path="/conteo-ciclico" element={<CycleCountPage />} />
              <Route path="/picking" element={<PickingPage />} />
              <Route path="/packing" element={<PackingPage />} />
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
            <span className="wms-logo">CTV</span>
            <div>
              <h1 className="text-2xl font-extrabold">Carvatel WMS</h1>
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
            <div>despachador@mundiwms.local / Despacho123!</div>
            <div>supervisor@mundiwms.local / Supervisor123!</div>
          </div>
        </div>
      </form>
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="wms-page-title mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Badge({ value }: { value: string }) {
  const color = ['ACTIVE', 'AVAILABLE', 'RECEIVED', 'DISPATCHED', 'PACKING'].includes(value)
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
  const mobileLabel = (cell: ReturnType<typeof table.getRowModel>['rows'][number]['getVisibleCells'][number]) => {
    const header = cell.column.columnDef.header;
    return typeof header === 'string' ? header : cell.column.id;
  };
  return (
    <div className="wms-table-wrap">
      <table className="wms-table wms-responsive-table">
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
                <td key={cell.id} data-label={mobileLabel(cell)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
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
    ['Recepciones por ingresar', data.totals.inboundPending],
    ['Picking pendiente', data.totals.outboundPending],
    ['Packing pendiente', data.totals.outboundDispatched],
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
                <Bar dataKey="movements" name="Movimientos" fill="#dc2626" radius={[0, 6, 6, 0]} />
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
      <div className="wms-card mb-5">
        <div className="wms-card-header">
          <h3 className="font-extrabold">Control por usuario</h3>
        </div>
        <div className="wms-card-body grid gap-4">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={data.userKpis} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="user" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pendingPicking" name="Picking pendiente" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="dispatched" name="Packing" fill="#dc2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="shipped" name="Enviado" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            data={data.userKpis}
            columns={[
              { header: 'Usuario', accessorKey: 'user' },
              { header: 'Rol', accessorKey: 'role' },
              { header: 'Picking pendiente', accessorKey: 'pendingPicking' },
              { header: 'Packing', accessorKey: 'dispatched' },
              { header: 'Enviado', accessorKey: 'shipped' },
              { header: 'Prom. despacho h', accessorKey: 'avgDispatchHours' },
              { header: 'Prom. envio h', accessorKey: 'avgShipmentHours' },
            ]}
          />
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
                              <div><strong>Fuente:</strong> {product.sourceUrl ? <a className="text-red-600 underline" href={product.sourceUrl} target="_blank" rel="noreferrer">Ver catalogo</a> : '-'}</div>
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

type CycleCountItem = {
  key: string;
  productId: string;
  sku: string;
  productName: string;
  managesSerial: boolean;
  warehouseId: string;
  warehouse: string;
  locationId: string;
  location: string;
  expected: number;
  counted: string;
};

type CycleCountState = {
  id: string;
  companyId: string;
  status: 'COUNTING' | 'RECOUNT' | 'PENDING_APPROVAL';
  round: number;
  createdAt: string;
  items: CycleCountItem[];
};

type CycleDifference = CycleCountItem & {
  countedNumber: number;
  difference: number;
};

function cycleCountKey() {
  return `wms-cycle-count-${getCompanyId()}`;
}

function shuffleCycleItems(items: CycleCountItem[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function buildCycleCandidates(balances: InventoryBalance[]): CycleCountItem[] {
  return balances
    .filter((balance) => balance.status === 'AVAILABLE' && balance.quantity > 0)
    .map((balance) => ({
      key: `${balance.productId}-${balance.warehouseId}-${balance.locationId}`,
      productId: balance.productId,
      sku: balance.product.sku,
      productName: balance.product.name,
      managesSerial: balance.product.managesSerial,
      warehouseId: balance.warehouseId,
      warehouse: balance.warehouse.name,
      locationId: balance.locationId,
      location: balance.location.name,
      expected: balance.quantity,
      counted: '',
    }));
}

function getCycleDifferences(cycle: CycleCountState | null): CycleDifference[] {
  if (!cycle) return [];
  return cycle.items
    .map((item) => {
      if (item.counted === '') return null;
      const countedNumber = Number(item.counted);
      const difference = countedNumber - item.expected;
      return difference === 0 ? null : { ...item, countedNumber, difference };
    })
    .filter((item): item is CycleDifference => Boolean(item));
}

function CycleCountPage() {
  const { user } = useAuth();
  const inventory = useLoad(() => wmsApi.inventory('?status=AVAILABLE'), []);
  const [sampleSize, setSampleSize] = useState(8);
  const [cycle, setCycle] = useState<CycleCountState | null>(() => {
    const raw = localStorage.getItem(cycleCountKey());
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw) as CycleCountState;
      return { ...stored, status: stored.status ?? (stored.round > 1 ? 'RECOUNT' : 'COUNTING') };
    } catch {
      return null;
    }
  });
  const candidates = buildCycleCandidates(inventory.data?.balances ?? []);
  const differences = getCycleDifferences(cycle);
  const canApprove = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const approvalMode = cycle?.status === 'PENDING_APPROVAL';
  const recountMode = cycle?.status === 'RECOUNT';
  const countedLines = cycle?.items.filter((item) => item.counted !== '').length ?? 0;
  const pendingLines = (cycle?.items.length ?? 0) - countedLines;

  useEffect(() => {
    if (cycle) localStorage.setItem(cycleCountKey(), JSON.stringify(cycle));
    else localStorage.removeItem(cycleCountKey());
  }, [cycle]);

  const generate = () => {
    if (!candidates.length) {
      toast.error('No hay stock disponible para generar conteo');
      return;
    }
    const selected = shuffleCycleItems(candidates).slice(0, Math.max(1, Math.min(sampleSize, candidates.length)));
    setCycle({
      id: `CC-${Date.now()}`,
      companyId: getCompanyId(),
      status: 'COUNTING',
      round: 1,
      createdAt: new Date().toISOString(),
      items: selected,
    });
    toast.success('Conteo ciclico generado');
  };

  const updateCount = (key: string, counted: string) => {
    setCycle((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.key === key ? { ...item, counted } : item)),
          }
        : current,
    );
  };

  const requeueDifferences = (nextRound: number) => {
    if (!cycle) return;
    const nextItems = differences.map(({ countedNumber: _countedNumber, difference: _difference, ...item }) => ({ ...item, counted: '' }));
    if (!nextItems.length) {
      setCycle(null);
      toast.success('Conteo ciclico completado. Ya puede generar un nuevo ciclo.');
      return;
    }
    setCycle({ ...cycle, status: 'RECOUNT', round: nextRound, items: nextItems });
    toast.warning('Se genero reconteo solo para las diferencias.');
  };

  const finishRound = () => {
    if (!cycle) return;
    const incomplete = cycle.items.some((item) => item.counted === '');
    if (incomplete) {
      toast.error('Complete todas las cantidades contadas antes de cerrar');
      return;
    }
    if (!differences.length) {
      setCycle(null);
      toast.success('Conteo ciclico completado sin diferencias. Ya puede generar un nuevo ciclo.');
      return;
    }
    if (cycle.status === 'COUNTING') {
      requeueDifferences(cycle.round + 1);
      return;
    }

    setCycle({ ...cycle, status: 'PENDING_APPROVAL' });
    toast.warning('Diferencias pendientes de aprobacion por supervisor o administrador.');
  };

  const approveDifferences = async () => {
    if (!cycle || !differences.length) return;
    if (!canApprove) {
      toast.error('Solo supervisor o administrador puede aprobar diferencias');
      return;
    }
    const serialSurplus = differences.find((item) => item.managesSerial && item.difference > 0);
    if (serialSurplus) {
      toast.error(`El sobrante del SKU ${serialSurplus.sku} maneja serie. Registre ese ajuste manualmente con la serie encontrada.`);
      return;
    }
    try {
      for (const item of differences) {
        await wmsApi.saveAdjustment({
          type: item.difference > 0 ? 'POSITIVE' : 'NEGATIVE',
          productId: item.productId,
          quantity: Math.abs(item.difference),
          warehouseId: item.warehouseId,
          locationId: item.locationId,
          reason: `Ajuste aprobado por conteo ciclico ${cycle.id}. Sistema ${item.expected}, fisico ${item.countedNumber}.`,
        });
      }
      toast.success('Diferencias aprobadas y Kardex actualizado');
      setCycle(null);
      inventory.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo aprobar el ajuste');
    }
  };

  return (
    <>
      <PageTitle title="Conteo ciclico" subtitle="Muestras aleatorias, reconteo y aprobacion controlada de diferencias" />
      <div className="wms-grid cols-4 mb-5">
        <div className="wms-card wms-card-body">
          <div className="text-sm font-bold text-slate-500">Material disponible</div>
          <div className="mt-2 text-3xl font-extrabold">{candidates.length}</div>
        </div>
        <div className="wms-card wms-card-body">
          <div className="text-sm font-bold text-slate-500">Lineas del conteo</div>
          <div className="mt-2 text-3xl font-extrabold">{cycle?.items.length ?? 0}</div>
        </div>
        <div className="wms-card wms-card-body">
          <div className="text-sm font-bold text-slate-500">{approvalMode ? 'Diferencias' : 'Pendientes'}</div>
          <div className="mt-2 text-3xl font-extrabold">{approvalMode ? differences.length : pendingLines}</div>
        </div>
        <div className="wms-card wms-card-body">
          <div className="text-sm font-bold text-slate-500">Estado</div>
          <div className="mt-2 text-xl font-extrabold">{approvalMode ? 'Aprobacion' : recountMode ? 'Reconteo' : cycle ? 'Conteo' : '-'}</div>
        </div>
      </div>

      {approvalMode ? (
        <div className="wms-card mb-5">
          <div className="wms-card-header">
            <div>
              <h3 className="font-extrabold">Diferencias pendientes de aprobacion</h3>
              <p className="text-sm text-slate-500">Solo supervisor o administrador puede aprobar ajustes al inventario.</p>
            </div>
            <div className="wms-actions">
              <button className="wms-button" onClick={() => requeueDifferences((cycle?.round ?? 1) + 1)}>Pedir reconteo</button>
              <button className="wms-button danger" onClick={() => setCycle(null)}>Rechazar conteo</button>
              <button className="wms-button primary" onClick={approveDifferences} disabled={!canApprove || !differences.length}>
                Aprobar ajuste
              </button>
            </div>
          </div>
          {!canApprove ? (
            <div className="wms-card-body rounded-none border-t border-amber-200 bg-amber-50 text-sm font-bold text-amber-900">
              Usuario actual: {user?.roleName}. Puede revisar diferencias, pero no aprobar ajustes.
            </div>
          ) : null}
          <div className="wms-table-wrap">
            <table className="wms-table compact">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Bodega</th>
                  <th>Ubicacion</th>
                  <th>Sistema</th>
                  <th>Fisico</th>
                  <th>Diferencia</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((item) => (
                  <tr key={item.key}>
                    <td className="font-extrabold">{item.sku}</td>
                    <td>{item.productName}</td>
                    <td>{item.warehouse}</td>
                    <td>{item.location}</td>
                    <td>{item.expected}</td>
                    <td>{item.countedNumber}</td>
                    <td><span className="wms-badge red">{item.difference > 0 ? `+${item.difference}` : item.difference}</span></td>
                    <td>{item.difference > 0 ? 'Sobrante' : 'Faltante'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="wms-card mb-5">
        <div className="wms-card-header">
          <div>
            <h3 className="font-extrabold">{cycle ? (recountMode ? 'Reconteo de diferencias' : approvalMode ? 'Conteo pendiente de aprobacion' : 'Conteo activo') : 'Nuevo conteo'}</h3>
            <p className="text-sm text-slate-500">
              {cycle ? 'Registre la cantidad fisica encontrada por linea.' : 'Seleccione cuantas lineas aleatorias desea revisar.'}
            </p>
          </div>
          <div className="wms-actions">
            {!cycle ? (
              <>
                <input className="wms-input max-w-[120px]" type="number" min={1} max={50} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} />
                <button className="wms-button primary" onClick={generate} disabled={inventory.loading}>
                  Generar conteo
                </button>
              </>
            ) : (
              <>
                <button className="wms-button primary" onClick={finishRound} disabled={approvalMode}>Cerrar ronda</button>
                <button className="wms-button danger" onClick={() => setCycle(null)}>Reiniciar</button>
              </>
            )}
          </div>
        </div>
        {cycle ? (
          <div className="wms-table-wrap">
            <table className="wms-table compact">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Bodega</th>
                  <th>Ubicacion</th>
                  <th>Sistema</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {cycle.items.map((item) => {
                  const counted = item.counted === '' ? null : Number(item.counted);
                  const diff = counted === null ? '-' : counted - item.expected;
                  return (
                    <tr key={item.key}>
                      <td className="font-extrabold">{item.sku}</td>
                      <td>{item.productName}</td>
                      <td>{item.warehouse}</td>
                      <td>{item.location}</td>
                      <td>{item.expected}</td>
                      <td>
                        <input
                          className="wms-input max-w-[120px]"
                          type="number"
                          min={0}
                          value={item.counted}
                          onChange={(event) => updateCount(item.key, event.target.value)}
                          placeholder="0"
                          disabled={approvalMode}
                        />
                      </td>
                      <td>
                        <span className={`wms-badge ${diff === '-' ? 'slate' : Number(diff) === 0 ? 'green' : 'red'}`}>{diff}</span>
                      </td>
                      <td>{diff === '-' ? '-' : Number(diff) === 0 ? 'OK' : Number(diff) > 0 ? 'Sobrante' : 'Faltante'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="wms-card-body text-sm text-slate-500">
            No hay conteo activo. Genere una muestra aleatoria para iniciar.
          </div>
        )}
      </div>
    </>
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

type RackGroup = {
  aisle: string;
  rack: string;
  locations: Location[];
  mapX: number;
  mapY: number;
  route: number;
  totals: ReturnType<typeof getLocationStats>;
  levels: number;
  positions: number;
};

function parseLayoutNumber(value?: string | null) {
  const parsed = Number(String(value ?? '').replace(/\D/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rackFloorX(location: Location) {
  if (typeof location.mapX === 'number' && location.mapX >= 0) return location.mapX;
  const rackNumber = parseLayoutNumber(location.rack);
  if (!rackNumber) return 0;
  const pairIndex = Math.floor((rackNumber - 1) / 2);
  const sideIndex = (rackNumber - 1) % 2;
  return pairIndex * 3 + sideIndex;
}

function rackFloorY(location: Location) {
  if (typeof location.mapY === 'number' && location.mapY >= 0) return location.mapY;
  const aisleNumber = parseLayoutNumber(location.aisle);
  return aisleNumber ? aisleNumber - 1 : 0;
}

function buildRackGroups(locations: Location[]): RackGroup[] {
  const grouped = locations.reduce((map, location) => {
    const aisle = location.aisle || 'General';
    const rack = location.rack || 'Sin rack';
    const key = `${aisle}|${rack}`;
    const current = map.get(key) ?? { aisle, rack, locations: [] as Location[] };
    current.locations.push(location);
    map.set(key, current);
    return map;
  }, new Map<string, { aisle: string; rack: string; locations: Location[] }>());

  return Array.from(grouped.values())
    .map((group) => {
      const orderedLocations = group.locations.sort(compareLocationLayout);
      const totals = orderedLocations.reduce(
        (acc, location) => {
          const stats = getLocationStats(location);
          acc.total += stats.total;
          acc.available += stats.available;
          acc.reserved += stats.reserved;
          acc.products += stats.products;
          return acc;
        },
        { total: 0, available: 0, reserved: 0, products: 0 },
      );
      const levels = new Set(orderedLocations.map((location) => location.level).filter(Boolean)).size;
      const positions = new Set(orderedLocations.map((location) => location.position).filter(Boolean)).size;
      return {
        ...group,
        locations: orderedLocations,
        mapX: Math.min(...orderedLocations.map(rackFloorX)),
        mapY: Math.min(...orderedLocations.map(rackFloorY)),
        route: Math.min(...orderedLocations.map((location) => location.pickSequence || Number.MAX_SAFE_INTEGER)),
        totals,
        levels,
        positions,
      };
    })
    .sort((a, b) => (a.mapY - b.mapY) || (a.mapX - b.mapX) || `${a.aisle}|${a.rack}`.localeCompare(`${b.aisle}|${b.rack}`, 'es', { numeric: true }));
}

function WarehouseFloorPlan({ rackGroups, onSelectRack }: { rackGroups: RackGroup[]; onSelectRack: (rack: RackGroup) => void }) {
  const aisles = Array.from(
    rackGroups.reduce((map, rack) => {
      const key = rack.aisle || 'General';
      const current = map.get(key) ?? [] as RackGroup[];
      current.push(rack);
      map.set(key, current);
      return map;
    }, new Map<string, RackGroup[]>()),
  )
    .map(([aisle, racks]) => ({ aisle, racks: racks.sort((a, b) => a.mapX - b.mapX || a.rack.localeCompare(b.rack, 'es', { numeric: true })) }))
    .sort((a, b) => a.aisle.localeCompare(b.aisle, 'es', { numeric: true }));
  const maxPairCount = Math.max(1, ...aisles.map((aisle) => Math.ceil(aisle.racks.length / 2)));

  return (
    <div className="wms-floor-plan">
      <div className="wms-floor-zone-label">Vista superior de bodega</div>
      {aisles.map(({ aisle, racks }) => {
        const pairs = Array.from({ length: maxPairCount }, (_, pairIndex) => racks.slice(pairIndex * 2, pairIndex * 2 + 2));
        return (
          <section className="wms-floor-zone" key={aisle} style={{ ['--wms-rack-pairs' as string]: maxPairCount }}>
            <div className="wms-floor-zone-title">Pasillo {aisle}</div>
            <div className="wms-floor-row">
              {pairs.flatMap((pair, pairIndex) => {
                const first = pair[0];
                const second = pair[1];
                return [
                  first ? <RackTopButton key={`${aisle}-${first.rack}`} rack={first} onSelectRack={onSelectRack} /> : <div className="wms-floor-empty" key={`${aisle}-${pairIndex}-empty-a`} />,
                  second ? <RackTopButton key={`${aisle}-${second.rack}`} rack={second} onSelectRack={onSelectRack} /> : <div className="wms-floor-empty" key={`${aisle}-${pairIndex}-empty-b`} />,
                  <div className="wms-floor-access" key={`${aisle}-${pairIndex}-access`}>Acceso</div>,
                ];
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RackTopButton({ rack, onSelectRack }: { rack: RackGroup; onSelectRack: (rack: RackGroup) => void }) {
  const state = rack.totals.total === 0 ? 'empty' : rack.totals.reserved > 0 ? 'reserved' : 'filled';
  return (
    <button className={`wms-floor-rack ${state}`} onClick={() => onSelectRack(rack)} title={`Abrir niveles del Rack ${rack.rack}`}>
      <strong>Rack {rack.rack}</strong>
      <span>{rack.locations.length} ubicaciones</span>
      <small>{rack.levels || 1} niveles / {rack.positions || rack.locations.length} posiciones</small>
      <b>{rack.totals.total} unid.</b>
    </button>
  );
}

function WarehouseLocationMap({ warehouse, locations, onEdit, onChanged }: { warehouse: WarehouseType; locations: Location[]; onEdit: (location: Location) => void; onChanged: () => void }) {
  const [rackDetail, setRackDetail] = useState<RackGroup | null>(null);
  const warehouseLocations = locations.filter((location) => location.warehouseId === warehouse.id).sort(compareLocationLayout);
  const rackGroups = buildRackGroups(warehouseLocations);
  if (!warehouseLocations.length) {
    return <div className="wms-empty-map">Sin ubicaciones creadas para esta bodega.</div>;
  }

  return (
    <>
      <WarehouseFloorPlan rackGroups={rackGroups} onSelectRack={setRackDetail} />
      <div className="wms-rack-summary">
        {rackGroups.map((group) => (
          <button className="wms-rack-summary-item" key={`${group.aisle}-${group.rack}`} onClick={() => setRackDetail(group)}>
            <strong>Rack {group.rack}</strong>
            <span>Pasillo {group.aisle}</span>
            <small>{group.totals.total} unidades / {group.locations.length} ubicaciones</small>
          </button>
        ))}
      </div>
      {rackDetail ? <RackFrontModal rack={rackDetail} onClose={() => setRackDetail(null)} onEdit={onEdit} onChanged={() => { setRackDetail(null); onChanged(); }} /> : null}
    </>
  );
}

function RackFrontModal({ rack, onClose, onEdit, onChanged }: { rack: RackGroup; onClose: () => void; onEdit: (location: Location) => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const levels = Array.from(new Set(rack.locations.map((location) => location.level || 'N/A'))).sort((a, b) => b.localeCompare(a, 'es', { numeric: true }));
  const positions = Array.from(new Set(rack.locations.map((location) => location.position || 'N/A'))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const numericLevels = rack.locations.map((location) => parseLayoutNumber(location.level)).filter(Boolean);
  const numericPositions = rack.locations.map((location) => parseLayoutNumber(location.position)).filter(Boolean);
  const maxLevel = Math.max(1, ...numericLevels);
  const maxPosition = Math.max(1, ...numericPositions);
  const padRackValue = (value: number) => String(value).padStart(2, '0');
  const base = rack.locations[0];
  const saveRackLocation = async (levelValue: number, positionValue: number) => {
    if (!base) return;
    const level = padRackValue(levelValue);
    const position = padRackValue(positionValue);
    const payload = {
      warehouseId: base.warehouseId,
      code: locationLayoutCode({ zone: base.zone, aisle: base.aisle, rack: base.rack, level, position, code: '' }),
      name: `Zona ${base.zone || '-'} / Pasillo ${base.aisle || '-'} / Rack ${base.rack || '-'} / Nivel ${level} / Posicion ${position}`,
      zone: base.zone ?? '',
      aisle: base.aisle ?? '',
      rack: base.rack ?? '',
      level,
      position,
      mapX: rack.mapX,
      mapY: rack.mapY,
      mapW: 1,
      mapH: 1,
      pickSequence: (rack.mapY + 1) * 10000 + (rack.mapX + 1) * 100 + levelValue * 10 + positionValue,
      kind: base.kind ?? 'STORAGE',
    };
    await wmsApi.saveLocation(payload);
  };
  const runRackChange = async (change: 'add-level' | 'remove-level' | 'add-position' | 'remove-position') => {
    if (!base || saving) return;
    setSaving(true);
    try {
      if (change === 'add-level') {
        await Promise.all(Array.from({ length: maxPosition }, (_, index) => saveRackLocation(maxLevel + 1, index + 1)));
        toast.success('Nivel agregado al rack');
      }
      if (change === 'add-position') {
        await Promise.all(Array.from({ length: maxLevel }, (_, index) => saveRackLocation(index + 1, maxPosition + 1)));
        toast.success('Posicion agregada al rack');
      }
      if (change === 'remove-level') {
        if (maxLevel <= 1) throw new Error('El rack debe conservar al menos un nivel');
        const removable = rack.locations.filter((location) => parseLayoutNumber(location.level) === maxLevel);
        if (removable.some((location) => getLocationStats(location).total > 0)) throw new Error('No se puede quitar un nivel que tiene stock');
        await Promise.all(removable.map((location) => wmsApi.deleteLocation(location.id)));
        toast.success('Nivel retirado del rack');
      }
      if (change === 'remove-position') {
        if (maxPosition <= 1) throw new Error('El rack debe conservar al menos una posicion');
        const removable = rack.locations.filter((location) => parseLayoutNumber(location.position) === maxPosition);
        if (removable.some((location) => getLocationStats(location).total > 0)) throw new Error('No se puede quitar una posicion que tiene stock');
        await Promise.all(removable.map((location) => wmsApi.deleteLocation(location.id)));
        toast.success('Posicion retirada del rack');
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo modificar el rack');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Rack ${rack.rack} / Pasillo ${rack.aisle}`} onClose={onClose}>
      <div className="wms-rack-tools">
        <div>
          <strong>Estructura del rack</strong>
          <span>{levels.length} niveles / {positions.length} posiciones por nivel</span>
        </div>
        <div className="wms-actions">
          <button type="button" className="wms-button" disabled={saving} onClick={() => runRackChange('add-level')}>+ Nivel</button>
          <button type="button" className="wms-button" disabled={saving} onClick={() => runRackChange('remove-level')}>- Nivel</button>
          <button type="button" className="wms-button" disabled={saving} onClick={() => runRackChange('add-position')}>+ Posicion</button>
          <button type="button" className="wms-button" disabled={saving} onClick={() => runRackChange('remove-position')}>- Posicion</button>
        </div>
      </div>
      <div className="wms-rack-front">
        <div className="wms-rack-front-grid" style={{ gridTemplateColumns: `88px repeat(${positions.length}, minmax(92px, 1fr))` }}>
          <div className="wms-rack-front-head">Nivel</div>
          {positions.map((position) => <div className="wms-rack-front-head" key={position}>Pos. {position}</div>)}
          {levels.flatMap((level) => [
            <div className="wms-rack-front-level" key={`${level}-label`}>Nivel {level}</div>,
            ...positions.map((position) => {
              const location = rack.locations.find((item) => (item.level || 'N/A') === level && (item.position || 'N/A') === position);
              if (!location) return <div className="wms-rack-front-empty" key={`${level}-${position}`}>Sin posicion</div>;
              const stats = getLocationStats(location);
              const products = (location.inventoryBalances ?? [])
                .filter((balance) => balance.quantity > 0)
                .slice(0, 3)
                .map((balance) => `${balance.product?.sku ?? 'SKU'} (${balance.quantity})`);
              const state = stats.total === 0 ? 'empty' : stats.reserved > 0 ? 'reserved' : 'filled';
              return (
                <button
                  className={`wms-rack-front-slot ${state}`}
                  key={`${level}-${position}`}
                  onClick={() => {
                    onClose();
                    onEdit(location);
                  }}
                >
                  <strong>{location.code}</strong>
                  <span>{stats.total} unidades</span>
                  <small>{products.length ? products.join(' / ') : 'Libre'}</small>
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </Modal>
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
  const [mapX, setMapX] = useState(Math.max(0, location?.mapX ?? 0));
  const [mapY, setMapY] = useState(Math.max(0, location?.mapY ?? 0));
  const [pickSequence, setPickSequence] = useState(location?.pickSequence ?? 0);
  const [kind, setKind] = useState(location?.kind ?? 'STORAGE');
  const selectedWarehouseLocations = catalogs.locations.filter((item) => item.warehouseId === warehouseId && item.id !== location?.id);
  const builderRackGroups = buildRackGroups(selectedWarehouseLocations);
  const mapPreviewCols = Math.max(6, mapX + 1, ...builderRackGroups.map((item) => item.mapX + 1));
  const mapPreviewRows = Math.max(4, mapY + 1, ...builderRackGroups.map((item) => item.mapY + 1));
  const updateMapPosition = (x: number, y: number) => {
    setMapX(Math.max(0, x));
    setMapY(Math.max(0, y));
    setPickSequence((y + 1) * 1000 + (x + 1) * 100);
  };
  const generatedCode = locationLayoutCode({ zone, aisle, rack, level, position, code });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((mapX + 1) % 3 === 0) {
      toast.error('Esa columna esta reservada como acceso. Selecciona una columna de rack.');
      return;
    }
    try {
      await wmsApi.saveLocation({ warehouseId, code, name, zone, aisle, rack, level, position, mapX, mapY, mapW: 1, mapH: 1, pickSequence, kind }, location?.id);
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
        <div className="col-span-full rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-950">
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
        <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <MapPinned size={16} /> Plano superior y ruta de picking
          </div>
          <div className="wms-grid cols-4">
            <label className="wms-label">
              Columna X
              <input className="wms-input" type="number" min={0} value={mapX} onChange={(event) => setMapX(Math.max(0, Number(event.target.value)))} />
            </label>
            <label className="wms-label">
              Fila Y
              <input className="wms-input" type="number" min={0} value={mapY} onChange={(event) => setMapY(Math.max(0, Number(event.target.value)))} />
            </label>
            <label className="wms-label col-span-full">
              Orden de picking
              <input className="wms-input" type="number" min={0} value={pickSequence} onChange={(event) => setPickSequence(Number(event.target.value))} />
            </label>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">
            Cada cuadro representa un rack visto desde arriba. Despues de dos racks juntos queda una columna de acceso para poder recoger material.
          </p>
          <div className="wms-location-builder">
            <div className="wms-location-builder-toolbar">
              <strong>Crear en plano</strong>
              <div className="wms-actions">
                <button type="button" className="wms-button" onClick={() => setPickSequence((mapY + 1) * 1000 + (mapX + 1) * 100)}>Calcular ruta</button>
              </div>
            </div>
            <div
              className="wms-location-builder-grid"
              style={{
                gridTemplateColumns: `34px repeat(${mapPreviewCols}, minmax(30px, 1fr))`,
                gridTemplateRows: `26px repeat(${mapPreviewRows}, 36px)`,
              }}
            >
              <div className="wms-builder-axis corner" />
              {Array.from({ length: mapPreviewCols }, (_, index) => (
                <div className="wms-builder-axis" key={`builder-col-${index}`}>C{index + 1}</div>
              ))}
              {Array.from({ length: mapPreviewRows }, (_, index) => (
                <div className="wms-builder-axis row" key={`builder-row-${index}`} style={{ gridColumn: 1, gridRow: index + 2 }}>F{index + 1}</div>
              ))}
              {builderRackGroups.map((item) => (
                <div
                  className="wms-builder-existing"
                  key={`${item.aisle}-${item.rack}`}
                  title={`Rack ${item.rack} / Pasillo ${item.aisle}`}
                  style={{
                    gridColumn: item.mapX + 2,
                    gridRow: item.mapY + 2,
                  }}
                >
                  R{item.rack}
                  <small>{item.locations.length}</small>
                </div>
              ))}
              {Array.from({ length: mapPreviewRows }, (_, y) =>
                Array.from({ length: mapPreviewCols }, (_, x) => {
                  const isAccessColumn = (x + 1) % 3 === 0;
                  return (
                    <button
                      type="button"
                      className={`wms-builder-cell ${isAccessColumn ? 'access' : ''}`}
                      disabled={isAccessColumn}
                      key={`cell-${x}-${y}`}
                      onClick={() => updateMapPosition(x, y)}
                      style={{ gridColumn: x + 2, gridRow: y + 2 }}
                      title={isAccessColumn ? `Acceso en columna ${x + 1}` : `Fila ${y + 1}, Columna ${x + 1}`}
                    >
                      {isAccessColumn ? 'Acceso' : `C${x + 1}/F${y + 1}`}
                    </button>
                  );
                }),
              )}
              <div
                className="wms-builder-selected"
                style={{
                  gridColumn: mapX + 2,
                  gridRow: mapY + 2,
                }}
              >
                {code || generatedCode || 'Nueva'}
              </div>
            </div>
          </div>
        </div>
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
                    <h4 className="font-extrabold">Mapa de racks y accesos</h4>
                    <p className="text-xs text-slate-500">Clic en un rack para ver niveles, posiciones y contenido.</p>
                  </div>
                  <button className="wms-button" onClick={() => setEditingLocation({ location: null, warehouseId: warehouse.id })}>
                    Nueva ubicacion
                  </button>
                </div>
                <WarehouseLocationMap warehouse={warehouse} locations={locations} onEdit={(location) => setEditingLocation({ location })} onChanged={catalogs.refresh} />
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
                          <th>Plano superior</th>
                          <th>Ruta</th>
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
                              <td>{`C${(location.mapX ?? 0) + 1} / F${(location.mapY ?? 0) + 1}`}</td>
                              <td>{location.pickSequence || '-'}</td>
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
                            <td colSpan={11} className="text-center text-slate-500">Sin ubicaciones en esta bodega.</td>
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

function formatDateOnly(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function pickingItemKey(item: PickingPlan['items'][number], index: number) {
  return `${item.orderId}:${item.locationId}:${item.productId}:${index}`;
}

function normalizeScan(value: string) {
  return value.trim().toUpperCase();
}

function emptyPickingPlan(): PickingPlan {
  return { orders: [], items: [], totals: { orders: 0, lines: 0, units: 0, locations: 0 } };
}

function getRouteRackLabel(item: PickingPlan['items'][number]) {
  const rack = item.locationCode.match(/-R([^-]+)/)?.[1] ?? item.locationCode.match(/R([^-]+)/)?.[1] ?? '-';
  return `Rack ${rack}`;
}

function PickingRouteMap({ items, pickedSet, currentIndex }: { items: PickingPlan['items']; pickedSet: Set<string>; currentIndex: number }) {
  if (!items.length) return null;
  const locations = Array.from(
    items.reduce((map, item, index) => {
      const key = `${item.warehouseId}|${item.mapX}|${item.mapY}`;
      const current = map.get(key) ?? {
        warehouseId: item.warehouseId,
        warehouse: item.warehouse,
        mapX: item.mapX,
        mapY: item.mapY,
        locationCode: item.locationCode,
        rack: getRouteRackLabel(item),
        indexes: [] as number[],
        quantity: 0,
      };
      current.indexes.push(index);
      current.quantity += item.quantity;
      map.set(key, current);
      return map;
    }, new Map<string, { warehouseId: string; warehouse: string; mapX: number; mapY: number; locationCode: string; rack: string; indexes: number[]; quantity: number }>()),
  ).map(([, value]) => value);
  const byWarehouse = Array.from(
    locations.reduce((map, location) => {
      const current = map.get(location.warehouseId) ?? { warehouse: location.warehouse, locations: [] as typeof locations };
      current.locations.push(location);
      map.set(location.warehouseId, current);
      return map;
    }, new Map<string, { warehouse: string; locations: typeof locations }>()),
  );

  return (
    <div className="wms-picking-map">
      {byWarehouse.map(([warehouseId, group]) => {
        const cols = Math.max(6, ...group.locations.map((location) => location.mapX + 1));
        const rows = Math.max(2, ...group.locations.map((location) => location.mapY + 1));
        return (
          <section key={warehouseId} className="wms-picking-map-zone">
            <div className="wms-picking-map-title">{group.warehouse}</div>
            <div
              className="wms-picking-map-grid"
              style={{
                gridTemplateColumns: `34px repeat(${cols}, minmax(44px, 1fr))`,
                gridTemplateRows: `26px repeat(${rows}, 56px)`,
              }}
            >
              <div className="wms-builder-axis corner" />
              {Array.from({ length: cols }, (_, index) => (
                <div className="wms-builder-axis" key={`pick-col-${warehouseId}-${index}`}>C{index + 1}</div>
              ))}
              {Array.from({ length: rows }, (_, index) => (
                <div className="wms-builder-axis row" key={`pick-row-${warehouseId}-${index}`} style={{ gridColumn: 1, gridRow: index + 2 }}>F{index + 1}</div>
              ))}
              {Array.from({ length: rows }, (_, y) =>
                Array.from({ length: cols }, (_, x) => {
                  const isAccessColumn = (x + 1) % 3 === 0;
                  return (
                    <div
                      className={`wms-picking-map-cell ${isAccessColumn ? 'access' : ''}`}
                      key={`pick-cell-${warehouseId}-${x}-${y}`}
                      style={{ gridColumn: x + 2, gridRow: y + 2 }}
                    >
                      {isAccessColumn ? 'Acceso' : ''}
                    </div>
                  );
                }),
              )}
              {group.locations.map((location) => {
                const firstIndex = Math.min(...location.indexes);
                const completed = location.indexes.every((index) => pickedSet.has(pickingItemKey(items[index], index)));
                const current = location.indexes.includes(currentIndex);
                return (
                  <div
                    className={`wms-picking-map-stop ${completed ? 'picked' : current ? 'current' : ''}`}
                    key={`${warehouseId}-${location.mapX}-${location.mapY}`}
                    style={{ gridColumn: location.mapX + 2, gridRow: location.mapY + 2 }}
                  >
                    <strong>{firstIndex + 1}</strong>
                    <span>{location.rack}</span>
                    <small>{location.quantity} unid.</small>
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

type OrderPayload = {
  supplierId?: string;
  clientId?: string;
  warehouseId: string;
  locationId: string;
  purchaseOrder?: string;
  importOrderId?: string;
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
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
              {mode === 'inbound' ? <th>Costo unit.</th> : null}
              {mode === 'inbound' ? <th>Total</th> : null}
              {mode === 'inbound' ? <th>Lote</th> : null}
              {mode === 'inbound' ? <th>Vence</th> : null}
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
                  {mode === 'inbound' ? <td>${Number(item.unitCost ?? product?.purchasePrice ?? 0).toFixed(2)}</td> : null}
                  {mode === 'inbound' ? <td>${(Number(item.unitCost ?? product?.purchasePrice ?? 0) * item.quantity).toFixed(2)}</td> : null}
                  {mode === 'inbound' ? <td>{item.lotNumber || '-'}</td> : null}
                  {mode === 'inbound' ? <td>{formatDateOnly(item.expirationDate)}</td> : null}
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
  const [scan, setScan] = useState('');
  const [packedKeys, setPackedKeys] = useState<string[]>([]);
  const lineKey = (item: OrderItem, index: number) => item.id ?? `${item.productId}-${index}`;
  const packedSet = new Set(packedKeys);
  const allPacked = order.items.length > 0 && order.items.every((item, index) => packedSet.has(lineKey(item, index)));
  const validatePackingScan = (event: FormEvent) => {
    event.preventDefault();
    const scanned = normalizeScan(scan);
    if (!scanned) return;
    const nextIndex = order.items.findIndex((item, index) => {
      if (packedSet.has(lineKey(item, index))) return false;
      const accepted = [
        item.product?.sku ?? '',
        item.product?.barcode ?? '',
        ...(item.product?.barcodes ?? []),
        ...item.serialNumbers,
      ].map(normalizeScan).filter(Boolean);
      return accepted.includes(scanned);
    });
    if (nextIndex < 0) {
      toast.error('El escaneo no coincide con material pendiente de packing');
      setScan('');
      return;
    }
    const item = order.items[nextIndex];
    setPackedKeys((current) => [...current, lineKey(item, nextIndex)]);
    setScan('');
    toast.success(`${item.product?.sku ?? 'SKU'} separado para envio`);
  };
  return (
    <Modal title={`Packing y envio ${order.orderNo}`} onClose={onClose}>
      <div className="wms-grid">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <div className="font-extrabold">Cliente: {order.client.name}</div>
          <div>Bodega: {order.warehouse.name}</div>
          <div>Orden de compra: {order.purchaseOrder || '-'}</div>
          <div>Documento: {order.orderNo}</div>
        </div>
        <form className="wms-scan-panel" onSubmit={validatePackingScan}>
          <input
            className="wms-input"
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            placeholder="Escanee SKU, codigo de barras o serie para separar"
            autoFocus
          />
          <button className="wms-button primary">Validar packing</button>
        </form>
        <div className="wms-table-wrap">
          <table className="wms-table compact">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descripcion</th>
                <th>Cantidad</th>
                <th>Series</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={lineKey(item, index)}>
                  <td>{item.product?.sku}</td>
                  <td>{item.product?.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.serialNumbers.length ? item.serialNumbers.join(', ') : '-'}</td>
                  <td>{packedSet.has(lineKey(item, index)) ? <Badge value="RECEIVED" /> : <Badge value="PENDING" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wms-actions justify-end">
          <button className="wms-button" onClick={onEdit}>Revisar detalle</button>
          <button className="wms-button primary" onClick={onSend} disabled={!allPacked}>Confirmar envio</button>
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
                {type === 'inbound' ? <th>Costo unit.</th> : null}
                {type === 'inbound' ? <th>Total</th> : null}
                {type === 'inbound' ? <th>Lote</th> : null}
                {type === 'inbound' ? <th>Vence</th> : null}
                <th>Series</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id ?? item.productId}>
                  <td>{item.product?.sku ?? '-'}</td>
                  <td>{item.product?.name ?? '-'}</td>
                  <td>{item.quantity}</td>
                  {type === 'inbound' ? <td>${Number(item.unitCost ?? item.product?.purchasePrice ?? 0).toFixed(2)}</td> : null}
                  {type === 'inbound' ? <td>${(Number(item.unitCost ?? item.product?.purchasePrice ?? 0) * item.quantity).toFixed(2)}</td> : null}
                  {type === 'inbound' ? <td>{item.lotNumber || '-'}</td> : null}
                  {type === 'inbound' ? <td>{formatDateOnly(item.expirationDate)}</td> : null}
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

function printOrderPdf(type: 'inbound' | 'outbound', order: InboundOrder | OutboundOrder) {
  const party = 'supplier' in order ? order.supplier : order.client;
  const rows = order.items
    .map((item) => {
      const unitCost = Number(item.unitCost ?? item.product?.purchasePrice ?? 0);
      return `
        <tr>
          <td>${item.product?.sku ?? '-'}</td>
          <td>${item.product?.name ?? '-'}</td>
          <td>${item.quantity}</td>
          ${type === 'inbound' ? `<td>$${unitCost.toFixed(2)}</td><td>$${(unitCost * item.quantity).toFixed(2)}</td>` : ''}
          ${type === 'inbound' ? `<td>${item.lotNumber || '-'}</td><td>${formatDateOnly(item.expirationDate)}</td>` : ''}
          <td>${item.serialNumbers.length ? item.serialNumbers.join(', ') : '-'}</td>
        </tr>
      `;
    })
    .join('');
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return toast.error('El navegador bloqueo la ventana del PDF');
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
        <h1>${type === 'inbound' ? 'Recepcion' : 'Despacho'} ${order.orderNo}</h1>
        <div class="meta">
          <div><strong>${type === 'inbound' ? 'Proveedor' : 'Cliente'}:</strong> ${party.name}</div>
          <div><strong>RUC:</strong> ${party.taxId}</div>
          <div><strong>Bodega:</strong> ${order.warehouse.name}</div>
          <div><strong>Estado:</strong> ${statusLabels[order.status] ?? order.status}</div>
          <div><strong>Orden de compra:</strong> ${order.purchaseOrder || '-'}</div>
          <div><strong>Usuario:</strong> ${order.createdBy?.name ?? '-'}</div>
          <div><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleString()}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>SKU</th><th>Descripcion</th><th>Cantidad</th>${type === 'inbound' ? '<th>Costo unit.</th><th>Total</th><th>Lote</th><th>Vence</th>' : ''}<th>Series</th>
            </tr>
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
          unitCost: item.unitCost ?? item.product?.purchasePrice ?? 0,
          lotNumber: item.lotNumber ?? '',
          expirationDate: item.expirationDate ? String(item.expirationDate).slice(0, 10) : '',
          serialNumbers: item.serialNumbers,
        }))
      : initialDraft?.items?.length
        ? initialDraft.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            locationId: item.locationId ?? getProductDefaultLocation(catalogs, item.productId, defaultWarehouse) ?? defaultProductLocation,
            unitCost: item.unitCost ?? catalogs.products.find((product) => product.id === item.productId)?.purchasePrice ?? 0,
            lotNumber: item.lotNumber ?? '',
            expirationDate: item.expirationDate ? String(item.expirationDate).slice(0, 10) : '',
            serialNumbers: item.serialNumbers ?? [],
          }))
      : [{ productId: defaultProductId, quantity: 1, locationId: defaultProductLocation, unitCost: 0, lotNumber: '', expirationDate: '', serialNumbers: [] }],
  );
  const [serialDrafts, setSerialDrafts] = useState<Record<number, string>>({});
  const [scannerInput, setScannerInput] = useState('');
  const [reviewPayload, setReviewPayload] = useState<OrderPayload | null>(null);
  const estimatedOrderNo = useMemo(() => {
    if (initialOrder?.orderNo) return initialOrder.orderNo;
    return `${mode === 'inbound' ? 'IN' : 'OUT'}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  }, [initialOrder?.orderNo, mode]);

  const locations = catalogs.locations.filter((location) => location.warehouseId === warehouseId);
  const updateItem = (index: number, patch: Partial<OrderItem>) => setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const scanValue = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return;
    if (mode === 'outbound') {
      const unit = availableUnits?.find((entry) => entry.serialNumber?.toLowerCase() === normalized && entry.warehouseId === warehouseId && entry.status === 'AVAILABLE');
      if (unit?.serialNumber) {
        setItems((current) => {
          const index = current.findIndex((item) => item.productId === unit.productId);
          if (index >= 0) {
            return current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    quantity: item.serialNumbers.includes(unit.serialNumber!) ? item.quantity : item.serialNumbers.length + 1,
                    serialNumbers: item.serialNumbers.includes(unit.serialNumber!) ? item.serialNumbers : [...item.serialNumbers, unit.serialNumber!],
                  }
                : item,
            );
          }
          return [...current.filter((item) => item.productId), { productId: unit.productId, quantity: 1, locationId: unit.locationId, serialNumbers: [unit.serialNumber!] }];
        });
        setScannerInput('');
        return;
      }
    }
    const product = catalogs.products.find(
      (entry) =>
        (!mode || mode === 'inbound' || entry.status === 'ACTIVE') &&
        (entry.sku.toLowerCase() === normalized ||
          entry.barcode?.toLowerCase() === normalized ||
          entry.barcodes?.some((barcode) => barcode.toLowerCase() === normalized)),
    );
    if (!product) {
      toast.error('No se encontro SKU, codigo de barra o serie');
      return;
    }
    setItems((current) => {
      const index = current.findIndex((item) => item.productId === product.id && !product.managesSerial);
      if (index >= 0) return current.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: item.quantity + 1 } : item));
      return [
        ...current.filter((item) => item.productId),
        {
          productId: product.id,
          quantity: 1,
          locationId: getProductDefaultLocation(catalogs, product.id, warehouseId) ?? locationId,
          unitCost: product.purchasePrice,
          lotNumber: '',
          expirationDate: '',
          serialNumbers: [],
        },
      ];
    });
    setScannerInput('');
  };
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
      importOrderId: initialDraft?.importOrderId,
      purchaseOrder,
      status: intent === 'draft' ? 'DRAFT' : mode === 'inbound' ? 'PENDING' : 'RESERVED',
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <div className="text-xs font-bold uppercase text-red-800">Numero de orden</div>
          <div className="text-lg font-extrabold text-red-950">{estimatedOrderNo}</div>
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
      <label className="wms-label wms-scan-panel">
        Escaner rapido
        <input
          className="wms-input"
          value={scannerInput}
          placeholder={mode === 'outbound' ? 'Escanee SKU, codigo de barra o serie' : 'Escanee SKU o codigo de barra'}
          onChange={(event) => setScannerInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            scanValue(scannerInput);
          }}
        />
        <span>Presione Enter despues del escaneo para agregar o sumar cantidades.</span>
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
                      unitCost: catalogs.products.find((entry) => entry.id === productId)?.purchasePrice ?? 0,
                      serialNumbers: [],
                    })
                  }
                />
                <label className="wms-label">
                  Cantidad
                  <input className="wms-input" type="number" min={1} value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                </label>
                {mode === 'inbound' ? (
                  <label className="wms-label">
                    Costo unit.
                    <input className="wms-input" type="number" min={0} step="0.01" value={Number(item.unitCost ?? product?.purchasePrice ?? 0)} onChange={(event) => updateItem(index, { unitCost: Number(event.target.value) })} />
                  </label>
                ) : null}
                {mode === 'inbound' ? (
                  <label className="wms-label">
                    Lote
                    <input className="wms-input" value={item.lotNumber ?? ''} onChange={(event) => updateItem(index, { lotNumber: event.target.value })} placeholder="Lote opcional" />
                  </label>
                ) : null}
                {mode === 'inbound' ? (
                  <label className="wms-label">
                    Vencimiento
                    <input className="wms-input" type="date" value={item.expirationDate ?? ''} onChange={(event) => updateItem(index, { expirationDate: event.target.value })} />
                  </label>
                ) : null}
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
                          {unit.lotNumber ? ` - Lote ${unit.lotNumber}` : ''}
                          {unit.expirationDate ? ` - Vence ${formatDateOnly(unit.expirationDate)}` : ''}
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
        <button type="button" className="wms-button" onClick={() => setItems((current) => [...current, { productId: '', quantity: 1, locationId, unitCost: 0, lotNumber: '', expirationDate: '', serialNumbers: [] }])}>
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
            {mode === 'outbound' ? 'Generar despacho' : 'Finalizar recepcion'}
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
  const pendingImportOrders = (importOrders.data ?? []).filter((order) => ['REQUESTED', 'PARTIAL'].includes(order.status));
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
              { header: 'Items pendientes', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} x${Math.max(0, item.quantity - (item.receivedQuantity ?? 0))}`).join(', ') },
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
              importOrderId: sourceImportOrder.id,
              purchaseOrder: sourceImportOrder.purchaseOrder ?? '',
              notes: `Recepcion generada desde pedido ${sourceImportOrder.orderNo}`,
              items: sourceImportOrder.items
                .map((item) => ({ productId: item.productId, quantity: Math.max(0, item.quantity - (item.receivedQuantity ?? 0)), unitCost: item.product?.purchasePrice ?? 0, serialNumbers: [] }))
                .filter((item) => item.quantity > 0),
            } : null}
            onCancel={() => { setCreating(false); setPrefillOrder(null); setSourceImportOrder(null); }}
            onSubmit={async (payload) => {
              const order = await wmsApi.saveInbound(payload, prefillOrder?.id);
              if (payload.status === 'PENDING') {
                await wmsApi.confirmInbound(order.id);
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
      <PageTitle title="Despachos" subtitle="Genere ordenes y reserve stock para picking guiado" action={<button className="wms-button primary" onClick={() => setCreating(true)}><Send size={16} /> Nuevo despacho</button>} />
      <OrdersTable
        type="outbound"
        data={orders.data ?? []}
        onView={(order) => setDetailOrder(order as OutboundOrder)}
        onEdit={(order) => {
          setPrefillOrder(order as OutboundOrder);
          setCreating(true);
        }}
        onReserve={(id) => action(wmsApi.reserveOutbound(id), 'Stock reservado')}
        onConfirm={(id) => action(wmsApi.reserveOutbound(id), 'Despacho generado y stock reservado')}
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
              await wmsApi.saveOutbound(payload, prefillOrder?.id);
              toast.success(payload.status === 'DRAFT' ? 'Despacho guardado como borrador' : 'Despacho generado para picking');
              setCreating(false);
              setPrefillOrder(null);
              refresh();
            }}
          />
        </Modal>
      ) : null}
      {detailOrder ? <OrderDetailModal type="outbound" order={detailOrder} onClose={() => setDetailOrder(null)} /> : null}
    </>
  );
}

function PackingPage() {
  const [shippingReview, setShippingReview] = useState<OutboundOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<OutboundOrder | null>(null);
  const orders = useLoad(() => wmsApi.outbound(), []);
  const packingOrders = (orders.data ?? []).filter((order) => ['PACKING', 'DISPATCHED'].includes(order.status));
  const ship = async (order: OutboundOrder) => {
    try {
      await wmsApi.shipOutbound(order.id);
      toast.success('Envio confirmado');
      setShippingReview(null);
      orders.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo confirmar el envio');
    }
  };
  const cancel = async (order: OutboundOrder) => {
    try {
      await wmsApi.cancelOutbound(order.id);
      toast.success('Orden cancelada y stock liberado');
      orders.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la orden');
    }
  };

  return (
    <>
      <PageTitle title="Packing" subtitle="Separe el material recogido por picking y confirme el envio final" />
      <div className="wms-grid cols-3 mb-5">
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Ordenes en packing</div><div className="mt-2 text-3xl font-extrabold">{packingOrders.length}</div></div>
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Lineas por separar</div><div className="mt-2 text-3xl font-extrabold">{packingOrders.reduce((sum, order) => sum + order.items.length, 0)}</div></div>
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Unidades recogidas</div><div className="mt-2 text-3xl font-extrabold">{packingOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)}</div></div>
      </div>
      <div className="wms-card">
        <DataTable
          data={packingOrders}
          columns={[
            { header: 'Despacho', accessorKey: 'orderNo' },
            { header: 'Cliente', cell: ({ row }) => row.original.client.name },
            { header: 'Bodega', cell: ({ row }) => row.original.warehouse.name },
            { header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
            { header: 'Contenido', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} x${item.quantity}`).join(', ') },
            { header: 'Fecha picking', cell: ({ row }) => row.original.confirmedAt ? new Date(row.original.confirmedAt).toLocaleString() : '-' },
            {
              header: 'Acciones',
              cell: ({ row }) => (
                <div className="wms-actions" onClick={(event) => event.stopPropagation()}>
                  <button className="wms-button" onClick={() => printOrderPdf('outbound', row.original)}>
                    <FileDown size={16} /> PDF
                  </button>
                  <button className="wms-button" onClick={() => downloadOutboundLabels(row.original)}>
                    <Printer size={16} /> Etiquetas
                  </button>
                  <button className="wms-button" onClick={() => setDetailOrder(row.original)}>
                    Revisar
                  </button>
                  <button className="wms-button primary" onClick={() => setShippingReview(row.original)}>
                    Enviar
                  </button>
                  <button className="wms-button danger" onClick={() => cancel(row.original)}>
                    Cancelar
                  </button>
                </div>
              ),
            },
          ]}
          onRowClick={(order) => setDetailOrder(order)}
        />
        {!packingOrders.length ? <div className="wms-card-body text-sm text-slate-500">No hay material recogido pendiente de packing.</div> : null}
      </div>
      {shippingReview ? (
        <ShipmentReview
          order={shippingReview}
          onClose={() => setShippingReview(null)}
          onSend={() => ship(shippingReview)}
          onEdit={() => {
            setDetailOrder(shippingReview);
            setShippingReview(null);
          }}
        />
      ) : null}
      {detailOrder ? <OrderDetailModal type="outbound" order={detailOrder} onClose={() => setDetailOrder(null)} /> : null}
    </>
  );
}

function PickingPage() {
  const orders = useLoad(() => wmsApi.outbound(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [pickingStarted, setPickingStarted] = useState(false);
  const [scan, setScan] = useState('');
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const activeKey = activeIds.join(',');
  const plan = useLoad<PickingPlan>(() => (activeIds.length ? wmsApi.pickingPlan(activeIds) : Promise.resolve(emptyPickingPlan())), [activeKey]);
  const eligibleOrders = (orders.data ?? []).filter((order) => order.status === 'RESERVED');
  const selectedOrders = eligibleOrders.filter((order) => selectedIds.includes(order.id));
  const displayPlan = plan.data;
  const routeItems = displayPlan?.items ?? [];
  const routeKey = routeItems.map((item, index) => pickingItemKey(item, index)).join('|');
  const selectedSet = new Set(selectedIds);
  const pickedSet = new Set(pickedKeys);
  const currentIndex = routeItems.findIndex((item, index) => !pickedSet.has(pickingItemKey(item, index)));
  const currentItem = currentIndex >= 0 ? routeItems[currentIndex] : null;
  const allPicked = routeItems.length > 0 && routeItems.every((item, index) => pickedSet.has(pickingItemKey(item, index)));
  const pickedUnits = routeItems.reduce((sum, item, index) => sum + (pickedSet.has(pickingItemKey(item, index)) ? item.quantity : 0), 0);
  useEffect(() => {
    setPickedKeys([]);
    setScan('');
  }, [activeKey]);
  useEffect(() => {
    setPickedKeys((current) => current.filter((key) => routeKey.includes(key)));
  }, [routeKey]);
  const toggle = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };
  const selectAll = () => setSelectedIds(eligibleOrders.map((order) => order.id));
  const clearSelection = () => setSelectedIds([]);
  const generatePicking = () => {
    if (!selectedIds.length) {
      toast.error('Seleccione al menos un despacho para generar picking');
      return;
    }
    setActiveIds(selectedIds);
    setPickingStarted(true);
  };
  const validateScan = (event: FormEvent) => {
    event.preventDefault();
    if (!currentItem) return toast.success('Ruta completamente recogida');
    const scanned = normalizeScan(scan);
    if (!scanned) return;
    const accepted = [currentItem.sku, currentItem.barcode ?? '', ...currentItem.barcodes, ...currentItem.serials].map(normalizeScan).filter(Boolean);
    if (!accepted.includes(scanned)) {
      toast.error(`No coincide con ${currentItem.sku}. Revise producto, codigo de barras o serie.`);
      setScan('');
      return;
    }
    setPickedKeys((current) => [...current, pickingItemKey(currentItem, currentIndex)]);
    setScan('');
    toast.success(`${currentItem.sku} recogido`);
  };
  const complete = async () => {
    if (!allPicked) return toast.error('Debe escanear todos los puntos de la ruta antes de finalizar');
    const ids = activeIds.length ? activeIds : displayPlan?.orders.map((order) => order.id) ?? [];
    if (!ids.length) return toast.error('No hay despachos para procesar');
    try {
      await wmsApi.completePicking(ids, 'dispatch');
      toast.success('Picking finalizado y despachos enviados a Packing');
      setSelectedIds([]);
      setActiveIds([]);
      setPickedKeys([]);
      setPickingStarted(false);
      orders.refresh();
      plan.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar picking');
    }
  };

  if (!pickingStarted) {
    return (
      <>
        <PageTitle
          title="Picking guiado"
          subtitle="Seleccione uno o varios despachos para armar una ruta de recoleccion"
          action={
            <div className="wms-actions">
              <button className="wms-button" onClick={selectAll}>Seleccionar todo</button>
              <button className="wms-button" onClick={clearSelection}>Limpiar</button>
              <button className="wms-button primary" onClick={generatePicking}><RouteIcon size={16} /> Generar picking guiado</button>
            </div>
          }
        />
        <div className="wms-grid cols-2">
          <div className="wms-card">
            <div className="wms-card-header">
              <div>
                <h3 className="font-extrabold">Despachos generados</h3>
                <p className="text-sm text-slate-500">Solo aparecen despachos reservados pendientes por recoger fisicamente.</p>
              </div>
            </div>
            <div className="wms-card-body grid gap-2">
              {eligibleOrders.map((order) => (
                <label className={`wms-picking-order ${selectedSet.has(order.id) ? 'selected' : ''}`} key={order.id}>
                  <input type="checkbox" checked={selectedSet.has(order.id)} onChange={() => toggle(order.id)} />
                  <span>
                    <strong>{order.orderNo}</strong>
                    <small>{order.client.name} / {order.warehouse.name}</small>
                    <small>{order.items.length} lineas / {order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades</small>
                  </span>
                </label>
              ))}
              {!eligibleOrders.length ? <div className="text-sm text-slate-500">No hay despachos reservados pendientes de picking.</div> : null}
            </div>
          </div>
          <div className="wms-card">
            <div className="wms-card-header">
              <div>
                <h3 className="font-extrabold">Contenido seleccionado</h3>
                <p className="text-sm text-slate-500">{selectedOrders.length ? `${selectedOrders.length} despachos listos para ruta` : 'Seleccione despachos para ver el contenido'}</p>
              </div>
            </div>
            <div className="wms-card-body">
              <div className="wms-picking-preview">
                {selectedOrders.map((order) => (
                  <section className="wms-picking-preview-order" key={order.id}>
                    <div>
                      <strong>{order.orderNo}</strong>
                      <span>{order.client.name}</span>
                    </div>
                    {order.items.map((item) => (
                      <div className="wms-picking-preview-item" key={item.id ?? `${order.id}-${item.productId}`}>
                        <span>{item.product?.sku ?? '-'}</span>
                        <strong>{item.product?.name ?? '-'}</strong>
                        <b>{item.quantity}</b>
                      </div>
                    ))}
                  </section>
                ))}
                {!selectedOrders.length ? <div className="text-sm text-slate-500">Aqui se mostraran SKU, descripcion y cantidad de los despachos seleccionados.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Picking guiado"
        subtitle="Siga el camino sugerido y valide cada punto con escaner"
        action={
          <div className="wms-actions">
            <button className="wms-button" onClick={() => setPickingStarted(false)}>Volver a seleccionar</button>
            <button className="wms-button" onClick={plan.refresh}>Recalcular ruta</button>
            <button className="wms-button primary" onClick={complete} disabled={!allPicked}><RouteIcon size={16} /> Finalizar picking</button>
          </div>
        }
      />
      <div className="wms-grid cols-4 mb-5">
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Pedidos</div><div className="mt-2 text-3xl font-extrabold">{displayPlan?.totals.orders ?? 0}</div></div>
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Lineas</div><div className="mt-2 text-3xl font-extrabold">{displayPlan?.totals.lines ?? 0}</div></div>
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Unidades</div><div className="mt-2 text-3xl font-extrabold">{displayPlan?.totals.units ?? 0}</div></div>
        <div className="wms-card wms-card-body"><div className="text-sm font-bold text-slate-500">Recogido</div><div className="mt-2 text-3xl font-extrabold">{pickedUnits}/{displayPlan?.totals.units ?? 0}</div></div>
      </div>
      <div className="wms-card mb-5">
        <div className="wms-card-header">
          <div>
            <h3 className="font-extrabold">Mapa de recorrido</h3>
            <p className="text-sm text-slate-500">Los numeros indican el orden recomendado para pasar por cada rack.</p>
          </div>
        </div>
        <div className="wms-card-body">
          <PickingRouteMap items={routeItems} pickedSet={pickedSet} currentIndex={currentIndex} />
          {!routeItems.length && !plan.loading ? <div className="text-sm text-slate-500">No hay unidades reservadas para los despachos seleccionados.</div> : null}
          {plan.loading ? <div className="text-sm text-slate-500">Calculando ruta...</div> : null}
        </div>
      </div>
      <form className="wms-card mb-5" onSubmit={validateScan}>
        <div className="wms-card-header">
          <div>
            <h3 className="font-extrabold">Escaneo de picking</h3>
            <p className="text-sm text-slate-500">{currentItem ? `Siguiente: ${currentItem.locationCode} / ${currentItem.sku}` : 'Ruta completa'}</p>
          </div>
          <button className="wms-button primary" disabled={!currentItem}>
            Validar
          </button>
        </div>
        <div className="wms-card-body wms-scan-panel">
          <input
            className="wms-input"
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            placeholder="Escanee codigo de barras, SKU o serie"
            autoFocus
          />
          {currentItem ? (
            <div className="wms-next-pick">
              <strong>{currentItem.product}</strong>
              <span>{currentItem.warehouse} / {currentItem.location}</span>
              <span>Cantidad {currentItem.quantity} / Lote {currentItem.lots.length ? currentItem.lots.join(', ') : '-'} / Vence {formatDateOnly(currentItem.expirationDate)}</span>
            </div>
          ) : (
            <div className="wms-next-pick done">Todo el recorrido fue validado. Ya puede finalizar picking.</div>
          )}
        </div>
      </form>
      <div className="wms-card">
        <div className="wms-card-header">
          <h3 className="font-extrabold">Ruta en palabras</h3>
        </div>
        <div className="wms-card-body">
          <div className="wms-picking-route">
            {(displayPlan?.items ?? []).map((item, index) => (
              <div className={`wms-picking-step ${pickedSet.has(pickingItemKey(item, index)) ? 'picked' : index === currentIndex ? 'current' : ''}`} key={`${item.orderId}-${item.productId}-${item.locationId}-${index}`}>
                <div className="wms-picking-index">{index + 1}</div>
                <div>
                  <div className="font-extrabold">Dirigirse a {item.locationCode} / {item.location}</div>
                  <div className="text-sm text-slate-600">Recoger {item.quantity} de {item.sku} - {item.product}</div>
                  <div className="text-xs text-slate-500">{item.orderNo} / {item.client}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                    <span>Lote {item.lots.length ? item.lots.join(', ') : '-'}</span>
                    <span>Vence {formatDateOnly(item.expirationDate)}</span>
                    {item.serials.length ? <span>Series {item.serials.join(', ')}</span> : null}
                    {pickedSet.has(pickingItemKey(item, index)) ? <span>Recogido</span> : null}
                  </div>
                </div>
              </div>
            ))}
            {!displayPlan?.items?.length ? <div className="text-sm text-slate-500">No hay ruta calculada para estos despachos.</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function zplSafe(value: string) {
  return value.replace(/[\^~]/g, ' ').slice(0, 42);
}

function generateOutboundZpl(order: OutboundOrder) {
  return order.items
    .map((item, index) => {
      const sku = zplSafe(item.product?.sku ?? '-');
      const name = zplSafe(item.product?.name ?? '-');
      const client = zplSafe(order.client.name);
      const serials = item.serialNumbers.length ? item.serialNumbers : [`QTY-${item.quantity}`];
      return serials
        .map((serial, serialIndex) => {
          const code = zplSafe(`${order.orderNo}-${sku}-${serialIndex + 1}`);
          return `^XA
^CI28
^PW600
^LL360
^FO30,24^A0N,34,34^FD${zplSafe(order.orderNo)}^FS
^FO30,68^A0N,24,24^FDCliente: ${client}^FS
^FO30,104^A0N,24,24^FDSKU: ${sku}^FS
^FO30,138^A0N,24,24^FD${name}^FS
^FO30,174^A0N,24,24^FDCantidad: ${item.quantity}^FS
^FO30,208^A0N,24,24^FDSerie/Lote: ${zplSafe(serial)}^FS
^BY2,2,72
^FO30,248^BCN,72,Y,N,N^FD${code}^FS
^FO470,24^A0N,22,22^FD${index + 1}/${order.items.length}^FS
^XZ`;
        })
        .join('\n');
    })
    .join('\n');
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadOutboundLabels(order: OutboundOrder) {
  downloadText(`etiquetas-${order.orderNo}.zpl`, generateOutboundZpl(order));
  toast.success('Etiquetas ZPL generadas');
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
                <button className="wms-button" onClick={() => printOrderPdf(type, row.original)}>
                  <FileDown size={16} /> PDF
                </button>
                {type === 'outbound' ? (
                  <button className="wms-button" onClick={() => downloadOutboundLabels(row.original as OutboundOrder)}>
                    <Printer size={16} /> Etiquetas
                  </button>
                ) : null}
                {['DRAFT', 'PENDING', 'RESERVED'].includes(row.original.status) ? (
                  <button className="wms-button" onClick={() => onEdit(row.original)}>
                    Editar
                  </button>
                ) : null}
                {type === 'outbound' && onShip && ['PACKING', 'DISPATCHED'].includes(row.original.status) ? (
                  <button className="wms-button primary" onClick={() => onShip?.(row.original.id)}>
                    Enviar
                  </button>
                ) : null}
                {((type === 'inbound' && ['DRAFT', 'PENDING'].includes(row.original.status)) || (type === 'outbound' && row.original.status === 'DRAFT')) ? (
                  <button className="wms-button primary" onClick={() => onConfirm(row.original.id)}>
                    {type === 'outbound' ? 'Generar despacho' : 'Confirmar'}
                  </button>
                ) : null}
                {['DRAFT', 'PENDING', 'RESERVED', 'PACKING', 'DISPATCHED'].includes(row.original.status) && row.original.status !== 'SHIPPED' ? (
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
          <td>${item.receivedQuantity ?? 0}</td>
          <td>${Math.max(0, item.quantity - (item.receivedQuantity ?? 0))}</td>
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
            <tr><th>SKU</th><th>Descripcion</th><th>Cantidad pedida</th><th>Recibido</th><th>Pendiente</th></tr>
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
            { header: 'Items', cell: ({ row }) => row.original.items.map((item) => `${item.product?.sku} ${item.receivedQuantity ?? 0}/${item.quantity}`).join(', ') },
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
  const [type, setType] = useState('analytics');
  const { data, refresh } = useLoad(() => wmsApi.reports(`?type=${type}`), [type]);
  const rows = useMemo(() => normalizeReportRows(type, Array.isArray(data) ? data : []), [type, data]);
  const analytics = type === 'analytics' ? (data as ReportAnalytics | null) : null;
  return (
    <>
      <PageTitle
        title="Reportes"
        subtitle="Indicadores operativos, tiempos de despacho y exportacion CSV"
        action={<button className="wms-button" onClick={() => downloadCsv(`${type}.csv`, rows)}><FileDown size={16} /> CSV</button>}
      />
      <div className="wms-card">
        <div className="wms-card-header">
          <select className="wms-select max-w-sm" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="analytics">Analitica operativa</option>
            <option value="stock">Stock actual</option>
            <option value="low-stock">Stock bajo minimo</option>
            <option value="available-serials">Series disponibles</option>
            <option value="dispatched-serials">Series despachadas</option>
            <option value="movements">Movimientos por fecha</option>
            <option value="inbound-suppliers">Entradas por proveedor</option>
            <option value="outbound-clients">Salidas por cliente</option>
            <option value="inventory-valuation">Valoracion de inventario</option>
            <option value="top-moving">Productos con mas movimiento</option>
            <option value="inbound-costs">Costos por recepcion</option>
            <option value="audit-log">Auditoria del sistema</option>
          </select>
          <button className="wms-button" onClick={refresh}>Actualizar</button>
        </div>
        {analytics ? (
          <div className="wms-card-body grid gap-5">
            <div className="wms-grid cols-2">
              <div className="wms-card">
                <div className="wms-card-header"><h3 className="font-extrabold">Movimientos ultimos 14 dias</h3></div>
                <div className="wms-card-body h-80">
                  <ResponsiveContainer>
                    <BarChart data={analytics.movementTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="ingresos" name="Ingresos" fill="#16a34a" />
                      <Bar dataKey="reservas" name="Reservas" fill="#f59e0b" />
                      <Bar dataKey="despachos" name="Despachos" fill="#dc2626" />
                      <Bar dataKey="envios" name="Envios" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="wms-card">
                <div className="wms-card-header"><h3 className="font-extrabold">Tiempo promedio por estado</h3></div>
                <div className="wms-card-body h-80">
                  <ResponsiveContainer>
                    <BarChart data={analytics.statusAging}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" tickFormatter={(value) => statusLabels[value] ?? value} tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip labelFormatter={(value) => statusLabels[String(value)] ?? value} />
                      <Bar dataKey="avgHours" name="Horas promedio" fill="#dc2626" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="wms-grid cols-2">
              <div className="wms-card">
                <div className="wms-card-header"><h3 className="font-extrabold">Productos con mas movimiento</h3></div>
                <ReportTable rows={analytics.topProducts.map((item) => ({ sku: item.sku, producto: item.name, cantidad: item.quantity, movimientos: item.movements }))} />
              </div>
              <div className="wms-card">
                <div className="wms-card-header"><h3 className="font-extrabold">Bajo stock</h3></div>
                <ReportTable rows={analytics.lowStock.map((item) => ({ sku: item.sku, producto: item.name, disponible: item.available, minimo: item.stockMin }))} />
              </div>
            </div>
            <div className="wms-card">
              <div className="wms-card-header"><h3 className="font-extrabold">Tiempos de despacho</h3></div>
              <ReportTable rows={analytics.dispatchCycle.map((item) => ({ documento: item.orderNo, cliente: item.client, estado: statusLabels[item.status] ?? item.status, horas: item.hoursToClose, creado: item.createdAt, cerrado: item.closedAt ?? '' }))} />
            </div>
          </div>
        ) : (
          <ReportTable rows={rows} />
        )}
      </div>
    </>
  );
}

function normalizeReportRows(type: string, data: unknown[]): Record<string, unknown>[] {
  if (type === 'stock') {
    return (data as InventoryBalance[]).map((row) => ({ sku: row.product.sku, producto: row.product.name, bodega: row.warehouse.name, ubicacion: row.location.name, estado: statusLabels[row.status], cantidad: row.quantity }));
  }
  if (type === 'analytics') return [];
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
  if (type === 'inbound-costs') {
    return (data as InboundOrder[]).flatMap((row) =>
      row.items.map((item) => ({
        documento: row.orderNo,
        proveedor: row.supplier.name,
        bodega: row.warehouse.name,
        sku: item.product?.sku ?? '',
        producto: item.product?.name ?? '',
        cantidad: item.quantity,
        costo_unitario: Number(item.unitCost ?? item.product?.purchasePrice ?? 0),
        total: Number(item.unitCost ?? item.product?.purchasePrice ?? 0) * item.quantity,
        usuario: row.createdBy?.name ?? '',
        fecha: row.confirmedAt ?? row.createdAt,
      })),
    );
  }
  if (type === 'audit-log') {
    return (data as AuditLog[]).map((row) => ({
      fecha: row.createdAt,
      usuario: row.user?.name ?? '',
      accion: row.action,
      entidad: row.entity,
      resumen: row.summary,
    }));
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
