import fs from 'fs';
import path from 'path';

const projectPath = 'd:\\build\\ai-bookkeeper';
const filePath = path.join(projectPath, 'src', 'components', 'dashboard', 'SalesHub.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
const line = lines[769];
console.log("Line content:", JSON.stringify(line));
console.log("Characters:");
for (let i = 0; i < line.length; i++) {
  console.log(`char[${i}]: ${line.charCodeAt(i)} (${line[i]})`);
}
