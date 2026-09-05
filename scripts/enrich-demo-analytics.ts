import { prisma } from '../server/prisma.js';

const targetCompanyCodes = ['CARVATEL', 'CARVATEL-SUC', 'CARVATEL-MATRIZ', 'CARVATEL-TIENDA'];

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600000);
}

function demoDate(index: number, daysWindow = 28) {
  const date = new Date();
  date.setDate(date.getDate() - (index % daysWindow));
  date.setHours(8 + (index % 9), (index * 11) % 60, 0, 0);
  return date;
}

function pick<T>(items: T[], index: number) {
  if (!items.length) throw new Error('Faltan usuarios demo para enriquecer metricas');
  return items[index % items.length];
}

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@demo' }, isActive: true },
    include: { role: true },
    orderBy: { email: 'asc' },
  });
  const admins = users.filter((user) => user.role.code === 'ADMIN');
  const supervisors = users.filter((user) => user.role.code === 'SUPERVISOR');
  const dispatchers = users.filter((user) => user.role.code === 'OPERATOR');
  if (!admins.length || !supervisors.length || !dispatchers.length) {
    throw new Error('Ejecuta primero npm run api:users:demo para crear usuarios demo por rol');
  }

  const companies = await prisma.company.findMany({ where: { code: { in: targetCompanyCodes } }, orderBy: { code: 'asc' } });
  let inboundTouched = 0;
  let outboundTouched = 0;
  let auditTouched = 0;
  let kardexTouched = 0;

  for (const company of companies) {
    const importOrders = await prisma.importOrder.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' } });
    for (const [index, order] of importOrders.entries()) {
      const createdAt = demoDate(index + 4, 35);
      const user = pick(index % 3 === 0 ? supervisors : admins, index);
      await prisma.importOrder.update({
        where: { id: order.id },
        data: { createdById: user.id, createdAt, updatedAt: addHours(createdAt, 1.2 + (index % 4)) },
      });
    }

    const inboundOrders = await prisma.inboundOrder.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' } });
    const inboundById = new Map(inboundOrders.map((order) => [order.id, order]));
    const inboundByNo = new Map(inboundOrders.map((order) => [order.orderNo, order]));
    for (const [index, order] of inboundOrders.entries()) {
      const createdAt = demoDate(index + 1, 30);
      const confirmedAt = order.status === 'RECEIVED' ? addHours(createdAt, 2 + (index % 8) * 1.35) : null;
      const user = pick(index % 4 === 0 ? supervisors : [...admins, ...supervisors], index);
      await prisma.inboundOrder.update({
        where: { id: order.id },
        data: { createdById: user.id, createdAt, confirmedAt, updatedAt: confirmedAt ?? addHours(createdAt, 3 + (index % 5)) },
      });
      inboundTouched += 1;
      inboundById.set(order.id, { ...order, createdAt, confirmedAt, createdById: user.id });
      inboundByNo.set(order.orderNo, { ...order, createdAt, confirmedAt, createdById: user.id });
    }

    const outboundOrders = await prisma.outboundOrder.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' } });
    const outboundById = new Map(outboundOrders.map((order) => [order.id, order]));
    const outboundByNo = new Map(outboundOrders.map((order) => [order.orderNo, order]));
    for (const [index, order] of outboundOrders.entries()) {
      const createdAt = demoDate(index + 2, 24);
      const confirmedAt = ['PACKING', 'DISPATCHED', 'SHIPPED'].includes(order.status) ? addHours(createdAt, 0.7 + (index % 9) * 0.55) : null;
      const shippedAt = order.status === 'SHIPPED' ? addHours(confirmedAt ?? createdAt, 3 + (index % 7) * 1.25) : null;
      const user = pick(index % 5 === 0 ? supervisors : dispatchers, index);
      await prisma.outboundOrder.update({
        where: { id: order.id },
        data: { createdById: user.id, createdAt, confirmedAt, shippedAt, updatedAt: shippedAt ?? confirmedAt ?? addHours(createdAt, 1 + (index % 6)) },
      });
      outboundTouched += 1;
      outboundById.set(order.id, { ...order, createdAt, confirmedAt, shippedAt, createdById: user.id });
      outboundByNo.set(order.orderNo, { ...order, createdAt, confirmedAt, shippedAt, createdById: user.id });
    }

    const auditLogs = await prisma.auditLog.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' } });
    for (const [index, log] of auditLogs.entries()) {
      let userId = log.userId ?? pick(users, index).id;
      let createdAt = log.createdAt;
      if (log.entity === 'InboundOrder' && log.entityId) {
        const order = inboundById.get(log.entityId);
        if (order) {
          userId = order.createdById ?? pick(supervisors, index).id;
          createdAt = log.action === 'CONFIRM' ? (order.confirmedAt ?? addHours(order.createdAt, 4)) : log.action === 'CREATE' ? order.createdAt : addHours(order.createdAt, 1.5);
        }
      }
      if (log.entity === 'OutboundOrder' && log.entityId) {
        const order = outboundById.get(log.entityId);
        if (order) {
          const dispatcher = order.createdById ?? pick(dispatchers, index).id;
          const packer = pick(index % 2 === 0 ? supervisors : dispatchers, index).id;
          userId = ['PACKING', 'SHIP'].includes(log.action) ? packer : dispatcher;
          if (log.action === 'CREATE') createdAt = order.createdAt;
          if (log.action === 'RESERVE') createdAt = addHours(order.createdAt, 0.35);
          if (log.action === 'PICKING') createdAt = order.confirmedAt ?? addHours(order.createdAt, 2);
          if (log.action === 'PACKING') createdAt = addHours(order.confirmedAt ?? order.createdAt, 1.1);
          if (log.action === 'SHIP') createdAt = order.shippedAt ?? addHours(order.confirmedAt ?? order.createdAt, 5);
        }
      }
      if (log.action === 'PICKING' && !log.entityId) {
        userId = pick(dispatchers, index).id;
        createdAt = demoDate(index, 12);
      }
      await prisma.auditLog.update({ where: { id: log.id }, data: { userId, createdAt } });
      auditTouched += 1;
    }

    const movements = await prisma.kardexMovement.findMany({ where: { warehouse: { companyId: company.id } }, orderBy: { createdAt: 'asc' } });
    for (const [index, movement] of movements.entries()) {
      const inbound = inboundByNo.get(movement.documentNo);
      const outbound = outboundByNo.get(movement.documentNo);
      const source = inbound ?? outbound;
      if (!source) continue;
      const userId = source.createdById ?? pick(users, index).id;
      const createdAt = inbound
        ? (inbound.confirmedAt ?? addHours(inbound.createdAt, 2))
        : movement.type === 'SHIPMENT'
          ? (outbound?.shippedAt ?? addHours(outbound?.confirmedAt ?? outbound?.createdAt ?? demoDate(index), 5))
          : (outbound?.confirmedAt ?? addHours(outbound?.createdAt ?? demoDate(index), 1));
      await prisma.kardexMovement.update({ where: { id: movement.id }, data: { userId, createdAt } });
      kardexTouched += 1;
    }
  }

  console.log(`Metricas demo enriquecidas: recepciones ${inboundTouched}, despachos ${outboundTouched}, auditoria ${auditTouched}, kardex ${kardexTouched}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
