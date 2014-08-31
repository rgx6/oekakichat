var fs = require('fs');
var uuid = require('node-uuid');
var log4js = require('log4js');
var logger = log4js.getLogger('appLog');
var Promise  = require('es6-promise').Promise;
var server = require('../server.js');
var db = require('./db.js');
var Room = require('./Room.js').Room;

var RESULT_OK                 = 'ok';
var RESULT_BAD_PARAM          = 'bad param';
var RESULT_SYSTEM_ERROR       = 'system error';
var RESULT_ROOM_NOT_EXISTS    = 'room not exists';
var RESULT_ROOM_NOT_AVAILABLE = 'room not available';

var KEY_ID = 'id';

var TYPE_UNDEFINED = 'undefined';
var TYPE_BOOLEAN   = 'boolean';

var NAME_LENGTH_LIMIT = exports.NAME_LENGTH_LIMIT = 30;
var WIDTH_MIN         = exports.WIDTH_MIN         = 600;
var WIDTH_MAX         = exports.WIDTH_MAX         = 2000;
var HEIGHT_MIN        = exports.HEIGHT_MIN        = 300;
var HEIGHT_MAX        = exports.HEIGHT_MAX        = 2000;

var CHAT_LOG_LIMIT_PER_REQUEST = 50;

var MESSAGE_LENGTH_MAX = exports.MESSAGE_LENGTH_MAX = 100;

var LOGGER_INTERVAL_SECOND = 20;

var rooms = {};

var globalUserCount = 0;
var roomsUserCount = 0;

var performanceLogger = setInterval(function () {
    logger.info('connectionCount: ' + globalUserCount + ', memoryUsage: ' + JSON.stringify(process.memoryUsage()));
}, LOGGER_INTERVAL_SECOND * 1000);

// サンプル作成
db.Room.update({
    roomId: '00000000000000000000000000000000'
}, {
    $setOnInsert: {
        roomId:          '00000000000000000000000000000000',
        configId:        null,
        name:            'サンプル',
        width:           WIDTH_MIN,
        height:          HEIGHT_MIN,
        isChatAvailable: true,
        isLogAvailable:  true,
        isLogOpen:       false,
        registeredTime:  new Date(),
        updatedTime:     new Date(),
    }
}, { upsert: true },
function (err, numberAffected) {
    if (err) {
        logger.error(err);
        return;
    }
});

