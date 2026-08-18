import type { Catalogs, DashboardData } from './types';

const TOKEN_KEY = 'mundiwms-token';
const COMPANY_KEY = 'mundiwms-company-id';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getCompanyId() {
  return localStorage.getItem(COMPANY_KEY) || 'company_ferremayor';
}

export function setCompanyId(companyId: string) {
  localStorage.setItem(COMPANY_KEY, companyId);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token ? { 'X-Company-Id': getCompanyId() } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo completar la operacion');
  }
  return data as T;
}

export const wmsApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: import('./types').UserSession }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api<import('./types').UserSession>('/me'),
  companies: () => api<import('./types').Company[]>('/companies'),
  catalogs: () => api<Catalogs>('/catalogs'),
  dashboard: () => api<DashboardData>('/dashboard'),
  categories: () => api<import('./types').ProductCategory[]>('/categories'),
  saveCategory: (payload: unknown, id?: string) =>
    api<import('./types').ProductCategory>(id ? `/categories/${id}` : '/categories', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteCategory: (id: string) => api<{ ok: boolean; mode: 'DELETED' | 'INACTIVATED' }>(`/categories/${id}`, { method: 'DELETE' }),
  products: (search = '') => api<import('./types').Product[]>(`/products?search=${encodeURIComponent(search)}`),
  saveProduct: (payload: unknown, id?: string) =>
    api<import('./types').Product>(id ? `/products/${id}` : '/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id: string) => api<{ ok: boolean; mode: 'DELETED' | 'INACTIVATED' }>(`/products/${id}`, { method: 'DELETE' }),
  inventory: (params = '') => api<{ units: import('./types').InventoryUnit[]; balances: import('./types').InventoryBalance[] }>(`/inventory${params}`),
  unitMovements: (id: string) => api<import('./types').KardexMovement[]>(`/inventory/${id}/movements`),
  inbound: () => api<import('./types').InboundOrder[]>('/inbound'),
  importOrders: () => api<import('./types').ImportOrder[]>('/import-orders'),
  saveImportOrder: (payload: unknown, id?: string) =>
    api<import('./types').ImportOrder>(id ? `/import-orders/${id}` : '/import-orders', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  cancelImportOrder: (id: string) => api(`/import-orders/${id}/cancel`, { method: 'POST' }),
  completeImportOrder: (id: string) => api(`/import-orders/${id}/received`, { method: 'POST' }),
  saveInbound: (payload: unknown, id?: string) =>
    api<import('./types').InboundOrder>(id ? `/inbound/${id}` : '/inbound', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  confirmInbound: (id: string) => api(`/inbound/${id}/confirm`, { method: 'POST' }),
  cancelInbound: (id: string) => api(`/inbound/${id}/cancel`, { method: 'POST' }),
  outbound: () => api<import('./types').OutboundOrder[]>('/outbound'),
  saveOutbound: (payload: unknown, id?: string) =>
    api<import('./types').OutboundOrder>(id ? `/outbound/${id}` : '/outbound', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  reserveOutbound: (id: string) => api(`/outbound/${id}/reserve`, { method: 'POST' }),
  dispatchOutbound: (id: string) => api(`/outbound/${id}/dispatch`, { method: 'POST' }),
  shipOutbound: (id: string) => api(`/outbound/${id}/ship`, { method: 'POST' }),
  cancelOutbound: (id: string) => api(`/outbound/${id}/cancel`, { method: 'POST' }),
  kardex: (query = '') => api<import('./types').KardexMovement[]>(`/kardex${query}`),
  saveAdjustment: (payload: unknown) => api('/adjustments', { method: 'POST', body: JSON.stringify(payload) }),
  saveWarehouse: (payload: unknown, id?: string) =>
    api<import('./types').Warehouse>(id ? `/warehouses/${id}` : '/warehouses', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteWarehouse: (id: string) => api<{ ok: boolean }>(`/warehouses/${id}`, { method: 'DELETE' }),
  saveLocation: (payload: unknown, id?: string) =>
    api<import('./types').Location>(id ? `/locations/${id}` : '/locations', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteLocation: (id: string) => api<{ ok: boolean }>(`/locations/${id}`, { method: 'DELETE' }),
  roles: () => api<import('./types').Role[]>('/roles'),
  saveRole: (payload: unknown, id?: string) =>
    api<import('./types').Role>(id ? `/roles/${id}` : '/roles', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteRole: (id: string) => api<{ ok: boolean }>(`/roles/${id}`, { method: 'DELETE' }),
  users: () => api<import('./types').AdminUser[]>('/users'),
  saveUser: (payload: unknown, id?: string) =>
    api<import('./types').AdminUser>(id ? `/users/${id}` : '/users', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: string) => api<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  contacts: (type: 'clients' | 'suppliers') => api<import('./types').Contact[]>(`/${type}`),
  saveContact: (type: 'clients' | 'suppliers', payload: unknown, id?: string) =>
    api<import('./types').Contact>(id ? `/${type}/${id}` : `/${type}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteContact: (type: 'clients' | 'suppliers', id: string) => api<{ ok: boolean; mode: 'DELETED' | 'INACTIVATED' }>(`/${type}/${id}`, { method: 'DELETE' }),
  reports: (query = '') => api<unknown[]>(`/reports${query}`),
};

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
