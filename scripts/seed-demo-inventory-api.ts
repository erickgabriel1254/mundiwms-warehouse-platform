const API_BASE = process.env.WMS_API_URL ?? 'https://mundiwms-demo.vercel.app';
const EMAIL = process.env.WMS_ADMIN_EMAIL ?? 'admin@demo';
const PASSWORD = process.env.WMS_ADMIN_PASSWORD ?? 'Admin123!';

type Company = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Location = { id: string; code: string; name: string; warehouseId: string; aisle?: string; rack?: string; level?: string; position?: string };
type Supplier = { id: string; name: string; taxId: string };
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
  locationDefaults?: { warehouseId: string; locationId: string }[];
};
type Catalogs = { products: Product[]; suppliers: Supplier[]; warehouses: Warehouse[]; locations: Location[] };
type InboundOrder = { id: string; orderNo: string; purchaseOrder?: string | null; status: string };

type ProductDemoData = {
  brand: string;
  purchasePrice: number;
  salePrice: number;
  stockMin: number;
  qtyFerremayor: number;
  qtyFerriLopez: number;
};

const productDemoData: Record<string, ProductDemoData> = {
  'A.2041': { brand: 'Total', purchasePrice: 42.5, salePrice: 59.9, stockMin: 4, qtyFerremayor: 14, qtyFerriLopez: 6 },
  'A.2042': { brand: 'Ingco', purchasePrice: 86.0, salePrice: 119.9, stockMin: 3, qtyFerremayor: 8, qtyFerriLopez: 4 },
  'B.1853': { brand: 'Pedrollo', purchasePrice: 38.75, salePrice: 54.9, stockMin: 5, qtyFerremayor: 12, qtyFerriLopez: 5 },
  'E.1217': { brand: 'Truper', purchasePrice: 31.4, salePrice: 44.9, stockMin: 4, qtyFerremayor: 10, qtyFerriLopez: 4 },
  'E.1218': { brand: 'Total', purchasePrice: 49.2, salePrice: 68.9, stockMin: 4, qtyFerremayor: 9, qtyFerriLopez: 4 },
  'FER-LIJ-MANO-001': { brand: '3M', purchasePrice: 0.42, salePrice: 0.75, stockMin: 40, qtyFerremayor: 220, qtyFerriLopez: 90 },
  'FER-PIN-ESMALTE-001': { brand: 'Condor', purchasePrice: 8.2, salePrice: 12.5, stockMin: 10, qtyFerremayor: 35, qtyFerriLopez: 18 },
  'FER-PIN-LATEX-001': { brand: 'Pintulac', purchasePrice: 11.8, salePrice: 17.9, stockMin: 10, qtyFerremayor: 28, qtyFerriLopez: 14 },
  'FER-QUI-THINNER-001': { brand: 'Adheplast', purchasePrice: 2.35, salePrice: 4.0, stockMin: 24, qtyFerremayor: 80, qtyFerriLopez: 36 },
  'FM-ELE-CAB-001': { brand: 'Electrocables', purchasePrice: 0.68, salePrice: 1.1, stockMin: 80, qtyFerremayor: 360, qtyFerriLopez: 140 },
  'FM-HER-DES-001': { brand: 'Stanley', purchasePrice: 2.95, salePrice: 5.25, stockMin: 20, qtyFerremayor: 70, qtyFerriLopez: 30 },
  'FM-HER-MAR-001': { brand: 'Truper', purchasePrice: 5.6, salePrice: 9.9, stockMin: 15, qtyFerremayor: 45, qtyFerriLopez: 20 },
  'FM-HER-SIE-001': { brand: 'Bahco', purchasePrice: 4.25, salePrice: 7.5, stockMin: 12, qtyFerremayor: 36, qtyFerriLopez: 16 },
  'FM-JAR-MAN-001': { brand: 'Bellota', purchasePrice: 6.8, salePrice: 11.9, stockMin: 10, qtyFerremayor: 30, qtyFerriLopez: 14 },
  'FM-SEG-CER-001': { brand: 'Yale', purchasePrice: 9.75, salePrice: 15.9, stockMin: 12, qtyFerremayor: 32, qtyFerriLopez: 14 },
  'FM-SEG-EXT-001': { brand: 'Amerex', purchasePrice: 18.5, salePrice: 29.9, stockMin: 6, qtyFerremayor: 18, qtyFerriLopez: 8 },
  'H.1043': { brand: 'Karcher', purchasePrice: 74.0, salePrice: 104.9, stockMin: 3, qtyFerremayor: 7, qtyFerriLopez: 3 },
  'H.1044': { brand: 'Karcher', purchasePrice: 106.5, salePrice: 149.9, stockMin: 2, qtyFerremayor: 5, qtyFerriLopez: 2 },
  'L.1364': { brand: 'Bosch', purchasePrice: 39.8, salePrice: 56.9, stockMin: 4, qtyFerremayor: 9, qtyFerriLopez: 4 },
  'L.1365': { brand: 'Black+Decker', purchasePrice: 28.9, salePrice: 42.5, stockMin: 4, qtyFerremayor: 10, qtyFerriLopez: 5 },
  'P.2433': { brand: 'Makita', purchasePrice: 35.5, salePrice: 52.9, stockMin: 4, qtyFerremayor: 11, qtyFerriLopez: 5 },
  'S.1227': { brand: 'DeWalt', purchasePrice: 72.6, salePrice: 105.0, stockMin: 3, qtyFerremayor: 7, qtyFerriLopez: 3 },
  'S.1228': { brand: 'Bosch', purchasePrice: 52.8, salePrice: 76.9, stockMin: 4, qtyFerremayor: 8, qtyFerriLopez: 4 },
  'T.1204': { brand: 'Makita', purchasePrice: 112.0, salePrice: 159.9, stockMin: 2, qtyFerremayor: 4, qtyFerriLopez: 2 },
  'T.1473': { brand: 'DeWalt', purchasePrice: 58.4, salePrice: 84.9, stockMin: 4, qtyFerremayor: 9, qtyFerriLopez: 4 },
};

