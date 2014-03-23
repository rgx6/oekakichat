var fs = require('fs');
var uuid = require('node-uuid');
var log4js = require('log4js');
var logger = log4js.getLogger('OekakiChat');
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
            return callback({ result: RESULT_BAD_PARAM });
        }

        var name = data.name.trim();
        if (!checkParamLength(name, 1, NAME_LENGTH_LIMIT)     ||
            !checkParamSize(data.width, WIDTH_MIN, WIDTH_MAX) ||
            !checkParamSize(data.height, HEIGHT_MIN, HEIGHT_MAX)) {
            logger.warn('create room : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            return callback({ result: RESULT_BAD_PARAM });
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
                return callback({ result: RESULT_SYSTEM_ERROR });
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
            return callback({ result: RESULT_BAD_PARAM });
        }

        var query = db.Room.where({ roomId: id });
        query.findOne(function (err, doc) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            if (isUndefinedOrNull(doc)) {
                logger.warn('enter room : ' + client.id + ' : ' + RESULT_ROOM_NOT_EXISTS);
                return callback({ result: RESULT_ROOM_NOT_EXISTS });
            }

            if (!doc.isChatAvailable) {
                logger.warn('enter room : ' + client.id + ' : ' + RESULT_ROOM_NOT_AVAILABLE);
                return callback({ result: RESULT_ROOM_NOT_AVAILABLE });
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

            callback({
                result:   RESULT_OK,
                imageLog: room.imageLog,
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

        rooms[id].storeImage(data);
        client.broadcast.to(id).emit('push image', data);
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
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) {
            return callback({ result: RESULT_SYSTEM_ERROR });
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
                return callback({ result: RESULT_SYSTEM_ERROR });
            }
            id = _id;
        });

        if (isUndefinedOrNull(rooms[id])) {
            return callback({ result: RESULT_SYSTEM_ERROR });
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
            return callback({ result: RESULT_BAD_PARAM });
        }

        // todo : PNGフォーマットチェック

        var fileName = new Date().getTime();

        // 原寸の画像を保存
        var buf = new Buffer(data.png, 'base64');
        var path = './public/log/' + fileName + '.png';
        fs.writeFile(path, buf, function (err) {
            if (err) {
                logger.error(err);
                return callback({ result: RESULT_SYSTEM_ERROR });
            }

            // サムネイル画像を保存
            buf = new Buffer(data.thumbnailPng, 'base64');
            path = './public/log/thumb/' + fileName + '.thumb.png';
            fs.writeFile(path, buf, function (err) {
                if (err) {
                    logger.error(err);
                    return callback({ result: RESULT_SYSTEM_ERROR });
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
                        return callback({ result: RESULT_SYSTEM_ERROR });
                    }

                    if (clearFlag) {
                        rooms[id].deleteImage();
                        server.sockets.to(id).emit('push clear canvas');
                        return callback({ result: RESULT_OK });
                    } else {
                        return callback({ result: RESULT_OK });
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

    // hack : 抜けている文字がないかチェック
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * nullとundefinedのチェック
 */
function isUndefinedOrNull(data) {
    'use strict';

    return typeof data === TYPE_UNDEFINED || data === null;
}

/**
 * 文字数のチェック
 */
function checkParamLength(data, minLength, maxLength) {
    'use strict';

    return minLength <= data.length && data.length <= maxLength;
}

/**
 * 範囲のチェック
 */
function checkParamSize(data, minSize, maxSize) {
    'use strict';

    return minSize <= data && data <= maxSize;
}
