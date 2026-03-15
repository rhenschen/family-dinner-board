const https = require('https');

function sendTelegram(token, chatId, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ chatId, ok: parsed.ok, description: parsed.description });
        } catch {
          resolve({ chatId, ok: false, description: 'Invalid response' });
        }
      });
    });
    req.on('error', (e) => resolve({ chatId, ok: false, description: e.message }));
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Telegram bot not configured — please set TELEGRAM_BOT_TOKEN in site settings and redeploy' }),
    };
  }

  try {
    const { chatIds, message } = JSON.parse(event.body);
    if (!chatIds || !chatIds.length || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'chatIds array and message are required' }),
      };
    }

    const results = await Promise.all(
      chatIds.map((id) => sendTelegram(token, id, message))
    );

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent, total: chatIds.length, failed }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: e.message }),
    };
  }
};
