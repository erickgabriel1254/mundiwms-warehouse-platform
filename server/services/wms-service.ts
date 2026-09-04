import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createToken, hashPassword, verifyPassword } from '../auth.js';
import { prisma } from '../prisma.js';

const TX_OPTIONS = { maxWait: 20000, timeout: 120000 };

const productSchema = z.object({
  sku: z.string().min(2).max(40),
  barcode: z.string().optional(),
  barcodes: z.array(z.string().trim()).default([]),
  name: z.string().min(3),
  category: z.string().min(2),
  brand: z.string().min(2),
  description: z.string().trim().default(''),
  includes: z.array(z.string().trim()).default([]),
  sourceUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
  unit: z.string().min(1).default('Unidad'),
  purchasePrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  stockMin: z.coerce.number().int().min(0).default(1),
  managesSerial: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  locationDefaults: z
    .array(
      z.object({
        warehouseId: z.string().min(1),
        locationId: z.string().min(1),
      }),
    )
    .default([]),
});

const productCategorySchema = z.object({
  code: z.string().trim().max(24).optional(),
  name: z.string().trim().min(2).max(80),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const contactSchema = z.object({
  name: z.string().min(3),
  taxId: z.string().min(5),
  contact: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email(),
  address: z.string().min(5),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const locationSchema = z.object({
  warehouseId: z.string().min(1),
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(80),
  zone: z.string().trim().max(24).optional().default(''),
  aisle: z.string().trim().max(24).optional().default(''),
  rack: z.string().trim().max(24).optional().default(''),
  level: z.string().trim().max(24).optional().default(''),
  position: z.string().trim().max(24).optional().default(''),
  mapX: z.coerce.number().int().min(0).default(0),
  mapY: z.coerce.number().int().min(0).default(0),
  mapW: z.coerce.number().int().min(1).max(6).default(1),
  mapH: z.coerce.number().int().min(1).max(6).default(1),
  pickSequence: z.coerce.number().int().min(0).default(0),
  kind: z.enum(['STORAGE', 'RECEIVING', 'DISPATCH', 'BLOCKED']).default('STORAGE'),
});

const warehouseSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(80),
});

const roleSchema = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(3).max(80),
  permissions: z.array(z.string().trim().min(1)).default([]),
});

const userSchema = z.object({
  name: z.string().trim().min(3),
  email: z.string().trim().email(),
  password: z.string().min(6).optional().or(z.literal('')),
  roleId: z.string().min(1),
  isActive: z.boolean().default(true),
});

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  locationId: z.string().optional(),
  unitCost: z.coerce.number().min(0).optional(),
  lotNumber: z.string().trim().optional(),
  expirationDate: z.string().trim().optional(),
  serialNumbers: z.array(z.string().trim().min(1)).default([]),
});

const inboundSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  locationId: z.string().min(1),
  status: z.enum(['DRAFT', 'PENDING']).default('DRAFT'),
  notes: z.string().optional(),
  purchaseOrder: z.string().optional(),
  importOrderId: z.string().optional(),
  carrierName: z.string().optional(),
  guideNumber: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
});

const importOrderSchema = z.object({
  supplierId: z.string().min(1),
  purchaseOrder: z.string().optional(),
  status: z.enum(['DRAFT', 'REQUESTED', 'RECEIVED', 'CANCELLED']).default('DRAFT'),
  notes: z.string().optional(),
  items: z.array(orderItemSchema.omit({ locationId: true, serialNumbers: true })).min(1),
});

const outboundSchema = z.object({
  clientId: z.string().min(1),
  warehouseId: z.string().min(1),
  locationId: z.string().min(1),
  purchaseOrder: z.string().optional(),
  status: z.enum(['DRAFT', 'DISPATCHED']).default('DRAFT'),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
});

const pickingCompleteSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  action: z.enum(['dispatch', 'ship']).default('dispatch'),
});

const adjustmentSchema = z.object({
  type: z.enum(['POSITIVE', 'NEGATIVE', 'BLOCK', 'UNBLOCK', 'RELOCATE']),
  productId: z.string().min(1),
  inventoryUnitId: z.string().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  warehouseId: z.string().optional(),
  locationId: z.string().optional(),
  toLocationId: z.string().optional(),
  serialNumbers: z.array(z.string().trim().min(1)).default([]),
  reason: z.string().min(5),
});

type Db = PrismaClient | Prisma.TransactionClient;

const DEFAULT_COMPANY_ID = 'company_ferremayor';
const LEGACY_COMPANY_CODES = ['MUNDIMAQUINAS', 'SIRUMAZ'];

export async function resolveCompanyId(rawCompanyId?: string | string[]) {
  const requested = Array.isArray(rawCompanyId) ? rawCompanyId[0] : rawCompanyId;
  if (requested) {
    const company = await prisma.company.findUnique({ where: { id: requested } });
    if (company && !LEGACY_COMPANY_CODES.includes(company.code)) return company.id;
  }
  const fallback = await prisma.company.findFirst({ where: { code: { notIn: LEGACY_COMPANY_CODES } }, orderBy: { name: 'asc' } });
  return fallback?.id ?? DEFAULT_COMPANY_ID;
}

export async function listCompanies() {
  return prisma.company.findMany({ where: { code: { notIn: LEGACY_COMPANY_CODES } }, orderBy: { name: 'asc' } });
}

function cleanSerials(serials: string[]) {
  return serials.map((serial) => serial.trim().toUpperCase()).filter(Boolean);
}

function cleanLot(value?: string | null) {
  return value?.trim().toUpperCase() || null;
}

function parseOptionalDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha de vencimiento invalida');
  return date;
}

function ensureUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(message);
  }
}

type RouteLocation = {
  pickSequence?: number | null;
  mapX?: number | null;
  mapY?: number | null;
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  level?: string | null;
  position?: string | null;
  name?: string | null;
};

function compareLocationRoute(a: RouteLocation, b: RouteLocation) {
  const sequenceA = a.pickSequence || 0;
  const sequenceB = b.pickSequence || 0;
  if (sequenceA !== sequenceB) return sequenceA - sequenceB;
  const mapA = `${String(a.mapY ?? 0).padStart(4, '0')}|${String(a.mapX ?? 0).padStart(4, '0')}`;
  const mapB = `${String(b.mapY ?? 0).padStart(4, '0')}|${String(b.mapX ?? 0).padStart(4, '0')}`;
  if (mapA !== mapB) return mapA.localeCompare(mapB, 'es', { numeric: true });
  return [a.zone, a.aisle, a.rack, a.level, a.position, a.name].join('|').localeCompare([b.zone, b.aisle, b.rack, b.level, b.position, b.name].join('|'), 'es', { numeric: true });
}

function compareFefoUnits<T extends { expirationDate?: Date | null; createdAt: Date; location?: RouteLocation | null }>(a: T, b: T) {
  const expiryA = a.expirationDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const expiryB = b.expirationDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (expiryA !== expiryB) return expiryA - expiryB;
  if (a.location && b.location) {
    const route = compareLocationRoute(a.location, b.location);
    if (route !== 0) return route;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

async function resolveProductLocation(db: Db, productId: string, warehouseId: string, fallbackLocationId?: string | null) {
  const productDefault = await db.productLocationDefault.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    include: { location: true },
  });
  if (productDefault) return productDefault.location;
  if (fallbackLocationId) {
    const fallback = await db.location.findUnique({ where: { id: fallbackLocationId } });
    if (fallback?.warehouseId === warehouseId) return fallback;
  }
  const product = await db.product.findUnique({ where: { id: productId }, select: { sku: true } });
  throw new Error(`Configure la ubicacion predeterminada del SKU ${product?.sku ?? productId} para esta bodega`);
}

async function rebuildBalances(db: Db) {
  const groups = await db.inventoryUnit.groupBy({
    by: ['productId', 'warehouseId', 'locationId', 'status'],
    _count: { _all: true },
  });
  await db.inventoryBalance.deleteMany();
  if (groups.length) {
    await db.inventoryBalance.createMany({
      data: groups.map((group) => ({
        productId: group.productId,
        warehouseId: group.warehouseId,
        locationId: group.locationId,
        status: group.status,
        quantity: group._count._all,
      })),
    });
  }
}

function nextOrderNo(prefix: 'IN' | 'OUT' | 'PED') {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

async function auditLog({
  companyId,
  userId,
  action,
  entity,
  entityId,
  summary,
  metadata,
}: {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: companyId ?? null,
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      summary,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });
}

