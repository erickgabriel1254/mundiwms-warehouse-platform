import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CATALOG_URL = 'https://ferremayor.ec/wp-json/wc/store/v1/products?per_page=100';

type StoreCategory = {
  name: string;
  slug: string;
  link?: string;
};

type StoreProduct = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  sku?: string;
  short_description?: string;
  categories?: StoreCategory[];
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
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ');
}

function stripHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim(),
  );
}

function normalizeLine(value: string) {
  return value
    .replace(/^>\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return value
    .toLocaleLowerCase('es')
    .replace(/(^|\s|\/|-)([a-záéíóúñ])/g, (match) => match.toLocaleUpperCase('es'));
}

function normalizeCategoryCode(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function extractRows(html: string) {
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  return rows
    .map((row) =>
      Array.from(row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
        .map((cell) => normalizeLine(stripHtml(cell[1])))
        .filter(Boolean),
    )
    .filter((cells) => cells.length);
}

function extractDescription(html: string, productName: string, categoryName: string) {
  const textBeforeTable = html.split(/<table/i)[0] ?? html;
  return stripHtml(textBeforeTable)
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !['Quick View', productName, categoryName].includes(line))
    .filter((line) => !line.includes('woocommerce') && !line.includes('product-title'))
    .slice(0, 12)
    .join(' | ');
}

function extractIncludes(description: string) {
  const lines = description.split('|').map(normalizeLine).filter(Boolean);
  const start = lines.findIndex((line) => /accesorios|accessories/i.test(line));
  if (start < 0) return ['Producto principal'];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/empaque|packing/i.test(line)) break;
    items.push(line);
  }
  return items.length ? items.slice(0, 8) : ['Producto principal'];
}

function mapStoreProduct(product: StoreProduct): CatalogProduct[] {
  if (/prueba/i.test(product.name) || /prueba/i.test(product.slug)) return [];
  const category = titleCase(product.categories?.[0]?.name ?? 'Ferreteria');
  const description = extractDescription(product.short_description ?? '', product.name, product.categories?.[0]?.name ?? '');
  const includes = extractIncludes(description);
  const rows = extractRows(product.short_description ?? '');
  const header = rows[0]?.map((cell) => cell.toLocaleUpperCase('es')) ?? [];
  const skuIndex = header.findIndex((cell) => /^SKU\.?$/.test(cell));
  const stockIndex = header.findIndex((cell) => /STOCK/.test(cell));
  const variantHeaders = header
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => !/^SKU\.?$/.test(cell) && !/STOCK/.test(cell) && !/CANT|QTY/.test(cell));

  if (skuIndex < 0 || rows.length < 2) {
    const sku = product.sku?.trim();
    if (!sku) return [];
    return [
      {
        sku,
        barcode: null,
        barcodes: [],
        name: product.name,
        category,
        brand: 'Ferremayor',
        description,
        includes,
        sourceUrl: product.permalink,
      },
    ];
  }

  return rows.slice(1).flatMap((row) => {
    const sku = row[skuIndex]?.trim();
    if (!sku) return [];
    const stockNo = stockIndex >= 0 ? row[stockIndex]?.trim() : '';
    const variant = variantHeaders
      .map(({ cell, index }) => {
        const value = row[index]?.trim();
        return value ? `${cell}: ${value}` : '';
      })
      .filter(Boolean)
      .join(' / ');
    return [
      {
        sku,
        barcode: stockNo || null,
        barcodes: stockNo ? [stockNo] : [],
        name: variant ? `${product.name} ${variant}` : product.name,
        category,
        brand: 'Ferremayor',
        description,
        includes,
        sourceUrl: product.permalink,
      },
    ];
  });
}

async function cleanupOldCompanies() {
  if (process.env.DELETE_LEGACY_COMPANIES !== 'true') return 0;
  const oldCompanies = await prisma.company.findMany({
    where: { OR: [{ id: 'company_mundimaquinas' }, { id: 'company_sirumaz' }, { code: { in: ['MUNDIMAQUINAS', 'SIRUMAZ'] } }] },
    select: { id: true },
  });
  const companyIds = oldCompanies.map((company) => company.id);
  if (!companyIds.length) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.inventoryAdjustment.deleteMany({
      where: {
        OR: [
          { inventoryUnit: { warehouse: { companyId: { in: companyIds } } } },
          { fromLocation: { warehouse: { companyId: { in: companyIds } } } },
          { toLocation: { warehouse: { companyId: { in: companyIds } } } },
        ],
      },
    });
    await tx.kardexMovement.deleteMany({ where: { warehouse: { companyId: { in: companyIds } } } });
    await tx.outboundOrderItem.deleteMany({ where: { order: { companyId: { in: companyIds } } } });
    await tx.outboundOrder.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.importOrderItem.deleteMany({ where: { order: { companyId: { in: companyIds } } } });
    await tx.importOrder.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.inboundOrderItem.deleteMany({ where: { order: { companyId: { in: companyIds } } } });
    await tx.inboundOrder.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.inventoryBalance.deleteMany({ where: { warehouse: { companyId: { in: companyIds } } } });
    await tx.inventoryUnit.deleteMany({ where: { warehouse: { companyId: { in: companyIds } } } });
    await tx.productLocationDefault.deleteMany({ where: { warehouse: { companyId: { in: companyIds } } } });
    await tx.client.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.supplier.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.location.deleteMany({ where: { warehouse: { companyId: { in: companyIds } } } });
    await tx.warehouse.deleteMany({ where: { companyId: { in: companyIds } } });
    await tx.company.deleteMany({ where: { id: { in: companyIds } } });
  });
  return companyIds.length;
}

