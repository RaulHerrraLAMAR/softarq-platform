// setupFiles: cada proceso de prueba carga .env.test y valida el destino antes de cualquier prueba.
import { cargarEntornoDePrueba, urlDePrueba } from "./entorno.js";

cargarEntornoDePrueba();
urlDePrueba("DATABASE_URL");
urlDePrueba("MIGRATION_DATABASE_URL");
