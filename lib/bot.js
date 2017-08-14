const TelegramBot = require('node-telegram-bot-api');
const config = require("../config.json");
const URL = require("url");
const rp = require('request-promise');
const downlaod = require("./download");
const path = require("path");
const fs = require("fs");
const donwloadFolderPath = path.resolve(__dirname, '../', config.path);

const token = config.token;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
    polling: true
});

function randomId() {
    var s = '';
    for (var i = 0; i < 4; i++) {
        s += Math.random().toString(16).slice(2);
    }
    return s;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }


function formatNumber(number) {
    var list = number.toString().split('');
    var result = '';
    
    for (var i = 0; i < list.length; i++) {
        if (i % 3 === 0 && i !== 0) {
            result = ',' + result;
        }
        result =  list[list.length - i - 1] + result
    }
    
    return result;
}

function createDownloadFolder(base) {
    var dirPath = path.resolve(base, randomId())
    fs.mkdirSync(dirPath);
    return dirPath;
}

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message

    const chatId = msg.chat.id;
    const resp = match[1]; // the captured "whatever"

    // send back the matched "whatever" to the chat
    bot.sendMessage(chatId, resp);
});

function trottle(func, interval) {
    var time = 0;
    //var id = null;
    return function () {
        // clearTimeout(id)
        if (Date.now() - time > interval) {
            func.apply(this, arguments);
            time = Date.now();
        }
        // else {
        //     var self = this;
        //     var args = [].slice.call(arguments, 0);
        //     id = setTimeout(function() {
        //         func.apply(self, args);
        //     }, interval);
        // }
    }
}

function downloadAndTrack(torrent, chatId, reply_to_message_id) {
    var messageId;
    return bot.sendMessage(chatId, `Download Start`, { reply_to_message_id })
    .then(function (message) {
        messageId = message.message_id;
        return downlaod(torrent, createDownloadFolder(donwloadFolderPath))
        .progress(trottle(function (status) {
            bot.editMessageText(
`Seed name: <code>${escapeHtml(status.name)}</code>
Download: ${formatNumber(status.downloadedSize)}/${formatNumber(status.totalSize)}`, 
            {
                chat_id: chatId,
                message_id: messageId,
                reply_to_message_id,
                parse_mode: 'HTML'
            })
        }, 5000))
    })
    .then(function (status) {
        var relativePath = path.relative(donwloadFolderPath, status.path)
        var folderUrl = URL.resolve(config.domain, relativePath)
        console.log('download finished at path: ' + status.path);
        console.log('download finished at url: ' + folderUrl);
        bot.editMessageText(
`Seed name: <code>${escapeHtml(status.name)}</code>
Download: finished!
Link: <a href="${escapeHtml(folderUrl)}">Click to open folder</a>`, 
        {
            chat_id: chatId,
            message_id: messageId,
            reply_to_message_id,
            parse_mode: 'HTML'
        }).catch(function (err) {
            console.error(err);
        })
        return status
    })
}

bot.onText(/^\/bt(?:@\w+)?(?: (.*)|$)/, (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const resp = match[1];
    
    // console.log(msg)
    
    console.log(`${msg.from.first_name} ${msg.from.last_name || ''}(${msg.from.username ? '@' + msg.from.username : msg.from.id})@${msg.chat.title}: ${msg.text}`)
    
    var hasTorrent = msg.reply_to_message && 
        msg.reply_to_message.document && 
        msg.reply_to_message.document.file_name.match(/\.torrent$/);
    
    if (!resp && !hasTorrent) {
        return bot.sendMessage(chatId, `Sorry, you didn't provide a magnet link nethier a torrent file.`, { reply_to_message_id: messageId });
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
            return downloadAndTrack(torrent, chatId, messageId)
        })
        .catch(function (err) {
            console.log(err);
            bot.sendMessage(chatId, `Error while downloading: ${err.message}`, { reply_to_message_id: messageId })
            .catch(function () {
                // ate the error;
            });
        })
    } else {
        const parsed = URL.parse(resp);
        
        if (parsed.protocol !== 'magnet:') {
            return bot.sendMessage(chatId, `Sorry, '${resp}' didn't look like a magnet link.`, { reply_to_message_id: messageId });
        }
        
        downloadAndTrack(resp, chatId, messageId)
        .catch(function (err) {
            console.log(err);
            bot.sendMessage(chatId, `Error while downloading: ${err.message}`, { reply_to_message_id: messageId })
            .catch(function () {
                // ate the error;
            });
        })
    }
});

module.exports = bot