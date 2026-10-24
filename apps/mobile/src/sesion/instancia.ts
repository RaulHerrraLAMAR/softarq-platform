import { URL_API } from "../config/entorno";
import { AlmacenSeguro } from "./almacen-seguro";
import { GestorSesion } from "./gestor";

/** Gestor único de la app: el token vive en SecureStore y, mientras dura la sesión, en memoria. */
export const gestor = new GestorSesion({ baseUrl: URL_API, almacen: new AlmacenSeguro() });
