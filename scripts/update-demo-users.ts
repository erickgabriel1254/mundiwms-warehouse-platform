import { hashPassword } from '../server/auth.js';
import { prisma } from '../server/prisma.js';

async function main() {
  await prisma.role.updateMany({ where: { code: 'OPERATOR' }, data: { name: 'Despachador' } });

  const roles = await prisma.role.findMany();
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
  const demoUsers = [
    {
      email: 'admin@demo',
      name: 'Administrador WMS',
      password: 'Admin123!',
      roleCode: 'ADMIN',
      previousEmails: ['admin@mundiwms.local'],
    },
    {
      email: 'supervisor@demo',
      name: 'Supervisor Logistico',
      password: 'Supervisor123!',
      roleCode: 'SUPERVISOR',
      previousEmails: ['supervisor@mundiwms.local'],
    },
    {
      email: 'despacho@demo',
      name: 'Despachador',
      password: 'Despacho123!',
      roleCode: 'OPERATOR',
      previousEmails: ['despachador@mundiwms.local', 'bodega@mundiwms.local'],
    },
  ];

  for (const demoUser of demoUsers) {
    const roleId = roleByCode.get(demoUser.roleCode);
    if (!roleId) throw new Error(`No existe el rol ${demoUser.roleCode}`);

    const currentUser = await prisma.user.findUnique({ where: { email: demoUser.email } });
    const previousUser = currentUser
      ? null
      : await prisma.user.findFirst({ where: { email: { in: demoUser.previousEmails } } });
    const user = currentUser ?? previousUser;

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: demoUser.name,
          email: demoUser.email,
          passwordHash: hashPassword(demoUser.password),
          roleId,
          isActive: true,
        },
      });
      continue;
    }

    await prisma.user.create({
      data: {
        name: demoUser.name,
        email: demoUser.email,
        passwordHash: hashPassword(demoUser.password),
        roleId,
        isActive: true,
      },
    });
  }

  console.log('Usuarios demo actualizados: admin@demo, supervisor@demo, despacho@demo');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
