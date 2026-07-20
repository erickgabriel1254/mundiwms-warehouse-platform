export type RoleCode = 'ADMIN' | 'OPERATOR' | 'SUPERVISOR';
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'BLOCKED' | 'DISPATCHED' | 'SHIPPED' | 'RETURNING';
export type OrderStatus = 'DRAFT' | 'PENDING' | 'REQUESTED' | 'RECEIVED' | 'RESERVED' | 'DISPATCHED' | 'SHIPPED' | 'CANCELLED';

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
  theme: 'orange' | 'blue' | string;
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
export type Location = { id: string; code: string; name: string; warehouseId: string; warehouse?: Warehouse };
export type ProductLocationDefault = { id: string; productId: string; warehouseId: string; locationId: string; warehouse: Warehouse; location: Location };

export type InventoryUnit = {
  id: string;
  productId: string;
  serialNumber?: string | null;
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
  items: (Omit<OrderItem, 'serialNumbers'> & { serialNumbers?: string[] })[];
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
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  confirmedAt?: string | null;
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
};
