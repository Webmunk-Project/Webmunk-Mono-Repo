/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

/* globals browser */

'use strict';

/******************************************************************************/

var debug = {
    messaging: false
};

import publicSuffixList from './lib/publicsuffixlist/publicsuffixlist.js';
import punycode from './lib/punycode.js';

import cacheStorage from './cachestorage.js';
import cosmeticFilteringEngine from './cosmetic-filtering.js';
import htmlFilteringEngine from './html-filtering.js';
import logger from './logger.js';
import lz4Codec from './lz4.js';
import io from './assets.js';
import scriptletFilteringEngine from './scriptlet-filtering.js';
import staticFilteringReverseLookup from './reverselookup.js';
import staticNetFilteringEngine from './static-net-filtering.js';
import webRequest from './traffic.js';
import { denseBase64 } from './base64-custom.js';
import { dnrRulesetFromRawLists } from './static-dnr-filtering.js';
import { i18n$ } from './i18n.js';
import { redirectEngine } from './redirect-engine.js';
import * as sfp from './static-filtering-parser.js';

import {
    permanentFirewall,
    sessionFirewall,
    permanentSwitches,
    sessionSwitches,
    permanentURLFiltering,
    sessionURLFiltering,
} from './filtering-engines.js';

import {
    domainFromHostname,
    domainFromURI,
    entityFromDomain,
    hostnameFromURI,
    isNetworkURI,
} from './uri-utils.js';

import './benchmarks.js';

/******************************************************************************/

// https://github.com/uBlockOrigin/uBlock-issues/issues/710
//   Listeners have a name and a "privileged" status.
//   The nameless default handler is always deemed "privileged".
//   Messages from privileged ports must never relayed to listeners
//   which are not privileged.

/******************************************************************************/
/******************************************************************************/

// Default handler
//      privileged

