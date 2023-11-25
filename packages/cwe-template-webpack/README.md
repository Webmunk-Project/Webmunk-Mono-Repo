# The webpack build template

This template is the default template used by the create-webmunk-ext script to create an initial tree structure.
As the name indicates, this template aims at engineers eager to use webpack for building their extension.
The tree structure include the following set of directories:
./  
|
+---src (where you include all your scripts ie worker, content, etc ...)
|
+---dist (where webpack generates the bundled scripts)
|
+---deliveries (where production builds end-up, ie zip files that can be uploaded in CWS) 

Regarding the src folder, 4 sub-folders are included with the appropriate js files:
- background/worker.js 
- content/content.js 
- options/options.js 
Those are the files used by the webpack build process to generate the corresponding extension scripts. This is where the developer will import the webmunk extension modules files. 
- chrome/baseManifest.json  is a manifest to be modified by the developer and includes new elements related to the final extension itself. The manifest.json "real" file will be built from this file and the manifest files of the webmunk extension modules. 

The template brings a few webpack configs which are used to build the extension.
- webpack.addon.config.base is the config used by all other webpack configs and include the targets, the assets to copy.
- webpack.addon.config.dev is the config to buid a development version for usage in unpackaged mode. It customizes the base webpack config. 
- webpack.addon.config.prod is the config to build a production version. End-product is the zip extension file. 

## Available Scripts

In the project directory, you can run: 

### `npm run addon:dev:hot`

Creates in /dist an unpackaged version of the extension in  development mode.

### `npm run addon:build:dev`

Creates in /deliveries a zipped version of the extension in dev mode.


### `npm run addon:build:prod`

Creates in /deliveries a zipped version of the extension in production mode.
Zip file can be uploaded on Chrome Web store.

Note: those scripts will also display a consolidated list of justifications for the permissions required by the imported webmunk extension modules. This info aims at facilitating the registration of the extension in the CWS (Chrome Web Store). 


## Importing a webmunk module
Refer to the README.md file of the webmunk extension module.


- __myext__
   - __deliveries__
   - __dist__
   - __src__
     - __background__
       - [worker.js](src/background/worker.js)
     - __chrome__
       - [baseManifest.json](src/chrome/baseManifest.json)
     - __content__
       - [content.js](src/content/content.js)
     - __options__
       - [options.js](src/options/options.js)
   - [webpack.addon.config.base.js](webpack.addon.config.base.js)
   - [webpack.addon.config.dev.js](webpack.addon.config.dev.js)