exports.onConnection = function (client) {
    'use strict';
    logger.debug('connected : ' + client.id);

    client.emit('connected');
    globalUserCount += 1;

    /**
     * 部屋登録受付
     */
    client.on('create room', function (data, callback) {
        'use strict';
        logger.debug('create room : ' + client.id);

        if (isUndefinedOrNull(data)           ||
            isUndefinedOrNull(data.name)      ||
            isUndefinedOrNull(data.width)     || isNaN(data.width)  ||
            isUndefinedOrNull(data.height)    || isNaN(data.height) ||
            isUndefinedOrNull(data.isLogOpen) || typeof data.isLogOpen !== TYPE_BOOLEAN) {
            logger.warn('create room : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var name = data.name.trim();
        if (!checkParamLength(name, 1, NAME_LENGTH_LIMIT)     ||
            !checkParamSize(data.width, WIDTH_MIN, WIDTH_MAX) ||
            !checkParamSize(data.height, HEIGHT_MIN, HEIGHT_MAX)) {
            logger.warn('create room : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var roomId   = uuid.v4().replace(/-/g, '');
        var configId = uuid.v4().replace(/-/g, '');

        var room = new db.Room();
        room.roomId          = roomId;
        room.configId        = configId;
        room.name            = name;
        room.width           = data.width;
        room.height          = data.height;
        room.isChatAvailable = true;
        room.isLogAvailable  = true;
        room.isLogOpen       = data.isLogOpen;
        room.registeredTime  = new Date();
        room.updatedTime     = new Date();
        room.save(function (err, doc) {
            if (err) {
                logger.error(err);
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }

            callback({
                result:   RESULT_OK,
                roomId:   doc.roomId,
                configId: doc.configId,
                width:    doc.width,
                height:   doc.height,
            });
        });
    });

    /**
     * 部屋入室受付
     */
    client.on('enter room', function (id, callback) {
        'use strict';
        logger.debug('enter room : ' + client.id);

        if (isUndefinedOrNull(id)) {
            logger.warn('enter room : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var query = db.Room.where({ roomId: id });
        query.findOne(function (err, doc) {
            if (err) {
                logger.error(err);
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }

            if (isUndefinedOrNull(doc)) {
                logger.warn('enter room : ' + client.id + ' : ' + RESULT_ROOM_NOT_EXISTS);
                callback({ result: RESULT_ROOM_NOT_EXISTS });
                return;
            }

            if (!doc.isChatAvailable) {
                logger.warn('enter room : ' + client.id + ' : ' + RESULT_ROOM_NOT_AVAILABLE);
                callback({ result: RESULT_ROOM_NOT_AVAILABLE });
                return;
            }

            if (isUndefinedOrNull(rooms[id])) {
                rooms[id] = new Room(id);
            }

            var room = rooms[id];

            client.set(KEY_ID, id);
            client.join(id);

            room.userCount += 1;
            roomsUserCount += 1;
            updateUserCount(id);

            // チャットログ
            var messages = [];
            var query = db.Chat.find({ roomId: id, isDeleted: false })
                    .select({ message: 1, registeredTime: 1 })
                    .limit(CHAT_LOG_LIMIT_PER_REQUEST)
                    .sort({ registeredTime: 'desc' });
            query.exec(function (err, docs) {
                if (err) {
                    logger.error(err);
                    callback({ result: RESULT_SYSTEM_ERROR });
                    return;
                }
                docs.forEach(function (doc) {
                    messages.push({ message: doc.message, time: doc.registeredTime });
                });

                callback({
                    result:   RESULT_OK,
                    imageLog: room.imageLog,
                    messages: messages,
                });
            });
        });
    });

    /**
     * 描画データ受付
     */
    client.on('send image', function (data) {
        'use strict';
        logger.trace('send image : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) { return; }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) return;

        // hack : お絵かきデータのフォーマットの破壊的な変更を行ったため一時的にチェックを追加した
        // 再接続無効の変更がクライアントに行き渡れば以降は不要に
        if (isUndefinedOrNull(data[0].mode)) return;

        rooms[id].storeImage(data);
        client.broadcast.to(id).emit('push image', data);
    });

    /**
     * チャットデータ受付
     */
    client.on('send message', function (data, callback) {
        'use strict';
        logger.trace('send message : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) { return; }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) return;

        if (isUndefinedOrNull(data) ||
            !checkParamLength(data.trim(), 1, MESSAGE_LENGTH_MAX)) {
            logger.warn('send message : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var message = data.trim();

        var now = new Date();
        var chat = new db.Chat();
        chat.roomId         = id;
        chat.message        = message;
        chat.registeredTime = now;
        chat.isDeleted      = false;
        chat.save(function (err, doc) {
            if (err) {
                logger.error(err);
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }

            callback({ result: RESULT_OK });
            server.sockets.to(id).emit('push message', { message: message, time: now });
            return;
        });
    });

    /**
     * チャットデータリクエスト
     */
    client.on('request message', function (data, callback) {
        'use strict';
        // logger.debug('request message : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) { return; }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) return;

        if (isUndefinedOrNull(data) ||
            isNaN(Date.parse(data))) {
            logger.warn('request message : ' + client.id + ' : ' + RESULT_BAD_PARAM + ' : ' + data);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var messages = [];
        var query = db.Chat.find({ roomId: id, isDeleted: false, registeredTime: { $lt: data } })
                .select({ message: 1, registeredTime: 1 })
                .limit(CHAT_LOG_LIMIT_PER_REQUEST)
                .sort({ registeredTime: 'desc' });
        query.exec(function (err, docs) {
            if (err) {
                logger.error(err);
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }
            docs.forEach(function (doc) {
                messages.push({ message: doc.message, time: doc.registeredTime });
            });

            callback({
                result:   RESULT_OK,
                messages: messages,
            });
        });
    });

    /**
     * Canvasを保存してクリア
     */
    client.on('clear canvas', function (data, callback) {
        'use strict';
        logger.debug('clear canvas : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) {
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        saveImage(id, data, true, callback);
    });

    /**
     * Canvasを保存
     */
    client.on('save canvas', function (data, callback) {
        'use strict';
        logger.debug('save canvas : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) {
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        saveImage(id, data, false, callback);
    });

    /**
     * socket切断時の処理
     */
    client.on('disconnect', function() {
        'use strict';
        logger.debug('disconnect : ' + client.id);

        var id;
        client.get(KEY_ID, function (err, _id) {
            if (err || !_id) { return; }
            id = _id;
        });

        globalUserCount -= 1;

        if (isUndefinedOrNull(rooms[id])) return;
        rooms[id].userCount -= 1;
        roomsUserCount -= 1;
        updateUserCount(id);
    });

    //------------------------------
    // メソッド定義
    //------------------------------

    /**
     * 接続数更新
     */
    function updateUserCount (id) {
        'use strict';
        logger.debug('updateUserCount');

        server.sockets.to(id).emit('update user count', rooms[id].userCount);
        server.sockets.emit('update rooms user count', roomsUserCount);
    }

    /**
     * 画像をファイルに保存する関数
     */
    function saveImage (id, data, clearFlag, callback) {
        'use strict';
        logger.debug('saveImage');

        if (isUndefinedOrNull(data) ||
            isUndefinedOrNull(data.png) ||
            isUndefinedOrNull(data.thumbnailPng)) {
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        // todo : PNGフォーマットチェック

        var fileName = new Date().getTime();

        // 原寸の画像を保存
        var buf = new Buffer(data.png, 'base64');
        var path = './public/log/' + fileName + '.png';
        fs.writeFile(path, buf, function (err) {
            if (err) {
                logger.error(err);
                callback({ result: RESULT_SYSTEM_ERROR });
                return;
            }

            // サムネイル画像を保存
            buf = new Buffer(data.thumbnailPng, 'base64');
            path = './public/log/thumb/' + fileName + '.thumb.png';
            fs.writeFile(path, buf, function (err) {
                if (err) {
                    logger.error(err);
                    callback({ result: RESULT_SYSTEM_ERROR });
                    return;
                }

                var log = new db.Log();
                log.roomId         = id;
                log.fileName       = fileName;
                log.isDeleted      = false;
                log.registeredTime = new Date();
                log.updatedTime    = new Date();
                log.save(function (err, doc) {
                    if (err) {
                        logger.error(err);
                        callback({ result: RESULT_SYSTEM_ERROR });
                        return;
                    }

                    if (clearFlag) {
                        rooms[id].deleteImage();
                        server.sockets.to(id).emit('push clear canvas');
                        callback({ result: RESULT_OK });
                        return;
                    } else {
                        callback({ result: RESULT_OK });
                        return;
                    }
                });
            });
        });
    }
};

//------------------------------
// メソッド定義
//------------------------------

/**
 * HTMLエスケープ処理
 */
function escapeHTML (str) {
    'use strict';
    logger.debug('escapeHTML');

    // hack : 抜けている文字がないかチェック
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * nullとundefinedのチェック
 */
function isUndefinedOrNull (data) {
    'use strict';
    logger.debug('isUndefinedOrNull');

    return typeof data === TYPE_UNDEFINED || data === null;
}

/**
 * 文字数のチェック
 */
function checkParamLength (data, minLength, maxLength) {
    'use strict';
    logger.debug('checkParamLength');

    return minLength <= data.length && data.length <= maxLength;
}

/**
 * 範囲のチェック
 */
function checkParamSize (data, minSize, maxSize) {
    'use strict';
    logger.debug('checkParamSize');

    return minSize <= data && data <= maxSize;
}
