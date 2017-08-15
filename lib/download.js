var torrentStream = require('torrent-stream');
var Q = require("q");
var path = require("path");
var fs = require("fs");
var parseTorrent = require('parse-torrent');

function download(torrentOrLinkOrMagnetLink, folder, prevStatus) {
    var link = parseTorrent(torrentOrLinkOrMagnetLink);
    var infoHash = link.infoHash;
    var folder = path.resolve(folder, infoHash);
    var torrentTimeout = 10 * 1000;
    
    try {
        fs.mkdirSync(folder)
    } catch (e) {
        // ate the error
    }
    
    var status = prevStatus? Object.assign({}, prevStatus): {
        infoHash: infoHash,
        torrent: torrentOrLinkOrMagnetLink,
        infoReady: false,
        name: "unknown",
        
        totalSize: "unknown",
        pieceLength: null,
        lastPieceLength: null,
        
        downloadedSize: 0,
        finished: false,
        
        totalPieces: null,
        path: folder,
        resultPromise:  null
    }
    
    var deferred = Q.defer();
    
    status.resultPromise = deferred.promise;
    
    var engine = torrentStream(torrentOrLinkOrMagnetLink, {
        path: folder,
        verify: true
    });
          
    engine.on('ready', function() {
        clearTimeout(torrentTimeoutId);
        
        status.name = engine.torrent.name;
        status.downloadedSize = 0;
        status.totalSize = engine.torrent.length
        status.pieceLength = engine.torrent.pieceLength;
        status.lastPieceLength = engine.torrent.lastPieceLength;
        status.totalPieces = engine.torrent.pieces.length;
        status.infoReady = true;
        
        deferred.notify(status);
        
        engine.files.forEach(function(file) {
            file.select();
        });
    });
    
    var torrentTimeoutId = setTimeout(function () {
        engine.destroy();
        deferred.reject(new Error('timeout while initiating seed'));
    }, torrentTimeout)
    
    engine.on('verify', function (index) {
        status.downloadedSize += index === (status.totalPieces - 1) ? status.lastPieceLength : status.pieceLength;
        deferred.notify(status)
    })
    
    engine.on('idle', function () {
        // console.log('download finished');
        status.finished = true;
        
        engine.destroy();
        deferred.notify(status);
        deferred.resolve(status)
    })
    
    engine.on('error', function (err) {
        deferred.reject(err);
        try {
            engine.destroy();
        } catch (err) {
            console.error('error while destroy engine: ' + err.stack);
        }
    })
    
    return status;
}

module.exports = download;