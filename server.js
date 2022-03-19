var express        = require('express');
var http           = require('http');
var compression    = require('compression');
var errorHandler   = require('errorhandler');
var methodOverride = require('method-override');
var path           = require('path');
var log4js         = require('log4js');
var routes         = require('./routes/index.js');
var chatapp        = require('./sockets/app.js');

log4js.configure('log4js_configuration.json', { reloadSecs: 60 });
var appLogger = log4js.getLogger('applog');
var accessLogger = log4js.getLogger('accesslog');

var app = express();
app.set('port', process.env.PORT || 3001);
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
// app.enable('strict routing');
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride());
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
app.use(express.static(path.join(__dirname, 'public')));

// NODE_ENV=production node server.js  default:development
if (process.env.NODE_ENV === 'production') {
    app.use(errorHandler({ showStack: true, dumpExceptions: true }));
}

// routing
var appRoot = '/';
routes.set(appRoot, app);

// 404 not found
app.use(function (req, res) {
    res.sendStatus(404);
});

var server = http.createServer(app);
server.listen(app.get('port'), function () {
    appLogger.info('Express server listening on port ' + app.get('port'));
});

// 'log lever' : 0 error  1 warn  2 info  3 debug / log: false
var io = require('socket.io')(server, { 'log level': 2 });
exports.sockets = io.sockets.on('connection', chatapp.onConnection);

process.on('uncaughtException', function (err) {
    appLogger.error('uncaughtException => ' + err);
});
