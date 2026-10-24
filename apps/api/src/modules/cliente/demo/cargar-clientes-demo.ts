/**
 * Carga idempotente de los datos de presentación del cliente externo (módulo 17, ADR-0021): trabajos para clientes
 * (Cubierta, Losa y Muro), precios de referencia de sus insumos, tres clientes ficticios con sus proyectos y su acceso a la app.
 *
 * - Se ejecuta con el ROL MIGRADOR sobre una organización DEMO, y usa las MISMAS funciones de la base que la aplicación
 *   (folios, bitácora, coherencia), no inserciones directas.
 * - Idempotente y no destructiva: lo que ya existe se conserva tal cual. Nunca restablece la contraseña de un acceso existente,
 *   nunca borra ni modifica cotizaciones, versiones, emisiones ni documentos, y no crea cotizaciones.
 * - Las contraseñas temporales se generan aquí, solo se devuelven al llamador (que las guarda fuera de Git) y en la base queda
 *   únicamente su hash Argon2id.
 * - Los precios de referencia son los de los ejemplos de referencia de la fase 1 (R1 a R3); el Administrador del catálogo puede
 *   cambiarlos. NO son selecciones aprobadas de ninguna cotización.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { generarContrasena } from "../../autenticacion/demo/cargar-usuarios-demo.js";
import type { ServicioContrasenas } from "../../autenticacion/infraestructura/contrasenas.js";

export class ErrorCargaClientes extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCargaClientes";
  }
}

interface MedidaDef {
  clave: "largo" | "ancho" | "alto";
  etiqueta: string;
  ayuda: string;
}

export const TRABAJOS_DEMO = [
  {
    codigo: "CUBIERTA",
    nombre: "Cubierta",
    descripcion: "Techo de lámina sobre estructura ligera.",
    ilustracion: "cubierta",
    orden: 10,
    opciones: [
      {
        codigo: "LAMINA",
        nombre: "Cubierta de lámina",
        descripcion: "Lámina sobre largueros. Mide cada faldón por separado.",
        conceptoCodigo: "CON-00007",
        consolidarCompras: true,
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "Del alero a la cumbrera, siguiendo la pendiente del faldón." },
          { clave: "ancho", etiqueta: "Ancho", ayuda: "De un extremo al otro del faldón." },
        ] as MedidaDef[],
        orden: 10,
      },
    ],
  },
  {
    codigo: "LOSA",
    nombre: "Losa",
    descripcion: "Piso o entrepiso de concreto reforzado.",
    ilustracion: "losa",
    orden: 20,
    opciones: [
      {
        codigo: "CONCRETO",
        nombre: "Losa de concreto reforzado",
        descripcion: "Concreto con acero de refuerzo. Mide cada tablero por separado.",
        conceptoCodigo: "CON-00008",
        consolidarCompras: true,
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "De borde exterior a borde exterior, en la dirección más larga." },
          { clave: "ancho", etiqueta: "Ancho", ayuda: "De borde exterior a borde exterior, en la otra dirección." },
          { clave: "alto", etiqueta: "Espesor", ayuda: "Grueso de la losa, por ejemplo 0.12 m." },
        ] as MedidaDef[],
        orden: 10,
      },
    ],
  },
  {
    codigo: "MURO",
    nombre: "Muro",
    descripcion: "Muro de block, con o sin huecos.",
    ilustracion: "muro",
    orden: 30,
    opciones: [
      {
        codigo: "BLOCK",
        nombre: "Muro de block",
        descripcion: "Block de concreto reforzado. Las ventanas y puertas se restan como huecos.",
        conceptoCodigo: "CON-00009",
        consolidarCompras: true,
        medidas: [
          { clave: "largo", etiqueta: "Largo", ayuda: "De extremo a extremo del muro." },
          { clave: "alto", etiqueta: "Alto", ayuda: "De la base a la parte superior del muro." },
        ] as MedidaDef[],
        orden: 10,
      },
    ],
  },
] as const;

/** Precios de los ejemplos de referencia R1 a R3 (docs/api/ejemplos). El insumo de cada uno se lee del catálogo. */
export const PRECIOS_DE_REFERENCIA_DEMO = [
  "PRE-000007", "PRE-000008", "PRE-000009",
  "PRE-000012", "PRE-000013", "PRE-000014",
  "PRE-000016", "PRE-000017",
] as const;

/** JSONB no conserva el orden de las claves: se compara por contenido y en el orden de captura. */
function mismasMedidas(guardadas: unknown, esperadas: readonly MedidaDef[]): boolean {
  if (!Array.isArray(guardadas) || guardadas.length !== esperadas.length) return false;
  return esperadas.every((m, i) => {
    const g = guardadas[i] as Partial<MedidaDef> | undefined;
    return g?.clave === m.clave && g.etiqueta === m.etiqueta && g.ayuda === m.ayuda;
  });
}

