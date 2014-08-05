(function () {
    // 'use strict';

    $(document).ready(function () {
        // 'use strict';

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK        = 'ok';
        var RESULT_BAD_PARAM = 'bad param';

        //------------------------------
        // 変数
        //------------------------------

        var socket;
        // お絵かきデータの定期送信用タイマーオブジェクト
        var timer;
        // お絵かきデータの送信間隔(ミリ秒)
        var setTimeoutMillisecond = 500;

        // お絵かきの変数
        // 描画する始点のX座標
        var startX;
        // 描画する始点のY座標
        var startY;
        // todo : color/widthの初期化は別の場所でやる？
        // 描画する色
        var color = '#000000';
        // 描画する線の太さ
        var drawWidth = 2;
        // ブラシ選択時の太さを保存しておく
        var drawWidthBrush = drawWidth;
        // 消しゴム選択時の太さを保存しておく
        var drawWidthEraser = drawWidth;
        // 描画中フラグ
        var drawFlag = false;
        // canvasオブジェクト
        var canvas = $('#mainCanvas').get(0);
        var cursorCanvas = $('#cursorCanvas').get(0);
        var brushCanvas = $('#brushSizeCanvas').get(0);
        // contextオブジェクト
        var context;
        var cursorContext;
        var brushContext;
        // お絵かきデータのbuffer
        var buffer = [];
        // お絵かきデータ送信用のタイマーがセットされているか
        var buffering = false;

        // 保存とクリアの連打防止
        var saveClearEnabled = true;
        var saveClearInterval = 10000;

        // 操作可否フラグ
        var isDisabled = true;

        // サムネイルのサイズ
        var thumbnailSize = 150;

        // 部屋接続数
        var userCount = 0;
        // 全体の接続数
        var roomsUserCount = 0;

        //------------------------------
        // 準備
        //------------------------------

        if (!canvas.getContext) {
            alert('ブラウザがCanvasに対応してないよ(´・ω・｀)');
            return;
        }

        context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';

        cursorContext = cursorCanvas.getContext('2d');

        brushContext = brushCanvas.getContext('2d');
        brushContext.lineCap = 'round';
        brushContext.lineJoin = 'round';

        drawBrushSize();

        // パレット選択色初期化
        changePalletSelectedBorderColor();

        // Interactive Color Picker の初期化
        fixGradientImg();
        new dragObject('arrows', 'hueBarDiv', arrowsLowBounds, arrowsUpBounds, arrowsDown, arrowsMoved, endMovement);
        new dragObject('circle', 'gradientBox', circleLowBounds, circleUpBounds, circleDown, circleMoved, endMovement);

        // serverに接続
        socket = io.connect();

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        /**
         * 入室リクエスト
         */
        socket.on('connected', function () {
            'use strict';
            // console.log('connected');

            socket.emit('enter room', getIdFromUrl(), function (res) {
                'use strict';
                // console.log('enter room callback');

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_OK) {
                    clearCanvas();
                    res.imageLog.forEach(function (data) {
                        drawData(data);
                    });
                    isDisabled = false;
                } else {
                    alert('予期しないエラーです');
                }
            });
        });

        /**
         * お絵かきデータの差分を受け取る
         */
        socket.on('push image', function (data) {
            'use strict';
            // console.log('push image');

            drawData(data);
        });

        /**
         * 部屋への接続数を受け取る
         */
        socket.on('update user count', function (data) {
            'use strict';
            // console.log('update user count');

            userCount = data;
            $('#userCount').text(userCount + '/' + roomsUserCount);
        });

        /**
         * 全体の接続数を受け取る
         */
        socket.on('update rooms user count', function (data) {
            'use strict';
            // console.log('update rooms user count');

            roomsUserCount = data;
            $('#userCount').text(userCount + '/' + roomsUserCount);
        });

        /**
         * canvasをクリアする
         */
        socket.on('push clear canvas', function () {
            'use strict';
            // console.log('push clear canvas');

            clearCanvas();
        });

        //------------------------------
        // Canvas イベントハンドラ
        //------------------------------

        /**
         * Canvas MouseDown イベント
         */
        $('#cursorCanvas').mousedown(function (e) {
            'use strict';
            // console.log('mouse down');
            e.stopPropagation();
            if (isDisabled) return;

            if ($('#spuit').is(':checked')) {
                startX = Math.round(e.pageX) - $('#mainCanvas').offset().left;
                startY = Math.round(e.pageY) - $('#mainCanvas').offset().top;
                var spuitImage = context.getImageData(startX, startY, 1, 1);
                var r = spuitImage.data[0];
                var g = spuitImage.data[1];
                var b = spuitImage.data[2];
                color = 'Rgb(' + r +','+ g + ',' + b +')';

                $('#pallet>div.selectedColor').css('background-color', color);
                changePalletSelectedBorderColor();
            } else {
                drawFlag = true;
                startX = Math.round(e.pageX) - $('#mainCanvas').offset().left;
                startY = Math.round(e.pageY) - $('#mainCanvas').offset().top;
                var c = $('#brush').is(':checked') ? color : '#ffffff';
                drawPoint(startX, startY, drawWidth, c);
                pushBuffer('point', drawWidth, c, { x: startX, y: startY });
            }
        });

        /**
         * Canvas MouseMove イベント
         */
        $('#cursorCanvas').mousemove(function (e) {
            'use strict';
            // console.log('mouse move');
            e.stopPropagation();
            if (isDisabled) return;

            if (drawFlag) {
                var endX = Math.round(e.pageX) - $('#mainCanvas').offset().left;
                var endY = Math.round(e.pageY) - $('#mainCanvas').offset().top;
                var c = $('#brush').is(':checked') ? color : '#ffffff';
                drawLine([startX, endX], [startY, endY], drawWidth, c);
                pushBuffer('line', drawWidth, c, { xs: startX, ys: startY, xe: endX, ye: endY });
                startX = endX;
                startY = endY;
            }

            // chromeで描画中にマウスカーソルがIになってしまうのでその対策
            return false;
        });

        /**
         * Canvas MouseUp イベント
         */
        $('#cursorCanvas').mouseup(function (e) {
            'use strict';
            // console.log('mouse up');
            e.stopPropagation();
            if (isDisabled) return;

            drawFlag = false;
        });

        /**
         * Canvas MouseLeave イベント
         */
        $('#cursorCanvas').mouseleave(function (e) {
            'use strict';
            // console.log('mouse leave');
            e.stopPropagation();
            if (isDisabled) return;

            drawFlag = false;
        });

        /**
         * マウスポインタの位置にペン先を表示する
         */
        $('#cursorCanvas').mousemove(function (e) {
            'use strict';
            // console.log('mouse move');
            e.stopPropagation();

            cursorContext.clearRect(0, 0, $('#cursorCanvas').width(), $('#mainCanvas').height());

            if ($('#spuit').is(':checked')) return;

            var c = $('#brush').is(':checked') ? color : '#ffffff';
            startX = Math.round(e.pageX) - $('#mainCanvas').offset().left;
            startY = Math.round(e.pageY) - $('#mainCanvas').offset().top;
            cursorContext.strokeStyle = c;
            cursorContext.fillStyle = c;
            cursorContext.beginPath();
            cursorContext.arc(startX, startY, drawWidth / 2, 0, Math.PI * 2, false);
            cursorContext.fill();
        });
        $('#cursorCanvas').mouseleave(function (e) {
            'use strict';
            // console.log('mouse leave');
            e.stopPropagation();

            cursorContext.clearRect(0, 0, $('#cursorCanvas').width(), $('#mainCanvas').height());
        });

        //------------------------------
        // その他 イベントハンドラ
        //------------------------------

        /**
         * ブラシボタンをクリック
         */
        $("#brush").on('click', function () {
            'use strict';
            // console.log('#brush click');

            drawWidth = drawWidthBrush;
            drawBrushSize();
            $('#brushSizeSlider').slider('value', drawWidth);
        });

        /**
         * 消しゴムボタンをクリック
         */
        $("#eraser").on('click', function () {
            'use strict';
            // console.log('#eraser click');

            drawWidth = drawWidthEraser;
            drawBrushSize();
            $('#brushSizeSlider').slider('value', drawWidth);
        });

        /**
         * 太さ変更
         */
        $("#brushSizeSlider").slider({
            value: drawWidth,
            min:   1,
            max:   21,
            step:  1,
            slide: function (event, ui) {
                drawWidth = ui.value;
                drawBrushSize();
                if ($('#brush').is(':checked')) {
                    drawWidthBrush = drawWidth;
                } else if ($('#eraser').is(':checked')) {
                    drawWidthEraser = drawWidth;
                }
            }
        });

        /**
         * パレットをクリックで色選択
         */
        $('#pallet>div').on('click', function (e) {
            'use strict';
            // console.log('#pallet>div click');
            e.stopPropagation();

            $('#pallet>div.selectedColor').removeClass('selectedColor');
            $(this).addClass('selectedColor');

            $('#pallet>div').css('border-color', $('#toolbar').css('background-color'));
            changePalletSelectedBorderColor();
            color = $(this).css('background-color');

            // Interactive Color Picker 表示中に色を変更した場合に元の色を同期させる
            $('.staticColorFixed').css('background-color', $(this).css('background-color'));
        });

        /**
         * パレットをダブルクリックで Interactive Color Picker を表示
         */
        $('#pallet>div').on('dblclick', function (e) {
            // 'use strict';
            // console.log('#pallet>div dblclick');
            e.stopPropagation();

            isDisabled = true;
            $('.staticColorFixed').css('background-color', $(this).css('background-color'));
            $(this).css('background-color').match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
            // $によるmatchした部分の参照は直後じゃないと正しく動作しないっぽい
            currentColor = Colors.ColorFromRGB(RegExp.$1, RegExp.$2, RegExp.$3);
            colorChanged('box');

            // Interactive Color Picker の表示位置を調整
            var left = $('#pallet').position().left + 2;
            var top = $('#pallet').height() + 3;
            $('#cp').css('left', left);
            $('#cp').css('top', top);
            // Interactive Color Picker 表示
            $('#cp').css('display', '');
        });

        /**
         * Interactive Color Picker 色を決定
         */
        $('#cpOK').on('click', function (e) {
            'use strict';
            // console.log('#cpOK click');
            e.stopPropagation();

            isDisabled = false;

            var r = parseInt($('#redBox').val(), 10);
            var g = parseInt($('#greenBox').val(), 10);
            var b = parseInt($('#blueBox').val(), 10);
            // NaNチェック
            if (r !== r || g !== g || b !== b) return;

            var red = ('0' + r.toString(16)).slice(-2);
            var green = ('0' + g.toString(16)).slice(-2);
            var blue = ('0' + b.toString(16)).slice(-2);
            color = '#' + red + green + blue;
            $('#pallet>div.selectedColor').css('background-color', color);
            changePalletSelectedBorderColor();

            // Interactive Color Picker 非表示
            $('#cp').css('display', 'none');
        });

        /**
         * Interactive Color Picker キャンセル
         */
        $('#cpCancel').on('click', function (e) {
            'use strict';
            // console.log('#cpCancel click');
            e.stopPropagation();

            isDisabled = false;

            $('#cp').css('display', 'none');
        });

        /**
         * 保存ボタンをクリック
         */
        $('#save').on('click', function (e) {
            'use strict';
            // console.log('#save click');
            e.stopPropagation();
            if (isDisabled) return;

            if (saveClearEnabled) {
                // 描画不可
                isDisabled = true;

                // 連打不可
                saveClearEnabled = false;
                setTimeout(function () {saveClearEnabled = true;}, saveClearInterval);

                // 送信
                socket.emit('save canvas', { png: getPng(), thumbnailPng: getThumbnailPng() }, function (res) {
                        'use strict';
                        // console.log('save canvas');

                        if (res.result === 'ok') {
                            alert('保存に成功しました');
                        } else {
                            alert('保存に失敗しました');
                        }
                        isDisabled = false;
                    });
            } else {
                alert('保存とクリアは' + saveClearInterval / 1000 + '秒に1回までです');
            }
        });

        /**
         * クリアボタンをクリック
         */
        $('#clear').on('click', function (e) {
            'use strict';
            // console.log('#clear click');
            e.stopPropagation();
            if (isDisabled) return;

            if (saveClearEnabled) {
                if (window.confirm(
                    '絵を保存してキャンバスをクリアしますか？\n' +
                    '他の人が描いているときは少し待って様子を見てください')) {
                    // bufferを破棄
                    buffer.length = 0;
                    buffering = false;

                    // 描画不可
                    isDisabled = true;

                    // 連打不可
                    saveClearEnabled = false;
                    setTimeout(function () {saveClearEnabled = true;}, saveClearInterval);

                    // 送信
                    socket.emit('clear canvas', { png: getPng(), thumbnailPng: getThumbnailPng() }, function (res) {
                        'use strict';
                        // console.log('clear canvas');

                        if (res.result === 'ok') {
                            // do nothing
                        } else {
                            alert('保存に失敗しました');
                        }
                        isDisabled = false;
                    });
                }
            } else {
                alert('保存とクリアは' + saveClearInterval / 1000 + '秒に1回までです');
            }
        });

        /**
         * ログボタンをクリック
         */
        $('#log').on('click', function (e) {
            'use strict';
            // console.log('#log click');
            e.stopPropagation();

            window.open('/' + getIdFromUrl() + '/log/1/');
        });

        /**
         * ヘルプボタンをクリック
         */
        $('#help').on('click', function (e) {
            'use strict';
            // console.log('#help click');
            e.stopPropagation();

            // todo : 実装
            // window.open('/#help');
        });

        //------------------------------
        // 関数
        //------------------------------

        /**
         * URLから部屋のIDを取得する
         */
        function getIdFromUrl () {
            'use strict';
            // console.log('getIdFromUrl');

            location.href.match(/\/([0-9a-f]{32})\//);
            return RegExp.$1;
        }

        /**
         * パレットの選択色の枠の色を設定する
         */
        function changePalletSelectedBorderColor () {
            'use strict';
            // console.log('changePalletBorderColor');

            var tempColor;
            $('#pallet>div.selectedColor').css('background-color').match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
            if (Number(RegExp.$1) + Number(RegExp.$2) + Number(RegExp.$3) < 383) {
                tempColor = '#ffffff';
            } else {
                tempColor = '#000000';
            }
            $('#pallet>div.selectedColor').css('border-color', tempColor);
        }

        /**
         * ブラシサイズ変更時に表示を更新する
         */
        function drawBrushSize () {
            'use strict';
            // console.log('drawBrushSize');

            brushContext.fillStyle = '#ffffff';
            brushContext.beginPath();
            brushContext.fillRect(0, 0, $('#brushSizeCanvas').width(), $('#brushSizeCanvas').height());
            brushContext.stroke();

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            var x = 13;
            var y = 13;
            brushContext.strokeStyle = '#000000';
            brushContext.fillStyle = '#000000';
            brushContext.beginPath();
            brushContext.arc(x, y, drawWidth / 2, 0, Math.PI * 2, false);
            brushContext.fill();
        }

        /**
         * 受け取ったお絵かきデータを描画メソッドに振り分ける
         */
        function drawData (data) {
            'use strict';
            // console.log('drawData');

            for (var i = 0; i < data.length; i += 1) {
                var width = data[i].width;
                var color = data[i].color;
                var x = data[i].x;
                var y = data[i].y;
                for (var j = 0; j < x.length; j += 1) {
                    if (x[j].length === 1) {
                        drawPoint(x[j][0], y[j][0], width, color);
                    } else {
                        drawLine(x[j], y[j], width, color);
                    }
                }
            }
        }

        /**
         * Canvas 線分を描画する
         */
        function drawLine (x, y, width, color) {
            'use strict';
            // console.log('drawLine');

            var offset = drawWidth % 2 === 0 ? 0 : 0.5;
            context.strokeStyle = color;
            context.fillStyle = color;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(x[0] - offset, y[0] - offset);
            for (var i = 1; i < x.length; i += 1) {
                context.lineTo(x[i] - offset, y[i] -offset);
            }
            context.stroke();
        }

        /**
         * Canvas 点を描画する
         */
        function drawPoint (x, y, width, color) {
            'use strict';
            // console.log('drawPoint');

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            context.strokeStyle = color;
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, width / 2, 0, Math.PI * 2, false);
            context.fill();
        }

        /**
         * Canvas クリア
         */
        function clearCanvas () {
            'use strict';
            // console.log('#clearCanvas');

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, $('#mainCanvas').width(), $('#mainCanvas').height());
        }

        /**
         * お絵かき情報をbufferに溜める
         */
        function pushBuffer (type, width, color, data) {
            'use strict';
            // console.log('pushBuffer');

            if (buffer.length > 0 &&
                buffer.slice(-1)[0].width === width &&
                buffer.slice(-1)[0].color === color) {
                if (type === 'line') {
                    buffer.slice(-1)[0].x.slice(-1)[0].push(data.xe);
                    buffer.slice(-1)[0].y.slice(-1)[0].push(data.ye);
                } else if (type === 'point') {
                    buffer.slice(-1)[0].x.push( [data.x] );
                    buffer.slice(-1)[0].y.push( [data.y] );
                }
            } else {
                if (type === 'line') {
                    buffer.push({
                        width: width,
                        color: color,
                        x: [ [data.xs, data.xe] ],
                        y: [ [data.ys, data.ye] ] });
                } else if (type === 'point') {
                    buffer.push({
                        width: width,
                        color: color,
                        x: [ [data.x] ],
                        y: [ [data.y] ] });
                }
            }

            if (!buffering) {
                // console.log('buffering');

                buffering = true;
                timer = setTimeout(function () { sendImage(); }, setTimeoutMillisecond);
            }
        }

        /**
         * bufferを送信する
         */
        function sendImage () {
            'use strict';
            // console.log('sendImage');

            socket.emit('send image', buffer);
            buffer.length = 0;
            buffering = false;
        }

        /**
         * 画像DataUrl取得メソッド
         */
        function getPng () {
            'use strict';
            // console.log('getPng');

            var dataUrl = canvas.toDataURL('image/png');
            return dataUrl.split(',')[1];
        }

        /**
         * サムネイル画像DataUrl取得メソッド
         */
        function getThumbnailPng () {
            'use strict';
            // console.log('getThumbnailPng');

            var thumbnailCanvas = document.createElement('canvas');

            var rate;
            if (canvas.width >= canvas.height) {
                rate = canvas.width / thumbnailSize;
                thumbnailCanvas.width = thumbnailSize;
                thumbnailCanvas.height = Math.floor(canvas.height / rate);
            } else {
                rate = canvas.height / thumbnailSize;
                thumbnailCanvas.width = Math.floor(canvas.width / rate);
                thumbnailCanvas.height = thumbnailSize;
            }

            var thumbnailContext = thumbnailCanvas.getContext('2d');
            thumbnailContext.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

            var dataUrl = thumbnailCanvas.toDataURL('image/png');
            return dataUrl.split(',')[1];
        }
    });
})();
