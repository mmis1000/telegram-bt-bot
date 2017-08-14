const express = require("express");
const ecstatic = require('ecstatic');
const path = require("path");
const config = require("../config.json");

const app = express();

app.get('/', function (req, res, next) {
    res.status(403).end('<h1>forbidden</h1>');
})

app.use(ecstatic({
    root: path.resolve(__dirname, '../', config.path)
}));

module.exports = app;
