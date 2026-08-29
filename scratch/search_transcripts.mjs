import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\kashan\\.gemini\\antigravity\\brain';

async function search() {
  console.log("=== SEARCHING TRANSCRIPTS ===");
  if (!fs.existsSync(brainDir)) {
    console.error("Brain dir doesn't exist");
    return;
  }

  const items = fs.readdirSync(brainDir);
  for (const item of items) {
    const fullPath = path.join(brainDir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      const logsDir = path.join(fullPath, '.system_generated', 'logs');
      const transcriptFile = path.join(logsDir, 'transcript.jsonl');
      if (fs.existsSync(transcriptFile)) {
        const content = fs.readFileSync(transcriptFile, 'utf-8');
        if (content.toLowerCase().includes('connected successfully') || content.toLowerCase().includes('sql executed successfully') || content.toLowerCase().includes('migration applied successfully')) {
          console.log(`Match found in transcript: ${transcriptFile}`);
          // Let's print the matching lines
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.toLowerCase().includes('connected') || line.toLowerCase().includes('success') || line.toLowerCase().includes('password') || line.toLowerCase().includes('postgres:')) {
              console.log("  >", line.substring(0, 300));
            }
          }
        }
      }
    }
  }
  console.log("=== SEARCH COMPLETE ===");
}

search();
