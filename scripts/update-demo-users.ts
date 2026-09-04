import { hashPassword } from '../server/auth.js';
import { prisma } from '../server/prisma.js';

async function main() {
  await prisma.role.updateMany({ where: { code: 'OPERATOR' }, data: { name: 'Despachador' } });

  const oldUser = await prisma.user.findUnique({ where: { email: 'bodega@mundiwms.local' } });
  const newUser = await prisma.user.findUnique({ where: { email: 'despachador@mundiwms.local' } });

  if (oldUser && !newUser) {
    await prisma.user.update({
      where: { id: oldUser.id },
      data: {
        name: 'Despachador',
        email: 'despachador@mundiwms.local',
        passwordHash: hashPassword('Despacho123!'),
        isActive: true,
      },
    });
  } else {
    if (newUser) {
      await prisma.user.update({
        where: { id: newUser.id },
        data: {
          name: 'Despachador',
          passwordHash: hashPassword('Despacho123!'),
          isActive: true,
        },
      });
    }
    if (oldUser) {
      await prisma.user.update({
        where: { id: oldUser.id },
        data: {
          name: 'Despachador anterior',
          isActive: false,
        },
      });
    }
  }

  console.log('Usuarios demo actualizados: admin, supervisor, despachador');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
