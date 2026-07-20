import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = 'mundiwms';
  const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
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
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.company.deleteMany();

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

  await Promise.all([
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

  await Promise.all([
    prisma.company.create({
      data: { id: 'company_mundimaquinas', code: 'MUNDIMAQUINAS', name: 'Mundimaquinas', theme: 'orange', primaryColor: '#ea580c' },
    }),
    prisma.company.create({
      data: { id: 'company_sirumaz', code: 'SIRUMAZ', name: 'Sirumaz', theme: 'blue', primaryColor: '#2563eb' },
    }),
  ]);

  console.log('Base limpia para demo.');
  console.log('Se conservaron usuarios iniciales y empresas, sin inventario ni catalogos operativos.');
  console.log('Usuarios: admin@mundiwms.local / Admin123!, bodega@mundiwms.local / Bodega123!, supervisor@mundiwms.local / Supervisor123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
