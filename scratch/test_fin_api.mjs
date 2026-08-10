async function run() {
  try {
    const res = await fetch('http://localhost:3001/api/reports/financials');
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch(e) { console.error(e); }
}
run();
