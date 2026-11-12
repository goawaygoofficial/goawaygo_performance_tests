// Website performance (MVP 2, 5.6): how fast the main pages load and become usable in a real browser (k6 browser,
// Chromium), measured with Google's Core Web Vitals. A few visitors at a time: the website is static files on
// Cloudflare, so this is about the page and its API calls, not about load.
//
// Limits use Google's "good" thresholds (p75): LCP < 2.5 s, CLS < 0.1, FCP < 1.8 s; plus the time until Home's
// destination search can be used.
import { browser } from 'k6/browser';
import { check } from 'k6';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

import { apiHeaders, apiUrl, webUrl } from '../lib/env.js';

const searchReady = new Trend('home_search_ready', true);

export const options = {
  scenarios: {
    pages: {
      executor: 'shared-iterations',
      vus: 2,
      iterations: 10,
      maxDuration: '5m',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    browser_web_vital_lcp: ['p(75)<2500'],
    browser_web_vital_fcp: ['p(75)<1800'],
    browser_web_vital_cls: ['p(75)<0.1'],
    home_search_ready: ['p(75)<3000'],
    checks: ['rate>0.99'],
  },
};

// Wakes the API (a cold start isn't what this measures).
export function setup() {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (http.get(`${apiUrl}/actuator/health`, { timeout: '60s' }).status === 200) return;
  }
}

export default async function () {
  const context = await browser.newContext({ locale: 'en-GB' });
  // A returning visitor who already answered the analytics question.
  await context.addInitScript(() => {
    window.localStorage.setItem('goawaygo.analyticsConsent', 'denied');
    window.localStorage.setItem('goawaygo.language', 'en');
  });
  const page = await context.newPage();
  // The test header only on requests to our API, never to other sites.
  await page.route(new RegExp(`^${apiUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), async (route) => {
    await route.continue({ headers: { ...route.request().headers(), ...apiHeaders } });
  });
  try {
    const started = Date.now();
    await page.goto(`${webUrl}/home`, { waitUntil: 'load' });
    const search = page.locator('input[placeholder="Where do you want to be?"]');
    await search.waitFor({ state: 'visible', timeout: 15000 });
    searchReady.add(Date.now() - started);
    check(await search.isVisible(), { 'home search visible': (visible) => visible });

    await page.goto(`${webUrl}/auth`, { waitUntil: 'load' });
    await page.goto(`${webUrl}/privacy`, { waitUntil: 'load' });
  } finally {
    await page.close();
    await context.close();
  }
}
