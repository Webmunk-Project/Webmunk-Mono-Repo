// dont remove next line, all webmunk modules use messenger utility
import { messenger } from "@webmunk/utils"
import { wmSessionMgr } from '@webmunk/utils';
import { RudderStack } from './rudderstack';

// this is where you could import your webmunk modules worker scripts
import "@webmunk/extension-ads/worker.js";
import "@webmunk/cookies-scraper/worker";

const appMgr =  {
  rudderStack: new RudderStack(),
  initialize(){
    messenger.addReceiver('appMgr', this);
    messenger.addModuleListener('ads-scraper', this.onModuleEvent.bind(this));
    messenger.addModuleListener('cookies-scraper', this.onModuleEvent.bind(this));
  },
  async onModuleEvent(event, data) {
    await this.rudderStack.track(event, data);
  },
};

appMgr.initialize();