export interface ClienteDemo {
  readonly nombre: string;
  readonly contactoNombre: string;
  readonly contactoTelefono: string;
  readonly contactoCorreo: string;
  readonly acceso: { readonly correo: string; readonly nombre: string };
  readonly proyectos: readonly { nombre: string; municipio: string; entidadFederativa: string; descripcion: string }[];
}

export const CLIENTES_DEMO: readonly ClienteDemo[] = [
  {
    nombre: "Laura Méndez",
    contactoNombre: "Laura Méndez",
    contactoTelefono: "55 5550 1201",
    contactoCorreo: "laura.mendez@clientes.softarq.test",
    acceso: { correo: "laura.mendez@clientes.softarq.test", nombre: "Laura Méndez" },
    proyectos: [
      { nombre: "Casa Tlalpan", municipio: "Tlalpan", entidadFederativa: "Ciudad de México", descripcion: "Ampliación de casa habitación: losa de entrepiso y muro de colindancia." },
      { nombre: "Bodega Ixtapaluca", municipio: "Ixtapaluca", entidadFederativa: "Estado de México", descripcion: "Bodega ligera con cubierta de lámina." },
    ],
  },
  {
    nombre: "Constructora Ríos y Asociados",
    contactoNombre: "Héctor Ríos",
    contactoTelefono: "442 555 0143",
    contactoCorreo: "obras@rios-constructora.softarq.test",
    acceso: { correo: "hector.rios@clientes.softarq.test", nombre: "Héctor Ríos" },
    proyectos: [{ nombre: "Nave industrial Querétaro", municipio: "Querétaro", entidadFederativa: "Querétaro", descripcion: "Nave de una planta con muros perimetrales." }],
  },
  {
    nombre: "Despacho Aranda Arquitectos",
    contactoNombre: "Silvia Aranda",
    contactoTelefono: "55 5550 7788",
    contactoCorreo: "silvia@aranda-arquitectos.softarq.test",
    acceso: { correo: "silvia.aranda@clientes.softarq.test", nombre: "Silvia Aranda" },
    proyectos: [{ nombre: "Casa Coyoacán", municipio: "Coyoacán", entidadFederativa: "Ciudad de México", descripcion: "Remodelación con losa nueva en patio posterior." }],
  },
];

export interface CredencialCliente {
  readonly correo: string;
  readonly nombre: string;
  readonly cliente: string;
  readonly contrasena: string;
}

export interface ResumenCargaClientes {
  readonly trabajosGuardados: string[];
  readonly referenciasDesignadas: string[];
  readonly referenciasConservadas: string[];
  readonly clientesCreados: string[];
  readonly proyectosCreados: string[];
  readonly accesosCreados: CredencialCliente[];
  readonly accesosConservados: string[];
}

const huella = (texto: string): Buffer => createHash("sha256").update(texto, "utf8").digest();

