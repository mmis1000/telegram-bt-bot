var torrentStream = require('torrent-stream');
var Q = require("q");
var path = require("path");
var fs = require("fs");
var parseTorrent = require('parse-torrent');

function download(torrentOrLinkOrMagnetLink, folder) {
    
    var link = parseTorrent(torrentOrLinkOrMagnetLink);
    var infoHash = link.infoHash;
    var folder = path.resolve(folder, infoHash);
    
    try {
        fs.mkdirSync(folder)
    } catch (e) {
        // ate the error
    }
    
    var status = {
        name: "unknown",
        
        totalSize: "unknown",
        pieceLength: null,
        lastPieceLength: null,
        
        downloadedSize: 0,
        
        totalPieces: null,
        path: folder
    }
    
    return Q.Promise(function (resolve, reject, notify) {
        var engine = torrentStream(torrentOrLinkOrMagnetLink, {
            path: folder
        });
              
        engine.on('ready', function() {
            // console.log(engine)
            
            status.name = engine.torrent.name;
            // console.log('total size: ' + engine.torrent.length);
            status.totalSize = engine.torrent.length
            status.pieceLength = engine.torrent.pieceLength;
            status.lastPieceLength = engine.torrent.lastPieceLength;
            // console.log('piece count: ' + engine.torrent.pieces.length);
            status.totalPieces = engine.torrent.pieces.length;
            
            notify(status);
            
            engine.files.forEach(function(file) {
                // console.log('file: ', file);
                // console.log('filename: ', file.name);
                file.select();
            });
        });
        
        engine.on('download', function (index) {
            // console.log('piece index: ' + index);
            status.downloadedSize += index === (status.totalPieces - 1) ? status.lastPieceLength : status.pieceLength;
            // console.log('current piece: ' + index + ', pieces: ' + downloadedPieces + '/' + totalPieces + ', downloaded: ' + downloadedSize + '/' + totalSize + ' bytes');
            notify(status)
        })
        
        engine.on('idle', function () {
            // console.log('download finished');
            engine.destroy();
            resolve(status)
        })
        
        engine.on('error', function (err) {
            reject(err);
            try {
                engine.destroy();
            } catch (err) {
                console.error('error while destroy engine: ' + err.stack);
            }
            
        })
    })
}

module.exports = download;