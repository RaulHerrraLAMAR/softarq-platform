import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/** `true` mientras el teclado está abierto (para dar más sitio a los campos). */
export function useTecladoVisible(): boolean {
  const [visible, poner] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => poner(true));
    const b = Keyboard.addListener("keyboardDidHide", () => poner(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}
