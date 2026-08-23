import { chromium } from 'playwright-core';

async function runAudit() {
  console.log("🚀 Starting Antigravity UI/UX Responsive & Accessibility Audit...");

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
    });
  } catch (e) {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e2) {
      console.log("Using edge fallback...");
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
    }
  }

  const baseUrl = 'http://localhost:3000';
  console.log(`🌐 Connected to target server at: ${baseUrl}`);

  const breakpoints = [
    { name: 'Mobile Mini (320px)', width: 320, height: 667 },
    { name: 'Mobile Standard (480px)', width: 480, height: 853 },
    { name: 'Tablet Portrait (768px)', width: 768, height: 1024 },
    { name: 'Desktop Laptop (1024px)', width: 1024, height: 768 },
    { name: 'Desktop Large (1440px)', width: 1440, height: 900 },
    { name: '4K / Ultrawide (2560px)', width: 2560, height: 1440 }
  ];

  const routes = ['/', '/login', '/dashboard'];

  const results = [];

  for (const route of routes) {
    console.log(`\n========================================`);
    console.log(`🔍 AUDITING ROUTE: ${route}`);
    console.log(`========================================`);

    for (const bp of breakpoints) {
      const context = await browser.newContext({
        viewport: { width: bp.width, height: bp.height }
      });
      const page = await context.newPage();

      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1200);

        // 1. Check Horizontal Overflow
        const overflowDetails = await page.evaluate(() => {
          const bodyWidth = document.body.scrollWidth;
          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          const hasOverflow = docWidth > winWidth + 1 || bodyWidth > winWidth + 1;
          return {
            hasOverflow,
            docWidth,
            winWidth
          };
        });

        // 2. Check Interactive Element Touch Target Sizes (< 32px)
        const smallTouchTargets = await page.evaluate(() => {
          const interactive = Array.from(document.querySelectorAll('button, a[href], input, select'));
          const tooSmall = [];
          for (const el of interactive) {
            const rect = el.getBoundingClientRect();
            // Ignore hidden or 0x0 elements
            if (rect.width > 0 && rect.height > 0 && (rect.width < 28 || rect.height < 28)) {
              tooSmall.push({
                tag: el.tagName,
                text: (el.textContent || '').trim().substring(0, 25),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              });
            }
          }
          return tooSmall;
        });

        // 3. Check Accessible ARIA Labels on icon-only Buttons
        const missingAria = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const unlabeled = [];
          for (const b of buttons) {
            const text = (b.textContent || '').trim();
            const ariaLabel = b.getAttribute('aria-label') || b.getAttribute('title');
            if (!text && !ariaLabel) {
              unlabeled.push(b.outerHTML.substring(0, 60));
            }
          }
          return unlabeled;
        });

        // 4. Test Theme Toggle (Dark / Light Switch)
        let themeSwitched = false;
        try {
          const toggleBtn = await page.$('button[aria-label*="mode" i], button[title*="mode" i], button[aria-label*="theme" i]');
          if (toggleBtn) {
            await toggleBtn.click();
            await page.waitForTimeout(300);
            themeSwitched = true;
          }
        } catch (e) {}

        const status = (!overflowDetails.hasOverflow && missingAria.length === 0) ? '✅ PASS' : '⚠️ WARN';
        
        console.log(`[${status}] ${bp.name} (${bp.width}x${bp.height}): docWidth=${overflowDetails.docWidth}px, winWidth=${overflowDetails.winWidth}px, overflow=${overflowDetails.hasOverflow ? 'YES' : 'NO'}, unlabeled=${missingAria.length}`);

        results.push({
          route,
          breakpoint: bp.name,
          width: bp.width,
          overflow: overflowDetails.hasOverflow ? 'FAIL' : 'PASS (0px overflow)',
          unlabeledButtons: missingAria.length,
          themeToggleTested: themeSwitched ? 'YES' : 'N/A',
          status
        });

      } catch (err) {
        console.error(`❌ Error on ${bp.name}:`, err.message);
        results.push({
          route,
          breakpoint: bp.name,
          width: bp.width,
          overflow: 'ERROR',
          unlabeledButtons: 0,
          themeToggleTested: 'NO',
          status: '❌ ERROR'
        });
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  console.log(`\n=============================================================`);
  console.log(`📊 FINAL RESPONSIVE & ACCESSIBILITY AUDIT MATRIX`);
  console.log(`=============================================================`);
  console.table(results);
}

runAudit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
