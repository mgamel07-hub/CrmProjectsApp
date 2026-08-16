const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix: @supabase/auth-js imports ./lib/fetch relatively but Metro can't
  // resolve it. Use fs.existsSync to locate the real file from the origin dir.
  if (moduleName === './lib/fetch') {
    const originDir = path.dirname(context.originModulePath);
    const candidate = path.resolve(originDir, 'lib', 'fetch.js');
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, type: 'sourceFile' };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