{
// >>>>> start of local scope

const clickToLoad = function(request, sender) {
    const { tabId, frameId } = sender;
    if ( tabId === undefined || frameId === undefined ) { return false; }
    const pageStore = self.µBlock.pageStoreFromTabId(tabId);
    if ( pageStore === null ) { return false; }
    pageStore.clickToLoad(frameId, request.frameURL);
    return true;
};

const getDomainNames = function(targets) {
    return targets.map(target => {
        if ( typeof target !== 'string' ) { return ''; }
        return target.indexOf('/') !== -1
            ? domainFromURI(target) || ''
            : domainFromHostname(target) || target;
    });
};

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    case 'getAssetContent':
        // https://github.com/chrisaljoudi/uBlock/issues/417
        io.get(request.url, {
            dontCache: true,
            needSourceURL: true,
        }).then(result => {
            callback(result);
        });
        return;

    case 'listsFromNetFilter':
        staticFilteringReverseLookup.fromNetFilter(
            request.rawFilter
        ).then(response => {
            callback(response);
        });
        return;

    case 'listsFromCosmeticFilter':
        staticFilteringReverseLookup.fromExtendedFilter(
            request
        ).then(response => {
            callback(response);
        });
        return;

    case 'reloadAllFilters':
        self.µBlock.loadFilterLists().then(( ) => { callback(); });
        return;

    case 'scriptlet':
        vAPI.tabs.executeScript(request.tabId, {
            file: `/js/scriptlets/${request.scriptlet}.js`
        }).then(result => {
            callback(result);
        });
        return;

    case 'snfeBenchmark':
        self.µBlock.benchmarkStaticNetFiltering({ redirectEngine }).then(result => {
            callback(result);
        });
        return;

    case 'snfeToDNR': {
        const listPromises = [];
        const listNames = [];
        for ( const assetKey of self.µBlock.selectedFilterLists ) {
            listPromises.push(
                io.get(assetKey, { dontCache: true }).then(details => {
                    listNames.push(assetKey);
                    return { name: assetKey, text: details.content };
                })
            );
        }
        const options = {
            extensionPaths: redirectEngine.getResourceDetails(),
            env: vAPI.webextFlavor.env,
        };
        const t0 = Date.now();
        dnrRulesetFromRawLists(listPromises, options).then(result => {
            const { network } = result;
            const replacer = (k, v) => {
                if ( k.startsWith('__') ) { return; }
                if ( Array.isArray(v) ) {
                    return v.sort();
                }
                if ( v instanceof Object ) {
                    const sorted = {};
                    for ( const kk of Object.keys(v).sort() ) {
                        sorted[kk] = v[kk];
                    }
                    return sorted;
                }
                return v;
            };
            const isUnsupported = rule =>
                rule._error !== undefined;
            const isRegex = rule =>
                rule.condition !== undefined &&
                rule.condition.regexFilter !== undefined;
            const isRedirect = rule =>
                rule.action !== undefined &&
                rule.action.type === 'redirect' &&
                rule.action.redirect.extensionPath !== undefined;
            const isCsp = rule =>
                rule.action !== undefined &&
                rule.action.type === 'modifyHeaders';
            const isRemoveparam = rule =>
                rule.action !== undefined &&
                rule.action.type === 'redirect' &&
                rule.action.redirect.transform !== undefined;
            const runtime = Date.now() - t0;
            const { ruleset } = network;
            const out = [
                `dnrRulesetFromRawLists(${JSON.stringify(listNames, null, 2)})`,
                `Run time: ${runtime} ms`,
                `Filters count: ${network.filterCount}`,
                `Accepted filter count: ${network.acceptedFilterCount}`,
                `Rejected filter count: ${network.rejectedFilterCount}`,
                `Resulting DNR rule count: ${ruleset.length}`,
            ];
            const good = ruleset.filter(rule =>
                isUnsupported(rule) === false &&
                isRegex(rule) === false &&
                isRedirect(rule) === false &&
                isCsp(rule) === false &&
                isRemoveparam(rule) === false
            );
            out.push(`+ Good filters (${good.length}): ${JSON.stringify(good, replacer, 2)}`);
            const regexes = ruleset.filter(rule =>
                isUnsupported(rule) === false &&
                isRegex(rule) &&
                isRedirect(rule) === false &&
                isCsp(rule) === false &&
                isRemoveparam(rule) === false
            );
            out.push(`+ Regex-based filters (${regexes.length}): ${JSON.stringify(regexes, replacer, 2)}`);
            const redirects = ruleset.filter(rule =>
                isUnsupported(rule) === false &&
                isRedirect(rule)
            );
            out.push(`+ 'redirect=' filters (${redirects.length}): ${JSON.stringify(redirects, replacer, 2)}`);
            const headers = ruleset.filter(rule =>
                isUnsupported(rule) === false &&
                isCsp(rule)
            );
            out.push(`+ 'csp=' filters (${headers.length}): ${JSON.stringify(headers, replacer, 2)}`);
            const removeparams = ruleset.filter(rule =>
                isUnsupported(rule) === false &&
                isRemoveparam(rule)
            );
            out.push(`+ 'removeparam=' filters (${removeparams.length}): ${JSON.stringify(removeparams, replacer, 2)}`);
            const bad = ruleset.filter(rule =>
                isUnsupported(rule)
            );
            out.push(`+ Unsupported filters (${bad.length}): ${JSON.stringify(bad, replacer, 2)}`);
            out.push(`+ generichide exclusions (${network.generichideExclusions.length}): ${JSON.stringify(network.generichideExclusions, replacer, 2)}`);
            out.push(`+ Cosmetic filters: ${result.specificCosmetic.size}`);
            for ( const details of result.specificCosmetic ) {
                out.push(`    ${JSON.stringify(details)}`);
            }

            callback(out.join('\n'));
        });
        return;
    }

    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'applyFilterListSelection':
        response = self.µBlock.applyFilterListSelection(request);
        break;

    case 'clickToLoad':
        response = clickToLoad(request, sender);
        break;

    case 'createUserFilter':
        self.µBlock.createUserFilters(request);
        break;

    case 'forceUpdateAssets':
        self.µBlock.scheduleAssetUpdater(0);
        io.updateStart({
            delay: self.µBlock.hiddenSettings.manualUpdateAssetFetchPeriod
        });
        break;

    case 'getAppData':
        response = {
            name: browser.runtime.getManifest().name,
            version: vAPI.app.version,
            canBenchmark: self.µBlock.hiddenSettings.benchmarkDatasetURL !== 'unset',
        };
        break;

    case 'getDomainNames':
        response = getDomainNames(request.targets);
        break;

    case 'getWhitelist':
        response = {
            whitelist: self.µBlock.arrayFromWhitelist(self.µBlock.netWhitelist),
            whitelistDefault: self.µBlock.netWhitelistDefault,
            reBadHostname: self.µBlock.reWhitelistBadHostname.source,
            reHostnameExtractor: self.µBlock.reWhitelistHostnameExtractor.source
        };
        break;

    case 'launchElementPicker':
        // Launched from some auxiliary pages, clear context menu coords.
        self.µBlock.epickerArgs.mouse = false;
        self.µBlock.elementPickerExec(request.tabId, 0, request.targetURL, request.zap);
        break;

    case 'loggerDisabled':
        self.µBlock.clearInMemoryFilters();
        break;

    case 'gotoURL':
        self.µBlock.openNewTab(request.details);
        break;

    case 'readyToFilter':
        response = self.µBlock.readyToFilter;
        break;

    // https://github.com/uBlockOrigin/uBlock-issues/issues/1954
    //   In case of document-blocked page, navigate to blocked URL instead
    //   of forcing a reload.
    case 'reloadTab': {
        if ( vAPI.isBehindTheSceneTabId(request.tabId) ) { break; }
        const { tabId, bypassCache, url, select } = request;
        vAPI.tabs.get(tabId).then(tab => {
            if ( url && tab && url !== tab.url ) {
                vAPI.tabs.replace(tabId, url);
            } else {
                vAPI.tabs.reload(tabId, bypassCache === true);
            }
        });
        if ( select && vAPI.tabs.select ) {
            vAPI.tabs.select(tabId);
        }
        break;
    }
    case 'setWhitelist':
        self.µBlock.netWhitelist = self.µBlock.whitelistFromString(request.whitelist);
        self.µBlock.saveWhitelist();
        break;

    case 'toggleHostnameSwitch':
        self.µBlock.toggleHostnameSwitch(request);
        break;

    case 'uiAccentStylesheet':
        self.µBlock.uiAccentStylesheet = request.stylesheet;
        break;

    case 'uiStyles':
        response = {
            uiAccentCustom: self.µBlock.userSettings.uiAccentCustom,
            uiAccentCustom0: self.µBlock.userSettings.uiAccentCustom0,
            uiAccentStylesheet: self.µBlock.uiAccentStylesheet,
            uiStyles: self.µBlock.hiddenSettings.uiStyles,
            uiTheme: self.µBlock.userSettings.uiTheme,
        };
        break;

    case 'userSettings':
        response = self.µBlock.changeUserSettings(request.name, request.value);
        if ( response instanceof Object ) {
            if ( vAPI.net.canUncloakCnames !== true ) {
                response.cnameUncloakEnabled = undefined;
            }
            response.canLeakLocalIPAddresses =
                vAPI.browserSettings.canLeakLocalIPAddresses === true;
        }
        break;

    case 'snfeDump':
        response = staticNetFilteringEngine.dump();
        break;

    case 'cfeDump':
        response = cosmeticFilteringEngine.dump();
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.setup(onMessage);

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      popupPanel
//      privileged

{
// >>>>> start of local scope

const createCounts = ( ) => {
    return {
        blocked: { any: 0, frame: 0, script: 0 },
        allowed: { any: 0, frame: 0, script: 0 },
    };
};

const getHostnameDict = function(hostnameDetailsMap, out) {
    const hnDict = Object.create(null);
    const cnMap = [];

    const createDictEntry = (domain, hostname, details) => {
        const cname = vAPI.net.canonicalNameFromHostname(hostname);
        if ( cname !== undefined ) {
            cnMap.push([ cname, hostname ]);
        }
        hnDict[hostname] = { domain, counts: details.counts };
    };

    for ( const hnDetails of hostnameDetailsMap.values() ) {
        const hostname = hnDetails.hostname;
        if ( hnDict[hostname] !== undefined ) { continue; }
        const domain = domainFromHostname(hostname) || hostname;
        const dnDetails =
            hostnameDetailsMap.get(domain) || { counts: createCounts() };
        if ( hnDict[domain] === undefined ) {
            createDictEntry(domain, domain, dnDetails);
        }
        if ( hostname === domain ) { continue; }
        createDictEntry(domain, hostname, hnDetails);
    }

    out.hostnameDict = hnDict;
    out.cnameMap = cnMap;
};

const firewallRuleTypes = [
    '*',
    'image',
    '3p',
    'inline-script',
    '1p-script',
    '3p-script',
    '3p-frame',
];

const getFirewallRules = function(src, out) {
    const ruleset = out.firewallRules = {};
    const df = sessionFirewall;

    for ( const type of firewallRuleTypes ) {
        const r = df.lookupRuleData('*', '*', type);
        if ( r === undefined ) { continue; }
        ruleset[`/ * ${type}`] = r;
    }
    if ( typeof src !== 'string' ) { return; }

    for ( const type of firewallRuleTypes ) {
        const r = df.lookupRuleData(src, '*', type);
        if ( r === undefined ) { continue; }
        ruleset[`. * ${type}`] = r;
    }

    const { hostnameDict } = out;
    for ( const des in hostnameDict ) {
        let r = df.lookupRuleData('*', des, '*');
        if ( r !== undefined ) { ruleset[`/ ${des} *`] = r; }
        r = df.lookupRuleData(src, des, '*');
        if ( r !== undefined ) { ruleset[`. ${des} *`] = r; }
    }
};

const popupDataFromTabId = function(tabId, tabTitle) {
    const tabContext = self.µBlock.tabContextManager.mustLookup(tabId);
    const rootHostname = tabContext.rootHostname;
    const µbus = self.µBlock.userSettings;
    const µbhs = self.µBlock.hiddenSettings;
    const r = {
        advancedUserEnabled: µbus.advancedUserEnabled,
        appName: vAPI.app.name,
        appVersion: vAPI.app.version,
        colorBlindFriendly: µbus.colorBlindFriendly,
        cosmeticFilteringSwitch: false,
        firewallPaneMinimized: µbus.firewallPaneMinimized,
        globalAllowedRequestCount: self.µBlock.localSettings.allowedRequestCount,
        globalBlockedRequestCount: self.µBlock.localSettings.blockedRequestCount,
        fontSize: µbhs.popupFontSize,
        godMode: µbhs.filterAuthorMode,
        netFilteringSwitch: false,
        rawURL: tabContext.rawURL,
        pageURL: tabContext.normalURL,
        pageHostname: rootHostname,
        pageDomain: tabContext.rootDomain,
        popupBlockedCount: 0,
        popupPanelSections: µbus.popupPanelSections,
        popupPanelDisabledSections: µbhs.popupPanelDisabledSections,
        popupPanelLockedSections: µbhs.popupPanelLockedSections,
        popupPanelHeightMode: µbhs.popupPanelHeightMode,
        tabId,
        tabTitle,
        tooltipsDisabled: µbus.tooltipsDisabled,
        hasUnprocessedRequest: vAPI.net && vAPI.net.hasUnprocessedRequest(tabId),
    };

    if ( µbhs.uiPopupConfig !== 'unset' ) {
        r.uiPopupConfig = µbhs.uiPopupConfig;
    }

    const pageStore = self.µBlock.pageStoreFromTabId(tabId);
    if ( pageStore ) {
        r.pageCounts = pageStore.counts;
        r.netFilteringSwitch = pageStore.getNetFilteringSwitch();
        getHostnameDict(pageStore.getAllHostnameDetails(), r);
        r.contentLastModified = pageStore.contentLastModified;
        getFirewallRules(rootHostname, r);
        r.canElementPicker = isNetworkURI(r.rawURL);
        r.noPopups = sessionSwitches.evaluateZ(
            'no-popups',
            rootHostname
        );
        r.popupBlockedCount = pageStore.popupBlockedCount;
        r.noCosmeticFiltering = sessionSwitches.evaluateZ(
            'no-cosmetic-filtering',
            rootHostname
        );
        r.noLargeMedia = sessionSwitches.evaluateZ(
            'no-large-media',
            rootHostname
        );
        r.largeMediaCount = pageStore.largeMediaCount;
        r.noRemoteFonts = sessionSwitches.evaluateZ(
            'no-remote-fonts',
            rootHostname
        );
        r.remoteFontCount = pageStore.remoteFontCount;
        r.noScripting = sessionSwitches.evaluateZ(
            'no-scripting',
            rootHostname
        );
    } else {
        r.hostnameDict = {};
        getFirewallRules(undefined, r);
    }

    r.matrixIsDirty = sessionFirewall.hasSameRules(
        permanentFirewall,
        rootHostname,
        r.hostnameDict
    ) === false;
    if ( r.matrixIsDirty === false ) {
        r.matrixIsDirty = sessionSwitches.hasSameRules(
            permanentSwitches,
            rootHostname
        ) === false;
    }
    return r;
};

const popupDataFromRequest = async function(request) {
    if ( request.tabId ) {
        return popupDataFromTabId(request.tabId, '');
    }

    // Still no target tab id? Use currently selected tab.
    const tab = await vAPI.tabs.getCurrent();
    let tabId = '';
    let tabTitle = '';
    if ( tab instanceof Object ) {
        tabId = tab.id;
        tabTitle = tab.title || '';
    }
    return popupDataFromTabId(tabId, tabTitle);
};

const getElementCount = async function(tabId, what) {
    const results = await vAPI.tabs.executeScript(tabId, {
        allFrames: true,
        file: `/js/scriptlets/dom-survey-${what}.js`,
        runAt: 'document_end',
    });

    let total = 0;
    for ( const count of results ) {
        if ( typeof count !== 'number' ) { continue; }
        if ( count === -1 ) { return -1; }
        total += count;
    }

    return total;
};

const launchReporter = async function(request) {
    const pageStore = self.µBlock.pageStoreFromTabId(request.tabId);
    if ( pageStore === null ) { return; }
    if ( pageStore.hasUnprocessedRequest ) {
        request.popupPanel.hasUnprocessedRequest = true;
    }

    const entries = await io.getUpdateAges({
        filters: self.µBlock.selectedFilterLists.slice()
    });
    let shouldUpdateLists = false;
    for ( const entry of entries ) {
        if ( entry.age < (2 * 60 * 60 * 1000) ) { continue; }
        io.purge(entry.assetKey);
        shouldUpdateLists = true;
    }

    // https://github.com/gorhill/uBlock/commit/6efd8eb#commitcomment-107523558
    //   Important: for whatever reason, not using `document_start` causes the
    //   Promise returned by `tabs.executeScript()` to resolve only when the
    //   associated tab is closed.
    const cosmeticSurveyResults = await vAPI.tabs.executeScript(request.tabId, {
        allFrames: true,
        file: '/js/scriptlets/cosmetic-report.js',
        matchAboutBlank: true,
        runAt: 'document_start',
    });

    const filters = cosmeticSurveyResults.reduce((a, v) => {
        if ( Array.isArray(v) ) { a.push(...v); }
        return a;
    }, []);
    // Remove duplicate, truncate too long filters.
    if ( filters.length !== 0 ) {
        request.popupPanel.extended = Array.from(
            new Set(filters.map(s => s.length <= 64 ? s : `${s.slice(0, 64)}…`))
        );
    }

    const supportURL = new URL(vAPI.getURL('support.html'));
    supportURL.searchParams.set('pageURL', request.pageURL);
    supportURL.searchParams.set('popupPanel', JSON.stringify(request.popupPanel));
    if ( shouldUpdateLists ) {
        supportURL.searchParams.set('shouldUpdate', 1);
    }
    return supportURL.href;
};

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    case 'getHiddenElementCount':
        getElementCount(request.tabId, 'elements').then(count => {
            callback(count);
        });
        return;

    case 'getScriptCount':
        getElementCount(request.tabId, 'scripts').then(count => {
            callback(count);
        });
        return;

    case 'getPopupData':
        popupDataFromRequest(request).then(popupData => {
            callback(popupData);
        });
        return;

    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'dismissUnprocessedRequest':
        vAPI.net.removeUnprocessedRequest(request.tabId);
        self.µBlock.updateToolbarIcon(request.tabId, 0b110);
        break;

    case 'hasPopupContentChanged': {
        const pageStore = self.µBlock.pageStoreFromTabId(request.tabId);
        const lastModified = pageStore ? pageStore.contentLastModified : 0;
        response = lastModified !== request.contentLastModified;
        break;
    }

    case 'launchReporter': {
        launchReporter(request).then(url => {
            if ( typeof url !== 'string' ) { return; }
            self.µBlock.openNewTab({ url, select: true, index: -1 });
        });
        break;
    }

    case 'revertFirewallRules':
        // TODO: use Set() to message around sets of hostnames
        sessionFirewall.copyRules(
            permanentFirewall,
            request.srcHostname,
            Object.assign(Object.create(null), request.desHostnames)
        );
        sessionSwitches.copyRules(
            permanentSwitches,
            request.srcHostname
        );
        // https://github.com/gorhill/uBlock/issues/188
        cosmeticFilteringEngine.removeFromSelectorCache(
            request.srcHostname,
            'net'
        );
        self.µBlock.updateToolbarIcon(request.tabId, 0b100);
        response = popupDataFromTabId(request.tabId);
        break;

    case 'saveFirewallRules':
        // TODO: use Set() to message around sets of hostnames
        if (
            permanentFirewall.copyRules(
                sessionFirewall,
                request.srcHostname,
                Object.assign(Object.create(null), request.desHostnames)
            )
        ) {
            self.µBlock.savePermanentFirewallRules();
        }
        if (
            permanentSwitches.copyRules(
                sessionSwitches,
                request.srcHostname
            )
        ) {
            self.µBlock.saveHostnameSwitches();
        }
        break;

    case 'toggleHostnameSwitch':
        self.µBlock.toggleHostnameSwitch(request);
        response = popupDataFromTabId(request.tabId);
        break;

    case 'toggleFirewallRule':
        self.µBlock.toggleFirewallRule(request);
        response = popupDataFromTabId(request.tabId);
        break;

    case 'toggleNetFiltering': {
        const pageStore = self.µBlock.pageStoreFromTabId(request.tabId);
        if ( pageStore ) {
            pageStore.toggleNetFilteringSwitch(
                request.url,
                request.scope,
                request.state
            );
            self.µBlock.updateToolbarIcon(request.tabId, 0b111);
        }
        break;
    }
    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'popupPanel',
    listener: onMessage,
    privileged: true,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      contentscript
//      unprivileged

{
// >>>>> start of local scope

const retrieveContentScriptParameters = async function(sender, request) {
    if ( self.µBlock.readyToFilter !== true ) { return; }
    const { tabId, frameId } = sender;
    if ( tabId === undefined || frameId === undefined ) { return; }

    const pageStore = self.µBlock.pageStoreFromTabId(tabId);
    if ( pageStore === null || pageStore.getNetFilteringSwitch() === false ) {
        if ( pageStore === null) console.log("retrieveContentScriptParameters: pageStore is null for tab");
        else if ( pageStore.getNetFilteringSwitch() === false) console.log("retrieveContentScriptParameters: getNetFilteringSwitch() is null for pageStore");

        return;
    }

    // A content script may not always be able to successfully look up the
    // effective context, hence in such case we try again to look up here
    // using cached information about embedded frames.
    if ( frameId !== 0 && request.url.startsWith('about:') ) {
        request.url = pageStore.getEffectiveFrameURL(sender);
    }

    const noSpecificCosmeticFiltering =
        pageStore.shouldApplySpecificCosmeticFilters(frameId) === false;
    const noGenericCosmeticFiltering = false;
    //    pageStore.shouldApplyGenericCosmeticFilters(frameId) === false;

    const response = {
        collapseBlocked: self.µBlock.userSettings.collapseBlocked,
        noGenericCosmeticFiltering,
        noSpecificCosmeticFiltering,
    };

    request.tabId = tabId;
    request.frameId = frameId;
    request.hostname = hostnameFromURI(request.url);
    request.domain = domainFromHostname(request.hostname);
    request.entity = entityFromDomain(request.domain);

    const scf = response.specificCosmeticFilters =
        cosmeticFilteringEngine.retrieveSpecificSelectors(request, response);

    // The procedural filterer's code is loaded only when needed and must be
    // present before returning response to caller.
    if (
        scf.proceduralFilters.length !== 0 || (
            logger.enabled && (
                scf.convertedProceduralFilters.length !== 0 ||
                scf.exceptedFilters.length !== 0                
            )
        )
    ) {
        await vAPI.tabs.executeScript(tabId, {
            allFrames: false,
            file: '/js/contentscript-extra.js',
            frameId,
            matchAboutBlank: true,
            runAt: 'document_start',
        });
    }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/688#issuecomment-748179731
    //   For non-network URIs, scriptlet injection is deferred to here. The
    //   effective URL is available here in `request.url`.
    if ( logger.enabled || request.needScriptlets ) {
        const scriptletDetails = scriptletFilteringEngine.injectNow(request);
        if ( scriptletDetails !== undefined ) {
            if ( logger.enabled ) {
                scriptletFilteringEngine.logFilters(
                    tabId,
                    request.url,
                    scriptletDetails.filters
                );
            }
            if ( request.needScriptlets ) {
                response.scriptletDetails = scriptletDetails;
            }
        }
    }

    // https://github.com/NanoMeow/QuickReports/issues/6#issuecomment-414516623
    //   Inject as early as possible to make the cosmetic logger code less
    //   sensitive to the removal of DOM nodes which may match injected
    //   cosmetic filters.
    if ( logger.enabled ) {
        if (
            noSpecificCosmeticFiltering === false ||
            noGenericCosmeticFiltering === false
        ) {
            vAPI.tabs.executeScript(tabId, {
                allFrames: false,
                file: '/js/scriptlets/cosmetic-logger.js',
                frameId,
                matchAboutBlank: true,
                runAt: 'document_start',
            });
        }
    }

    return response;
};

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    case 'retrieveContentScriptParameters':
        //if (sender.frameId !=0) return null;
        return retrieveContentScriptParameters(
            sender,
            request
        ).then(response => {
            debug.messaging && console.log("retrieveContentScriptParameters:",response?.specificCosmeticFilters?.injectedCSS)
            callback(response);
        });
    default:
        break;
    }

    const pageStore = self.µBlock.pageStoreFromTabId(sender.tabId);

    // Sync
    let response;

    switch ( request.what ) {
    case 'cosmeticFiltersInjected':
        cosmeticFilteringEngine.addToSelectorCache(request);
        break;

    case 'disableGenericCosmeticFilteringSurveyor':
        cosmeticFilteringEngine.disableSurveyor(request);
        break;

    case 'getCollapsibleBlockedRequests':
        response = {
            id: request.id,
            hash: request.hash,
            netSelectorCacheCountMax:
                cosmeticFilteringEngine.netSelectorCacheCountMax,
        };
        if (
            self.µBlock.userSettings.collapseBlocked &&
            pageStore && pageStore.getNetFilteringSwitch()
        ) {
            pageStore.getBlockedResources(request, response);
        }
        break;

    case 'maybeGoodPopup':
        self.µBlock.maybeGoodPopup.tabId = sender.tabId;
        self.µBlock.maybeGoodPopup.url = request.url;
        break;

    case 'shouldRenderNoscriptTags':
        if ( pageStore === null ) { break; }
        const fctxt = self.µBlock.filteringContext.fromTabId(sender.tabId);
        if ( pageStore.filterScripting(fctxt, undefined) ) {
            vAPI.tabs.executeScript(sender.tabId, {
                file: '/js/scriptlets/noscript-spoof.js',
                frameId: sender.frameId,
                runAt: 'document_end',
            });
        }
        break;

    case 'retrieveGenericCosmeticSelectors':
        request.tabId = sender.tabId;
        request.frameId = sender.frameId;
        response = {
            result: cosmeticFilteringEngine.retrieveGenericSelectors(request),
        };
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'contentscript',
    listener: onMessage,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      elementPicker
//      unprivileged

{
// >>>>> start of local scope

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    // The procedural filterer must be present in case the user wants to
    // type-in custom filters.
    case 'elementPickerArguments':
        return vAPI.tabs.executeScript(sender.tabId, {
            allFrames: false,
            file: '/js/contentscript-extra.js',
            frameId: sender.frameId,
            matchAboutBlank: true,
            runAt: 'document_start',
        }).then(( ) => {
            callback({
                target: self.µBlock.epickerArgs.target,
                mouse: self.µBlock.epickerArgs.mouse,
                zap: self.µBlock.epickerArgs.zap,
                eprom: self.µBlock.epickerArgs.eprom,
                pickerURL: vAPI.getURL(
                    `/web_accessible_resources/epicker-ui.html?secret=${vAPI.warSecret.short()}`
                ),
            });
            self.µBlock.epickerArgs.target = '';
        });
    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'elementPickerEprom':
        self.µBlock.epickerArgs.eprom = request;
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'elementPicker',
    listener: onMessage,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      cloudWidget
//      privileged

{
// >>>>> start of local scope

const fromBase64 = function(encoded) {
    if ( typeof encoded !== 'string' ) {
        return Promise.resolve(encoded);
    }
    let u8array;
    try {
        u8array = denseBase64.decode(encoded);
    } catch(ex) {
    }
    return Promise.resolve(u8array !== undefined ? u8array : encoded);
};

const toBase64 = function(data) {
    const value = data instanceof Uint8Array
        ? denseBase64.encode(data)
        : data;
    return Promise.resolve(value);
};

const compress = function(json) {
    return lz4Codec.encode(json, toBase64);
};

const decompress = function(encoded) {
    return lz4Codec.decode(encoded, fromBase64);
};

const onMessage = function(request, sender, callback) {
    // Cloud storage support is optional.
    if ( self.µBlock.cloudStorageSupported !== true ) {
        callback();
        return;
    }

    // Async
    switch ( request.what ) {
    case 'cloudGetOptions':
        vAPI.cloud.getOptions(function(options) {
            options.enabled = self.µBlock.userSettings.cloudStorageEnabled === true;
            callback(options);
        });
        return;

    case 'cloudSetOptions':
        vAPI.cloud.setOptions(request.options, callback);
        return;

    case 'cloudPull':
        request.decode = decompress;
        return vAPI.cloud.pull(request).then(result => {
            callback(result);
        });

    case 'cloudPush':
        if ( self.µBlock.hiddenSettings.cloudStorageCompression ) {
            request.encode = compress;
        }
        return vAPI.cloud.push(request).then(result => {
            callback(result);
        });

    case 'cloudUsed':
        return vAPI.cloud.used(request.datakey).then(result => {
            callback(result);
        });

    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    // For when cloud storage is disabled.
    case 'cloudPull':
        // fallthrough
    case 'cloudPush':
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'cloudWidget',
    listener: onMessage,
    privileged: true,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      dashboard
//      privileged

{
// >>>>> start of local scope

// Settings
const getLocalData = async function() {
    const data = Object.assign({}, self.µBlock.restoreBackupSettings);
    data.storageUsed = await self.µBlock.getBytesInUse();
    data.cloudStorageSupported = self.µBlock.cloudStorageSupported;
    data.privacySettingsSupported = self.µBlock.privacySettingsSupported;
    return data;
};

const backupUserData = async function() {
    const userFilters = await self.µBlock.loadUserFilters();

    const userData = {
        timeStamp: Date.now(),
        version: vAPI.app.version,
        userSettings:
            self.µBlock.getModifiedSettings(self.µBlock.userSettings, self.µBlock.userSettingsDefault),
        selectedFilterLists: self.µBlock.selectedFilterLists,
        hiddenSettings:
            self.µBlock.getModifiedSettings(self.µBlock.hiddenSettings, self.µBlock.hiddenSettingsDefault),
        whitelist: self.µBlock.arrayFromWhitelist(self.µBlock.netWhitelist),
        dynamicFilteringString: permanentFirewall.toString(),
        urlFilteringString: permanentURLFiltering.toString(),
        hostnameSwitchesString: permanentSwitches.toString(),
        userFilters: userFilters.content,
    };

    const filename = i18n$('aboutBackupFilename')
        .replace('{{datetime}}', self.µBlock.dateNowToSensibleString())
        .replace(/ +/g, '_');
    self.µBlock.restoreBackupSettings.lastBackupFile = filename;
    self.µBlock.restoreBackupSettings.lastBackupTime = Date.now();
    vAPI.storage.set(self.µBlock.restoreBackupSettings);

    const localData = await getLocalData();

    return { localData, userData };
};

const restoreUserData = async function(request) {
    const userData = request.userData;

    // https://github.com/LiCybora/NanoDefenderFirefox/issues/196
    //   Backup data could be from Chromium platform or from an older
    //   Firefox version.
    if (
        vAPI.webextFlavor.soup.has('firefox') &&
        vAPI.app.intFromVersion(userData.version) <= 1031003011
    ) {
        userData.hostnameSwitchesString += '\nno-csp-reports: * true';
    }

    // List of external lists is meant to be a string.
    if ( Array.isArray(userData.externalLists) ) {
        userData.externalLists = userData.externalLists.join('\n');
    }

    // https://github.com/chrisaljoudi/uBlock/issues/1102
    //   Ensure all currently cached assets are flushed from storage AND memory.
    io.rmrf();

    // If we are going to restore all, might as well wipe out clean local
    // storages
    await Promise.all([
        cacheStorage.clear(),
        vAPI.storage.clear(),
    ]);

    // Restore block stats
    self.µBlock.saveLocalSettings();

    // Restore user data
    vAPI.storage.set(userData.userSettings);

    // Restore advanced settings.
    let hiddenSettings = userData.hiddenSettings;
    if ( hiddenSettings instanceof Object === false ) {
        hiddenSettings = self.µBlock.hiddenSettingsFromString(
            userData.hiddenSettingsString || ''
        );
    }
    // Discard unknown setting or setting with default value.
    for ( const key in hiddenSettings ) {
        if (
            self.µBlock.hiddenSettingsDefault.hasOwnProperty(key) === false ||
            hiddenSettings[key] === self.µBlock.hiddenSettingsDefault[key]
        ) {
            delete hiddenSettings[key];
        }
    }

    // Whitelist directives can be represented as an array or as a
    // (eventually to be deprecated) string.
    let whitelist = userData.whitelist;
    if (
        Array.isArray(whitelist) === false &&
        typeof userData.netWhitelist === 'string' &&
        userData.netWhitelist !== ''
    ) {
        whitelist = userData.netWhitelist.split('\n');
    }
    vAPI.storage.set({
        hiddenSettings,
        netWhitelist: whitelist || [],
        dynamicFilteringString: userData.dynamicFilteringString || '',
        urlFilteringString: userData.urlFilteringString || '',
        hostnameSwitchesString: userData.hostnameSwitchesString || '',
        lastRestoreFile: request.file || '',
        lastRestoreTime: Date.now(),
        lastBackupFile: '',
        lastBackupTime: 0
    });
    self.µBlock.saveUserFilters(userData.userFilters);
    if ( Array.isArray(userData.selectedFilterLists) ) {
         await self.µBlock.saveSelectedFilterLists(userData.selectedFilterLists);
    }

    vAPI.app.restart();
};

// Remove all stored data but keep global counts, people can become
// quite attached to numbers
const resetUserData = async function() {
    await Promise.all([
        cacheStorage.clear(),
        vAPI.storage.clear(),
    ]);

    await self.µBlock.saveLocalSettings();

    vAPI.app.restart();
};

// Filter lists
const prepListEntries = function(entries) {
    for ( const k in entries ) {
        if ( entries.hasOwnProperty(k) === false ) { continue; }
        const entry = entries[k];
        if ( typeof entry.supportURL === 'string' && entry.supportURL !== '' ) {
            entry.supportName = hostnameFromURI(entry.supportURL);
        } else if ( typeof entry.homeURL === 'string' && entry.homeURL !== '' ) {
            const hn = hostnameFromURI(entry.homeURL);
            entry.supportURL = `http://${hn}/`;
            entry.supportName = domainFromHostname(hn);
        }
    }
};

const getLists = async function(callback) {
    const r = {
        autoUpdate: self.µBlock.userSettings.autoUpdate,
        available: null,
        cache: null,
        cosmeticFilterCount: cosmeticFilteringEngine.getFilterCount(),
        current: self.µBlock.availableFilterLists,
        ignoreGenericCosmeticFilters: self.µBlock.userSettings.ignoreGenericCosmeticFilters,
        isUpdating: io.isUpdating(),
        netFilterCount: staticNetFilteringEngine.getFilterCount(),
        parseCosmeticFilters: self.µBlock.userSettings.parseAllABPHideFilters,
        suspendUntilListsAreLoaded: self.µBlock.userSettings.suspendUntilListsAreLoaded,
        userFiltersPath: self.µBlock.userFiltersPath
    };
    const [ lists, metadata ] = await Promise.all([
        self.µBlock.getAvailableLists(),
        io.metadata(),
    ]);
    r.available = lists;
    prepListEntries(r.available);
    r.cache = metadata;
    prepListEntries(r.cache);
    callback(r);
};

// My filters

// TODO: also return origin of embedded frames?
const getOriginHints = function() {
    const out = new Set();
    for ( const tabId of self.µBlock.pageStores.keys() ) {
        if ( tabId === -1 ) { continue; }
        const tabContext = self.µBlock.tabContextManager.lookup(tabId);
        if ( tabContext === null ) { continue; }
        let { rootDomain, rootHostname } = tabContext;
        if ( rootDomain.endsWith('-scheme') ) { continue; }
        const isPunycode = rootHostname.includes('xn--');
        out.add(isPunycode ? punycode.toUnicode(rootDomain) : rootDomain);
        if ( rootHostname === rootDomain ) { continue; }
        out.add(isPunycode ? punycode.toUnicode(rootHostname) : rootHostname);
    }
    return Array.from(out);
};

// My rules
const getRules = function() {
    return {
        permanentRules:
            permanentFirewall.toArray().concat(
                permanentSwitches.toArray(),
                permanentURLFiltering.toArray()
            ),
        sessionRules:
            sessionFirewall.toArray().concat(
                sessionSwitches.toArray(),
                sessionURLFiltering.toArray()
            ),
        pslSelfie: publicSuffixList.toSelfie(),
    };
};

const modifyRuleset = function(details) {
    let swRuleset, hnRuleset, urlRuleset;
    if ( details.permanent ) {
        swRuleset = permanentSwitches;
        hnRuleset = permanentFirewall;
        urlRuleset = permanentURLFiltering;
    } else {
        swRuleset = sessionSwitches;
        hnRuleset = sessionFirewall;
        urlRuleset = sessionURLFiltering;
    }
    let toRemove = new Set(details.toRemove.trim().split(/\s*[\n\r]+\s*/));
    for ( let rule of toRemove ) {
        if ( rule === '' ) { continue; }
        let parts = rule.split(/\s+/);
        if ( hnRuleset.removeFromRuleParts(parts) === false ) {
            if ( swRuleset.removeFromRuleParts(parts) === false ) {
                urlRuleset.removeFromRuleParts(parts);
            }
        }
    }
    let toAdd = new Set(details.toAdd.trim().split(/\s*[\n\r]+\s*/));
    for ( let rule of toAdd ) {
        if ( rule === '' ) { continue; }
        let parts = rule.split(/\s+/);
        if ( hnRuleset.addFromRuleParts(parts) === false ) {
            if ( swRuleset.addFromRuleParts(parts) === false ) {
                urlRuleset.addFromRuleParts(parts);
            }
        }
    }
    if ( details.permanent ) {
        if ( swRuleset.changed ) {
            self.µBlock.saveHostnameSwitches();
            swRuleset.changed = false;
        }
        if ( hnRuleset.changed ) {
            self.µBlock.savePermanentFirewallRules();
            hnRuleset.changed = false;
        }
        if ( urlRuleset.changed ) {
            self.µBlock.savePermanentURLFilteringRules();
            urlRuleset.changed = false;
        }
    }
};

// Support
const getSupportData = async function() {
    const diffArrays = function(modified, original) {
        const modifiedSet = new Set(modified);
        const originalSet = new Set(original);
        let added = [];
        let removed = [];
        for ( const item of modifiedSet ) {
            if ( originalSet.has(item) ) { continue; }
            added.push(item);
        }
        for ( const item of originalSet ) {
            if ( modifiedSet.has(item) ) { continue; }
            removed.push(item);
        }
        if ( added.length === 0 ) {
            added = undefined;
        }
        if ( removed.length === 0 ) {
            removed = undefined;
        }
        if ( added !== undefined || removed !== undefined ) {
            return { added, removed };
        }
    };

    const modifiedUserSettings = self.µBlock.getModifiedSettings(
        self.µBlock.userSettings,
        self.µBlock.userSettingsDefault
    );

    const modifiedHiddenSettings = self.µBlock.getModifiedSettings(
        self.µBlock.hiddenSettings,
        self.µBlock.hiddenSettingsDefault
    );

    let filterset = [];
    const userFilters = await self.µBlock.loadUserFilters();
    for ( const line of userFilters.content.split(/\s*\n+\s*/) ) {
        if ( /^($|![^#])/.test(line) ) { continue; }
        filterset.push(line);
    }

    const now = Date.now();

    const formatDelayFromNow = time => {
        if ( (time || 0) === 0 ) { return '?'; }
        const delayInSec = (now - time) / 1000;
        const days = (delayInSec / 86400) | 0;
        const hours = (delayInSec % 86400) / 3600 | 0;
        const minutes = (delayInSec % 3600) / 60 | 0;
        const parts = [];
        if ( days > 0 ) { parts.push(`${days}d`); }
        if ( hours > 0 ) { parts.push(`${hours}h`); }
        if ( minutes > 0 ) { parts.push(`${minutes}m`); }
        if ( parts.length === 0 ) { parts.push('now'); }
        return parts.join('.');
    };

    const lists = self.µBlock.availableFilterLists;
    let defaultListset = {};
    let addedListset = {};
    let removedListset = {};
    for ( const listKey in lists ) {
        if ( lists.hasOwnProperty(listKey) === false ) { continue; }
        const list = lists[listKey];
        if ( list.content !== 'filters' ) { continue; }
        const used = self.µBlock.selectedFilterLists.includes(listKey);
        const listDetails = [];
        if ( used ) {
            if ( typeof list.entryCount === 'number' ) {
                listDetails.push(`${list.entryCount}-${list.entryCount-list.entryUsedCount}`);
            }
            if ( typeof list.writeTime !== 'number' || list.writeTime === 0 ) {
                listDetails.push('never');
            } else {
                listDetails.push(formatDelayFromNow(list.writeTime));
            }
        }
        if ( list.isDefault || listKey === self.µBlock.userFiltersPath ) {
            if ( used ) {
                defaultListset[listKey] = listDetails.join(', ');
            } else {
                removedListset[listKey] = null;
            }
        } else if ( used ) {
            addedListset[listKey] = listDetails.join(', ');
        }
    }
    if ( Object.keys(defaultListset).length === 0 ) {
        defaultListset = undefined;
    }
    if ( Object.keys(addedListset).length === 0 ) {
        addedListset = undefined;
    } else {
        const added = Object.keys(addedListset);
        const truncated = added.slice(12);
        for ( const key of truncated ) {
            delete addedListset[key];
        }
        if ( truncated.length !== 0 ) {
            addedListset[`[${truncated.length} lists not shown]`] = '[too many]';
        }
    }
    if ( Object.keys(removedListset).length === 0 ) {
        removedListset = undefined;
    }

    let browserFamily = (( ) => {
        if ( vAPI.webextFlavor.soup.has('firefox') ) { return 'Firefox'; }
        if ( vAPI.webextFlavor.soup.has('chromium') ) { return 'Chromium'; }
        return 'Unknown';
    })();
    if ( vAPI.webextFlavor.soup.has('mobile') ) {
        browserFamily += ' Mobile';
    }

    return {
        [`${vAPI.app.name}`]: `${vAPI.app.version}`,
        [`${browserFamily}`]: `${vAPI.webextFlavor.major}`,
        'filterset (summary)': {
            network: staticNetFilteringEngine.getFilterCount(),
            cosmetic: cosmeticFilteringEngine.getFilterCount(),
            scriptlet: scriptletFilteringEngine.getFilterCount(),
            html: htmlFilteringEngine.getFilterCount(),
        },
        'listset (total-discarded, last-updated)': {
            removed: removedListset,
            added: addedListset,
            default: defaultListset,
        },
        'filterset (user)': filterset,
        trustedset: diffArrays(
            self.µBlock.arrayFromWhitelist(self.µBlock.netWhitelist),
            self.µBlock.netWhitelistDefault
        ),
        switchRuleset: diffArrays(
            sessionSwitches.toArray(),
            self.µBlock.hostnameSwitchesDefault
        ),
        hostRuleset: diffArrays(
            sessionFirewall.toArray(),
            self.µBlock.dynamicFilteringDefault
        ),
        urlRuleset: diffArrays(
            sessionURLFiltering.toArray(),
            []
        ),
        'userSettings': modifiedUserSettings,
        'hiddenSettings': modifiedHiddenSettings,
        supportStats: self.µBlock.supportStats,
    };
};

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    case 'backupUserData':
        return backupUserData().then(data => {
            callback(data);
        });

    case 'getLists':
        return getLists(callback);

    case 'getLocalData':
        return getLocalData().then(localData => {
            callback(localData);
        });

    case 'getSupportData': {
        getSupportData().then(response => {
            callback(response);
        });
        return;
    }

    case 'readUserFilters':
        return self.µBlock.loadUserFilters().then(result => {
            callback(result);
        });

    case 'writeUserFilters':
        return self.µBlock.saveUserFilters(request.content).then(result => {
            callback(result);
        });

    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'dashboardConfig':
        response = {
            noDashboard: self.µBlock.noDashboard,
        };
        break;

    case 'getAutoCompleteDetails':
        response = {};
        if ( (request.hintUpdateToken || 0) === 0 ) {
            response.redirectResources = redirectEngine.getResourceDetails();
            response.preparseDirectiveEnv = vAPI.webextFlavor.env.slice();
            response.preparseDirectiveHints =
                sfp.utils.preparser.getHints();
            response.expertMode = self.µBlock.hiddenSettings.filterAuthorMode;
            response.filterOnHeaders = self.µBlock.hiddenSettings.filterOnHeaders;
        }
        if ( request.hintUpdateToken !== self.µBlock.pageStoresToken ) {
            response.originHints = getOriginHints();
            response.hintUpdateToken = self.µBlock.pageStoresToken;
        }
        break;

    case 'getRules':
        response = getRules();
        break;

    case 'modifyRuleset':
        // https://github.com/chrisaljoudi/uBlock/issues/772
        cosmeticFilteringEngine.removeFromSelectorCache('*');
        modifyRuleset(request);
        response = getRules();
        break;

    case 'purgeAllCaches':
        if ( request.hard ) {
            io.remove(/./);
        } else {
            io.purge(/./, 'public_suffix_list.dat');
        }
        break;

    case 'purgeCaches':
        for ( const assetKey of request.assetKeys ) {
            io.purge(assetKey);
            io.remove(`compiled/${assetKey}`);
        }
        break;

    case 'readHiddenSettings':
        response = {
            'default': self.µBlock.hiddenSettingsDefault,
            'admin': self.µBlock.hiddenSettingsAdmin,
            'current': self.µBlock.hiddenSettings,
        };
        break;

    case 'restoreUserData':
        restoreUserData(request);
        break;

    case 'resetUserData':
        resetUserData();
        break;

    case 'writeHiddenSettings':
        self.µBlock.changeHiddenSettings(self.µBlock.hiddenSettingsFromString(request.content));
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'dashboard',
    listener: onMessage,
    privileged: true,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      loggerUI
//      privileged

{
// >>>>> start of local scope

const extensionOriginURL = vAPI.getURL('');
const documentBlockedURL = vAPI.getURL('document-blocked.html');

const getLoggerData = async function(details, activeTabId, callback) {
    const response = {
        activeTabId,
        colorBlind: self.µBlock.userSettings.colorBlindFriendly,
        entries: logger.readAll(details.ownerId),
        tabIdsToken: self.µBlock.pageStoresToken,
        tooltips: self.µBlock.userSettings.tooltipsDisabled === false
    };
    if ( self.µBlock.pageStoresToken !== details.tabIdsToken ) {
        const tabIds = new Map();
        for ( const [ tabId, pageStore ] of self.µBlock.pageStores ) {
            const { rawURL } = pageStore;
            if (
                rawURL.startsWith(extensionOriginURL) === false ||
                rawURL.startsWith(documentBlockedURL)
            ) {
                tabIds.set(tabId, pageStore.title);
            }
        }
        response.tabIds = Array.from(tabIds);
    }
    if ( activeTabId ) {
        const pageStore = self.µBlock.pageStoreFromTabId(activeTabId);
        const rawURL = pageStore && pageStore.rawURL;
        if (
            rawURL === null ||
            rawURL.startsWith(extensionOriginURL) &&
                rawURL.startsWith(documentBlockedURL) === false
        ) {
            response.activeTabId = undefined;
        }
    }
    if ( details.popupLoggerBoxChanged && vAPI.windows instanceof Object ) {
        const tabs = await vAPI.tabs.query({
            url: vAPI.getURL('/logger-ui.html?popup=1')
        });
        if ( tabs.length !== 0 ) {
            const win = await vAPI.windows.get(tabs[0].windowId);
            if ( win === null ) { return; }
            vAPI.localStorage.setItem('popupLoggerBox', JSON.stringify({
                left: win.left,
                top: win.top,
                width: win.width,
                height: win.height,
            }));
        }
    }
    callback(response);
};

const getURLFilteringData = function(details) {
    const colors = {};
    const response = {
        dirty: false,
        colors: colors
    };
    const suf = sessionURLFiltering;
    const puf = permanentURLFiltering;
    const urls = details.urls;
    const context = details.context;
    const type = details.type;
    for ( const url of urls ) {
        const colorEntry = colors[url] = { r: 0, own: false };
        if ( suf.evaluateZ(context, url, type).r !== 0 ) {
            colorEntry.r = suf.r;
            colorEntry.own = suf.r !== 0 &&
                             suf.context === context &&
                             suf.url === url &&
                             suf.type === type;
        }
        if ( response.dirty ) { continue; }
        puf.evaluateZ(context, url, type);
        const pown = (
            puf.r !== 0 &&
            puf.context === context &&
            puf.url === url &&
            puf.type === type
        );
        response.dirty = colorEntry.own !== pown || colorEntry.r !== puf.r;
    }
    return response;
};

const onMessage = function(request, sender, callback) {
    // Async
    switch ( request.what ) {
    case 'readAll':
        if ( logger.ownerId !== undefined && logger.ownerId !== request.ownerId ) {
            return callback({ unavailable: true });
        }
        vAPI.tabs.getCurrent().then(tab => {
            getLoggerData(request, tab && tab.id, callback);
        });
        return;

    case 'toggleInMemoryFilter': {
        const promise = self.µBlock.hasInMemoryFilter(request.filter)
            ? self.µBlock.removeInMemoryFilter(request.filter)
            : self.µBlock.addInMemoryFilter(request.filter);
        promise.then(status => { callback(status); });
        return;
    }
    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'hasInMemoryFilter':
        response = self.µBlock.hasInMemoryFilter(request.filter);
        break;

    case 'releaseView':
        if ( request.ownerId !== logger.ownerId ) { break; }
        logger.ownerId = undefined;
        self.µBlock.clearInMemoryFilters();
        break;

    case 'saveURLFilteringRules':
        response = permanentURLFiltering.copyRules(
            sessionURLFiltering,
            request.context,
            request.urls,
            request.type
        );
        if ( response ) {
            self.µBlock.savePermanentURLFilteringRules();
        }
        break;

    case 'setURLFilteringRule':
        self.µBlock.toggleURLFilteringRule(request);
        break;

    case 'getURLFilteringData':
        response = getURLFilteringData(request);
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'loggerUI',
    listener: onMessage,
    privileged: true,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      documentBlocked
//      privileged

{
// >>>>> start of local scope

const onMessage = function(request, sender, callback) {
    const tabId = sender.tabId || 0;

    // Async
    switch ( request.what ) {
    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'closeThisTab':
        vAPI.tabs.remove(tabId);
        break;

    case 'temporarilyWhitelistDocument':
        webRequest.strictBlockBypass(request.hostname);
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'documentBlocked',
    listener: onMessage,
    privileged: true,
});

// <<<<< end of local scope
}

/******************************************************************************/
/******************************************************************************/

// Channel:
//      scriptlets
//      unprivileged

{
// >>>>> start of local scope

const logCosmeticFilters = function(tabId, details) {
    if ( logger.enabled === false ) { return; }

    const filter = { source: 'cosmetic', raw: '' };
    const fctxt = self.µBlock.filteringContext.duplicate();
    fctxt.fromTabId(tabId)
         .setRealm('cosmetic')
         .setType('dom')
         .setURL(details.frameURL)
         .setDocOriginFromURL(details.frameURL)
         .setFilter(filter);
    for ( const selector of details.matchedSelectors.sort() ) {
        filter.raw = selector;
        fctxt.toLogger();
    }
};

const logCSPViolations = function(pageStore, request) {
    if ( logger.enabled === false || pageStore === null ) {
        return false;
    }
    if ( request.violations.length === 0 ) {
        return true;
    }

    const fctxt = self.µBlock.filteringContext.duplicate();
    fctxt.fromTabId(pageStore.tabId)
         .setRealm('network')
         .setDocOriginFromURL(request.docURL)
         .setURL(request.docURL);

    let cspData = pageStore.extraData.get('cspData');
    if ( cspData === undefined ) {
        cspData = new Map();

        const staticDirectives =
            staticNetFilteringEngine.matchAndFetchModifiers(fctxt, 'csp');
        if ( staticDirectives !== undefined ) {
            for ( const directive of staticDirectives ) {
                if ( directive.result !== 1 ) { continue; }
                cspData.set(directive.value, directive.logData());
            }
        }

        fctxt.type = 'inline-script';
        fctxt.filter = undefined;
        if ( pageStore.filterRequest(fctxt) === 1 ) {
            cspData.set(self.µBlock.cspNoInlineScript, fctxt.filter);
        }

        fctxt.type = 'script';
        fctxt.filter = undefined;
        if ( pageStore.filterScripting(fctxt, true) === 1 ) {
            cspData.set(self.µBlock.cspNoScripting, fctxt.filter);
        }
    
        fctxt.type = 'inline-font';
        fctxt.filter = undefined;
        if ( pageStore.filterRequest(fctxt) === 1 ) {
            cspData.set(self.µBlock.cspNoInlineFont, fctxt.filter);
        }

        if ( cspData.size === 0 ) { return false; }

        pageStore.extraData.set('cspData', cspData);
    }

    const typeMap = logCSPViolations.policyDirectiveToTypeMap;
    for ( const json of request.violations ) {
        const violation = JSON.parse(json);
        let type = typeMap.get(violation.directive);
        if ( type === undefined ) { continue; }
        const logData = cspData.get(violation.policy);
        if ( logData === undefined ) { continue; }
        if ( /^[\w.+-]+:\/\//.test(violation.url) === false ) {
            violation.url = request.docURL;
            if ( type === 'script' ) { type = 'inline-script'; }
            else if ( type === 'font' ) { type = 'inline-font'; }
        }
        // The resource was blocked as a result of applying a CSP directive
        // elsewhere rather than to the resource itself.
        logData.modifier = undefined;
        fctxt.setURL(violation.url)
             .setType(type)
             .setFilter(logData)
             .toLogger();
    }

    return true;
};

logCSPViolations.policyDirectiveToTypeMap = new Map([
    [ 'img-src', 'image' ],
    [ 'connect-src', 'xmlhttprequest' ],
    [ 'font-src', 'font' ],
    [ 'frame-src', 'sub_frame' ],
    [ 'media-src', 'media' ],
    [ 'object-src', 'object' ],
    [ 'script-src', 'script' ],
    [ 'script-src-attr', 'script' ],
    [ 'script-src-elem', 'script' ],
    [ 'style-src', 'stylesheet' ],
    [ 'style-src-attr', 'stylesheet' ],
    [ 'style-src-elem', 'stylesheet' ],
]);

const onMessage = function(request, sender, callback) {
    const tabId = sender.tabId || 0;
    const pageStore = self.µBlock.pageStoreFromTabId(tabId);

    // Async
    switch ( request.what ) {
    default:
        break;
    }

    // Sync
    let response;

    switch ( request.what ) {
    case 'inlinescriptFound':
        if ( logger.enabled && pageStore !== null ) {
            const fctxt = self.µBlock.filteringContext.duplicate();
            fctxt.fromTabId(tabId)
                .setType('inline-script')
                .setURL(request.docURL)
                .setDocOriginFromURL(request.docURL);
            if ( pageStore.filterRequest(fctxt) === 0 ) {
                fctxt.setRealm('network').toLogger();
            }
        }
        break;

    case 'logCosmeticFilteringData':
        logCosmeticFilters(tabId, request);
        break;

    case 'securityPolicyViolation':
        response = logCSPViolations(pageStore, request);
        break;

    case 'temporarilyAllowLargeMediaElement':
        if ( pageStore !== null ) {
            pageStore.allowLargeMediaElementsUntil = Date.now() + 5000;
        }
        break;

    case 'subscribeTo':
        // https://github.com/uBlockOrigin/uBlock-issues/issues/1797
        if ( /^(file|https?):\/\//.test(request.location) === false ) { break; }
        const url = encodeURIComponent(request.location);
        const title = encodeURIComponent(request.title);
        const hash = self.µBlock.selectedFilterLists.indexOf(request.location) !== -1
            ? '#subscribed'
            : '';
        vAPI.tabs.open({
            url: `/asset-viewer.html?url=${url}&title=${title}&subscribe=1${hash}`,
            select: true,
        });
        break;

    default:
        return vAPI.messaging.UNHANDLED;
    }

    callback(response);
};

vAPI.messaging.listen({
    name: 'scriptlets',
    listener: onMessage,
});

// <<<<< end of local scope
}


/******************************************************************************/
/******************************************************************************/