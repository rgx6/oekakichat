var fs      = require('fs');
var uuid    = require('node-uuid');
var log4js  = require('log4js');
var logger  = log4js.getLogger('appLog');
var Promise = require('es6-promise').Promise;
var notp    = require('notp');
var server  = require('../server.js');
var db      = require('./db.js');
var Room    = require('./Room.js').Room;
var config  = require('../configuration.js');

var RESULT_OK                 = 'ok';
var RESULT_BAD_PARAM          = 'bad param';
var RESULT_SYSTEM_ERROR       = 'system error';
var RESULT_ROOM_NOT_EXISTS    = 'room not exists';
var RESULT_ROOM_NOT_AVAILABLE = 'room not available';
var RESULT_ROOM_INITIALIZING  = 'room initializing';
var RESULT_ROOM_IS_ACTIVE     = 'room is active';

var TYPE_UNDEFINED = 'undefined';
var TYPE_BOOLEAN   = 'boolean';

var NAME_LENGTH_LIMIT = exports.NAME_LENGTH_LIMIT = 30;
var WIDTH_MIN         = exports.WIDTH_MIN         = 600;
var WIDTH_MAX         = exports.WIDTH_MAX         = 2000;
var HEIGHT_MIN        = exports.HEIGHT_MIN        = 300;
var HEIGHT_MAX        = exports.HEIGHT_MAX        = 2000;

var CHAT_LOG_LIMIT_PER_REQUEST = 50;

var MESSAGE_LENGTH_MAX = exports.MESSAGE_LENGTH_MAX = 100;

var adminClientId = '';

var rooms = {};

var globalUserCount = 0;
var roomsUserCount = 0;

