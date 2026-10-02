/** Tokens de inyección: toda dependencia se inyecta con @Inject(TOKEN), sin depender de metadatos de tipos. */
export const CONFIGURACION = Symbol("CONFIGURACION");
export const BASE_DE_DATOS = Symbol("BASE_DE_DATOS");
export const REPOSITORIO_CATALOGOS = Symbol("REPOSITORIO_CATALOGOS");
export const CONTEXTO_SOLICITUD = Symbol("CONTEXTO_SOLICITUD");
export const RELOJ = Symbol("RELOJ");
