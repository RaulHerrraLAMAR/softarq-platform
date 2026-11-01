/**
 * Panel del equipo por tareas (módulo 17, E3) contra la web compilada, la API real y softarq_test.
 *
 * Recorrido: un cliente (con la sesión móvil real de la API, como lo haría la app) envía una solicitud → el Preparador la ve en
 * «Mi trabajo» y en la bandeja → la atiende → llega a su cotización en borrador, SIN precios elegidos ni estimación heredada.
 * También: el Administrador del sistema crea el acceso de un cliente desde su ficha y la contraseña temporal se ve una sola vez.
 *
 * Pruebas de navegador AUTOMATIZADAS: no equivalen a la revisión personal del propietario. El resto del flujo (precios, revisión
 * por otra persona, aprobación, emisión y consulta del PDF desde la cuenta del cliente) lo cubren `revisiones`, `emision` y la
 * integración `app-cliente.integracion`.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { URL_API_E2E, abrirConSesion, cuentasE2E, type CuentaE2E } from "./apoyo.ts";

const ORIGEN = "http://localhost:4173";
const CARPETA_E3 = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "e3");
/** Captura de evidencia visual del panel (se revisa a mano o con el visor de imágenes; no certifica nada por sí sola). */
async function evidencia(p: Page, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_E3, { recursive: true });
  await p.screenshot({ path: join(CARPETA_E3, `${nombre}.png`), fullPage: completa });
}
const sufijo = () => Math.random().toString(36).slice(2, 7);

/** Cliente HTTP de una persona del equipo: el mismo flujo que el navegador (cookie, CSRF y origen permitido). */
async function sesionEquipo(cuenta: CuentaE2E) {
  const api: APIRequestContext = await playwrightRequest.newContext({ baseURL: URL_API_E2E });
  const previa = await api.get("/api/v1/auth/csrf");
  const csrfPrevio = ((await previa.json()) as { csrfToken: string }).csrfToken;
  const r = await api.post("/api/v1/auth/sesion", { headers: { Origin: ORIGEN, "X-CSRF-Token": csrfPrevio }, data: { correo: cuenta.correo, contrasena: cuenta.contrasena } });
  expect(r.status(), "acceso del equipo").toBe(200);
  const csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
  const enviar = async <T,>(metodo: "POST" | "PUT", ruta: string, cuerpo: unknown, estadoEsperado: number): Promise<T> => {
    const res = await api.fetch(ruta, { method: metodo, headers: { Origin: ORIGEN, "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() }, data: cuerpo });
    expect(res.status(), `${metodo} ${ruta}`).toBe(estadoEsperado);
    return (await res.json()) as T;
  };
  return { api, post: <T,>(ruta: string, cuerpo: unknown, estado = 201) => enviar<T>("POST", ruta, cuerpo, estado), cerrar: () => api.dispose() };
}

/** Cliente ficticio con acceso a la app y una solicitud ENVIADA (sin estimación), creada con la API de la app. */
async function solicitudEnviadaPorUnCliente(nombre: string): Promise<{ folio: string; cliente: string; proyecto: string; clienteId: string; token: string }> {
  const cuentas = cuentasE2E();
  const prep = await sesionEquipo(cuentas.preparador);
  const admin = await sesionEquipo(cuentas.administrador);
  const cliente = `[QA] Cliente ${nombre}`;
  const proyecto = `[QA] Losa de ${nombre}`;
  const c = await prep.post<{ id: string }>("/api/v1/clientes", { nombre: cliente, contactoNombre: "Persona QA", contactoTelefono: "55 1234 5678", contactoCorreo: `contacto.${nombre}@clientes.softarq.test` });
  await prep.post("/api/v1/proyectos", { clienteId: c.id, nombre: proyecto, municipio: "Tlalnepantla de Baz", entidadFederativa: "Estado de México", descripcion: "Losa de prueba del panel (QA)." });
  const correo = `qa.${nombre}@clientes.softarq.test`;
  const alta = await admin.post<{ contrasenaTemporal: string }>(`/api/v1/clientes/${c.id}/acceso`, { correo, nombre: "Persona QA", motivo: "Prueba automatizada del panel" });

  // Lo que hace la app: acceso con la temporal, cambio obligatorio, nuevo acceso y solicitud.
  const movil = await playwrightRequest.newContext({ baseURL: URL_API_E2E });
  try {
    const a1 = await movil.post("/api/v1/auth/movil/sesion", { data: { correo, contrasena: alta.contrasenaTemporal } });
    expect(a1.status(), "acceso con la temporal").toBe(200);
    const t1 = ((await a1.json()) as { tokenSesion: string }).tokenSesion;
    const nueva = `Nueva-${randomUUID()}`;
    const cambio = await movil.post("/api/v1/auth/contrasena", { headers: { Authorization: `Bearer ${t1}` }, data: { actual: alta.contrasenaTemporal, nueva, confirmacion: nueva } });
    expect(cambio.status(), "cambio obligatorio de contraseña").toBe(204);
    const a2 = await movil.post("/api/v1/auth/movil/sesion", { data: { correo, contrasena: nueva } });
    expect(a2.status(), "acceso con la contraseña nueva").toBe(200);
    const token = ((await a2.json()) as { tokenSesion: string }).tokenSesion;
    const auth = { Authorization: `Bearer ${token}` };
    const proyectos = (await (await movil.get("/api/v1/cliente/proyectos", { headers: auth })).json()) as { proyectos: { id: string; nombre: string }[] };
    const p = proyectos.proyectos.find((x) => x.nombre === proyecto);
    expect(p, "el proyecto del cliente").toBeTruthy();
    const captura = { notas: "Acceso por el portón norte", trabajos: [{ id: "t1", trabajoCodigo: "LOSA", opcionCodigo: "CONCRETO", huecos: [], secciones: [{ nombre: "", piezas: "1", largo: "6", ancho: "5", alto: "0.12" }] }] };
    const s = await movil.post("/api/v1/cliente/solicitudes", { headers: auth, data: { proyectoId: p!.id, captura } });
    expect(s.status(), "solicitud creada").toBe(201);
    const creada = (await s.json()) as { id: string; folio: string; revision: number };
    const e = await movil.post(`/api/v1/cliente/solicitudes/${creada.id}/envio`, { headers: auth, data: { revision: creada.revision } });
    expect(e.status(), "envío de la solicitud").toBe(200);
    return { folio: creada.folio, cliente, proyecto, clienteId: c.id, token };
  } finally {
    await movil.dispose();
    await prep.cerrar();
    await admin.cerrar();
  }
}

async function abrirOtraPersona(browser: Browser, cuenta: CuentaE2E): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: ORIGEN, locale: "es-MX", viewport: { width: 1440, height: 900 } });
  const p = await contexto.newPage();
  await abrirConSesion(p, cuenta, "calculadora");
  return p;
}

