import { getStore } from '@netlify/blobs'
import https from 'https'

function telegramRequest(method, token, body) {
  return new Promise(function (resolve, reject) {
    var data = JSON.stringify(body)
    var options = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }
    var req = https.request(options, function (res) {
      var chunks = []
      res.on('data', function (c) {
        chunks.push(c)
      })
      res.on('end', function () {
        var result = JSON.parse(Buffer.concat(chunks).toString())
        resolve({ status: res.statusCode, body: result })
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function getTodayISO() {
  // Use Eastern Time (America/New_York) since the family operates in that timezone
  var now = new Date()
  var eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  var y = eastern.getFullYear()
  var m = String(eastern.getMonth() + 1).padStart(2, '0')
  var d = String(eastern.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function formatDate(iso) {
  var d = new Date(iso + 'T12:00:00')
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate()
}

export default async (req) => {
  var token = Netlify.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not configured, skipping reminder')
    return
  }

  var store = getStore({ name: 'dinner-board', consistency: 'strong' })

  // Load all needed data from Netlify Blobs
  var [famData, dayDataAll, dayMenusData, mealsData, tgSettings] = await Promise.all([
    store.get('fam', { type: 'json' }).catch(() => null),
    store.get('dayData', { type: 'json' }).catch(() => null),
    store.get('dayMenus', { type: 'json' }).catch(() => null),
    store.get('meals', { type: 'json' }).catch(() => null),
    store.get('tgSettings', { type: 'json' }).catch(() => null),
  ])

  // Get Telegram chat ID from Blobs
  var chatId = tgSettings && tgSettings.chatId
  if (!chatId) {
    console.log('No Telegram Chat ID configured in server storage, skipping reminder')
    return
  }

  if (!famData || !famData.fam) {
    console.log('No family data found, skipping reminder')
    return
  }
  if (!mealsData || !mealsData.meals) {
    console.log('No meals data found, skipping reminder')
    return
  }

  var fam = famData.fam
  var meals = mealsData.meals
  var dayData = dayDataAll || {}
  var dayMenus = dayMenusData || {}
  var today = getTodayISO()

  // Check if today has data and is an open (cooking) day
  var todayData = dayData[today]
  if (!todayData) {
    console.log('No day data for ' + today + ', skipping reminder')
    return
  }
  if (todayData.open === false) {
    console.log(today + ' is not a cooking day, skipping reminder')
    return
  }

  // Get meals available today
  var todayMenu = dayMenus[today]
  var availableMealIds = todayMenu ? todayMenu.mealIds : meals.map(function (m) { return m.id })
  var todayMeals = meals.filter(function (m) { return availableMealIds.includes(m.id) })

  if (todayMeals.length === 0) {
    console.log('No meals on the menu for ' + today + ', skipping reminder')
    return
  }

  // Get home (available) family members — those NOT in the away list
  var awayIds = todayData.away || []
  var homeFam = fam.filter(function (m) { return !awayIds.includes(m.id) })

  if (homeFam.length === 0) {
    console.log('No family members available for ' + today + ', skipping reminder')
    return
  }

  // Collect all people who have already voted today
  var votes = todayData.votes || {}
  var alreadyVoted = []
  Object.keys(votes).forEach(function (mealId) {
    var voters = (votes[mealId] && votes[mealId].voters) || []
    voters.forEach(function (name) {
      if (!alreadyVoted.includes(name)) alreadyVoted.push(name)
    })
  })

  // Filter to only home members who haven't voted
  var notVoted = homeFam.filter(function (m) { return !alreadyVoted.includes(m.name) })

  if (notVoted.length === 0) {
    console.log('Everyone available has voted for ' + today + ', no reminder needed')
    return
  }

  // Build the reminder message
  var siteUrl = Netlify.env.get('URL') || 'https://family-dinner-board.netlify.app'
  var msg = '🍽 <b>Family Dinner Board Reminder</b>\n\n'
  msg += '<b>' + formatDate(today) + '</b>\n\n'

  msg += "Tonight's options:\n"
  todayMeals.forEach(function (m) {
    var v = (votes[m.id] && votes[m.id].voters) ? votes[m.id].voters.length : 0
    msg += '• ' + m.name + ' (' + v + ' vote' + (v !== 1 ? 's' : '') + ')\n'
  })

  msg += '\n⏳ Still waiting on: ' + notVoted.map(function (m) { return m.name }).join(', ') + '\n'
  msg += '\n<a href="' + siteUrl + '">Vote on the Family Dinner Board</a>'

  // Send the Telegram message
  try {
    var result = await telegramRequest('sendMessage', token, {
      chat_id: chatId,
      text: msg,
      parse_mode: 'HTML',
    })
    if (result.body.ok) {
      console.log('Reminder sent successfully for ' + today + '. Waiting on: ' + notVoted.map(function (m) { return m.name }).join(', '))
    } else {
      console.error('Telegram error:', result.body.description)
    }
  } catch (err) {
    console.error('Failed to send reminder:', err.message)
  }
}

// Run at 12:00 PM Eastern Time every day (17:00 UTC = 12:00 PM ET)
export const config = {
  schedule: '0 17 * * *',
}
