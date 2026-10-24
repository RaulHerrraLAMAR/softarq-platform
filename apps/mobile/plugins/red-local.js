// Plugin de configuración: HTTP en claro SOLO hacia localhost y 127.0.0.1 (ADR-0020).
//
// La API del DEMO escucha en 127.0.0.1 y el teléfono la alcanza por USB (`adb reverse`), así que la app
// habla con `http://localhost:3000`. Android 9+ bloquea el HTTP en claro por omisión; en lugar de
// habilitarlo en toda la app (`usesCleartextTraffic`), se añade un `network_security_config.xml` con:
//   - base: sin texto claro (todo lo demás exige TLS y se validan los certificados del sistema);
//   - excepción: únicamente los dominios `localhost` y `127.0.0.1`, sin subdominios.
// No se desactiva ninguna validación TLS ni se confía en certificados de usuario.
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function conRedLocal(config) {
  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML, "utf8");
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return c;
  });
};

module.exports.XML = XML;
