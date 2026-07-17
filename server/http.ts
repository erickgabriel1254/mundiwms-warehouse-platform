import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  cancelInbound,
  cancelImportOrder,
  cancelOutbound,
  completeImportOrder,
  confirmInbound,
  createAdjustment,
  dispatchOutbound,
  shipOutbound,
  getCatalogs,
  getDashboard,
  getReports,
  listCompanies,
  deleteProduct,
  deleteContact,
  deleteLocation,
  deleteWarehouse,
  deleteRole,
  deleteUser,
  listContacts,
  listInbound,
  listImportOrders,
  listInventory,
  listKardex,
  listOutbound,
  listProducts,
  listRoles,
  listUsers,
  login,
  me,
  reserveOutbound,
  resolveCompanyId,
  saveContact,
  saveInbound,
  saveImportOrder,
  saveLocation,
  saveOutbound,
  saveProduct,
  saveRole,
  saveUser,
  saveWarehouse,
  unitMovements,
} from './services/wms-service.js';
import { getUserFromToken } from './auth.js';

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function handleApi(req: IncomingMessage, res: ServerResponse) {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '') || '/';
    const parts = path.split('/').filter(Boolean);

    if (method === 'POST' && path === '/auth/login') {
      return send(res, 200, await login(await readBody(req)));
    }

    const user = await getUserFromToken(req.headers.authorization);
    if (!user) return send(res, 401, { error: 'Sesion requerida' });
    const companyId = await resolveCompanyId(req.headers['x-company-id']);

    if (method === 'GET' && path === '/me') return send(res, 200, await me(user.id));
    if (method === 'GET' && path === '/companies') return send(res, 200, await listCompanies());
    if (method === 'GET' && path === '/catalogs') return send(res, 200, await getCatalogs(companyId));
    if (method === 'GET' && path === '/dashboard') return send(res, 200, await getDashboard(companyId));
    if (method === 'GET' && path === '/products') return send(res, 200, await listProducts(url.searchParams.get('search') ?? '', companyId));
    if (method === 'POST' && path === '/products') return send(res, 200, await saveProduct(await readBody(req)));
    if (method === 'PUT' && parts[0] === 'products' && parts[1]) return send(res, 200, await saveProduct(await readBody(req), parts[1]));
    if (method === 'DELETE' && parts[0] === 'products' && parts[1]) return send(res, 200, await deleteProduct(parts[1], user.role.code));
    if (method === 'GET' && path === '/inventory') return send(res, 200, await listInventory(url.searchParams, companyId));
    if (method === 'POST' && path === '/locations') return send(res, 200, await saveLocation(await readBody(req), companyId));
    if (method === 'PUT' && parts[0] === 'locations' && parts[1]) return send(res, 200, await saveLocation(await readBody(req), companyId, parts[1]));
    if (method === 'DELETE' && parts[0] === 'locations' && parts[1]) return send(res, 200, await deleteLocation(parts[1], companyId));
    if (method === 'POST' && path === '/warehouses') return send(res, 200, await saveWarehouse(await readBody(req), companyId));
    if (method === 'PUT' && parts[0] === 'warehouses' && parts[1]) return send(res, 200, await saveWarehouse(await readBody(req), companyId, parts[1]));
    if (method === 'DELETE' && parts[0] === 'warehouses' && parts[1]) return send(res, 200, await deleteWarehouse(parts[1], companyId));
    if (method === 'GET' && path === '/roles') return send(res, 200, await listRoles(user.role.code));
    if (method === 'POST' && path === '/roles') return send(res, 200, await saveRole(await readBody(req), user.role.code));
    if (method === 'PUT' && parts[0] === 'roles' && parts[1]) return send(res, 200, await saveRole(await readBody(req), user.role.code, parts[1]));
    if (method === 'DELETE' && parts[0] === 'roles' && parts[1]) return send(res, 200, await deleteRole(parts[1], user.role.code));
    if (method === 'GET' && path === '/users') return send(res, 200, await listUsers(user.role.code));
    if (method === 'POST' && path === '/users') return send(res, 200, await saveUser(await readBody(req), user.role.code));
    if (method === 'PUT' && parts[0] === 'users' && parts[1]) return send(res, 200, await saveUser(await readBody(req), user.role.code, parts[1]));
    if (method === 'DELETE' && parts[0] === 'users' && parts[1]) return send(res, 200, await deleteUser(parts[1], user.role.code, user.id));
    if (method === 'GET' && parts[0] === 'inventory' && parts[1] && parts[2] === 'movements') return send(res, 200, await unitMovements(parts[1], companyId));
    if (method === 'GET' && path === '/inbound') return send(res, 200, await listInbound(companyId));
    if (method === 'GET' && path === '/import-orders') return send(res, 200, await listImportOrders(companyId));
    if (method === 'POST' && path === '/import-orders') return send(res, 200, await saveImportOrder(await readBody(req), user.id, companyId));
    if (method === 'PUT' && parts[0] === 'import-orders' && parts[1]) return send(res, 200, await saveImportOrder(await readBody(req), user.id, companyId, parts[1]));
    if (method === 'POST' && parts[0] === 'import-orders' && parts[2] === 'cancel') return send(res, 200, await cancelImportOrder(parts[1], companyId));
    if (method === 'POST' && parts[0] === 'import-orders' && parts[2] === 'received') return send(res, 200, await completeImportOrder(parts[1], companyId));
    if (method === 'POST' && path === '/inbound') return send(res, 200, await saveInbound(await readBody(req), user.id, companyId));
    if (method === 'PUT' && parts[0] === 'inbound' && parts[1]) return send(res, 200, await saveInbound(await readBody(req), user.id, companyId, parts[1]));
    if (method === 'POST' && parts[0] === 'inbound' && parts[2] === 'confirm') return send(res, 200, await confirmInbound(parts[1], user.id, companyId));
    if (method === 'POST' && parts[0] === 'inbound' && parts[2] === 'cancel') return send(res, 200, await cancelInbound(parts[1], companyId));
    if (method === 'GET' && path === '/outbound') return send(res, 200, await listOutbound(companyId));
    if (method === 'POST' && path === '/outbound') return send(res, 200, await saveOutbound(await readBody(req), user.id, companyId));
    if (method === 'PUT' && parts[0] === 'outbound' && parts[1]) return send(res, 200, await saveOutbound(await readBody(req), user.id, companyId, parts[1]));
    if (method === 'POST' && parts[0] === 'outbound' && parts[2] === 'reserve') return send(res, 200, await reserveOutbound(parts[1], user.id, companyId));
    if (method === 'POST' && parts[0] === 'outbound' && parts[2] === 'dispatch') return send(res, 200, await dispatchOutbound(parts[1], user.id, companyId));
    if (method === 'POST' && parts[0] === 'outbound' && parts[2] === 'ship') return send(res, 200, await shipOutbound(parts[1], user.id, companyId));
    if (method === 'POST' && parts[0] === 'outbound' && parts[2] === 'cancel') return send(res, 200, await cancelOutbound(parts[1], companyId));
    if (method === 'GET' && path === '/kardex') return send(res, 200, await listKardex(url.searchParams, companyId));
    if (method === 'POST' && path === '/adjustments') return send(res, 200, await createAdjustment(await readBody(req), user.id, companyId));
    if (method === 'GET' && path === '/clients') return send(res, 200, await listContacts('clients', companyId));
    if (method === 'POST' && path === '/clients') return send(res, 200, await saveContact('clients', await readBody(req), companyId));
    if (method === 'PUT' && parts[0] === 'clients' && parts[1]) return send(res, 200, await saveContact('clients', await readBody(req), companyId, parts[1]));
    if (method === 'DELETE' && parts[0] === 'clients' && parts[1]) return send(res, 200, await deleteContact('clients', parts[1], user.role.code, companyId));
    if (method === 'GET' && path === '/suppliers') return send(res, 200, await listContacts('suppliers', companyId));
    if (method === 'POST' && path === '/suppliers') return send(res, 200, await saveContact('suppliers', await readBody(req), companyId));
    if (method === 'PUT' && parts[0] === 'suppliers' && parts[1]) return send(res, 200, await saveContact('suppliers', await readBody(req), companyId, parts[1]));
    if (method === 'DELETE' && parts[0] === 'suppliers' && parts[1]) return send(res, 200, await deleteContact('suppliers', parts[1], user.role.code, companyId));
    if (method === 'GET' && path === '/reports') return send(res, 200, await getReports(url.searchParams, companyId));

    return send(res, 404, { error: 'Ruta no encontrada' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    return send(res, 400, { error: message });
  }
}
