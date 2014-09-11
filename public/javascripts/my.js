(function () {
    // 'use strict';

    $(document).ready(function () {
        'use strict';

        var myAddressBook = new AddressBook();
        showRoomList();

        $('button.delete').on('click', function () {
            'use strict';
            // console.log('button.delete click');

            if (!window.confirm('アドレス帳からこの部屋を削除しますか？')) return;

            var roomId = $(this).attr('id');
            myAddressBook.remove(roomId);
            var row = $(this).parent().parent();
            row.fadeOut('slow', function () { row.remove(); });
        });

        $(window).on('storage', function () {
            'use strict';
            // console.log('storage event');

            myAddressBook = new AddressBook();
            $('#message').text('アドレス帳が更新されました。ページを更新してください。');
        });

        function showRoomList () {
            'use strict';
            // console.log('showRoomList');

            var html = '';
            myAddressBook.roomList.forEach(function (room) {
                if (room.roomId === '00000000000000000000000000000000' && !room.configId) return;

                html += '<tr>';
                html += '<td>' + room.name + '</td>';
                html += '<td><a href="/' + room.roomId + '/" target="_blank">'
                    + '<button class="btn btn-primary">部屋</button></a></td>';
                if (room.configId) {
                    html += '<td><a href="/config/' + room.configId + '/" target="_blank">'
                        + '<button class="btn btn-primary">設定</button></a></td>';
                } else {
                    html += '<td></td>';
                }
                html += '<td><button id="' + room.roomId + '" class="btn btn-warning delete">削除</button></td>';
                html += '</tr>';
            });
            $('#roomList tbody').append(html);
        }
    });
})();
