var log4js  = require('log4js');
var logger  = log4js.getLogger('OekakiChat');
var db      = require('../sockets/db.js');
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

// エラーコード
var RESULT_OK                = 'ok';
var RESULT_BAD_PARAM         = 'bad param';
var RESULT_SYSTEM_ERROR      = 'system error';
var RESULT_ROOM_NOT_EXISTS   = 'room not exists';
var RESULT_LOG_NOT_AVAILABLE = 'log not available';

//------------------------------
// routing
//------------------------------

exports.set = function (appRoot, app) {
    app.get(appRoot, index);
    app.get(appRoot + 'my/', my);
    app.get(appRoot + 'admin/', admin);
    app.get(appRoot + 'help/', help);
    app.get(appRoot + 'config/:configId/', config);
    app.get(appRoot + ':id/', room);
    app.get(appRoot + ':id/log', log);
    app.get(appRoot + ':id/log/:page', log);
    app.get(appRoot + 'api/log/:id/:page', apiLog);

};

var index = function (req, res) {
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

var room = function (req, res) {
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

var log = function (req, res) {
    'use strict';

    res.render('log', {
        title: APP_TITLE
    });
};

/**
 * 部屋設定変更
 */
var config = function (req, res) {
    res.render('config', {
        title:         '設定 - ' + APP_TITLE,
        configId:      req.params.configId,
        nameLengthMax: NAME_LENGTH_LIMIT,
        widthMin:      WIDTH_MIN,
        widthMax:      WIDTH_MAX,
        heightMin:     HEIGHT_MIN,
        heightMax:     HEIGHT_MAX,
    });
};

/**
 * アドレス帳ページ
 */
var my = function (req, res) {
    res.render('my', { title: 'アドレス帳 - ' + APP_TITLE });
};

/**
 * 管理者用ページ
 */
var admin = function (req, res) {
    res.render('admin', { title: '管理ページ - ' + APP_TITLE });
};

/**
 * ヘルプ
 */
var help = function (req, res) {
    'use strict';

    res.render('help', { title: APP_TITLE });
};

var apiLog = function (req, res) {
    'use strict';

    var id = req.params.id;
    var page = req.params.page;

    if (isUndefinedOrNull(id) || id.length !== 32) {
        res.status(400).json({ result: RESULT_BAD_PARAM });
        return;
    }

    if (isUndefinedOrNull(page) || !page.match(/^[1-9][0-9]*$/)) {
        res.status(400).json({ result: RESULT_BAD_PARAM });
        return;
    }

    var query = db.Room.findOne({ roomId: id });
    query.exec(function (err, roomDoc) {
        if (err) {
            logger.error(err);
            res.status(500).json({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        if (!roomDoc) {
            logger.warn('room not exists : ' + id);
            res.status(400).json({ result: RESULT_ROOM_NOT_EXISTS });
            return;
        }

        if (!roomDoc.isLogAvailable) {
            logger.warn('log not available : ' + id);
            res.status(400).json({ result: RESULT_LOG_NOT_AVAILABLE });
            return;
        }

        var query = db.Log.count({ roomId: id, isDeleted: false });
        query.exec(function (err, count) {
            if (err) {
                logger.error(err);
                res.status(500).json({ result: RESULT_SYSTEM_ERROR });
                return;
            }

            if (count === 0) {
                res.status(200).json({
                    result: RESULT_OK,
                    files:  [],
                });
                return;
            }

            var query = db.Log
                    .find({ roomId: id, isDeleted: false })
                    .select({ fileName: 1, registeredTime: 1, _id: 0 })
                    .limit(ITEMS_PER_LOG_PAGE)
                    .skip((page - 1) * ITEMS_PER_LOG_PAGE)
                    .sort({ fileName: 'desc' });
            query.exec(function (err, logDocs) {
                if (err) {
                    logger.error(err);
                    res.status(500).json({ result: RESULT_SYSTEM_ERROR });
                    return;
                }

                res.status(200).json({
                    result:       RESULT_OK,
                    name:         roomDoc.name,
                    files:        logDocs,
                    items:        count,
                    itemsPerPage: ITEMS_PER_LOG_PAGE,
                });
            });
        });
    });
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