const navegar = (p: Page, seccion: string) => p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion, exact: true }).click();

test.describe("panel del equipo: solicitudes de clientes", () => {
  test("recorrido completo: solicitud del cliente → atender → precios explícitos → calcular → otra persona aprueba → emisión → el cliente ve su PDF", async ({ page, browser }) => {
    const datos = await solicitudEnviadaPorUnCliente(sufijo());
    await abrirConSesion(page, cuentasE2E().preparador, "inicio");

    // «Mi trabajo»: el Preparador ve su bandeja con el número de solicitudes por atender.
    await expect(page.getByRole("heading", { level: 1, name: "Mi trabajo" })).toBeVisible();
    const tarjeta = page.getByRole("region", { name: "Solicitudes por atender" });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator(".trabajo-numero")).not.toHaveText(/^(…|—|0)$/);
    // Sin bandejas ajenas: ni revisiones ni referencias.
    await expect(page.getByRole("region", { name: "Revisiones pendientes" })).toHaveCount(0);
    await evidencia(page, "01-mi-trabajo-preparador");

    await tarjeta.getByRole("link", { name: "Abrir la bandeja" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Solicitudes de clientes" })).toBeVisible();
    const fila = page.getByRole("row").filter({ hasText: datos.folio });
    await expect(fila).toContainText(datos.cliente);
    await expect(fila).toContainText("Enviada");
    await evidencia(page, "02-bandeja-solicitudes");
    await fila.getByRole("link", { name: datos.folio }).click();

    // Detalle: lo capturado y la estimación rotulada; atender no hereda nada.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(datos.folio);
    await expect(page.getByText(/largo 6 m · ancho 5 m · alto\/espesor 0\.12 m/)).toBeVisible();
    await expect(page.getByText("Acceso por el portón norte")).toBeVisible();
    await expect(page.getByText("Estimación preliminar, no es una cotización")).toBeVisible();
    await evidencia(page, "03-detalle-solicitud", true);
    await page.getByRole("button", { name: "Atender y preparar la cotización" }).click();

    // Cotización en borrador de ese cliente y proyecto.
    const titulo = page.getByRole("heading", { level: 1, name: /Cotización COT-2026-\d{5}/ });
    await expect(titulo).toBeVisible();
    await expect(page.getByText(datos.proyecto).first()).toBeVisible();
    await evidencia(page, "04-cotizacion-en-borrador", true);
    await expect(page.getByText("Estimación preliminar, no es una cotización")).toHaveCount(0);
    const folioCotizacion = /COT-2026-\d{5}/.exec((await titulo.textContent()) ?? "")![0];
    const idVersion = `${folioCotizacion}-v1`;
    // La cotización enlaza a la solicitud de la que nació.
    await expect(page.getByText("Solicitud de origen")).toBeVisible();
    await expect(page.getByRole("link", { name: datos.folio })).toBeVisible();

    // La solicitud ya no está «por atender»: pasa a «En preparación» y enlaza a su cotización.
    await navegar(page, "Solicitudes");
    await expect(page.getByRole("row").filter({ hasText: datos.folio })).toHaveCount(0);
    await page.getByRole("button", { name: "En preparación" }).click();
    const preparacion = page.getByRole("row").filter({ hasText: datos.folio });
    await expect(preparacion).toContainText("En preparación");
    await preparacion.getByRole("link", { name: datos.folio }).click();
    await expect(page.getByRole("button", { name: /Atender/ })).toHaveCount(0);
    await page.getByRole("link", { name: folioCotizacion }).click();
    await expect(titulo).toBeVisible();

    // Precios: no vienen elegidos. Calcular queda bloqueado hasta que el Preparador elige de forma explícita (CR-07).
    await expect(page.getByText("falta elegir 3")).toBeVisible();
    await page.getByRole("radio", { name: /Consolidar compras/ }).check();
    const radios = page.getByRole("radio");
    await radios.nth(3).check(); // concreto: menor precio vigente
    await radios.nth(4).check(); // acero de refuerzo
    await radios.nth(5).check(); // triplay
    await page.getByRole("button", { name: "Calcular y guardar versión" }).click();
    await expect(page.getByText(`Versión ${idVersion} guardada`)).toBeVisible();
    const totalGuardado = ((await page.locator(".resultado-guardado [data-prueba=total]").textContent()) ?? "").trim();
    expect(totalGuardado).toMatch(/^\$[\d,]+\.\d{2}$/);

    // Revisión por OTRA persona (BL-17): el Preparador envía y el Revisor aprueba.
    await page.getByRole("button", { name: `Enviar ${idVersion} a revisión…` }).click();
    await page.getByRole("button", { name: `Confirmar envío de ${idVersion}` }).click();
    await expect(page.getByText(`${idVersion} está en revisión`)).toBeVisible();
    const revisor = await abrirOtraPersona(browser, cuentasE2E().revisor);
    await navegar(revisor, "Revisiones");
    await revisor.getByRole("button", { name: "Pendientes" }).click();
    await revisor.getByRole("link", { name: idVersion }).click();
    await revisor.getByRole("button", { name: "Aprobar…" }).click();
    await revisor.getByRole("button", { name: `Confirmar aprobación de ${idVersion}` }).click();
    await expect(revisor.getByText(new RegExp(`${idVersion} aprobada por`)).first()).toBeVisible();
    await revisor.context().close();

    // Emisión por el Preparador; el documento queda inmutable.
    await page.reload();
    const emision = page.locator(".seccion-emision");
    await emision.getByRole("button", { name: `Emitir ${idVersion}…` }).click();
    await emision.getByRole("button", { name: `Confirmar emisión de ${idVersion}` }).click();
    const tarjetaEmision = page.getByLabel(`Documento emitido de ${idVersion}`);
    await expect(tarjetaEmision.getByText("Emitida", { exact: true })).toBeVisible();
    await evidencia(page, "04b-cotizacion-emitida", true);

    // Tras la emisión, la solicitud sale de «En preparación», figura como cotizada y el cliente ve su cotización formal y su PDF.
    await navegar(page, "Solicitudes");
    await page.getByRole("button", { name: "En preparación" }).click();
    await expect(page.getByText("No hay solicitudes en este estado.").or(page.getByRole("table"))).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: datos.folio })).toHaveCount(0);
    await page.getByRole("button", { name: "Cotizadas" }).click();
    await page.getByRole("row").filter({ hasText: datos.folio }).getByRole("link", { name: datos.folio }).click();
    await expect(page.getByText(/el cliente ya la ve en su app/)).toBeVisible();
    await evidencia(page, "04c-solicitud-cotizada");
    const movil = await playwrightRequest.newContext({ baseURL: URL_API_E2E });
    try {
      const auth = { Authorization: `Bearer ${datos.token}` };
      const lista = (await (await movil.get("/api/v1/cliente/cotizaciones", { headers: auth })).json()) as { cotizaciones: { emisionId: string; folio: string }[] };
      const suya = lista.cotizaciones.find((c) => c.folio === folioCotizacion);
      expect(suya, "el cliente ve su cotización emitida").toBeTruthy();
      const pdf = await movil.get(`/api/v1/cliente/cotizaciones/${suya!.emisionId}/documento`, { headers: auth });
      expect(pdf.status()).toBe(200);
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await movil.dispose();
    }
  });

  test("el Revisor no tiene la bandeja de solicitudes ni su ruta; ve sus revisiones en Mi trabajo", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().revisor, "inicio");
    await expect(page.getByRole("heading", { level: 1, name: "Mi trabajo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Revisiones pendientes" })).toBeVisible();
    await evidencia(page, "05-mi-trabajo-revisor");
    await expect(page.getByRole("region", { name: "Solicitudes por atender" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Solicitudes", exact: true })).toHaveCount(0);
    await page.goto("/#/solicitudes");
    await expect(page.getByText("Su función no atiende solicitudes de clientes")).toBeVisible();
  });

  test("el Administrador del sistema crea el acceso de un cliente desde su ficha: la temporal se ve una sola vez", async ({ page }) => {
    const nombre = sufijo();
    const prep = await sesionEquipo(cuentasE2E().preparador);
    const c = await prep.post<{ id: string }>("/api/v1/clientes", { nombre: `[QA] Cliente sin acceso ${nombre}`, contactoNombre: "Persona QA", contactoTelefono: "55 1234 5678" });
    await prep.cerrar();
    await abrirConSesion(page, cuentasE2E().administrador);
    await page.goto(`/#/clientes/${c.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "Acceso a la app del cliente" })).toBeVisible();
    await page.getByRole("button", { name: "Crear acceso a la app" }).click();
    await page.getByLabel(/Correo del cliente/).fill(`qa.ficha.${nombre}@clientes.softarq.test`);
    await page.getByLabel("Motivo (queda en la bitácora)").fill("Prueba automatizada de la ficha");
    await page.getByRole("button", { name: "Crear el acceso a la app" }).click();
    const aviso = page.getByRole("alert").filter({ hasText: "entréguela al cliente ahora" });
    await expect(aviso).toBeVisible();
    await expect(aviso.getByLabel("Contraseña temporal")).toHaveText(/^•+$/);
    await aviso.getByRole("button", { name: "Mostrar" }).click();
    const temporal = (await aviso.getByLabel("Contraseña temporal").textContent()) ?? "";
    expect(temporal.length).toBeGreaterThanOrEqual(12);
    await aviso.getByRole("button", { name: "Ya la entregué" }).click();
    await expect(page.getByText(temporal)).toHaveCount(0);
    await expect(page.getByText("Contraseña temporal pendiente de cambio")).toBeVisible();
    await evidencia(page, "06-acceso-del-cliente", true);
    // Recargar no la vuelve a mostrar (la API no la guarda en claro).
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Acceso a la app del cliente" })).toBeVisible();
    await expect(page.getByText(temporal)).toHaveCount(0);
  });
});
