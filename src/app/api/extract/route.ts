import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchExchangeRate } from "@/utils/currency";
import { fetchUserSettings } from "@/utils/userSettings";

export async function POST(request: Request) {
 try {
 const cookieStore = await cookies();
 let supabase = createServerClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 {
 cookies: {
 getAll() {
 return cookieStore.getAll();
 },
 setAll(cookiesToSet) {
 try {
 cookiesToSet.forEach(({ name, value, options }) =>
 cookieStore.set(name, value, options)
 );
 } catch {
 // Ignored in server route handlers
 }
 },
 },
 }
 );

 let user = null;
 const { data: cookieAuthData } = await supabase.auth.getUser();
 user = cookieAuthData?.user;

 // Fallback: Check Authorization header for Bearer token
 if (!user) {
 const authHeader = request.headers.get("authorization");
 if (authHeader && authHeader.startsWith("Bearer ")) {
 // Re-instantiate the client so RLS policies work for subsequent queries
 supabase = createServerClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
 {
 global: {
 headers: { Authorization: authHeader }
 },
 cookies: {
 getAll() { return cookieStore.getAll(); },
 setAll() {}
 }
 }
 );
 const { data: tokenAuthData } = await supabase.auth.getUser();
 user = tokenAuthData?.user;
 }
 }

 if (!user) {
 return NextResponse.json({ error: "Unauthorized. Please sign in to log expenses." }, { status: 401 });
 }

 const body = await request.json();
 const { prompt, image: base64Image, history = [], chartOfAccounts = [] } = body;
 
 // Create a string list of valid account names
 const accountNames = chartOfAccounts.map((a: any) => a.name).join(", ") || "No accounts provided";
 const today = new Date().toISOString().split('T')[0];

 // 1. Validation
 if (!prompt && !base64Image) {
 return NextResponse.json(
 { error: "Please provide a prompt or an image." },
 { status: 400 }
 );
 }

 let cleanBase64 = base64Image;
 let detectedMimeType = "image/jpeg";

 if (base64Image && typeof base64Image === 'string') {
 const dataUrlMatches = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
 if (dataUrlMatches) {
 detectedMimeType = dataUrlMatches[1];
 cleanBase64 = dataUrlMatches[2];
 } else {
 cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
 }
 }

  // Context Injection: Fetch user's existing product catalog for entity resolution & deduplication
  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, name")
    .eq("user_id", user.id);

  const catalogListString = existingProducts && existingProducts.length > 0
    ? existingProducts.map((p: any) => `- ID: ${p.id} | Name: "${p.name}"`).join("\n")
    : "No existing products in catalog.";

  // Context Injection: Fetch user settings from Supabase/cache
  const userSettings = await fetchUserSettings(user.id, supabase);

  // Build Dynamic Prompt Instructions based on user settings
  let ambiguityRuleInstruction = '';
  if (userSettings.ai_ambiguity_strictness === 'permissive') {
    ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (PERMISSIVE MODE ENABLED): The user has configured Permissive Ambiguity Strictness. You MUST NOT ask clarification questions for generic or common asset/equipment purchases (e.g., "I bought a table", "bought a chair", "bought a computer", "paid for a desk", "bought 5 laptops"). You MAY auto-map generic purchases directly to reasonable operational expense or equipment accounts (such as 'General Operating Expense' or 'Fixed Assets - Office/Equipment' or 'Rent Expense') without pausing or asking clarification. Set "is_complete": true and stage the transaction immediately as a LOG_BILL or LOG_JOURNAL_ENTRY.`;
  } else if (userSettings.ai_ambiguity_strictness === 'balanced') {
    ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (BALANCED MODE): The user has configured Balanced Ambiguity Strictness. For routine purchases (< 10,000 ${userSettings.currency}), auto-map them to 'General Operating Expense' or 'Fixed Assets - Office/Equipment' without pausing (set is_complete: true). For large or high-value items (> 50,000 ${userSettings.currency}) where intent is completely unclear, set "is_complete": false and ask for clarification.`;
  } else {
    ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (STRICT MODE - TRAP ACTIVE): The user has configured Strict Ambiguity Strictness. If a user buys or purchases an item that could be either for internal office/business use OR for resale to customers (e.g., furniture, computers, tables, laptops, chairs, desks, printers, vehicles, or equipment e.g. "I bought a table for 5,000 PKR" or "Bought a computer for 50,000" or "Bought 5 desks"), and the prompt DOES NOT explicitly specify whether it is for office use or for resale inventory, you MUST NOT guess or assume, and MUST NOT stage a transaction. You MUST set "is_complete": false, and ask for explicit clarification in "conversational_response" and "clarification_question" (e.g., "Did you buy this table for internal office use (Fixed Asset) or for resale to customers (Inventory)?").`;
  }

  const cogsInstruction = userSettings.ai_strict_cogs_realization
    ? `- INVENTORY PURCHASES & STOCK (STRICT COGS MODE ACTIVE): When a user buys physical inventory, stock, or items intended for resale (e.g. "Bought 10 laptops for inventory", "Purchased stock"), you MUST set account_name to 'Inventory Asset'. Buying inventory is an Asset exchange (Debit Inventory Asset, Credit Cash/AP) and MUST NEVER be categorized as 'Cost of Goods Sold' or 'General Operating Expense' at purchase time! Net profit MUST NOT decrease when inventory is purchased.
  - COST OF GOODS SOLD: 'Cost of Goods Sold' is ONLY realized upon selling inventory items (LOG_INVOICE), NEVER upon purchasing inventory.`
    : `- INVENTORY PURCHASES & STOCK: Categorize inventory or direct supply purchases to 'Inventory Asset' or 'General Operating Expense'.`;

  const defaultCurrency = userSettings.currency || 'PKR';

  const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper.
  
  User Operating Preferences:
  - Base Currency: ${defaultCurrency}
  - Timezone: ${userSettings.timezone}
  - Accounting Basis: ${userSettings.accounting_basis}
  - AI Strictness Level: ${userSettings.ai_ambiguity_strictness.toUpperCase()}
  
  You must classify the user's intent and extract structured financial data for double-entry bookkeeping.
  
  EXISTING PRODUCT CATALOG GROUNDING:
  Here is the user's existing product catalog:
  ${catalogListString}
  
  INTENTS:
  - LOG_BILL: User received a bill, or incurred a direct expense (e.g. utilities, rent) from a Vendor/Payee. Do not force product names for generic expenses; treat the vendor as the payee.
  - LOG_INVOICE: User sent an invoice, or received alternative income from a Customer/Client.
  - LOG_PAYMENT_MADE: User paid a bill.
  - LOG_PAYMENT_RECEIVED: User received a payment from a customer.
  - LOG_JOURNAL_ENTRY: User is logging capital contributions, owner drawings, bank transfers, loans received, loan repayments, equity additions, or general adjustments (e.g., "investing 100,000 ${defaultCurrency} into bank as capital", "received a 500,000 ${defaultCurrency} loan from the bank", "repaid 50,000 ${defaultCurrency} loan principal and 5,000 ${defaultCurrency} interest").
  - LOG_INVENTORY_ADJUSTMENT: User reports physical stock count discrepancy or stocktake adjustment (e.g., "I counted 10 items", "5 bananas spilled/spoiled", "Monthly stocktake").
  - UPDATE_TRANSACTION: User wants to update or modify an existing transaction.
  - QUERY_FINANCES: General cash flow or spending queries.
  - QUERY_REPORT: Detailed financial reporting queries like "How much profit did I make this month?" or "Show me my P&L" or "Show me my Balance Sheet".
  - QUERY_DEBT: Queries about who owes money or who the user owes.
  - GENERAL_HELP: General chat or usage help.
  
  RULES FOR EXTRACTION:
  1. Multi-Line Item Extraction: A single receipt/invoice can contain multiple items. You MUST return an array of line items in "line_items". For each item, extract its "description", "quantity", "unit_price", and "total". Never summarize them into a single line.
  2. Missing Data: For LOG_BILL and LOG_INVOICE, if critical fields (total_amount, line_items, customer/supplier name) are missing, DO NOT guess them. For Payments, line_items are NOT required, only amount and name. If data is missing, set "is_complete": false and ask a conversational "clarification_question".
  3. Entity Resolution: Extract the exact legal name of the vendor or client into 'supplier_name' (for bills/payments made) or 'customer_name' (for invoices/payments received), separating it from the line items.
  4. Chart of Accounts Grounding & Account Categorization (CRITICAL): You MUST categorize each line item using ONLY the exact account names provided: [${accountNames}].
  ${cogsInstruction}
  - OPERATING EXPENSES: Map electricity/water/utility bills to 'Utilities', office rent to 'Rent Expense', server/cloud hosting to 'Software & Hosting', interest charges to 'Interest Expense', and general/office supplies to 'General Operating Expense'.
  - If a user prompt mentions multiple expenses (e.g. "rent and AWS bill together"), you MUST split them into separate line items in "line_items" and assign each item its specific account category.
  - You must place the exact account name in the "account_name" field of each line item.
  5. Journal Entry Balancing & Loan/Equity Workflows (CRITICAL for LOG_JOURNAL_ENTRY): If intent is LOG_JOURNAL_ENTRY, you MUST output balanced debit and credit lines in "line_items" using exact Chart of Accounts names: ['Main Bank Account', 'Petty Cash', 'Accounts Receivable', 'Inventory Asset', 'Fixed Assets - Office/Equipment', 'Fixed Assets - Equipment/Furniture', 'Accounts Payable', 'Sales Tax Payable', 'Loan Payable', 'Long-Term Loan Payable', 'Owners Equity', 'Owner Drawings', 'Retained Earnings', 'Sales Revenue', 'Service Revenue', 'Cost of Goods Sold', 'Rent Expense', 'Utilities', 'Software & Hosting', 'Interest Expense', 'General Operating Expense'].
  - Capital Investment e.g. "Investing 100,000 ${defaultCurrency} into bank as owner capital":
    - Line 1 (DEBIT): description: "Capital Investment", account_name: "Main Bank Account", total: 100000, is_debit: true
    - Line 2 (CREDIT): description: "Owner Equity Contribution", account_name: "Owners Equity", total: 100000, is_debit: false
  - Receiving a Loan e.g. "I received a 500,000 ${defaultCurrency} loan from the bank" or "Got a loan of 500,000 ${defaultCurrency}":
    - Line 1 (DEBIT): description: "Bank Loan Proceeds", account_name: "Main Bank Account", total: 500000, is_debit: true
    - Line 2 (CREDIT): description: "Loan Principal Obligation", account_name: "Loan Payable", total: 500000, is_debit: false
    - CRITICAL: Receiving a loan INCREASES Main Bank Account (DEBIT) and INCREASES Loan Payable (CREDIT).
  - Customer Advance Deposit / Unearned Revenue e.g. "Received 50,000 ${defaultCurrency} advance deposit from Customer John" or "Customer paid 50,000 ${defaultCurrency} upfront before job":
    - Line 1 (DEBIT): description: "Advance Received into Bank", account_name: "Main Bank Account", total: 50000, is_debit: true
    - Line 2 (CREDIT): description: "Customer Advance Deposit", account_name: "Customer Advances / Unearned Revenue", total: 50000, is_debit: false
    - CRITICAL: Customer advances DEBIT Cash/Bank and CREDIT "Customer Advances / Unearned Revenue" (Liability increases). Do NOT credit Sales Revenue until earned.
  - Supplier Advance Payment / Prepaid Expense e.g. "Paid 30,000 ${defaultCurrency} advance to Supplier Acme" or "Prepaid vendor 30,000 ${defaultCurrency} for materials":
    - Line 1 (DEBIT): description: "Prepaid Supplier Advance", account_name: "Supplier Advances / Prepaid Expenses", total: 30000, is_debit: true
    - Line 2 (CREDIT): description: "Advance Paid from Bank", account_name: "Main Bank Account", total: 30000, is_debit: false
    - CRITICAL: Supplier advances DEBIT "Supplier Advances / Prepaid Expenses" (Asset increases) and CREDIT Cash/Bank.
  - Repaying a Loan with Interest Split e.g. "Paid 10,000 ${defaultCurrency} to HBL Loan, 2,000 is interest" or "Repaid 50,000 ${defaultCurrency} loan principal and 5,000 ${defaultCurrency} interest":
    - Line 1 (DEBIT): description: "Loan Principal Repayment", account_name: "Loan Payable", total: 8000, is_debit: true
    - Line 2 (DEBIT): description: "Interest Expense", account_name: "Interest Expense", total: 2000, is_debit: true
    - Line 3 (CREDIT): description: "Cash Paid for Principal and Interest", account_name: "Main Bank Account", total: 10000, is_debit: false
    - CRITICAL: Repaying a loan DECREASES the specific Loan liability (DEBIT principal), INVOICES Interest Expense (DEBIT fee), and DECREASES Main Bank Account (CREDIT total). Total Debits MUST equal Total Credits.
  - Bank/Cash Transfer e.g. "Transfer 5,000 from Bank to Petty Cash" or "Deposited cash into bank":
    - Line 1 (DEBIT): description: "Transfer to Receiving Account", account_name: "Petty Cash", total: 5000, is_debit: true
    - Line 2 (CREDIT): description: "Transfer from Sending Account", account_name: "Main Bank Account", total: 5000, is_debit: false
  - Owner Drawings e.g. "I withdrew 10,000 ${defaultCurrency} for personal use" or "Owner drew 10,000 ${defaultCurrency}":
    - Line 1 (DEBIT): description: "Owner Personal Withdrawal", account_name: "Owner Drawings", total: 10000, is_debit: true
    - Line 2 (CREDIT): description: "Withdrawal from Cash/Bank", account_name: "Petty Cash", total: 10000, is_debit: false
    - CRITICAL: Owner drawings DEBIT "Owner Drawings" (Equity deduction) and CREDIT "Petty Cash" or "Main Bank Account" (Cash decrease).
  - Quick Cash Sale / Walk-In Customer Sale e.g. "I sold a desk to a walk-in customer for 5,000 ${defaultCurrency} cash" or "Sold a soda for 150 ${defaultCurrency} cash" or "Cash sale 3,000 ${defaultCurrency} for services":
    - Line 1 (DEBIT): description: "Cash Sale Proceeds", account_name: "Petty Cash", total: 5000, is_debit: true
    - Line 2 (CREDIT): description: "Sales Revenue", account_name: "Sales Revenue", total: 5000, is_debit: false
    - CRITICAL: A quick cash sale or walk-in customer sale does NOT require a customer name or invoice creation. Stage a direct LOG_JOURNAL_ENTRY (Debit Petty Cash/Main Bank, Credit Sales Revenue). NEVER set is_complete: false or ask for a customer name when the user indicates a walk-in cash sale!
  - Customer Payment / Partial Invoice Payment e.g. "Faizan paid 10,000 towards his 50,000 invoice" or "Received 10,000 payment from Faizan":
    - Line 1 (DEBIT): description: "Customer Payment Received", account_name: "Main Bank Account", total: 10000, is_debit: true
    - Line 2 (CREDIT): description: "Reduce Accounts Receivable", account_name: "Accounts Receivable", total: 10000, is_debit: false
    - CRITICAL: Customer invoice payments DEBIT "Main Bank Account" (Cash increases) and CREDIT "Accounts Receivable" (A/R asset decreases for the exact payment amount). DO NOT create a new sale/revenue or mark whole invoice as paid if partial.
  - Vendor / Supplier Bill Payment e.g. "Paid 15,000 to Acme Supplies for bill" or "Partial payment 15,000 towards vendor bill":
    - Line 1 (DEBIT): description: "Reduce Accounts Payable", account_name: "Accounts Payable", total: 15000, is_debit: true
    - Line 2 (CREDIT): description: "Vendor Payment from Bank", account_name: "Main Bank Account", total: 15000, is_debit: false
    - CRITICAL: Vendor payments DEBIT "Accounts Payable" (A/P liability decreases) and CREDIT "Main Bank Account" (Cash decreases).
  - Purchasing Fixed Assets for Office Use e.g. "Bought office computer for 80,000 ${defaultCurrency}":
    - Line 1 (DEBIT): description: "Office Equipment Purchase", account_name: "Fixed Assets - Office/Equipment", total: 80000, is_debit: true
    - Line 2 (CREDIT): description: "Payment from Bank", account_name: "Main Bank Account", total: 80000, is_debit: false
  6. Product Deduplication (CRITICAL): You MUST map the extracted item to an existing product in the user's catalog if they are semantically identical (e.g., map '1kg mangoes', 'Mangoes', or 'fresh mango' to the existing product 'Mango'). Return the existing product's UUID in "product_id" and its exact catalog name in "product_name".
  7. Product Normalization (CRITICAL): If the product truly does not exist in the catalog and you must create a new one, you MUST normalize the string. Remove all quantities, adjectives, and units of measurement. Always use singular nouns (e.g., create 'Mango', never 'Mangoes' or 'Red Mangoes'). Set "product_id": null and "product_name": "Normalized Product Name".
  8. Quantities & Purchase Unit Costs: You must separate the quantity and unit of measurement from the product name. If the user says "50 kg banana for 4,567 ${defaultCurrency}", the product_name is "Banana", the quantity is 50, total is 4567, and unit_price is 91.34 (4567 / 50). Do NOT include units ('kg', 'lbs', 'boxes', 'pcs', etc.) in the product name. For LOG_BILL and LOG_INVOICE of physical inventory items, you MUST ALWAYS extract a numeric quantity so the database can calculate unit cost = amount / quantity to update product inventory and unit cost.
  9. Smart Inventory Tracking: Determine if an item is physical inventory. If the item has physical units (kg, boxes, pcs) or is a quantifiable tangible good (e.g. "Banana"), set "is_inventory_tracked" to true. If it is a service (e.g. "Web Design", "Hosting", "Consulting") or generic expense, set it to false.
  ${ambiguityRuleInstruction}
  10. Dates: Today's date is ${today}. If the user says "yesterday" or "today" or a day of the week, calculate the exact YYYY-MM-DD based on today. The "issue_date" and "due_date" MUST be in strict YYYY-MM-DD format. If no issue_date is given, default to ${today}.
  11. Currency Code: Extract the 3-letter currency code (e.g. 'USD', 'EUR', 'GBP', 'PKR') from symbols ($ = USD, € = EUR, £ = GBP, Rs / PKR = PKR) or context. Default to '${defaultCurrency}' if unspecified.
  12. Inventory Stocktake Adjustments (LOG_INVENTORY_ADJUSTMENT): If the intent is LOG_INVENTORY_ADJUSTMENT, extract "product_name" (the name of the product), "product_id" (if matching catalog), "actual_stock_count" (the actual physical count on shelf), and "reason" (e.g. "Monthly stocktake", "Spilled milk", "Stolen goods").
  13. Conversational Queries: If intent is QUERY_FINANCES, you must provide query_parameters to specify what you need (revenue, expenses, all). If intent is UPDATE_TRANSACTION, you must extract the transaction_id from the history and provide update_parameters.
  14. Chat History & Privacy: You MUST know that ALL chat history and financial logs ARE securely stored in the system database. Users can view their entire history at any time by clicking the "Chat History" button in the UI. If a user asks about chat history, memory, or persistence, you must explicitly confirm that their history is safely stored and accessible to them.
  15. External Reference Numbers (CRITICAL): When processing uploaded receipts, vendor bills, invoices, or prompt text containing vendor receipt/invoice numbers (e.g. 'REF-9942', 'INV-10293', 'Receipt #4810', 'Bill #9942'), you MUST extract the vendor's receipt/invoice number and map it to "external_reference_number".
  16. Autonomous Verification Mode: ${userSettings.ai_require_manual_verification ? "Manual Verification is REQUIRED. Output drafts for user ledger review." : "Auto-Approval is ENABLED. Pre-approve fully confident entries."}
  
  OUTPUT FORMAT:
  You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting, backticks, or any conversational text outside the JSON:
  {
  "intent": "LOG_BILL" | "LOG_INVOICE" | "LOG_PAYMENT_MADE" | "LOG_PAYMENT_RECEIVED" | "LOG_JOURNAL_ENTRY" | "LOG_INVENTORY_ADJUSTMENT" | "UPDATE_TRANSACTION" | "QUERY_FINANCES" | "QUERY_DEBT" | "QUERY_REPORT" | "GENERAL_HELP",
  "customer_name": "string | null",
  "supplier_name": "string | null",
  "external_reference_number": "string | null",
  "product_name": "string | null",
  "actual_stock_count": number | null,
  "reason": "string | null",
  "total_amount": number | null,
  "currency_code": "${defaultCurrency}" | "PKR" | "USD" | "EUR" | "GBP" | string,
  "status": "paid" | "open" | "partial" | "draft",
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD | null",
  "line_items": [
  {
  "description": "string",
  "quantity": number,
  "unit_price": number,
  "total": number,
  "account_name": "string",
  "product_id": "string | null",
  "product_name": "string | null",
  "is_inventory_tracked": boolean,
  "is_debit": boolean
  }
  ],
  "is_complete": boolean,
  "clarification_question": "string | null",
  "conversational_response": "string | null"
  }`;

  const model = getGeminiModel();

  // 3. Construct multi-turn contents
  const contents: any[] = [];

  // Map passed history to Gemini format
  for (const msg of history) {
    if (msg.sender === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.sender === 'ai') {
      if (msg.extractedDraft) {
        contents.push({ role: 'model', parts: [{ text: JSON.stringify(msg.extractedDraft) }] });
      } else {
        contents.push({ role: 'model', parts: [{ text: msg.text }] });
      }
    }
  }

  // Current turn parts
  const currentParts: any[] = [];
  if (cleanBase64) {
    currentParts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: detectedMimeType,
      },
    });
  }
  if (prompt) {
    currentParts.push({ text: prompt });
  }

  contents.push({ role: 'user', parts: currentParts });

  // Ensure we start with system instruction
  const finalContents = [
    { role: 'user', parts: [{ text: systemInstruction }] },
    { role: 'model', parts: [{ text: 'Understood. I will respond strictly in the requested JSON format.' }] },
    ...contents
  ];

  // 4. Execution
  const result = await model.generateContent({ contents: finalContents });
  const responseText = result.response.text();
  
  // 5. Formatting: Strip markdown code blocks before parsing
  const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
  let structuredData: any;
  try {
    structuredData = JSON.parse(cleanedText);
    
    // Basic runtime validation of AI response structure
    if (!structuredData.intent) structuredData.intent = 'GENERAL_HELP';

    // Ambiguity Trap Guardrail (Asset vs Inventory) evaluated against userSettings.ai_ambiguity_strictness
    const lowerPrompt = (prompt || '').toLowerCase();
    const ambiguousKeywords = ['table', 'desk', 'chair', 'furniture', 'seating', 'device', 'appliance', 'fixture', 'computer', 'laptop', 'equipment', 'printer', 'vehicle', 'phone', 'machinery', 'tool'];
    const explicitContext = ['fixed asset', 'resale', 'inventory', 'stock', 'for resale', 'walk-in', 'sold'];
    
    const mentionsAmbiguousItem = ambiguousKeywords.some(k => lowerPrompt.includes(k));
    const hasExplicitContext = explicitContext.some(k => lowerPrompt.includes(k));
    const isPurchase = lowerPrompt.includes('bought') || lowerPrompt.includes('purchased') || lowerPrompt.includes('buy') || lowerPrompt.includes('purchasing') || lowerPrompt.includes('acquired') || lowerPrompt.includes('got') || lowerPrompt.includes('procured') || lowerPrompt.includes('ordered');

    if (userSettings.ai_ambiguity_strictness === 'strict') {
      if (mentionsAmbiguousItem && isPurchase && !hasExplicitContext) {
        structuredData.is_complete = false;
        const matchedItem = ambiguousKeywords.find(k => lowerPrompt.includes(k)) || 'item';
        const question = `Did you buy/acquire this ${matchedItem} for internal office use (Fixed Asset) or as inventory to sell to customers?`;
        structuredData.clarification_question = question;
        structuredData.conversational_response = question;
      }
    } else if (userSettings.ai_ambiguity_strictness === 'permissive') {
      // In Permissive mode, automatically bypass ambiguity trap and complete transaction
      if (mentionsAmbiguousItem && isPurchase && !hasExplicitContext) {
        structuredData.is_complete = true;
        structuredData.clarification_question = null;
        
        // Ensure total_amount and line_items are populated
        if (!structuredData.total_amount) {
          const matchAmount = prompt.match(/\b\d+([,.]\d+)?\b/);
          if (matchAmount) {
            structuredData.total_amount = parseFloat(matchAmount[0].replace(/,/g, ''));
          }
        }
        
        if (!structuredData.line_items || !Array.isArray(structuredData.line_items) || structuredData.line_items.length === 0) {
          const matchedItem = ambiguousKeywords.find(k => lowerPrompt.includes(k)) || 'Asset/Supply';
          const itemName = matchedItem.charAt(0).toUpperCase() + matchedItem.slice(1);
          const amt = structuredData.total_amount || 0;
          structuredData.line_items = [{
            description: `${itemName} purchase`,
            quantity: 1,
            unit_price: amt,
            total: amt,
            account_name: 'General Operating Expense',
            product_id: null,
            product_name: itemName,
            is_inventory_tracked: false,
            is_debit: true
          }];
        }
        
        if (!structuredData.conversational_response || structuredData.conversational_response.includes('Did you buy') || structuredData.conversational_response.includes('acquire this')) {
          structuredData.conversational_response = `I have staged your purchase of ${structuredData.total_amount || ''} ${defaultCurrency} under General Operating Expense (Permissive AI Strictness).`;
        }
      }
    }

  if (['LOG_BILL', 'LOG_INVOICE'].includes(structuredData.intent)) {
    // Ambiguity Safeguard: Check if extracted line items match existing products partially or in a similar category (only when not in permissive mode)
    if (userSettings.ai_ambiguity_strictness !== 'permissive' && existingProducts && existingProducts.length > 0 && Array.isArray(structuredData.line_items)) {
      for (const item of structuredData.line_items) {
        if (!item.product_id && item.product_name) {
          const lowerExt = item.product_name.toLowerCase();
          const ambMatch = existingProducts.find((p: any) => {
            const lowerP = p.name.toLowerCase();
            const isCompPair = (lowerExt.includes('computer') || lowerExt.includes('pc') || lowerExt.includes('desktop')) && 
              (lowerP.includes('laptop') || lowerP.includes('computer'));
            const isPartialMatch = lowerExt.includes(lowerP) || lowerP.includes(lowerExt);
            return isCompPair || (isPartialMatch && lowerExt !== lowerP);
          });

          if (ambMatch) {
            structuredData.is_complete = false;
            const question = `You mentioned '${item.product_name}'. Should I log this under your existing '${ambMatch.name}' product, or create a new product entry?`;
            structuredData.clarification_question = question;
            structuredData.conversational_response = question;
            break;
          }
        }
      }
    }

    if (
      !structuredData.total_amount || 
      !structuredData.line_items || 
      !Array.isArray(structuredData.line_items) || 
      structuredData.line_items.length === 0
    ) {
      if (structuredData.is_complete !== true) {
        structuredData.is_complete = false;
        structuredData.clarification_question = structuredData.clarification_question || "I couldn't detect the total amount or the individual items. Could you provide those details?";
      }
    } else if (structuredData.is_complete !== false) {
 // Real-Time Multi-Currency Conversion Engine
 const currencyCode = (structuredData.currency_code || 'PKR').toUpperCase();
 const rate = await fetchExchangeRate(currencyCode, 'PKR');

 structuredData.currency_code = currencyCode;
 structuredData.exchange_rate = rate;
 structuredData.original_amount = structuredData.total_amount;

 // Convert total_amount to Base Currency (PKR) for ledger stability
 const baseTotalAmount = Math.round((structuredData.total_amount * rate) * 100) / 100;
 structuredData.total_amount = baseTotalAmount;

 // Convert line items to Base Currency (PKR)
 if (Array.isArray(structuredData.line_items)) {
 structuredData.line_items = structuredData.line_items.map((item: any) => ({
 ...item,
 original_unit_price: item.unit_price,
 original_total: item.total,
 unit_price: Math.round(((item.unit_price || 0) * rate) * 100) / 100,
 total: Math.round(((item.total || 0) * rate) * 100) / 100,
 currency_code: currencyCode,
 exchange_rate: rate
 }));
 }

 if (currencyCode !== 'PKR') {
 structuredData.conversational_response = `Converted ${structuredData.original_amount} ${currencyCode} to base currency: ${baseTotalAmount} PKR (Exchange Rate: ${rate} PKR/${currencyCode}).`;
 }
 }
 }

 if (structuredData.intent === 'QUERY_FINANCES') {
 const target = structuredData.query_parameters?.target || 'all';
 let context = "Real Database Balances:\n";
 let totalRevenue = 0;
 let totalExpenses = 0;

 if (target === 'revenue' || target === 'all') {
 const { data: invoices } = await supabase.from('invoices').select('total_amount').eq('user_id', user.id).neq('status', 'draft');
 totalRevenue = invoices?.reduce((acc, inv) => acc + Number(inv.total_amount), 0) || 0;
 context += `- Total Revenue: ${totalRevenue} PKR\n`;
 }

 if (target === 'expenses' || target === 'all') {
 const { data: bills } = await supabase.from('bills').select('total_amount').eq('user_id', user.id).neq('status', 'draft');
 totalExpenses = bills?.reduce((acc, bill) => acc + Number(bill.total_amount), 0) || 0;
 context += `- Total Expenses: ${totalExpenses} PKR\n`;
 }

 const secondPassContents = [
 ...finalContents,
 { role: 'model', parts: [{ text: cleanedText }] },
 { role: 'user', parts: [{ text: `Do not hallucinate. Using this real database data, answer the user's query accurately in the conversational_response field:\n${context}` }] }
 ];

 const result2 = await model.generateContent({ contents: secondPassContents });
 const cleanedText2 = result2.response.text().replace(/```json\n?|```/g, '').trim();
 structuredData = JSON.parse(cleanedText2);
 }

 if (structuredData.intent === 'QUERY_REPORT') {
 let context = "Profit and Loss Summary (Real Ledger Data):\n";
 const { data: accounts } = await supabase.from('accounts').select('id, name, type').eq('user_id', user.id);
 const { data: journalLines } = await supabase.from('journal_lines').select('account_id, debit, credit, journal_entries!inner(user_id)').eq('journal_entries.user_id', user.id);
 
 let revenue = 0;
 let cogs = 0;
 let opex = 0;

 if (accounts && journalLines) {
 const balances = new Map<string, number>();
 for (const l of journalLines) {
 const d = Math.round(Number(l.debit || 0) * 100);
 const c = Math.round(Number(l.credit || 0) * 100);
 balances.set(l.account_id, (balances.get(l.account_id) || 0) + (d - c));
 }
 
 for (const acc of accounts) {
 const bal = balances.get(acc.id) || 0;
 if (acc.type === 'revenue') {
 revenue += (-bal); // Credit normal
 } else if (acc.type === 'expense') {
 if (acc.name === 'Cost of Goods Sold') {
 cogs += bal; // Debit normal
 } else {
 opex += bal;
 }
 }
 }
 }
 
 const gp = revenue - cogs;
 const np = gp - opex;

 context += `- Total Revenue: ${revenue / 100} PKR\n`;
 context += `- Cost of Goods Sold: ${cogs / 100} PKR\n`;
 context += `- Gross Profit: ${gp / 100} PKR\n`;
 context += `- Operating Expenses: ${opex / 100} PKR\n`;
 context += `- Net Profit: ${np / 100} PKR\n`;

 const secondPassContents = [
 ...finalContents,
 { role: 'model', parts: [{ text: cleanedText }] },
 { role: 'user', parts: [{ text: `Do not hallucinate. Using this real P&L database data, answer the user's report query accurately in the conversational_response field:\n${context}` }] }
 ];

 const result2 = await model.generateContent({ contents: secondPassContents });
 const cleanedText2 = result2.response.text().replace(/```json\n?|```/g, '').trim();
 structuredData = JSON.parse(cleanedText2);
 }

 if (structuredData.intent === 'QUERY_DEBT') {
 let context = "Real Database Outstanding Debt:\n";
 
 const { data: unpaidInvoices } = await supabase.from('invoices')
 .select('balance_due, customers(name)')
 .eq('user_id', user.id)
 .gt('balance_due', 0);
 
 let arTotal = 0;
 if (unpaidInvoices && unpaidInvoices.length > 0) {
 context += "Money owed TO you (Accounts Receivable):\n";
 unpaidInvoices.forEach(inv => {
 const custName = Array.isArray(inv.customers) ? inv.customers[0]?.name : (inv.customers as any)?.name;
 context += `- ${custName || 'Unknown'}: ${inv.balance_due} PKR\n`;
 arTotal += Number(inv.balance_due);
 });
 context += `Total A/R: ${arTotal} PKR\n\n`;
 } else {
 context += "Money owed TO you (Accounts Receivable): None\n\n";
 }

 const { data: unpaidBills } = await supabase.from('bills')
 .select('balance_due, suppliers(name)')
 .eq('user_id', user.id)
 .gt('balance_due', 0);

 let apTotal = 0;
 if (unpaidBills && unpaidBills.length > 0) {
 context += "Money YOU owe (Accounts Payable):\n";
 unpaidBills.forEach(bill => {
 const suppName = Array.isArray(bill.suppliers) ? bill.suppliers[0]?.name : (bill.suppliers as any)?.name;
 context += `- ${suppName || 'Unknown'}: ${bill.balance_due} PKR\n`;
 apTotal += Number(bill.balance_due);
 });
 context += `Total A/P: ${apTotal} PKR\n`;
 } else {
 context += "Money YOU owe (Accounts Payable): None\n";
 }

 const secondPassContents = [
 ...finalContents,
 { role: 'model', parts: [{ text: cleanedText }] },
 { role: 'user', parts: [{ text: `Do not hallucinate. Using this real database data, answer the user's debt query accurately in the conversational_response field:\n${context}` }] }
 ];

 const result2 = await model.generateContent({ contents: secondPassContents });
 const cleanedText2 = result2.response.text().replace(/```json\n?|```/g, '').trim();
 structuredData = JSON.parse(cleanedText2);
 }

 if (structuredData.intent === 'LOG_PAYMENT_MADE' && structuredData.is_complete) {
 if (structuredData.supplier_name && structuredData.total_amount) {
 const { data: supplier } = await supabase.from('suppliers').select('id').ilike('name', `%${structuredData.supplier_name}%`).eq('user_id', user.id).single();
 if (supplier) {
 const { data: openBills } = await supabase.from('bills').select('id, balance_due').eq('user_id', user.id).eq('supplier_id', supplier.id).gt('balance_due', 0).order('issue_date', { ascending: true });
 if (openBills && openBills.length > 0) {
 const exactMatch = openBills.find(b => Number(b.balance_due) === Number(structuredData.total_amount));
 
 if (exactMatch) {
 await supabase.rpc('log_payment_made_atomic', {
 p_bill_id: exactMatch.id,
 p_user_id: user.id,
 p_amount: Number(structuredData.total_amount),
 p_date: structuredData.issue_date || today,
 p_method: structuredData.payment_method || 'Cash'
 });
 structuredData.conversational_response = `I logged a payment of ${structuredData.total_amount} PKR to ${structuredData.supplier_name} for the exact matching bill.`;
 } else if (openBills.length === 1) {
 const billToPay = openBills[0];
 const amountToPay = Math.min(Number(billToPay.balance_due), Number(structuredData.total_amount));
 await supabase.rpc('log_payment_made_atomic', {
 p_bill_id: billToPay.id,
 p_user_id: user.id,
 p_amount: amountToPay,
 p_date: structuredData.issue_date || today,
 p_method: structuredData.payment_method || 'Cash'
 });
 structuredData.conversational_response = `I logged a payment of ${amountToPay} PKR to ${structuredData.supplier_name} for the only open bill.`;
 } else {
 structuredData.conversational_response = `I found multiple open bills for ${structuredData.supplier_name}, but none match the exact amount of ${structuredData.total_amount} PKR. Please specify which bill you are paying or log it manually from the Purchases Hub.`;
 structuredData.is_complete = false;
 }
 } else {
 structuredData.conversational_response = `I couldn't find any unpaid bills for ${structuredData.supplier_name}.`;
 }
 } else {
 structuredData.conversational_response = `I couldn't find a supplier named ${structuredData.supplier_name}.`;
 }
 }
 }

 if (structuredData.intent === 'LOG_PAYMENT_RECEIVED' && structuredData.is_complete) {
 if (structuredData.customer_name && structuredData.total_amount) {
 const { data: customer } = await supabase.from('customers').select('id').ilike('name', `%${structuredData.customer_name}%`).eq('user_id', user.id).single();
 if (customer) {
 const { data: openInvoices } = await supabase.from('invoices').select('id, balance_due').eq('user_id', user.id).eq('customer_id', customer.id).gt('balance_due', 0).order('issue_date', { ascending: true });
 if (openInvoices && openInvoices.length > 0) {
 const exactMatch = openInvoices.find(b => Number(b.balance_due) === Number(structuredData.total_amount));

 if (exactMatch) {
 await supabase.rpc('log_payment_received_atomic', {
 p_invoice_id: exactMatch.id,
 p_user_id: user.id,
 p_amount: Number(structuredData.total_amount),
 p_date: structuredData.issue_date || today,
 p_method: structuredData.payment_method || 'Cash'
 });
 structuredData.conversational_response = `I logged a received payment of ${structuredData.total_amount} PKR from ${structuredData.customer_name} for the exact matching invoice.`;
 } else if (openInvoices.length === 1) {
 const invoiceToPay = openInvoices[0];
 const amountToPay = Math.min(Number(invoiceToPay.balance_due), Number(structuredData.total_amount));
 await supabase.rpc('log_payment_received_atomic', {
 p_invoice_id: invoiceToPay.id,
 p_user_id: user.id,
 p_amount: amountToPay,
 p_date: structuredData.issue_date || today,
 p_method: structuredData.payment_method || 'Cash'
 });
 structuredData.conversational_response = `I logged a received payment of ${amountToPay} PKR from ${structuredData.customer_name} for the open invoice.`;
 } else {
 structuredData.conversational_response = `I found multiple open invoices for ${structuredData.customer_name}, but none match the exact amount of ${structuredData.total_amount} PKR. Please specify which invoice is being paid or log it manually from the Revenue Hub.`;
 structuredData.is_complete = false;
 }
 } else {
 structuredData.conversational_response = `I couldn't find any unpaid invoices for ${structuredData.customer_name}.`;
 }
 } else {
 structuredData.conversational_response = `I couldn't find a customer named ${structuredData.customer_name}.`;
 }
 }
 }

 if (structuredData.intent === 'LOG_INVENTORY_ADJUSTMENT') {
 if (structuredData.product_name && typeof structuredData.actual_stock_count === 'number') {
 const { data: prod } = await supabase
 .from('products')
 .select('id, name, inventory_count, cost')
 .ilike('name', `%${structuredData.product_name}%`)
 .eq('user_id', user.id)
 .maybeSingle();

 if (prod) {
 const { data: rpcRes, error: rpcErr } = await supabase.rpc('reconcile_inventory_atomic', {
 p_user_id: user.id,
 p_product_id: prod.id,
 p_actual_stock_count: structuredData.actual_stock_count,
 p_reason: structuredData.reason || 'Stocktake adjustment'
 });

 if (rpcErr) {
 structuredData.conversational_response = `Failed to reconcile inventory: ${rpcErr.message}`;
 structuredData.is_complete = false;
 } else {
 const oldStock = prod.inventory_count || 0;
 const diff = structuredData.actual_stock_count - oldStock;
 const val = Math.abs(diff * (prod.cost || 0));
 
 if (diff > 0) {
 structuredData.conversational_response = `I updated stock for ${prod.name} from ${oldStock} to ${structuredData.actual_stock_count} (+${diff} surplus). Credited Inventory Shrinkage/Variance Expense by ${val} PKR and debited Inventory Asset.`;
 } else if (diff < 0) {
 structuredData.conversational_response = `I updated stock for ${prod.name} from ${oldStock} to ${structuredData.actual_stock_count} (${diff} shrinkage/waste). Debited Inventory Shrinkage/Variance Expense by ${val} PKR and credited Inventory Asset.`;
 } else {
 structuredData.conversational_response = `Physical stock count for ${prod.name} matches current ledger (${structuredData.actual_stock_count}). No inventory adjustment needed.`;
 }
 structuredData.is_complete = true;
 }
 } else {
 structuredData.conversational_response = `I couldn't find a product named "${structuredData.product_name}" in your product catalog. Please create or edit the product first in the Revenue/Sales Hub.`;
 structuredData.is_complete = false;
 }
 } else {
 structuredData.conversational_response = "I need the product name and the actual physical stock count to reconcile inventory.";
 structuredData.is_complete = false;
 }
 }

 if (structuredData.intent === 'UPDATE_TRANSACTION') {
 const up = structuredData.update_parameters;
 if (up?.transaction_id && up?.new_amount && up?.update_type) {
 const safeAmountCents = Math.round(parseFloat(up.new_amount.toString().replace(/[^0-9.-]/g, '')) * 100);
 
 if (up.update_type === 'bill') {
 const { data: currentBill } = await supabase.from('bills').select('*, bill_lines(account_id)').eq('id', up.transaction_id).eq('user_id', user.id).single();
 if (currentBill) {
 await supabase.rpc('update_bill_atomic', {
 p_bill_id: currentBill.id,
 p_user_id: user.id,
 p_supplier_id: currentBill.supplier_id,
 p_issue_date: currentBill.issue_date,
 p_due_date: currentBill.due_date,
 p_status: currentBill.status,
 p_total_amount: Math.round(safeAmountCents) / 100,
 p_receipt_url: currentBill.receipt_url,
 p_line_items: [{
 account_id: currentBill.bill_lines?.[0]?.account_id || null,
 description: 'Updated via AI',
 amount: Math.round(safeAmountCents) / 100
 }]
 });
 structuredData.conversational_response = `Successfully updated the bill amount to ${up.new_amount} PKR.`;
 }
 } else {
 const { data: currentInvoice } = await supabase.from('invoices').select('*').eq('id', up.transaction_id).eq('user_id', user.id).single();
 if (currentInvoice) {
 await supabase.rpc('update_invoice_atomic', {
 p_invoice_id: currentInvoice.id,
 p_user_id: user.id,
 p_customer_id: currentInvoice.customer_id,
 p_issue_date: currentInvoice.issue_date,
 p_due_date: currentInvoice.due_date,
 p_status: currentInvoice.status,
 p_total_amount: Math.round(safeAmountCents) / 100,
 p_receipt_url: currentInvoice.receipt_url,
 p_line_items: [{
 product_id: null,
 description: 'Updated via AI',
 quantity: 1,
 unit_price: Math.round(safeAmountCents) / 100,
 total: Math.round(safeAmountCents) / 100
 }]
 });
 structuredData.conversational_response = `Successfully updated the invoice amount to ${up.new_amount} PKR.`;
 }
 }
 } else {
 structuredData.conversational_response = "I need to know which transaction you want to update and the new amount. (Please click the edit icon in the UI if this is an older transaction).";
 }
 }

 } catch (e) {
 console.error("Failed to parse JSON from AI response:", e);
 // Graceful fallback instead of crashing
 structuredData = {
 intent: 'GENERAL_HELP',
 is_complete: false,
 clarification_question: "I couldn't quite understand that. Could you please rephrase or provide the receipt details again?",
 conversational_response: null,
 };
 }

 return NextResponse.json(structuredData, { status: 200 });

 } catch (error) {
 console.error("AI PARSING ERROR:", error);
 return NextResponse.json(
 { error: "Failed to process the receipt data." },
 { status: 500 }
 );
 }
}