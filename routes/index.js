var log4js = require('log4js');
var logger = log4js.getLogger('OekakiChat');
var db = require('../sockets/db.js');
var chatapp = require('../sockets/app.js');

//------------------------------
// 定数
//------------------------------

var APP_TITLE = 'お絵かきチャット';

var TYPE_UNDEFINED = 'undefined';

var NAME_LENGTH_LIMIT = chatapp.NAME_LENGTH_LIMIT;
var WIDTH_MIN         = chatapp.WIDTH_MIN;
var WIDTH_MAX         = chatapp.WIDTH_MAX;
var HEIGHT_MIN        = chatapp.HEIGHT_MIN;
var HEIGHT_MAX        = chatapp.HEIGHT_MAX;

var MESSAGE_LENGTH_MAX = chatapp.MESSAGE_LENGTH_MAX;

var ITEMS_PER_LOG_PAGE = 20;

// エラーメッセージ
var msgSystemError      = '(´・ω・｀)システムエラー';
var msgInvalidUrl       = '(´・ω・｀)不正なURL';
var msgRoomNotExists    = '(´・ω・｀)存在しない部屋';
var msgChatNotAvailable = '(´・ω・｀)お絵かきチャット停止中';
var msgLogNotAvailable  = '(´・ω・｀)ログ閲覧停止中';

//------------------------------
// routing
//------------------------------

exports.index = function (req, res) {
    'use strict';

    res.render('index', {
        title:         APP_TITLE,
        nameLengthMax: NAME_LENGTH_LIMIT,
        widthMin:      WIDTH_MIN,
        widthMax:      WIDTH_MAX,
        heightMin:     HEIGHT_MIN,
        heightMax:     HEIGHT_MAX,
    });
};

exports.room = function (req, res) {
    'use strict';

    var id = req.params.id;

    if (isUndefinedOrNull(id) ||
        id.length !== 32) {
        res.status(400).render('error', {
            title:   APP_TITLE,
            message: msgInvalidUrl,
        });
        return;
    }

    var query = db.Room.findOne({ roomId: id });
    query.exec(function (err, doc) {
        if (err) {
            logger.error(err);
            res.status(500).render('error', {
                title:   APP_TITLE,
                message: msgSystemError,
            });
            return;
        }

        if (!doc) {
            logger.warn('room not exists : ' + id);
            res.status(404).render('error', {
                title:   APP_TITLE,
                message: msgRoomNotExists,
            });
            return;
        }

        if (!doc.isChatAvailable) {
            logger.warn('chat not available : ' + id);
            res.status(403).render('error', {
                title:   APP_TITLE,
                message: msgChatNotAvailable,
            });
        }

        res.render('room', {
            title:            doc.name + ' - ' + APP_TITLE,
            id:               id,
            width:            doc.width,
            height:           doc.height,
            messageLengthMax: MESSAGE_LENGTH_MAX,
        });
    });
};

exports.log = function (req, res) {
    'use strict';

    var id = req.params.id;
    var page = req.params.page;

    if (isUndefinedOrNull(id)   || id.length !== 32 ||
        isUndefinedOrNull(page) || !page.match(/^[1-9][0-9]*$/)) {
        res.status(400).render('error', {
            title:   APP_TITLE,
            message: msgInvalidUrl,
        });
        return;
    }

    var query = db.Room.findOne({ roomId: id });
    query.exec(function (err, roomDoc) {
        if (err) {
            logger.error(err);
            res.status(500).render('error', {
                title:   APP_TITLE,
                message: msgSystemError,
            });
            return;
        }

        if (!roomDoc) {
            logger.warn('room not exists : ' + id);
            res.status(404).render('error', {
                title:   APP_TITLE,
                message: msgRoomNotExists,
            });
            return;
        }

        if (!roomDoc.isLogAvailable) {
            logger.warn('log not available : ' + id);
            res.status(403).render('error', {
                title:   APP_TITLE,
                message: msgLogNotAvailable,
            });
        }

        var query = db.Log.find({ roomId: id, isDeleted: false }).sort({ fileName: 'desc' });
        query.exec(function (err, logDocs) {
            if (err) {
                logger.error(err);
                res.status(500).render('error', {
                    title:   APP_TITLE,
                    message: msgSystemError,
                });
                return;
            }

            var totalPageCount = Math.ceil(logDocs.length / ITEMS_PER_LOG_PAGE);
            if (page < 1 || totalPageCount < page) {
                res.status(400).render('error', {
                    title:   APP_TITLE,
                    message: msgInvalidUrl,
                });
                return;
            }

            var fileList = logDocs.map(function (x) { return x.fileName });

            // ページング処理
            var startIndex = ITEMS_PER_LOG_PAGE * (page - 1);
            var endIndex = page == totalPageCount ? fileList.length : ITEMS_PER_LOG_PAGE * page;
            var dispFileList = fileList.slice(startIndex, endIndex);

            res.render('log', {
                title:          roomDoc.name + ' - ' + APP_TITLE,
                name:           roomDoc.name,
                files:          dispFileList,
                page:           page,
                totalPageCount: totalPageCount,
            });
        });
    });
};

/**
 * 部屋設定変更
 */
exports.config = function (req, res) {
    res.render('config', { title: APP_TITLE, id: req.params.id, page: req.params.page });
};

/**
 * ヘルプ
 */
exports.help = function (req, res) {
    'use strict';

    res.render('help', { title: APP_TITLE });
};

//------------------------------
// 関数
//------------------------------

/**
 * nullとundefinedのチェック
 */
function isUndefinedOrNull(data) {
    'use strict';

    return typeof data === TYPE_UNDEFINED || data === null;
}
