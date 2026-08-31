const fs = require('fs');
const path = require('path');

// 1. ChartOfAccountsManager.tsx
const coaPath = 'd:/build/ai-bookkeeper/src/components/dashboard/ChartOfAccountsManager.tsx';
let coaContent = fs.readFileSync(coaPath, 'utf8');

coaContent = coaContent.replaceAll(
  "{l.journal_entries?.description || 'Journal Entry'}",
  "{l.description || l.journal_entries?.description || 'Journal Entry'}"
);
fs.writeFileSync(coaPath, coaContent, 'utf8');
console.log("Updated ChartOfAccountsManager.tsx");

// 2. debt/page.tsx
const debtPath = 'd:/build/ai-bookkeeper/src/app/dashboard/debt/page.tsx';
let debtContent = fs.readFileSync(debtPath, 'utf8');

debtContent = debtContent.replaceAll(
  "{l.journal_entries?.description || 'Journal Entry'}",
  "{l.description || l.journal_entries?.description || 'Journal Entry'}"
);
fs.writeFileSync(debtPath, debtContent, 'utf8');
console.log("Updated debt/page.tsx");

// 3. ReportsHub.tsx
const reportsPath = 'd:/build/ai-bookkeeper/src/components/dashboard/ReportsHub.tsx';
let reportsContent = fs.readFileSync(reportsPath, 'utf8');

reportsContent = reportsContent.replaceAll(
  "{entry.journal_entries?.description || 'Cash Transaction'}",
  "{entry.description || entry.journal_entries?.description || 'Cash Transaction'}"
);
fs.writeFileSync(reportsPath, reportsContent, 'utf8');
console.log("Updated ReportsHub.tsx");
