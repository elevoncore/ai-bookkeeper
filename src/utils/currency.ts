export function parseToCents(amount: string | number): number {
 if (typeof amount === 'number') {
 amount = amount.toString();
 }
 const clean = amount.replace(/[^\d.-]/g, '');
 const [dollars, cents = '00'] = clean.split('.');
 const paddedCents = (cents + '00').slice(0, 2);
 const totalCents = parseInt(dollars || '0', 10) * 100 + parseInt(paddedCents, 10);
 return amount.startsWith('-') && totalCents > 0 ? -totalCents : totalCents;
}

export function formatFromCents(cents: number): string {
 return (cents / 100).toFixed(2);
}

export function sumCents(amounts: number[]): number {
 return amounts.reduce((acc, curr) => acc + curr, 0);
}

export async function fetchExchangeRate(fromCurrency: string, toCurrency: string = 'PKR'): Promise<number> {
 const cleanFrom = (fromCurrency || 'PKR').toUpperCase().trim();
 const cleanTo = (toCurrency || 'PKR').toUpperCase().trim();

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
 if (data && data.rates && typeof data.rates[cleanTo] === 'number') {
 return data.rates[cleanTo];
 }
 }
 } catch (err) {
 console.warn(`[Multi-Currency Engine] API fetch failed for ${cleanFrom}->${cleanTo}, using fallback rate.`, err);
 }

 return fallbackRates[cleanFrom] || 1.0;
}