function orderItemsSummary(items: Array<{ productId: string; quantity: number }>) {
  return {
    lines: items.length,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function normalizeCategoryCode(value: string) {
  const code = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return code || `CAT_${Date.now()}`;
}

export async function login(body: unknown) {
  const data = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(body);
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { role: true } });
  if (!user || !user.isActive || !verifyPassword(data.password, user.passwordHash)) {
    throw new Error('Credenciales invalidas');
  }
  return {
    token: createToken(user.id),
    user: { id: user.id, name: user.name, email: user.email, role: user.role.code, roleName: user.role.name },
  };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) throw new Error('Sesion no encontrada');
  return { id: user.id, name: user.name, email: user.email, role: user.role.code, roleName: user.role.name };
}

export async function getCatalogs(companyId: string) {
  const [companies, categories, products, suppliers, clients, warehouses, locations] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    listProductCategories(),
    prisma.product.findMany({
      orderBy: { sku: 'asc' },
      include: {
        inventoryBalances: { where: { warehouse: { companyId } }, include: { warehouse: true, location: true } },
        locationDefaults: { where: { warehouse: { companyId } }, include: { warehouse: true, location: true } },
      },
    }),
    prisma.supplier.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.client.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.warehouse.findMany({ where: { companyId }, orderBy: { name: 'asc' }, include: { company: true } }),
    prisma.location.findMany({
      where: { warehouse: { companyId } },
      orderBy: [{ warehouse: { name: 'asc' } }, { zone: 'asc' }, { aisle: 'asc' }, { rack: 'asc' }, { level: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      include: { warehouse: true, inventoryBalances: { include: { product: true } } },
    }),
  ]);
  return { companies, categories, products, suppliers, clients, warehouses, locations };
}

export async function getDashboard(companyId: string) {
  const [products, units, inboundPending, outboundPending, outboundDispatched, movements, movementProducts, categoryProducts] = await Promise.all([
    prisma.product.findMany({ include: { inventoryBalances: { where: { warehouse: { companyId } } } } }),
    prisma.inventoryUnit.findMany({ where: { warehouse: { companyId } } }),
    prisma.inboundOrder.count({ where: { companyId, status: { in: ['DRAFT', 'PENDING'] } } }),
    prisma.outboundOrder.count({ where: { companyId, status: { in: ['DRAFT', 'RESERVED'] } } }),
    prisma.outboundOrder.count({ where: { companyId, status: 'DISPATCHED' } }),
    prisma.kardexMovement.findMany({
      where: { warehouse: { companyId } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { product: true, inventoryUnit: true, warehouse: true, location: true, user: true },
    }),
    prisma.kardexMovement.findMany({
      where: { warehouse: { companyId } },
      take: 500,
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    }),
    prisma.product.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);

  const lowStockProducts = products.map((product) => {
    const available = product.inventoryBalances
      .filter((balance) => balance.status === 'AVAILABLE')
      .reduce((sum, balance) => sum + balance.quantity, 0);
    return { id: product.id, sku: product.sku, name: product.name, stockMin: product.stockMin, available };
  }).filter((product) => product.available <= product.stockMin);

  const topMovingProducts = Array.from(
    movementProducts.reduce((map, movement) => {
      const current = map.get(movement.productId) ?? {
        id: movement.productId,
        sku: movement.product.sku,
        name: movement.product.name,
        movements: 0,
        quantity: 0,
      };
      current.movements += 1;
      current.quantity += Math.abs(movement.quantity);
      map.set(movement.productId, current);
      return map;
    }, new Map<string, { id: string; sku: string; name: string; movements: number; quantity: number }>()),
  ).map(([, value]) => value).sort((a, b) => b.movements - a.movements).slice(0, 8);

  return {
    totals: {
      skus: products.length,
      units: units.length,
      serials: units.filter((unit) => unit.serialNumber).length,
      available: units.filter((unit) => unit.status === 'AVAILABLE').length,
      reserved: units.filter((unit) => unit.status === 'RESERVED').length,
      lowStock: lowStockProducts.length,
      inboundPending,
      outboundPending,
      outboundDispatched,
      pendingClosure: inboundPending + outboundPending + outboundDispatched,
    },
    recentMovements: movements,
    byCategory: categoryProducts.map((item) => ({ category: item.category, total: item._count._all })),
    lowStockProducts: lowStockProducts.sort((a, b) => a.available - b.available).slice(0, 8),
    topMovingProducts,
  };
}

export async function listProducts(search = '', companyId: string) {
  const normalized = search.trim();
  return prisma.product.findMany({
    where: normalized
      ? {
          OR: [
            { sku: { contains: normalized, mode: 'insensitive' } },
            { barcode: { contains: normalized, mode: 'insensitive' } },
            { barcodes: { has: normalized } },
            { name: { contains: normalized, mode: 'insensitive' } },
            { category: { contains: normalized, mode: 'insensitive' } },
            { brand: { contains: normalized, mode: 'insensitive' } },
            { description: { contains: normalized, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { sku: 'asc' },
    include: {
      inventoryBalances: { where: { warehouse: { companyId } }, include: { warehouse: true, location: true } },
      inventoryUnits: {
        where: { warehouse: { companyId }, serialNumber: { not: null }, status: { in: ['AVAILABLE', 'RESERVED'] } },
        include: { warehouse: true, location: true },
        orderBy: { serialNumber: 'asc' },
      },
      locationDefaults: { where: { warehouse: { companyId } }, include: { warehouse: true, location: true } },
      _count: { select: { inboundItems: true, outboundItems: true, kardexMovements: true } },
    },
  });
}

export async function listProductCategories() {
  const [categories, productCounts] = await Promise.all([
    prisma.productCategory.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
    prisma.product.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const counts = new Map(productCounts.map((item) => [item.category, item._count._all]));
  return categories.map((category) => ({ ...category, _count: { products: counts.get(category.name) ?? 0 } }));
}

export async function saveProductCategory(body: unknown, id?: string) {
  const data = productCategorySchema.parse(body);
  const payload = {
    code: normalizeCategoryCode(data.code || data.name),
    name: data.name.trim(),
    status: data.status,
  };

  if (!id) {
    return prisma.productCategory.create({ data: payload });
  }

  const current = await prisma.productCategory.findUnique({ where: { id } });
  if (!current) throw new Error('Categoria no encontrada');
  return prisma.$transaction(async (tx) => {
    const category = await tx.productCategory.update({ where: { id }, data: payload });
    if (current.name !== category.name) {
      await tx.product.updateMany({ where: { category: current.name }, data: { category: category.name } });
    }
    return category;
  });
}

export async function deleteProductCategory(id: string, roleCode: string) {
  if (!['ADMIN', 'SUPERVISOR'].includes(roleCode)) {
    throw new Error('No tiene permisos para eliminar categorias');
  }
  const category = await prisma.productCategory.findUnique({ where: { id } });
  if (!category) throw new Error('Categoria no encontrada');
  const products = await prisma.product.count({ where: { category: category.name } });
  if (products > 0) {
    await prisma.productCategory.update({ where: { id }, data: { status: 'INACTIVE' } });
    return { ok: true, mode: 'INACTIVATED' as const };
  }
  await prisma.productCategory.delete({ where: { id } });
  return { ok: true, mode: 'DELETED' as const };
}

export async function saveProduct(body: unknown, id?: string) {
  const data = productSchema.parse(body);
  const category = await prisma.productCategory.findUnique({ where: { name: data.category } });
  if (!category || category.status !== 'ACTIVE') {
    throw new Error('Seleccione una categoria activa');
  }
  const { locationDefaults, ...productData } = data;
  const payload = {
    ...productData,
    barcode: data.barcode?.trim() || null,
    barcodes: Array.from(new Set([data.barcode, ...data.barcodes].map((barcode) => barcode?.trim()).filter(Boolean) as string[])),
    includes: data.includes.filter(Boolean),
    sourceUrl: data.sourceUrl?.trim() || null,
    purchasePrice: new Prisma.Decimal(data.purchasePrice),
    salePrice: new Prisma.Decimal(data.salePrice),
  };
  const defaults = Array.from(new Map(locationDefaults.map((item) => [item.warehouseId, item])).values());
  for (const item of defaults) {
    const location = await prisma.location.findUnique({ where: { id: item.locationId } });
    if (!location || location.warehouseId !== item.warehouseId) throw new Error('La ubicacion predeterminada no corresponde a la bodega seleccionada');
  }

  if (!id) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: payload });
      if (defaults.length) {
        await tx.productLocationDefault.createMany({
          data: defaults.map((item) => ({ productId: product.id, warehouseId: item.warehouseId, locationId: item.locationId })),
        });
      }
      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { locationDefaults: { include: { warehouse: true, location: true } } },
      });
    });
  }

  const product = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { kardexMovements: true } } } });
  if (!product) throw new Error('Producto no encontrado');
  const nextProductData = data.status === 'INACTIVE' && product._count.kardexMovements > 0 ? { ...payload, status: 'INACTIVE' } : payload;
  return prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: nextProductData });
    await tx.productLocationDefault.deleteMany({ where: { productId: id } });
    if (defaults.length) {
      await tx.productLocationDefault.createMany({
        data: defaults.map((item) => ({ productId: id, warehouseId: item.warehouseId, locationId: item.locationId })),
      });
    }
    return tx.product.findUniqueOrThrow({
      where: { id },
      include: { locationDefaults: { include: { warehouse: true, location: true } } },
    });
  });
}

