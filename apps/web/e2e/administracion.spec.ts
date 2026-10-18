/**
 * Administración del sistema (módulo 13, ADR-0017) contra la web compilada, la API real y softarq_test:
 * parámetros en % con impacto y vuelta a la configuración de referencia; alta de una persona [DEMO] con
 * contraseña temporal mostrada una vez, primer acceso restringido y cambio obligatorio; desactivación
 * con una sesión abierta en otro navegador; y la sección a 390 px.
 * Pruebas AUTOMATIZADAS: no equivalen a la revisión personal ni a la ejecución formal de la guía.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, ajustarBase, cuentasE2E, sinDesbordeHorizontal } from "./apoyo.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "modulo13");
const MOTIVO = "[DEMO] Comprobación automatizada del módulo 13";

test.describe.configure({ mode: "serial" });

async function evidencia(pagina: Page, info: TestInfo, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await pagina.screenshot({ path: join(CARPETA, `${info.project.name}-${nombre}.png`), fullPage: completa });
}

const sufijo = () => Math.random().toString(36).slice(2, 7);

async function nuevoNavegador(browser: Browser, ancho = 1440): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: "http://localhost:4173", locale: "es-MX", viewport: { width: ancho, height: 900 } });
  return contexto.newPage();
}

async function irA(p: Page, vista: "Parámetros" | "Personas y funciones"): Promise<void> {
  await p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Administración" }).click();
  await p.getByRole("navigation", { name: "Secciones de la administración" }).getByRole("link", { name: vista }).click();
}

/** Alta por la interfaz; devuelve la contraseña temporal que muestra la pantalla (una sola vez). */
async function altaPersona(p: Page, correo: string, nombre: string): Promise<string> {
  await irA(p, "Personas y funciones");
  await p.getByRole("button", { name: "Nueva persona" }).click();
  await p.getByLabel(/^Nombre/).fill(nombre);
  await p.getByLabel(/^Correo/).fill(correo);
  await p.getByRole("checkbox", { name: "Preparador" }).check();
  await p.getByLabel(/Motivo del alta/).fill(MOTIVO);
  await p.getByRole("button", { name: "Crear y generar contraseña temporal" }).click();
  const codigo = p.getByLabel("Contraseña temporal");
  await expect(codigo).toBeVisible();
  return (await codigo.textContent()) ?? "";
}

async function entrar(p: Page, correo: string, contrasena: string): Promise<void> {
  await p.goto("/");
  await p.getByLabel("Correo").fill(correo);
  await p.getByLabel("Contraseña", { exact: true }).fill(contrasena);
  await p.getByRole("button", { name: "Iniciar sesión" }).click();
}

test.afterAll(() => {
  // Configuración de referencia de softarq_test para las demás pruebas, pase lo que pase.
  ajustarBase("parametros", "demo");
});

test("parámetros: el recargo se captura en %, se ve la fracción y el impacto; se vuelve a la referencia", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().administrador);
  await irA(page, "Parámetros");
  await expect(page.getByText("20 % (fracción guardada: 0.2)")).toBeVisible();
  await expect(page.getByText(/no se edita: una organización DEMO no pasa a producción/)).toBeVisible();
  await evidencia(page, info, "parametros", true);

  const editar = async (porcentaje: string, motivo: string) => {
    await page.getByRole("button", { name: "Editar parámetros" }).click();
    await page.getByLabel(/^Recargo \(%\)/).fill(porcentaje);
    await page.getByLabel(/^Motivo del cambio/).fill(motivo);
    await page.getByRole("button", { name: "Revisar y guardar" }).click();
    const confirmacion = page.getByRole("group", { name: "Confirmar: Guardar parámetros" });
    await expect(confirmacion).toContainText(/las versiones emitidas y sus PDF no cambian/);
    return confirmacion;
  };
  const confirmacion = await editar("18.5", MOTIVO);
  await expect(page.getByText("Se guardará la fracción 0.185 (18.5 %).")).toBeVisible();
  await evidencia(page, info, "parametros-confirmacion");
  await confirmacion.getByRole("button", { name: "Guardar parámetros" }).click();
  await expect(page.getByText(/Parámetros guardados/)).toBeVisible();
  await expect(page.getByText("18.5 % (fracción guardada: 0.185)")).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de cambios" })).toContainText("recargo: 20 % → 18.5 %");

  // Vuelta a la referencia con su motivo: el historial conserva ambos cambios.
  await (await editar("20", "[DEMO] Volver a la configuración de referencia")).getByRole("button", { name: "Guardar parámetros" }).click();
  await expect(page.getByText("20 % (fracción guardada: 0.2)")).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de cambios" })).toContainText("recargo: 18.5 % → 20 %");
});

