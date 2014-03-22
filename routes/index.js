var server = require('../server.js');
var chatapp = require('../sockets/app.js');

// タイトル
var appTitle = 'お絵かきチャット';

// 定数
var nameMax = chatapp.nameLengthLimit;
var widthMin = chatapp.widthMin;
var widthMax = chatapp.widthMax;
var heightMin = chatapp.heightMin;
var heightMax = chatapp.heightMax;

// エラーメッセージ
var msgSystemError = 'システムエラー(´・ω・｀)';
var msgInvalidUrl = 'そんなページないよ(´・ω・｀)';
var msgRoomNotExist = 'そんな部屋ないよ(´・ω・｀)';
var msgRoomDisabled = 'お絵かきチャット停止中(´・ω・｀)';
var msgLogDisabled = 'ログ閲覧停止中(´・ω・｀)';

/**
 * routing
 */

/**
 * トップページ
 */
exports.index = function (req, res) {
    'use strict';

    res.render('index', {
        title:     appTitle,
        nameMax:   nameMax,
        widthMin:  widthMin,
        widthMax:  widthMax,
        heightMin: heightMin,
        heightMax: heightMax });
};

/**
 * 部屋
 */
exports.room = function (req, res) {
    'use strict';
    
    // ID Validation Check
    if (typeof req.params.id === 'undefined' ||
        req.params.id === null ||
        req.params.id.length !== 32) {
        res.render('error', { title: appTitle, message: msgInvalidUrl });
        return;
    }
    
    // 部屋情報取得
    server.db.rooms.find({ id: req.params.id }, function (err, docs) {
        // 取得失敗
        if (err !== null) {
            console.log(err);
            res.render('error', { title: appTitle, message: msgSystemError });
            return;
        }
        // 存在しない
        if (docs.length === 0) {
            res.render('error', { title: appTitle, message: msgRoomNotExist });
            return;
        }
        // 利用不可
        if (!docs[0].isChatEnabled) {
            res.render('error', { title: appTitle, message: msgRoomDisabled });
            return;
        }
        
        res.render('room', {
            title:  docs[0].name + ' - ' + appTitle,
            id:     req.params.id,
            width:  docs[0].width - 0,
            height: docs[0].height - 0
        });
    });
};

/**
 * ログ
 */
exports.log = function (req, res) {
    'use strict';
    
    // ID Validation Check
    if (typeof req.params.id === 'undefined' ||
        req.params.id === null ||
        req.params.id.length !== 32) {
        res.render('error', { title: appTitle, message: msgInvalidUrl });
        return;
    }
    // ページ指定チェック
    if (typeof req.params.page === 'undefined' ||
        req.params.page === null ||
        !req.params.page.match(/^[1-9][0-9]*$/)) {
            res.render('error', { title: appTitle, message: msgInvalidUrl });
    }
    
    // 部屋情報取得
    server.db.rooms.find({ id: req.params.id }, function (err, docs) {
        // 取得失敗
        if (err !== null) {
            console.log(err);
            res.render('error', { title: appTitle, message: msgSystemError });
            return;
        }
        // 存在しない
        if (docs.length === 0) {
            res.render('error', { title: appTitle, message: msgRoomNotExist });
            return;
        }
        // 利用不可
        if (!docs[0].isLogEnabled) {
            res.render('error', { title: appTitle, message: msgLogDisabled });
            return;
        }
        
        var roomName = docs[0].name;
        
        // ログ情報取得
        server.db.logs.find({ id: req.params.id }, function (err, docs) {
            // 取得失敗
            if (err !== null) {
                console.log(err);
                res.render('error', { title: appTitle, message: msgSystemError });
                return;
            }
            
            var itemsPerPage = 20;
            var totalPageCount = Math.ceil(docs.length / itemsPerPage);
            if (req.params.page < 1 || totalPageCount < req.params.page) {
                res.render('error', { title: appTitle, message: msgInvalidUrl });
                return;
            }
            
            var fileList = docs.map(function (x) { return x.filename });
            fileList.sort(function (a, b) {
                if (a > b) return -1;
                if (a < b) return 1;
                return 0;
            });
            
            // ページング処理
            var startIndex = itemsPerPage * (req.params.page - 1);
            var endIndex = req.params.page == totalPageCount ?
                fileList.length :
                itemsPerPage * req.params.page;
            var dispFileList = fileList.slice(startIndex, endIndex);
            
            res.render('log', {
                title:          roomName + ' - ' + appTitle,
                name:           roomName,
                files:          dispFileList,
                page:           req.params.page,
                totalPageCount: totalPageCount
            });
        });
    });
};

/**
 * 部屋設定変更
 */
exports.config = function (req, res) {
    res.render('config', { title: appTitle, id: req.params.id, page: req.params.page });
};