export async function deleteProduct(id: string, roleCode: string) {
  if (!['ADMIN', 'SUPERVISOR'].includes(roleCode)) {
    throw new Error('No tiene permisos para eliminar productos');
  }
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          inventoryUnits: true,
          inboundItems: true,
          outboundItems: true,
          kardexMovements: true,
          adjustments: true,
        },
      },
    },
  });
  if (!product) throw new Error('Producto no encontrado');
  const hasHistory =
    product._count.inventoryUnits +
      product._count.inboundItems +
      product._count.outboundItems +
      product._count.kardexMovements +
      product._count.adjustments >
    0;
  if (hasHistory) {
    await prisma.product.update({ where: { id }, data: { status: 'INACTIVE' } });
    return { ok: true, mode: 'INACTIVATED' };
  }
  await prisma.product.delete({ where: { id } });
  return { ok: true, mode: 'DELETED' };
}

export async function listInventory(query: URLSearchParams, companyId: string) {
  const search = query.get('search')?.trim() ?? '';
  const status = query.get('status')?.trim();
  const warehouseId = query.get('warehouseId')?.trim();
  const activeSeriesStatus = status || undefined;
  const searchFilter = search
    ? {
        OR: [
          { serialNumber: { contains: search, mode: 'insensitive' as const } },
          { product: { sku: { contains: search, mode: 'insensitive' as const } } },
          { product: { barcode: { contains: search, mode: 'insensitive' as const } } },
          { product: { barcodes: { has: search } } },
          { product: { name: { contains: search, mode: 'insensitive' as const } } },
          { product: { category: { contains: search, mode: 'insensitive' as const } } },
          { warehouse: { name: { contains: search, mode: 'insensitive' as const } } },
          { location: { name: { contains: search, mode: 'insensitive' as const } } },
          { location: { code: { contains: search, mode: 'insensitive' as const } } },
        ],
      }
    : {};
  const units = await prisma.inventoryUnit.findMany({
    where: {
      warehouse: { companyId },
      status: activeSeriesStatus ? activeSeriesStatus : { in: ['AVAILABLE', 'RESERVED'] },
      ...(warehouseId ? { warehouseId } : {}),
      ...searchFilter,
    },
    orderBy: { updatedAt: 'desc' },
    include: { product: true, warehouse: true, location: true },
  });

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      warehouse: { companyId },
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(search
        ? {
            OR: [
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              { product: { barcode: { contains: search, mode: 'insensitive' } } },
              { product: { barcodes: { has: search } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { category: { contains: search, mode: 'insensitive' } } },
              { warehouse: { name: { contains: search, mode: 'insensitive' } } },
              { location: { name: { contains: search, mode: 'insensitive' } } },
              { location: { code: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: { product: true, warehouse: true, location: true },
    orderBy: [{ product: { sku: 'asc' } }, { status: 'asc' }],
  });

  return { units, balances };
}

export async function unitMovements(unitId: string, companyId: string) {
  return prisma.kardexMovement.findMany({
    where: { inventoryUnitId: unitId, warehouse: { companyId } },
    orderBy: { createdAt: 'desc' },
    include: { product: true, warehouse: true, location: true, user: true, inventoryUnit: true },
  });
}

export async function listInbound(companyId: string) {
  return prisma.inboundOrder.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { supplier: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true, location: true } } },
  });
}

export async function listImportOrders(companyId: string) {
  return prisma.importOrder.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { supplier: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
  });
}

export async function saveImportOrder(body: unknown, userId: string, companyId: string, id?: string) {
  const data = importOrderSchema.parse(body);
  const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, companyId } });
  if (!supplier) throw new Error('Proveedor no corresponde a la empresa seleccionada');
  for (const item of data.items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || product.status !== 'ACTIVE') throw new Error('El pedido solo puede usar productos activos');
  }

  const payload = {
    companyId,
    supplierId: data.supplierId,
    purchaseOrder: data.purchaseOrder?.trim() || null,
    status: data.status,
    notes: data.notes,
  };
  const items = data.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

  if (id) {
    const order = await prisma.importOrder.findFirst({ where: { id, companyId } });
    if (!order || !['DRAFT', 'REQUESTED'].includes(order.status)) throw new Error('El pedido no puede editarse');
    const updated = await prisma.importOrder.update({
      where: { id },
      data: { ...payload, items: { deleteMany: {}, create: items } },
      include: { supplier: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
    });
    await auditLog({ companyId, userId, action: 'UPDATE', entity: 'ImportOrder', entityId: id, summary: `Pedido ${updated.orderNo} actualizado`, metadata: orderItemsSummary(items) });
    return updated;
  }

  const created = await prisma.importOrder.create({
    data: {
      orderNo: nextOrderNo('PED'),
      createdById: userId,
      ...payload,
      items: { create: items },
    },
    include: { supplier: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
  });
  await auditLog({ companyId, userId, action: 'CREATE', entity: 'ImportOrder', entityId: created.id, summary: `Pedido ${created.orderNo} generado`, metadata: orderItemsSummary(items) });
  return created;
}

export async function cancelImportOrder(id: string, companyId: string) {
  const order = await prisma.importOrder.findFirst({ where: { id, companyId } });
  if (!order || order.status === 'CANCELLED') throw new Error('El pedido no puede cancelarse');
  return prisma.importOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
}

export async function completeImportOrder(id: string, companyId: string) {
  const order = await prisma.importOrder.findFirst({ where: { id, companyId } });
  if (!order || order.status === 'CANCELLED') throw new Error('El pedido no puede marcarse como recibido');
  return prisma.importOrder.update({ where: { id }, data: { status: 'RECEIVED' } });
}

export async function saveInbound(body: unknown, userId: string, companyId: string, id?: string) {
  const data = inboundSchema.parse(body);
  const [supplier, warehouse, location, importOrder] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: data.supplierId, companyId } }),
    prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId } }),
    prisma.location.findFirst({ where: { id: data.locationId, warehouse: { companyId } } }),
    data.importOrderId ? prisma.importOrder.findFirst({ where: { id: data.importOrderId, companyId } }) : Promise.resolve(null),
  ]);
  if (!supplier) throw new Error('Proveedor no corresponde a la empresa seleccionada');
  if (!warehouse) throw new Error('Bodega no corresponde a la empresa seleccionada');
  if (!location) throw new Error('Ubicacion no corresponde a la empresa seleccionada');
  if (data.importOrderId && !importOrder) throw new Error('Pedido de importacion no corresponde a la empresa seleccionada');
  for (const item of data.items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new Error('Producto no encontrado');
    const serials = cleanSerials(item.serialNumbers);
    if (product.managesSerial && serials.length !== item.quantity) {
      throw new Error(`El SKU ${product.sku} requiere ${item.quantity} series`);
    }
    ensureUnique(serials, `Hay series repetidas en ${product.sku}`);
  }

  if (id) {
    const order = await prisma.inboundOrder.findFirst({ where: { id, companyId } });
    if (!order || !['DRAFT', 'PENDING'].includes(order.status)) throw new Error('La orden no puede editarse');
    const updated = await prisma.inboundOrder.update({
      where: { id },
      data: {
        companyId,
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        locationId: data.locationId,
        importOrderId: data.importOrderId || null,
        status: data.status,
        notes: data.notes,
        purchaseOrder: data.purchaseOrder?.trim() || null,
        carrierName: data.carrierName?.trim() || null,
        guideNumber: data.guideNumber?.trim() || null,
        items: {
          deleteMany: {},
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            locationId: item.locationId || null,
            unitCost: new Prisma.Decimal(item.unitCost ?? 0),
            lotNumber: cleanLot(item.lotNumber),
            expirationDate: parseOptionalDate(item.expirationDate),
            serialNumbers: cleanSerials(item.serialNumbers),
          })),
        },
      },
      include: { supplier: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true, location: true } } },
    });
    await auditLog({ companyId, userId, action: 'UPDATE', entity: 'InboundOrder', entityId: id, summary: `Recepcion ${updated.orderNo} actualizada`, metadata: orderItemsSummary(data.items) });
    return updated;
  }

  const created = await prisma.inboundOrder.create({
    data: {
      orderNo: nextOrderNo('IN'),
      companyId,
      supplierId: data.supplierId,
      warehouseId: data.warehouseId,
      locationId: data.locationId,
      importOrderId: data.importOrderId || null,
      status: data.status,
      notes: data.notes,
      purchaseOrder: data.purchaseOrder?.trim() || null,
      carrierName: data.carrierName?.trim() || null,
      guideNumber: data.guideNumber?.trim() || null,
      createdById: userId,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          locationId: item.locationId || null,
          unitCost: new Prisma.Decimal(item.unitCost ?? 0),
          lotNumber: cleanLot(item.lotNumber),
          expirationDate: parseOptionalDate(item.expirationDate),
          serialNumbers: cleanSerials(item.serialNumbers),
        })),
      },
    },
    include: { supplier: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true, location: true } } },
  });
  await auditLog({ companyId, userId, action: 'CREATE', entity: 'InboundOrder', entityId: created.id, summary: `Recepcion ${created.orderNo} creada`, metadata: orderItemsSummary(data.items) });
  return created;
}

