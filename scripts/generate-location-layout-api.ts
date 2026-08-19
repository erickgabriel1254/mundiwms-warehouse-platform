const API_BASE = process.env.WMS_API_URL ?? 'https://mundiwms-demo.vercel.app';
const EMAIL = process.env.WMS_ADMIN_EMAIL ?? 'admin@mundiwms.local';
const PASSWORD = process.env.WMS_ADMIN_PASSWORD ?? 'Admin123!';

type Company = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; companyId?: string };
type Location = {
  id: string;
  code: string;
  warehouseId: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  level?: string;
  position?: string;
  kind?: string;
};
type Catalogs = { warehouses: Warehouse[]; locations: Location[] };

type LayoutConfig = {
  zone: string;
  aisles: number;
  racks: number;
  levels: number;
  positions: number;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function code(zone: string, aisle: number, rack: number, level: number, position: number) {
  return `Z${zone}-P${pad(aisle)}-R${pad(rack)}-N${pad(level)}-U${pad(position)}`;
}

async function rawApi<T>(path: string, token: string, companyId: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Company-Id': companyId,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data as T;
}

async function login() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = (await response.json()) as { token?: string; error?: string };
  if (!response.ok || !data.token) throw new Error(data.error ?? 'No se pudo iniciar sesion');
  return data.token;
}

async function createLayout(token: string, company: Company, config: LayoutConfig) {
  const catalogs = await rawApi<Catalogs>('/catalogs', token, company.id);
  const warehouse = catalogs.warehouses[0];
  if (!warehouse) return 0;
  const existingByCode = new Map(catalogs.locations.filter((location) => location.warehouseId === warehouse.id).map((location) => [location.code, location]));
  let changed = 0;

  for (let aisle = 1; aisle <= config.aisles; aisle += 1) {
    for (let rack = 1; rack <= config.racks; rack += 1) {
      for (let level = 1; level <= config.levels; level += 1) {
        for (let position = 1; position <= config.positions; position += 1) {
          const locationCode = code(config.zone, aisle, rack, level, position);
          const payload = {
            warehouseId: warehouse.id,
            code: locationCode,
            name: `Zona ${config.zone} / Pasillo ${pad(aisle)} / Rack ${pad(rack)} / Nivel ${pad(level)} / Posicion ${pad(position)}`,
            zone: config.zone,
            aisle: pad(aisle),
            rack: pad(rack),
            level: pad(level),
            position: pad(position),
            kind: 'STORAGE',
          };
          const existing = existingByCode.get(locationCode);
          if (existing) {
            const needsUpdate =
              existing.zone !== payload.zone ||
              existing.aisle !== payload.aisle ||
              existing.rack !== payload.rack ||
              existing.level !== payload.level ||
              existing.position !== payload.position ||
              existing.kind !== payload.kind;
            if (!needsUpdate) continue;
            await rawApi(`/locations/${existing.id}`, token, company.id, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
            changed += 1;
            continue;
          }
          await rawApi('/locations', token, company.id, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          changed += 1;
        }
      }
    }
  }
  return changed;
}

async function main() {
  const token = await login();
  const companies = await rawApi<Company[]>('/companies', token, 'company_ferremayor');
  let total = 0;
  for (const company of companies) {
    const config: LayoutConfig = ['FERRILOPEZ', 'CARVATEL-SUC', 'CARVATEL-TIENDA'].includes(company.code)
      ? { zone: 'B', aisles: 1, racks: 2, levels: 2, positions: 3 }
      : { zone: 'A', aisles: 2, racks: 3, levels: 3, positions: 4 };
    total += await createLayout(token, company, config);
  }
  console.log(`Layout generado por API: ${total} ubicaciones creadas o actualizadas.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
