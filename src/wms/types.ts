export type RoleCode = 'ADMIN' | 'OPERATOR' | 'SUPERVISOR';
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'BLOCKED' | 'DISPATCHED' | 'SHIPPED' | 'RETURNING';
export type OrderStatus = 'DRAFT' | 'PENDING' | 'REQUESTED' | 'PARTIAL' | 'RECEIVED' | 'RESERVED' | 'PACKING' | 'DISPATCHED' | 'SHIPPED' | 'CANCELLED';

export type UserSession = {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  roleName: string;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  _count?: { users: number };
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleId: string;
  role: Role;
  createdAt: string;
};

export type Company = {
  id: string;
  code: string;
  name: string;
  theme: 'red' | 'orange' | 'blue' | string;
  primaryColor: string;
};

export type Product = {
  id: string;
  sku: string;
  barcode?: string | null;
  barcodes?: string[];
  name: string;
  category: string;
  brand: string;
  description: string;
  includes: string[];
  sourceUrl?: string | null;
  unit: string;
  purchasePrice: number | string;
  salePrice: number | string;
  stockMin: number;
  managesSerial: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  inventoryBalances?: InventoryBalance[];
  inventoryUnits?: InventoryUnit[];
  locationDefaults?: ProductLocationDefault[];
  _count?: { inboundItems: number; outboundItems: number; kardexMovements: number };
};

export type ProductCategory = {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
};

export type Warehouse = { id: string; code: string; name: string; companyId?: string; company?: Company };
export type Location = {
  id: string;
  code: string;
  name: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  level?: string;
  position?: string;
  mapX?: number;
  mapY?: number;
  mapW?: number;
  mapH?: number;
  pickSequence?: number;
  kind?: 'STORAGE' | 'RECEIVING' | 'DISPATCH' | 'BLOCKED' | string;
  warehouseId: string;
  warehouse?: Warehouse;
  inventoryBalances?: { status: UnitStatus; quantity: number; product?: Product }[];
};
export type ProductLocationDefault = { id: string; productId: string; warehouseId: string; locationId: string; warehouse: Warehouse; location: Location };

export type InventoryUnit = {
  id: string;
  productId: string;
  serialNumber?: string | null;
  lotNumber?: string | null;
  expirationDate?: string | null;
  warehouseId: string;
  locationId: string;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
  product: Product;
  warehouse: Warehouse;
  location: Location;
};

export type InventoryBalance = {
  id: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  status: UnitStatus;
  quantity: number;
  product: Product;
  warehouse: Warehouse;
  location: Location;
};

export type Contact = {
  id: string;
  companyId?: string;
  name: string;
  taxId: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export type OrderItem = {
  id?: string;
  productId: string;
  product?: Product;
  locationId?: string | null;
  location?: Location | null;
  quantity: number;
  unitCost?: number | string;
  lotNumber?: string | null;
  expirationDate?: string | null;
  serialNumbers: string[];
};

export type InboundOrder = {
  id: string;
  orderNo: string;
  companyId?: string;
  supplierId: string;
  supplier: Contact;
  warehouseId: string;
  warehouse: Warehouse;
  locationId: string;
  location: Location;
  importOrderId?: string | null;
  purchaseOrder?: string | null;
  status: OrderStatus;
  notes?: string;
  carrierName?: string | null;
  guideNumber?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  createdBy?: AdminUser | null;
  items: OrderItem[];
};

export type ImportOrder = {
  id: string;
  orderNo: string;
  companyId?: string;
  supplierId: string;
  supplier: Contact;
  purchaseOrder?: string | null;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  createdBy?: AdminUser | null;
  items: (Omit<OrderItem, 'serialNumbers'> & { serialNumbers?: string[]; receivedQuantity?: number })[];
};

export type AuditLog = {
  id: string;
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: unknown;
  createdAt: string;
  user?: UserSession | null;
};

export type OutboundOrder = {
  id: string;
  orderNo: string;
  companyId?: string;
  clientId: string;
  client: Contact;
  warehouseId: string;
  warehouse: Warehouse;
  locationId: string;
  location: Location;
  purchaseOrder?: string | null;
  carrierName?: string | null;
  guideNumber?: string | null;
  deliveryAddress?: string | null;
  receiverName?: string | null;
  shippingNotes?: string | null;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  confirmedAt?: string | null;
  shippedAt?: string | null;
  createdBy?: AdminUser | null;
  items: OrderItem[];
};

export type KardexMovement = {
  id: string;
  type: string;
  productId: string;
  product: Product;
  inventoryUnit?: InventoryUnit | null;
  quantity: number;
  warehouse: Warehouse;
  location: Location;
  user?: UserSession | null;
  documentType: string;
  documentNo: string;
  observation: string;
  createdAt: string;
};

export type Catalogs = {
  companies: Company[];
  categories: ProductCategory[];
  products: Product[];
  suppliers: Contact[];
  clients: Contact[];
  warehouses: Warehouse[];
  locations: Location[];
};

export type DashboardData = {
  totals: {
    skus: number;
    units: number;
    serials: number;
    available: number;
    reserved: number;
    lowStock: number;
    inboundPending: number;
    outboundPending: number;
    outboundDispatched: number;
    pendingClosure: number;
  };
  recentMovements: KardexMovement[];
  byCategory: { category: string; total: number }[];
  lowStockProducts: { id: string; sku: string; name: string; stockMin: number; available: number }[];
  topMovingProducts: { id: string; sku: string; name: string; movements: number; quantity: number }[];
  userKpis: {
    userId: string;
    user: string;
    role: string;
    received: number;
    pendingPicking: number;
    dispatched: number;
    shipped: number;
    actions: number;
    avgReceptionHours: number;
    avgDispatchHours: number;
    avgPickingHours: number;
    avgGuidedPickingHours: number;
    avgPackingHours: number;
    avgShipmentHours: number;
  }[];
  supplierReceptionTimes: { name: string; avgHours: number; orders: number }[];
  clientDispatchTimes: { name: string; avgHours: number; orders: number }[];
};

export type PickingPlanItem = {
  orderId: string;
  orderNo: string;
  client: string;
  purchaseOrder?: string | null;
  productId: string;
  sku: string;
  product: string;
  barcode?: string | null;
  barcodes: string[];
  quantity: number;
  serials: string[];
  lots: string[];
  expirationDate?: string | null;
  warehouse: string;
  warehouseId: string;
  location: string;
  locationId: string;
  locationCode: string;
  routeOrder: number;
  mapX: number;
  mapY: number;
};

export type PickingPlan = {
  orders: OutboundOrder[];
  items: PickingPlanItem[];
  totals: {
    orders: number;
    lines: number;
    units: number;
    locations: number;
  };
};

export type ReportAnalytics = {
  movementTrend: { date: string; ingresos: number; reservas: number; despachos: number; envios: number; ajustes: number }[];
  dispatchCycle: { orderNo: string; client: string; status: string; createdAt: string; closedAt?: string | null; hoursToClose: number }[];
  statusAging: { status: string; total: number; avgHours: number }[];
  topProducts: { sku: string; name: string; quantity: number; movements: number }[];
  lowStock: { sku: string; name: string; available: number; stockMin: number }[];
};