async function cleanupPlaceholderProducts() {
  if (process.env.DELETE_PLACEHOLDER_PRODUCTS !== 'true') return 0;
  const products = await prisma.product.findMany({
    where: { OR: [{ sku: { startsWith: 'FER-' } }, { sku: { startsWith: 'FM-' } }] },
    include: { _count: { select: { inventoryUnits: true, inboundItems: true, outboundItems: true, kardexMovements: true, adjustments: true } } },
  });

  let deleted = 0;
  for (const product of products) {
    const hasHistory = Object.values(product._count).some((count) => count > 0);
    if (!hasHistory) {
      await prisma.product.delete({ where: { id: product.id } });
      deleted += 1;
    } else {
      await prisma.product.update({ where: { id: product.id }, data: { status: 'INACTIVE' } });
    }
  }
  return deleted;
}

async function upsertCompanies() {
  const ferremayor = await prisma.company.upsert({
    where: { id: 'company_ferremayor' },
    update: { code: 'FERREMAYOR', name: 'Corporacion Lopez Villagomez - Ferremayor', theme: 'orange', primaryColor: '#f97316' },
    create: { id: 'company_ferremayor', code: 'FERREMAYOR', name: 'Corporacion Lopez Villagomez - Ferremayor', theme: 'orange', primaryColor: '#f97316' },
  });
  const ferrilopez = await prisma.company.upsert({
    where: { id: 'company_ferrilopez' },
    update: { code: 'FERRILOPEZ', name: 'FerriLopez', theme: 'blue', primaryColor: '#2563eb' },
    create: { id: 'company_ferrilopez', code: 'FERRILOPEZ', name: 'FerriLopez', theme: 'blue', primaryColor: '#2563eb' },
  });

  for (const [company, code, name] of [
    [ferremayor, 'SD-CEDIS', 'Centro de Distribucion Santo Domingo'],
    [ferrilopez, 'SD-TIENDA', 'Tienda Santo Domingo'],
  ] as const) {
    const warehouse = await prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name },
      create: { companyId: company.id, code, name },
    });
    for (const [locationCode, locationName] of [
      ['REC', 'Recepcion'],
      ['ALM', 'Almacenamiento'],
      ['DES', 'Despacho'],
      ['BLQ', 'Bloqueados'],
    ] as const) {
      await prisma.location.upsert({
        where: { warehouseId_code: { warehouseId: warehouse.id, code: locationCode } },
        update: { name: locationName },
        create: { warehouseId: warehouse.id, code: locationCode, name: locationName },
      });
    }
  }
}

async function main() {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`No se pudo leer Ferremayor: ${response.status}`);
  const rawProducts = (await response.json()) as StoreProduct[];
  const products = rawProducts.flatMap(mapStoreProduct);
  const categories = Array.from(new Set(products.map((product) => product.category))).sort();

  const oldCompanies = await cleanupOldCompanies();
  const placeholders = await cleanupPlaceholderProducts();
  await upsertCompanies();

  for (const category of categories) {
    await prisma.productCategory.upsert({
      where: { name: category },
      update: { code: normalizeCategoryCode(category), status: 'ACTIVE' },
      create: { code: normalizeCategoryCode(category), name: category, status: 'ACTIVE' },
    });
  }

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        barcode: product.barcode,
        barcodes: product.barcodes,
        name: product.name,
        category: product.category,
        brand: product.brand,
        description: product.description,
        includes: product.includes,
        sourceUrl: product.sourceUrl,
        unit: 'Unidad',
        status: 'ACTIVE',
      },
      create: {
        ...product,
        unit: 'Unidad',
        purchasePrice: 0,
        salePrice: 0,
        stockMin: 1,
        managesSerial: false,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`Importacion Ferremayor lista: ${products.length} SKU, ${categories.length} categorias.`);
  console.log(`Empresas antiguas eliminadas: ${oldCompanies}. Productos placeholder eliminados: ${placeholders}.`);
  if (!oldCompanies) console.log('Empresas legacy no se eliminaron fisicamente; la app las oculta por codigo.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
