// this is where you could import your webmunk module content scripts
import "@webmunk/extension-ads/content";
import "@webmunk/cookies-scraper/content";
import "@webmunk/ad-personalization/content";

import { SurveyChecker } from './SurveyChecker';
new SurveyChecker();