// サンプル作成
db.Room.updateOne({
    roomId: '00000000000000000000000000000000'
}, {
    $setOnInsert: {
        roomId:              '00000000000000000000000000000000',
        configId:            uuid.v4().replace(/-/g, ''),
        name:                'サンプル',
        width:               WIDTH_MIN,
        height:              HEIGHT_MIN,
        isChatAvailable:     true,
        isTextChatAvailable: true,
        isLogAvailable:      true,
        isLogOpen:           false,
        registeredTime:      new Date(),
        updatedTime:         new Date(),
    }
}, { upsert: true }).then((numberAffected) => {}).catch((err) => {
    logger.error(err);
    return;
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
            isUndefinedOrNull(data.height)    || isNaN(data.height)) {
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
        room.roomId              = roomId;
        room.configId            = configId;
        room.name                = name;
        room.width               = data.width;
        room.height              = data.height;
        room.isChatAvailable     = true;
        room.isTextChatAvailable = true;
        room.isLogAvailable      = true;
        room.isLogOpen           = false;
        room.registeredTime      = new Date();
        room.updatedTime         = new Date();
        room.save().then((doc) => {
            callback({
                result:   RESULT_OK,
                roomId:   doc.roomId,
                configId: doc.configId,
                width:    doc.width,
                height:   doc.height,
            });
        })
        .catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
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
        query.findOne().then((doc) => {
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

            new Promise(function (resolve, reject) {
                if (!isUndefinedOrNull(rooms[id])) {
                    if (rooms[id].isInitialized) {
                        resolve();
                    } else {
                        logger.warn('enter room initializing');
                        callback({ result: RESULT_ROOM_INITIALIZING });
                        reject(new Error('enter room initializing'));
                    }
                    return;
                }

                rooms[id] = new Room(id, doc.name, doc.isTextChatAvailable);

                var q = db.TemporaryLog
                    .findOne({ roomId: id, isDeleted: false })
                    .select({ log: 1 });
                q.exec().then((doc) => {
                    if (doc) {
                        rooms[id].imageLog = doc.log;
                    }

                    rooms[id].isInitialized = true;
                    resolve();
                    return;
                }).catch((err) => {
                    delete rooms[id];
                    logger.error(err);
                    callback({ result: RESULT_SYSTEM_ERROR });
                    reject(new Error('TemporaryLog findOne failed'));
                    return;
                });
            }).then(function () {
                var room = rooms[id];

                client.roomId = id;
                client.join(id);

                room.userCount += 1;
                roomsUserCount += 1;
                updateUserCount(id);

                if (!room.isTextChatAvailable) {
                    callback({
                        result:              RESULT_OK,
                        roomId:              room.id,
                        name:                room.name,
                        isTextChatAvailable: room.isTextChatAvailable,
                        imageLog:            room.imageLog,
                    });
                    return;
                }

                // todo : 接続後に改めてclientからrequestさせる？
                // チャットログ
                var messages = [];
                var query = db.Chat
                        .find({ roomId: id, isDeleted: false })
                        .select({ message: 1, registeredTime: 1 })
                        .limit(CHAT_LOG_LIMIT_PER_REQUEST)
                        .sort({ registeredTime: 'desc' });
                query.exec().then((docs) => {
                    docs.forEach(function (doc) {
                        messages.push({ message: doc.message, time: doc.registeredTime });
                    });

                    callback({
                        result:              RESULT_OK,
                        roomId:              room.id,
                        name:                room.name,
                        isTextChatAvailable: room.isTextChatAvailable,
                        imageLog:            room.imageLog,
                        messages:            messages,
                    });
                }).catch((err) => {
                    logger.error(err);
                    callback({ result: RESULT_SYSTEM_ERROR });
                    return;
                });
            });
        }).catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        });
    });

    /**
     * 描画データ受付
     */
    client.on('send image', function (data) {
        'use strict';
        logger.trace('send image : ' + client.id);

        var id = client.roomId;

        if (isUndefinedOrNull(id)) return;

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

        var id = client.roomId;

        if (isUndefinedOrNull(id)) return;

        if (isUndefinedOrNull(rooms[id])) return;

        if (!rooms[id].isTextChatAvailable) return;

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
        chat.save().then((doc) => {
            callback({ result: RESULT_OK });
            server.sockets.to(id).emit('push message', { message: message, time: now });
            return;
        }).catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        });
    });

    /**
     * チャットデータリクエスト
     */
    client.on('request message', function (data, callback) {
        'use strict';
        // logger.debug('request message : ' + client.id);

        var id = client.roomId;

        if (isUndefinedOrNull(id)) return;

        if (isUndefinedOrNull(rooms[id])) return;

        if (!rooms[id].isTextChatAvailable) return;

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
        query.exec().then((docs) => {
            docs.forEach(function (doc) {
                messages.push({ message: doc.message, time: doc.registeredTime });
            });

            callback({
                result:   RESULT_OK,
                messages: messages,
            });
        }).catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        });
    });

    /**
     * Canvasを保存してクリア
     */
    client.on('clear canvas', function (data, callback) {
        'use strict';
        logger.debug('clear canvas : ' + client.id);

        var id = client.roomId;

        if (isUndefinedOrNull(id)) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        if (isUndefinedOrNull(rooms[id])) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        saveImage(id, data)
            .then(deleteTemporaryLog)
            .then(function () {
                rooms[id].deleteImage();
                server.sockets.to(id).emit('push clear canvas');
                callback({ result: RESULT_OK });
            })
            .catch(function () {
                callback({ result: RESULT_SYSTEM_ERROR });
            });
    });

    /**
     * Canvasを保存
     */
    client.on('save canvas', function (data, callback) {
        'use strict';
        logger.debug('save canvas : ' + client.id);

        var id = client.roomId;

        if (isUndefinedOrNull(id)) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        if (isUndefinedOrNull(rooms[id])) {
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        }

        saveImage(id, data)
            .then(function () {
                callback({ result: RESULT_OK });
            })
            .catch(function () {
                callback({ result: RESULT_SYSTEM_ERROR });
            });
    });

    /**
     * socket切断時の処理
     */
    client.on('disconnect', function() {
        'use strict';
        logger.debug('disconnect : ' + client.id);

        globalUserCount -= 1;

        if (adminClientId === client.id) {
            adminClientId = '';
            return;
        }

        var id = client.roomId;

        if (isUndefinedOrNull(id)) return;

        if (isUndefinedOrNull(rooms[id])) return;
        rooms[id].userCount -= 1;
        roomsUserCount -= 1;
        updateUserCount(id);
    });

    /**
     * 設定ページ 初期化
     */
    client.on('enter config', function (configId, callback) {
        'use strict';
        logger.debug('enter config : ' + client.id);

        if (isUndefinedOrNull(configId)) {
            logger.warn('enter config : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var query = db.Room.where({ configId: configId });
        query.findOne().then((doc) => {
            if (isUndefinedOrNull(doc)) {
                logger.warn('enter config : ' + client.id + ' : ' + RESULT_ROOM_NOT_EXISTS);
                callback({ result: RESULT_ROOM_NOT_EXISTS });
                return;
            }

            callback({
                result:              RESULT_OK,
                roomId:              doc.roomId,
                name:                doc.name,
                width:               doc.width,
                height:              doc.height,
                isChatAvailable:     doc.isChatAvailable,
                isTextChatAvailable: doc.isTextChatAvailable,
                isLogAvailable:      doc.isLogAvailable,
                isLogOpen:           doc.isLogOpen,
            });
        }).catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        });
    });

    /**
     * 設定ページ 更新
     */
    client.on('update config', function (data, callback) {
        'use strict';
        logger.debug('update config : ' + client.id);

        if (isUndefinedOrNull(data)           ||
            isUndefinedOrNull(data.roomId)    ||
            isUndefinedOrNull(data.configId)  ||
            isUndefinedOrNull(data.name)      ||
            isUndefinedOrNull(data.width)     || isNaN(data.width)  ||
            isUndefinedOrNull(data.height)    || isNaN(data.height) ||
            isUndefinedOrNull(data.isChatAvailable)     || typeof data.isChatAvailable     !== TYPE_BOOLEAN ||
            isUndefinedOrNull(data.isTextChatAvailable) || typeof data.isTextChatAvailable !== TYPE_BOOLEAN ||
            isUndefinedOrNull(data.isLogAvailable)      || typeof data.isLogAvailable      !== TYPE_BOOLEAN ||
            isUndefinedOrNull(data.isLogOpen)           || typeof data.isLogOpen           !== TYPE_BOOLEAN) {
            logger.warn('update config : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        var name = data.name.trim();
        if (!checkParamLength(name, 1, NAME_LENGTH_LIMIT)     ||
            !checkParamSize(data.width, WIDTH_MIN, WIDTH_MAX) ||
            !checkParamSize(data.height, HEIGHT_MIN, HEIGHT_MAX)) {
            logger.warn('update config : ' + client.id + ' : ' + RESULT_BAD_PARAM);
            callback({ result: RESULT_BAD_PARAM });
            return;
        }

        db.Room.updateOne({
            roomId:   data.roomId,
            configId: data.configId,
        }, {
            $set: {
                name:                name,
                width:               data.width,
                height:              data.height,
                isChatAvailable:     data.isChatAvailable,
                isTextChatAvailable: data.isTextChatAvailable,
                isLogAvailable:      data.isLogAvailable,
                isLogOpen:           data.isLogOpen,
                updatedTime:         new Date(),
            }
        }, null).then((numberAffected) => {
            if (numberAffected === 0) {
                logger.error('update config room not exists');
                callback({ result: RESULT_ROOM_NOT_EXISTS });
                return;
            }

            if (!isUndefinedOrNull(rooms[data.roomId])) {
                // todo : update成功時に設定を部屋に反映させる
                rooms[data.roomId].isTextChatAvailable = data.isTextChatAvailable;
            }

            callback({ result: RESULT_OK });
            return;
        }).catch((err) => {
            logger.error(err);
            callback({ result: RESULT_SYSTEM_ERROR });
            return;
        });
    });

    /**
     * 管理ページ 認証
     */
    client.on('admin authentication', function (password, callback) {
        'use strict';
        logger.info('admin authentication : ' + password);

        var key = config.secretKey;
        logger.debug(notp.totp.gen(key, { time: 30 }));

        if (key !== '' && notp.totp.verify(password, key, { window: 1, time: 30 })) {
            adminClientId = client.id;
            callback({ result: RESULT_OK });
        } else {
            callback({ result: RESULT_BAD_PARAM });
        }
    });

    /**
     * 管理ページ パフォーマンス取得
     */
    client.on('admin performance', function (callback) {
        'use strict';
        logger.debug('admin performance : ' + client.id);

        if (adminClientId !== client.id) {
            client.disconnect();
            return;
        }

        callback({
            connectionCount: globalUserCount,
            memoryUsage: process.memoryUsage(),
        });
    });

    /**
     * 管理ページ 部屋一覧取得
     */
    client.on('admin room list', function (callback) {
        'use strict';
        logger.debug('admin room list : ' + client.id);

        if (adminClientId !== client.id) {
            client.disconnect();
            return;
        }

        var roomList = [];
        Object.keys(rooms).forEach(function (id) {
            roomList.push({
                id: rooms[id].id,
                name: rooms[id].name,
                size: JSON.stringify(rooms[id].imageLog).length,
                userCount: rooms[id].userCount,
            });
        });
        callback(roomList);
    });

    /**
     * 管理ページ お絵かきデータ保存
     */
    client.on('admin save data', function (callback) {
        'use strict';
        logger.info('admin save data : ' + client.id);

        if (adminClientId !== client.id) {
            client.disconnect();
            return;
        }

        var result = [];
        Object.keys(rooms).reduce(function (sequence, roomid) {
            return sequence.then(function () {
                return saveTemporaryLog(roomid, result);
            });
        }, Promise.resolve()).then(function () {
            callback(result);
        });
    });

    /**
     * 管理ページ 部屋を閉じる
     */
    client.on('admin close room', function (roomId, callback) {
        'use strict';
        // logger.info('admin close room : ' + client.id);

        if (adminClientId !== client.id) {
            client.disconnect();
            return;
        }

        if (isUndefinedOrNull(rooms[roomId])) {
            callback({ result: RESULT_ROOM_NOT_EXISTS });
            return;
        }

        if (rooms[roomId].userCount > 0) {
            callback({ result: RESULT_ROOM_IS_ACTIVE });
            return;
        }

        var result = [];
        saveTemporaryLog(roomId, result).then(function () {
            if (result.length > 0 &&
                (result[0].indexOf('saved') != -1 || result[0].indexOf('no data') != -1)) {
                delete rooms[roomId];
                callback({ result: RESULT_OK });
            } else {
                callback({ result: RESULT_SYSTEM_ERROR });
            }
        });
    });
};

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
}

