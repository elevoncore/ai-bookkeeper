console.log("Keys in process.env:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("DATABASE") || k.includes("POSTGRES")));
