const TelegramBot = require('node-telegram-bot-api');
const config = require("../config.json");
const URL = require("url");
const rp = require('request-promise');
const downlaod = require("./download");
const path = require("path");
const Q = require("q");
const storage = require("node-persist");
const BSON = require('bson')

const downloadFolderPath = path.resolve(__dirname, '../', config.path);
const token = config.token;
const bson = new BSON();

var botInfo;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
    polling: true
});

storage.initSync({
	dir: path.resolve(downloadFolderPath, '.info'),
	stringify: bson.serialize.bind(bson),
	parse: function (buf) {
	    return bson.deserialize(buf, {promoteBuffers: true});
	},
	encoding: null,
	continuous: true, 
    forgiveParseErrors: false // [NEW]
});

bot.getMe()
.then(function (res) {
    botInfo = res;
})
.catch(function (err) {
    console.log('fail to get bot info: ' + err.stack);
    process.exit(1);
})

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
    if (('string' === typeof number) && !number.match(/^([1-9]|\d|0)$/)) {
        return number
    }
    
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

function formatDownlaodStatus(status) {
    var cleaned = {};
    for (var key in status) {
        if (key !== 'resultPromise') {
            cleaned[key] = status[key]
        }
    }
    return cleaned
}

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
    var firstStatus = true;
    return bot.sendMessage(chatId, `Download Start`, { reply_to_message_id })
    .then(function (message) {
        messageId = message.message_id;
        var msgs = [];
        var status = downlaod(torrent, downloadFolderPath);
        
        status.chatId = chatId;
        status.editMessageId = messageId
        status.replyToMessageId = reply_to_message_id
        
        status.resultPromise.progress(trottle(function (status) {
            storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
            
            if (status.infoReady) {
                if (firstStatus) {
                    console.log(`downloading: ${status.name}`)
                    console.log(`size: ${status.totalSize}`)
                    firstStatus = false;
                }
            }
            var msg = bot.editMessageText(
`📦: <code>${escapeHtml(status.name)}</code>
⬇️: ${formatNumber(status.downloadedSize)}/${formatNumber(status.totalSize)}`, 
            {
                chat_id: chatId,
                message_id: messageId,
                reply_to_message_id,
                parse_mode: 'HTML'
            })
            .then(function () {
                msgs.splice(msgs.indexOf(msg, 1))
            })
            .catch(function () {
                if (msgs.indexOf(msg, 1) >= 0) {
                    msgs.splice(msgs.indexOf(msg, 1))
                }
            })
            
            msgs.push(msg);
        }, 5000))
        
        return status.resultPromise.then(function (status) {
            return Q.all(msgs).then(function () {
                return status;
            })
        })
    })
    .then(function (status) {
        storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
        
        // progress event won't fire when there where file exists locally
        if (firstStatus) {
            console.log(`downloading: ${status.name}`)
            console.log(`size: ${status.totalSize}`)
            firstStatus = false;
        }
                
        var relativePath = path.relative(downloadFolderPath, status.path)
        var folderUrl = URL.resolve(config.domain, relativePath)
        console.log('download finished at path: ' + status.path);
        console.log('download finished at url: ' + folderUrl);
        bot.editMessageText(
`📦: <code>${escapeHtml(status.name)}</code>
⬇️: <a href="${escapeHtml(folderUrl)}">download finished!</a>`, 
        {
            chat_id: chatId,
            message_id: status.editMessageId,
            reply_to_message_id,
            parse_mode: 'HTML'
        })
        .then(function () {
            return bot.editMessageReplyMarkup({
                inline_keyboard: [[{
                    text: '📁Click to open folder',
                    url: folderUrl
                }]]
            }, {
                chat_id: chatId,
                message_id: status.editMessageId,
            })
        })
        .catch(function (err) {
            console.error(err);
        })
        return status
    })
    .catch(function (err) {
        // label nad rethrow
        err.editMessageId = messageId;
        throw err;
    })
}