/**
 * 画像をファイルに保存する関数
 */
function saveImage (id, data) {
    'use strict';
    logger.debug('saveImage');

    return new Promise(function (resolve, reject) {
        if (isUndefinedOrNull(data) ||
            isUndefinedOrNull(data.png) ||
            isUndefinedOrNull(data.thumbnailPng)) {
            logger.warn('save image bad param');
            reject(new Error('bad param'));
            return;
        }

        // todo : PNGフォーマットチェック

        var fileName = new Date().getTime();

        // 原寸の画像を保存
        var buf = Buffer.from(data.png, 'base64');
        var path = './public/log/' + fileName + '.png';
        fs.writeFile(path, buf, function (err) {
            if (err) {
                logger.error(err);
                reject(new Error('save image failed'));
                return;
            }

            // サムネイル画像を保存
            buf = Buffer.from(data.thumbnailPng, 'base64');
            path = './public/log/thumb/' + fileName + '.thumb.png';
            fs.writeFile(path, buf, function (err) {
                if (err) {
                    logger.error(err);
                    reject(new Error('save thumbnail image failed'));
                    return;
                }

                var log = new db.Log();
                log.roomId         = id;
                log.fileName       = fileName;
                log.isDeleted      = false;
                log.registeredTime = new Date();
                log.updatedTime    = new Date();
                log.save().then((doc) => {
                    resolve(id);
                    return;
                }).catch((err) => {
                    logger.error(err);
                    reject(new Error('save image log failed'));
                    return;
                });
            });
        });
    });
}

