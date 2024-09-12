const path = require('path');
const webpack = require('webpack');
const { config } = require('dotenv');
const CopyPlugin = require('copy-webpack-plugin');
const { parsed } = config({ path: `./.env.${process.env.BUILD_ENV}` })

module.exports = function config(browser){
  return {
    entry: {
      'content': [
        '/src/content/index.ts'
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
    plugins: [
      new webpack.EnvironmentPlugin({
        ...parsed,
        BUILD_ENV: process.env.BUILD_ENV,
      }),
      new CopyPlugin({
        patterns: [
          { from: './src/data', to: './data' },
        ]
      }),
    ]
  }
}