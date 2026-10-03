/** Mapeo de errores a HTTP y documento OpenAPI (sin base de datos). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpException, NotFoundException } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";
import { ErrorApi, errorDeValidacion, esBaseDeDatosNoDisponible, traducirError } from "../errores.js";
import { construirDocumentoOpenApi } from "../openapi.js";

describe("traducirError", () => {
  const caso = (e: unknown) => {
    const t = traducirError(e);
    return [t.estadoHttp, t.codigo, t.message] as const;
  };

  it("conserva ErrorApi", () => {
    expect(caso(new ErrorApi(422, "CALCULO_BLOQUEADO", "x"))).toEqual([422, "CALCULO_BLOQUEADO", "x"]);
  });
  it("cuerpo excesivo (body-parser) → 413", () => {
    expect(caso(Object.assign(new Error("request entity too large"), { type: "entity.too.large", status: 413 }))[0]).toBe(413);
  });
  it("limitador → 429", () => {
    expect(caso(new ThrottlerException())[1]).toBe("DEMASIADAS_SOLICITUDES");
  });
  it("ruta inexistente → 404 sin el mensaje original", () => {
    expect(caso(new NotFoundException("Cannot GET /api/v1/x"))).toEqual([404, "NO_ENCONTRADO", "Recurso no encontrado."]);
  });
  it.each([
    ["Prisma P1001", Object.assign(new Error("Can't reach database server at 127.0.0.1:1"), { code: "P1001" })],
    ["ECONNREFUSED en la causa", new Error("x", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) })],
    ["AggregateError con ECONNREFUSED", Object.assign(new Error("agg"), { errors: [{ code: "ECONNREFUSED" }] })],
    ["PostgreSQL 57P01", Object.assign(new Error("terminating"), { code: "57P01" })],
    ["adaptador DatabaseNotReachable", Object.assign(new Error("x"), { cause: { kind: "DatabaseNotReachable" } })],
  ])("%s → 503 genérico", (_n, e) => {
    expect(esBaseDeDatosNoDisponible(e)).toBe(true);
    expect(caso(e)).toEqual([503, "SERVICIO_NO_DISPONIBLE", "El servicio no está disponible temporalmente."]);
  });
  it("cualquier otro error → 500 sin detalles internos", () => {
    const t = traducirError(new Error("SELECT * FROM precio WHERE … password=abc at D:\\ruta\\archivo.ts"));
    expect([t.estadoHttp, t.codigo, t.message]).toEqual([500, "ERROR_INTERNO", "Error interno del servidor."]);
  });
  it("otros 4xx de Nest no exponen su mensaje", () => {
    expect(caso(new HttpException("detalle técnico", 400))).toEqual([400, "SOLICITUD_INVALIDA", "Solicitud inválida."]);
  });
});

describe("errorDeValidacion", () => {
  it("convierte las rutas de Standard Schema a texto legible", () => {
    const e = errorDeValidacion([
      { message: "Requerido", path: ["partidas", 0, "mediciones", 2, "alto"] },
      { message: "Llave desconocida", path: [{ key: "extra" }] },
      { message: "Raíz" },
    ]);
    expect(e.estadoHttp).toBe(400);
    expect(e.detalles.campos).toEqual([
      { ruta: "partidas[0].mediciones[2].alto", mensaje: "Requerido" },
      { ruta: "extra", mensaje: "Llave desconocida" },
      { ruta: "(cuerpo)", mensaje: "Raíz" },
    ]);
  });
});

describe("OpenAPI", () => {
  const doc = construirDocumentoOpenApi() as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };

  it("documenta todos los endpoints y esquemas", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/sesion",
      "/api/v1/calculos/demo",
      "/api/v1/catalogos/conceptos",
      "/api/v1/catalogos/opciones-precio",
      "/api/v1/catalogos/tipos-adicional",
      "/api/v1/clientes",
      "/api/v1/clientes/{id}",
      "/api/v1/cotizaciones",
      "/api/v1/cotizaciones/{id}",
      "/api/v1/cotizaciones/{id}/borrador",
      "/api/v1/cotizaciones/{id}/versiones",
      "/api/v1/cotizaciones/{id}/versiones/{numero}",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/revisiones",
      "/api/v1/openapi.json",
      "/api/v1/proyectos",
      "/api/v1/proyectos/{id}",
      "/api/v1/revisiones",
      "/api/v1/revisiones/{id}",
      "/api/v1/revisiones/{id}/decision",
      "/api/v1/revisiones/{id}/retiro",
      "/health",
    ]);
    expect(Object.keys(doc.components.schemas)).toContain("SolicitudCalculoDemo");
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["CapturaBorrador", "SolicitudBorrador", "SolicitudVersion", "Version", "DetalleCotizacion"]),
    );
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["SolicitudAcceso", "RespuestaSesion", "RespuestaCsrf"]));
  });

  it("documenta la seguridad: cookie de sesión por omisión y rutas públicas sin seguridad (ADR-0007)", () => {
    const d = doc as unknown as {
      security: unknown;
      paths: Record<string, Record<string, { security?: unknown }>>;
      components: { securitySchemes: Record<string, { in: string; name: string }> };
    };
    expect(d.security).toEqual([{ cookieSesion: [] }]);
    expect(d.components.securitySchemes["cookieSesion"]).toMatchObject({ in: "cookie", name: "softarq_sesion" });
    expect(d.components.securitySchemes["tokenCsrf"]).toMatchObject({ in: "header", name: "X-CSRF-Token" });
    expect(d.paths["/health"]?.["get"]?.security).toEqual([]);
    expect(d.paths["/api/v1/auth/csrf"]?.["get"]?.security).toEqual([]);
    expect(d.paths["/api/v1/calculos/demo"]?.["post"]?.security).toEqual([{ cookieSesion: [], tokenCsrf: [] }]);
    expect(JSON.stringify(doc.components.schemas["RespuestaSesion"])).not.toMatch(/token_hash|hashContrasena|tokenSesion/);
  });

  it("cotizaciones (ADR-0008): escrituras con CSRF, altas con Idempotency-Key y versiones sin datos internos", () => {
    const d = doc as unknown as {
      paths: Record<string, Record<string, { security?: unknown; parameters?: { name: string; in: string; required: boolean }[] }>>;
    };
    const escrituras: [string, string][] = [
      ["/api/v1/clientes", "post"],
      ["/api/v1/clientes/{id}", "patch"],
      ["/api/v1/proyectos", "post"],
      ["/api/v1/proyectos/{id}", "patch"],
      ["/api/v1/cotizaciones", "post"],
      ["/api/v1/cotizaciones/{id}/borrador", "put"],
      ["/api/v1/cotizaciones/{id}/versiones", "post"],
    ];
    for (const [ruta, metodo] of escrituras) {
      expect(d.paths[ruta]?.[metodo]?.security, `${metodo} ${ruta}`).toEqual([{ cookieSesion: [], tokenCsrf: [] }]);
    }
    for (const [ruta, metodo] of escrituras.filter(([, m]) => m === "post")) {
      expect(d.paths[ruta]?.[metodo]?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })]),
      );
    }
    const version = JSON.stringify(doc.components.schemas["Version"]);
    expect(version).not.toMatch(/entradaCalculo|resultadoInterno|costoDirecto|recargo|margen|precioCompra|proveedor/i);
  });

  it("revisiones (ADR-0009): escrituras con CSRF e Idempotency-Key; respuestas sin datos internos ni identidad en los cuerpos", () => {
    const d = doc as unknown as {
      paths: Record<string, Record<string, { security?: unknown; parameters?: { name: string; in: string; required: boolean }[] }>>;
    };
    for (const ruta of [
      "/api/v1/cotizaciones/{id}/versiones/{numero}/revisiones",
      "/api/v1/revisiones/{id}/decision",
      "/api/v1/revisiones/{id}/retiro",
    ]) {
      expect(d.paths[ruta]?.["post"]?.security, ruta).toEqual([{ cookieSesion: [], tokenCsrf: [] }]);
      expect(d.paths[ruta]?.["post"]?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })]),
      );
    }
    for (const nombre of ["SolicitudEnvioRevision", "DecisionRevision", "RetiroRevision"]) {
      const s = JSON.stringify(doc.components.schemas[nombre]);
      expect(s).toContain('"additionalProperties":false');
      expect(s).not.toMatch(/preparador|revisor|aprobador|organizacion|usuario/i);
    }
    expect(JSON.stringify(doc.components.schemas["DetalleRevision"])).not.toMatch(
      /entradaCalculo|resultadoInterno|costoDirecto|recargo|margen|precioCompra|proveedor/i,
    );
  });

  it("docs/api/openapi.json está alineado con los contratos (regenerar con openapi:generar)", () => {
    const archivo = join(import.meta.dirname, "..", "..", "..", "..", "..", "docs", "api", "openapi.json");
    expect(JSON.parse(readFileSync(archivo, "utf8"))).toEqual(doc);
  });

  it("la solicitud documentada no admite campos adicionales", () => {
    expect(JSON.stringify(doc.components.schemas["SolicitudCalculoDemo"])).toContain('"additionalProperties":false');
  });
});
