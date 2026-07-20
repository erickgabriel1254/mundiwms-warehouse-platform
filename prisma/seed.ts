import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = 'mundiwms';
  const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}

async function rebuildBalances() {
  const groups = await prisma.inventoryUnit.groupBy({
    by: ['productId', 'warehouseId', 'locationId', 'status'],
    _count: { _all: true },
  });

  await prisma.inventoryBalance.deleteMany();
  for (const group of groups) {
    await prisma.inventoryBalance.create({
      data: {
        productId: group.productId,
        warehouseId: group.warehouseId,
        locationId: group.locationId,
        status: group.status,
        quantity: group._count._all,
      },
    });
  }
}

async function main() {
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.kardexMovement.deleteMany();
  await prisma.outboundOrderItem.deleteMany();
  await prisma.outboundOrder.deleteMany();
  await prisma.importOrderItem.deleteMany();
  await prisma.importOrder.deleteMany();
  await prisma.inboundOrderItem.deleteMany();
  await prisma.inboundOrder.deleteMany();
  await prisma.inventoryBalance.deleteMany();
  await prisma.inventoryUnit.deleteMany();
  await prisma.productLocationDefault.deleteMany();
  await prisma.product.deleteMany();
  await prisma.client.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  const adminPermissions = [
    'dashboard:view',
    'products:manage',
    'inventory:view',
    'warehouses:manage',
    'inbound:manage',
    'outbound:manage',
    'kardex:view',
    'adjustments:manage',
    'contacts:manage',
    'reports:view',
    'users:manage',
    'roles:manage',
    'delete:restricted',
  ];
  const supervisorPermissions = adminPermissions.filter((permission) => !['users:manage', 'roles:manage'].includes(permission));
  const operatorPermissions = ['dashboard:view', 'inventory:view', 'inbound:manage', 'outbound:manage', 'kardex:view', 'adjustments:manage'];

  const [adminRole, operatorRole, supervisorRole] = await Promise.all([
    prisma.role.create({ data: { code: 'ADMIN', name: 'Administrador', permissions: adminPermissions } }),
    prisma.role.create({ data: { code: 'OPERATOR', name: 'Operador de bodega', permissions: operatorPermissions } }),
    prisma.role.create({ data: { code: 'SUPERVISOR', name: 'Supervisor', permissions: supervisorPermissions } }),
  ]);

  const [admin, operator, supervisor] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Administrador WMS',
        email: 'admin@mundiwms.local',
        passwordHash: hashPassword('Admin123!'),
        roleId: adminRole.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Operador Quito',
        email: 'bodega@mundiwms.local',
        passwordHash: hashPassword('Bodega123!'),
        roleId: operatorRole.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Supervisor Logistico',
        email: 'supervisor@mundiwms.local',
        passwordHash: hashPassword('Supervisor123!'),
        roleId: supervisorRole.id,
      },
    }),
  ]);

  const mundimaquinas = await prisma.company.create({
    data: { id: 'company_mundimaquinas', code: 'MUNDIMAQUINAS', name: 'Mundimaquinas', theme: 'orange', primaryColor: '#ea580c' },
  });
  const sirumaz = await prisma.company.create({
    data: { id: 'company_sirumaz', code: 'SIRUMAZ', name: 'Sirumaz', theme: 'blue', primaryColor: '#2563eb' },
  });

  const central = await prisma.warehouse.create({
    data: { code: 'BQ', name: 'Bodega Quito', companyId: mundimaquinas.id },
  });
  const showroom = await prisma.warehouse.create({
    data: { code: 'SHQ', name: 'Showroom Quito', companyId: mundimaquinas.id },
  });
  const sirumazCentral = await prisma.warehouse.create({
    data: { code: 'BSQ', name: 'Bodega Sirumaz Quito', companyId: sirumaz.id },
  });

  const locations = [];
  for (const warehouse of [central, showroom, sirumazCentral]) {
    for (const location of [
      ['REC', 'Recepcion'],
      ['ALM', 'Almacenamiento'],
      ['DES', 'Despacho'],
      ['BLQ', 'Bloqueados'],
    ]) {
      locations.push(
        await prisma.location.create({
          data: { warehouseId: warehouse.id, code: location[0], name: location[1] },
        }),
      );
    }
  }
  const centralStorage = locations.find((item) => item.warehouseId === central.id && item.code === 'ALM')!;
  const centralDispatch = locations.find((item) => item.warehouseId === central.id && item.code === 'DES')!;
  const centralBlocked = locations.find((item) => item.warehouseId === central.id && item.code === 'BLQ')!;
  const showroomStorage = locations.find((item) => item.warehouseId === showroom.id && item.code === 'ALM')!;
  const sirumazStorage = locations.find((item) => item.warehouseId === sirumazCentral.id && item.code === 'ALM')!;

  const suppliers = await Promise.all(
    [
      ['TecnoCostura Andina', '1790010010001'],
      ['Global Sewing Parts', '1790010010002'],
      ['Corte Textil Pro', '1790010010003'],
      ['Insumos Moda Sur', '1790010010004'],
      ['ServiMaquinas Quito', '1790010010005'],
      ['Industria Agujas Latam', '1790010010006'],
    ].map(([name, taxId], index) =>
      prisma.supplier.create({
        data: {
          name,
          companyId: mundimaquinas.id,
          taxId,
          contact: `Contacto proveedor ${index + 1}`,
          phone: `02-39${index}0-10${index}`,
          email: `proveedor${index + 1}@mundiwms.local`,
          address: `Av. Industrial N${index + 10}-45, Quito`,
        },
      }),
    ),
  );

  const clients = await Promise.all(
    [
      ['Confecciones Aurora', '1790020010001'],
      ['Textiles del Valle', '1790020010002'],
      ['Uniformes Quito', '1790020010003'],
      ['Moda Laboral EC', '1790020010004'],
      ['Atelier Norte', '1790020010005'],
      ['Industrial Jean Pro', '1790020010006'],
      ['Talleres San Pedro', '1790020010007'],
      ['Creaciones Manta', '1790020010008'],
    ].map(([name, taxId], index) =>
      prisma.client.create({
        data: {
          name,
          companyId: mundimaquinas.id,
          taxId,
          contact: `Compras cliente ${index + 1}`,
          phone: `099-12${index}-45${index}`,
          email: `cliente${index + 1}@mundiwms.local`,
          address: `Calle Comercial Oe${index + 1}-20, Ecuador`,
        },
      }),
    ),
  );

  const sirumazSuppliers = await Promise.all(
    [
      ['Proveedor Sirumaz Principal', '1790030010001'],
      ['Importadora Sirumaz', '1790030010002'],
    ].map(([name, taxId], index) =>
      prisma.supplier.create({
        data: {
          companyId: sirumaz.id,
          name,
          taxId,
          contact: `Contacto Sirumaz ${index + 1}`,
          phone: `02-48${index}0-20${index}`,
          email: `proveedor.sirumaz${index + 1}@mundiwms.local`,
          address: `Sucursal Sirumaz Quito ${index + 1}`,
        },
      }),
    ),
  );

  const sirumazClients = await Promise.all(
    [
      ['Cliente Sirumaz Taller Norte', '1790040010001'],
      ['Cliente Sirumaz Textil Centro', '1790040010002'],
    ].map(([name, taxId], index) =>
      prisma.client.create({
        data: {
          companyId: sirumaz.id,
          name,
          taxId,
          contact: `Compras Sirumaz ${index + 1}`,
          phone: `098-77${index}-22${index}`,
          email: `cliente.sirumaz${index + 1}@mundiwms.local`,
          address: `Quito Sirumaz ${index + 1}`,
        },
      }),
    ),
  );

  const productRows = [
    ['MAQ-IND-001', 'Maquina industrial recta pesada', 'Maquina Industrial', 'Juki', true, 2],
    ['MAQ-IND-002', 'Maquina overlock 5 hilos industrial', 'Maquina Industrial', 'Siruba', true, 2],
    ['MAQ-IND-003', 'Maquina collaretera industrial', 'Maquina Industrial', 'Pegasus', true, 2],
    ['MAQ-IND-004', 'Maquina zigzag industrial', 'Maquina Industrial', 'Brother', true, 1],
    ['MAQ-DOM-001', 'Maquina domestica multifuncion', 'Maquina Domestica', 'Singer', true, 3],
    ['MAQ-DOM-002', 'Maquina domestica portatil', 'Maquina Domestica', 'Janome', true, 3],
    ['COR-TEL-001', 'Cortadora vertical 8 pulgadas', 'Cortadora de Tela', 'Eastman', true, 2],
    ['COR-TEL-002', 'Cortadora circular 4 pulgadas', 'Cortadora de Tela', 'KM', true, 2],
    ['REP-AGU-001', 'Aguja industrial DBx1 No. 11', 'Repuestos', 'Organ', false, 50],
    ['REP-AGU-002', 'Aguja industrial DPx5 No. 16', 'Repuestos', 'Organ', false, 40],
    ['REP-COR-001', 'Cuchilla vertical 8 pulgadas', 'Repuestos', 'Eastman', false, 10],
    ['REP-PLN-001', 'Plancha industrial teflon', 'Repuestos', 'Silter', false, 6],
    ['ACC-PRE-001', 'Prensatela compensado derecho', 'Accesorios', 'GenericPro', false, 20],
    ['ACC-PRE-002', 'Prensatela cierre invisible', 'Accesorios', 'GenericPro', false, 20],
    ['ACC-BOB-001', 'Bobina metalica industrial', 'Accesorios', 'Brother', false, 80],
    ['ACC-MES-001', 'Mesa reforzada para maquina industrial', 'Accesorios', 'MundiLine', false, 5],
    ['INS-HIL-001', 'Hilo poliester negro 5000 yd', 'Insumos', 'Coats', false, 30],
    ['INS-HIL-002', 'Hilo poliester blanco 5000 yd', 'Insumos', 'Coats', false, 30],
    ['INS-ACE-001', 'Aceite blanco para maquina 1L', 'Insumos', 'MundiLine', false, 20],
    ['INS-LUB-001', 'Grasa lubricante industrial', 'Insumos', 'MundiLine', false, 12],
    ['REP-MOT-001', 'Motor servo 550W', 'Repuestos', 'Jack', true, 2],
    ['REP-MOT-002', 'Motor clutch industrial', 'Repuestos', 'Mitsubishi', true, 1],
    ['REP-PED-001', 'Pedal electronico universal', 'Repuestos', 'Jack', false, 8],
    ['REP-BAN-001', 'Banda industrial tipo M', 'Repuestos', 'MundiLine', false, 25],
    ['ACC-LAM-001', 'Lampara LED magnetica', 'Accesorios', 'Sunlight', false, 15],
    ['ACC-GUI-001', 'Guia magnetica de costura', 'Accesorios', 'GenericPro', false, 25],
    ['INS-PEG-001', 'Pegamento textil 250ml', 'Insumos', 'TextilFix', false, 12],
    ['REP-CAJ-001', 'Caja bobina industrial', 'Repuestos', 'Brother', false, 20],
    ['COR-TEL-003', 'Cortadora de extremos textil', 'Cortadora de Tela', 'KM', true, 1],
    ['MAQ-IND-005', 'Maquina botonera industrial', 'Maquina Industrial', 'Juki', true, 1],
  ] as const;

  const categoryNames = Array.from(new Set(productRows.map(([, , category]) => category)));
  await prisma.productCategory.createMany({
    data: categoryNames.map((name) => ({
      code: name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase(),
      name,
    })),
    skipDuplicates: true,
  });

  const products = await Promise.all(
    productRows.map(([sku, name, category, brand, managesSerial, stockMin], index) =>
      prisma.product.create({
        data: {
          sku,
          barcode: `779${String(index + 100000000).padStart(9, '0')}`,
          barcodes: [`779${String(index + 100000000).padStart(9, '0')}`],
          name,
          category,
          brand,
          unit: 'Unidad',
          purchasePrice: new Prisma.Decimal(managesSerial ? 420 + index * 18 : 4 + index * 1.35),
          salePrice: new Prisma.Decimal(managesSerial ? 620 + index * 26 : 8 + index * 2.1),
          managesSerial,
          stockMin,
        },
      }),
    ),
  );

  const serialProducts = products.filter((product) => product.managesSerial);
  const nonSerialProducts = products.filter((product) => !product.managesSerial);
  await prisma.productLocationDefault.createMany({
    data: products.flatMap((product, index) => [
      {
        productId: product.id,
        warehouseId: central.id,
        locationId: index % 6 === 0 ? centralDispatch.id : centralStorage.id,
      },
      {
        productId: product.id,
        warehouseId: showroom.id,
        locationId: showroomStorage.id,
      },
      {
        productId: product.id,
        warehouseId: sirumazCentral.id,
        locationId: sirumazStorage.id,
      },
    ]),
  });

  let serialCounter = 1;
  const units: Prisma.InventoryUnitCreateManyInput[] = [];
  for (const product of serialProducts) {
    const quantity = product.sku === 'REP-MOT-002' || product.sku === 'COR-TEL-003' ? 2 : 3;
    for (let i = 0; i < quantity; i += 1) {
      units.push({
        productId: product.id,
        serialNumber: `MMQ-${String(serialCounter).padStart(6, '0')}`,
        warehouseId: i % 4 === 0 ? showroom.id : central.id,
        locationId: i % 4 === 0 ? showroomStorage.id : centralStorage.id,
        status: i === 2 && product.sku === 'MAQ-IND-001' ? 'RESERVED' : 'AVAILABLE',
      });
      serialCounter += 1;
    }
  }

  for (const [index, product] of nonSerialProducts.entries()) {
    const quantity = index < 8 ? 2 : 1;
    for (let i = 0; i < quantity; i += 1) {
      units.push({
        productId: product.id,
        warehouseId: central.id,
        locationId: index === 0 && i === 0 ? centralBlocked.id : centralStorage.id,
        status: index === 0 && i === 0 ? 'BLOCKED' : 'AVAILABLE',
      });
    }
  }

  for (const [index, product] of products.slice(0, 8).entries()) {
    units.push({
      productId: product.id,
      serialNumber: product.managesSerial ? `SRZ-${String(index + 1).padStart(6, '0')}` : null,
      warehouseId: sirumazCentral.id,
      locationId: sirumazStorage.id,
      status: 'AVAILABLE',
    });
  }

  await prisma.inventoryUnit.createMany({ data: units.slice(0, 58) });
  const createdUnits = await prisma.inventoryUnit.findMany({ include: { product: true } });

  for (let index = 0; index < 5; index += 1) {
    const importOrder = await prisma.importOrder.create({
      data: {
        orderNo: `PED-2026-${String(index + 1).padStart(4, '0')}`,
        companyId: index < 3 ? mundimaquinas.id : sirumaz.id,
        supplierId: index < 3 ? suppliers[index].id : sirumazSuppliers[0].id,
        purchaseOrder: `OC-IMP-${String(index + 1).padStart(4, '0')}`,
        status: index === 4 ? 'DRAFT' : 'REQUESTED',
        createdById: admin.id,
        notes: 'Pedido esperado de importacion',
      },
    });
    await prisma.importOrderItem.createMany({
      data: products.slice(index, index + 3).map((product) => ({
        orderId: importOrder.id,
        productId: product.id,
        quantity: product.managesSerial ? 2 : 8,
      })),
    });
  }

  for (let index = 0; index < 5; index += 1) {
    const order = await prisma.inboundOrder.create({
      data: {
        orderNo: `IN-2026-${String(index + 1).padStart(4, '0')}`,
        companyId: mundimaquinas.id,
        supplierId: suppliers[index].id,
        warehouseId: central.id,
        locationId: centralStorage.id,
        status: index < 3 ? 'RECEIVED' : index === 3 ? 'PENDING' : 'DRAFT',
        createdById: operator.id,
        confirmedAt: index < 3 ? new Date(Date.now() - index * 86400000) : null,
        carrierName: index % 2 === 0 ? 'Transporte Andino' : null,
        guideNumber: index % 2 === 0 ? `GUIA-UIO-${String(index + 1).padStart(4, '0')}` : null,
        notes: 'Recepcion inicial de mercaderia',
      },
    });
    await prisma.inboundOrderItem.create({
      data: {
        orderId: order.id,
        productId: products[index].id,
        quantity: products[index].managesSerial ? 2 : 5,
        locationId: products[index].managesSerial ? centralStorage.id : null,
        serialNumbers: products[index].managesSerial
          ? createdUnits
              .filter((unit) => unit.productId === products[index].id && unit.serialNumber)
              .slice(0, 2)
              .map((unit) => unit.serialNumber!)
          : [],
      },
    });
  }

  for (let index = 0; index < 5; index += 1) {
    const product = products[index + 4];
    const selectedSerials = product.managesSerial
      ? createdUnits
          .filter((unit) => unit.productId === product.id && unit.serialNumber && unit.status !== 'BLOCKED')
          .slice(0, 1)
          .map((unit) => unit.serialNumber!)
      : [];
    const order = await prisma.outboundOrder.create({
      data: {
        orderNo: `OUT-2026-${String(index + 1).padStart(4, '0')}`,
        companyId: mundimaquinas.id,
        clientId: clients[index].id,
        warehouseId: central.id,
        locationId: centralDispatch.id,
        status: index < 2 ? 'DISPATCHED' : index === 2 ? 'RESERVED' : 'DRAFT',
        createdById: supervisor.id,
        confirmedAt: index < 2 ? new Date(Date.now() - index * 43200000) : null,
        notes: 'Despacho comercial programado',
      },
    });
    await prisma.outboundOrderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity: product.managesSerial ? selectedSerials.length || 1 : 1,
        serialNumbers: selectedSerials,
      },
    });
  }

  const movementTypes = ['INBOUND', 'RESERVATION', 'DISPATCH', 'ADJUSTMENT_POSITIVE', 'LOCATION_CHANGE'];
  for (let index = 0; index < 50; index += 1) {
    const unit = createdUnits[index % createdUnits.length];
    await prisma.kardexMovement.create({
      data: {
        type: movementTypes[index % movementTypes.length],
        productId: unit.productId,
        inventoryUnitId: unit.serialNumber ? unit.id : null,
        quantity: index % 5 === 1 || index % 5 === 2 ? -1 : 1,
        warehouseId: unit.warehouseId,
        locationId: unit.locationId,
        userId: index % 2 === 0 ? operator.id : supervisor.id,
        documentType: index % 2 === 0 ? 'INBOUND' : 'OUTBOUND',
        documentNo: index % 2 === 0 ? `IN-2026-${String((index % 5) + 1).padStart(4, '0')}` : `OUT-2026-${String((index % 5) + 1).padStart(4, '0')}`,
        observation: 'Movimiento inicial generado por seed',
        createdAt: new Date(Date.now() - index * 3600000),
      },
    });
  }

  await rebuildBalances();

  console.log('Seed WMS completado');
  console.log('Usuarios iniciales:');
  console.log('admin@mundiwms.local / Admin123!');
  console.log('bodega@mundiwms.local / Bodega123!');
  console.log('supervisor@mundiwms.local / Supervisor123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
