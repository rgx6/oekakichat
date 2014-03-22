
var express = require('express');
var http = require('http');
var path = require('path');
var log4js = require('log4js');
var nedb = require('nedb');
var routes = require('./routes/index.js');
var chatapp = require('./sockets/app.js');

exports.db = {};
exports.db.rooms = new nedb({ filename: 'db/rooms', autoload: true });
exports.db.rooms.ensureIndex({ fieldName: 'id', unique: true });
exports.db.rooms.ensureIndex({ fieldName: 'configid', unique: true });
exports.db.logs = new nedb({ filename: 'db/logs', autoload: true });
exports.db.logs.ensureIndex({ fieldName: 'id' });
exports.db.logs.ensureIndex({ fieldName: 'filename', unique: true });

// TODO : exports設定 & 設定見直し
var logger = log4js.getLogger('oekakichat');
logger.setLevel('DEBUG');
log4js.configure({
    'appenders': [
    // console に出力
    { 'type': 'console' },
    // ファイルに出力
    {
        'type': 'file',
        'filename': 'log/log',
        'maxLogSize': 1024 * 1024,
        'backups': 50,
        // stdoutへの出力も拾う
        'category': [ 'oekakichat', 'console' ],
    }
    ],
    // stdoutへの出力も拾う
    'replaceConsole': true
});

// all environments
// TODO : パラメータで再接続不可にする？
var app = express();
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.enable('strict routing');
app.use(express.favicon());
// TODO : devいらない？
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(log4js.connectLogger(logger, {
    // 指定したログレベルで記録される
    'level': log4js.levels.INFO,
    // アクセスログを出力する際に無視する拡張子
    'nolog': [ '\\.css', '\\.js', '\\.gif', '\\.png' ],
    // アクセスログのフォーマット（以下はデフォルト出力）
    'format': ':remote-addr - - ":method :url HTTP/:http-version" :status :content-length ":referrer" ":user-agent"'
}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// TODO : これなんだっけ？
// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler());
}

// 末尾 / 必須の redirect 設定
app.use(function (req, res, next) {
    if (req.path.substr(-1) !== '/' && req.path.length > 1) {
        var query = req.url.slice(req.path.length);
        res.redirect(301, req.path + '/' + query);
    } else {
        next();
    }
});

// 404 not found
app.use(function (req, res) {
    res.send(404);
});

// routing
var appRoot = '/oekakichat/';
app.get(appRoot, routes.index);
app.get(appRoot + ':id/', routes.room);
app.get(appRoot + ':id/log/:page/', routes.log);
app.get(appRoot + 'config/:configid/', routes.config);

var server = http.createServer(app);
server.listen(app.get('port'), function () {
    'use strict';
    console.log('Express server listening on port ' + app.get('port'));
});

// TODO : log level
// 'log lever' : 0 error  1 warn  2 info  3 debug / log: false
var io = require('socket.io').listen(server, { 'log level': 2 });
exports.sockets = io.sockets.on('connection', chatapp.onConnection);
