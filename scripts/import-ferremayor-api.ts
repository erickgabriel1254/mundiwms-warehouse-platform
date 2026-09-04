const API_BASE = process.env.WMS_API_URL ?? 'https://mundiwms-demo.vercel.app';
const EMAIL = process.env.WMS_ADMIN_EMAIL ?? 'admin@demo';
const PASSWORD = process.env.WMS_ADMIN_PASSWORD ?? 'Admin123!';
const COMPANY_ID = process.env.WMS_COMPANY_ID ?? 'company_ferremayor';
const CATALOG_URL = 'https://ferremayor.ec/wp-json/wc/store/v1/products?per_page=100';

type StoreProduct = {
  name: string;
  slug: string;
  permalink: string;
  sku?: string;
  short_description?: string;
  categories?: { name: string }[];
};

type CatalogProduct = {
  sku: string;
  barcode: string | null;
  barcodes: string[];
  name: string;
  category: string;
  brand: string;
  description: string;
  includes: string[];
  sourceUrl: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  stockMin: number;
  managesSerial: boolean;
  status: 'ACTIVE';
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

function stripHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim(),
  );
}

function normalizeLine(value: string) {
  return value.replace(/^>\s*/, '').replace(/\s+/g, ' ').trim();
}

function titleCase(value: string) {
  return value.toLocaleLowerCase('es').replace(/(^|\s|\/|-)([a-záéíóúñ])/g, (match) => match.toLocaleUpperCase('es'));
}

function code(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function rows(html: string) {
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((row) =>
      Array.from(row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
        .map((cell) => normalizeLine(stripHtml(cell[1])))
        .filter(Boolean),
    )
    .filter((cells) => cells.length);
}

function description(html: string, productName: string, categoryName: string) {
  return stripHtml(html.split(/<table/i)[0] ?? html)
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !['Quick View', productName, categoryName].includes(line))
    .slice(0, 12)
    .join(' | ');
}

function includes(value: string) {
  const parts = value.split('|').map(normalizeLine).filter(Boolean);
  const start = parts.findIndex((part) => /accesorios|accessories/i.test(part));
  if (start < 0) return ['Producto principal'];
  const items: string[] = [];
  for (const part of parts.slice(start + 1)) {
    if (/empaque|packing/i.test(part)) break;
    items.push(part);
  }
  return items.length ? items.slice(0, 8) : ['Producto principal'];
}

function mapProduct(product: StoreProduct): CatalogProduct[] {
  if (/prueba/i.test(product.name) || /prueba/i.test(product.slug)) return [];
  const category = titleCase(product.categories?.[0]?.name ?? 'Ferreteria');
  const desc = description(product.short_description ?? '', product.name, product.categories?.[0]?.name ?? '');
  const tableRows = rows(product.short_description ?? '');
  const header = tableRows[0]?.map((cell) => cell.toLocaleUpperCase('es')) ?? [];
  const skuIndex = header.findIndex((cell) => /^SKU\.?$/.test(cell));
  const stockIndex = header.findIndex((cell) => /STOCK/.test(cell));
  const variantHeaders = header.map((cell, index) => ({ cell, index })).filter(({ cell }) => !/^SKU\.?$/.test(cell) && !/STOCK/.test(cell) && !/CANT|QTY/.test(cell));
  const base = {
    category,
    brand: 'Ferremayor',
    description: desc,
    includes: includes(desc),
    sourceUrl: product.permalink,
    unit: 'Unidad',
    purchasePrice: 0,
    salePrice: 0,
    stockMin: 1,
    managesSerial: false,
    status: 'ACTIVE' as const,
  };
  if (skuIndex < 0 || tableRows.length < 2) {
    return product.sku ? [{ ...base, sku: product.sku, barcode: null, barcodes: [], name: product.name }] : [];
  }
  return tableRows.slice(1).flatMap((row) => {
    const sku = row[skuIndex]?.trim();
    if (!sku) return [];
    const stockNo = stockIndex >= 0 ? row[stockIndex]?.trim() : '';
    const variant = variantHeaders.map(({ cell, index }) => (row[index] ? `${cell}: ${row[index]}` : '')).filter(Boolean).join(' / ');
    return [{ ...base, sku, barcode: stockNo || null, barcodes: stockNo ? [stockNo] : [], name: variant ? `${product.name} ${variant}` : product.name }];
  });
}

async function api<T>(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Company-Id': COMPANY_ID,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data as T;
}

async function main() {
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = (await login.json()) as { token?: string; error?: string };
  if (!login.ok || !session.token) throw new Error(session.error ?? 'No se pudo iniciar sesion');

  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`No se pudo leer Ferremayor: ${response.status}`);
  const products = ((await response.json()) as StoreProduct[]).flatMap(mapProduct);
  const categories = Array.from(new Set(products.map((product) => product.category)));
  const catalogs = await api<{ categories: { id: string; name: string }[]; products: { id: string; sku: string }[] }>('/catalogs', session.token);

  const categoryNames = new Set(catalogs.categories.map((category) => category.name));
  for (const category of categories) {
    if (!categoryNames.has(category)) {
      await api('/categories', session.token, { method: 'POST', body: JSON.stringify({ code: code(category), name: category, status: 'ACTIVE' }) });
    }
  }

  const productBySku = new Map(catalogs.products.map((product) => [product.sku, product.id]));
  for (const product of products) {
    const id = productBySku.get(product.sku);
    await api(id ? `/products/${id}` : '/products', session.token, { method: id ? 'PUT' : 'POST', body: JSON.stringify(product) });
  }

  console.log(`Catalogo Ferremayor enviado por API: ${products.length} SKU, ${categories.length} categorias.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
