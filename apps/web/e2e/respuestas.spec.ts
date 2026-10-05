/** Módulo 9: navegador real, softarq_test y documentos aislados. Evidencias automatizadas. */
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { abrirConSesion, cargarEjemplo, cuentasE2E, CORS, URL_API_E2E, sinDesbordeHorizontal } from "./apoyo.ts";
const DIR = join(import.meta.dirname,"..","..","..","..","_work","evidencias","modulo9");
async function evidencia(p:Page,info:TestInfo,n:string) { mkdirSync(DIR,{recursive:true}); await p.locator(".seguimiento-emision").scrollIntoViewIfNeeded(); await p.screenshot({path:join(DIR,`${info.project.name}-${n}.png`)}); }
async function nuevaEmitida(p:Page,browser:Browser) {
  await abrirConSesion(p); await cargarEjemplo(p,1); await p.getByRole("button",{name:"Guardar como cotización"}).click(); await p.getByRole("button",{name:"Nuevo cliente"}).click();
  await p.getByLabel("Nombre o razón social").fill(`[DEMO] Respuestas Peñasco ${randomUUID().slice(0,6)}`); await p.getByLabel("Nombre del contacto").fill("Begoña Íñiguez"); await p.getByLabel("Teléfono").fill("55 1234 5678"); await p.getByRole("button",{name:"Crear cliente"}).click();
  await p.getByRole("button",{name:"Nuevo proyecto"}).click(); await p.getByLabel("Nombre del proyecto").fill("[DEMO] Nave Águila"); await p.getByLabel("Municipio").fill("Mérida"); await p.getByLabel("Entidad federativa").fill("Yucatán"); await p.getByLabel("Descripción").fill("Cubierta ligera para seguimiento interno."); await p.getByRole("button",{name:"Crear proyecto"}).click(); await p.getByRole("button",{name:"Crear cotización"}).click();
  const titulo=p.getByRole("heading",{level:1,name:/Cotización COT/}); await expect(titulo).toBeVisible(); const folio=/COT-2026-\d{5}/.exec(await titulo.textContent() ?? "")![0]; const url=p.url();
  await p.getByRole("button",{name:"Calcular y guardar versión"}).click(); await expect(p.getByText(`Versión ${folio}-v1 guardada`)).toBeVisible();
  await p.getByRole("button",{name:`Enviar ${folio}-v1 a revisión…`}).click(); await p.getByRole("button",{name:`Confirmar envío de ${folio}-v1`}).click();
  const contexto=await browser.newContext({baseURL:"http://localhost:4173"}); const rev=await contexto.newPage(); await abrirConSesion(rev,cuentasE2E().revisor);
  await rev.getByRole("navigation",{name:"Secciones"}).getByRole("link",{name:"Revisiones"}).click(); await rev.getByRole("link",{name:`${folio}-v1`}).click(); await rev.getByRole("button",{name:"Aprobar…"}).click(); await rev.getByRole("button",{name:`Confirmar aprobación de ${folio}-v1`}).click();
  await expect(rev.getByText(`${folio}-v1 aprobada por [DEMO] Revisor 1`)).toBeVisible();
  await p.reload(); await p.getByRole("button",{name:`Emitir ${folio}-v1…`}).click(); await p.getByRole("button",{name:`Confirmar emisión de ${folio}-v1`}).click();
  const panel=p.locator(".seguimiento-emision"); await expect(panel.getByRole("button",{name:"Registrar respuesta del cliente"})).toBeVisible();
  const id=/#\/cotizaciones\/([0-9a-f-]{36})/.exec(url)![1]!; const d=await (await p.request.get(`${URL_API_E2E}/api/v1/cotizaciones/${id}`)).json();
  return { folio,url,panel,rev,contexto,emisionId:d.versiones[0].emision.id as string };
}
async function captura(p:Page,nota:string) { const panel=p.locator(".seguimiento-emision"); await panel.getByRole("button",{name:"Registrar respuesta del cliente"}).click(); await panel.getByLabel("Resultado recibido").selectOption("ACEPTADA"); await panel.getByLabel("Nota de la respuesta (opcional)").fill(nota); return panel; }
async function guardar(p:Page) { const panel=p.locator(".seguimiento-emision"); await panel.getByRole("button",{name:"Revisar registro"}).click(); await panel.getByRole("button",{name:"Confirmar registro interno"}).click(); }
for (const titulo of ["registro y corrección conservan historial, documento y permisos", "registro y corrección a 390 px @movil"]) {
  test(titulo,async({page,browser},info)=>{
    const e=await nuevaEmitida(page,browser); const antes=Buffer.from(await (await page.request.get(`${URL_API_E2E}/api/v1/emisiones/${e.emisionId}/documento`)).body()); const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
    await captura(page,"Begoña confirmó por teléfono: alcance y condiciones."); await guardar(page); await expect(e.panel.getByText("Aceptada",{exact:true})).toBeVisible(); await expect(e.panel.getByText(/Registrada internamente por \[DEMO\] Preparador 1/)).toBeVisible(); await evidencia(page,info,"01-respuesta-registrada");
    await e.panel.getByRole("button",{name:"Corregir registro interno"}).click(); await expect(e.panel.getByLabel("Resultado recibido")).toBeFocused(); await e.panel.getByLabel("Resultado recibido").selectOption("RECHAZADA"); await e.panel.getByLabel("Motivo de la corrección").fill("Se transcribió incorrectamente el resultado recibido."); await guardar(page);
    await expect(e.panel.getByText("Rechazada",{exact:true})).toBeVisible(); await expect(e.panel.getByText("Registro 1 · Aceptada")).toBeVisible(); await expect(e.panel.getByText(/Motivo de corrección: Se transcribió/)).toBeVisible(); await sinDesbordeHorizontal(page); await evidencia(page,info,"02-correccion-historial");
    const despues=await (await page.request.get(`${URL_API_E2E}/api/v1/emisiones/${e.emisionId}/documento`)).body(); expect(sha(despues)).toBe(sha(antes));
    await e.rev.goto(e.url); await expect(e.rev.locator(".seguimiento-emision").getByText("Rechazada",{exact:true})).toBeVisible(); await expect(e.rev.getByRole("button",{name:"Corregir registro interno"})).toHaveCount(0); await expect(e.rev.getByText("Solo un Preparador puede corregir un registro interno.")).toBeVisible(); await e.contexto.close();
  });
}
test("error recuperable conserva nota y clave; fecha inválida enfoca explicación",async({page,browser},info)=>{
  const e=await nuevaEmitida(page,browser); const panel=await captura(page,"Nota con acentos: Íñiguez recibió la propuesta."); const claves:string[]=[]; let primera=true;
  await page.route(`**/emisiones/${e.emisionId}/respuestas`,async(route)=>{claves.push(route.request().headers()["idempotency-key"]!); if(primera){primera=false;await route.fulfill({status:503,headers:CORS,contentType:"application/json",body:JSON.stringify({error:{codigo:"SERVICIO_NO_DISPONIBLE",mensaje:"Servicio no disponible."}})});}else await route.continue();});
  await guardar(page); await expect(panel.getByLabel("Nota de la respuesta (opcional)")).toHaveValue("Nota con acentos: Íñiguez recibió la propuesta."); await expect(panel.getByRole("alert")).toBeFocused(); await evidencia(page,info,"03-error-captura-conservada"); await guardar(page); await expect(panel.getByText("Aceptada",{exact:true})).toBeVisible(); expect(claves).toHaveLength(2); expect(claves[0]).toBe(claves[1]);
  await panel.getByRole("button",{name:"Corregir registro interno"}).click(); await panel.getByLabel("Fecha en que se recibió la respuesta").fill("2026-09-26"); await panel.getByLabel("Motivo de la corrección").fill("Se revisa la fecha de recepción indicada."); await guardar(page); await expect(panel.getByRole("alert")).toContainText("fecha del servidor"); await expect(panel.getByRole("alert")).toBeFocused(); await expect(panel.getByLabel("Motivo de la corrección")).toHaveValue("Se revisa la fecha de recepción indicada."); await e.contexto.close();
});
test("dos pestañas conservan captura en conflicto y corrigen solo tras comparar",async({page,browser},info)=>{
  const e=await nuevaEmitida(page,browser); const segunda=await page.context().newPage(); await segunda.goto(e.url); await captura(page,"Aceptación registrada en primera pestaña."); const otro=await captura(segunda,"Respuesta registrada en segunda pestaña: Peñasco.");
  await guardar(page); await expect(e.panel.getByText("Aceptada",{exact:true})).toBeVisible(); await guardar(segunda); await expect(otro.getByRole("alert")).toContainText("captura se conserva"); await expect(otro.getByLabel("Nota de la respuesta (opcional)")).toHaveValue("Respuesta registrada en segunda pestaña: Peñasco."); await expect(otro.getByRole("button",{name:"Revisar registro"})).toBeDisabled(); await evidencia(segunda,info,"04-conflicto-comparar");
  await otro.getByRole("button",{name:"Corregir el registro vigente con mi captura"}).click(); await otro.getByLabel("Motivo de la corrección").fill("La nota recibida en la segunda pestaña estaba incompleta."); await guardar(segunda); await expect(otro.getByText(/Registro 2 · Aceptada/)).toBeVisible(); await expect(otro.getByText("Nota: Aceptación registrada en primera pestaña.")).toBeVisible(); await segunda.close(); await e.contexto.close();
});
