import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  ['ADITIVOS', 'Aditivos'],
  ['PINTURA_EXTERIORES', 'Pintura para Exteriores'],
  ['PINTURA_METALMECANICA', 'Pintura Metalmecanica'],
  ['LIJAS', 'Lijas'],
  ['HERRAMIENTAS_MANUALES', 'Herramientas Manuales'],
  ['CERRADURAS_SEGURIDAD', 'Cerraduras y Seguridad'],
  ['MATERIAL_ELECTRICO', 'Material Electrico'],
  ['ALAMBRES_CABLES', 'Alambres y Cables'],
  ['JARDINERIA_MANTENIMIENTO', 'Jardineria y Mantenimiento'],
  ['CONSTRUCCION', 'Materiales de Construccion'],
] as const;

const products = [
  {
    sku: 'FER-QUI-THINNER-001',
    name: 'Thinner Ecuador',
    category: 'Aditivos',
    brand: 'Ferrilopez',
    description: 'Solvente organico utilizado para diluir pinturas y otros recubrimientos como esmaltes, lacas y barnices.',
    sourceUrl: 'https://www.construex.com.ec/exhibidores/ferrilopez/producto/thinner_ecuador',
  },
  {
    sku: 'FER-PIN-LATEX-001',
    name: 'Latex Ecuador',
    category: 'Pintura para Exteriores',
    brand: 'Ferrilopez',
    description: 'Pintura latex para interiores y exteriores, reconocida por su facilidad de uso.',
    sourceUrl: 'https://www.construex.com.ec/exhibidores/ferrilopez/producto/latex_ecuador',
  },
  {
    sku: 'FER-PIN-ESMALTE-001',
    name: 'Esmalte Duracolor Ecuador',
    category: 'Pintura Metalmecanica',
    brand: 'Ferrilopez',
    description: 'Producto Ferrilopez listado publicamente en la categoria Pintura Metalmecanica.',
    sourceUrl: 'https://www.construex.com.ec/exhibidores/ferrilopez',
  },
  {
    sku: 'FER-LIJ-MANO-001',
    name: 'Lija mano Ecuador',
    category: 'Lijas',
    brand: 'Ferrilopez',
    description: 'Producto Ferrilopez listado publicamente en la categoria Lijas.',
    sourceUrl: 'https://www.construex.com.ec/mercado/construccion/categorias/materiales_de_construccion/materiales_de_construccion_y_ferreteria/lijas',
  },
  {
    sku: 'FM-HER-MAR-001',
    name: 'Martillo de una mano',
    category: 'Herramientas Manuales',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de herramientas manuales.',
    sourceUrl: 'https://ecuadornegocios.com/info/ferremayor-6501973E56538230',
  },
  {
    sku: 'FM-HER-SIE-001',
    name: 'Sierra manual',
    category: 'Herramientas Manuales',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de herramientas manuales.',
    sourceUrl: 'https://ecuadornegocios.com/info/ferremayor-6501973E56538230',
  },
  {
    sku: 'FM-HER-DES-001',
    name: 'Destornillador',
    category: 'Herramientas Manuales',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de herramientas manuales.',
    sourceUrl: 'https://ecuadornegocios.com/info/ferremayor-6501973E56538230',
  },
  {
    sku: 'FM-SEG-CER-001',
    name: 'Cerradura residencial',
    category: 'Cerraduras y Seguridad',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de cerraduras y seguridad.',
    sourceUrl: 'https://ecuadornegocios.com/info/ferremayor-6501973E56538230',
  },
  {
    sku: 'FM-SEG-EXT-001',
    name: 'Extintor multiproposito',
    category: 'Cerraduras y Seguridad',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de seguridad.',
    sourceUrl: 'https://ecuadornegocios.com/info/ferremayor-6501973E56538230',
  },
  {
    sku: 'FM-ELE-CAB-001',
    name: 'Cable electrico',
    category: 'Material Electrico',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de materiales electricos.',
    sourceUrl: 'https://www.mipleo.com.ec/ofertas-de-trabajo/oferta-de-trabajo-en-santo-domingo-de-los-tsachilas/supervisor-de-puntos-de-venta-154026.html',
  },
  {
    sku: 'FM-JAR-MAN-001',
    name: 'Herramienta de jardineria',
    category: 'Jardineria y Mantenimiento',
    brand: 'Ferremayor',
    description: 'Producto base para catalogo ferretero de mantenimiento y jardineria.',
    sourceUrl: 'https://www.mipleo.com.ec/ofertas-de-trabajo/oferta-de-trabajo-en-santo-domingo-de-los-tsachilas/supervisor-de-puntos-de-venta-154026.html',
  },
] as const;

async function upsertCompany() {
  const ferremayor = await prisma.company.upsert({
    where: { id: 'company_ferremayor' },
    update: { code: 'CARVATEL', name: 'Carvatel', theme: 'red', primaryColor: '#dc2626' },
    create: { id: 'company_ferremayor', code: 'CARVATEL', name: 'Carvatel', theme: 'red', primaryColor: '#dc2626' },
  });
  const ferrilopez = await prisma.company.upsert({
    where: { id: 'company_ferrilopez' },
    update: { code: 'CARVATEL-SUC', name: 'Carvatel Sucursal', theme: 'red', primaryColor: '#dc2626' },
    create: { id: 'company_ferrilopez', code: 'CARVATEL-SUC', name: 'Carvatel Sucursal', theme: 'red', primaryColor: '#dc2626' },
  });

  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: ferremayor.id, code: 'SD-CEDIS' } },
      update: { name: 'Centro de Distribucion Santo Domingo' },
      create: { companyId: ferremayor.id, code: 'SD-CEDIS', name: 'Centro de Distribucion Santo Domingo' },
    }),
    prisma.warehouse.upsert({
      where: { companyId_code: { companyId: ferrilopez.id, code: 'SD-TIENDA' } },
      update: { name: 'Tienda Santo Domingo' },
      create: { companyId: ferrilopez.id, code: 'SD-TIENDA', name: 'Tienda Santo Domingo' },
    }),
  ]);

  for (const warehouse of warehouses) {
    for (const [code, name] of [
      ['REC', 'Recepcion'],
      ['ALM', 'Almacenamiento'],
      ['DES', 'Despacho'],
      ['BLQ', 'Bloqueados'],
    ] as const) {
      await prisma.location.upsert({
        where: { warehouseId_code: { warehouseId: warehouse.id, code } },
        update: { name },
        create: { warehouseId: warehouse.id, code, name },
      });
    }
  }
}

async function main() {
  await upsertCompany();

  for (const [code, name] of categories) {
    await prisma.productCategory.upsert({
      where: { name },
      update: { code, status: 'ACTIVE' },
      create: { code, name, status: 'ACTIVE' },
    });
  }

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        category: product.category,
        brand: product.brand,
        description: product.description,
        sourceUrl: product.sourceUrl,
        status: 'ACTIVE',
      },
      create: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        brand: product.brand,
        description: product.description,
        sourceUrl: product.sourceUrl,
        includes: ['Producto principal'],
        unit: 'Unidad',
        purchasePrice: 0,
        salePrice: 0,
        stockMin: 1,
        managesSerial: false,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`Catalogo Ferremayor/Ferrilopez cargado: ${products.length} productos y ${categories.length} categorias.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
