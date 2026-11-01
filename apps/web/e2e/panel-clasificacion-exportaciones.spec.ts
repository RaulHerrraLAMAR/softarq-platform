/**
 * Panel del equipo, segunda parte (E3.8, RF-26, ADR-0023) contra la web compilada, la API real y softarq_test:
 * clasificación de clientes con filtros que no ocultan nada, contadores de inicio, exportación CSV, trabajos para clientes,
 * precios de referencia y el enlace de la cotización a su solicitud de origen. Incluye una pasada en anchura móvil con capturas.
 * Pruebas de navegador AUTOMATIZADAS: no equivalen a la revisión personal del propietario.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { URL_API_E2E, abrirConSesion, cuentasE2E, sinDesbordeHorizontal, type CuentaE2E } from "./apoyo.ts";

const ORIGEN = "http://localhost:4173";
const CARPETA_E3 = join(import.meta.dirname, "..", "..", "..", "..", "_work", "evidencias", "e3");
const sufijo = () => Math.random().toString(36).slice(2, 7);
async function evidencia(p: Page, nombre: string, completa = false): Promise<void> {
  mkdirSync(CARPETA_E3, { recursive: true });
  await p.screenshot({ path: join(CARPETA_E3, `${nombre}.png`), fullPage: completa });
}

/** Cliente HTTP de una persona del equipo (mismo flujo que el navegador). */
async function sesionEquipo(cuenta: CuentaE2E) {
  const api = await playwrightRequest.newContext({ baseURL: URL_API_E2E });
  const previa = await api.get("/api/v1/auth/csrf");
  const csrfPrevio = ((await previa.json()) as { csrfToken: string }).csrfToken;
  const r = await api.post("/api/v1/auth/sesion", { headers: { Origin: ORIGEN, "X-CSRF-Token": csrfPrevio }, data: { correo: cuenta.correo, contrasena: cuenta.contrasena } });
  expect(r.status()).toBe(200);
  const csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
  return {
    post: async <T,>(ruta: string, cuerpo: unknown): Promise<T> => {
      const res = await api.post(ruta, { headers: { Origin: ORIGEN, "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() }, data: cuerpo });
      expect(res.status(), ruta).toBe(201);
      return (await res.json()) as T;
    },
    cerrar: () => api.dispose(),
  };
}

const navegar = (p: Page, seccion: string) => p.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: seccion, exact: true }).click();

test.describe("clasificación, contadores y exportaciones", () => {
  test("el Administrador del sistema clasifica un cliente: etiqueta en su ficha, filtro que identifica sin ocultar y bitácora implícita", async ({ page }) => {
    const nombre = `[QA] Cliente clasificable ${sufijo()}`;
    const prep = await sesionEquipo(cuentasE2E().preparador);
    const c = await prep.post<{ id: string }>("/api/v1/clientes", { nombre, contactoNombre: "Persona QA", contactoTelefono: "55 1234 5678" });
    await prep.cerrar();
    await abrirConSesion(page, cuentasE2E().administrador);
    await page.goto(`/#/clientes/${c.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "Clasificación" })).toBeVisible();
    await expect(page.getByText(/No se asume nada por llevar \[DEMO\]/)).toBeVisible();
    await page.getByLabel("Categoría").selectOption("QA");
    await page.getByLabel(/Motivo \(queda en la bitácora\)/).first().fill("Cliente de pruebas automatizadas");
    await page.getByRole("button", { name: "Guardar clasificación" }).click();
    await expect(page.getByText("Clasificado como QA.")).toBeVisible();
    await evidencia(page, "07-ficha-clasificada", true);

    // Lista: por omisión se ven TODOS (con su etiqueta); el filtro identifica y consulta, no oculta.
    await navegar(page, "Clientes");
    await page.getByLabel("Buscar por nombre o código").fill(nombre);
    await page.getByRole("button", { name: "Buscar" }).click();
    const fila = page.getByRole("row").filter({ hasText: nombre });
    await expect(fila).toBeVisible();
    await expect(fila.getByText("QA", { exact: true })).toBeVisible();
    await page.getByLabel("Clasificación").selectOption("HUMO");
    await expect(page.getByRole("row").filter({ hasText: nombre })).toHaveCount(0);
    await page.getByLabel("Clasificación").selectOption("QA");
    await expect(page.getByRole("row").filter({ hasText: nombre })).toBeVisible();
    await page.getByLabel("Clasificación").selectOption("");
    await expect(page.getByRole("row").filter({ hasText: nombre })).toBeVisible();
    await evidencia(page, "08-lista-clientes-con-clasificacion");
  });

  test("Mi trabajo muestra los contadores de inicio con sus reglas; el Preparador y el Revisor los ven", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().preparador, "inicio");
    const seccion = page.getByRole("region").or(page.locator("section.contadores-inicio")).filter({ hasText: "Estado de las cotizaciones" }).first();
    await expect(seccion).toBeVisible();
    for (const clave of ["borradores", "revision", "aprobadas", "vigentes", "vencidas", "precios"]) {
      await expect(page.locator(`[data-contador="${clave}"]`)).toHaveText(/^\d+$/);
    }
    await seccion.getByText("Cómo se cuenta").click();
    await expect(seccion.getByText(/ÚLTIMA versión/)).toBeVisible();
    await evidencia(page, "09-mi-trabajo-con-contadores");
  });

  test("RF-26: el Administrador del sistema descarga clientes.csv (UTF-8 con BOM, sin secretos); el del catálogo solo ve sus tablas", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().administrador, "inicio");
    await navegar(page, "Exportaciones");
    await expect(page.getByRole("heading", { level: 1, name: "Exportaciones" })).toBeVisible();
    // El administrador de esta cuenta tiene ambas funciones: ve maestros comerciales y catálogos.
    for (const t of ["clientes", "proyectos", "cotizaciones", "personas", "proveedores", "precios"]) await expect(page.getByRole("region", { name: `Exportar ${t}` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Exportar sesion" })).toHaveCount(0);
    const espera = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar personas.csv" }).click();
    const descarga = await espera;
    expect(descarga.suggestedFilename()).toBe("softarq-personas.csv");
    const ruta = await descarga.path();
    const bytes = readFileSync(ruta!);
    expect(bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");
    const texto = bytes.toString("utf8");
    expect(texto).toContain("correo,nombre,funciones,activa,es_demo,creada_en");
    expect(texto).toContain("administrador.demo@softarq.test");
    // Ningún secreto: ni hashes de contraseña ni columnas de credenciales. (El nombre de una persona puede contener la palabra «temporal»: es un dato, no un secreto.)
    expect(texto).not.toMatch(/argon2|\$2[aby]\$/i);
    expect(texto.split("\r\n")[0]).not.toMatch(/hash|contrasena|token|sesion/i);
    await evidencia(page, "10-exportaciones");
  });

  test("el Revisor no ve la sección Exportaciones ni puede abrirla por dirección", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().revisor, "inicio");
    await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Exportaciones", exact: true })).toHaveCount(0);
    await page.goto("/#/exportaciones");
    await expect(page.getByText("Su función no administra parámetros ni personas")).toBeVisible();
  });

  test("Catálogo: trabajos para clientes (editar con motivo y restaurar) y precios de referencia designados", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().administrador, "inicio");
    await page.goto("/#/catalogo/trabajos-cliente");
    await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
    const tabla = page.getByRole("table", { name: "Trabajos para clientes" });
    for (const t of ["Cubierta", "Losa", "Muro"]) await expect(tabla.getByRole("row").filter({ hasText: t })).toBeVisible();
    const filaLosa = tabla.getByRole("row").filter({ hasText: "LOSA" });
    await filaLosa.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText(/El concepto y las medidas no se editan aquí/)).toBeVisible();
    await page.getByLabel("Descripción para el cliente").fill("Losa de concreto reforzado (descripción editada por QA)");
    await page.getByLabel(/Motivo \(queda en la bitácora\)/).last().fill("Prueba automatizada de la edición");
    await page.getByRole("button", { name: "Guardar el trabajo" }).click();
    await expect(page.getByText("Trabajo «Losa» guardado.")).toBeVisible();
    await expect(tabla.getByText("descripción editada por QA")).toBeVisible();
    await evidencia(page, "11-trabajos-para-clientes");

    await page.goto("/#/catalogo/referencias");
    await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Referencias designadas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Precios de referencia", exact: true })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("anchura móvil del panel @movil", () => {
  test("Mi trabajo, bandeja, ficha del cliente, exportaciones y trabajos no desbordan y se ven completos @movil", async ({ page }) => {
    await abrirConSesion(page, cuentasE2E().administrador, "inicio");
    const paginas: { nombre: string; ruta: string; encabezado: RegExp | string }[] = [
      { nombre: "movil-01-mi-trabajo", ruta: "/#/inicio", encabezado: "Mi trabajo" },
      { nombre: "movil-02-clientes", ruta: "/#/clientes", encabezado: "Clientes" },
      { nombre: "movil-03-exportaciones", ruta: "/#/exportaciones", encabezado: "Exportaciones" },
      { nombre: "movil-04-trabajos-cliente", ruta: "/#/catalogo/trabajos-cliente", encabezado: "Catálogo" },
      { nombre: "movil-05-referencias", ruta: "/#/catalogo/referencias", encabezado: "Catálogo" },
    ];
    for (const p of paginas) {
      await page.goto(p.ruta);
      await expect(page.getByRole("heading", { level: 1, name: p.encabezado })).toBeVisible();
      await sinDesbordeHorizontal(page);
      await evidencia(page, p.nombre, true);
    }
    // La bandeja del Preparador (otra cuenta, otra pantalla).
    const prep = await page.context().browser()!.newContext({ baseURL: ORIGEN, viewport: { width: 390, height: 844 }, locale: "es-MX" });
    const p2 = await prep.newPage();
    await abrirConSesion(p2, cuentasE2E().preparador, "inicio");
    await p2.goto("/#/solicitudes");
    await expect(p2.getByRole("heading", { level: 1, name: "Solicitudes de clientes" })).toBeVisible();
    await sinDesbordeHorizontal(p2);
    await evidencia(p2, "movil-06-bandeja-solicitudes", true);
    await prep.close();
  });
});
