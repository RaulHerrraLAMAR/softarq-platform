# Fuentes incluidas en la app

Las fuentes viajan **dentro de la app** (plugin `expo-font` en `app.config.ts`); no se descargan en tiempo de
ejecución ni se usa ningún CDN.

| Familia | Pesos incluidos | Autores | Licencia | Texto |
|---|---|---|---|---|
| Bricolage Grotesque | 600, 700, 800 | The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage) | SIL Open Font License 1.1 | [OFL-BricolageGrotesque.txt](OFL-BricolageGrotesque.txt) |
| Inter | 400, 500, 600 | The Inter Project Authors (https://github.com/rsms/inter) | SIL Open Font License 1.1 | [OFL-Inter.txt](OFL-Inter.txt) |

**Procedencia:** archivos TTF estáticos de los paquetes npm `@expo-google-fonts/bricolage-grotesque` 0.4.1 e
`@expo-google-fonts/inter` 0.4.2 (descargados una vez para extraerlos; no son dependencias del proyecto), junto con
el texto de la licencia que acompaña a cada paquete. No se modificaron.

La licencia OFL permite usar y redistribuir las fuentes dentro de una aplicación, siempre que se conserve el aviso
de derechos de autor y el texto de la licencia (este directorio). Las fuentes no se venden por separado.
