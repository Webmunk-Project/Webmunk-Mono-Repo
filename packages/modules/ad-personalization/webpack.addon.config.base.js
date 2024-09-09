const path = require('path');
const webpack = require('webpack');
const { config } = require('dotenv');
const { parsed } = config({ path: `./.env.${process.env.BUILD_ENV}` })

module.exports = function config(browser){
  return {
    entry: {
      'content': [
        '/src/content.js',
      ],
      'worker': ['/src/worker.js']
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
      new webpack.EnvironmentPlugin({
        ...parsed,
        BUILD_ENV: process.env.BUILD_ENV,
      })
    ]
  }
}