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

            $('#authentication').removeClass('displayNone');
        });

        socket.on('disconnect', function () {
            'use strict';
            // console.log('disconnect');

            alert('サーバーとの接続が切断されました');
        });

        //------------------------------
        // イベントハンドラ
        //------------------------------

        /**
         * 認証ボタン クリック
         */
        $('#buttonAuth').on('click', function (e) {
            'use strict';
            // console.log('#buttonAuth click');

            var password = $('#password').val();
            socket.emit('admin authentication', password, function (res) {
                // console.log('admin authentication callback');

                if (res.result === RESULT_OK) {
                    $('#authentication').addClass('displayNone');
                    $('#function').removeClass('displayNone');
                } else if (res.result === RESULT_BAD_PARAM) {
                    alert('パスワードが違います');
                } else {
                    alert('予期しないエラーです');
                }
            });
        });

        /**
         * パフォーマンスボタン クリック
         */
        $('#buttonPerformance').on('click', function (e) {
            'use strict';
            // console.log('#buttonPerformance click');

            $('#buttonPerformance').attr('disabled', 'disabled');
            $('#performance p').remove();

            socket.emit('admin performance', function (res) {
                // console.log('admin performance callback');

                $('#performance').append('<p>' + JSON.stringify(res) + '</p>');
                $('#buttonPerformance').removeAttr('disabled');
            });
        });

        /**
         * 部屋一覧ボタン クリック
         */
        $('#buttonRoomList').on('click', function (e) {
            'use strict';
            // console.log('#buttonRoomList click');

            $('#buttonRoomList').attr('disabled', 'disabled');
            $('#roomList table tr').remove();

            socket.emit('admin room list', function (res) {
                // console.log('admin room list callback');

                $('#roomList table').append('<tr><th>id</th><th>name</th><th>user count</th><th>size</th></tr>');
                res.forEach(function (room) {
                    $('#roomList table').append(
                        '<tr><td><a href="/' + room.id + '/" target="_blank">' + room.id + '</a></td><td>'
                            + room.name + '</td><td>' + room.userCount + '</td><td>' + room.size + '</td></tr>');
                });
                $('#buttonRoomList').removeAttr('disabled');
            });
        });

        /**
         * お絵かきデータ保存ボタン クリック
         */
        $('#buttonSaveData').on('click', function (e) {
            'use strict';
            // console.log('#buttonSave click');

            $('#buttonSaveData').attr('disabled', 'disabled');
            $('#saveData p').remove();

            socket.emit('admin save data', function (res) {
                // console.log('admin save data callback');

                res.forEach(function (data) {
                    $('#saveData').append('<p>' + data + '</p>');
                });
                $('#buttonSaveData').removeAttr('disabled');
            });
        });
    });
})();
