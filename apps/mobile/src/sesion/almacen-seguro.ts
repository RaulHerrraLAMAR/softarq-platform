import * as SecureStore from "expo-secure-store";
import type { AlmacenToken } from "./almacen";

const CLAVE = "softarq.sesion.v1";

/** Token de sesión en el almacén seguro del dispositivo (Android Keystore). */
export class AlmacenSeguro implements AlmacenToken {
  async leer(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(CLAVE);
    } catch {
      return null; // un almacén ilegible equivale a no tener sesión
    }
  }

  async guardar(token: string): Promise<void> {
    await SecureStore.setItemAsync(CLAVE, token);
  }

  async borrar(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(CLAVE);
    } catch {
      // Sin nada que borrar o almacén no disponible: la sesión ya no se usa en memoria.
    }
  }
}
