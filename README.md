# Telegram BT Bot

[![Greenkeeper badge](https://badges.greenkeeper.io/mmis1000/telegram-bt-bot.svg)](https://greenkeeper.io/)

A Bot that download file from BT network by telegram command.

## To set up
1. get the bot token from [Bot Father](http://t.me/botFather)
2. set the privacy mode off with [Bot Father](http://t.me/botFather)
3. set command `bt` with [Bot Father](http://t.me/botFather)
4. enable inline mode with [Bot Father](http://t.me/botFather)
5. set /setinlinefeedback to `enabled` with [Bot Father](http://t.me/botFather) *(This is important!!!)*
6. copy the `config.example.json` as `config.json`
7. change the `port`, `download path`, `token` and `domain name` in `config.json`
8. make sure you are able to access to the bot via the domain you set in config

## commands

### Normal command
* `/bt` download the torrent by either send a magnet link or reply to torrent file

### inline command
* download magnet by send it to the bot in inline mode
