var express = require('express');
var http = require('http');
var path = require('path');
var log4js = require('log4js');
var routes = require('./routes/index.js');
var chatapp = require('./sockets/app.js');

var logger = log4js.getLogger('OekakiChat');
logger.setLevel('DEBUG');
log4js.configure({
    'appenders': [
    // console に出力
    { 'type': 'console' },
    // ファイルに出力
    {
        'type': 'file',
        'filename': 'log/log',
        'maxLogSize': 1 * 1024 * 1024,
        'backups': 50,
        // stdoutへの出力も拾う
        'category': ['OekakiChat', 'console'],
    }
    ],
    // stdoutへの出力も拾う
    'replaceConsole': true
});

// all environments
// todo : 再接続不可にする？
var app = express();
app.set('port', process.env.PORT || 3001);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.enable('strict routing');
app.use(express.favicon());
// app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(log4js.connectLogger(logger, {
    // 指定したログレベルで記録される
    'level': log4js.levels.INFO,
    // アクセスログを出力する際に無視する拡張子
    'nolog': ['\\.css', '\\.js', '\\.gif', '\\.png'],
    // アクセスログのフォーマット（以下はデフォルト出力）
    'format': ':remote-addr - - ":method :url HTTP/:http-version" :status :content-length ":referrer" ":user-agent"'
}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// todo : これなんだっけ？
// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
}

// 404 not found
app.use(function (req, res) {
    res.send(404);
});

// routing
var appRoot = '/';
app.get(appRoot, routes.index);
app.get(appRoot + ':id/', routes.room);
app.get(appRoot + ':id/log/:page/', routes.log);
app.get(appRoot + 'config/:configid/', routes.config);

var server = http.createServer(app);
server.listen(app.get('port'), function () {
    'use strict';
    console.log('Express server listening on port ' + app.get('port'));
});

// 'log lever' : 0 error  1 warn  2 info  3 debug / log: false
var io = require('socket.io').listen(server, { 'log level': 2 });
exports.sockets = io.sockets.on('connection', chatapp.onConnection);

// hack : 例外処理
process.on('uncaughtException', function (err) {
    logger.error('uncaughtException => ' + err);
});
