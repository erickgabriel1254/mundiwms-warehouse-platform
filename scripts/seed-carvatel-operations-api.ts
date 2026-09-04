const API_BASE = process.env.WMS_API_URL ?? 'https://mundiwms-demo.vercel.app';
const EMAIL = process.env.WMS_ADMIN_EMAIL ?? 'admin@mundiwms.local';
const PASSWORD = process.env.WMS_ADMIN_PASSWORD ?? 'Admin123!';
const MARKER = 'CTV-OPS-2026';

type Company = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Location = { id: string; code: string; name: string; warehouseId: string; kind?: string; aisle?: string; rack?: string; level?: string; position?: string };
type Contact = { id: string; name: string; taxId: string };
type Product = {
  id: string;
  sku: string;
  barcode?: string | null;
  barcodes?: string[];
  name: string;
  category: string;
  brand: string;
  description?: string;
  includes?: string[];
  sourceUrl?: string | null;
  unit: string;
  purchasePrice: string | number;
  salePrice: string | number;
  stockMin: number;
  managesSerial: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  inventoryBalances?: { warehouseId: string; status: string; quantity: number }[];
  locationDefaults?: { warehouseId: string; locationId: string }[];
};
type Catalogs = { companies: Company[]; products: Product[]; suppliers: Contact[]; clients: Contact[]; warehouses: Warehouse[]; locations: Location[] };
type ImportOrder = { id: string; purchaseOrder?: string | null; status: string; items: { productId: string; quantity: number; receivedQuantity?: number }[] };
type InboundOrder = { id: string; purchaseOrder?: string | null; status: string };
type OutboundOrder = { id: string; purchaseOrder?: string | null; status: string };
type InventoryUnit = { id: string; productId: string; warehouseId: string; locationId: string; serialNumber?: string | null; status: string; product: Product };
type Inventory = { units: InventoryUnit[] };

type ProductPlan = {
  min: number;
  inboundMain: number;
  inboundBranch: number;
  outboundMain: number;
  outboundBranch: number;
};

const productPlans: Record<string, ProductPlan> = {
  'FM-ELE-CAB-001': { min: 180, inboundMain: 80, inboundBranch: 32, outboundMain: 140, outboundBranch: 24 },
  'FER-LIJ-MANO-001': { min: 120, inboundMain: 70, inboundBranch: 24, outboundMain: 95, outboundBranch: 18 },
  'FM-HER-DES-001': { min: 28, inboundMain: 18, inboundBranch: 8, outboundMain: 22, outboundBranch: 6 },
  'FM-HER-MAR-001': { min: 24, inboundMain: 16, inboundBranch: 7, outboundMain: 18, outboundBranch: 5 },
  'FER-QUI-THINNER-001': { min: 36, inboundMain: 20, inboundBranch: 10, outboundMain: 26, outboundBranch: 7 },
  'FER-PIN-LATEX-001': { min: 18, inboundMain: 10, inboundBranch: 5, outboundMain: 12, outboundBranch: 3 },
  'FM-SEG-CER-001': { min: 16, inboundMain: 10, inboundBranch: 4, outboundMain: 11, outboundBranch: 3 },
  'FM-JAR-MAN-001': { min: 14, inboundMain: 8, inboundBranch: 4, outboundMain: 9, outboundBranch: 3 },
  'A.2041': { min: 8, inboundMain: 5, inboundBranch: 2, outboundMain: 4, outboundBranch: 1 },
  'A.2042': { min: 6, inboundMain: 4, inboundBranch: 2, outboundMain: 3, outboundBranch: 1 },
  'H.1043': { min: 5, inboundMain: 3, inboundBranch: 2, outboundMain: 2, outboundBranch: 1 },
  'S.1227': { min: 5, inboundMain: 3, inboundBranch: 1, outboundMain: 2, outboundBranch: 1 },
};

const fallbackMinimums = [10, 8, 12, 6, 15, 20, 5, 9];

function isBranch(company: Company) {
  return ['FERRILOPEZ', 'CARVATEL-SUC', 'CARVATEL-TIENDA'].includes(company.code);
}

function isTargetCompany(company: Company) {
  return ['FERREMAYOR', 'FERRILOPEZ', 'CARVATEL', 'CARVATEL-SUC', 'CARVATEL-MATRIZ', 'CARVATEL-TIENDA'].includes(company.code);
}

