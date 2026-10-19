/** Migraciones sobre base vacía y permisos de los roles (solo softarq_test). */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { crearPrisma } from "../infraestructura/prisma/cliente.js";
import { RAIZ_API, confirmarBase, prismaApp, urlDePrueba } from "./entorno.js";

const app = prismaApp();
afterAll(() => app.$disconnect());

/** Funciones SECURITY DEFINER previstas (ADR-0017): propietario migrador y `search_path` fijo. */
const DEFINER = [
  "softarq_aprobar_carga_base",
  "softarq_aprobar_concepto",
  // Módulo 13: identidad (la aplicación no escribe `usuario` ni `membresia`).
  "softarq_cambiar_contrasena_propia",
  "softarq_crear_persona",
  "softarq_editar_persona",
  "softarq_restablecer_contrasena",
];
/** Ayudantes internos de las funciones de identidad: la aplicación no los ejecuta (módulo 13). */
const INTERNAS = ["softarq_hay_administrador", "softarq_validar_funciones"];

describe("migraciones (globalSetup: esquema vaciado y migrate deploy)", () => {
  it("la conexión de la aplicación está en softarq_test", async () => {
    await confirmarBase(app);
  });

  it("prisma migrate status: base al día con el historial versionado", () => {
    const cli = join(RAIZ_API, "node_modules", "prisma", "build", "index.js");
    const r = spawnSync(process.execPath, [cli, "migrate", "status"], {
      cwd: RAIZ_API,
      encoding: "utf8",
      env: { ...process.env, SOFTARQ_ENV_FILE: ".env.test", CHECKPOINT_DISABLE: "1" },
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/up to date/i);
  });

  it("schema.prisma coincide con la base migrada (sin deriva: una migración nueva no arrastra cambios ajenos)", () => {
    // Regresión (módulo 10): las FK de respuesta_cliente_evento no tenían `map:` y `migrate dev`
    // proponía renombrarlas en la migración siguiente.
    const cli = join(RAIZ_API, "node_modules", "prisma", "build", "index.js");
    const r = spawnSync(
      process.execPath,
      [cli, "migrate", "diff", "--from-config-datasource", "--to-schema", join("prisma", "schema.prisma"), "--exit-code"],
      { cwd: RAIZ_API, encoding: "utf8", env: { ...process.env, SOFTARQ_ENV_FILE: ".env.test", CHECKPOINT_DISABLE: "1" } },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("la referencia común de unidades se cargó con la migración (15 de modBuild)", async () => {
    const unidades = await app.unidad.findMany({ orderBy: { clave: "asc" } });
    expect(unidades).toHaveLength(15);
    expect(unidades.find((u) => u.clave === "m2")).toEqual({ clave: "m2", nombre: "Metro cuadrado", magnitud: "area" });
  });
});

describe("permisos del rol de la aplicación (softarq_app)", () => {
  it("no puede ejecutar DDL", async () => {
    await expect(app.$executeRawUnsafe("CREATE TABLE prueba_ddl (id integer)")).rejects.toThrow();
  });

  it("no puede borrar registros (los catálogos se desactivan o anulan)", async () => {
    await expect(app.insumo.deleteMany({ where: { codigo: "NO-EXISTE" } })).rejects.toThrow();
  });

  it("no puede leer ni alterar el historial de migraciones", async () => {
    await expect(app.$queryRawUnsafe('SELECT count(*) FROM "_prisma_migrations"')).rejects.toThrow();
  });

  it("no puede modificar la referencia común de unidades", async () => {
    await expect(
      app.unidad.create({ data: { clave: "zz", nombre: "Prueba", magnitud: "conteo" } }),
    ).rejects.toThrow();
  });

  describe("identidad y sesiones (ADR-0007)", () => {
    const ahora = new Date();
    const sesionPrevia = () => ({
      tipo: "PREVIA",
      tokenHash: new Uint8Array(randomBytes(32)),
      creadaEn: ahora,
      ultimaActividadEn: ahora,
      expiraEn: new Date(ahora.getTime() + 60_000),
    });

    it("no puede crear ni modificar usuarios ni pertenencias", async () => {
      await expect(
        app.usuario.create({ data: { correo: "intruso@softarq.test", nombre: "x", hashContrasena: "$argon2id$v=19$m=1", esDemo: true } }),
      ).rejects.toThrow();
      await expect(app.usuario.updateMany({ data: { activo: true } })).rejects.toThrow();
      await expect(app.membresia.updateMany({ data: { funciones: ["PREPARADOR"] } })).rejects.toThrow();
      await expect(app.$executeRawUnsafe("INSERT INTO membresia (organizacion_id, usuario_id, funciones) VALUES (gen_random_uuid(), gen_random_uuid(), ARRAY['PREPARADOR'])")).rejects.toThrow();
    });

    it("puede leer usuarios y pertenencias (resolución de la sesión)", async () => {
      await expect(app.usuario.count()).resolves.toBeGreaterThanOrEqual(0);
      await expect(app.membresia.count()).resolves.toBeGreaterThanOrEqual(0);
    });

    it("en sesión: inserta y actualiza solo actividad y revocación; no borra ni cambia el hash ni la expiración", async () => {
      const s = await app.sesion.create({ data: sesionPrevia(), select: { id: true } });
      await expect(app.sesion.update({ where: { id: s.id }, data: { ultimaActividadEn: ahora } })).resolves.toBeTruthy();
      await expect(app.sesion.update({ where: { id: s.id }, data: { tokenHash: new Uint8Array(randomBytes(32)) } })).rejects.toThrow();
      await expect(app.sesion.update({ where: { id: s.id }, data: { expiraEn: new Date(ahora.getTime() + 3_600_000) } })).rejects.toThrow();
      await expect(app.sesion.update({ where: { id: s.id }, data: { revocadaEn: ahora, motivoRevocacion: "CIERRE" } })).resolves.toBeTruthy();
      await expect(app.sesion.deleteMany({ where: { id: s.id } })).rejects.toThrow();
    });

    it("las restricciones de la base rechazan hashes que no son Argon2id y sesiones incoherentes", async () => {
      const migrador = crearPrisma(urlDePrueba("MIGRATION_DATABASE_URL"));
      try {
        await expect(
          migrador.usuario.create({ data: { correo: "claro@softarq.test", nombre: "x", hashContrasena: "contraseña-en-claro", esDemo: true } }),
        ).rejects.toThrow(/usuario_hash_argon2id_ck/);
        await expect(
          migrador.usuario.create({ data: { correo: "Mayus@Softarq.test", nombre: "x", hashContrasena: "$argon2id$v=19$m=65536,t=3,p=4$x", esDemo: true } }),
        ).rejects.toThrow(/usuario_correo_normalizado_ck/);
        await expect(app.sesion.create({ data: { ...sesionPrevia(), tokenHash: new Uint8Array(16) } })).rejects.toThrow(/sesion_token_hash_ck/);
        await expect(app.sesion.create({ data: { ...sesionPrevia(), tipo: "USUARIO" } })).rejects.toThrow(/sesion_tipo_titular_ck/);
      } finally {
        await migrador.$disconnect();
      }
    });
  });

  describe("revisiones (ADR-0009)", () => {
    it("historial solo SELECT/INSERT; revisión con UPDATE solo de las columnas de la transición; sin DELETE", async () => {
      const tablas = await app.$queryRaw<{ tabla: string; privilegio: string }[]>`
        SELECT table_name AS tabla, privilege_type AS privilegio FROM information_schema.role_table_grants
         WHERE grantee = 'softarq_app' AND table_name IN ('revision', 'revision_evento')
         ORDER BY 1, 2`;
      expect(tablas).toEqual([
        { tabla: "revision", privilegio: "INSERT" },
        { tabla: "revision", privilegio: "SELECT" },
        { tabla: "revision_evento", privilegio: "INSERT" },
        { tabla: "revision_evento", privilegio: "SELECT" },
      ]);
      const columnas = await app.$queryRaw<{ tabla: string; columna: string }[]>`
        SELECT table_name AS tabla, column_name AS columna FROM information_schema.column_privileges
         WHERE grantee = 'softarq_app' AND privilege_type = 'UPDATE' AND table_name IN ('revision', 'revision_evento')
         ORDER BY 1, 2`;
      expect(columnas).toEqual(
        ["estado", "observaciones", "resuelta_en", "resuelta_por", "revision"].map((columna) => ({ tabla: "revision", columna })),
      );
    });
  });

  describe("cotizaciones (ADR-0008)", () => {
    it("versiones, bitácora e idempotencia: solo SELECT e INSERT; sin UPDATE ni DELETE", async () => {
      const filas = await app.$queryRaw<{ tabla: string; privilegio: string }[]>`
        SELECT table_name AS tabla, privilege_type AS privilegio FROM information_schema.role_table_grants
         WHERE grantee = 'softarq_app' AND table_name IN ('cotizacion_version', 'bitacora', 'idempotencia')
         ORDER BY 1, 2`;
      expect(filas).toEqual(
        ["bitacora", "cotizacion_version", "idempotencia"].flatMap((tabla) => [
          { tabla, privilegio: "INSERT" },
          { tabla, privilegio: "SELECT" },
        ]),
      );
    });

    it("en las demás tablas, UPDATE solo de columnas editables (nunca id, código, folio ni organización)", async () => {
      const filas = await app.$queryRaw<{ tabla: string; columna: string }[]>`
        SELECT table_name AS tabla, column_name AS columna FROM information_schema.column_privileges
         WHERE grantee = 'softarq_app' AND privilege_type = 'UPDATE'
           AND table_name IN ('cliente', 'proyecto', 'cotizacion', 'cotizacion_borrador', 'contador')
         ORDER BY 1, 2`;
      const porTabla = (t: string) => filas.filter((f) => f.tabla === t).map((f) => f.columna);
      // Módulo 8: el descarte escribe estado_folio y sus tres datos (un trigger limita la transición).
      expect(porTabla("cotizacion")).toEqual(["descartada_en", "descartada_por", "estado_folio", "motivo_descarte", "ultima_version"]);
      expect(porTabla("contador")).toEqual(["ultimo"]);
      // Módulo 15 (ADR-0019): además, las columnas del ciclo de la versión nueva (B-34).
      expect(porTabla("cotizacion_borrador")).toEqual([
        "actualizado_en",
        "actualizado_por",
        "captura",
        "ciclo_modo_precios",
        "ciclo_motivo",
        "ciclo_preparado_en",
        "ciclo_preparado_por",
        "ciclo_version_origen",
        "revision",
      ]);
      // Módulo 8: contacto del cliente (BL-01).
      expect(porTabla("cliente")).toEqual([
        "activo",
        "contacto_correo",
        "contacto_nombre",
        "contacto_telefono",
        "modificado_en",
        "modificado_por",
        "nombre",
        "revision",
      ]);
      expect(porTabla("proyecto")).not.toContain("cliente_id");
      for (const t of ["cliente", "proyecto", "cotizacion"]) {
        for (const prohibida of ["id", "organizacion_id", "codigo", "folio", "creado_por", "creado_en"]) {
          expect(porTabla(t), `${t}.${prohibida}`).not.toContain(prohibida);
        }
      }
    });

    it("catálogos administrados (ADR-0015): UPDATE solo de columnas editables; nunca importe, inicio de vigencia, fuente ni código", async () => {
      const filas = await app.$queryRaw<{ tabla: string; columna: string }[]>`
        SELECT table_name AS tabla, column_name AS columna FROM information_schema.column_privileges
         WHERE grantee = 'softarq_app' AND privilege_type = 'UPDATE'
           AND table_name IN ('proveedor', 'producto', 'precio', 'tarifa_mano_obra')
         ORDER BY 1, 2`;
      const porTabla = (t: string) => filas.filter((f) => f.tabla === t).map((f) => f.columna);
      expect(porTabla("precio")).toEqual(["anulado", "anulado_en", "anulado_por", "motivo_anulacion", "revision", "vigente_hasta"]);
      expect(porTabla("tarifa_mano_obra")).toEqual(["activa", "modificado_en", "modificado_por", "revision"]);
      expect(porTabla("proveedor")).toEqual(["activo", "contacto", "correo", "modificado_en", "modificado_por", "nombre", "revision", "telefono"]);
      expect(porTabla("producto")).toEqual([
        "activo",
        "contenido",
        "descripcion",
        "fraccionable",
        "incremento_minimo",
        "insumo_id",
        "modificado_en",
        "modificado_por",
        "presentacion",
        "revision",
        "unidad_compra",
      ]);
      const [del] = await app.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM information_schema.table_privileges
         WHERE grantee = 'softarq_app' AND privilege_type IN ('DELETE', 'TRUNCATE')
           AND table_name IN ('proveedor', 'producto', 'precio', 'tarifa_mano_obra', 'concepto')`;
      expect(Number(del!.n)).toBe(0);
    });

    it("las funciones de escritura no se pueden ejecutar desde PUBLIC y solo las previstas son SECURITY DEFINER", async () => {
      const filas = await app.$queryRaw<{ nombre: string; definer: boolean; publico: boolean; app: boolean }[]>`
        SELECT p.proname AS nombre, p.prosecdef AS definer,
               has_function_privilege('public', p.oid, 'EXECUTE') AS publico,
               has_function_privilege('softarq_app', p.oid, 'EXECUTE') AS app
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'softarq\\_%' ORDER BY 1`;
      expect(filas.map((f) => f.nombre)).toEqual([
        "softarq_anular_aprobacion",
        // Módulo 11 (ADR-0015): administración de catálogos.
        "softarq_anular_precio",
        // Módulo 12 (ADR-0016): catálogo técnico y aprobación de conceptos (también las altas y ediciones nuevas).
        "softarq_aprobar_carga_base",
        "softarq_aprobar_concepto",
        "softarq_asignar_tarifa_concepto",
        "softarq_cambiar_activa_tarifa",
        // Módulo 13 (ADR-0017): parámetros y personas.
        "softarq_cambiar_contrasena_propia",
        "softarq_cerrar_vigencia_precio",
        "softarq_codigo_catalogo",
        "softarq_crear_cliente",
        "softarq_crear_componente",
        "softarq_crear_concepto",
        "softarq_crear_conversion",
        "softarq_crear_cotizacion",
        "softarq_crear_insumo",
        "softarq_crear_persona",
        "softarq_crear_producto",
        "softarq_crear_proveedor",
        "softarq_crear_proyecto",
        "softarq_crear_tipo_estructura",
        "softarq_crear_version",
        // Módulo 10 (ADR-0014): decisión del Revisor sobre una excepción.
        "softarq_decidir_excepcion",
        "softarq_decidir_revision",
        "softarq_descartar_cotizacion",
        // Módulo 15 (ADR-0019): duplicar, preparar la versión nueva y auditoría de la vista previa.
        "softarq_duplicar_cotizacion",
        "softarq_editar_cliente",
        "softarq_editar_componente",
        "softarq_editar_concepto",
        "softarq_editar_conversion",
        "softarq_editar_insumo",
        "softarq_editar_parametros",
        "softarq_editar_persona",
        "softarq_editar_producto",
        "softarq_editar_proveedor",
        "softarq_editar_proyecto",
        "softarq_editar_tipo_estructura",
        "softarq_emitir_version",
        "softarq_enviar_revision",
        "softarq_exigir_emisor",
        "softarq_exigir_funcion",
        "softarq_guardar_borrador",
        "softarq_guardar_emisor",
        "softarq_hay_administrador",
        "softarq_normalizar",
        "softarq_preparar_nueva_version",
        "softarq_problemas_concepto",
        "softarq_registrar_idempotencia",
        "softarq_registrar_precio",
        "softarq_registrar_respuesta",
        "softarq_registrar_tarifa",
        "softarq_registrar_vista_previa",
        "softarq_requiere_nueva_version",
        "softarq_restablecer_contrasena",
        "softarq_retirar_revision",
        "softarq_siguiente",
        "softarq_ultima_emitida",
        "softarq_validar_funciones",
      ]);
      // ADR-0017 §1.2: solo las funciones de aprobación (y, desde el módulo 13, las de identidad) son
      // SECURITY DEFINER; el resto actúa con los permisos del rol de la aplicación.
      const definer = new Set(DEFINER);
      for (const f of filas) expect(f, f.nombre).toMatchObject({ definer: definer.has(f.nombre), publico: false, app: !INTERNAS.includes(f.nombre) });
    });
  });

  it("no tiene atributos privilegiados", async () => {
    const filas = await app.$queryRaw<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(filas[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  });
});
