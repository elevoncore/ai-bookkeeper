import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const projectPath = 'd:\\build\\ai-bookkeeper';
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const apiKey = envContent.match(/GEMINI_API_KEY=(.+)/)[1].trim();

const genAI = new GoogleGenerativeAI(apiKey);

async function testWithRetry() {
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt} calling gemini-3.6-flash...`);
      const res = await model.generateContent("Respond with JSON: {\"status\": \"active\"}");
      console.log("🎉 SUCCESS!", res.response.text());
      return;
    } catch (e) {
      console.log(` Attempt ${attempt} failed:`, e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

testWithRetry().catch(console.error);
