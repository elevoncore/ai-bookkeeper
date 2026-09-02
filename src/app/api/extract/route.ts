import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchExchangeRate } from "@/utils/currency";
import { fetchUserSettings, DEFAULT_USER_SETTINGS } from "@/utils/userSettings";

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
    const { prompt, image: base64Image, history = [], chartOfAccounts = [], settings: clientSettings } = body;
    
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
      .select("id, name, cost, price, is_inventory_tracked, inventory_count")
      .eq("user_id", user.id);

    const catalogListString = existingProducts && existingProducts.length > 0
      ? existingProducts.map((p: any) => `- ID: ${p.id} | Name: "${p.name}" | Stock: ${p.inventory_count || 0} | WAC Cost: ${p.cost || 0} PKR | Price: ${p.price || 0} PKR | Tracked: ${!!p.is_inventory_tracked}`).join("\n")
      : "No existing products in catalog.";

    // Context Injection: Fetch user settings from Supabase/cache or client
    const userSettings = clientSettings 
      ? { ...DEFAULT_USER_SETTINGS, ...clientSettings } 
      : await fetchUserSettings(user.id, supabase);

    // Build Dynamic Prompt Instructions based on user settings
    let ambiguityRuleInstruction = '';
    if (userSettings.ai_ambiguity_strictness === 'permissive') {
      ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (PERMISSIVE MODE ENABLED): The user has configured Permissive Ambiguity Strictness. You MUST NOT ask clarification questions for generic or common asset/equipment purchases (e.g., "I bought a table", "bought a chair", "bought a computer", "paid for a desk", "bought 5 laptops"). You MAY auto-map generic purchases directly to reasonable operational expense or equipment accounts (such as 'General Operating Expense' or 'Fixed Assets - Office/Equipment' or 'Rent Expense') without pausing or asking clarification. Set "is_complete": true and stage the transaction immediately as a LOG_BILL or LOG_JOURNAL_ENTRY.`;
    } else if (userSettings.ai_ambiguity_strictness === 'balanced') {
      ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (BALANCED MODE): The user has configured Balanced Ambiguity Strictness. For routine purchases (< 10,000 ${userSettings.currency}), auto-map them to 'General Operating Expense' or 'Fixed Assets - Office/Equipment' without pausing (set is_complete: true). For large or high-value items (> 50,000 ${userSettings.currency}) where intent is completely unclear, set "is_complete": false and ask for clarification.`;
    } else {
      ambiguityRuleInstruction = `9. Asset vs Inventory Ambiguity Rule (STRICT MODE - TRAP ACTIVE): The user has configured Strict Ambiguity Strictness. If a user buys or purchases an item that could be either for internal office/business use OR for resale to customers (e.g., furniture, computers, tables, laptops, chairs, desks, printers, vehicles, or equipment e.g. "I bought a table for 5,000 PKR" or "Bought a computer for 50,000" or "Bought 5 desks"), and the prompt DOES NOT explicitly specify whether it is for office use or for resale inventory, you MUST NOT guess or assume, and MUST NOT stage a transaction. You MUST set "is_complete": false, and ask for explicit clarification in "conversational_response" and "clarification_question" (e.g., "Did you buy this table for internal office use (Fixed Asset) or for resale to customers (Inventory)?"). EXCEPTION: If the user explicitly mentions that the item is being sold or immediately sold (e.g., "bought a phone and immediately sold it" or "purchased for a customer and sold it"), the resale intent is explicit. You MUST NOT ask clarification questions and instead set is_complete: true and stage the balanced 4-line journal entry immediately.`;
    }

    const cogsInstruction = userSettings.ai_strict_cogs_realization
      ? `- INVENTORY PURCHASES & STOCK (STRICT COGS MODE ACTIVE): When a user buys physical inventory, stock, or items intended for resale (e.g. "Bought 10 laptops for inventory", "Purchased stock"), you MUST set account_name to 'Inventory Asset'. Buying inventory is an Asset exchange (Debit Inventory Asset, Credit Cash/AP) and MUST NEVER be categorized as 'Cost of Goods Sold' or 'General Operating Expense' at purchase time! Net profit MUST NOT decrease when inventory is purchased.
  - COST OF GOODS SOLD: 'Cost of Goods Sold' is ONLY realized upon selling inventory items (LOG_INVOICE), NEVER upon purchasing inventory.`
      : `- INVENTORY PURCHASES & STOCK: Categorize inventory or direct supply purchases to 'Inventory Asset' or 'General Operating Expense'.`;

    const defaultCurrency = userSettings.currency || 'PKR';

    const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper with structured tool-calling capabilities.
    
    User Operating Preferences:
    - Base Currency: ${defaultCurrency}
    - Timezone: ${userSettings.timezone}
    - Accounting Basis: ${userSettings.accounting_basis}
    - AI Strictness Level: ${userSettings.ai_ambiguity_strictness.toUpperCase()}
    
    You must classify the user's intent, extract structured financial data, and trigger deterministic queries.
    
    EXISTING PRODUCT CATALOG GROUNDING:
    ${catalogListString}
    
    INTENTS:
    - LOG_BILL: User received a bill or incurred an expense from a Vendor/Payee. For ad-hoc services (e.g. plumbing, repairs), set product_id to null and map directly to GL expense.
    - LOG_INVOICE: User billed a customer for goods or services (e.g. custom landing page design, consulting). For ad-hoc services, set product_id to null and map to Service Revenue.
    - LOG_PAYMENT_MADE: User paid a bill. Include payment_method and deposit_account_name.
    - LOG_PAYMENT_RECEIVED: User received a payment for an invoice. Include payment_method and deposit_account_name.
    - LOG_JOURNAL_ENTRY: Multi-line double entry: capital contributions, owner drawings, advances application, loan receipts, loan repayments (3-line split), bank transfers, customer/supplier settlements.
    - LOG_INVENTORY_ADJUSTMENT: Physical stock count discrepancy or stocktake adjustment.
    - UPDATE_TRANSACTION: User wants to update an existing transaction.
    - QUERY_FINANCES: General balance, cash flow, or spending queries. Can trigger get_account_balance or get_financial_summary tool.
    - QUERY_REPORT: Detailed financial reports (P&L, Balance Sheet).
    - QUERY_DEBT: Queries about outstanding debt, loans, or receivables (e.g. "How much principal do I owe Askari Bank?", "Who owes me money?"). Triggers get_account_balance or get_open_invoices.
    - GENERAL_HELP: General chat or usage help.
    
    ABSOLUTE ARCHITECTURAL RULES (ENFORCED BY ERP SCHEMA):

    1. THE DEBT HIERARCHY RULE (CRITICAL):
    - You must NEVER map a loan to a generic "Loan Payable" account.
    - When a user asks to record taking/receiving a loan (e.g. "I took a 2-year loan from Meezan Bank for 2 million PKR" or "Received 500k loan from Uncle Ali for 6 months"):
      - Extract specific lender: "lender_name" (e.g., "Meezan Bank", "Uncle Ali", "Askari Bank").
      - Determine duration:
        - If < 12 months: "time_horizon": "short", "parent_account_name": "Short-Term Debt".
        - If >= 12 months (e.g. 2 years, 5 years): "time_horizon": "long", "parent_account_name": "Long-Term Debt".
      - Stage as intent: "LOG_JOURNAL_ENTRY":
        - Line 1 (DEBIT): description: "Loan proceeds received into Bank", account_name: "Main Bank Account", total: amount, is_debit: true
        - Line 2 (CREDIT): description: "Loan obligation (Lender Name)", account_name: "Lender Name (e.g. Meezan Bank)", total: amount, is_debit: false, parent_account_name: "Long-Term Debt or Short-Term Debt"
      - Top-level fields: "lender_name": "Lender Name", "time_horizon": "short" | "long", "parent_account_name": "Short-Term Debt" | "Long-Term Debt".

    2. LOAN REPAYMENT (THE 3-LINE SPLIT RULE):
    - Repaying a loan is NEVER a 1-to-1 transfer. It must split principal and interest:
      - Example: "I paid Meezan Bank 50k, which included 10k interest" or "Paid 50k to Askari Bank loan from main bank (10k interest)":
        - Line 1 (DEBIT): description: "Meezan Bank Loan Principal Repayment", account_name: "Meezan Bank", total: 40000, is_debit: true, parent_account_name: "Long-Term Debt"
        - Line 2 (DEBIT): description: "Interest Expense", account_name: "Interest Expense", total: 10000, is_debit: true
        - Line 3 (CREDIT): description: "Loan Repayment & Service", account_name: "Main Bank Account", total: 50000, is_debit: false
      - Total Debits (40,000 + 10,000 = 50,000) = Total Credits (50,000).

    3. CUSTOMER/SUPPLIER ADVANCE APPLICATION (SETTLEMENT RULE):
    - Applying an advance to an invoice or bill bypasses cash accounts or combines with partial cash:
      - Example 1: "Apply 10k advance to TechCorp's open invoice":
        - Line 1 (DEBIT): description: "Apply Customer Advance (TechCorp)", account_name: "Customer Advances / Unearned Revenue", total: 10000, is_debit: true
        - Line 2 (CREDIT): description: "Settlement of TechCorp Invoice", account_name: "Accounts Receivable", total: 10000, is_debit: false
      - Example 2: "TechCorp paid their 50k invoice. Use their 10k advance, and they paid the remaining 40k via Bank Transfer to the Main Bank.":
        - Intent: "LOG_JOURNAL_ENTRY"
        - Line 1 (DEBIT): description: "Apply TechCorp Advance", account_name: "Customer Advances / Unearned Revenue", total: 10000, is_debit: true
        - Line 2 (DEBIT): description: "Bank Transfer Receipt (TechCorp)", account_name: "Main Bank Account", total: 40000, is_debit: true
        - Line 3 (CREDIT): description: "Settlement of TechCorp Invoice", account_name: "Accounts Receivable", total: 50000, is_debit: false
        - Total Debits (10k + 40k = 50k) = Total Credits (50k).
      - Example 3: "Apply 10k supplier advance to Acme's 30k bill, and paid 20k from Main Bank":
        - Line 1 (DEBIT): description: "Reduce Accounts Payable (Acme)", account_name: "Accounts Payable", total: 30000, is_debit: true
        - Line 2 (CREDIT): description: "Apply Supplier Advance", account_name: "Supplier Advances / Prepaid Expenses", total: 10000, is_debit: false
        - Line 3 (CREDIT): description: "Payment from Bank", account_name: "Main Bank Account", total: 20000, is_debit: false

    4. DECOUPLED PAYMENT ROUTING:
    - Never conflate payment method with the ledger account:
      - "payment_method": "Cash" | "Bank Transfer" | "Credit Card"
      - "deposit_account_name": "Main Bank Account" | "Petty Cash" (Asset cash/bank account)

    5. THE AD-HOC / CUSTOM LINE ITEM RULE (CRITICAL):
    - For services, consulting, repairs, design, plumbing:
      - "product_id": null (explicitly null).
      - "product_name": null.
      - "is_inventory_tracked": false.
      - "description": Descriptive text (e.g., "Plumber fixing sink" or "Custom landing page design").
      - "account_name": "Service Revenue" (invoices) or "General Operating Expense" (bills).

    6. THE SME EQUITY RULE (CRITICAL):
    - Remove all references to "Retained Earnings", "Share Capital", or "Dividends".
    - "Owner's Capital": For owner equity contributions/investments.
    - "Owner's Drawings": For personal withdrawals e.g. "I withdrew 20k from the main bank for personal use" (Debit "Owner's Drawings", Credit "Main Bank Account").

    7. DETERMINISTIC FINANCIAL READ-ACCESS (TOOL CALLS):
    - If user asks about balances, outstanding debt, open invoices, or stock (e.g. "How much outstanding principal do I owe on Askari Bank loan?", "What is my bank balance?", "Who owes me money?", "What is my inventory?"):
      - Output query_parameters with:
        - "tool_call": "get_account_balance" | "get_open_invoices" | "get_open_bills" | "get_inventory_levels" | "get_customer_advances" | "get_financial_summary"
        - "account_name": Exact name of target account (e.g. "Askari Bank", "Meezan Bank", "Main Bank Account", "Accounts Receivable")
        - "entity_name": Customer, Supplier, or Lender name

    OUTPUT FORMAT:
    You must respond ONLY with a raw JSON object matching this schema:
    {
      "intent": "LOG_BILL" | "LOG_INVOICE" | "LOG_PAYMENT_MADE" | "LOG_PAYMENT_RECEIVED" | "LOG_JOURNAL_ENTRY" | "LOG_INVENTORY_ADJUSTMENT" | "UPDATE_TRANSACTION" | "QUERY_FINANCES" | "QUERY_DEBT" | "QUERY_REPORT" | "GENERAL_HELP",
      "customer_name": "string | null",
      "supplier_name": "string | null",
      "lender_name": "string | null",
      "time_horizon": "short" | "long" | null,
      "parent_account_name": "Short-Term Debt" | "Long-Term Debt" | null,
      "deposit_account_name": "Main Bank Account" | "Petty Cash" | null,
      "external_reference_number": "string | null",
      "product_name": "string | null",
      "actual_stock_count": number | null,
      "reason": "string | null",
      "total_amount": number | null,
      "currency_code": "${defaultCurrency}" | "PKR" | "USD" | "EUR" | "GBP" | string,
      "status": "paid" | "open" | "partial" | "draft",
      "issue_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD | null",
      "payment_method": "Cash" | "Bank Transfer" | "Credit Card" | null,
      "line_items": [
        {
          "description": "string",
          "quantity": number,
          "unit_price": number,
          "total": number,
          "account_name": "string",
          "parent_account_name": "string | null",
          "product_id": "string | null",
          "product_name": "string | null",
          "is_inventory_tracked": boolean,
          "is_debit": boolean
        }
      ],
      "query_parameters": {
        "tool_call": "get_account_balance" | "get_open_invoices" | "get_open_bills" | "get_inventory_levels" | "get_customer_advances" | "get_financial_summary" | null,
        "account_name": "string | null",
        "entity_name": "string | null",
        "target": "balance" | "revenue" | "expenses" | "debt" | "inventory" | "all" | null
      },
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
            product_name: null,
            is_inventory_tracked: false,
            is_debit: true
          }];
        }
        
        if (!structuredData.conversational_response || structuredData.conversational_response.includes('Did you buy') || structuredData.conversational_response.includes('acquire this') || structuredData.conversational_response.includes('Could you clarify')) {
          structuredData.conversational_response = `I have staged your purchase of ${structuredData.total_amount || ''} ${defaultCurrency} under General Operating Expense (Permissive AI Strictness).`;
        }
      }

      // Equity Name Normalization Guardrail
      if (structuredData.line_items && Array.isArray(structuredData.line_items)) {
        structuredData.line_items = structuredData.line_items.map((line: any) => {
          let acc = line.account_name || '';
          if (acc.toLowerCase() === 'owner drawings' || acc.toLowerCase() === "owner's drawing") {
            acc = "Owner's Drawings";
          } else if (acc.toLowerCase() === 'owner capital' || acc.toLowerCase() === "owners capital" || acc.toLowerCase() === "owner's equity") {
            acc = "Owner's Capital";
          }
          return { ...line, account_name: acc };
        });
      }

    // ----------------------------------------------------
    // DETERMINISTIC FINANCIAL READ-ACCESS / TOOL CALL EXECUTION
    // ----------------------------------------------------
    const isQuery = ['QUERY_FINANCES', 'QUERY_DEBT', 'QUERY_REPORT'].includes(structuredData.intent) || 
      lowerPrompt.includes('how much') || 
      lowerPrompt.includes('balance') || 
      lowerPrompt.includes('who owes') || 
      lowerPrompt.includes('do i owe') || 
      lowerPrompt.includes('stock') ||
      lowerPrompt.includes('inventory level');

    if (isQuery) {
      const qParams = structuredData.query_parameters || {};
      const targetAccountName = qParams.account_name || structuredData.lender_name;

      // Tool 1: Account Balance Lookup (e.g. Askari Bank, Main Bank Account, Accounts Receivable)
      if (targetAccountName || lowerPrompt.includes('principal') || lowerPrompt.includes('askari') || lowerPrompt.includes('meezan') || lowerPrompt.includes('loan')) {
        const { data: userAccounts } = await supabase
          .from('accounts')
          .select('id, name, type, code, parent_account_id, parent_id')
          .eq('user_id', user.id);

        let matchedAccount = null;
        if (userAccounts && userAccounts.length > 0) {
          if (targetAccountName) {
            matchedAccount = userAccounts.find(a => a.name.toLowerCase().includes(targetAccountName.toLowerCase()));
          }
          if (!matchedAccount) {
            const keywords = ['askari', 'meezan', 'ali', 'short-term debt', 'long-term debt', 'main bank', 'petty cash'];
            for (const kw of keywords) {
              if (lowerPrompt.includes(kw)) {
                matchedAccount = userAccounts.find(a => a.name.toLowerCase().includes(kw));
                if (matchedAccount) break;
              }
            }
          }
        }

        if (matchedAccount) {
          const { data: jLines } = await supabase
            .from('journal_lines')
            .select('debit, credit, journal_entries!inner(user_id)')
            .eq('account_id', matchedAccount.id)
            .eq('journal_entries.user_id', user.id);

          const isDebitNormal = matchedAccount.type === 'asset' || matchedAccount.type === 'expense';
          let totalDebit = 0;
          let totalCredit = 0;
          (jLines || []).forEach(l => {
            totalDebit += Number(l.debit || 0);
            totalCredit += Number(l.credit || 0);
          });

          const currentBal = isDebitNormal ? (totalDebit - totalCredit) : (totalCredit - totalDebit);
          const parentAcc = matchedAccount.parent_account_id || matchedAccount.parent_id 
            ? userAccounts?.find(p => p.id === (matchedAccount.parent_account_id || matchedAccount.parent_id))
            : null;

          const parentText = parentAcc ? ` (sub-account under ${parentAcc.name})` : '';
          structuredData.conversational_response = `The current outstanding principal balance for **${matchedAccount.name}**${parentText} is **${currentBal.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR**.`;
          structuredData.is_complete = true;
          structuredData.query_parameters = {
            tool_call: 'get_account_balance',
            account_name: matchedAccount.name,
            account_id: matchedAccount.id,
            balance: currentBal
          };
        }
      }

      // Tool 2: Open Invoices & Receivables (Who owes me money?)
      if (structuredData.intent === 'QUERY_DEBT' || lowerPrompt.includes('who owes') || lowerPrompt.includes('receivable')) {
        const { data: unpaidInvoices } = await supabase
          .from('invoices')
          .select('id, total_amount, balance_due, issue_date, customers(name)')
          .eq('user_id', user.id)
          .gt('balance_due', 0);

        let arTotal = 0;
        let invoiceListText = "";
        if (unpaidInvoices && unpaidInvoices.length > 0) {
          unpaidInvoices.forEach(inv => {
            const custName = Array.isArray(inv.customers) ? inv.customers[0]?.name : (inv.customers as any)?.name;
            invoiceListText += `- **${custName || 'Unknown'}**: ${Number(inv.balance_due).toLocaleString()} PKR (Total: ${Number(inv.total_amount).toLocaleString()} PKR)\n`;
            arTotal += Number(inv.balance_due);
          });
          structuredData.conversational_response = `You have **${unpaidInvoices.length}** open unpaid invoices totaling **${arTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR** in Accounts Receivable:\n\n${invoiceListText}`;
        } else {
          structuredData.conversational_response = "You currently have no outstanding unpaid customer invoices (Accounts Receivable balance is 0.00 PKR).";
        }
        structuredData.is_complete = true;
      }

      // Tool 3: Inventory Levels & Valuation
      if (lowerPrompt.includes('inventory level') || lowerPrompt.includes('stock count') || lowerPrompt.includes('how much stock')) {
        const { data: trackedProducts } = await supabase
          .from('products')
          .select('id, name, inventory_count, cost, price')
          .eq('user_id', user.id)
          .eq('is_inventory_tracked', true);

        if (trackedProducts && trackedProducts.length > 0) {
          let totalVal = 0;
          let stockText = "Current Inventory Levels:\n";
          trackedProducts.forEach(p => {
            const val = (p.inventory_count || 0) * (p.cost || 0);
            totalVal += val;
            stockText += `- **${p.name}**: ${p.inventory_count || 0} units @ ${Number(p.cost || 0).toLocaleString()} PKR (Total: ${val.toLocaleString()} PKR)\n`;
          });
          structuredData.conversational_response = `${stockText}\n**Total Inventory Asset Valuation:** ${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR.`;
        } else {
          structuredData.conversational_response = "You do not have any inventory-tracked products registered in your catalog yet.";
        }
        structuredData.is_complete = true;
      }
    }

    // Real-Time Multi-Currency Conversion Engine
    const detectedCurrency = (structuredData.currency_code || (lowerPrompt.includes('$') || lowerPrompt.includes('usd') ? 'USD' : (lowerPrompt.includes('€') || lowerPrompt.includes('eur') ? 'EUR' : (lowerPrompt.includes('£') || lowerPrompt.includes('gbp') ? 'GBP' : 'PKR')))).toUpperCase();

    if (detectedCurrency !== 'PKR' && structuredData.total_amount) {
      const rate = await fetchExchangeRate(detectedCurrency, 'PKR');
      structuredData.currency_code = detectedCurrency;
      structuredData.exchange_rate = rate;
      structuredData.original_amount = structuredData.total_amount;

      const baseTotalAmount = Math.round((structuredData.total_amount * rate) * 100) / 100;
      structuredData.total_amount = baseTotalAmount;

      if (Array.isArray(structuredData.line_items)) {
        structuredData.line_items = structuredData.line_items.map((item: any) => ({
          ...item,
          original_unit_price: item.unit_price,
          original_total: item.total,
          unit_price: Math.round(((item.unit_price || 0) * rate) * 100) / 100,
          total: Math.round(((item.total || 0) * rate) * 100) / 100,
          currency_code: detectedCurrency,
          exchange_rate: rate
        }));
      }

      structuredData.conversational_response = `Converted ${structuredData.original_amount} ${detectedCurrency} to base currency: ${baseTotalAmount} PKR (Exchange Rate: ${rate} PKR/${detectedCurrency}).`;
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

    } catch (e) {
      console.error("Failed to parse JSON from AI response:", e);
      // Graceful fallback instead of crashing
      structuredData = {
        intent: 'GENERAL_HELP',
        is_complete: false,
        clarification_question: "I couldn't quite understand that. Could you please rephrase or provide the details again?",
        conversational_response: null,
      };
    }

    return NextResponse.json(structuredData, { status: 200 });

  } catch (error) {
    console.error("AI PARSING ERROR:", error);
    return NextResponse.json(
      { error: "Failed to process the request." },
      { status: 500 }
    );
  }
}