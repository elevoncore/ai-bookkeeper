import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const geminiKey = envContent.match(/GEMINI_API_KEY=(.+)/)[1].trim();
const genAI = new GoogleGenerativeAI(geminiKey);

async function run() {
  const { expenseSchema } = await import('file://' + path.join(projectPath, 'src/lib/gemini.ts').replace(/\\/g, '/'));

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: expenseSchema,
      temperature: 0.1,
    },
  });
  
  const systemInstruction = `
    You are an AI Bookkeeper...
    INTENTS:
    - LOG_BILL: User bought something
    - LOG_INVOICE: User sold something
    - QUERY_FINANCES: General cash flow
    - QUERY_REPORT: Detailed financial reporting queries like "How much profit did I make this month?" or "Show me my P&L".
  `;
  
  const result = await model.generateContent([
    { text: systemInstruction },
    { text: 'How much profit did I make this month?' }
  ]);
  
  console.log(result.response.text());
}
run();
