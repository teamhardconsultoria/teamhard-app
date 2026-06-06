const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// O @supabase/supabase-js puxa @opentelemetry que usa dynamic import()
// incompatível com o bundler do React Native. Mapeamos para módulo vazio.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@opentelemetry/')) {
    return { type: 'empty' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
