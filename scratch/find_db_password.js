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
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('"CommandLine":') && line.includes('node') && line.includes('scratch/')) {
            console.log(`FOUND COMMAND IN ${item}: ${line}`);
          }
        }
      }
    }
  }
}
search();
