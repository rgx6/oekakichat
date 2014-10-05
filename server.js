var express = require('express');
var http = require('http');
var path = require('path');
var log4js = require('log4js');
var routes = require('./routes/index.js');
var chatapp = require('./sockets/app.js');

log4js.configure('log4js_configuration.json', { reloadSecs: 60 });
var appLogger = log4js.getLogger('appLog');
appLogger.setLevel(log4js.levels.INFO);
var accessLogger = log4js.getLogger('accessLog');
accessLogger.setLevel(log4js.levels.INFO);

var app = express();
app.set('port', process.env.PORT || 3001);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
// app.enable('strict routing');
app.use(express.favicon());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(log4js.connectLogger(accessLogger, {
    // express 閾値ではなく指定したログレベルで記録される
    'level': log4js.levels.INFO,
    // アクセスログを出力する際に無視する拡張子
    'nolog': [ '\\.css', '\\.js' ],
    // アクセスログのフォーマット
    'format': JSON.stringify({
        'remote-addr':    ':remote-addr',
        'method':         ':method',
        'url':            ':url',
        'status':         ':status',
        'http-version':   ':http-version',
        'content-length': ':content-length',
        'referrer':       ':referrer',
        'user-agent':     ':user-agent',
        'response-time':  ':response-time',
    })
}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// NODE_ENV=production node server.js  default:development
if (process.env.NODE_ENV === 'production') {
    app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
}

// 404 not found
app.use(function (req, res) {
    res.send(404);
});

// routing
var appRoot = '/';
routes.set(appRoot, app);

var server = http.createServer(app);
server.listen(app.get('port'), function () {
    appLogger.info('Express server listening on port ' + app.get('port'));
});

// 'log lever' : 0 error  1 warn  2 info  3 debug / log: false
var io = require('socket.io').listen(server, { 'log level': 2 });
exports.sockets = io.sockets.on('connection', chatapp.onConnection);

process.on('uncaughtException', function (err) {
    appLogger.error('uncaughtException => ' + err);
});
