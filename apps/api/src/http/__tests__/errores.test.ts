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
      // Módulo 17 (ADR-0021): cliente externo, solicitudes, referencias de estimación y trabajos para clientes.
      "/api/v1/admin/accesos-cliente/{usuarioId}/contrasena",
      "/api/v1/admin/accesos-cliente/{usuarioId}/estado",
      "/api/v1/admin/conceptos",
      "/api/v1/admin/conceptos/{codigo}",
      "/api/v1/admin/conceptos/{codigo}/aprobacion",
      "/api/v1/admin/conceptos/{codigo}/componentes",
      "/api/v1/admin/conceptos/{codigo}/componentes/{componente}",
      "/api/v1/admin/conceptos/{codigo}/tarifa",
      "/api/v1/admin/insumos",
      "/api/v1/admin/insumos/{codigo}",
      "/api/v1/admin/insumos/{codigo}/conversiones",
      "/api/v1/admin/insumos/{codigo}/conversiones/{unidad}",
      "/api/v1/admin/parametros",
      "/api/v1/admin/personas",
      "/api/v1/admin/personas/{id}",
      "/api/v1/admin/personas/{id}/restablecimiento",
      "/api/v1/admin/precios",
      "/api/v1/admin/precios/{codigo}",
      "/api/v1/admin/precios/{codigo}/anulacion",
      "/api/v1/admin/precios/{codigo}/cierre-vigencia",
      "/api/v1/admin/productos",
      "/api/v1/admin/productos/{codigo}",
      "/api/v1/admin/proveedores",
      "/api/v1/admin/proveedores/{codigo}",
      "/api/v1/admin/referencias-estimacion",
      "/api/v1/admin/referencias-estimacion/{codigo}",
      "/api/v1/admin/referencias-estimacion/{codigo}/retiro",
      "/api/v1/admin/tarifas",
      "/api/v1/admin/tarifas/{codigo}",
      "/api/v1/admin/tipos-estructura",
      "/api/v1/admin/tipos-estructura/{codigo}",
      "/api/v1/admin/trabajos-cliente",
      "/api/v1/admin/unidades",
      "/api/v1/auth/contrasena",
      "/api/v1/auth/csrf",
      "/api/v1/auth/movil/sesion",
      "/api/v1/auth/sesion",
      "/api/v1/calculos/demo",
      "/api/v1/catalogos/conceptos",
      "/api/v1/catalogos/opciones-precio",
      "/api/v1/catalogos/tipos-adicional",
      "/api/v1/cliente/cotizaciones",
      "/api/v1/cliente/cotizaciones/{id}",
      "/api/v1/cliente/cotizaciones/{id}/documento",
      "/api/v1/cliente/proyectos",
      "/api/v1/cliente/solicitudes",
      "/api/v1/cliente/solicitudes/{id}",
      "/api/v1/cliente/solicitudes/{id}/envio",
      "/api/v1/cliente/solicitudes/{id}/estimaciones",
      "/api/v1/cliente/solicitudes/{id}/retiro",
      "/api/v1/cliente/trabajos",
      "/api/v1/clientes",
      "/api/v1/clientes/{id}",
      "/api/v1/clientes/{id}/acceso",
      "/api/v1/clientes/{id}/clasificacion",
      "/api/v1/cotizaciones",
      "/api/v1/cotizaciones/contadores",
      "/api/v1/cotizaciones/{id}",
      "/api/v1/cotizaciones/{id}/borrador",
      "/api/v1/cotizaciones/{id}/descarte",
      "/api/v1/cotizaciones/{id}/duplicados",
      "/api/v1/cotizaciones/{id}/nueva-version",
      "/api/v1/cotizaciones/{id}/versiones",
      "/api/v1/cotizaciones/{id}/versiones/{numero}",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/emision",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/emision/validacion",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/excepciones",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/revisiones",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/salidas-internas",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/verificacion",
      "/api/v1/cotizaciones/{id}/versiones/{numero}/vista-previa",
      "/api/v1/emisiones/{id}",
      "/api/v1/emisiones/{id}/documento",
      "/api/v1/emisiones/{id}/respuestas",
      "/api/v1/emisiones/{id}/respuestas/{eventoId}/correcciones",
      "/api/v1/emisiones/{id}/seguimiento",
      "/api/v1/emisor",
      "/api/v1/excepciones/componentes",
      "/api/v1/exportaciones",
      "/api/v1/exportaciones/manifiesto",
      "/api/v1/exportaciones/{tabla}",
      "/api/v1/openapi.json",
      "/api/v1/proyectos",
      "/api/v1/proyectos/{id}",
      "/api/v1/revisiones",
      "/api/v1/revisiones/{id}",
      "/api/v1/revisiones/{id}/anulacion",
      "/api/v1/revisiones/{id}/decision",
      "/api/v1/revisiones/{id}/excepciones/{numero}/decision",
      "/api/v1/revisiones/{id}/retiro",
      "/api/v1/solicitudes",
      "/api/v1/solicitudes/{id}",
      "/api/v1/solicitudes/{id}/atencion",
      "/health",
    ]);
    // Módulo 8 (ADR-0010).
    // Módulo 9 añade tres rutas documentadas sin retirar endpoints anteriores.
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["SeguimientoEmision", "EventoRespuestaCliente", "RegistroRespuesta", "CorreccionRespuesta"]));
    // Módulo 11 (ADR-0015) añade 14 rutas internas /admin y la verificación de una versión, sin retirar ninguna.
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["ProveedorAdmin", "ProductoAdmin", "PrecioAdmin", "TarifaAdmin", "CierreVigenciaPrecio", "AsignacionTarifa", "VerificacionRevision"]),
    );
    // Módulo 10 (ADR-0014) añade tres rutas internas de excepciones, sin retirar ninguna.
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["ExcepcionesVersion", "DecisionExcepcion", "RespuestaComponentesExcepcion"]));
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["SolicitudEmision", "ValidacionEmision", "DetalleEmision", "Emisor", "AnulacionAprobacion", "DescarteCotizacion"]),
    );
    expect(Object.keys(doc.components.schemas)).toContain("SolicitudCalculoDemo");
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["CapturaBorrador", "SolicitudBorrador", "SolicitudVersion", "Version", "DetalleCotizacion"]),
    );
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["SolicitudAcceso", "RespuestaSesion", "RespuestaCsrf"]));
  });

  it("administración de catálogos (ADR-0015): escrituras con CSRF e idempotencia; sin campos internos en el contrato comercial", () => {
    const d = doc as unknown as {
      paths: Record<string, Record<string, { security?: unknown; parameters?: { name: string; in: string; required: boolean }[] }>>;
    };
    const conClave: [string, string][] = [
      ["/api/v1/admin/proveedores", "post"],
      ["/api/v1/admin/productos", "post"],
      ["/api/v1/admin/precios", "post"],
      ["/api/v1/admin/precios/{codigo}/anulacion", "post"],
      ["/api/v1/admin/precios/{codigo}/cierre-vigencia", "post"],
      ["/api/v1/admin/tarifas", "post"],
      ["/api/v1/admin/conceptos/{codigo}/tarifa", "post"],
    ];
    for (const [ruta, metodo] of conClave) {
      const op = d.paths[ruta]?.[metodo];
      expect(op?.security, `${metodo} ${ruta}`).toEqual([{ cookieSesion: [], tokenCsrf: [] }]);
      expect(op?.parameters?.some((p) => p.name === "Idempotency-Key" && p.in === "header" && p.required), `${metodo} ${ruta}`).toBe(true);
    }
    for (const ruta of ["/api/v1/admin/proveedores/{codigo}", "/api/v1/admin/productos/{codigo}", "/api/v1/admin/tarifas/{codigo}"]) {
      expect(d.paths[ruta]?.["patch"]?.security).toEqual([{ cookieSesion: [], tokenCsrf: [] }]);
    }
    // La proyección comercial, la versión y la verificación siguen sin datos de proveedor, presentación ni tarifas.
    for (const esquema of ["Version", "DetalleCotizacion", "VerificacionRevision"]) {
      expect(JSON.stringify(doc.components.schemas[esquema]), esquema).not.toMatch(/rendimientoJornada|"contenido"|motivoAnulacion|"fuente"|proveedor|incrementoMinimo/i);
    }
    // Módulo 14 (ADR-0018): el contrato interno de salidas existe aparte; los comerciales no lo incluyen.
    expect(Object.keys(doc.components.schemas)).toContain("SalidasInternasVersion");
    for (const esquema of ["Version", "DetalleCotizacion", "VerificacionRevision", "DetalleEmision", "RespuestaCalculoDemo"]) {
      expect(JSON.stringify(doc.components.schemas[esquema]), esquema).toBeDefined();
      expect(JSON.stringify(doc.components.schemas[esquema]), esquema).not.toMatch(/costoProrrateado|costoCompra|margenSobrePrecio|recargoSobreCosto|sobrante|referenciasInternas/);
    }
    // Las opciones de precio del Preparador muestran proveedor y presentación, nunca el importe de compra.
    expect(JSON.stringify(doc.components.schemas["RespuestaOpcionesPrecio"])).not.toMatch(/precioUnitario|rendimientoJornada|"contenido"|motivoAnulacion|"fuente"/);
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

  it("canal móvil (ADR-0020): Bearer sin CSRF; el token solo en la respuesta del acceso y nunca un CSRF ni un hash", () => {
    const d = doc as unknown as {
      paths: Record<string, Record<string, { security?: unknown }>>;
      components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
    };
    expect(d.components.securitySchemes["tokenMovil"]).toMatchObject({ type: "http", scheme: "bearer" });
    expect(d.paths["/api/v1/auth/movil/sesion"]?.["post"]?.security).toEqual([]);
    expect(d.paths["/api/v1/auth/movil/sesion"]?.["get"]?.security).toEqual([{ tokenMovil: [] }]);
    expect(JSON.stringify(d.components.schemas["RespuestaAccesoMovil"])).toContain("tokenSesion");
    expect(JSON.stringify(d.components.schemas["RespuestaSesionMovil"])).not.toMatch(/tokenSesion|csrfToken|token_hash|hashContrasena/);
    expect(JSON.stringify(d.components.schemas["RespuestaAccesoMovil"])).not.toMatch(/csrfToken|token_hash|hashContrasena/);
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
      // Módulo 15 (ADR-0019): duplicar, preparar la versión nueva y vista previa (auditoría).
      ["/api/v1/cotizaciones/{id}/duplicados", "post"],
      ["/api/v1/cotizaciones/{id}/nueva-version", "post"],
      ["/api/v1/cotizaciones/{id}/versiones/{numero}/vista-previa", "post"],
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
      "/api/v1/revisiones/{id}/excepciones/{numero}/decision",
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
