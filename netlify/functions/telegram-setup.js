const https = require('https');

function telegramRequest(method, token, params) {
  return new Promise(function(resolve, reject) {
    var query = Object.keys(params || {}).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var options = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method + (query ? '?' + query : ''),
      method: 'GET'
    };
    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var result = JSON.parse(Buffer.concat(chunks).toString());
        resolve(result);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not configured' })
    };
  }

  try {
    // Get bot info
    var me = await telegramRequest('getMe', token, {});
    var botName = me.ok ? me.result.first_name + ' (@' + me.result.username + ')' : 'Unknown';

    // Get recent updates to find chat IDs
    var updates = await telegramRequest('getUpdates', token, { limit: 50 });

    var chats = [];
    var seen = {};

    if (updates.ok && updates.result) {
      updates.result.forEach(function(u) {
        var msg = u.message || u.channel_post || u.my_chat_member && u.my_chat_member.chat;
        var chat = msg ? (msg.chat || msg) : null;
        if (chat && chat.id && !seen[chat.id]) {
          seen[chat.id] = true;
          chats.push({
            id: chat.id,
            title: chat.title || chat.first_name || 'Private Chat',
            type: chat.type || 'unknown'
          });
        }
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        bot: botName,
        chats: chats,
        hint: chats.length === 0
          ? 'No chats found. Send a message to the bot or add it to a group, then try again.'
          : 'Found ' + chats.length + ' chat(s). Use the chat ID in your reminder settings.'
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get chat info: ' + err.message })
    };
  }
};
