(function () {
    'use strict';

    $(document).ready(function () {
        'use strict';
        // console.log('ready');

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK        = 'ok';
        var RESULT_BAD_PARAM = 'bad param';

        var TYPE_UNDEFINED = 'undefined';
        var TYPE_BOOLEAN   = 'boolean';

        var NAME_LENGTH_LIMIT = Number($('#roomName').attr('maxlength'));
        var WIDTH_MIN         = Number($('#roomWidth').attr('min'));
        var WIDTH_MAX         = Number($('#roomWidth').attr('max'));
        var HEIGHT_MIN        = Number($('#roomHeight').attr('min'));
        var HEIGHT_MAX        = Number($('#roomHeight').attr('max'));

        $('#roomName').val('お絵かきチャット');
        $('#roomWidth').val(600);
        $('#roomHeight').val(300);

        //------------------------------
        // 変数
        //------------------------------

        var socket = io.connect();

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        socket.on('connected', function () {
            'use strict';
            // console.log('connected');
        });

        //------------------------------
        // イベントハンドラ定義
        //------------------------------

        /**
         * 部屋作成依頼
         */
        $('#createRoom').on('click', function () {
            'use strict';
            // console.log('#createRoom click');

            $('#createRoom').attr('disabled', 'disabled');

            // 入力値チェック
            var name   = $('#roomName').val();
            var width  = Math.floor($('#roomWidth').val());
            var height = Math.floor($('#roomHeight').val());

            if (!checkParamLength(name, 0, NAME_LENGTH_LIMIT)   ||
                !checkParamSize(width, WIDTH_MIN, WIDTH_MAX)    ||
                !checkParamSize(height, HEIGHT_MIN, HEIGHT_MAX)) {
                alert('入力値が不正です');
                $('#createRoom').removeAttr('disabled');
                return;
            }

            var data = {
                name:   name,
                width:  width,
                height: height,
            };

            socket.emit('create room', data, function (res) {
                'use strict';
                // console.log('create room callback');

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_OK) {
                    $('#roomName').val('');
                    $('#roomWidth').val('');
                    $('#roomHeight').val('');

                    var origin = location.href.replace(/#.*/, '');
                    var url = origin + res.roomId + '/';
                    $('#url').val(url);
                    var configUrl = origin + 'config/' + res.configId + '/';
                    $('#configUrl').val(configUrl);
                    var tag = '<iframe src="{0}" style="border: none;" width="{1}" height="{2}" />'
                              .format(url, res.width + 2, res.height + 30);
                    $('#tag').val(tag);
                    var myPageUrl = origin + 'my/';
                    $('#myPageUrl').val(myPageUrl);

                    $('#inputpart').slideUp(500, function () {
                        $('#outputpart').slideDown(500, function () {
                            $('html, body').animate({ scrollTop: $('#outputpart').offset().top });
                        });
                    });

                    new AddressBook().push(name, res.roomId, res.configId);
                } else {
                    alert('予期しないエラーです');
                }
                $('#createRoom').removeAttr('disabled');
            });
        });

        /**
         * タグ選択
         */
        $('#tagSelect').on('click', function (e) {
            'use strict';
            // console.log('#tagSelect click');
            e.stopPropagation();

            $('#tag').select();
        });

        /**
         * URLを開く
         */
        $('#urlOpen').on('click', function (e) {
            'use strict';
            // console.log('#urlOpen click');
            e.stopPropagation();

            window.open($('#url').val());
        });

        /**
         * 設定用URLを開く
         */
        $('#configUrlOpen').on('click', function (e) {
            'use strict';
            // console.log('#configUrlOpen click');
            e.stopPropagation();

            window.open($('#configUrl').val());
        });

        /**
         * マイページを開く
         */
        $('#myPageUrlOpen').on('click', function (e) {
            'use strict';
            // console.log('#myPageUrlOpen click');
            e.stopPropagation();

            window.open($('#myPageUrl').val());
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

        if (String.prototype.format === undefined) {
            String.prototype.format = function(arg) {
                var rep_fn;
                if (typeof arg == "object") {
                    // オブジェクトの場合
                    rep_fn = function (m, k) { return arg[k]; };
                } else {
                    // 複数引数だった場合
                    var args = arguments;
                    rep_fn = function (m, k) { return args[parseInt(k)]; };
                }
                return this.replace( /\{(\w+)\}/g, rep_fn);
            };
        }
    });
})();
