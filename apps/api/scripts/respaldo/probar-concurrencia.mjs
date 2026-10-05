#!/usr/bin/env node
/** Prueba operativa real (ADR-0013). Añade folios DEMO propios; jamás limpia softarq_dev.
 * Emite y registra correcciones después de exportar una instantánea todavía abierta.
 * Restaura esa instantánea solo en softarq_restauracion y verifica qué eventos contiene.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DIR_WORK, dirDocumentosDesarrollo, urlDeRol, urlRespaldo, sha256Archivo, rutaDeClave } from "./comun.mjs";
import { crearRespaldo } from "./respaldar.mjs";
import { verificarRespaldo } from "./verificar.mjs";
import { restaurarRespaldo } from "./restaurar.mjs";
import { crearAplicacion } from "../../dist/http/crear-aplicacion.js";
import { leerConfiguracion } from "../../dist/config/entorno.js";
const resultados=[];
const dir=join(DIR_WORK,"evidencias",`concurrencia-respaldo-${new Date().toISOString().replace(/[:.]/g,"-")}`);
mkdirSync(dir,{recursive:true});
function comprobar(nombre,condicion,detalle="") { resultados.push({nombre,ok:Boolean(condicion),detalle}); console.log(`${condicion?"OK":"FALLO"} ${nombre}${detalle?` — ${detalle}`:""}`); if(!condicion)throw new Error(nombre); }
const clienteDb=new pg.Client({connectionString:urlDeRol("DATABASE_URL","softarq_app","softarq_dev").cadena});
let api;
try {
  await clienteDb.connect();
  comprobar("origen comprobado",(await clienteDb.query("SELECT current_database() b, current_user u")).rows[0].b==="softarq_dev");
  const permisos=new pg.Client({connectionString:urlRespaldo().cadena}); await permisos.connect();
  try { const p=(await permisos.query("SELECT has_table_privilege(current_user,'public.respuesta_cliente_evento','SELECT') lectura,has_table_privilege(current_user,'public.respuesta_cliente_evento','INSERT') escritura,has_schema_privilege(current_user,'public','CREATE') ddl,current_setting('default_transaction_read_only') solo_lectura")).rows[0]; comprobar("respaldo lee eventos nuevos sin escritura ni DDL",p.lectura&&!p.escritura&&!p.ddl&&p.solo_lectura==="on"); } finally {await permisos.end();}
  const anteriores=(await clienteDb.query("SELECT to_jsonb(e) fila FROM emision e ORDER BY id")).rows;
  const originales=await Promise.all(anteriores.map(async({fila})=>({id:fila.id,clave:fila.archivo_clave,sha:await sha256Archivo(rutaDeClave(dirDocumentosDesarrollo(),fila.archivo_clave))})));
  api=await crearAplicacion(leerConfiguracion({DATABASE_URL:urlDeRol("DATABASE_URL","softarq_app","softarq_dev").cadena,API_REGISTRO:"ninguno",API_CORS_ORIGINS:"http://localhost:5173",SOFTARQ_DIR_DOCUMENTOS:dirDocumentosDesarrollo(),API_LIMITE_GENERAL_POR_MINUTO:"1000"}));
  await api.listen(0,"127.0.0.1"); const url=await api.getUrl();
  const cuentas=JSON.parse(readFileSync(join(DIR_WORK,"secrets","accesos-demo-softarq_dev.json"),"utf8")).cuentas;
  let serial=0;
  async function entrar(correo) {
    let cookie="",csrf="";
    async function solicitar(metodo,ruta,datos,clave) {
      const cabeceras={Accept:"application/json",...(cookie?{Cookie:cookie}:{}),...(metodo!=="GET"?{Origin:"http://localhost:5173","X-CSRF-Token":csrf}:{}),...(clave?{"Idempotency-Key":clave}:{})};
      let cuerpo;
      if(datos!==undefined){cabeceras["Content-Type"]="application/json";cuerpo=JSON.stringify(datos);if(ruta!=="/api/v1/auth/sesion"){const f=join(dir,`solicitud-${++serial}.json`);writeFileSync(f,cuerpo,"utf8");cuerpo=readFileSync(f,"utf8");}}
      const res=await fetch(`${url}${ruta}`,{method:metodo,headers:cabeceras,...(cuerpo?{body:cuerpo}:{})});
      for(const c of res.headers.getSetCookie()){const nombre=c.split(";",1)[0];if(nombre.startsWith("softarq_sesion="))cookie=nombre;}
      if(res.status===204)return null;
      const json=await res.json(); if(!res.ok)throw new Error(`${metodo} ${ruta}: ${res.status} ${json.error?.codigo ?? "error"}`); return json;
    }
    csrf=(await solicitar("GET","/api/v1/auth/csrf")).csrfToken;
    const sesion=await solicitar("POST","/api/v1/auth/sesion",{correo,contrasena:cuentas[correo].contrasena}); csrf=sesion.csrfToken;
    return {get:(r)=>solicitar("GET",r),post:(r,d)=>solicitar("POST",r,d,randomUUID()),salir:()=>solicitar("DELETE","/api/v1/auth/sesion")};
  }
  const p=await entrar("preparador.demo@softarq.test"),r=await entrar("revisor.demo@softarq.test");
  const sesion=await p.get("/api/v1/auth/sesion"); const org=(await clienteDb.query("SELECT id FROM organizacion WHERE codigo=$1",[sesion.organizacion.codigo])).rows[0].id;
  const semilla=(await clienteDb.query("SELECT cotizacion_id,version_numero FROM emision WHERE organizacion_id=$1 ORDER BY emitido_en LIMIT 1",[org])).rows[0];
  if(!semilla)throw new Error("Se necesita una emisión DEMO previa como captura de referencia.");
  const fuente=await p.get(`/api/v1/cotizaciones/${semilla.cotizacion_id}/versiones/${semilla.version_numero}`);
  comprobar("acentos comprobados antes de versiones inmutables",!/\uFFFD|Ã[±©¡³]|Â/.test(JSON.stringify(fuente.captura)));
  const sufijo=randomUUID().slice(0,8);
  async function preparar(nombre) {
    const cli=await p.post("/api/v1/clientes",{nombre:`[DEMO] Respaldo Peñasco ${nombre} ${sufijo}`,contactoNombre:"Begoña Íñiguez",contactoTelefono:"55 1234 5678",contactoCorreo:"begona@ejemplo.invalid"});
    const pry=await p.post("/api/v1/proyectos",{clienteId:cli.id,nombre:`[DEMO] Cubierta Águila ${nombre} ${sufijo}`,municipio:"Mérida",entidadFederativa:"Yucatán",descripcion:"Prueba operativa de seguimiento y respaldo."});
    const cot=await p.post("/api/v1/cotizaciones",{proyectoId:pry.id,captura:fuente.captura}); const id=cot.cotizacion.id;
    const v=await p.post(`/api/v1/cotizaciones/${id}/versiones`,{revisionBorrador:0}); const rev=await p.post(`/api/v1/cotizaciones/${id}/versiones/1/revisiones`,{revisionBorrador:0});
    await r.post(`/api/v1/revisiones/${rev.revision.id}/decision`,{decision:"APROBAR",versionId:v.version.id,revision:rev.revision.revision});
    return {id,folio:cot.cotizacion.folio,versionId:v.version.id,revisionId:rev.revision.id};
  }
  const emitir=(q)=>p.post(`/api/v1/cotizaciones/${q.id}/versiones/1/emision`,{versionId:q.versionId,revisionId:q.revisionId});
  const qA=await preparar("anterior"),qB=await preparar("concurrente"); const eA=await emitir(qA);
  const respuesta={resultado:"ACEPTADA",fechaRespuesta:eA.emision.fechaEmision,nota:"Begoña confirmó el alcance: teléfono, Peñasco."};
  const primera=await p.post(`/api/v1/emisiones/${eA.emision.id}/respuestas`,respuesta);
  let eB,correccion,segunda;
  const backup=await crearRespaldo({despuesDeExportarInstantanea:async()=>{
    correccion=await p.post(`/api/v1/emisiones/${eA.emision.id}/respuestas/${primera.id}/correcciones`,{...respuesta,resultado:"RECHAZADA",motivo:"Se corrigió la transcripción durante el respaldo."});
    eB=await emitir(qB); segunda=await p.post(`/api/v1/emisiones/${eB.emision.id}/respuestas`,{...respuesta,fechaRespuesta:eB.emision.fechaEmision});
    comprobar("emisión y respuesta/corrección confirmadas con instantánea abierta",correccion.numero===2&&segunda.numero===1,`${qA.folio}, ${qB.folio}`);
  }});
  comprobar("respaldo concurrente COMPLETO",backup.estado==="COMPLETO",backup.ruta);
  comprobar("instantánea incluye emisión anterior y excluye posterior",backup.manifiesto.documentos.lista.some(d=>d.emisionId===eA.emision.id)&&!backup.manifiesto.documentos.lista.some(d=>d.emisionId===eB.emision.id));
  comprobar("verificación del volcado y PDF",(await verificarRespaldo(backup.ruta)).ok);
  const restaurado=await restaurarRespaldo(backup.ruta,{silencioso:true}); comprobar("restauración aislada",restaurado.destino==="softarq_restauracion");
  const destino=new pg.Client({connectionString:urlDeRol("DATABASE_URL","softarq_app","softarq_restauracion").cadena}); await destino.connect();
  try {
    comprobar("destino comprobado",(await destino.query("SELECT current_database() b")).rows[0].b==="softarq_restauracion");
    const ev=(await destino.query("SELECT id,numero,resultado,nota,motivo FROM respuesta_cliente_evento WHERE emision_id=$1 ORDER BY numero",[eA.emision.id])).rows;
    comprobar("respuesta original restaurada íntegra sin corrección posterior",ev.length===1&&ev[0].id===primera.id&&ev[0].resultado==="ACEPTADA"&&ev[0].nota===respuesta.nota&&ev[0].motivo===null);
    comprobar("emisión y respuesta posteriores fuera del destino",(await destino.query("SELECT count(*)::int n FROM emision WHERE id=$1",[eB.emision.id])).rows[0].n===0&&(await destino.query("SELECT count(*)::int n FROM respuesta_cliente_evento WHERE id=$1",[segunda.id])).rows[0].n===0);
    const p=(await destino.query("SELECT has_table_privilege(current_user,'public.respuesta_cliente_evento','UPDATE') u,has_table_privilege(current_user,'public.respuesta_cliente_evento','DELETE') d,has_schema_privilege(current_user,'public','CREATE') ddl")).rows[0];comprobar("permisos mínimos tras restaurar",!p.u&&!p.d&&!p.ddl);
  } finally {await destino.end();}
  const vivo=await p.get(`/api/v1/emisiones/${eA.emision.id}/seguimiento`);comprobar("desarrollo conserva ambos eventos comerciales",vivo.historial.length===2&&vivo.respuestaVigente.id===correccion.id);
  const filas=(await clienteDb.query("SELECT to_jsonb(e) fila FROM emision e WHERE id=ANY($1::uuid[]) ORDER BY id",[anteriores.map(e=>e.fila.id)])).rows;
  comprobar("emisiones previas intactas",JSON.stringify(filas)===JSON.stringify(anteriores));
  for(const original of originales)comprobar(`PDF previo intacto ${original.id}`,await sha256Archivo(rutaDeClave(dirDocumentosDesarrollo(),original.clave))===original.sha);
  await p.salir();await r.salir();
  writeFileSync(join(dir,"informe.json"),JSON.stringify({resultados,respaldo:backup.ruta,folios:[qA.folio,qB.folio],emisiones:[eA.emision.id,eB.emision.id]},null,2),"utf8");
  console.log(`Resultado: ${resultados.length}/${resultados.length}. Evidencias: ${dir}`);
} catch(e) {writeFileSync(join(dir,"informe.json"),JSON.stringify({resultados,error:e.message},null,2),"utf8");console.error(e.message);process.exitCode=1;}
finally {await api?.close();await clienteDb.end();}
