import fs from 'fs';
import path from 'path';

const currentConversationId = 'ede55fa8-b3f7-499b-9dc3-99f313701525';
const logsDir = path.join('C:\\Users\\kashan\\.gemini\\antigravity\\brain', currentConversationId, '.system_generated', 'logs');
const transcriptFile = path.join(logsDir, 'transcript_full.jsonl');

if (fs.existsSync(transcriptFile)) {
  const content = fs.readFileSync(transcriptFile, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.includes('postgres://postgres') && !line.includes('${pwd}') && !line.includes('Password123!')) {
      console.log("FOUND CONN:", line);
    }
    if (line.includes('SUCCESS') && !line.includes('${pwd}')) {
      console.log("FOUND SUCCESS:", line);
    }
  }
} else {
  console.log("Transcript not found at", transcriptFile);
}
