import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const projectPath = 'd:\\build\\ai-bookkeeper';
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const apiKey = envContent.match(/GEMINI_API_KEY=(.+)/)[1].trim();

const genAI = new GoogleGenerativeAI(apiKey);

async function testModels() {
  const candidates = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3.6-flash'
  ];

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const res = await model.generateContent("Hello");
      console.log(`✅ Model '${modelName}' works! Response:`, res.response.text());
      return modelName;
    } catch (e) {
      console.log(` ❌ Model '${modelName}' error:`, e.message);
    }
  }
}

testModels().catch(console.error);