export async function cargarClientesDemo(
  db: PrismaClient,
  contrasenas: ServicioContrasenas,
  o: {
    organizacion: string;
    fecha: string;
    horasTemporal?: number;
    /** Dominio de los correos de acceso (el correo es único en toda la base: otra organización DEMO usa otro dominio). */
    dominioCorreo?: string;
  },
): Promise<ResumenCargaClientes> {
  const org = await db.organizacion.findUnique({ where: { codigo: o.organizacion }, select: { id: true, esDemo: true } });
  if (!org) throw new ErrorCargaClientes(`No existe la organización ${o.organizacion}.`);
  if (!org.esDemo) throw new ErrorCargaClientes("Solo se cargan clientes de presentación en una organización DEMO.");
  const parametros = await db.parametrosCalculo.findUnique({ where: { organizacionId: org.id }, select: { ambiente: true } });
  if (parametros?.ambiente !== "DEMO") throw new ErrorCargaClientes("Los parámetros de la organización deben estar en ambiente DEMO.");

  const persona = async (funcion: string): Promise<string> => {
    const m = await db.membresia.findFirst({ where: { organizacionId: org.id, activa: true, funciones: { has: funcion }, usuario: { activo: true } }, select: { usuarioId: true }, orderBy: { creadaEn: "asc" } });
    if (!m) throw new ErrorCargaClientes(`Falta una cuenta activa con la función ${funcion}: cargue primero las cuentas DEMO (db:cargar-usuarios-demo).`);
    return m.usuarioId;
  };
  const preparador = await persona("PREPARADOR");
  const adminCatalogo = await persona("ADMIN_CATALOGO");
  const adminSistema = await persona("ADMIN_SISTEMA");
  const resumen = {
    trabajosGuardados: [] as string[],
    referenciasDesignadas: [] as string[],
    referenciasConservadas: [] as string[],
    clientesCreados: [] as string[],
    proyectosCreados: [] as string[],
    accesosCreados: [] as CredencialCliente[],
    accesosConservados: [] as string[],
  };

  // ------------------------------- trabajos para clientes -------------------------------
  for (const t of TRABAJOS_DEMO) {
    const actual = await db.trabajoCliente.findUnique({
      where: { organizacionId_codigo: { organizacionId: org.id, codigo: t.codigo } },
      include: { opciones: { include: { concepto: { select: { codigo: true } } } } },
    });
    const igual =
      actual !== null &&
      actual.activo &&
      actual.nombre === t.nombre &&
      t.opciones.every((p) => {
        const x = actual.opciones.find((q) => q.codigo === p.codigo);
        return x !== undefined && x.activa && x.concepto.codigo === p.conceptoCodigo && mismasMedidas(x.medidas, p.medidas);
      });
    if (igual) continue;
    const datos = { ...t, activo: true, opciones: t.opciones.map((p) => ({ ...p, activa: true })), motivo: "Carga de presentación (módulo 17)" };
    await db.$queryRaw`SELECT softarq_guardar_trabajo_cliente(${org.id}::uuid, ${adminCatalogo}::uuid, ${JSON.stringify(datos)}::jsonb)::text AS id`;
    resumen.trabajosGuardados.push(t.codigo);
  }

  // ------------------------------- precios de referencia -------------------------------
  const precios = await db.precio.findMany({
    where: { organizacionId: org.id, codigo: { in: [...PRECIOS_DE_REFERENCIA_DEMO] } },
    select: { id: true, codigo: true, producto: { select: { insumoId: true, insumo: { select: { codigo: true } } } } },
  });
  for (const p of precios) {
    const activa = await db.referenciaEstimacion.findFirst({ where: { organizacionId: org.id, insumoId: p.producto.insumoId, retiradaEn: null }, select: { id: true } });
    if (activa) {
      resumen.referenciasConservadas.push(p.producto.insumo.codigo);
      continue;
    }
    await db.$queryRaw`SELECT softarq_designar_referencia(${org.id}::uuid, ${adminCatalogo}::uuid, ${p.producto.insumoId}::uuid, ${p.id}::uuid, ${o.fecha}::date, ${"Precio de referencia de presentación (módulo 17)"})::text AS id`;
    resumen.referenciasDesignadas.push(p.producto.insumo.codigo);
  }

  // ------------------------------- clientes, proyectos y accesos -------------------------------
  const horas = o.horasTemporal ?? 72;
  const correoDe = (c: ClienteDemo): string => (o.dominioCorreo ? c.acceso.correo.replace("@clientes.softarq.test", `@${o.dominioCorreo}`) : c.acceso.correo);
  for (const c of CLIENTES_DEMO) {
    let cliente = await db.cliente.findFirst({ where: { organizacionId: org.id, nombre: c.nombre }, select: { id: true, revision: true } });
    if (!cliente) {
      const idem = randomUUID();
      const datos = { nombre: c.nombre, contactoNombre: c.contactoNombre, contactoTelefono: c.contactoTelefono, contactoCorreo: c.contactoCorreo };
      const filas = await db.$queryRaw<{ id: string }[]>`
        SELECT softarq_crear_cliente(${org.id}::uuid, ${preparador}::uuid, ${JSON.stringify(datos)}::jsonb, ${idem}::uuid, 'crear_cliente', ${huella(`cliente:${c.nombre}`)}, ${new Date(Date.now() + 86_400_000)}::timestamptz)::text AS id`;
      cliente = { id: filas[0]!.id, revision: 0 };
      resumen.clientesCreados.push(c.nombre);
    }
    for (const p of c.proyectos) {
      const existe = await db.proyecto.findFirst({ where: { organizacionId: org.id, clienteId: cliente.id, nombre: p.nombre }, select: { id: true } });
      if (existe) continue;
      await db.$queryRaw`
        SELECT softarq_crear_proyecto(${org.id}::uuid, ${preparador}::uuid, ${cliente.id}::uuid, ${JSON.stringify(p)}::jsonb, ${randomUUID()}::uuid, 'crear_proyecto',
          ${huella(`proyecto:${c.nombre}:${p.nombre}`)}, ${new Date(Date.now() + 86_400_000)}::timestamptz)::text AS id`;
      resumen.proyectosCreados.push(p.nombre);
    }
    const acceso = await db.accesoCliente.findFirst({ where: { organizacionId: org.id, clienteId: cliente.id }, select: { id: true } });
    if (acceso) {
      resumen.accesosConservados.push(correoDe(c));
      continue;
    }
    const temporal = generarContrasena();
    const hash = await contrasenas.crearHash(temporal);
    const expira = new Date(Date.now() + horas * 3_600_000);
    const datos = { correo: correoDe(c), nombre: c.acceso.nombre, motivo: "Acceso de presentación (módulo 17)" };
    await db.$queryRaw`SELECT softarq_crear_acceso_cliente(${org.id}::uuid, ${adminSistema}::uuid, ${cliente.id}::uuid, ${JSON.stringify(datos)}::jsonb, ${hash}, ${expira}::timestamptz)::text AS id`;
    resumen.accesosCreados.push({ correo: datos.correo, nombre: c.acceso.nombre, cliente: c.nombre, contrasena: temporal });
  }
  return resumen;
}
