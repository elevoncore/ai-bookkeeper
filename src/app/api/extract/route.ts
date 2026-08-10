import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function fetchExchangeRate(fromCurrency: string, toCurrency: string = "PKR"): Promise<number> {
  const cleanFrom = (fromCurrency || "PKR").toUpperCase().trim();
  const cleanTo = (toCurrency || "PKR").toUpperCase().trim();

  if (cleanFrom === cleanTo) return 1.0;

  // Fallback static rates table for SME base PKR resilience
  const fallbackRates: Record<string, number> = {
    USD: 278.50,
    EUR: 302.10,
    GBP: 355.20,
    AED: 75.80,
    SAR: 74.20,
    CAD: 204.30,
    AUD: 182.40,
    PKR: 1.0
  };

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${cleanFrom}`, {
      next: { revalidate: 3600 }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates[cleanTo] === "number") {
        return data.rates[cleanTo];
      }
    }
  } catch (err) {
    console.warn(`[Multi-Currency Engine] API fetch failed for ${cleanFrom}->${cleanTo}, using fallback rate.`, err);
  }

  return fallbackRates[cleanFrom] || 1.0;
}

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

    const model = getGeminiModel();

    const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper.
    
    You must classify the user's intent and extract structured financial data for double-entry bookkeeping.
    
    INTENTS:
    - LOG_BILL: User received a bill, or incurred a direct expense (e.g. utilities, rent) from a Vendor/Payee. Do not force product names for generic expenses; treat the vendor as the payee.
    - LOG_INVOICE: User sent an invoice, or received alternative income from a Customer/Client.
    - LOG_PAYMENT_MADE: User paid a bill.
    - LOG_PAYMENT_RECEIVED: User received a payment from a customer.
    - UPDATE_TRANSACTION: User wants to update or modify an existing transaction.
    - QUERY_FINANCES: General cash flow or spending queries.
    - QUERY_REPORT: Detailed financial reporting queries like "How much profit did I make this month?" or "Show me my P&L".
    - QUERY_DEBT: Queries about who owes money or who the user owes.
    - GENERAL_HELP: General chat or usage help.
    
    RULES FOR EXTRACTION:
    1. Multi-Line Item Extraction: A single receipt/invoice can contain multiple items. You MUST return an array of line items in "line_items". For each item, extract its "description", "quantity", "unit_price", and "total". Never summarize them into a single line.
    2. Missing Data: For LOG_BILL and LOG_INVOICE, if critical fields (total_amount, line_items, customer/supplier name) are missing, DO NOT guess them. For Payments, line_items are NOT required, only amount and name. If data is missing, set "is_complete": false and ask a conversational "clarification_question".
    3. Entity Resolution: Extract the exact legal name of the vendor or client into 'supplier_name' (for bills/payments made) or 'customer_name' (for invoices/payments received), separating it from the line items.
    4. Chart of Accounts Grounding: You MUST categorize each line item using ONLY the exact account names provided: [${accountNames}]. You must place the exact account name in the "account_name" field of each line item. Do not hallucinate non-existent accounting categories. If none fit perfectly, pick the closest match.
    5. Product Name, Quantities & Purchase Unit Costs (CRITICAL): You must separate the quantity and unit of measurement from the product name. If the user says "50 kg banana for 4,567 PKR", the product_name is "Banana", the quantity is 50, total is 4567, and unit_price is 91.34 (4567 / 50). Do NOT include units ('kg', 'lbs', 'boxes', 'pcs', etc.) in the product name. For LOG_BILL and LOG_INVOICE of physical inventory items, you MUST ALWAYS extract a numeric quantity so the database can calculate unit cost = amount / quantity to update product inventory and unit cost.
    6. Smart Inventory Tracking: Determine if an item is physical inventory. If the item has physical units (kg, boxes, pcs) or is a quantifiable tangible good (e.g. "Banana"), set "is_inventory_tracked" to true. If it is a service (e.g. "Web Design", "Hosting", "Consulting") or generic expense, set it to false.
    7. Dates: Today's date is ${today}. If the user says "yesterday" or "today" or a day of the week, calculate the exact YYYY-MM-DD based on today. The "issue_date" and "due_date" MUST be in strict YYYY-MM-DD format. If no issue_date is given, default to ${today}.
    8. Currency Code: Extract the 3-letter currency code (e.g. 'USD', 'EUR', 'GBP', 'PKR') from symbols ($ = USD, € = EUR, £ = GBP, Rs / PKR = PKR) or context. Default to 'PKR' if unspecified.
    9. Conversational Queries: If intent is QUERY_FINANCES, you must provide query_parameters to specify what you need (revenue, expenses, all). If intent is UPDATE_TRANSACTION, you must extract the transaction_id from the history and provide update_parameters.
    10. Chat History & Privacy: You MUST know that ALL chat history and financial logs ARE securely stored in the system database. Users can view their entire history at any time by clicking the "Chat History" button in the UI. If a user asks about chat history, memory, or persistence, you must explicitly confirm that their history is safely stored and accessible to them.
    
    OUTPUT FORMAT:
    You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting, backticks, or any conversational text outside the JSON:
    {
      "intent": "LOG_BILL" | "LOG_INVOICE" | "LOG_PAYMENT_MADE" | "LOG_PAYMENT_RECEIVED" | "UPDATE_TRANSACTION" | "QUERY_FINANCES" | "QUERY_DEBT" | "QUERY_REPORT" | "GENERAL_HELP",
      "customer_name": "string | null",
      "supplier_name": "string | null",
      "total_amount": number | null,
      "currency_code": "PKR" | "USD" | "EUR" | "GBP" | string,
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
          "product_name": "string | null",
          "is_inventory_tracked": boolean
        }
      ],
      "is_complete": boolean,
      "clarification_question": "string | null",
      "conversational_response": "string | null"
    }`;

    // 3. Construct multi-turn contents
    const contents: any[] = [];

    // Map passed history to Gemini format
    for (const msg of history) {
      if (msg.sender === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.text }] });
      } else if (msg.sender === 'ai') {
        // Only push text AI responses to context
        if (msg.text) {
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
      
      if (['LOG_BILL', 'LOG_INVOICE'].includes(structuredData.intent)) {
        if (
          !structuredData.total_amount || 
          !structuredData.line_items || 
          !Array.isArray(structuredData.line_items) || 
          structuredData.line_items.length === 0
        ) {
          structuredData.is_complete = false;
          structuredData.clarification_question = structuredData.clarification_question || "I couldn't detect the total amount or the individual items. Could you provide those details?";
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