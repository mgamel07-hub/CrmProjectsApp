const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js uses .cjs files — Metro doesn't handle them by default
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// @supabase/auth-js internal relative imports fail with Metro's package-exports mode.
// Manually redirect ./lib/fetch to the exact file on disk.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './lib/fetch' &&
    context.originModulePath.includes(path.join('@supabase', 'auth-js'))
  ) {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/@supabase/auth-js/dist/main/lib/fetch.js'
      ),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
