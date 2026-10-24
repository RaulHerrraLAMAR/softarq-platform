// Metro con la configuración de Expo, que ya soporta monorepos pnpm desde el SDK 52: no se añaden
// watchFolders ni resolver.nodeModulesPaths (docs.expo.dev/guides/monorepos).
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
