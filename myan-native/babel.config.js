module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-worklets/plugin 은 babel-preset-expo(SDK 54+)가 자동 주입하므로
      // 여기에 reanimated/worklets 플러그인을 다시 넣지 않는다.
      ['module-resolver', {
        root: ['./'],
        alias: {
          '@src': './src',
          '@components': './components',
        },
      }],
    ],
  };
};
