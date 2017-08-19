const path = require("path");
const storage = require("node-persist");
const BSON = require('bson')
const config = require('./config.json');
const bson = new BSON();
const downloadFolderPath = path.resolve(__dirname, config.path);

// init storage before everything up
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

var bot = require("./lib/bot");
var app = require("./lib/server");

app.listen(config.port, function () {
    console.log('Telegram downlaod bot is listening on port ' + config.port + '!')
})