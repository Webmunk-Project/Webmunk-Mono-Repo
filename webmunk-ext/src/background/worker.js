// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker.js";

const appMgr =  {
  initialize:function(){
    messenger?.addReceiver('appMgr', this);
  }
};

appMgr.initialize();