import { gestor } from "../sesion/instancia";
import { crearServicios } from "./cliente";

/** Servicios de la app sobre el cliente HTTP único de la sesión (el mismo que cancela todo al cambiar de cuenta). */
export const servicios = crearServicios(gestor.cliente);
