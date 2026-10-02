/**
 * Escribe docs/api/openapi.json desde los contratos (`pnpm --filter @softarq/api openapi:generar`).
 * Una prueba unitaria exige que el archivo versionado coincida con el documento generado.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { construirDocumentoOpenApi } from "./openapi.js";

const destino = join(import.meta.dirname, "..", "..", "..", "..", "docs", "api", "openapi.json");
mkdirSync(join(destino, ".."), { recursive: true });
writeFileSync(destino, `${JSON.stringify(construirDocumentoOpenApi(), null, 2)}\n`, "utf8");
console.log(`OpenAPI escrito en ${destino}`);