function qtyForCompany(company: Company, data: ProductDemoData) {
  return ['FERRILOPEZ', 'CARVATEL-SUC', 'CARVATEL-TIENDA'].includes(company.code) ? data.qtyFerriLopez : data.qtyFerremayor;
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

function uniqueDefaults(catalogsByCompany: Catalogs[], sku: string) {
  const defaults = catalogsByCompany.flatMap((catalogs) => catalogs.products.find((product) => product.sku === sku)?.locationDefaults ?? []);
  return Array.from(new Map(defaults.map((item) => [`${item.warehouseId}:${item.locationId}`, item])).values());
}

async function updateProducts(token: string, companyId: string, catalogsByCompany: Catalogs[]) {
  const products = catalogsByCompany[0]?.products ?? [];
  let updated = 0;

  for (const product of products) {
    const demo = productDemoData[product.sku];
    if (!demo) continue;
    const payload = {
      sku: product.sku,
      barcode: product.barcode ?? '',
      barcodes: product.barcodes ?? [],
      name: product.name,
      category: product.category,
      brand: demo.brand,
      description: product.description ?? '',
      includes: product.includes ?? [],
      sourceUrl: product.sourceUrl ?? '',
      unit: product.unit,
      purchasePrice: demo.purchasePrice,
      salePrice: demo.salePrice,
      stockMin: demo.stockMin,
      managesSerial: product.managesSerial,
      status: product.status,
      locationDefaults: uniqueDefaults(catalogsByCompany, product.sku),
    };
    await api<Product>(`/products/${product.id}`, token, companyId, { method: 'PUT', body: JSON.stringify(payload) });
    updated += 1;
  }

  return updated;
}

async function ensureSupplier(token: string, company: Company, catalogs: Catalogs) {
  const isBranch = ['FERRILOPEZ', 'CARVATEL-SUC', 'CARVATEL-TIENDA'].includes(company.code);
  const taxId = isBranch ? '1799000002001' : '1799000001001';
  const existing = catalogs.suppliers.find((supplier) => supplier.taxId === taxId);
  if (existing) return existing;
  return api<Supplier>('/suppliers', token, company.id, {
    method: 'POST',
    body: JSON.stringify({
      name: isBranch ? 'Proveedor Demo Carvatel Sucursal' : 'Proveedor Demo Carvatel',
      taxId,
      contact: 'Compras Demo',
      phone: '0999999999',
      email: isBranch ? 'proveedor.sucursal@carvatel.demo' : 'proveedor@carvatel.demo',
      address: 'Santo Domingo, Ecuador',
      status: 'ACTIVE',
    }),
  });
}

async function createInitialInbound(token: string, company: Company) {
  const purchaseOrder = `OC-STOCK-INICIAL-${company.code}`;
  const existingOrders = await api<InboundOrder[]>('/inbound', token, company.id);
  const existingOrder = existingOrders.find((order) => order.purchaseOrder === purchaseOrder && order.status !== 'CANCELLED');
  if (existingOrder?.status === 'RECEIVED') return 'omitido';
  if (existingOrder && ['DRAFT', 'PENDING'].includes(existingOrder.status)) {
    await api(`/inbound/${existingOrder.id}/confirm`, token, company.id, { method: 'POST' });
    return `${existingOrder.orderNo} confirmado`;
  }

  const catalogs = await api<Catalogs>('/catalogs', token, company.id);
  const supplier = await ensureSupplier(token, company, catalogs);
  const refreshed = await api<Catalogs>('/catalogs', token, company.id);
  const warehouse = refreshed.warehouses[0];
  if (!warehouse) throw new Error(`No hay bodega para ${company.name}`);
  const receivingLocation = refreshed.locations.find((location) => location.warehouseId === warehouse.id && location.code === 'REC') ?? refreshed.locations.find((location) => location.warehouseId === warehouse.id);
  if (!receivingLocation) throw new Error(`No hay ubicaciones para ${company.name}`);
  const storageLocations = refreshed.locations
    .filter((location) => location.warehouseId === warehouse.id && location.aisle && location.rack && location.level && location.position)
    .sort((a, b) => a.code.localeCompare(b.code));
  const fallbackLocation = refreshed.locations.find((location) => location.warehouseId === warehouse.id && location.code === 'ALM') ?? receivingLocation;
  const products = refreshed.products.filter((product) => product.status === 'ACTIVE' && productDemoData[product.sku]);

  const items = products.map((product, index) => {
    const demo = productDemoData[product.sku];
    const quantity = qtyForCompany(company, demo);
    const location = storageLocations[index % Math.max(storageLocations.length, 1)] ?? fallbackLocation;
    return {
      productId: product.id,
      quantity,
      locationId: location.id,
      serialNumbers: product.managesSerial
        ? Array.from({ length: quantity }, (_, itemIndex) => `${company.code}-${product.sku.replace(/[^a-zA-Z0-9]/g, '')}-${String(itemIndex + 1).padStart(4, '0')}`)
        : [],
    };
  });

  const order = await api<InboundOrder>('/inbound', token, company.id, {
    method: 'POST',
    body: JSON.stringify({
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      locationId: receivingLocation.id,
      status: 'PENDING',
      purchaseOrder,
      carrierName: 'Transporte Demo Carvatel',
      guideNumber: `GUIA-${company.code}-001`,
      notes: 'Stock inicial de demostracion para pruebas comerciales',
      items,
    }),
  });
  await api(`/inbound/${order.id}/confirm`, token, company.id, { method: 'POST' });
  return `${order.orderNo} confirmado`;
}

async function main() {
  const token = await login();
  const companies = await api<Company[]>('/companies', token, 'company_ferremayor');
  const targetCompanies = companies.filter((company) => ['FERREMAYOR', 'FERRILOPEZ', 'CARVATEL', 'CARVATEL-SUC', 'CARVATEL-MATRIZ', 'CARVATEL-TIENDA'].includes(company.code));
  const catalogsByCompany = await Promise.all(targetCompanies.map((company) => api<Catalogs>('/catalogs', token, company.id)));
  const productUpdates = await updateProducts(token, targetCompanies[0]?.id ?? 'company_ferremayor', catalogsByCompany);

  const inboundResults: string[] = [];
  for (const company of targetCompanies) {
    inboundResults.push(`${company.code}: ${await createInitialInbound(token, company)}`);
  }

  console.log(`Productos actualizados: ${productUpdates}`);
  console.log(`Ingresos: ${inboundResults.join(' | ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
