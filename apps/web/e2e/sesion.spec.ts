/**
 * Sesión en el navegador (ADR-0007), contra la API real y softarq_test. Automatizado: no equivale a
 * una prueba hecha por una persona.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  CORS,
  URL_API_E2E,
  abrirConSesion,
  ajustarBase,
  calcularYTotal,
  cargarEjemplo,
  cuentasE2E,
  evidenciaM5,
  iniciarSesion,
  panel,
  sinDesbordeHorizontal,
  total,
} from "./apoyo.ts";

const ORIGEN_WEB = "http://localhost:4173";

async function sinAlmacenamiento(pagina: Page): Promise<void> {
  expect(await pagina.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
}

test("flujo completo: acceso, ejemplo, cálculo y cierre; después las rutas protegidas responden 401", async ({ page, context }, info) => {
  const { preparador } = cuentasE2E();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cargar ejemplo/ })).toHaveCount(0);
  await evidenciaM5(page, info, "01-acceso");

  // Acceso incorrecto: mensaje genérico.
  await page.getByLabel("Correo").fill(preparador.correo);
  await page.getByLabel("Contraseña", { exact: true }).fill("no-es-la-clave");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("Correo o contraseña incorrectos");
  await evidenciaM5(page, info, "02-acceso-incorrecto");

  await iniciarSesion(page, preparador);
  await expect(page.getByRole("group", { name: "Sesión actual" })).toContainText("Preparador");
  await evidenciaM5(page, info, "03-sesion-iniciada");

  // Cookie de sesión: HttpOnly, SameSite=Strict, Path=/api/v1 y host-only (localhost).
  const cookie = (await context.cookies(`${URL_API_E2E}/api/v1/`)).find((c) => c.name === "softarq_sesion");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/v1", domain: "localhost", secure: false });
  expect(await page.evaluate(() => document.cookie)).not.toContain("softarq_sesion");
  await sinAlmacenamiento(page);

  await cargarEjemplo(page, 1);
  expect(await calcularYTotal(page)).toBe("$54,190.68");
  await evidenciaM5(page, info, "04-calculado-con-sesion", true);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByText("Sesión cerrada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(total(page)).toHaveCount(0);
  await expect(page.getByText("Faldón norte")).toHaveCount(0);
  await sinAlmacenamiento(page);
  await evidenciaM5(page, info, "05-sesion-cerrada");

  // Las rutas protegidas ya no funcionan: ni sin cookie ni con la cookie anterior.
  expect((await context.cookies(`${URL_API_E2E}/api/v1/`)).find((c) => c.name === "softarq_sesion")).toBeUndefined();
  const sinCookie = await page.request.get(`${URL_API_E2E}/api/v1/catalogos/tipos-adicional`);
  expect(sinCookie.status()).toBe(401);
  const conAnterior = { Cookie: `softarq_sesion=${cookie!.value}` };
  for (const ruta of ["/api/v1/catalogos/conceptos", "/api/v1/auth/sesion"]) {
    const r = await page.request.get(`${URL_API_E2E}${ruta}`, { headers: conAnterior });
    expect(r.status(), ruta).toBe(401);
  }
  const calculo = await page.request.post(`${URL_API_E2E}/api/v1/calculos/demo`, {
    headers: { ...conAnterior, Origin: ORIGEN_WEB, "Content-Type": "application/json" },
    data: { consolidarCompras: true, partidas: [], preciosElegidos: [] },
  });
  expect(calculo.status()).toBe(401);
});

test("recargar la página restaura la sesión consultando al servidor", async ({ page }) => {
  await abrirConSesion(page);
  await page.reload();
  await expect(page.getByRole("group", { name: "Sesión actual" })).toContainText(cuentasE2E().preparador.nombre);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toHaveCount(0);
});

test("Revisor: consulta y captura, pero «Calcular» está deshabilitado y la API responde 403", async ({ page }, info) => {
  const { revisor } = cuentasE2E();
  await abrirConSesion(page, revisor);
  await expect(page.getByRole("group", { name: "Sesión actual" })).toContainText("Revisor");
  await cargarEjemplo(page, 1);
  await expect(page.getByRole("button", { name: "Calcular" })).toBeDisabled();
  await expect(panel(page)).toContainText("Su función (Revisor) no incluye calcular");
  await panel(page).scrollIntoViewIfNeeded();
  await evidenciaM5(page, info, "06-revisor-sin-calculo");

  // La autorización está en la API: una solicitud directa con su sesión y su CSRF también falla.
  const sesion = await page.request.get(`${URL_API_E2E}/api/v1/auth/sesion`);
  const { csrfToken } = (await sesion.json()) as { csrfToken: string };
  const r = await page.request.post(`${URL_API_E2E}/api/v1/calculos/demo`, {
    headers: { Origin: ORIGEN_WEB, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
    data: { consolidarCompras: true, partidas: [], preciosElegidos: [] },
  });
  expect(r.status()).toBe(403);
  expect(((await r.json()) as { error: { codigo: string } }).error.codigo).toBe("SIN_PERMISO");
});

test("sesión revocada en el servidor durante el uso: la siguiente acción lleva al acceso y descarta la captura", async ({ page }, info) => {
  const { preparador } = cuentasE2E();
  await abrirConSesion(page, preparador);
  await cargarEjemplo(page, 1);
  ajustarBase("sesiones", "revocar", preparador.correo);
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByText("Su sesión terminó")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByText("Faldón norte")).toHaveCount(0);
  await evidenciaM5(page, info, "07-sesion-vencida");
  // Al volver a entrar no reaparece nada de la captura anterior.
  await iniciarSesion(page, preparador);
  await expect(page.getByRole("button", { name: /Cargar ejemplo/ })).toHaveCount(4);
  await expect(total(page)).toHaveCount(0);
});

test("una respuesta tardía de la sesión anterior no reaparece tras cerrar y entrar con otro usuario", async ({ page }) => {
  const { preparador, revisor } = cuentasE2E();
  await abrirConSesion(page, preparador);
  await cargarEjemplo(page, 1);
  let soltar: () => void = () => {};
  await page.route("**/api/v1/calculos/demo", async (ruta) => {
    await new Promise<void>((r) => (soltar = r));
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify({ error: "respuesta tardía de la sesión anterior" }),
    }).catch(() => undefined);
  });
  await page.getByRole("button", { name: "Calcular" }).click();
  await expect(page.getByRole("button", { name: "Calculando…" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByText("Sesión cerrada")).toBeVisible();
  await iniciarSesion(page, revisor);
  soltar();
  await page.waitForTimeout(500);
  await expect(page.getByText("respuesta tardía")).toHaveCount(0);
  await expect(page.getByText("Faldón norte")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cargar ejemplo/ })).toHaveCount(4);
});

test("pantalla estrecha: acceso y barra de sesión sin desbordes @movil", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await sinDesbordeHorizontal(page);
  await evidenciaM5(page, info, "01-acceso", true);
  await iniciarSesion(page);
  await sinDesbordeHorizontal(page);
  await evidenciaM5(page, info, "02-sesion-iniciada");
});
