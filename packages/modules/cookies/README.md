# Browser Cookie Module

## Description
This module tracks cookies on a web page.

## Build Instructions
To build the module, use the following command:
```bash
npm run build:dev
```

# Event System
The module uses a message-driven architecture for communication. It listens to and emits specific events for sending and receiving information related to cookies.

## Events the Module Listens to:
1. cookiesAppMgr.recordCookies
Description: This event is triggered to initiate the recording of cookies for a particular web page.
Data:
  url: string — The URL of the page for which cookies should be recorded.
  pageTitle: string — The title of the page where cookies are being recorded.
Action: The module retrieves cookies from the specified URL and processes them for further handling.

2. cookiesAppMgr.checkPrivacy
Description: This event is triggered to check the privacy settings related to cookies on a website.
  Data: None
Action: The module retrieves privacy settings and emits relevant data about cookie handling and privacy.

## Events the Module Emits:
1. cookies
Description: Emitted when the module successfully retrieves and processes cookies from a web page.
Data:
  url: string — The URL of the page from which cookies were retrieved.
  pageTitle: string — The title of the page where cookies were recorded.
  cookies: chrome.cookies.Cookie[] — An array of cookies retrieved from the specified URL.

2. privacy_settings
Description: Emitted when the module retrieves privacy settings related to cookies.
Data:
  thirdPartyCookiesAllowed: boolean — Indicates if third-party cookies are allowed.
  topicsEnabled: boolean — Indicates if topics are enabled in privacy settings.
  fledgeEnabled: boolean — Indicates if FLEDGE (First Locally Executed Decision-Guidance Engine) is enabled.
  adMeasurementEnabled: boolean — Indicates if ad measurement is enabled.

## License and Other Project Information

Copyright 2022-2024 The Fradkin Foundation and the President & Fellows of Harvard College

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