export async function confirmInbound(id: string, userId: string, companyId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.inboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true, location: true } } } });
    if (!order || !['DRAFT', 'PENDING'].includes(order.status)) throw new Error('Recepcion no confirmable');

    for (const item of order.items) {
      if (item.unitCost.gt(0)) {
        await tx.product.update({ where: { id: item.productId }, data: { purchasePrice: item.unitCost } });
      }
      const serials = cleanSerials(item.serialNumbers);
      if (item.product.managesSerial) {
        if (serials.length !== item.quantity) throw new Error(`Faltan series para ${item.product.sku}`);
        ensureUnique(serials, `Hay series repetidas en ${item.product.sku}`);
        const existing = await tx.inventoryUnit.count({
          where: { productId: item.productId, serialNumber: { in: serials } },
        });
        if (existing) throw new Error(`Una o mas series de ${item.product.sku} ya existen`);
      }

      const targetLocation = await resolveProductLocation(tx, item.productId, order.warehouseId, item.locationId || order.locationId);

      if (item.product.managesSerial) {
        const createdUnits = [];
        for (let index = 0; index < serials.length; index += 1) {
          createdUnits.push(
            await tx.inventoryUnit.create({
              data: {
                productId: item.productId,
                serialNumber: serials[index],
                lotNumber: cleanLot(item.lotNumber),
                expirationDate: parseOptionalDate(item.expirationDate),
                warehouseId: targetLocation.warehouseId,
                locationId: targetLocation.id,
                status: 'AVAILABLE',
              },
            }),
          );
        }
        for (const unit of createdUnits) {
          await tx.kardexMovement.create({
            data: {
              type: 'INBOUND',
              productId: item.productId,
              inventoryUnitId: unit.id,
              quantity: 1,
              warehouseId: unit.warehouseId,
              locationId: unit.locationId,
              userId,
              documentType: 'INBOUND',
              documentNo: order.orderNo,
              observation: order.carrierName || order.guideNumber ? `Recepcion confirmada. Transportista: ${order.carrierName || '-'} Guia: ${order.guideNumber || '-'}` : 'Recepcion confirmada',
            },
          });
        }
      } else {
        await tx.inventoryUnit.createMany({
          data: Array.from({ length: item.quantity }, () => ({
            productId: item.productId,
            serialNumber: null,
            lotNumber: cleanLot(item.lotNumber),
            expirationDate: parseOptionalDate(item.expirationDate),
            warehouseId: targetLocation.warehouseId,
            locationId: targetLocation.id,
            status: 'AVAILABLE',
          })),
        });
        await tx.kardexMovement.create({
          data: {
            type: 'INBOUND',
            productId: item.productId,
            quantity: item.quantity,
            warehouseId: targetLocation.warehouseId,
            locationId: targetLocation.id,
            userId,
            documentType: 'INBOUND',
            documentNo: order.orderNo,
            observation: order.carrierName || order.guideNumber ? `Recepcion confirmada. Transportista: ${order.carrierName || '-'} Guia: ${order.guideNumber || '-'}` : 'Recepcion confirmada',
          },
        });
      }
    }
    if (order.importOrderId) {
      const importItems = await tx.importOrderItem.findMany({ where: { orderId: order.importOrderId } });
      for (const item of order.items) {
        const target = importItems.find((entry) => entry.productId === item.productId);
        if (!target) throw new Error(`El producto ${item.product.sku} no pertenece al pedido de importacion`);
        if (target.receivedQuantity + item.quantity > target.quantity) {
          throw new Error(`La recepcion supera el pendiente del SKU ${item.product.sku}`);
        }
        await tx.importOrderItem.update({
          where: { id: target.id },
          data: { receivedQuantity: { increment: item.quantity } },
        });
      }
      const updatedItems = await tx.importOrderItem.findMany({ where: { orderId: order.importOrderId } });
      const allReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantity);
      await tx.importOrder.update({
        where: { id: order.importOrderId },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIAL' },
      });
    }
    await tx.inboundOrder.update({ where: { id }, data: { status: 'RECEIVED', confirmedAt: new Date() } });
    await rebuildBalances(tx);
    return { ok: true };
  }, TX_OPTIONS);
  await auditLog({
    companyId,
    userId,
    action: 'CONFIRM',
    entity: 'InboundOrder',
    entityId: id,
    summary: 'Recepcion confirmada e ingresada al inventario',
  });
  return result;
}

export async function cancelInbound(id: string, companyId: string, userId?: string) {
  const order = await prisma.inboundOrder.findFirst({ where: { id, companyId } });
  if (!order || !['DRAFT', 'PENDING'].includes(order.status)) throw new Error('La orden no puede cancelarse');
  const result = await prisma.inboundOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  await auditLog({ companyId, userId, action: 'CANCEL', entity: 'InboundOrder', entityId: id, summary: `Recepcion ${result.orderNo} cancelada` });
  return result;
}

export async function listOutbound(companyId: string) {
  return prisma.outboundOrder.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { client: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
  });
}

async function releaseOutboundReservations(tx: Prisma.TransactionClient, order: { warehouseId: string; items: Array<{ productId: string; quantity: number; serialNumbers: string[]; product: { managesSerial: boolean } }> }) {
  for (const item of order.items) {
    if (item.product.managesSerial) {
      await tx.inventoryUnit.updateMany({
        where: {
          productId: item.productId,
          serialNumber: { in: item.serialNumbers },
          status: 'RESERVED',
          warehouseId: order.warehouseId,
        },
        data: { status: 'AVAILABLE' },
      });
    } else {
      const units = await tx.inventoryUnit.findMany({
        where: { productId: item.productId, status: 'RESERVED', warehouseId: order.warehouseId },
        take: item.quantity,
      });
      await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'AVAILABLE' } });
    }
  }
}

