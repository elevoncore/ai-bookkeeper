import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const geminiApiKey = envContent.match(/GEMINI_API_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const expenseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    intent: { type: SchemaType.STRING, description: "LOG_BILL | LOG_INVOICE | LOG_PAYMENT_MADE | LOG_PAYMENT_RECEIVED | LOG_JOURNAL_ENTRY | LOG_INVENTORY_ADJUSTMENT | UPDATE_TRANSACTION | QUERY_FINANCES | QUERY_DEBT | QUERY_REPORT | GENERAL_HELP" },
    customer_name: { type: SchemaType.STRING, description: "Name of the customer (for invoices/payments received)", nullable: true },
    supplier_name: { type: SchemaType.STRING, description: "Name of the supplier (for bills/payments made)", nullable: true },
    lender_name: { type: SchemaType.STRING, description: "Name of the lender for debt/loans (e.g. Meezan Bank, Askari Bank)", nullable: true },
    time_horizon: { type: SchemaType.STRING, description: "short (< 12 months) | long (>= 12 months)", nullable: true },
    parent_account_name: { type: SchemaType.STRING, description: "Short-Term Debt | Long-Term Debt", nullable: true },
    deposit_account_name: { type: SchemaType.STRING, description: "Deposit or payment Asset cash/bank account name (e.g. Main Bank Account, Petty Cash)", nullable: true },
    external_reference_number: { type: SchemaType.STRING, description: "External invoice or receipt number", nullable: true },
    product_name: { type: SchemaType.STRING, description: "Name of the product (for inventory adjustments)", nullable: true },
    actual_stock_count: { type: SchemaType.NUMBER, description: "Actual physical count of product in stock", nullable: true },
    reason: { type: SchemaType.STRING, description: "Reason for stock adjustment", nullable: true },
    total_amount: { type: SchemaType.NUMBER, description: "Total amount or payment amount", nullable: true },
    status: { type: SchemaType.STRING, description: "paid | open | partial | draft", nullable: true },
    issue_date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format (used for payment date as well)", nullable: true },
    due_date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format", nullable: true },
    payment_method: { type: SchemaType.STRING, description: "Method of payment (e.g. Cash, Bank Transfer, Credit Card)", nullable: true },
    currency_code: { type: SchemaType.STRING, description: "3-letter currency code (e.g. USD, EUR, GBP, PKR)", nullable: true },
    line_items: {
      type: SchemaType.ARRAY,
      description: "Array of line items",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          quantity: { type: SchemaType.NUMBER },
          unit_price: { type: SchemaType.NUMBER },
          total: { type: SchemaType.NUMBER },
          account_name: { type: SchemaType.STRING },
          parent_account_name: { type: SchemaType.STRING, description: "Short-Term Debt | Long-Term Debt for liability child accounts", nullable: true },
          product_id: { type: SchemaType.STRING, description: "UUID of existing catalog product or null for ad-hoc services", nullable: true },
          product_name: { type: SchemaType.STRING, nullable: true },
          is_inventory_tracked: { type: SchemaType.BOOLEAN, nullable: true },
          is_debit: { type: SchemaType.BOOLEAN, nullable: true }
        },
        required: ["description", "quantity", "unit_price", "total", "account_name"]
      }
    },
    query_parameters: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        tool_call: { type: SchemaType.STRING, description: "get_account_balance | get_open_invoices | get_open_bills | get_inventory_levels | get_customer_advances | get_supplier_advances | get_financial_summary", nullable: true },
        account_name: { type: SchemaType.STRING, description: "Name of the ledger account to query (e.g. Askari Bank, Meezan Bank, Main Bank Account, Accounts Receivable)", nullable: true },
        entity_name: { type: SchemaType.STRING, description: "Name of the customer, supplier, or lender", nullable: true },
        target: { type: SchemaType.STRING, description: "balance | revenue | expenses | debt | inventory | all", nullable: true }
      }
    },
    is_complete: { type: SchemaType.BOOLEAN, description: "Whether all required fields to log the entry are present" },
    clarification_question: { type: SchemaType.STRING, description: "Question to ask the user if is_complete is false", nullable: true },
    conversational_response: { type: SchemaType.STRING, description: "Response to the user", nullable: true }
  },
  required: ["intent", "is_complete"],
};

