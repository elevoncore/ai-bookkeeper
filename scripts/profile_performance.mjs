import { chromium } from 'playwright-core';

async function getBrowser() {
  const launchOptions = { headless: true };
  try {
    return await chromium.launch({ ...launchOptions, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: 'msedge' });
    } catch {
      return await chromium.launch(launchOptions);
    }
  }
}

async function runPerformanceAudit() {
  console.log("================================================================");
  console.log("⚡ InscribeAI Autonomous Performance & Core Web Vitals Profiler");
  console.log("   Condition: 4x CPU Slowdown + Fast 3G Network Emulation");
  console.log("================================================================\n");

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const browser = await getBrowser();
  const routes = ['/', '/dashboard'];

  const results = [];

  for (const route of routes) {
    console.log(`\n🔍 PROFILING ROUTE: ${route} ...`);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    // 1. Emulate 4x CPU Slowdown
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // 2. Emulate Fast 3G Network (150ms RTT, 1.6Mbps down, 750kbps up)
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: 'cellular3g',
    });

    // Track network requests and transfer size
    let totalTransferBytes = 0;
    let requestCount = 0;
    const resourceBreakdown = { js: 0, css: 0, font: 0, image: 0, other: 0 };

    client.on('Network.loadingFinished', (event) => {
      totalTransferBytes += event.encodedDataLength || 0;
    });

    client.on('Network.responseReceived', (event) => {
      requestCount++;
      const mime = event.response.mimeType || '';
      const size = event.response.encodedDataLength || 0;
      if (mime.includes('javascript')) resourceBreakdown.js += size;
      else if (mime.includes('css')) resourceBreakdown.css += size;
      else if (mime.includes('font')) resourceBreakdown.font += size;
      else if (mime.includes('image')) resourceBreakdown.image += size;
      else resourceBreakdown.other += size;
    });

    // Inject Web Vitals tracking before document starts loading
    await page.addInitScript(() => {
      window.__webVitals = {
        cls: 0,
        lcp: 0,
        fcp: 0,
        ttfb: 0,
        inp: 0,
      };

      // FCP & LCP Observer
      try {
        const paintObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              window.__webVitals.fcp = entry.startTime;
            }
          }
        });
        paintObserver.observe({ type: 'paint', buffered: true });

        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            window.__webVitals.lcp = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

        // CLS Observer
        const clsObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__webVitals.cls += entry.value;
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });

        // INP / Long Animation Frames Observer
        const inpObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.duration > window.__webVitals.inp) {
              window.__webVitals.inp = entry.duration;
            }
          }
        });
        inpObserver.observe({ type: 'longtask', buffered: true });
      } catch (e) {}
    });

    const startNav = Date.now();
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'load', timeout: 35000 });
    await page.waitForTimeout(3000); // Allow throttled CPU to settle & observe shifts

    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const domNodes = document.querySelectorAll('*').length;
      const mem = performance.memory ? performance.memory.usedJSHeapSize : null;
      return {
        ttfb: nav ? nav.responseStart - nav.requestStart : 0,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
        loadComplete: nav ? nav.loadEventEnd - nav.startTime : 0,
        vitals: window.__webVitals || {},
        domNodes,
        heapMb: mem ? (mem / (1024 * 1024)).toFixed(2) : 'N/A',
      };
    });

    const metrics = await client.send('Performance.getMetrics');
    const cdpMetrics = {};
    metrics.metrics.forEach((m) => (cdpMetrics[m.name] = m.value));

    const totalJsHeap = cdpMetrics.JSHeapUsedSize
      ? (cdpMetrics.JSHeapUsedSize / (1024 * 1024)).toFixed(2)
      : navTiming.heapMb;

    const result = {
      route,
      fcpMs: Math.round(navTiming.vitals.fcp || navTiming.domContentLoaded),
      lcpMs: Math.round(navTiming.vitals.lcp || navTiming.loadComplete),
      cls: Number((navTiming.vitals.cls || 0).toFixed(4)),
      ttfbMs: Math.round(navTiming.ttfb),
      domNodes: navTiming.domNodes,
      heapMb: totalJsHeap,
      requests: requestCount,
      transferKb: Math.round(totalTransferBytes / 1024),
    };

    results.push(result);

    console.log(`  ├─ 🚀 FCP (First Contentful Paint):    ${result.fcpMs} ms`);
    console.log(`  ├─ 🎯 LCP (Largest Contentful Paint):  ${result.lcpMs} ms`);
    console.log(`  ├─ 📐 CLS (Cumulative Layout Shift):   ${result.cls}`);
    console.log(`  ├─ ⏱️  TTFB (Time to First Byte):       ${result.ttfbMs} ms`);
    console.log(`  ├─ 🌲 DOM Elements in Document:       ${result.domNodes} nodes`);
    console.log(`  ├─ 📦 Total Wire Transfer:            ${result.transferKb} KB (${result.requests} requests)`);
    console.log(`  └─ 🧠 Active JS Heap:                 ${result.heapMb} MB`);

    await context.close();
  }

  await browser.close();

  console.log("\n================================================================");
  console.log("📊 PERFORMANCE VERIFICATION SUMMARY");
  console.log("================================================================");
  console.table(results);

  const perfectCls = results.every(r => r.cls <= 0.05);
  const goodLcp = results.every(r => r.lcpMs < 3000);
  const lightweightDom = results.every(r => r.domNodes < 1200);

  if (perfectCls && goodLcp && lightweightDom) {
    console.log("\n✅ ALL CORE WEB VITALS & BUNDLE EFFICIENCY CRITERIA PASSED!");
  } else {
    console.log("\n⚠️ Some metrics need further tuning under 4x CPU throttle.");
  }
}

runPerformanceAudit().catch((err) => {
  console.error("Profiler failed:", err);
  process.exit(1);
});