export async function saveOutbound(body: unknown, userId: string, companyId: string, id?: string) {
  const data = outboundSchema.parse(body);
  const [client, warehouse, location] = await Promise.all([
    prisma.client.findFirst({ where: { id: data.clientId, companyId } }),
    prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId } }),
    prisma.location.findFirst({ where: { id: data.locationId, warehouse: { companyId } } }),
  ]);
  if (!client) throw new Error('Cliente no corresponde a la empresa seleccionada');
  if (!warehouse) throw new Error('Bodega no corresponde a la empresa seleccionada');
  if (!location) throw new Error('Ubicacion no corresponde a la empresa seleccionada');
  for (const item of data.items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new Error('Producto no encontrado');
    if (product.status !== 'ACTIVE') throw new Error(`El SKU ${product.sku} esta inactivo y no se puede despachar`);
    const serials = cleanSerials(item.serialNumbers);
    if (product.managesSerial && serials.length !== item.quantity) {
      throw new Error(`Seleccione ${item.quantity} series para ${product.sku}`);
    }
    ensureUnique(serials, `Hay series repetidas en ${product.sku}`);
  }

  if (id) {
    const order = await prisma.outboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true } } } });
    if (!order || !['DRAFT', 'RESERVED'].includes(order.status)) throw new Error('La orden no puede editarse');
    await prisma.$transaction(async (tx) => {
      if (order.status === 'RESERVED') {
        await releaseOutboundReservations(tx, order);
      }
      await tx.outboundOrder.update({
        where: { id },
        data: {
          companyId,
          clientId: data.clientId,
          warehouseId: data.warehouseId,
          locationId: data.locationId,
          purchaseOrder: data.purchaseOrder?.trim() || null,
          status: 'DRAFT',
          notes: data.notes,
          items: {
            deleteMany: {},
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              serialNumbers: cleanSerials(item.serialNumbers),
            })),
          },
        },
      });
      await rebuildBalances(tx);
    }, TX_OPTIONS);
    if (data.status === 'DRAFT') await reserveOutbound(id, userId, companyId);
    if (data.status === 'DISPATCHED') await dispatchOutbound(id, userId, companyId);
    return prisma.outboundOrder.findUniqueOrThrow({
      where: { id },
      include: { client: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
    });
  }

  const order = await prisma.outboundOrder.create({
    data: {
      orderNo: nextOrderNo('OUT'),
      companyId,
      clientId: data.clientId,
      warehouseId: data.warehouseId,
      locationId: data.locationId,
      purchaseOrder: data.purchaseOrder?.trim() || null,
      status: data.status === 'DISPATCHED' ? 'DRAFT' : data.status,
      notes: data.notes,
      createdById: userId,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          serialNumbers: cleanSerials(item.serialNumbers),
        })),
      },
    },
  });

  if (data.status === 'DISPATCHED') {
    await dispatchOutbound(order.id, userId, companyId);
  } else {
    await reserveOutbound(order.id, userId, companyId);
  }
  return prisma.outboundOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { client: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
  });
}

export async function reserveOutbound(id: string, userId: string, companyId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true } } } });
    if (!order || order.status !== 'DRAFT') throw new Error('Solo se reservan ordenes en borrador');
    for (const item of order.items) {
      const serials = cleanSerials(item.serialNumbers);
      if (item.product.managesSerial) {
        const units = await tx.inventoryUnit.findMany({
          where: { productId: item.productId, serialNumber: { in: serials }, status: 'AVAILABLE', warehouseId: order.warehouseId },
        });
        if (units.length !== item.quantity) throw new Error(`Series no disponibles para ${item.product.sku}`);
        for (const unit of units) {
          await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'RESERVED' } });
          await tx.kardexMovement.create({
            data: {
              type: 'RESERVATION',
              productId: item.productId,
              inventoryUnitId: unit.id,
              quantity: -1,
              warehouseId: unit.warehouseId,
              locationId: unit.locationId,
              userId,
              documentType: 'OUTBOUND',
              documentNo: order.orderNo,
              observation: 'Reserva de serie',
            },
          });
        }
      } else {
        const availableUnits = await tx.inventoryUnit.findMany({
          where: { productId: item.productId, status: 'AVAILABLE', warehouseId: order.warehouseId },
          include: { location: true },
        });
        const units = availableUnits.sort(compareFefoUnits).slice(0, item.quantity);
        if (units.length !== item.quantity) throw new Error(`Stock insuficiente para ${item.product.sku}`);
        await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'RESERVED' } });
        await tx.kardexMovement.create({
          data: {
            type: 'RESERVATION',
            productId: item.productId,
            quantity: -item.quantity,
            warehouseId: order.warehouseId,
            locationId: order.locationId,
            userId,
            documentType: 'OUTBOUND',
            documentNo: order.orderNo,
            observation: 'Reserva de stock',
          },
        });
      }
    }
    await tx.outboundOrder.update({ where: { id }, data: { status: 'RESERVED' } });
    await rebuildBalances(tx);
    return { ok: true };
  }, TX_OPTIONS);
  await auditLog({ companyId, userId, action: 'RESERVE', entity: 'OutboundOrder', entityId: id, summary: 'Stock reservado para despacho' });
  return result;
}

export async function dispatchOutbound(id: string, userId: string, companyId: string) {
  const current = await prisma.outboundOrder.findFirst({ where: { id, companyId }, select: { status: true } });
  if (current?.status === 'DRAFT') {
    await reserveOutbound(id, userId, companyId);
  }
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true } } } });
    if (!order || !['DRAFT', 'RESERVED'].includes(order.status)) throw new Error('Orden no despachable');
    if (order.status === 'DRAFT') throw new Error('No se pudo reservar el stock antes del despacho');

    for (const item of order.items) {
      const serials = cleanSerials(item.serialNumbers);
      if (item.product.managesSerial) {
        const units = await tx.inventoryUnit.findMany({
          where: { productId: item.productId, serialNumber: { in: serials }, status: 'RESERVED', warehouseId: order.warehouseId },
        });
        if (units.length !== item.quantity) throw new Error(`Series reservadas incompletas para ${item.product.sku}`);
        for (const unit of units) {
          await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'DISPATCHED', locationId: order.locationId } });
          await tx.kardexMovement.create({
            data: {
              type: 'DISPATCH',
              productId: item.productId,
              inventoryUnitId: unit.id,
              quantity: -1,
              warehouseId: unit.warehouseId,
              locationId: order.locationId,
              userId,
              documentType: 'OUTBOUND',
              documentNo: order.orderNo,
              observation: 'Despacho confirmado',
            },
          });
        }
      } else {
        const availableUnits = await tx.inventoryUnit.findMany({
          where: { productId: item.productId, status: 'RESERVED', warehouseId: order.warehouseId },
          include: { location: true },
        });
        const units = availableUnits.sort(compareFefoUnits).slice(0, item.quantity);
        if (units.length !== item.quantity) throw new Error(`Stock reservado insuficiente para ${item.product.sku}`);
        await tx.inventoryUnit.updateMany({
          where: { id: { in: units.map((unit) => unit.id) } },
          data: { status: 'DISPATCHED', locationId: order.locationId },
        });
        await tx.kardexMovement.create({
          data: {
            type: 'DISPATCH',
            productId: item.productId,
            quantity: -item.quantity,
            warehouseId: order.warehouseId,
            locationId: order.locationId,
            userId,
            documentType: 'OUTBOUND',
            documentNo: order.orderNo,
            observation: 'Despacho confirmado',
          },
        });
      }
    }
    await tx.outboundOrder.update({ where: { id }, data: { status: 'DISPATCHED', confirmedAt: new Date() } });
    await rebuildBalances(tx);
    return { ok: true };
  }, TX_OPTIONS);
  await auditLog({ companyId, userId, action: 'DISPATCH', entity: 'OutboundOrder', entityId: id, summary: 'Despacho confirmado' });
  return result;
}

export async function shipOutbound(id: string, userId: string, companyId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true } } } });
    if (!order || order.status !== 'DISPATCHED') throw new Error('Solo se puede enviar una orden despachada');

    for (const item of order.items) {
      const serials = cleanSerials(item.serialNumbers);
      const units = item.product.managesSerial
        ? await tx.inventoryUnit.findMany({ where: { productId: item.productId, serialNumber: { in: serials }, status: 'DISPATCHED', warehouseId: order.warehouseId } })
        : await tx.inventoryUnit.findMany({ where: { productId: item.productId, status: 'DISPATCHED', warehouseId: order.warehouseId }, take: item.quantity });
      if (units.length !== item.quantity) throw new Error(`Despacho incompleto para ${item.product.sku}`);

      await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'SHIPPED' } });
      await tx.kardexMovement.create({
        data: {
          type: 'SHIPMENT',
          productId: item.productId,
          quantity: -item.quantity,
          warehouseId: order.warehouseId,
          locationId: order.locationId,
          userId,
          documentType: 'OUTBOUND',
          documentNo: order.orderNo,
          observation: 'Envio final confirmado',
        },
      });
    }

    await tx.outboundOrder.update({ where: { id }, data: { status: 'SHIPPED' } });
    await rebuildBalances(tx);
    return { ok: true };
  }, TX_OPTIONS);
  await auditLog({ companyId, userId, action: 'SHIP', entity: 'OutboundOrder', entityId: id, summary: 'Envio final confirmado' });
  return result;
}

