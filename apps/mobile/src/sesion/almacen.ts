/**
 * Almacén del token de sesión móvil (ADR-0020 §3). Solo el token opaco, nada más: ni la contraseña, ni
 * el perfil, ni las capacidades (esas se piden al servidor cada vez que se restaura la sesión).
 *
 * Producción: `almacen-seguro.ts` (expo-secure-store: Android Keystore). Pruebas: `AlmacenMemoria`.
 * Prohibido: AsyncStorage, archivos, URLs, registros o variables `EXPO_PUBLIC_*`.
 */
export interface AlmacenToken {
  leer(): Promise<string | null>;
  guardar(token: string): Promise<void>;
  borrar(): Promise<void>;
}

export class AlmacenMemoria implements AlmacenToken {
  valor: string | null = null;
  constructor(inicial: string | null = null) {
    this.valor = inicial;
  }
  async leer() {
    return this.valor;
  }
  async guardar(token: string) {
    this.valor = token;
  }
  async borrar() {
    this.valor = null;
  }
}
