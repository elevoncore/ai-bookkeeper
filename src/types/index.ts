export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type InvoiceStatus = 'draft' | 'open' | 'partial' | 'paid';
export type PaymentMethod = string;

export type Profile = {
 id: string;
 email: string;
 business_name?: string;
 base_currency?: string;
 created_at: string;
};

export type Account = {
 id: string;
 user_id: string;
 name: string;
 type: AccountType;
 is_system: boolean;
 created_at: string;
};

export type Customer = {
 id: string;
 user_id: string;
 name: string;
 email?: string;
 phone?: string;
 created_at: string;
};

export type Supplier = {
 id: string;
 user_id: string;
 name: string;
 email?: string;
 phone?: string;
 created_at: string;
};

export type Product = {
 id: string;
 user_id: string;
 name: string;
 price: number;
 description?: string;
 created_at: string;
};

export type Invoice = {
 id: string;
 user_id: string;
 customer_id: string;
 issue_date: string;
 due_date?: string | null;
 status: InvoiceStatus;
 total_amount: number;
 balance_due: number;
 is_ai_verified: boolean;
 created_at: string;
 // Joins
 customers?: Customer;
};

export type InvoiceLine = {
 id: string;
 invoice_id: string;
 product_id: string;
 quantity: number;
 unit_price: number;
 total: number;
 // Joins
 products?: Product;
};

export type Bill = {
 id: string;
 user_id: string;
 supplier_id: string;
 issue_date: string;
 due_date?: string | null;
 status: InvoiceStatus;
 total_amount: number;
 balance_due: number;
 is_ai_verified: boolean;
 created_at: string;
 // Joins
 suppliers?: Supplier;
};

export type BillLine = {
 id: string;
 bill_id: string;
 account_id: string;
 description?: string;
 amount: number;
 // Joins
 accounts?: Account;
};

export type PaymentReceived = {
 id: string;
 user_id: string;
 invoice_id: string;
 customer_id: string;
 amount: number;
 date: string;
 payment_method?: string;
 created_at: string;
 // Joins
 invoices?: Invoice;
 customers?: Customer;
};

export type PaymentMade = {
 id: string;
 user_id: string;
 bill_id: string;
 supplier_id: string;
 amount: number;
 date: string;
 payment_method?: string;
 created_at: string;
 // Joins
 bills?: Bill;
 suppliers?: Supplier;
};

export type JournalEntry = {
 id: string;
 user_id: string;
 date: string;
 description?: string;
 reference_type?: string;
 reference_id?: string;
 created_at: string;
};

export type JournalLine = {
 id: string;
 journal_entry_id: string;
 account_id: string;
 debit: number;
 credit: number;
 created_at: string;
 // Joins
 accounts?: Account;
};