async function testAdvancedRouting() {
  console.log("==================================================================");
  console.log("🚀 STARTING ADVANCED FINANCIAL ROUTING & DETERMINISTIC RAG TESTS");
  console.log("==================================================================");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', userId);
  const { data: products } = await supabase.from('products').select('*').eq('user_id', userId);

  const catalogListString = products && products.length > 0
    ? products.map(p => `- ID: ${p.id} | Name: "${p.name}" | Tracked: ${!!p.is_inventory_tracked}`).join("\n")
    : "No existing products in catalog.";

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema,
      temperature: 0.1,
    }
  });

  const defaultCurrency = 'PKR';
  const today = new Date().toISOString().split('T')[0];

  const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper with structured tool-calling capabilities.
    User Operating Preferences:
    - Base Currency: ${defaultCurrency}
    - Timezone: Asia/Karachi
    - Accounting Basis: accrual
    - AI Strictness Level: BALANCED
    
    EXISTING PRODUCT CATALOG GROUNDING:
    ${catalogListString}
    
    INTENTS:
    - LOG_BILL: User received a bill.
    - LOG_INVOICE: User sent an invoice.
    - LOG_PAYMENT_MADE: User paid a bill. Include payment_method and deposit_account_name.
    - LOG_PAYMENT_RECEIVED: User received a payment. Include payment_method and deposit_account_name.
    - LOG_JOURNAL_ENTRY: Multi-line double entry: capital contributions, owner drawings, advances application, loan receipts, loan repayments (3-line split), bank transfers, customer/supplier settlements.
    - QUERY_FINANCES: General balance, cash flow queries. Can trigger get_account_balance.
    - QUERY_DEBT: Queries about outstanding debt, loans, or receivables. Triggers get_account_balance or get_open_invoices.
    
    RULES:
    1. LOAN REPAYMENT (THE 3-LINE SPLIT RULE):
    - Example: "I paid Meezan Bank 50k, which included 10k interest":
      - Line 1 (DEBIT): description: "Meezan Bank Loan Principal Repayment", account_name: "Meezan Bank", total: 40000, is_debit: true, parent_account_name: "Long-Term Debt"
      - Line 2 (DEBIT): description: "Interest Expense", account_name: "Interest Expense", total: 10000, is_debit: true
      - Line 3 (CREDIT): description: "Payment from Bank", account_name: "Main Bank Account", total: 50000, is_debit: false
    
    2. CUSTOMER ADVANCE APPLICATION & SETTLEMENT RULE:
    - Example: "TechCorp paid their 50k invoice. Use their 10k advance, and they paid the remaining 40k via Bank Transfer to the Main Bank.":
      - Intent: "LOG_JOURNAL_ENTRY"
      - Line 1 (DEBIT): description: "Apply TechCorp Advance", account_name: "Customer Advances / Unearned Revenue", total: 10000, is_debit: true
      - Line 2 (DEBIT): description: "Bank Transfer Receipt (TechCorp)", account_name: "Main Bank Account", total: 40000, is_debit: true
      - Line 3 (CREDIT): description: "Settlement of TechCorp Invoice", account_name: "Accounts Receivable", total: 50000, is_debit: false
      - customer_name: "TechCorp"
    
    3. DETERMINISTIC READ-ACCESS / TOOL CALLS:
    - If user asks about balances or debt (e.g. "How much outstanding principal do I owe on the Askari Bank short-term loan?"):
      - Intent: "QUERY_DEBT" or "QUERY_FINANCES"
      - query_parameters: { "tool_call": "get_account_balance", "account_name": "Askari Bank", "target": "balance" }`;

  async function extract(userPrompt) {
    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Understood. I will respond strictly in the requested JSON format.' }] },
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    const res = await model.generateContent({ contents });
    const text = res.response.text();
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(cleaned);
  }

  // ----------------------------------------------------
  // TEST 1: Tool Call: get_account_balance for Askari Bank
  // ----------------------------------------------------
  console.log("\n🧪 TEST 1: 'How much outstanding principal do I owe on the Askari Bank short-term loan?'");
  const t1 = await extract("How much outstanding principal do I owe on the Askari Bank short-term loan?");
  console.log("Test 1 Result:", JSON.stringify(t1, null, 2));

  if (!['QUERY_DEBT', 'QUERY_FINANCES'].includes(t1.intent)) {
    throw new Error(`Test 1 Failed: Expected query intent, got ${t1.intent}`);
  }
  const toolName = t1.query_parameters?.tool_call;
  const accTarget = t1.query_parameters?.account_name || t1.lender_name;
  console.log(` -> Tool called: "${toolName}"`);
  console.log(` -> Account target: "${accTarget}"`);

  if (toolName !== 'get_account_balance') {
    throw new Error(`Test 1 Failed: Expected tool_call 'get_account_balance', got ${toolName}`);
  }
  if (!accTarget || !accTarget.toLowerCase().includes('askari')) {
    throw new Error(`Test 1 Failed: Expected account target 'Askari Bank', got ${accTarget}`);
  }

  // Simulate tool execution against database
  const askariAcc = accounts.find(a => a.name.toLowerCase().includes('askari'));
  const { data: jLines } = await supabase.from('journal_lines').select('debit, credit').eq('account_id', askariAcc.id);
  let totalCr = 0, totalDr = 0;
  (jLines || []).forEach(l => { totalCr += Number(l.credit || 0); totalDr += Number(l.debit || 0); });
  const balance = totalCr - totalDr;
  console.log(` -> Deterministic Live DB Balance for ${askariAcc.name}: ${balance.toFixed(2)} PKR`);
  console.log("✅ TEST 1 PASSED!");

  // ----------------------------------------------------
  // TEST 2: Complex Settlement (Advance + Bank Transfer)
  // ----------------------------------------------------
  console.log("\n🧪 TEST 2: 'TechCorp paid their 50k invoice. Use their 10k advance, and they paid the remaining 40k via Bank Transfer to the Main Bank.'");
  const t2 = await extract("TechCorp paid their 50k invoice. Use their 10k advance, and they paid the remaining 40k via Bank Transfer to the Main Bank.");
  console.log("Test 2 Result:", JSON.stringify(t2, null, 2));

  if (t2.intent !== 'LOG_JOURNAL_ENTRY') {
    throw new Error(`Test 2 Failed: Expected LOG_JOURNAL_ENTRY, got ${t2.intent}`);
  }
  const lines = t2.line_items;
  if (!lines || lines.length !== 3) {
    throw new Error(`Test 2 Failed: Expected exactly 3 line items for multi-line settlement, got ${lines?.length}`);
  }

  const advanceLine = lines.find(l => l.account_name.toLowerCase().includes('advance') || l.account_name.toLowerCase().includes('unearned'));
  const bankLine = lines.find(l => l.account_name.toLowerCase().includes('bank'));
  const arLine = lines.find(l => l.account_name.toLowerCase().includes('receivable'));

  console.log(` -> Advance Line: "${advanceLine?.account_name}" (${advanceLine?.total} PKR, is_debit: ${advanceLine?.is_debit})`);
  console.log(` -> Bank Line: "${bankLine?.account_name}" (${bankLine?.total} PKR, is_debit: ${bankLine?.is_debit})`);
  console.log(` -> A/R Line: "${arLine?.account_name}" (${arLine?.total} PKR, is_debit: ${arLine?.is_debit})`);

  if (!advanceLine || !advanceLine.is_debit || advanceLine.total !== 10000) {
    throw new Error("Test 2 Failed: Missing 10k Debit to Customer Advances");
  }
  if (!bankLine || !bankLine.is_debit || bankLine.total !== 40000) {
    throw new Error("Test 2 Failed: Missing 40k Debit to Main Bank Account");
  }
  if (!arLine || arLine.is_debit || arLine.total !== 50000) {
    throw new Error("Test 2 Failed: Missing 50k Credit to Accounts Receivable");
  }
  console.log("✅ TEST 2 PASSED!");

  // ----------------------------------------------------
  // TEST 3: Loan Repayment (3-Line Split)
  // ----------------------------------------------------
  console.log("\n🧪 TEST 3: 'I paid Meezan Bank 50k, which included 10k interest'");
  const t3 = await extract("I paid Meezan Bank 50k, which included 10k interest");
  console.log("Test 3 Result:", JSON.stringify(t3, null, 2));

  if (t3.intent !== 'LOG_JOURNAL_ENTRY') {
    throw new Error(`Test 3 Failed: Expected LOG_JOURNAL_ENTRY, got ${t3.intent}`);
  }
  const t3Lines = t3.line_items;
  if (!t3Lines || t3Lines.length !== 3) {
    throw new Error(`Test 3 Failed: Expected exactly 3 line items for loan repayment split, got ${t3Lines?.length}`);
  }

  const principalLine = t3Lines.find(l => l.is_debit && (l.account_name.toLowerCase().includes('meezan') || l.account_name.toLowerCase().includes('debt')));
  const interestLine = t3Lines.find(l => l.is_debit && l.account_name.toLowerCase().includes('interest'));
  const bankPaymentLine = t3Lines.find(l => !l.is_debit && (l.account_name.toLowerCase().includes('bank') || l.account_name.toLowerCase().includes('cash')));

  console.log(` -> Principal Line: "${principalLine?.account_name}" (${principalLine?.total} PKR)`);
  console.log(` -> Interest Line: "${interestLine?.account_name}" (${interestLine?.total} PKR)`);
  console.log(` -> Bank Payment Line: "${bankPaymentLine?.account_name}" (${bankPaymentLine?.total} PKR)`);

  if (!principalLine || principalLine.total !== 40000) {
    throw new Error("Test 3 Failed: Principal debit must be 40k (50k total - 10k interest)");
  }
  if (!interestLine || interestLine.total !== 10000) {
    throw new Error("Test 3 Failed: Interest debit must be 10k");
  }
  if (!bankPaymentLine || bankPaymentLine.total !== 50000) {
    throw new Error("Test 3 Failed: Bank credit must be 50k total");
  }
  console.log("✅ TEST 3 PASSED!");

  console.log("\n==================================================================");
  console.log("🎉 ALL ADVANCED FINANCIAL ROUTING & RAG TESTS PASSED FLAWLESSLY!");
  console.log("==================================================================");
}

testAdvancedRouting().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
