const https = require('https');

function telegramRequest(method, token, body) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var options = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var result = JSON.parse(Buffer.concat(chunks).toString());
        resolve({ status: res.statusCode, body: result });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not configured' })
    };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var chatId = body.chat_id;
  var message = body.message;

  if (!chatId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No chat_id provided. Go to the Telegram Setup tab in Kitchen Management to find your Chat ID.' })
    };
  }

  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No message provided' }) };
  }

  try {
    var result = await telegramRequest('sendMessage', token, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    if (result.body.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message_id: result.body.result.message_id })
      };
    } else {
      var errMsg = result.body.description || 'Unknown Telegram error';
      // Provide helpful messages for common errors
      if (errMsg.includes('chat not found')) {
        errMsg += '. Make sure the bot has been added to the group/chat and has sent or received at least one message there.';
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ error: errMsg })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send message: ' + err.message })
    };
  }
};
