const _ = require('lodash');
const webpack = require('webpack');
const { mergeWithCustomize } = require('webpack-merge');
const baseConfig = require('./webpack.addon.config.base')("chrome");
const WebpackExtensionManifestPlugin = require('webpack-extension-manifest-plugin');
const manifestVersion = "3";
const mergeManifests = require('@webmunk/utils-scripts').mergeManifests;
const { manifest } = mergeManifests("@webmunk",__dirname,"src","src/chrome");
const baseManifest = manifest;
const package = require('./package.json');

module.exports = mergeWithCustomize({
  customizeArray(a, b, key) {
    if (key === 'module.rules') {
      let _u = _.uniq([...a, ...b])
      return _u
    }

    return undefined
  },
  customizeObject(a, b, key) {
    if (key === 'module') {
      return _.merge({}, a, b)
    }

    return undefined
  }})(baseConfig, {
  mode: 'production',
  devtool: 'inline-source-map',
  devServer: {},
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
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
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new WebpackExtensionManifestPlugin({
      config: {
        base: baseManifest,
        extend: {
          "name":baseManifest.name+"_prod",
          "version": package.version+"."+parseInt((Date.now()-1665497117452)/100000),
          "manifest_version":parseInt(manifestVersion),
        }
      }
    })
  ]
})