export async function cancelOutbound(id: string, companyId: string, userId?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true } } } });
    if (!order || !['DRAFT', 'RESERVED', 'DISPATCHED'].includes(order.status)) throw new Error('La orden no puede cancelarse');
    if (['RESERVED', 'DISPATCHED'].includes(order.status)) {
      for (const item of order.items) {
        if (item.product.managesSerial) {
          await tx.inventoryUnit.updateMany({
            where: { productId: item.productId, serialNumber: { in: item.serialNumbers }, status: { in: ['RESERVED', 'DISPATCHED'] }, warehouseId: order.warehouseId },
            data: { status: 'AVAILABLE' },
          });
        } else {
          const units = await tx.inventoryUnit.findMany({ where: { productId: item.productId, status: { in: ['RESERVED', 'DISPATCHED'] }, warehouseId: order.warehouseId }, take: item.quantity });
          await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'AVAILABLE' } });
        }
      }
      await rebuildBalances(tx);
    }
    return tx.outboundOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }, TX_OPTIONS);
  await auditLog({ companyId, userId, action: 'CANCEL', entity: 'OutboundOrder', entityId: id, summary: 'Despacho cancelado o liberado' });
  return result;
}

export async function getPickingPlan(query: URLSearchParams, companyId: string) {
  const orderIds = (query.get('orders') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const orders = await prisma.outboundOrder.findMany({
    where: {
      companyId,
      status: { in: ['RESERVED', 'DISPATCHED'] },
      ...(orderIds.length ? { id: { in: orderIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { client: true, warehouse: true, location: true, createdBy: { include: { role: true } }, items: { include: { product: true } } },
  });
  const routeItems: Array<{
    orderId: string;
    orderNo: string;
    client: string;
    purchaseOrder: string | null;
    productId: string;
    sku: string;
    product: string;
    quantity: number;
    serials: string[];
    lots: string[];
    expirationDate: Date | null;
    warehouse: string;
    warehouseId: string;
    location: string;
    locationId: string;
    locationCode: string;
    routeOrder: number;
    mapX: number;
    mapY: number;
  }> = [];
  const allocatedUnitIds = new Set<string>();

  for (const order of orders) {
    for (const item of order.items) {
      const serials = cleanSerials(item.serialNumbers);
      const units = item.product.managesSerial
        ? await prisma.inventoryUnit.findMany({
            where: { productId: item.productId, serialNumber: { in: serials }, status: order.status, warehouseId: order.warehouseId },
            include: { product: true, warehouse: true, location: true },
          })
        : await prisma.inventoryUnit.findMany({
            where: { productId: item.productId, status: order.status, warehouseId: order.warehouseId },
            include: { product: true, warehouse: true, location: true },
          });
      const sortedUnits = units.filter((unit) => !allocatedUnitIds.has(unit.id)).sort(compareFefoUnits).slice(0, item.quantity);
      sortedUnits.forEach((unit) => allocatedUnitIds.add(unit.id));
      const grouped = new Map<string, typeof sortedUnits>();
      for (const unit of sortedUnits) {
        const current = grouped.get(unit.locationId) ?? [];
        current.push(unit);
        grouped.set(unit.locationId, current);
      }
      for (const group of grouped.values()) {
        const first = group[0];
        if (!first) continue;
        const earliest = group
          .map((unit) => unit.expirationDate)
          .filter((date): date is Date => Boolean(date))
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        routeItems.push({
          orderId: order.id,
          orderNo: order.orderNo,
          client: order.client.name,
          purchaseOrder: order.purchaseOrder,
          productId: item.productId,
          sku: item.product.sku,
          product: item.product.name,
          quantity: group.length,
          serials: group.map((unit) => unit.serialNumber).filter((serial): serial is string => Boolean(serial)),
          lots: Array.from(new Set(group.map((unit) => unit.lotNumber).filter((lot): lot is string => Boolean(lot)))),
          expirationDate: earliest,
          warehouse: first.warehouse.name,
          warehouseId: first.warehouseId,
          location: first.location.name,
          locationId: first.locationId,
          locationCode: first.location.code,
          routeOrder: first.location.pickSequence || 0,
          mapX: first.location.mapX || 0,
          mapY: first.location.mapY || 0,
        });
      }
    }
  }

  routeItems.sort((a, b) =>
    compareLocationRoute({ pickSequence: a.routeOrder, mapX: a.mapX, mapY: a.mapY, name: a.location }, { pickSequence: b.routeOrder, mapX: b.mapX, mapY: b.mapY, name: b.location }) ||
    a.sku.localeCompare(b.sku, 'es', { numeric: true }) ||
    a.orderNo.localeCompare(b.orderNo, 'es', { numeric: true }),
  );

  return {
    orders,
    items: routeItems,
    totals: {
      orders: orders.length,
      lines: routeItems.length,
      units: routeItems.reduce((sum, item) => sum + item.quantity, 0),
      locations: new Set(routeItems.map((item) => item.locationId)).size,
    },
  };
}

export async function completePicking(body: unknown, userId: string, companyId: string) {
  const data = pickingCompleteSchema.parse(body);
  const uniqueOrderIds = Array.from(new Set(data.orderIds));
  for (const orderId of uniqueOrderIds) {
    if (data.action === 'ship') {
      const order = await prisma.outboundOrder.findFirst({ where: { id: orderId, companyId }, select: { status: true } });
      if (order?.status === 'RESERVED') await dispatchOutbound(orderId, userId, companyId);
      await shipOutbound(orderId, userId, companyId);
    } else {
      await dispatchOutbound(orderId, userId, companyId);
    }
  }
  await auditLog({ companyId, userId, action: 'PICKING', entity: 'OutboundOrder', summary: `Picking guiado completado para ${uniqueOrderIds.length} ordenes`, metadata: { orderIds: uniqueOrderIds, action: data.action } });
  return { ok: true, processed: uniqueOrderIds.length };
}

export async function listKardex(query: URLSearchParams, companyId: string) {
  const search = query.get('search')?.trim();
  const productSearch = query.get('product')?.trim();
  const type = query.get('type')?.trim();
  const from = query.get('from')?.trim();
  const to = query.get('to')?.trim();
  return prisma.kardexMovement.findMany({
    where: {
      warehouse: { companyId },
      ...(type ? { type } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } } : {}),
      ...(search
        ? {
            OR: [
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { category: { contains: search, mode: 'insensitive' } } },
              { inventoryUnit: { serialNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(productSearch
        ? {
            OR: [
              { product: { sku: { contains: productSearch, mode: 'insensitive' } } },
              { product: { name: { contains: productSearch, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { product: true, inventoryUnit: true, warehouse: true, location: true, user: true },
  });
}

export async function createAdjustment(body: unknown, userId: string, companyId: string) {
  const data = adjustmentSchema.parse(body);
  if (data.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId } });
    if (!warehouse) throw new Error('Bodega no corresponde a la empresa seleccionada');
  }
  if (data.locationId) {
    const location = await prisma.location.findFirst({ where: { id: data.locationId, warehouse: { companyId } } });
    if (!location) throw new Error('Ubicacion no corresponde a la empresa seleccionada');
  }
  if (data.toLocationId) {
    const toLocation = await prisma.location.findFirst({ where: { id: data.toLocationId, warehouse: { companyId } } });
    if (!toLocation) throw new Error('Ubicacion destino no corresponde a la empresa seleccionada');
  }
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new Error('Producto no encontrado');
    let movementType = 'ADJUSTMENT_POSITIVE';
    let quantity = data.quantity;

    if (data.type === 'POSITIVE') {
      if (!data.warehouseId || !data.locationId) throw new Error('Seleccione bodega y ubicacion');
      const serials = cleanSerials(data.serialNumbers);
      if (product.managesSerial && serials.length !== data.quantity) throw new Error('La cantidad de series debe coincidir');
      ensureUnique(serials, 'Hay series repetidas');
      for (let index = 0; index < data.quantity; index += 1) {
        const unit = await tx.inventoryUnit.create({
          data: {
            productId: data.productId,
            serialNumber: product.managesSerial ? serials[index] : null,
            warehouseId: data.warehouseId,
            locationId: data.locationId,
            status: 'AVAILABLE',
          },
        });
        if (product.managesSerial) {
          await tx.kardexMovement.create({
            data: {
              type: movementType,
              productId: data.productId,
              inventoryUnitId: unit.id,
              quantity: 1,
              warehouseId: data.warehouseId,
              locationId: data.locationId,
              userId,
              documentType: 'ADJUSTMENT',
              documentNo: `ADJ-${Date.now()}`,
              observation: data.reason,
            },
          });
        }
      }
    } else {
      const units = data.inventoryUnitId
        ? await tx.inventoryUnit.findMany({ where: { id: data.inventoryUnitId } })
        : await tx.inventoryUnit.findMany({
            where: {
              productId: data.productId,
              status: 'AVAILABLE',
              warehouse: { companyId },
              ...(data.warehouseId ? { warehouseId: data.warehouseId } : {}),
              ...(data.locationId ? { locationId: data.locationId } : {}),
            },
            take: data.quantity,
          });
      if (!units.length || (data.type === 'NEGATIVE' && units.length < data.quantity)) throw new Error('Unidad o stock no disponible');

      if (data.type === 'NEGATIVE') {
        movementType = 'ADJUSTMENT_NEGATIVE';
        quantity = -units.length;
        await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'DISPATCHED' } });
      }
      if (data.type === 'BLOCK') {
        movementType = 'BLOCK';
        await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'BLOCKED' } });
      }
      if (data.type === 'UNBLOCK') {
        movementType = 'UNBLOCK';
        await tx.inventoryUnit.updateMany({ where: { id: { in: units.map((unit) => unit.id) } }, data: { status: 'AVAILABLE' } });
      }
      if (data.type === 'RELOCATE') {
        if (!data.toLocationId) throw new Error('Seleccione nueva ubicacion');
        const toLocation = await tx.location.findUnique({ where: { id: data.toLocationId } });
        if (!toLocation) throw new Error('Ubicacion destino no encontrada');
        movementType = 'LOCATION_CHANGE';
        await tx.inventoryUnit.updateMany({
          where: { id: { in: units.map((unit) => unit.id) } },
          data: { locationId: data.toLocationId, warehouseId: toLocation.warehouseId },
        });
      }

      for (const unit of units) {
        const currentLocationId = data.type === 'RELOCATE' && data.toLocationId ? data.toLocationId : unit.locationId;
        const currentWarehouseId =
          data.type === 'RELOCATE' && data.toLocationId
            ? (await tx.location.findUniqueOrThrow({ where: { id: data.toLocationId } })).warehouseId
            : unit.warehouseId;
        await tx.kardexMovement.create({
          data: {
            type: movementType,
            productId: data.productId,
            inventoryUnitId: unit.serialNumber ? unit.id : null,
            quantity: data.type === 'NEGATIVE' ? -1 : 0,
            warehouseId: currentWarehouseId,
            locationId: currentLocationId,
            userId,
            documentType: 'ADJUSTMENT',
            documentNo: `ADJ-${Date.now()}`,
            observation: data.reason,
          },
        });
      }
    }

    await tx.inventoryAdjustment.create({
      data: {
        type: data.type,
        productId: data.productId,
        inventoryUnitId: data.inventoryUnitId,
        quantity,
        fromLocationId: data.locationId,
        toLocationId: data.toLocationId,
        reason: data.reason,
        userId,
      },
    });
    if (data.type === 'POSITIVE' && !product.managesSerial) {
      await tx.kardexMovement.create({
        data: {
          type: movementType,
          productId: data.productId,
          quantity: data.quantity,
          warehouseId: data.warehouseId!,
          locationId: data.locationId!,
          userId,
          documentType: 'ADJUSTMENT',
          documentNo: `ADJ-${Date.now()}`,
          observation: data.reason,
        },
      });
    }
    await rebuildBalances(tx);
    return { ok: true };
  }, TX_OPTIONS);
  await auditLog({ companyId, userId, action: data.type, entity: 'InventoryAdjustment', entityId: data.productId, summary: data.reason, metadata: { quantity: data.quantity } });
  return result;
}

export async function listContacts(type: 'clients' | 'suppliers', companyId: string) {
  if (type === 'clients') {
    return prisma.client.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }
  return prisma.supplier.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
}

export async function saveContact(type: 'clients' | 'suppliers', body: unknown, companyId: string, id?: string) {
  const data = contactSchema.parse(body);
  if (type === 'clients') {
    return id ? prisma.client.update({ where: { id }, data: { ...data, companyId } }) : prisma.client.create({ data: { ...data, companyId } });
  }
  return id ? prisma.supplier.update({ where: { id }, data: { ...data, companyId } }) : prisma.supplier.create({ data: { ...data, companyId } });
}

export async function deleteContact(type: 'clients' | 'suppliers', id: string, roleCode: string, companyId: string) {
  if (!['ADMIN', 'SUPERVISOR'].includes(roleCode)) {
    throw new Error('No tiene permisos para eliminar registros');
  }
  if (type === 'clients') {
    const client = await prisma.client.findFirst({ where: { id, companyId }, include: { _count: { select: { orders: true } } } });
    if (!client) throw new Error('Cliente no encontrado');
    if (client._count.orders > 0) {
      await prisma.client.update({ where: { id }, data: { status: 'INACTIVE' } });
      return { ok: true, mode: 'INACTIVATED' };
    }
    await prisma.client.delete({ where: { id } });
    return { ok: true, mode: 'DELETED' };
  }
  const supplier = await prisma.supplier.findFirst({ where: { id, companyId }, include: { _count: { select: { orders: true } } } });
  if (!supplier) throw new Error('Proveedor no encontrado');
  if (supplier._count.orders > 0) {
    await prisma.supplier.update({ where: { id }, data: { status: 'INACTIVE' } });
    return { ok: true, mode: 'INACTIVATED' };
  }
  await prisma.supplier.delete({ where: { id } });
  return { ok: true, mode: 'DELETED' };
}

export async function saveWarehouse(body: unknown, companyId: string, id?: string, userId?: string) {
  const data = warehouseSchema.parse(body);
  const payload = { code: data.code.trim().toUpperCase(), name: data.name.trim(), companyId };
  const result = id ? await prisma.warehouse.update({ where: { id }, data: payload }) : await prisma.warehouse.create({ data: payload });
  await auditLog({ companyId, userId, action: id ? 'UPDATE' : 'CREATE', entity: 'Warehouse', entityId: result.id, summary: `Bodega ${result.name} ${id ? 'actualizada' : 'creada'}` });
  return result;
}

export async function deleteWarehouse(id: string, companyId: string) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          locations: true,
          inventoryUnits: true,
          inventoryBalances: true,
          inboundOrders: true,
          outboundOrders: true,
          kardexMovements: true,
          productDefaults: true,
        },
      },
    },
  });
  if (!warehouse || warehouse.companyId !== companyId) throw new Error('Bodega no encontrada');
  const related = Object.values(warehouse._count).reduce((sum, value) => sum + value, 0);
  if (related > 0) throw new Error('No se puede eliminar una bodega con ubicaciones, inventario o movimientos');
  await prisma.warehouse.delete({ where: { id } });
  return { ok: true };
}

