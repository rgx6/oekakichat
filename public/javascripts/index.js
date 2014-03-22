(function () {
    'use strict';
    
    var socket;
    
    // 存在チェック
    if (String.prototype.format == undefined) {
        /**
         * フォーマット関数
         */
        String.prototype.format = function(arg)
        {
            // 置換ファンク
            var rep_fn = undefined;
            // オブジェクトの場合
            if (typeof arg == "object") {
                rep_fn = function(m, k) { return arg[k]; }
            }
            // 複数引数だった場合
            else {
                var args = arguments;
                rep_fn = function(m, k) { return args[ parseInt(k) ]; }
            }
            return this.replace( /\{(\w+)\}/g, rep_fn );
        }
    }
    
    /**
     * nullとundefinedと文字数のチェック
     */
    function checkParamLength (data, maxLength) {
        'use strict';
        
        return typeof data !== 'undefined' &&
               data !== null &&
               data.length !== 0 &&
               data.length <= maxLength;
    }
    
    /**
     * nullとundefinedと範囲のチェック
     */
    function checkParamSize (data, minSize, maxSize) {
        'use strict';
        
        return typeof data !== 'undefined' &&
               data !== null &&
               !isNaN(data) &&
               minSize <= data &&
               data <= maxSize;
    }
    
    $(document).ready(function () {
        'use strict';
        // console.log('ready');
        
        var nameLengthLimit = $('#room-name').attr('maxlength') - 0;
        var widthMin = $('#room-width').attr('min') - 0;
        var widthMax = $('#room-width').attr('max') - 0;
        var heightMin = $('#room-height').attr('min') - 0;
        var heightMax = $('#room-height').attr('max') - 0;
        
        socket = io.connect();
        
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
        $('#create-room').on('click', function () {
            'use strict';
            // console.log('create-room click');
            
            $('#create-room').attr('disabled', 'disabled');
            
            // 入力値チェック
            var name = $('#room-name').val();
            var width = Math.floor($('#room-width').val());
            var height = Math.floor($('#room-height').val());
            var isLogOpened = $('#room-isLogOpened').prop('checked');
            
            if (!checkParamLength(name, nameLengthLimit) ||
                !checkParamSize(width, widthMin, widthMax) ||
                !checkParamSize(height, heightMin, heightMax) ||
                typeof isLogOpened !== 'boolean') {
                alert('入力値が不正です');
                $('#create-room').removeAttr('disabled');
                return;
            }
            
            var req = {
                name:        name,
                width:       width,
                height:      height,
                isLogOpened: isLogOpened
            };
            
            socket.emit('create room', req, function (res) {
                'use strict';
                // console.log('create room');
                
                if (res.result === 'bad param') {
                    alert('不正なパラメータです');
                } else if (res.result === 'ok') {
                    var url = location.href + res.id + '/';
                    $('#url').val(url);
                    var configurl = location.href + 'config/' + res.configid + '/';
                    $('#configurl').val(configurl);
                    var tag = '<iframe src="{0}" style="border:none;" width="{1}" height="{2}" />'
                              .format(url, res.width + 2, res.height + 30);
                    $('#tag').val(tag);
                    $('#inputpart').slideUp(500, function () { $('#outputpart').slideDown(500); });
                } else {
                    alert('予期しないエラーです');
                }
            });
        });
    });
})();
