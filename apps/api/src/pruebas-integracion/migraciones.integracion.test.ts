/** Migraciones sobre base vacía y permisos de los roles (solo softarq_test). */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { crearPrisma } from "../infraestructura/prisma/cliente.js";
import { RAIZ_API, confirmarBase, prismaApp, urlDePrueba } from "./entorno.js";

const app = prismaApp();
afterAll(() => app.$disconnect());

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

  it("no tiene atributos privilegiados", async () => {
    const filas = await app.$queryRaw<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(filas[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  });
});