export async function saveLocation(body: unknown, companyId: string, id?: string, userId?: string) {
  const data = locationSchema.parse(body);
  const warehouse = await prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId } });
  if (!warehouse) throw new Error('Bodega no corresponde a la empresa seleccionada');
  const payload = {
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    zone: data.zone.trim(),
    aisle: data.aisle.trim(),
    rack: data.rack.trim(),
    level: data.level.trim(),
    position: data.position.trim(),
    mapX: data.mapX,
    mapY: data.mapY,
    mapW: data.mapW,
    mapH: data.mapH,
    pickSequence: data.pickSequence,
    kind: data.kind,
  };
  const result = id ? await prisma.location.update({
    where: { id },
    data: {
      ...payload,
      warehouse: { connect: { id: data.warehouseId } },
    },
    include: { warehouse: true },
  }) : await prisma.location.create({
    data: {
      ...payload,
      warehouse: { connect: { id: data.warehouseId } },
    },
    include: { warehouse: true },
  });
  await auditLog({ companyId, userId, action: id ? 'UPDATE' : 'CREATE', entity: 'Location', entityId: result.id, summary: `Ubicacion ${result.code} ${id ? 'actualizada' : 'creada'}` });
  return result;
}

export async function deleteLocation(id: string, companyId: string) {
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      warehouse: true,
      _count: {
        select: {
          inventoryUnits: true,
          inventoryBalances: true,
          inboundOrders: true,
          inboundItems: true,
          outboundOrders: true,
          kardexMovements: true,
          adjustmentFrom: true,
          adjustmentTo: true,
          productDefaults: true,
        },
      },
    },
  });
  if (!location || location.warehouse.companyId !== companyId) throw new Error('Ubicacion no encontrada');
  const related = Object.values(location._count).reduce((sum, value) => sum + value, 0);
  if (related > 0) throw new Error('No se puede eliminar una ubicacion con inventario, historial o productos asociados');
  await prisma.location.delete({ where: { id } });
  return { ok: true };
}

function assertAdmin(roleCode: string) {
  if (roleCode !== 'ADMIN') throw new Error('Solo administrador');
}

export async function listRoles(roleCode: string) {
  assertAdmin(roleCode);
  return prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
}

