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
} as const;

export const getGeminiModel = () => {
  return genAI.getGenerativeModel({
    model: "gemini-3.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema as any,
      temperature: 0.1,
    },
  });
};