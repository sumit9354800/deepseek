// Simple script to verify DeepSeek API key and endpoint connectivity
// Usage: node scripts/test_deepseek.js

try { require('dotenv').config(); } catch (e) {}
const fetch = global.fetch || require('node-fetch');

async function main(){
  const key = process.env.DEEPSEEK_API_KEY;
  if(!key){
    console.error('DEEPSEEK_API_KEY not found in environment. Set it in .env or export it.');
    process.exit(1);
  }

  const url = 'https://api.deepseek.com/v1/chat/completions';
  const body = {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'Ping from local test' }],
    store: false
  };

  try{
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

    console.log('Status:', res.status);
    const data = await res.text();
    try{
      console.log('Response:', JSON.parse(data));
    }catch{
      console.log('Response text:', data);
    }
  }catch(err){
    console.error('Request failed:', err);
  }
}

main();
