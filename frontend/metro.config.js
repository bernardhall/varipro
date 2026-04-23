const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package exports to fix resolution issues with modern libraries like whatwg-url
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
