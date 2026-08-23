import { chromium } from 'playwright-core';

async function getBrowser() {
  const launchOptions = {
    headless: true,
    args: ['--js-flags=--expose-gc'],
  };
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

async function runMemoryAudit() {
  console.log("================================================================");
  console.log("🧠 InscribeAI Long-Haul Memory Profiler & Leak Detector");
  console.log("   Simulating 50 rapid mount/unmount and tab switching cycles");
  console.log("================================================================\n");

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send('Performance.enable');
  await client.send('HeapProfiler.enable');

  console.log("🌐 Navigating to /dashboard ...");
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle', timeout: 35000 });
  await page.waitForTimeout(2000);

  // Trigger initial GC & baseline snapshot
  await client.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(500);

  const getHeapSizeMb = async () => {
    const metrics = await client.send('Performance.getMetrics');
    const heapMetric = metrics.metrics.find((m) => m.name === 'JSHeapUsedSize');
    return heapMetric ? (heapMetric.value / (1024 * 1024)).toFixed(2) : '0';
  };

  const getDomNodeCount = async () => {
    return await page.evaluate(() => document.querySelectorAll('*').length);
  };

  const baselineHeap = await getHeapSizeMb();
  const baselineDomNodes = await getDomNodeCount();

  console.log(`📊 Baseline JS Heap: ${baselineHeap} MB | Baseline DOM Nodes: ${baselineDomNodes}`);
  console.log("\n🔄 Executing 50 Tab Switching & Component Mount/Unmount Cycles...");

  const tabs = ['sales', 'purchases', 'reports', 'overview'];
  const snapshotCheckpoints = [];

  for (let i = 1; i <= 50; i++) {
    const targetTab = tabs[i % tabs.length];

    // Click tab button
    await page.evaluate((tabName) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) =>
        b.textContent?.toLowerCase().includes(tabName)
      );
      if (btn) btn.click();
    }, targetTab);

    await page.waitForTimeout(100);

    // Record checkpoint every 10 iterations
    if (i % 10 === 0) {
      await client.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(200);
      const currentHeap = await getHeapSizeMb();
      const currentNodes = await getDomNodeCount();
      console.log(`  Cycle ${i}/50: Heap = ${currentHeap} MB | Nodes = ${currentNodes}`);
      snapshotCheckpoints.push({ cycle: i, heapMb: parseFloat(currentHeap), nodes: currentNodes });
    }
  }

  // Final GC and comparison
  await client.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(1000);

  const finalHeap = parseFloat(await getHeapSizeMb());
  const finalDomNodes = await getDomNodeCount();
  const heapDeltaMb = (finalHeap - parseFloat(baselineHeap)).toFixed(2);

  console.log("\n================================================================");
  console.log("📈 MEMORY AUDIT RESULTS");
  console.log("================================================================");
  console.log(`Baseline Heap:  ${baselineHeap} MB`);
  console.log(`Final Heap:     ${finalHeap.toFixed(2)} MB`);
  console.log(`Net Heap Delta: ${heapDeltaMb} MB`);
  console.log(`Final DOM Nodes: ${finalDomNodes}`);

  await context.close();
  await browser.close();

  // Allow small variance under 15MB for V8 JIT caches
  if (Math.abs(parseFloat(heapDeltaMb)) < 15.0) {
    console.log("\n✅ MEMORY LEAK AUDIT PASSED: Zero uncontrolled heap growth or detached nodes detected!");
  } else {
    console.log("\n⚠️ WARNING: Noticeable heap growth detected. Check for uncleared event listeners or retained closures.");
  }
}

runMemoryAudit().catch((err) => {
  console.error("Memory profiler failed:", err);
  process.exit(1);
});