test("persona nueva: temporal una vez, primer acceso restringido, cambio obligatorio y acceso normal", async ({ page, browser }, info) => {
  const correo = `persona.m13.${sufijo()}@softarq.test`;
  const nombre = `[DEMO] Persona E2E M13 ${sufijo()}`;
  await abrirConSesion(page, cuentasE2E().administrador);
  const temporal = await altaPersona(page, correo, nombre);
  expect(temporal).toMatch(/^[A-Za-z0-9_-]{24}$/);
  await evidencia(page, info, "persona-temporal");
  await page.getByRole("button", { name: "Ya la entregué: ocultar" }).click();
  await expect(page.getByText(temporal)).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Personas de la organización" }).getByRole("row", { name: new RegExp(correo.replace(/\./g, "\\.")) })).toContainText(
    "Contraseña temporal pendiente",
  );

  const otra = await nuevoNavegador(browser);
  await entrar(otra, correo, temporal);
  await expect(otra.getByRole("heading", { name: "Cambie su contraseña temporal" })).toBeVisible();
  await expect(otra.getByRole("navigation", { name: "Secciones" })).toHaveCount(0);
  // La restricción es de la API, no solo de la pantalla.
  const directa = await otra.evaluate(async () => (await fetch("http://localhost:3101/api/v1/cotizaciones", { credentials: "include" })).status);
  expect(directa).toBe(403);
  await evidencia(otra, info, "persona-cambio-obligatorio");
  const nueva = `frase nueva de ${sufijo()} para M13`;
  await otra.getByLabel("Contraseña temporal", { exact: true }).fill(temporal);
  await otra.getByLabel("Contraseña nueva", { exact: true }).fill(nueva);
  await otra.getByLabel("Confirmación", { exact: true }).fill(nueva);
  await otra.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(otra.getByText("Contraseña cambiada")).toBeVisible();
  // La temporal ya no sirve; la nueva sí, con acceso normal.
  await otra.getByLabel("Correo").fill(correo);
  await otra.getByLabel("Contraseña", { exact: true }).fill(temporal);
  await otra.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(otra.getByRole("alert")).toContainText("Correo o contraseña incorrectos");
  await otra.getByLabel("Contraseña", { exact: true }).fill(nueva);
  await otra.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(otra.getByRole("group", { name: "Sesión actual" })).toContainText(nombre);
  await expect(otra.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Administración" })).toHaveCount(0);
  // Ningún secreto en el almacenamiento del navegador de ninguno de los dos.
  for (const p of [page, otra]) {
    const almacen = await p.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(almacen).not.toContain(temporal);
    expect(almacen).not.toContain(nueva);
  }
  await otra.context().close();
});

test("desactivar a una persona cierra su sesión abierta en otro navegador", async ({ page, browser }) => {
  const correo = `baja.m13.${sufijo()}@softarq.test`;
  const nombre = `[DEMO] Baja E2E M13 ${sufijo()}`;
  await abrirConSesion(page, cuentasE2E().administrador);
  const temporal = await altaPersona(page, correo, nombre);
  const otra = await nuevoNavegador(browser);
  await entrar(otra, correo, temporal);
  const nueva = `frase de baja ${sufijo()} M13`;
  await otra.getByLabel("Contraseña temporal", { exact: true }).fill(temporal);
  await otra.getByLabel("Contraseña nueva", { exact: true }).fill(nueva);
  await otra.getByLabel("Confirmación", { exact: true }).fill(nueva);
  await otra.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(otra.getByText("Contraseña cambiada")).toBeVisible();
  await otra.getByLabel("Correo").fill(correo);
  await otra.getByLabel("Contraseña", { exact: true }).fill(nueva);
  await otra.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(otra.getByRole("group", { name: "Sesión actual" })).toContainText(nombre);

  await page.getByRole("button", { name: "Ya la entregué: ocultar" }).click();
  await page.getByRole("table", { name: "Personas de la organización" }).getByRole("row", { name: new RegExp(correo.replace(/\./g, "\\.")) }).getByRole("link", { name: "Gestionar" }).click();
  const seccion = page.getByRole("region", { name: "Desactivar" });
  await seccion.getByLabel(/^Motivo/).fill(MOTIVO);
  await seccion.getByRole("button", { name: "Desactivar…" }).click();
  await page.getByRole("group", { name: "Confirmar: Desactivar" }).getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByText(/Persona desactivada/)).toBeVisible();

  // La siguiente petición de la otra sesión ya no vale.
  await otra.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Cotizaciones" }).click();
  await expect(otra.getByText("Su sesión terminó")).toBeVisible();
  await entrar(otra, correo, nueva);
  await expect(otra.getByRole("alert")).toContainText("Correo o contraseña incorrectos");
  await otra.context().close();
});

test("administración a 390 px sin desbordes @movil", async ({ page }, info) => {
  await abrirConSesion(page, cuentasE2E().administrador);
  await irA(page, "Parámetros");
  await expect(page.getByText("20 % (fracción guardada: 0.2)")).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "parametros", true);
  await irA(page, "Personas y funciones");
  await expect(page.getByRole("table", { name: "Personas de la organización" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  // Los correos largos se parten: ninguna celda de correo recorta su texto.
  const recortadas = await page.locator(".celda-correo").evaluateAll((celdas) => celdas.filter((c) => c.scrollWidth > c.clientWidth).length);
  expect(recortadas).toBe(0);
  await evidencia(page, info, "personas", true);
  await page.getByRole("button", { name: "Nueva persona" }).click();
  await sinDesbordeHorizontal(page);
  await evidencia(page, info, "persona-alta");
});
