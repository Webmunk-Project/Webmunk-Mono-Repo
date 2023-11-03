var _ = require('lodash')
var webpack = require('webpack')
const { mergeWithCustomize } = require('webpack-merge')
const baseConfig = require('./webpack.addon.config.base')("chrome")
const WebpackExtensionManifestPlugin = require('webpack-extension-manifest-plugin');
const manifestVersion = "3";
const baseManifest = require("./src/chrome/baseManifest.js");
const package = require('./package.json')
module.exports = mergeWithCustomize({
  customizeArray(a, b, key) {
    if (key === 'module.rules') {
      let _u = _.uniq([...a, ...b])
      return _u
    }

    // Fall back to default merging
    return undefined
  },
  customizeObject(a, b, key) {
    if (key === 'module') {
      // Custom merging
      return _.merge({}, a, b)
    }

    // Fall back to default merging
    return undefined
  }
})(baseConfig, {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {},
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          'babel-loader',
          {
            loader: 'webpack-preprocessor-loader',
            options: {
              directives: {},
              params: {
                target: 'addon',
                mode: 'development'
              }
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new webpack.ProvidePlugin({
      "React": "react",
    }),
    new WebpackExtensionManifestPlugin({
      config: {
        base: baseManifest,
        extend: {
          "name":baseManifest.name+"_dev",
          "version": package.version+"."+parseInt((Date.now()-1665497117452)/100000),
          "manifest_version":parseInt(manifestVersion)
        }
      }
    })
  ]
})
//console.log("module.exports: ",module.exports.plugins)