function resumeAndTrack(oldStatus) {
    var messageId;
    var torrent = oldStatus.torrent;
    var firstStatus = true;
    return Q.resolve()
    .then(function () {
        messageId = oldStatus.editMessageId;
        var msgs = [];
        var status = downlaod(torrent, downloadFolderPath, oldStatus);
        
        status.resultPromise.progress(trottle(function (status) {
            storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
            if (status.infoReady) {
                if (firstStatus) {
                    console.log(`downloading: ${status.name}`)
                    console.log(`size: ${status.totalSize}`)
                    firstStatus = false;
                }
            }
            var msg = bot.editMessageText(
`📦: <code>${escapeHtml(status.name)}</code>
⬇️: ${formatNumber(status.downloadedSize)}/${formatNumber(status.totalSize)}`, 
            {
                chat_id: status.chatId,
                message_id: messageId,
                reply_to_message_id: status.replyToMessageId,
                parse_mode: 'HTML'
            })
            .then(function () {
                msgs.splice(msgs.indexOf(msg, 1))
            })
            .catch(function () {
                if (msgs.indexOf(msg, 1) >= 0) {
                    msgs.splice(msgs.indexOf(msg, 1))
                }
            })
            
            msgs.push(msg);
        }, 5000))
        
        return status.resultPromise.then(function (status) {
            return Q.all(msgs).then(function () {
                return status;
            })
        })
    })
    .then(function (status) {
        storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
        // progress event won't fire when there where file exists locally
        if (firstStatus) {
            console.log(`downloading: ${status.name}`)
            console.log(`size: ${status.totalSize}`)
            firstStatus = false;
        }
                
        var relativePath = path.relative(downloadFolderPath, status.path)
        var folderUrl = URL.resolve(config.domain, relativePath)
        console.log('download finished at path: ' + status.path);
        console.log('download finished at url: ' + folderUrl);
        bot.editMessageText(
`📦: <code>${escapeHtml(status.name)}</code>
⬇️: <a href="${escapeHtml(folderUrl)}">download finished!</a>`, 
        {
            chat_id: status.chatId,
            message_id: status.editMessageId,
            reply_to_message_id: status.replyToMessageId,
            parse_mode: 'HTML'
        })
        .then(function () {
            return bot.editMessageReplyMarkup({
                inline_keyboard: [[{
                    text: '📁Click to open folder',
                    url: folderUrl
                }]]
            }, {
                chat_id: status.chatId,
                message_id: status.editMessageId,
            })
        })
        .catch(function (err) {
            console.error(err);
        })
        return status
    })
    .catch(function (err) {
        // label nad rethrow
        bot.editMessageText(`Error while downloading: ${err.message}`, { chat_id: status.chatId,  message_id: messageId })
        .catch(function () { /* ate the error */ });
        throw err;
    })
}

function resumeAllUnfinsihedDownloads() {
    storage.values().forEach(function (item, index) {
        console.log(`=============================================`);
        console.log(`Item ${item.infoHash}`);
        for (var key in item) {
            if (key === 'infoHash') continue;
            if (Buffer.isBuffer(item[key])) {
                console.log(`  ${key}: [Buffer...]`)
            } else {
                console.log(`  ${key}: ${item[key]}`)
            }
        }
        // console.log(item);
        if (!item.finished) {
            console.log('  resuming.......');
            resumeAndTrack(item);
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
            return downloadAndTrack(torrent, chatId, messageId)
        })
        .catch(function (err) {
            console.log(err);
            if (err.editMessageId) {
                bot.editMessageText(`Error while downloading: ${err.message}`, { chat_id: chatId,  message_id: err.editMessageId })
                .catch(function () { /* ate the error */ });
            } else {
                bot.sendMessage(chatId, `Error while downloading: ${err.message}`, { reply_to_message_id: messageId })
                .catch(function () { /* ate the error */ });
            }
        })
    } else {
        const parsed = URL.parse(resp);
        
        if (parsed.protocol !== 'magnet:') {
            return bot.sendMessage(chatId, `Sorry, '${resp}' didn't look like a magnet link.`, { reply_to_message_id: messageId });
        }
        
        downloadAndTrack(resp, chatId, messageId)
        .catch(function (err) {
            console.log(err);
            if (err.editMessageId) {
                bot.editMessageText(`Error while downloading: ${err.message}`, { chat_id: chatId,  message_id: err.editMessageId })
                .catch(function () { /* ate the error */ });
            } else {
                bot.sendMessage(chatId, `Error while downloading: ${err.message}`, { reply_to_message_id: messageId })
                .catch(function () { /* ate the error */ });
            }
        })
    }
});

module.exports = bot