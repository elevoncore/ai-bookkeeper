import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const expenseSchema = {
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
        }
      },
      nullable: true
    },
    journal_lines: {
      type: SchemaType.ARRAY,
      description: "Array of balanced debit/credit lines",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          account_name: { type: SchemaType.STRING },
          debit: { type: SchemaType.NUMBER },
          credit: { type: SchemaType.NUMBER },
          description: { type: SchemaType.STRING, nullable: true }
        }
      },
      nullable: true
    },
    query_parameters: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        account_name: { type: SchemaType.STRING, description: "Name of the ledger account to query (e.g. Askari Bank, Meezan Bank, Main Bank Account, Accounts Receivable)", nullable: true },
        entity_name: { type: SchemaType.STRING, description: "Name of the customer, supplier, or lender", nullable: true },
        target: { type: SchemaType.STRING, description: "balance | revenue | expenses | debt | inventory | all", nullable: true },
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
} as const;

export const actionItemsSchema = {
  type: SchemaType.ARRAY,
  description: "Array of CFO action items detecting financial anomalies, liquidity risks, aging receivables, or expense spikes.",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      severity: { type: SchemaType.STRING, description: "high | medium | low" },
      headline: { type: SchemaType.STRING, description: "Max 6 words, e.g. 'Severe Aging Receivables Detected'" },
      description: { type: SchemaType.STRING, description: "Concise 1-2 sentence explanation of the financial anomaly" },
      action_label: { type: SchemaType.STRING, description: "Button text, e.g. 'Review Overdue Invoices' or 'Manage Debt'" },
      action_route: { type: SchemaType.STRING, description: "URL path to redirect user, e.g. '/dashboard?tab=invoices' or '/dashboard/debt'" }
    },
    required: ["severity", "headline", "description", "action_label", "action_route"]
  }
} as const;

export const getGeminiModel = () => {
  return genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema as any,
      temperature: 0.1,
    },
  });
};

export const getGeminiCfoModel = (modelName: string = "gemini-3.6-flash") => {
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: `You are a Chief Financial Officer. Do not summarize the numbers. Look for anomalies, liquidity risks, stagnant accounts receivable, or unusual expense spikes. Output strict JSON containing an array of actionable items matching the schema.`,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: actionItemsSchema as any,
      temperature: 0.2,
    },
  });
};