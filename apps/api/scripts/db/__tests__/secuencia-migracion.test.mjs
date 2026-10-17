// Migración protegida de softarq_dev (ADR-0017 §1): respaldo → verificación → migración.
// Sin base de datos. El caso con datos reales COPIA el último respaldo a _work\tmp y altera solo la
// copia: los respaldos y documentos reales no se tocan.
import { cpSync, existsSync, mkdtempSync, openSync, closeSync, readSync, writeSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DIR_RESPALDOS_POR_OMISION, DIR_WORK, PATRON_ID } from "../../respaldo/comun.mjs";
import { verificarRespaldo, exigirRespaldoValido } from "../../respaldo/verificar.mjs";
import { ErrorMigracionProtegida, migrarConRespaldo } from "../secuencia-migracion.mjs";

const completo = { ruta: "D:/x/softarq_dev-20261019T000000Z-abcdef", estado: "COMPLETO", problemas: [] };

describe("migración protegida", () => {
  it("crea, verifica y solo entonces migra", async () => {
    const orden = [];
    const r = await migrarConRespaldo({
      crear: async () => (orden.push("crear"), completo),
      verificar: async (c) => orden.push(`verificar ${c}`),
      migrar: () => orden.push("migrar"),
    });
    expect(orden).toEqual(["crear", `verificar ${completo.ruta}`, "migrar"]);
    expect(r.respaldo).toBe(completo.ruta);
  });

  it("si el respaldo no se crea o queda INCOMPLETO, no verifica ni migra", async () => {
    for (const crear of [async () => { throw new Error("pg_dump falló"); }, async () => ({ ...completo, estado: "INCOMPLETO" }), async () => null]) {
      const verificar = vi.fn();
      const migrar = vi.fn();
      await expect(migrarConRespaldo({ crear, verificar, migrar })).rejects.toBeInstanceOf(ErrorMigracionProtegida);
      expect(verificar).not.toHaveBeenCalled();
      expect(migrar).not.toHaveBeenCalled();
    }
  });

  it("si la verificación falla, no migra", async () => {
    const migrar = vi.fn();
    await expect(
      migrarConRespaldo({ crear: async () => completo, verificar: async () => { throw new Error("SHA-256 distinto"); }, migrar }),
    ).rejects.toThrow(/verificación del respaldo previo falló; no se migra/);
    expect(migrar).not.toHaveBeenCalled();
  });

  const ultimo = existsSync(DIR_RESPALDOS_POR_OMISION)
    ? readdirSync(DIR_RESPALDOS_POR_OMISION).filter((n) => PATRON_ID.test(n)).sort().at(-1)
    : undefined;

  it.skipIf(!ultimo)("con la verificación real: una COPIA alterada del último respaldo impide migrar", async () => {
    const tmp = mkdtempSync(join(DIR_WORK, "tmp", "m13-respaldo-"));
    try {
      const copia = join(tmp, ultimo);
      cpSync(join(DIR_RESPALDOS_POR_OMISION, ultimo), copia, { recursive: true });
      expect((await verificarRespaldo(copia)).ok).toBe(true);
      // Altera un byte de la copia de base.dump (mismo tamaño, otro hash).
      const fd = openSync(join(copia, "base.dump"), "r+");
      const b = Buffer.alloc(1);
      readSync(fd, b, 0, 1, 100);
      b[0] = b[0] ^ 0xff;
      writeSync(fd, b, 0, 1, 100);
      closeSync(fd);
      const migrar = vi.fn();
      await expect(
        migrarConRespaldo({ crear: async () => ({ ruta: copia, estado: "COMPLETO" }), verificar: (c) => exigirRespaldoValido(c), migrar }),
      ).rejects.toThrow(/SHA-256 de base\.dump no coincide/);
      expect(migrar).not.toHaveBeenCalled();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
