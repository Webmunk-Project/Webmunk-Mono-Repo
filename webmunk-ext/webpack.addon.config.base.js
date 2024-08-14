const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = function config(browser){
  return {
    entry: {
      'content': ['./src/content/content.js'],
      'options': ['/src/options/options.js'],
      'background': ['./src/background/worker.js'],
      'popup/popup': ['./src/popup/popup.js']
    },
    output: {
      path: path.join(__dirname, 'dist/'),
      filename: '[name].js',
      publicPath: "."
    },
    resolve: {
      extensions: ['.tsx','.ts', '.js']
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: './assets/icons', to: './icons' },
          { from: './assets/web_accessible_resources', to: './web_accessible_resources' },
          { from: './src/popup/popup.html', to: './popup/popup.html' },
          { from: './src/popup/popup.css', to: './popup/popup.css' },
          { from: './images', to: './images' },
          { from: './src/pages', to: './pages' },
          { from: './src/data', to: './data' },
          {
            from: path.resolve(__dirname, 'node_modules/@webmunk/extension-ads/ublock'),
            to: path.resolve(__dirname, 'dist/wm/ublock')
          }
        ]
      }),
      new Dotenv({
        path: `./.env.${process.env.BUILD_ENV}`,
      })
    ]
  }
}