function clean(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function money(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function qty(company: Company, plan: ProductPlan) {
  return isBranch(company) ? plan.inboundBranch : plan.inboundMain;
}

function outboundQty(company: Company, plan: ProductPlan) {
  return isBranch(company) ? plan.outboundBranch : plan.outboundMain;
}

async function api<T>(path: string, token: string, companyId: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Company-Id': companyId,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data as T;
}

async function login() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = (await response.json()) as { token?: string; error?: string };
  if (!response.ok || !data.token) throw new Error(data.error ?? 'No se pudo iniciar sesion');
  return data.token;
}

function mergedDefaults(catalogsByCompany: Catalogs[], sku: string) {
  const defaults = catalogsByCompany.flatMap((catalogs) => catalogs.products.find((product) => product.sku === sku)?.locationDefaults ?? []);
  return Array.from(new Map(defaults.map((item) => [item.warehouseId, item])).values());
}

async function updateProduct(token: string, companyId: string, product: Product, stockMin: number, catalogsByCompany: Catalogs[]) {
  await api<Product>(`/products/${product.id}`, token, companyId, {
    method: 'PUT',
    body: JSON.stringify({
      sku: product.sku,
      barcode: product.barcode ?? '',
      barcodes: product.barcodes ?? [],
      name: product.name,
      category: product.category,
      brand: product.brand,
      description: product.description ?? '',
      includes: product.includes ?? [],
      sourceUrl: product.sourceUrl ?? '',
      unit: product.unit,
      purchasePrice: money(product.purchasePrice),
      salePrice: money(product.salePrice),
      stockMin,
      managesSerial: product.managesSerial,
      status: product.status,
      locationDefaults: mergedDefaults(catalogsByCompany, product.sku),
    }),
  });
}

async function ensureContact(token: string, company: Company, catalogs: Catalogs, type: 'suppliers' | 'clients', index: number) {
  const branch = isBranch(company);
  const base = type === 'suppliers' ? 9100 : 9200;
  const taxId = `179${branch ? '20' : '10'}${base + index}001`;
  const existing = (type === 'suppliers' ? catalogs.suppliers : catalogs.clients).find((contact) => contact.taxId === taxId);
  if (existing) return existing;
  const label = type === 'suppliers' ? 'Proveedor' : 'Cliente';
  return api<Contact>(`/${type}`, token, company.id, {
    method: 'POST',
    body: JSON.stringify({
      name: `${label} Operativo Carvatel ${branch ? 'Sucursal' : 'Matriz'} ${index}`,
      taxId,
      contact: `${label} compras ${index}`,
      phone: `099${branch ? '8' : '7'}${String(index).padStart(6, '0')}`,
      email: `${type}.${branch ? 'sucursal' : 'matriz'}.${index}@carvatel.demo`,
      address: branch ? 'Sucursal Carvatel' : 'Centro de distribucion Carvatel',
      status: 'ACTIVE',
    }),
  });
}

function pickWarehouse(catalogs: Catalogs) {
  const warehouse = catalogs.warehouses[0];
  if (!warehouse) throw new Error('No hay bodegas configuradas');
  return warehouse;
}

function pickLocation(catalogs: Catalogs, warehouseId: string, kind: 'RECEIVING' | 'DISPATCH' | 'STORAGE') {
  const byWarehouse = catalogs.locations.filter((location) => location.warehouseId === warehouseId);
  const byKind = byWarehouse.find((location) => location.kind === kind);
  if (byKind) return byKind;
  const byCode = byWarehouse.find((location) => (kind === 'RECEIVING' ? location.code === 'REC' : kind === 'DISPATCH' ? location.code === 'DES' : location.code === 'ALM'));
  if (byCode) return byCode;
  const storage = byWarehouse.find((location) => location.aisle && location.rack && location.level && location.position) ?? byWarehouse[0];
  if (!storage) throw new Error('No hay ubicaciones configuradas');
  return storage;
}

function storageLocations(catalogs: Catalogs, warehouseId: string) {
  const locations = catalogs.locations
    .filter((location) => location.warehouseId === warehouseId && (location.kind === 'STORAGE' || (location.aisle && location.rack)))
    .sort((a, b) => a.code.localeCompare(b.code));
  return locations.length ? locations : [pickLocation(catalogs, warehouseId, 'STORAGE')];
}

function activeProducts(catalogs: Catalogs) {
  return catalogs.products.filter((product) => product.status === 'ACTIVE');
}

function plannedProducts(catalogs: Catalogs) {
  const products = activeProducts(catalogs);
  const planned = Object.keys(productPlans)
    .map((sku) => products.find((product) => product.sku === sku))
    .filter((product): product is Product => Boolean(product));
  return planned.length >= 8 ? planned : products.slice(0, 16);
}

function productPlan(product: Product, index: number): ProductPlan {
  return productPlans[product.sku] ?? {
    min: fallbackMinimums[index % fallbackMinimums.length],
    inboundMain: 8 + (index % 4) * 3,
    inboundBranch: 3 + (index % 3),
    outboundMain: 4 + (index % 4) * 2,
    outboundBranch: 1 + (index % 3),
  };
}

function serials(company: Company, product: Product, orderKey: string, quantity: number) {
  return Array.from({ length: quantity }, (_, index) => `${company.code}-${clean(product.sku)}-${clean(orderKey)}-${String(index + 1).padStart(3, '0')}`);
}

function expirationFor(seed: number, near = false) {
  const date = new Date();
  date.setMonth(date.getMonth() + (near ? 2 + (seed % 4) : 8 + (seed % 10)));
  return date.toISOString().slice(0, 10);
}

function inboundItems(company: Company, products: Product[], locations: Location[], orderKey: string, sliceStart = 0, sliceCount = 5, factor = 1) {
  return products.slice(sliceStart, sliceStart + sliceCount).map((product, index) => {
    const plan = productPlan(product, sliceStart + index);
    const quantity = Math.max(1, Math.ceil(qty(company, plan) * factor));
    const location = locations[(sliceStart + index) % locations.length];
    const lotSeed = sliceStart + index + clean(orderKey).length;
    return {
      productId: product.id,
      quantity,
      locationId: location.id,
      unitCost: Math.max(0.01, money(product.purchasePrice)),
      lotNumber: `LOT-${company.code}-${String(lotSeed).padStart(3, '0')}`,
      expirationDate: expirationFor(lotSeed, factor < 0.7),
      serialNumbers: product.managesSerial ? serials(company, product, orderKey, quantity) : [],
    };
  });
}

function importItems(company: Company, products: Product[], sliceStart = 0, sliceCount = 6, factor = 1) {
  return products.slice(sliceStart, sliceStart + sliceCount).map((product, index) => {
    const plan = productPlan(product, sliceStart + index);
    return {
      productId: product.id,
      quantity: Math.max(1, Math.ceil(qty(company, plan) * factor)),
      unitCost: Math.max(0.01, money(product.purchasePrice)),
    };
  });
}

async function ensureImportOrder(token: string, company: Company, supplierId: string, purchaseOrder: string, products: Product[], status: 'DRAFT' | 'REQUESTED', sliceStart: number, sliceCount: number, factor = 1) {
  const existing = await api<ImportOrder[]>('/import-orders', token, company.id);
  const found = existing.find((order) => order.purchaseOrder === purchaseOrder);
  if (found) return found;
  return api<ImportOrder>('/import-orders', token, company.id, {
    method: 'POST',
    body: JSON.stringify({
      supplierId,
      purchaseOrder,
      status,
      notes: `Pedido demo Carvatel generado para mostrar planificacion de compras (${purchaseOrder})`,
      items: importItems(company, products, sliceStart, sliceCount, factor),
    }),
  });
}

async function ensureInbound(token: string, company: Company, purchaseOrder: string, payload: unknown, confirm: boolean) {
  const existing = await api<InboundOrder[]>('/inbound', token, company.id);
  const found = existing.find((order) => order.purchaseOrder === purchaseOrder);
  if (found) {
    if (confirm && ['DRAFT', 'PENDING'].includes(found.status)) {
      await api(`/inbound/${found.id}/confirm`, token, company.id, { method: 'POST' });
      return 'confirmada';
    }
    return 'existente';
  }
  const created = await api<InboundOrder>('/inbound', token, company.id, { method: 'POST', body: JSON.stringify(payload) });
  if (confirm) {
    await api(`/inbound/${created.id}/confirm`, token, company.id, { method: 'POST' });
    return 'creada y confirmada';
  }
  return 'creada pendiente';
}

function countAvailable(units: InventoryUnit[], productId: string, warehouseId: string) {
  return units.filter((unit) => unit.productId === productId && unit.warehouseId === warehouseId && unit.status === 'AVAILABLE').length;
}

function buildOutboundItems(company: Company, units: InventoryUnit[], products: Product[], warehouseId: string, orderKey: string, start: number, count: number, factor = 1) {
  const items = [];
  for (const [relativeIndex, product] of products.slice(start, start + count).entries()) {
    const absoluteIndex = start + relativeIndex;
    const plan = productPlan(product, absoluteIndex);
    const desired = Math.max(1, Math.ceil(outboundQty(company, plan) * factor));
    const available = units.filter((unit) => unit.productId === product.id && unit.warehouseId === warehouseId && unit.status === 'AVAILABLE');
    const quantity = Math.min(desired, available.length);
    if (quantity <= 0) continue;
    items.push({
      productId: product.id,
      quantity,
      serialNumbers: product.managesSerial ? available.filter((unit) => unit.serialNumber).slice(0, quantity).map((unit) => unit.serialNumber as string) : [],
      orderKey,
    });
  }
  return items.filter((item) => !products.find((product) => product.id === item.productId)?.managesSerial || item.serialNumbers.length === item.quantity);
}

async function ensureOutbound(token: string, company: Company, purchaseOrder: string, payload: unknown, finalStatus: 'RESERVED' | 'DISPATCHED' | 'SHIPPED') {
  const existing = await api<OutboundOrder[]>('/outbound', token, company.id);
  const found = existing.find((order) => order.purchaseOrder === purchaseOrder);
  if (found) return 'existente';
  const created = await api<OutboundOrder>('/outbound', token, company.id, { method: 'POST', body: JSON.stringify(payload) });
  if (finalStatus === 'SHIPPED') {
    await api(`/outbound/${created.id}/ship`, token, company.id, { method: 'POST' });
    return 'creado, despachado y enviado';
  }
  return finalStatus === 'DISPATCHED' ? 'creado y despachado' : 'creado y reservado';
}

async function refreshCatalogs(token: string, companies: Company[]) {
  return Promise.all(companies.map((company) => api<Catalogs>('/catalogs', token, company.id)));
}

async function tuneStockMinimums(token: string, companies: Company[], catalogsByCompany: Catalogs[]) {
  const desiredBySku = new Map<string, number>();
  for (const catalogs of catalogsByCompany) {
    for (const [index, product] of plannedProducts(catalogs).slice(0, 12).entries()) {
      const available = product.inventoryBalances?.filter((balance) => balance.status === 'AVAILABLE').reduce((sum, balance) => sum + balance.quantity, 0) ?? 0;
      const plan = productPlan(product, index);
      const desired = Math.max(plan.min, available + Math.max(2, Math.ceil(plan.min * 0.25)));
      desiredBySku.set(product.sku, Math.max(desiredBySku.get(product.sku) ?? 0, desired));
    }
  }

  const baseCompany = companies[0];
  const baseCatalog = catalogsByCompany[0];
  if (!baseCompany || !baseCatalog) return 0;
  let updated = 0;
  for (const product of baseCatalog.products) {
    const desired = desiredBySku.get(product.sku);
    if (!desired || product.stockMin === desired) continue;
    await updateProduct(token, baseCompany.id, product, desired, catalogsByCompany);
    updated += 1;
  }
  return updated;
}

async function seedCompany(token: string, company: Company) {
  let catalogs = await api<Catalogs>('/catalogs', token, company.id);
  const supplier = await ensureContact(token, company, catalogs, 'suppliers', 1);
  const supplier2 = await ensureContact(token, company, catalogs, 'suppliers', 2);
  const client = await ensureContact(token, company, catalogs, 'clients', 1);
  const client2 = await ensureContact(token, company, catalogs, 'clients', 2);
  catalogs = await api<Catalogs>('/catalogs', token, company.id);

  const warehouse = pickWarehouse(catalogs);
  const receiving = pickLocation(catalogs, warehouse.id, 'RECEIVING');
  const dispatch = pickLocation(catalogs, warehouse.id, 'DISPATCH');
  const storage = storageLocations(catalogs, warehouse.id);
  const products = plannedProducts(catalogs);
  if (products.length < 4) throw new Error(`Faltan productos activos para ${company.name}`);

  const results: string[] = [];
  const requested = await ensureImportOrder(token, company, supplier.id, `${MARKER}-${company.code}-PED-ABIERTO`, products, 'REQUESTED', 0, 7, 1.25);
  const partial = await ensureImportOrder(token, company, supplier.id, `${MARKER}-${company.code}-PED-PARCIAL`, products, 'REQUESTED', 3, 6, 1);
  await ensureImportOrder(token, company, supplier2.id, `${MARKER}-${company.code}-PED-BORRADOR`, products, 'DRAFT', 8, 4, 0.8);
  results.push(`pedidos ${requested.status}/${partial.status}`);

  results.push(await ensureInbound(token, company, `${MARKER}-${company.code}-REC-PARCIAL`, {
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    locationId: receiving.id,
    importOrderId: partial.id,
    status: 'PENDING',
    purchaseOrder: `${MARKER}-${company.code}-REC-PARCIAL`,
    carrierName: 'Transporte Carvatel Express',
    guideNumber: `GUIA-${company.code}-071`,
    notes: 'Recepcion parcial de pedido de importacion para demo',
    items: inboundItems(company, products, storage, `${company.code}-PARCIAL`, 3, 3, 0.45),
  }, true));

  results.push(await ensureInbound(token, company, `${MARKER}-${company.code}-REC-LOCAL-1`, {
    supplierId: supplier2.id,
    warehouseId: warehouse.id,
    locationId: receiving.id,
    status: 'PENDING',
    purchaseOrder: `${MARKER}-${company.code}-REC-LOCAL-1`,
    carrierName: 'Transporte interno',
    guideNumber: `GUIA-${company.code}-101`,
    notes: 'Compra local urgente para reponer productos de alta rotacion',
    items: inboundItems(company, products, storage, `${company.code}-LOCAL1`, 0, 5, 1),
  }, true));

  results.push(await ensureInbound(token, company, `${MARKER}-${company.code}-REC-LOCAL-2`, {
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    locationId: receiving.id,
    status: 'PENDING',
    purchaseOrder: `${MARKER}-${company.code}-REC-LOCAL-2`,
    carrierName: 'Servientrega',
    guideNumber: `GUIA-${company.code}-102`,
    notes: 'Ingreso operativo adicional para enriquecer kardex',
    items: inboundItems(company, products, storage, `${company.code}-LOCAL2`, 5, 5, 0.8),
  }, true));

  for (let wave = 1; wave <= 4; wave += 1) {
    await ensureImportOrder(token, company, wave % 2 ? supplier.id : supplier2.id, `${MARKER}-${company.code}-PED-WAVE-${wave}`, products, wave === 4 ? 'DRAFT' : 'REQUESTED', wave, 5, 0.75 + wave * 0.12);
    results.push(await ensureInbound(token, company, `${MARKER}-${company.code}-REC-WAVE-${wave}`, {
      supplierId: wave % 2 ? supplier.id : supplier2.id,
      warehouseId: warehouse.id,
      locationId: receiving.id,
      status: 'PENDING',
      purchaseOrder: `${MARKER}-${company.code}-REC-WAVE-${wave}`,
      carrierName: wave % 2 ? 'Transporte pesado Carvatel' : 'Carga consolidada',
      guideNumber: `GUIA-${company.code}-2${String(wave).padStart(2, '0')}`,
      notes: `Recepcion de simulacion ${wave} para historial operativo`,
      items: inboundItems(company, products, storage, `${company.code}-WAVE${wave}`, wave, 4, 0.55 + wave * 0.15),
    }, wave !== 4));
  }

  results.push(await ensureInbound(token, company, `${MARKER}-${company.code}-REC-PENDIENTE`, {
    supplierId: supplier2.id,
    warehouseId: warehouse.id,
    locationId: receiving.id,
    status: 'PENDING',
    purchaseOrder: `${MARKER}-${company.code}-REC-PENDIENTE`,
    carrierName: 'Pendiente de conteo',
    guideNumber: `GUIA-${company.code}-199`,
    notes: 'Recepcion pendiente para mostrar ordenes sin cierre',
    items: inboundItems(company, products, storage, `${company.code}-PEND`, 10, 3, 0.5),
  }, false));

  let inventory = await api<Inventory>(`/inventory?status=AVAILABLE&warehouseId=${encodeURIComponent(warehouse.id)}`, token, company.id);
  const shippedItems = buildOutboundItems(company, inventory.units, products, warehouse.id, 'ENV', 0, 4, 1);
  if (shippedItems.length) {
    results.push(await ensureOutbound(token, company, `${MARKER}-${company.code}-OUT-ENVIADO`, {
      clientId: client.id,
      warehouseId: warehouse.id,
      locationId: dispatch.id,
      purchaseOrder: `${MARKER}-${company.code}-OUT-ENVIADO`,
      status: 'DISPATCHED',
      notes: 'Entrega finalizada para cliente mayorista',
      items: shippedItems,
    }, 'SHIPPED'));
  }

  inventory = await api<Inventory>(`/inventory?status=AVAILABLE&warehouseId=${encodeURIComponent(warehouse.id)}`, token, company.id);
  const dispatchedItems = buildOutboundItems(company, inventory.units, products, warehouse.id, 'DES', 4, 4, 0.8);
  if (dispatchedItems.length) {
    results.push(await ensureOutbound(token, company, `${MARKER}-${company.code}-OUT-DESPACHADO`, {
      clientId: client2.id,
      warehouseId: warehouse.id,
      locationId: dispatch.id,
      purchaseOrder: `${MARKER}-${company.code}-OUT-DESPACHADO`,
      status: 'DISPATCHED',
      notes: 'Despacho preparado pendiente de envio final',
      items: dispatchedItems,
    }, 'DISPATCHED'));
  }

  inventory = await api<Inventory>(`/inventory?status=AVAILABLE&warehouseId=${encodeURIComponent(warehouse.id)}`, token, company.id);
  const reservedItems = buildOutboundItems(company, inventory.units, products, warehouse.id, 'RES', 8, 4, 0.7);
  if (reservedItems.length) {
    results.push(await ensureOutbound(token, company, `${MARKER}-${company.code}-OUT-RESERVADO`, {
      clientId: client.id,
      warehouseId: warehouse.id,
      locationId: dispatch.id,
      purchaseOrder: `${MARKER}-${company.code}-OUT-RESERVADO`,
      status: 'DRAFT',
      notes: 'Reserva comercial pendiente de cierre',
      items: reservedItems,
    }, 'RESERVED'));
  }

  for (let wave = 1; wave <= 5; wave += 1) {
    inventory = await api<Inventory>(`/inventory?status=AVAILABLE&warehouseId=${encodeURIComponent(warehouse.id)}`, token, company.id);
    const waveItems = buildOutboundItems(company, inventory.units, products, warehouse.id, `WAVE${wave}`, wave, 5, 0.35 + wave * 0.08);
    if (!waveItems.length) continue;
    const finalStatus = wave % 3 === 0 ? 'SHIPPED' : wave % 2 === 0 ? 'DISPATCHED' : 'RESERVED';
    results.push(await ensureOutbound(token, company, `${MARKER}-${company.code}-OUT-WAVE-${wave}`, {
      clientId: wave % 2 ? client.id : client2.id,
      warehouseId: warehouse.id,
      locationId: dispatch.id,
      purchaseOrder: `${MARKER}-${company.code}-OUT-WAVE-${wave}`,
      status: finalStatus === 'RESERVED' ? 'DRAFT' : 'DISPATCHED',
      notes: `Despacho demo ${wave} para simular carga diaria y picking multiorden`,
      items: waveItems,
    }, finalStatus));
  }

  const remainingCritical = products
    .slice(0, 5)
    .map((product) => `${product.sku}:${countAvailable(inventory.units, product.id, warehouse.id)}`)
    .join(', ');
  return `${company.code}: ${results.join(' | ')} | stock visible ${remainingCritical}`;
}

async function main() {
  const token = await login();
  const companies = (await api<Company[]>('/companies', token, 'company_ferremayor')).filter(isTargetCompany);
  if (!companies.length) throw new Error('No se encontraron empresas Carvatel para cargar operaciones');

  const firstCatalogs = await refreshCatalogs(token, companies);
  const baselineUpdated = await tuneStockMinimums(token, companies, firstCatalogs);
  const companyResults: string[] = [];
  for (const company of companies) {
    companyResults.push(await seedCompany(token, company));
  }
  const finalCatalogs = await refreshCatalogs(token, companies);
  const finalUpdated = await tuneStockMinimums(token, companies, finalCatalogs);

  console.log(`Empresas procesadas: ${companies.map((company) => company.code).join(', ')}`);
  console.log(`Minimos ajustados: ${baselineUpdated + finalUpdated}`);
  console.log(companyResults.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
