// The app imports platform-neutral game code from ../shared (protocol, transforms,
// renderer, client). Metro must watch that folder; it has no npm dependencies.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../shared")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
