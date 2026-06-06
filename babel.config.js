module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': '.',
          },
        },
      ],
      'react-native-reanimated/plugin',
      // Supabase inclui suporte opcional a OpenTelemetry via import(variavel),
      // que o Hermes nao suporta. Substituimos por Promise.resolve(null).
      function replaceVarDynamicImports() {
        return {
          visitor: {
            CallExpression(path) {
              if (
                path.node.callee.type === 'Import' &&
                path.node.arguments.length === 1 &&
                path.node.arguments[0].type === 'Identifier'
              ) {
                path.replaceWithSourceString('Promise.resolve(null)');
              }
            },
          },
        };
      },
    ],
  };
};
