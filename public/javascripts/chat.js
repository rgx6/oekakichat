(function () {
    // 'use strict';

    $(document).ready(function () {
        // 'use strict';

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK        = 'ok';
        var RESULT_BAD_PARAM = 'bad param';

        var BRUSH_SIZE_MIN = 1;
        var BRUSH_SIZE_MAX = 21;

        // globalCompositeOperation
        var SOURCE_OVER = 'source-over';
        var DESTINATION_OVER = 'destination-over';
        var DESTINATION_OUT = 'destination-out';

        var ERASE_COLOR = '#000000';

        var CANVAS_OFFSET_LEFT = $('#mainCanvas').offset().left;
        var CANVAS_OFFSET_TOP = $('#mainCanvas').offset().top;
        var CANVAS_HEIGHT = $('#mainCanvas').height();
        var CANVAS_WIDTH = $('#mainCanvas').width();
        var BRUSH_SIZE_CANVAS_HEIGHT = $('#brushSizeCanvas').height();
        var BRUSH_SIZE_CANVAS_WIDTH = $('#brushSizeCanvas').width();

        var MODE_BRUSH = 'brush';
        var MODE_ERASER = 'eraser';
        var MODE_SPUIT = 'spuit';

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
        var combinationCanvas = $('#combinationCanvas').get(0);
        var roughCanvas = $('#roughCanvas').get(0);
        var mainCanvas = $('#mainCanvas').get(0);
        var cursorCanvas = $('#cursorCanvas').get(0);
        var brushCanvas = $('#brushSizeCanvas').get(0);
        // contextオブジェクト
        var combinationContext;
        var roughContext;
        var mainContext;
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

        // モード制御用
        var currentMode = MODE_BRUSH;

        // マスクモード制御用
        var isMaskMode = false;

        // 下描きモード制御用
        var isRoughMode = false;

        // ホイール操作用ショートカットキー
        var key_width_pressed = false;

        //------------------------------
        // 準備
        //------------------------------

        if (!mainCanvas.getContext) {
            alert('ブラウザがCanvasに対応してないよ(´・ω・｀)');
            return;
        }

        combinationContext = combinationCanvas.getContext('2d');

        roughContext = roughCanvas.getContext('2d');
        roughContext.lineCap = 'round';
        roughContext.lineJoin = 'round';

        mainContext = mainCanvas.getContext('2d');
        mainContext.lineCap = 'round';
        mainContext.lineJoin = 'round';

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
        socket = io.connect('/', { 'reconnect': false });

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        /**
         * 入室リクエスト
         */
        socket.on('connected', function () {
            'use strict';
            // console.log('connected');

            // todo : versionでも持たせて再読み込みが必要かどうかチェックさせる？
            socket.emit('enter room', getIdFromUrl(), function (res) {
                'use strict';
                // console.log('enter room callback');

                // todo : 読み込み中表示

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_OK) {
                    // todo : 再接続時の下描きレイヤーのclearについては要検討
                    clearCanvas(mainContext);
                    startTimer();
                    res.imageLog.forEach(function (data) {
                        drawData(data);
                    });
                    endTimer();
                    var dataSize = (new Blob([JSON.stringify(res.imageLog)], { type: 'application/json' })).size;
                    console.log('データサイズ : ' + dataSize);
                    // todo : canvasの描画が終わる前にこの処理が実行されている？
                    isDisabled = false;
                } else {
                    alert('予期しないエラーです');
                }
            });
        });

        /**
         * 切断イベント
         */
        socket.on('disconnect', function () {
            'use strict';
            // console.log('disconnect');

            isDisabled = true;
            alert('サーバーとの接続が切断されました。\nページを更新してください。');
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

            clearCanvas(mainContext);
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

            drawFlag = true;
            startX = Math.round(e.pageX) - CANVAS_OFFSET_LEFT;
            startY = Math.round(e.pageY) - CANVAS_OFFSET_TOP;
            if (isSpuitMode()) {
                var spuitColor = getColor(getCurrentContext(), startX, startY);
                $('#pallet>div.selectedColor').css('background-color', spuitColor);
                changePalletSelectedBorderColor();
                color = spuitColor;
            } else {
                if (isBrushMode()) {
                    drawPoint(getCurrentContext(), startX, startY, drawWidth, color, isMaskMode);
                    pushBuffer('point', drawWidth, color, { x: startX, y: startY }, isMaskMode);
                } else {
                    erasePoint(getCurrentContext(), startX, startY, drawWidth);
                    pushBuffer('erasepoint', drawWidth, null, { x: startX, y: startY }, null);
                }
            }
        });

        /**
         * Canvas MouseMove イベント
         */
        $('#cursorCanvas').mousemove(function (e) {
            'use strict';
            // console.log('mouse move');
            e.stopPropagation();
            if (isDisabled) return false;

            if (drawFlag) {
                var endX = Math.round(e.pageX) - CANVAS_OFFSET_LEFT;
                var endY = Math.round(e.pageY) - CANVAS_OFFSET_TOP;
                if (isSpuitMode()) {
                    var spuitColor = getColor(getCurrentContext(), endX, endY);
                    $('#pallet>div.selectedColor').css('background-color', spuitColor);
                    changePalletSelectedBorderColor();
                    color = spuitColor;
                } else {
                    if (isBrushMode()) {
                        drawLine(getCurrentContext(), [startX, endX], [startY, endY], drawWidth, color, isMaskMode);
                        pushBuffer('line', drawWidth, color, { xs: startX, ys: startY, xe: endX, ye: endY }, isMaskMode);
                    } else {
                        eraseLine(getCurrentContext(), [startX, endX], [startY, endY], drawWidth);
                        pushBuffer('eraseline', drawWidth, null, { xs: startX, ys: startY, xe: endX, ye: endY }, null);
                    }
                }
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

            if (isRoughMode) updateRoughIndicator();

            cursorContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            if (isSpuitMode()) return;

            var c = isBrushMode() ? color : '#ffffff';
            startX = Math.round(e.pageX) - CANVAS_OFFSET_LEFT;
            startY = Math.round(e.pageY) - CANVAS_OFFSET_TOP;
            cursorContext.fillStyle = c;
            cursorContext.beginPath();
            cursorContext.arc(startX, startY, drawWidth / 2, 0, Math.PI * 2, false);
            cursorContext.fill();
        });
        $('#cursorCanvas').mouseleave(function (e) {
            'use strict';
            // console.log('mouse leave');
            e.stopPropagation();

            cursorContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

            changeBrushMode();
        });

        /**
         * 消しゴムボタンをクリック
         */
        $("#eraser").on('click', function () {
            'use strict';
            // console.log('#eraser click');

            changeEraserMode();
        });

        /**
         * スポイトボタンをクリック
         */
        $('#spuit').on('click', function () {
            'use strict';
            // console.log('#spuit click');

            changeSpuitMode();
        });

        /**
         * マスクボタンをクリック
         */
        $('#mask').on('click', function () {
            'use strict';
            // console.log('#mask click');

            toggleMaskMode();
        });

        /**
         * 下描きボタンをクリック
         */
        $('#rough').on('click', function () {
            'use strict';
            // console.log('#rough click');

            toggleRoughMode();
        });

        /**
         * 太さ変更
         */
        $("#brushSizeSlider").slider({
            value: drawWidth,
            min:   BRUSH_SIZE_MIN,
            max:   BRUSH_SIZE_MAX,
            step:  1,
            slide: function (event, ui) {
                drawWidth = ui.value;
                drawBrushSize();
                if (isBrushMode()) {
                    drawWidthBrush = drawWidth;
                } else if (isEraserMode()) {
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

            if (isEraserMode()) {
                changeBrushMode();
            }
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
            var left = $('#mainCanvas').position().left;
            var top = $('#mainCanvas').position().top;
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
                combineCanvases();
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

            if (isRoughMode) {
                if (window.confirm('下描きをクリアしますか？')) {
                    clearCanvas(roughContext);
                }
                return;
            }

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
                    combineCanvases();
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

            var dom = $('<a />');
            dom.addClass('iframe cboxElement');
            dom.attr('href', '/help/');
            dom.css('display', 'none');
            dom.colorbox({
                iframe: true,
                innerWidth: '550px',
                innerHeight: '250px',
                transition: 'none',
                closeButton: true,
                open: true,
            });
        });

        /**
         * キーボードショートカット
         */
        $(window).on('keydown keyup', function (e) {
            'use strict';
            // console.log('window ' + e.type + ' ' + e.keyCode);

            switch(e.keyCode) {
                case 84: // T
                    if (e.type === 'keydown') {
                        $('#roughCanvas').css('display', 'none');
                    } else {
                        $('#roughCanvas').css('display', '');
                    }
                    break;
                case 87: // W
                    key_width_pressed = e.type === 'keydown';
                    break;
            }
        });
        $(window).keyup(function (e) {
            'use strict';
            // console.log('window keyup ' + e.keyCode);

            if (49 <= e.keyCode && e.keyCode <= 56) {
                // 1-8 色選択
                var colorId = '#color' + (e.keyCode - 48);

                // hack : パレットのクリックイベントと共通化
                $('#pallet>div.selectedColor').removeClass('selectedColor');
                $(colorId).addClass('selectedColor');

                $('#pallet>div').css('border-color', $('#toolbar').css('background-color'));
                changePalletSelectedBorderColor();
                color = $(colorId).css('background-color');

                // Interactive Color Picker 表示中に色を変更した場合に元の色を同期させる
                $('.staticColorFixed').css('background-color', $(colorId).css('background-color'));
            } else if (e.keyCode === 66) {
                // B
                changeBrushMode();
            } else if (e.keyCode === 69) {
                // E
                changeEraserMode();
            } else if (e.keyCode === 83) {
                // S
                changeSpuitMode();
            } else if (e.keyCode === 67) {
                // C
                toggleMaskMode();
            } else if (e.keyCode === 82) {
                // R
                toggleRoughMode();
            }
        });
        $(window).on('wheel', function (e) {
            'use strict';
            // console.log('wheel');

            var delta = e.originalEvent.deltaY < 0 ? 1 : -1;

            if (key_width_pressed && !isSpuitMode()) {
                e.preventDefault();
                var newWidth = Number(drawWidth) + delta;
                newWidth = Math.max(newWidth, BRUSH_SIZE_MIN);
                newWidth = Math.min(newWidth, BRUSH_SIZE_MAX);
                drawWidth = newWidth;
                drawBrushSize();
                if (isBrushMode()) {
                    drawWidthBrush = drawWidth;
                } else if (isEraserMode()) {
                    drawWidthEraser = drawWidth;
                }
                $('#brushSizeSlider').slider('value', drawWidth);
            }
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
         * 現在の処理対象のcontextを取得する
         */
        function getCurrentContext () {
            'use strict';
            // console.log('getCurrentContext');

            return isRoughMode ? roughContext : mainContext;
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
         * 指定座標の色を取得する
         */
        function getColor(context, x, y) {
            'use strict';
            // console.log('getColor');

            var spuitImage = context.getImageData(x, y, 1, 1);
            var r = spuitImage.data[0];
            var g = spuitImage.data[1];
            var b = spuitImage.data[2];
            return 'Rgb(' + r +','+ g + ',' + b +')';
        }

        /**
         * モード判定
         */
        function isBrushMode () {
            'use strict';
            // console.log('isBrushMode');

            return currentMode === MODE_BRUSH;
        }
        function isEraserMode () {
            'use strict';
            // console.log('isEraserMode');

            return currentMode === MODE_ERASER;
        }
        function isSpuitMode () {
            'use strict';
            // console.log('isSpuitMode');

            return currentMode === MODE_SPUIT;
        }

        /**
         * 描画モードをブラシに変更する
         */
        function changeBrushMode () {
            'use strict';
            // console.log('changeBrushMode');

            currentMode = MODE_BRUSH;

            $('#eraser').removeClass('active');
            $('#spuit').removeClass('active');
            $('#brush').addClass('active');

            drawWidth = drawWidthBrush;
            $('#brushSizeSlider').slider('value', drawWidth);
            $('#brushSizeSlider').slider('enable');

            drawBrushSize();
        }

        /**
         * 描画モードを消しゴムに変更する
         */
        function changeEraserMode () {
            'use strict';
            // console.log('changeEraserMode');

            currentMode = MODE_ERASER;

            $('#brush').removeClass('active');
            $('#spuit').removeClass('active');
            $('#eraser').addClass('active');

            drawWidth = drawWidthEraser;
            $('#brushSizeSlider').slider('value', drawWidth);
            $('#brushSizeSlider').slider('enable');

            drawBrushSize();
        }

        /**
         * 描画モードをスポイトに変更する
         */
        function changeSpuitMode () {
            'use strict';
            // console.log('changeSpuitMode');

            currentMode = MODE_SPUIT;

            $('#brush').removeClass('active');
            $('#eraser').removeClass('active');
            $('#spuit').addClass('active');

            $('#brushSizeSlider').slider('disable');
        }

        /**
         * マスクモードの切替
         */
        function toggleMaskMode () {
            'use strict';
            // console.log('toggleMaskMode');

            isMaskMode = !isMaskMode;
            if (isMaskMode) {
                $('#mask').addClass('active');
            } else {
                $('#mask').removeClass('active');
            }
        }

        /**
         * 下描きモードの切替
         */
        function toggleRoughMode () {
            'use strict';
            // console.log('toggleRoughMode');

            isRoughMode = !isRoughMode;
            if (isRoughMode) {
                $('#rough').addClass('active');
                updateRoughIndicator();
                $('#roughIndicator').css('display', 'block');
            } else {
                $('#rough').removeClass('active');
                $('#roughIndicator').css('display', 'none');
            }
        }

        /**
         * 下描きモードの表示を移動する
         */
        function updateRoughIndicator () {
            'use strict';
            // console.log('updateRoughIndicator');

            var scrLeft = $(window).scrollLeft();
            var winWidth = $(window).width();
            var areaWidth = $('#mainCanvas').width() + 2;

            var label = $('#roughIndicator');
            if (scrLeft + winWidth / 2 < startX) {
                label.css('left', '15px').css('display', 'block');
            } else {
                var left = (areaWidth < scrLeft + winWidth ? areaWidth : winWidth) - label.width() - 15;
                label.css('left', left + 'px').css('display', 'block');
            }
        }

        /**
         * ブラシサイズ変更時に表示を更新する
         */
        function drawBrushSize () {
            'use strict';
            // console.log('drawBrushSize');

            brushContext.clearRect(0, 0, BRUSH_SIZE_CANVAS_WIDTH, BRUSH_SIZE_CANVAS_HEIGHT);

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            var x = 13;
            var y = 13;
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
                var mode = data[i].mode;
                var width = data[i].width;
                var color = data[i].color;
                var x = data[i].x;
                var y = data[i].y;
                var isMaskMode = data[i].mask;

                var pointMethod = mode === 'draw' ? drawPoint : erasePoint;
                var lineMethod = mode === 'draw' ? drawLineDiff : eraseLineDiff;

                for (var j = 0; j < x.length; j += 1) {
                    if (x[j].length === 1) {
                        pointMethod(mainContext, x[j][0], y[j][0], width, color, isMaskMode);
                    } else {
                        lineMethod(mainContext, x[j], y[j], width, color, isMaskMode);
                    }
                }
            }
        }

        /**
         * Canvas 線分を描画する
         */
        function drawLine (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('drawLine');

            var offset = width % 2 === 0 ? 0 : 0.5;
            context.globalCompositeOperation = isMaskMode ? DESTINATION_OVER : SOURCE_OVER;
            context.strokeStyle = color;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(x[0] - offset, y[0] - offset);
            for (var i = 1; i < x.length; i += 1) {
                context.lineTo(x[i] - offset, y[i] -offset);
            }
            context.stroke();
        }

        /**
         * Canvas 線分を描画する（座標の差分）
         */
        function drawLineDiff (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('drawLineDiff');

            var offset = width % 2 === 0 ? 0 : 0.5;
            var tx = x[0] - offset;
            var ty = y[0] - offset;
            context.globalCompositeOperation = isMaskMode ? DESTINATION_OVER : SOURCE_OVER;
            context.strokeStyle = color;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(tx, ty);
            for (var i = 1; i < x.length; i += 1) {
                tx += x[i];
                ty += y[i];
                context.lineTo(tx, ty);
            }
            context.stroke();
        }

        /**
         * Canvas 線分を消す
         */
        function eraseLine (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('eraseLine');

            var offset = width % 2 === 0 ? 0 : 0.5;
            context.globalCompositeOperation = DESTINATION_OUT;
            context.strokeStyle = ERASE_COLOR;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(x[0] - offset, y[0] - offset);
            for (var i = 1; i < x.length; i += 1) {
                context.lineTo(x[i] - offset, y[i] -offset);
            }
            context.stroke();
        }

        /**
         * Canvas 線分を消す（座標の差分）
         */
        function eraseLineDiff (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('eraseLineDiff');

            var offset = width % 2 === 0 ? 0 : 0.5;
            var tx = x[0] - offset;
            var ty = y[0] - offset;
            context.globalCompositeOperation = DESTINATION_OUT;
            context.strokeStyle = ERASE_COLOR;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(tx, ty);
            for (var i = 1; i < x.length; i += 1) {
                tx += x[i];
                ty += y[i];
                context.lineTo(tx, ty);
            }
            context.stroke();
        }

        /**
         * Canvas 点を描画する
         */
        function drawPoint (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('drawPoint');

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            context.globalCompositeOperation = isMaskMode ? DESTINATION_OVER : SOURCE_OVER;
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, width / 2, 0, Math.PI * 2, false);
            context.fill();
        }

        /**
         * Canvas 点を消す
         */
        function erasePoint (context, x, y, width, color, isMaskMode) {
            'use strict';
            // console.log('erasePoint');

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            context.globalCompositeOperation = DESTINATION_OUT;
            context.fillStyle = ERASE_COLOR;
            context.beginPath();
            context.arc(x, y, width / 2, 0, Math.PI * 2, false);
            context.fill();
        }

        /**
         * Canvas クリア
         */
        function clearCanvas (context) {
            'use strict';
            // console.log('#clearCanvas');

            context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        /**
         * お絵かき情報をbufferに溜める
         */
        function pushBuffer (type, width, color, data, isMaskMode) {
            'use strict';
            // console.log('pushBuffer');

            // hack : 下描きモードの場合は無視。呼び出し元で制御するように修正する。
            if (isRoughMode) return;

            var mode = type.indexOf('erase') === -1 ? 'draw' : 'erase';
            if (buffer.length > 0 &&
                buffer.slice(-1)[0].mode === mode &&
                buffer.slice(-1)[0].width === width &&
                (buffer.slice(-1)[0].color == null || buffer.slice(-1)[0].color === color)) {
                if (type.indexOf('line') !== -1) {
                    buffer.slice(-1)[0].x.slice(-1)[0].push(data.xe - data.xs);
                    buffer.slice(-1)[0].y.slice(-1)[0].push(data.ye - data.ys);
                } else if (type.indexOf('point') !== -1) {
                    buffer.slice(-1)[0].x.push( [data.x] );
                    buffer.slice(-1)[0].y.push( [data.y] );
                }
            } else {
                if (type === 'line') {
                    buffer.push({
                        mode: 'draw',
                        width: width,
                        color: color,
                        x: [ [data.xs, data.xe - data.xs] ],
                        y: [ [data.ys, data.ye - data.ys] ],
                        mask: isMaskMode });
                } else if (type === 'point') {
                    buffer.push({
                        mode: 'draw',
                        width: width,
                        color: color,
                        x: [ [data.x] ],
                        y: [ [data.y] ],
                        mask: isMaskMode });
                } else if (type === 'eraseline') {
                    buffer.push({
                        mode: 'erase',
                        width: width,
                        x: [ [data.xs, data.xe - data.xs] ],
                        y: [ [data.ys, data.ye - data.ys] ] });
                } else if (type === 'erasepoint') {
                    buffer.push({
                        mode: 'erase',
                        width: width,
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
         * 保存用に白背景と合成する
         */
        function combineCanvases () {
            'use strict';
            // console.log('combineCanvases');

            combinationContext.fillStyle = '#ffffff';
            combinationContext.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            combinationContext.drawImage(mainCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        /**
         * 画像DataUrl取得メソッド
         */
        function getPng () {
            'use strict';
            // console.log('getPng');

            var dataUrl = combinationCanvas.toDataURL('image/png');
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
            if (CANVAS_WIDTH >= CANVAS_HEIGHT) {
                rate = CANVAS_WIDTH / thumbnailSize;
                thumbnailCanvas.width = thumbnailSize;
                thumbnailCanvas.height = Math.floor(CANVAS_HEIGHT / rate);
            } else {
                rate = CANVAS_HEIGHT / thumbnailSize;
                thumbnailCanvas.width = Math.floor(CANVAS_WIDTH / rate);
                thumbnailCanvas.height = thumbnailSize;
            }

            var thumbnailContext = thumbnailCanvas.getContext('2d');
            thumbnailContext.drawImage(combinationCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

            var dataUrl = thumbnailCanvas.toDataURL('image/png');
            return dataUrl.split(',')[1];
        }

        /**
         * パフォーマンス計測用
         */
        var startTime;
        function startTimer () {
            'use strict';
            startTime = new Date();
        }
        function endTimer () {
            'use strict';
            console.log('経過時間 : ' + (new Date() - startTime));
        }
    });
})();
