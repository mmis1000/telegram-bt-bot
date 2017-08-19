const path = require("path");
const URL = require("url");
const Q = require("q");
const downlaod = require("./download");
const config = require("../config.json");
const storage = require("node-persist");
const parseTorrent = require('parse-torrent');
const filesize = require("filesize");

const downloadFolderPath = path.resolve(__dirname, '../', config.path);

const statusMap = new Map();

function formatNumber(number) {
    if (('string' === typeof number) && !number.match(/^([1-9]|\d|0)$/)) {
        return number
    }
    
    return filesize(number, {standard: "iec"})
}

function trottle(func, interval) {
    var time = 0;
    return function () {
        if (Date.now() - time > interval) {
            func.apply(this, arguments);
            time = Date.now();
        }
    }
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
 
function formatDownlaodStatus(status) {
    var cleaned = {};
    for (var key in status) {
        if (key !== 'resultPromise' && key !== 'p') {
            if (key !== 'messageList') {
                cleaned[key] = status[key]
            } else {
                cleaned[key] = JSON.parse(JSON.stringify(status[key]));
            }
        }
    }
    return cleaned
}

var lastPromise = Q.resolve();
function broadcastMessage(bot, list, text, inlineKeyboard, options) {
    options = options || {};
    
    list.forEach(function (options, item) {
        options = Object.assign({}, options);
        
        if (item.chatId) {
            options.chat_id = item.chatId;
            options.message_id = item.messageId;
        } else {
            options.inline_message_id = item.inlineMessageId
        }
        
        lastPromise = lastPromise.then(function () {
            if (text) {
                if (inlineKeyboard) {
                    options.reply_markup = inlineKeyboard
                }
                return bot.editMessageText(text, options).catch(function () {
                    // ate the error
                });
            } else {
                return bot.editMessageReplyMarkup(inlineKeyboard, options).catch(function () {
                    // ate the error
                });
            }
        })
    }.bind(null, options))
}

function downloadWithMessageId(torrent, bot, chatId, messageId) {
    try {
        var link = parseTorrent(torrent);
        var infoHash = link.infoHash;
        var status = statusMap.get(infoHash);
        if (status && status.messageList) {
            status.messageList.push({chatId: chatId, messageId: messageId})
            // console.log(status.messageList)
            return status.p;
        }
    } catch(err) {
        broadcastMessage(bot, [{chatId: chatId, messageId: messageId}], `Error while downloading: ${err.message}`, null)
        return Q.reject(err);
    }
    
    return doDownload(torrent, bot, {chatId: chatId, messageId: messageId})
}

function downloadWithInlineMessageId(torrent, bot, inlineMessageId) {
    try {
        var link = parseTorrent(torrent);
        var infoHash = link.infoHash;
        var status = statusMap.get(infoHash);
        if (status && status.messageList) {
            status.messageList.push({inlineMessageId: inlineMessageId})
            return status.p;
        }
    } catch(err) {
        broadcastMessage(bot, [{inlineMessageId: inlineMessageId}], `Error while downloading: ${err.message}`, null)
        return Q.reject(err);
    }
    
    return doDownload(torrent, bot, {inlineMessageId: inlineMessageId})
}

function resumeDownload(status, bot) {
    return doDownload(status.torrent, bot, null, status)
}

function doDownload(torrent, bot, message, oldStatus) {
    var firstStatus = true;
    
    try {
        var status = downlaod(torrent, downloadFolderPath, oldStatus);
    } catch(err) {
        if (message || oldStatus) {
            broadcastMessage(bot,message ? [message] : oldStatus.messageList, `Error while downloading: ${err.message}`, null)
        }
        return Q.reject(err);
    }
    
    var p = Q.resolve()
    .then(function () {
        status.messageList = status.messageList || [];
        
        statusMap.set(status.infoHash, status)
        storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
        
        if (message) {
            status.messageList.push(message)
        }
        
        status.resultPromise.progress(trottle(function (status) {
            storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
            if (status.infoReady) {
                if (firstStatus) {
                    console.log(`downloading: ${status.name}`)
                    console.log(`size: ${status.totalSize}`)
                    firstStatus = false;
                }
            }
            broadcastMessage(bot, status.messageList, `📦: <code>${escapeHtml(status.name)}</code>
⬇️: ${formatNumber(status.downloadedSize)} / ${formatNumber(status.totalSize)}`, null, {parse_mode: 'HTML'})
        }, 5000))
        return status.resultPromise;
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
        
        broadcastMessage(bot, status.messageList, `📦: <code>${escapeHtml(status.name)}</code>
⬇️: <a href="${escapeHtml(folderUrl)}">download finished!</a>`, {
            inline_keyboard: [[{
                text: '📁Click to open folder',
                url: folderUrl
            }]]
        }, {parse_mode: 'HTML'})
        
        // clear up
        status.messageList = [];
        statusMap.delete(status.infoHash);
        storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
        return status
    })
    .catch(function (err) {
        if (status) {
            // err.status = status;
            console.error(err.stack);
            broadcastMessage(bot, status.messageList, `Error while downloading: ${err.message}`, null)
            
            // clear up
            status.messageList = [];
            statusMap.delete(status.infoHash);
            storage.setItemSync(status.infoHash, formatDownlaodStatus(status));
        }
        throw err;
    })
    
    status.p = p;
    return p;
}

module.exports = {
    downloadWithMessageId: downloadWithMessageId,
    downloadWithInlineMessageId: downloadWithInlineMessageId,
    resumeDownload: resumeDownload
}