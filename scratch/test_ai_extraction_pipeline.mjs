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
        target: { type: SchemaType.STRING, description: "revenue | expenses | all" },
        date_from: { type: SchemaType.STRING, nullable: true },
        date_to: { type: SchemaType.STRING, nullable: true }
      }
    },
    update_parameters: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        transaction_id: { type: SchemaType.STRING, description: "The UUID of the transaction to update", nullable: true },
        new_amount: { type: SchemaType.NUMBER, nullable: true },
        update_type: { type: SchemaType.STRING, description: "bill | invoice", nullable: true }
      }
    },
    is_complete: { type: SchemaType.BOOLEAN, description: "Whether all required fields to log the entry are present" },
    clarification_question: { type: SchemaType.STRING, description: "Question to ask the user if is_complete is false", nullable: true },
    conversational_response: { type: SchemaType.STRING, description: "Response to the user", nullable: true }
  },
  required: ["intent", "is_complete"],
};

async function runUnitTests() {
  console.log("=================================================");
  console.log("🚀 STARTING AI EXTRACTION PIPELINE UNIT TESTS");
  console.log("=================================================");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  const userId = authData.user.id;
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', userId);
  const { data: products } = await supabase.from('products').select('*').eq('user_id', userId);

  const catalogListString = products && products.length > 0
    ? products.map(p => `- ID: ${p.id} | Name: "${p.name}" | Price: ${p.price || 0} PKR | Cost: ${p.cost || 0} PKR | Tracked: ${!!p.is_inventory_tracked}`).join("\n")
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

  const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper.
    
    User Operating Preferences:
    - Base Currency: ${defaultCurrency}
    - Timezone: Asia/Karachi
    - Accounting Basis: accrual
    - AI Strictness Level: BALANCED
    
    You must classify the user's intent and extract structured financial data for double-entry bookkeeping.
    
    EXISTING PRODUCT CATALOG GROUNDING:
    Here is the user's existing product catalog:
    ${catalogListString}
    
    INTENTS:
    - LOG_BILL: User received a bill, or incurred a direct expense (e.g. utilities, rent, contractor, plumbing, service) from a Vendor/Payee. Do not force product names for generic expenses or services; treat the vendor/service provider as payee and product_id as null.
    - LOG_INVOICE: User sent an invoice, or billed a client/customer for goods or services (e.g. custom landing page design, consulting, development).
    - LOG_PAYMENT_MADE: User paid a bill.
    - LOG_PAYMENT_RECEIVED: User received a payment.
    - LOG_JOURNAL_ENTRY: User is logging capital contributions, owner drawings, bank transfers, loans received, loan repayments, customer advance payments, supplier advance payments, invoice payments, or general adjustments.
    - LOG_INVENTORY_ADJUSTMENT: User reports physical stock count discrepancy or stocktake adjustment.
    - UPDATE_TRANSACTION: User wants to update or modify an existing transaction.
    - QUERY_FINANCES: General cash flow or spending queries.
    - QUERY_REPORT: Detailed financial reporting queries.
    - QUERY_DEBT: Queries about who owes money or who the user owes.
    - GENERAL_HELP: General chat or usage help.
    
    ABSOLUTE ARCHITECTURAL RULES (ENFORCED BY ERP SCHEMA):

    1. THE DEBT HIERARCHY RULE (CRITICAL):
    - You must NEVER map a loan to a generic "Loan Payable" account.
    - When a user asks to record taking/receiving a loan (e.g. "I took a 2-year loan from Meezan Bank for 2 million PKR" or "Received 500k loan from Uncle Ali for 6 months"):
      - Extract the specific lender's name: "lender_name" (e.g., "Meezan Bank", "Uncle Ali", "Askari Bank").
      - Determine the duration horizon:
        - If loan duration < 12 months: "time_horizon": "short", "parent_account_name": "Short-Term Debt".
        - If loan duration >= 12 months (e.g., 2 years, 5 years): "time_horizon": "long", "parent_account_name": "Long-Term Debt".
      - Stage the transaction as intent: "LOG_JOURNAL_ENTRY" with balanced lines:
        - Line 1 (DEBIT): description: "Loan proceeds received into Bank", account_name: "Main Bank Account", total: amount, is_debit: true
        - Line 2 (CREDIT): description: "Loan obligation (Lender Name)", account_name: "Lender Name (e.g. Meezan Bank)", total: amount, is_debit: false, parent_account_name: "Long-Term Debt or Short-Term Debt"
      - Populate top-level fields: "lender_name": "Lender Name", "time_horizon": "short" | "long", "parent_account_name": "Short-Term Debt" | "Long-Term Debt".

    2. THE AD-HOC / CUSTOM LINE ITEM RULE (CRITICAL):
    - The AI must no longer assume every invoice or bill requires an existing product from the catalog.
    - If a user says, "I paid a plumber 5k to fix the sink" or "I billed TechCorp 150,000 for custom landing page design":
      - "product_id": null (explicitly null).
      - "product_name": null.
      - "is_inventory_tracked": false.
      - "description": Put the exact descriptive service/work text (e.g., "Plumber fixing sink" or "Custom landing page design").
      - "account_name": Map the cost directly to the relevant GL account:
        - Bills: "General Operating Expense" (or "Rent Expense", "Utilities", "Software & Hosting", etc.).
        - Invoices: "Service Revenue" (for custom services, design, consulting, labor) or "Sales Revenue" (for merchandise).

    3. THE SME EQUITY RULE (CRITICAL):
    - Remove all references to "Retained Earnings", "Share Capital", or "Dividends" in your extraction context.
    - Strictly use:
      - "Owner's Capital": For owner capital contributions, initial investments, funding the business (Debit Cash/Bank, Credit "Owner's Capital").
      - "Owner's Drawings": For owner personal withdrawals, taking cash/funds out for personal use e.g. "I withdrew 20k from the main bank for personal use" (Debit "Owner's Drawings", Credit "Main Bank Account" or "Petty Cash").

    RULES FOR EXTRACTION:
    1. Multi-Line Item Extraction: Extract line items into "line_items".
    2. Missing Data: For bills/invoices, if critical data is missing, set is_complete: false.
    3. Entity Resolution: Extract vendor/customer name into supplier_name/customer_name.
    4. Account Categorization: Categorize line items accurately.
    5. Journal Entry Balancing: For LOG_JOURNAL_ENTRY, output balanced lines (Debits equal Credits).
    6. Product Deduplication: If physical inventory matches catalog, output product_id. If ad-hoc service, product_id is null.
    7. Dates: Today's date is ${today}.
    8. Currency Code: Default to 'PKR'.`;

  async function queryGemini(userPrompt) {
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

  // TEST 1: Debt Hierarchy
  console.log("\n🧪 RUNNING TEST 1: 'I took a 2-year loan from Meezan Bank for 2 million PKR.'");
  const test1 = await queryGemini("I took a 2-year loan from Meezan Bank for 2 million PKR.");
  console.log("Test 1 Extraction Output:", JSON.stringify(test1, null, 2));

  if (test1.intent !== 'LOG_JOURNAL_ENTRY') {
    throw new Error(`Test 1 Failed: Expected intent LOG_JOURNAL_ENTRY, got ${test1.intent}`);
  }
  const isGenericLoan = JSON.stringify(test1).includes('"Loan Payable"') || JSON.stringify(test1).includes('"Long-Term Loan Payable"');
  if (isGenericLoan) {
    throw new Error("Test 1 Failed: Output contains generic 'Loan Payable' account!");
  }
  const lender = test1.lender_name || test1.line_items?.find(l => !l.is_debit)?.account_name;
  console.log(` -> Lender identified: "${lender}"`);
  console.log(` -> Time horizon: "${test1.time_horizon}"`);
  console.log(` -> Parent control account: "${test1.parent_account_name || test1.line_items?.find(l => !l.is_debit)?.parent_account_name}"`);
  
  if (!lender || !lender.toLowerCase().includes('meezan')) {
    throw new Error("Test 1 Failed: Lender name did not identify 'Meezan Bank'!");
  }
  if (test1.time_horizon !== 'long' && test1.parent_account_name !== 'Long-Term Debt') {
    throw new Error("Test 1 Failed: 2-year loan should be Long-Term Debt!");
  }
  console.log("✅ TEST 1 PASSED!");

  // TEST 2: Ad-Hoc Line Item
  console.log("\n🧪 RUNNING TEST 2: 'I billed TechCorp 150,000 for custom landing page design.'");
  const test2 = await queryGemini("I billed TechCorp 150,000 for custom landing page design.");
  console.log("Test 2 Extraction Output:", JSON.stringify(test2, null, 2));

  if (test2.intent !== 'LOG_INVOICE') {
    throw new Error(`Test 2 Failed: Expected intent LOG_INVOICE, got ${test2.intent}`);
  }
  if (!test2.customer_name || !test2.customer_name.toLowerCase().includes('techcorp')) {
    throw new Error("Test 2 Failed: Customer name should be TechCorp");
  }
  const line = test2.line_items?.[0];
  if (!line) throw new Error("Test 2 Failed: Missing line item");
  console.log(` -> Line description: "${line.description}"`);
  console.log(` -> Product ID: ${line.product_id}`);
  console.log(` -> Account Name: "${line.account_name}"`);
  console.log(` -> Total: ${line.total}`);

  if (line.product_id !== null && line.product_id !== undefined) {
    throw new Error(`Test 2 Failed: product_id must be null for ad-hoc service, got ${line.product_id}`);
  }
  if (line.account_name !== 'Service Revenue') {
    throw new Error(`Test 2 Failed: Expected Service Revenue, got ${line.account_name}`);
  }
  if (!line.description.toLowerCase().includes('landing page') && !line.description.toLowerCase().includes('design')) {
    throw new Error("Test 2 Failed: Description should preserve custom service details");
  }
  console.log("✅ TEST 2 PASSED!");

  // TEST 3: SME Equity
  console.log("\n🧪 RUNNING TEST 3: 'I withdrew 20k from the main bank for personal use.'");
  const test3 = await queryGemini("I withdrew 20k from the main bank for personal use.");
  console.log("Test 3 Extraction Output:", JSON.stringify(test3, null, 2));

  if (test3.intent !== 'LOG_JOURNAL_ENTRY') {
    throw new Error(`Test 3 Failed: Expected intent LOG_JOURNAL_ENTRY, got ${test3.intent}`);
  }
  const debitLine = test3.line_items?.find(l => l.is_debit);
  const creditLine = test3.line_items?.find(l => !l.is_debit);
  console.log(` -> Debit Account: "${debitLine?.account_name}" (${debitLine?.total} PKR)`);
  console.log(` -> Credit Account: "${creditLine?.account_name}" (${creditLine?.total} PKR)`);

  if (!debitLine || (!debitLine.account_name.toLowerCase().includes('drawings') && !debitLine.account_name.toLowerCase().includes('drawing'))) {
    throw new Error(`Test 3 Failed: Debit account should be Owner's Drawings, got ${debitLine?.account_name}`);
  }
  if (!creditLine || !creditLine.account_name.toLowerCase().includes('bank')) {
    throw new Error(`Test 3 Failed: Credit account should be Main Bank Account, got ${creditLine?.account_name}`);
  }
  if (test3.total_amount !== 20000 && debitLine.total !== 20000) {
    throw new Error(`Test 3 Failed: Amount should be 20000 PKR`);
  }
  console.log("✅ TEST 3 PASSED!");

  console.log("\n=================================================");
  console.log("🎉 ALL 3 AUTONOMOUS UNIT TESTS PASSED FLAWLESSLY!");
  console.log("=================================================");
}

runUnitTests().catch(err => {
  console.error("❌ UNIT TEST FAILED:", err);
  process.exit(1);
});
