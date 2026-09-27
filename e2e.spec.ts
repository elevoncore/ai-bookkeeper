import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2];
});

// We need to setup a test user and clear some state if needed
const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL'],
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
);

test.describe('End-to-End User UI Flow', () => {
  let testEmail = `playwright_${Date.now()}@test.com`;
  let testPassword = 'password123';

  test('User journey: signup, create product, AI chat, verify', async ({ page }) => {
    // 1. Pre-create user to make login easier
    const { data: auth } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });
    
    // Create supplier and product for the user
    await supabase.from('suppliers').insert({ user_id: auth.user.id, name: 'Tech Wholesalers Ltd' });
    await supabase.from('products').insert({
      user_id: auth.user.id, name: 'Gaming Chair', cost: 0, price: 15000, inventory_count: 0, is_inventory_tracked: true
    });

    // 2. Log in through UI
    await page.goto('http://localhost:3000/');
    
    // Check if redirect to /login happens, if not go manually
    if (page.url() !== 'http://localhost:3000/login' && !page.url().includes('dashboard')) {
        await page.goto('http://localhost:3000/login');
    }

    if (page.url().includes('login')) {
        await page.fill('input[name="email"]', testEmail);
        await page.fill('input[name="password"]', testPassword);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dashboard');
    }

    // Verify Dashboard loads
    await expect(page.locator('text=InscribeAI')).toBeVisible();

    // 3. Test AI Chat
    test.setTimeout(60000); // Increase test timeout to 60s
    
    // MOCK THE AI ENDPOINT TO BYPASS GEMINI RATE LIMITS
    await page.route('**/api/extract', async route => {
      const json = {
        is_complete: true,
        clarification_question: null,
        conversational_response: "I've staged the bill for 5 gaming chairs.",
        intent: "LOG_BILL",
        entity_name: "Tech Wholesalers Ltd",
        total_amount: 50000,
        line_items: [
          { description: "Gaming chairs", quantity: 5, unit_price: 10000, amount: 50000, is_inventory_tracked: true, product_name: "Gaming Chair" }
        ]
      };
      await route.fulfill({ json });
    });

    // Use the specific selector for the chat input
    await page.fill('input[placeholder*="Ask AI"]', 'I bought 5 gaming chairs from Tech Wholesalers for 10000 each');
    await page.press('input[placeholder*="Ask AI"]', 'Enter');

    // Wait for the AI response card
    await page.waitForSelector('text=Approve', { timeout: 30000 });
    // 4. Verify AI parsed correctly in UI
    await expect(page.locator('text=50,000').first()).toBeVisible();

    // Click Approve
    await page.click('text=Approve');
    
    // Small buffer to ensure DB commit
    await page.waitForTimeout(3000); 
    
    // 5. Navigate to Purchases and Verify
    await page.goto('http://localhost:3000/purchases');
    
    // It should appear in the Pending list. Click Verify.
    await page.waitForSelector('text=Verify', { timeout: 10000 });
    await page.click('text=Verify');

    // 6. Navigate to Inventory and Check Stock
    await page.goto('http://localhost:3000/inventory');
    await page.waitForSelector('text=Gaming Chair', { timeout: 10000 });
    
    const stockText = await page.locator('text=Gaming Chair').locator('..').textContent();
    expect(stockText).toContain('5');
    
    console.log("E2E Playwright UI Test Passed!");
  });
});
