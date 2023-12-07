## Using the extension-ads module
Once in your web extension directory
`npm i @webmunk/extension-ads`

In your web extension content script:
`import "@worker/extension-ads/content` 

In your web extension worker script:
`import "@worker/extension-ads/worker` 

If you have included module option UI in your manifest, then import your options script also:
`import "@worker/extension-ads/options` 
