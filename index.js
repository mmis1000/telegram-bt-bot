var config = require('./config.json');
var bot = require("./lib/bot");
var app = require("./lib/server");

app.listen(config.port, function () {
    console.log('Telegram downlaod bot is listening on port ' + config.port + '!')
})