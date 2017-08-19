const torrentStream = require('torrent-stream');
const Q = require("q");
const path = require("path");
const fs = require("fs");
const parseTorrent = require('parse-torrent');

const torrentTimeout = 60 * 1000;

function download(torrentOrLinkOrMagnetLink, baseFolder, prevStatus) {
    const link = parseTorrent(torrentOrLinkOrMagnetLink);
    const infoHash = link.infoHash;
    const folder = path.resolve(baseFolder, infoHash);
    var readyed = false;
    
    try {
        fs.mkdirSync(folder)
    } catch (e) {
        // ate the error
    }
    
    const status = prevStatus? Object.assign({}, prevStatus): {
        infoHash: infoHash,
        torrent: torrentOrLinkOrMagnetLink,
        infoReady: false,
        name: "unknown",
        
        totalSize: "unknown",
        pieceLength: null,
        lastPieceLength: null,
        
        downloadedSize: 0,
        finished: false,
        errored: false,
        
        totalPieces: null,
        path: folder,
        resultPromise:  null
    }
    
    const deferred = Q.defer();
    
    status.resultPromise = deferred.promise;
    
    const engine = torrentStream(torrentOrLinkOrMagnetLink, {
        path: folder,
        verify: true
    });
          
    engine.on('ready', function() {
        clearTimeout(torrentTimeoutId);
        readyed = true;
        
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
        status.errored = true;
        engine.destroy();
        deferred.reject(new Error('timeout while initiating torrent'));
    }, torrentTimeout)
    
    engine.on('verify', function (index) {
        status.downloadedSize += index === (status.totalPieces - 1) ? status.lastPieceLength : status.pieceLength;
        
        if (readyed) {
            deferred.notify(status);
        }
    })
    
    engine.on('idle', function () {
        // console.log('download finished');
        status.finished = true;
        
        engine.destroy();
        deferred.notify(status);
        deferred.resolve(status)
    })
    
    engine.on('error', function (err) {
        status.errored = true;
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