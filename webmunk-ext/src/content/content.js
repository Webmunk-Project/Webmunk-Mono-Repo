// this is where you could import your webmunk module content scripts
import { contentMgr as adsContentMgr } from "@webmunk/extension-ads/content.js";
import "cookies-module/dist/content.bundle";

// this sets the name of our extension mgr for the extension ads module to send ads content to.
adsContentMgr.setMainAppMgrName("extensionAdsAppMgr");