export async function saveRole(body: unknown, roleCode: string, id?: string) {
  assertAdmin(roleCode);
  const data = roleSchema.parse(body);
  const payload = {
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    permissions: Array.from(new Set(data.permissions.map((permission) => permission.trim()).filter(Boolean))),
  };
  return id
    ? prisma.role.update({ where: { id }, data: payload, include: { _count: { select: { users: true } } } })
    : prisma.role.create({ data: payload, include: { _count: { select: { users: true } } } });
}

export async function deleteRole(id: string, roleCode: string) {
  assertAdmin(roleCode);
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new Error('Rol no encontrado');
  if (role._count.users > 0) throw new Error('No se puede eliminar un rol con usuarios asignados');
  await prisma.role.delete({ where: { id } });
  return { ok: true };
}

export async function listUsers(roleCode: string) {
  assertAdmin(roleCode);
  return prisma.user.findMany({ orderBy: { name: 'asc' }, include: { role: true } });
}

export async function saveUser(body: unknown, roleCode: string, id?: string) {
  assertAdmin(roleCode);
  const data = userSchema.parse(body);
  const basePayload = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    isActive: data.isActive,
    role: { connect: { id: data.roleId } },
  };
  if (!id && !data.password) throw new Error('La contrasena es obligatoria para usuarios nuevos');
  if (id) {
    const updatePayload: Prisma.UserUpdateInput = {
      ...basePayload,
      ...(data.password ? { passwordHash: hashPassword(data.password) } : {}),
    };
    return prisma.user.update({ where: { id }, data: updatePayload, include: { role: true } });
  }
  return prisma.user.create({ data: { ...basePayload, passwordHash: hashPassword(data.password) }, include: { role: true } });
}

export async function deleteUser(id: string, roleCode: string, currentUserId: string) {
  assertAdmin(roleCode);
  if (id === currentUserId) throw new Error('No puede desactivar su propio usuario');
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return { ok: true };
}

export async function getReports(query: URLSearchParams, companyId: string) {
  const type = query.get('type') ?? 'stock';
  if (type === 'analytics') {
    const [movements, outboundOrders, products] = await Promise.all([
      prisma.kardexMovement.findMany({
        where: { warehouse: { companyId }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
        include: { product: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.outboundOrder.findMany({
        where: { companyId },
        include: { client: true },
        orderBy: { createdAt: 'desc' },
        take: 120,
      }),
      prisma.product.findMany({ include: { inventoryBalances: { where: { warehouse: { companyId } } } } }),
    ]);
    const movementTrend = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * 86400000);
      return {
        date: date.toISOString().slice(0, 10),
        ingresos: 0,
        reservas: 0,
        despachos: 0,
        envios: 0,
        ajustes: 0,
      };
    });
    const trendByDate = new Map(movementTrend.map((item) => [item.date, item]));
    const topProducts = new Map<string, { sku: string; name: string; quantity: number; movements: number }>();
    for (const movement of movements) {
      const day = movement.createdAt.toISOString().slice(0, 10);
      const bucket = trendByDate.get(day);
      if (bucket) {
        if (movement.type === 'INBOUND') bucket.ingresos += Math.abs(movement.quantity);
        else if (movement.type === 'RESERVATION') bucket.reservas += Math.abs(movement.quantity);
        else if (movement.type === 'DISPATCH') bucket.despachos += Math.abs(movement.quantity);
        else if (movement.type === 'SHIPMENT') bucket.envios += Math.abs(movement.quantity);
        else bucket.ajustes += Math.abs(movement.quantity);
      }
      const current = topProducts.get(movement.productId) ?? { sku: movement.product.sku, name: movement.product.name, quantity: 0, movements: 0 };
      current.quantity += Math.abs(movement.quantity);
      current.movements += 1;
      topProducts.set(movement.productId, current);
    }
    const now = Date.now();
    const dispatchCycle = outboundOrders.map((order) => {
      const closedAt = order.status === 'SHIPPED' || order.status === 'DISPATCHED' ? order.confirmedAt : null;
      const end = closedAt?.getTime() ?? now;
      return {
        orderNo: order.orderNo,
        client: order.client.name,
        status: order.status,
        createdAt: order.createdAt,
        closedAt,
        hoursToClose: Math.round(((end - order.createdAt.getTime()) / 3600000) * 10) / 10,
      };
    });
    const statusGroups = new Map<string, { status: string; total: number; hours: number }>();
    for (const order of dispatchCycle) {
      const current = statusGroups.get(order.status) ?? { status: order.status, total: 0, hours: 0 };
      current.total += 1;
      current.hours += order.hoursToClose;
      statusGroups.set(order.status, current);
    }
    const lowStock = products
      .map((product) => ({
        sku: product.sku,
        name: product.name,
        available: product.inventoryBalances.filter((balance) => balance.status === 'AVAILABLE').reduce((sum, balance) => sum + balance.quantity, 0),
        stockMin: product.stockMin,
      }))
      .filter((product) => product.available <= product.stockMin)
      .sort((a, b) => a.available - b.available)
      .slice(0, 12);
    return {
      movementTrend,
      dispatchCycle: dispatchCycle.slice(0, 20),
      statusAging: Array.from(statusGroups.values()).map((item) => ({ status: item.status, total: item.total, avgHours: Math.round((item.hours / item.total) * 10) / 10 })),
      topProducts: Array.from(topProducts.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 12),
      lowStock,
    };
  }
  if (type === 'low-stock') {
    const products = await listProducts('', companyId);
    return products
      .map((product) => ({
        sku: product.sku,
        producto: product.name,
        categoria: product.category,
        descripcion: product.description,
        incluye: product.includes.join(' | '),
        stockMinimo: product.stockMin,
        disponible: product.inventoryBalances.filter((balance) => balance.status === 'AVAILABLE').reduce((sum, balance) => sum + balance.quantity, 0),
      }))
      .filter((row) => row.disponible <= row.stockMinimo);
  }
  if (type === 'available-serials' || type === 'dispatched-serials') {
    const status = type === 'available-serials' ? 'AVAILABLE' : 'DISPATCHED';
    return prisma.inventoryUnit.findMany({
      where: { warehouse: { companyId }, status, serialNumber: { not: null } },
      include: { product: true, warehouse: true, location: true },
      orderBy: { serialNumber: 'asc' },
    });
  }
  if (type === 'movements') {
    return listKardex(query, companyId);
  }
  if (type === 'inbound-suppliers') {
    return prisma.inboundOrder.findMany({ where: { companyId }, include: { supplier: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } });
  }
  if (type === 'outbound-clients') {
    return prisma.outboundOrder.findMany({ where: { companyId }, include: { client: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } });
  }
  if (type === 'inventory-valuation') {
    const balances = await prisma.inventoryBalance.findMany({
      where: { warehouse: { companyId }, status: { in: ['AVAILABLE', 'RESERVED'] } },
      include: { product: true, warehouse: true, location: true },
      orderBy: { product: { sku: 'asc' } },
    });
    return balances.map((balance) => {
      const unitCost = Number(balance.product.purchasePrice);
      return {
        sku: balance.product.sku,
        producto: balance.product.name,
        bodega: balance.warehouse.name,
        ubicacion: balance.location.name,
        estado: balance.status,
        cantidad: balance.quantity,
        costoUnitario: unitCost,
        valorInventario: unitCost * balance.quantity,
      };
    });
  }
  if (type === 'top-moving') {
    const movements = await prisma.kardexMovement.groupBy({
      by: ['productId'],
      where: { warehouse: { companyId } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 25,
    });
    const products = await prisma.product.findMany({ where: { id: { in: movements.map((movement) => movement.productId) } } });
    return movements.map((movement) => {
      const product = products.find((item) => item.id === movement.productId);
      return {
        sku: product?.sku ?? movement.productId,
        producto: product?.name ?? '-',
        movimientos: movement._count._all,
        cantidadMovida: movement._sum.quantity ?? 0,
      };
    });
  }
  if (type === 'inbound-costs') {
    return prisma.inboundOrder.findMany({
      where: { companyId, status: 'RECEIVED' },
      include: { supplier: true, warehouse: true, createdBy: true, items: { include: { product: true } } },
      orderBy: { confirmedAt: 'desc' },
    });
  }
  if (type === 'audit-log') {
    return prisma.auditLog.findMany({
      where: { companyId },
      include: { user: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
  return prisma.inventoryBalance.findMany({ where: { warehouse: { companyId } }, include: { product: true, warehouse: true, location: true }, orderBy: { product: { sku: 'asc' } } });
}