/**
 * 一時お絵かきデータを無効化する
 */
function deleteTemporaryLog (id) {
    'use strict';
    logger.debug('deleteTemporaryLog : ' + id);

    return new Promise(function (resolve, reject) {
        db.TemporaryLog.updateOne({
            roomId: id,
            isDeleted: false,
        }, {
            $set: {
                updatedTime: new Date(),
                isDeleted: true,
            }
        }, {
            multi: true
        }).then((numberAffected) => {
            resolve();
            return;
        }).catch((err) => {
            logger.error(err);
            reject(new Error('delete temporary log failed'));
            return;
        });
    });
}

/**
 * 一時お絵かきデータを保存する
 * エラーでもrejectせず処理を続ける
 */
function saveTemporaryLog (id, result) {
    'use strict';
    logger.debug('saveTemporaryLog : ' + id);

    return new Promise(function (resolve, reject) {
        db.TemporaryLog.updateOne({
            roomId: id,
            isDeleted: false,
        }, {
            $set: {
                updatedTime: new Date(),
                isDeleted: true,
            }
        }, {
            multi: true
        }).then((numberAffected) => {
            if (rooms[id].imageLog.length === 0) {
                result.push(id + ' : no data');
                resolve();
                return;
            }

            var log = new db.TemporaryLog();
            log.roomId         = id;
            log.log            = rooms[id].imageLog;
            log.registeredTime = new Date();
            log.updatedTime    = new Date();
            log.isDeleted      = false;
            log.save().then((doc) => {
                result.push(id + ' : saved');
                resolve();
                return;
            }).catch((err) => {
                logger.error(err);
                result.push(id + ' : save failed');
                resolve();
                return;
            });
        }).catch((err) => {
            logger.error(err);
            result.push(id + ' : update failed');
            resolve();
            return;
        });
    });
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
