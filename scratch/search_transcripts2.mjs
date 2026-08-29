import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\kashan\\.gemini\\antigravity\\brain';

async function search() {
  if (!fs.existsSync(brainDir)) return;
  const items = fs.readdirSync(brainDir);
  for (const item of items) {
    const fullPath = path.join(brainDir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      const logsDir = path.join(fullPath, '.system_generated', 'logs');
      const transcriptFile = path.join(logsDir, 'transcript_full.jsonl');
      if (fs.existsSync(transcriptFile)) {
        const content = fs.readFileSync(transcriptFile, 'utf-8');
        const regex = /Password is: (\S+)/i;
        const match = content.match(regex);
        if (match) {
          console.log(`FOUND in ${item}: ${match[0]}`);
        }
      }
      const transcriptFile2 = path.join(logsDir, 'transcript.jsonl');
      if (fs.existsSync(transcriptFile2)) {
        const content = fs.readFileSync(transcriptFile2, 'utf-8');
        const regex = /Password is: (\S+)/i;
        const match = content.match(regex);
        if (match) {
          console.log(`FOUND in transcript ${item}: ${match[0]}`);
        }
      }
    }
  }
}
search();
