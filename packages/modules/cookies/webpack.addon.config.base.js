const path = require('path');
const webpack = require('webpack');

module.exports = function config(browser){
  return {
    entry: {
      'content': [
        '/src/content/index.ts',
      ],
      'worker': ['/src/worker/index.ts']
    },
    output: {
      path: path.join(__dirname, 'dist/'),
      filename: '[name].js',
      publicPath: "."
    },
    resolve: {
      extensions: ['.tsx','.ts', '.js']
    },
  }
}