/** Migraciones sobre base vacía y permisos de los roles (solo softarq_test). */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RAIZ_API, confirmarBase, prismaApp } from "./entorno.js";

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

  it("no tiene atributos privilegiados", async () => {
    const filas = await app.$queryRaw<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(filas[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  });
});
