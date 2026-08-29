import fs from 'fs';
import path from 'path';

const transcriptFile = 'C:\\Users\\kashan\\.gemini\\antigravity\\brain\\fb70fcb1-5b01-44f4-8d46-e9c4c3009651\\.system_generated\\logs\\transcript.jsonl';

function read() {
  const content = fs.readFileSync(transcriptFile, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('sql') || line.toLowerCase().includes('database') || line.toLowerCase().includes('migration') || line.toLowerCase().includes('exec_sql')) {
      console.log("LINE:", line.substring(0, 400));
    }
  }
}
read();
