(function () {
    // 'use strict';

    $(document).ready(function () {
        // 'use strict';

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK              = 'ok';
        var RESULT_BAD_PARAM       = 'bad param';
        var RESULT_ROOM_NOT_EXISTS = 'room not exists';

        var TYPE_UNDEFINED = 'undefined';
        var TYPE_BOOLEAN   = 'boolean';

        var NAME_LENGTH_LIMIT = Number($('#roomName').attr('maxlength'));
        var WIDTH_MIN         = Number($('#roomWidth').attr('min'));
        var WIDTH_MAX         = Number($('#roomWidth').attr('max'));
        var HEIGHT_MIN        = Number($('#roomHeight').attr('min'));
        var HEIGHT_MAX        = Number($('#roomHeight').attr('max'));

        //------------------------------
        // 変数
        //------------------------------

        var socket;
        var roomId;
        var configId;

        //------------------------------
        // 準備
        //------------------------------

        socket = io.connect('/', { 'reconnect': false });

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        socket.on('connected', function () {
            'use strict';
            // console.log('connected');

            location.href.match(/config\/([0-9a-z]+)/);
            configId = RegExp.$1;

            socket.emit('enter config', configId, function (res) {
                // console.log('enter config callback');

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_ROOM_NOT_EXISTS) {
                    alert('部屋が存在しません');
                } else if (res.result === RESULT_OK) {
                    roomId = res.roomId;
                    $('#roomName').val(res.name);
                    $('#roomWidth').val(res.width);
                    $('#roomHeight').val(res.height);
                    $('#roomIsChatAvailable').prop('checked', res.isChatAvailable);
                    $('#roomIsTextChatAvailable').prop('checked', res.isTextChatAvailable);
                    $('#roomIsLogAvailable').prop('checked', res.isLogAvailable);
                    $('#roomIsLogOpen').prop('checked', res.isLogOpen);

                    $('title').text(res.name + ' - 設定 - お絵かきチャット');

                    $('form').removeClass('displayNone');

                    new AddressBook().push(res.name, res.roomId, configId);
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

            alert('サーバーとの接続が切断されました。\nページを更新してください。');
        });

        //------------------------------
        // イベントハンドラ定義
        //------------------------------

        /**
         * 部屋作成依頼
         */
        $('#updateConfig').on('click', function () {
            'use strict';
            // console.log('#updateConfig click');

            $('#updateConfig').attr('disabled', 'disabled');

            // 入力値チェック
            var name                = $('#roomName').val();
            var width               = Math.floor($('#roomWidth').val());
            var height              = Math.floor($('#roomHeight').val());
            var isChatAvailable     = $('#roomIsChatAvailable').prop('checked');
            var isTextChatAvailable = $('#roomIsTextChatAvailable').prop('checked');
            var isLogAvailable      = $('#roomIsLogAvailable').prop('checked');
            var isLogOpen           = $('#roomIsLogOpen').prop('checked');

            if (!checkParamLength(name, 0, NAME_LENGTH_LIMIT)   ||
                !checkParamSize(width, WIDTH_MIN, WIDTH_MAX)    ||
                !checkParamSize(height, HEIGHT_MIN, HEIGHT_MAX) ||
                typeof isChatAvailable     !== TYPE_BOOLEAN     ||
                typeof isTextChatAvailable !== TYPE_BOOLEAN     ||
                typeof isLogAvailable      !== TYPE_BOOLEAN     ||
                typeof isLogOpen           !== TYPE_BOOLEAN) {
                alert('入力値が不正です');
                $('#updateConfig').removeAttr('disabled');
                return;
            }

            var data = {
                roomId:              roomId,
                configId:            configId,
                name:                name,
                width:               width,
                height:              height,
                isChatAvailable:     isChatAvailable,
                isTextChatAvailable: isTextChatAvailable,
                isLogAvailable:      isLogAvailable,
                isLogOpen:           isLogOpen,
            };

            socket.emit('update config', data, function (res) {
                // console.log('update config callback');

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_OK) {
                    alert('更新しました');
                } else {
                    alert('予期しないエラーです');
                }
                $('#updateConfig').removeAttr('disabled');
            });
        });

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
    });
})();
