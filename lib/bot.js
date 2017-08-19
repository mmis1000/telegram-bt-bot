const TelegramBot = require('node-telegram-bot-api');
const config = require("../config.json");
const URL = require("url");
const rp = require('request-promise');
const downloadHelper = require("./download_helper");
const Q = require("q");
const storage = require("node-persist");
const token = config.token;

var botInfo;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
    polling: true
});

bot.on('error', function (err) {
    console.error(err.stack);
})

bot.getMe()
.then(function (res) {
    botInfo = res;
})
.catch(function (err) {
    console.log('fail to get bot info: ' + err.stack);
    process.exit(1);
})

function resumeAllUnfinsihedDownloads() {
    storage.values().forEach(function (item, index) {
        console.log(`=============================================`);
        console.log(`Item ${item.infoHash}`);
        for (var key in item) {
            if (key === 'infoHash') continue;
            if (Buffer.isBuffer(item[key])) {
                console.log(`  ${key}: [Buffer...]`)
            } else if (key === 'messageList') {
                console.log(`  ${key}:`)
                item[key].forEach(function (i) {
                    console.log(`  | ${
                        Object.keys(i)
                        .map(function (key) {return key + ': ' + i[key]})
                        .join(', ')
                    }`)
                })
            } else {
                console.log(`  ${key}: ${item[key]}`)
            }
        }
        // console.log(item);
        if (!item.finished && !item.errored) {
            console.log('  resuming.......');
            // resumeAndTrack(item);
            downloadHelper.resumeDownload(item, bot)
        }
    })
}

resumeAllUnfinsihedDownloads();

bot.onText(/^\/bt(?:@(\w+))?(?: (.*)|$)/, (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const botName = match[1];
    const resp = match[2];
    
    // console.log(msg)
    
    if (!botInfo || (botName && botName !== botInfo.username)) {
        console.log(botName, botInfo)
        return
    }
    
    console.log(`${msg.from.first_name} ${msg.from.last_name || ''}(${msg.from.username ? '@' + msg.from.username : msg.from.id})@${msg.chat.title}: ${msg.text}`)
    
    var hasTorrent = msg.reply_to_message && 
        msg.reply_to_message.document && 
        msg.reply_to_message.document.file_name.match(/\.torrent$/);
    
    if (!resp && !hasTorrent) {
        return bot.sendMessage(chatId, `Sorry, there were neither a magnet link nor a torrent file provided.`, { reply_to_message_id: messageId });
    }
    
    if (hasTorrent) {
        bot.getFileLink(msg.reply_to_message.document.file_id)
        .then(function (url) {
            return rp({
                method: 'GET',
                url: encodeURI(decodeURIComponent(URL.parse(url).href)),
                encoding: null
            })
        })
        .then(function (torrent) {
            return Q.all([
                Q.resolve(torrent),
                bot.sendMessage(chatId, `Download Start`, { reply_to_message_id: messageId})
            ]);
        })
        .spread(function (torrent, message) {
            return downloadHelper.downloadWithMessageId(torrent, bot, chatId, message.message_id)
        })
        .catch(function (err) {
            console.error(err.stack);
        })
    } else {
        const parsed = URL.parse(resp);
        
        if (parsed.protocol !== 'magnet:') {
            return bot.sendMessage(chatId, `Sorry, '${resp}' didn't look like a magnet link.`, { reply_to_message_id: messageId });
        }
        
        bot.sendMessage(chatId, `Download Start`, { reply_to_message_id: messageId})
        .then(function (message) {
            return downloadHelper.downloadWithMessageId(resp, bot, chatId, message.message_id)
        })
        .catch(function (err) {
            console.error(err.stack);
        })
    }
});

bot.on('inline_query', function (query) {
    var inlineQueryId = query.id;
    if (!query.query.match(/^magnet:/)) {
        return
    }
    bot.answerInlineQuery(inlineQueryId, [{
        type: 'article', 
        id: Math.random().toString(16).slice(2),
        title: 'download',
        input_message_content: {
            message_text: 'Download Start'
        },
        reply_markup: {
            inline_keyboard: [[{
                text: 'I am a button, ain\'t i?',
                callback_data: '{Place Holder}'
            }]]
        }
    }], {
        cache_time: 0
    })
})

bot.on('chosen_inline_result', function(result) {
    var query = result.query;
    var inlineMessageId = result.inline_message_id

    console.log(`${result.from.first_name} ${result.from.last_name || ''}(${result.from.username ? '@' + result.from.username : result.from.id})@{inline}: ${query}`)

    // remove the markup, because we fucking didn't need this.
    bot.editMessageReplyMarkup({
        inline_keyboard: [[]]
    }, {
        inline_message_id: inlineMessageId
    })
    .then(function () {
        return downloadHelper.downloadWithInlineMessageId(query, bot, inlineMessageId)
    })
    .catch(function (err) {
        console.log(err)
    });
})

module.exports = bot