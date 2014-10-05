(function () {
    'use strict';

    $(document).ready(function () {
        'use strict';

        var roomId = getRoomIdFromUrl();
        if (!roomId) {
            $('#list').append('エラー');
            return;
        }

        var page = getPageFromUrl();
        if (!page) location = '/' + roomId + '/log';

        getList(roomId, page);

        window.onpopstate = function (event) {
            'use strict';
            // console.log('onpopstate');

            page = getPageFromUrl();
            getList(roomId, page);
        };

        function getRoomIdFromUrl () {
            'use strict';
            // console.log('getRoomIdFromUrl');

            if (location.pathname.match(/^\/([0-9a-zA-Z]+)\/log/)) {
                return RegExp.$1;
            } else {
                return null;
            }
        }

        function getPageFromUrl () {
            'use strict';
            // console.log('getPageFromUrl');

            if (location.pathname.match(/^\/[0-9a-zA-Z]+\/log\/?$/)) {
                return 1;
            } else if (location.pathname.match(/^\/[0-9a-zA-Z]+\/log\/(\d+)\/?$/)) {
                return RegExp.$1;
            } else {
                return null;
            }
        }

        function getList (roomId, page) {
            'use strict';
            // console.log('getList');

            $.ajax({
                type: 'GET',
                url: '/api/log/' + roomId + '/' + page,
                cache: false,
                dataType: 'json',
                success: function (data, dataType)  {
                    $('#title').text(data.name + ' お絵かきログ');
                    showList(data.files);
                    showPager(data.items, data.itemsPerPage);
                },
                error: function (req, status, error) {
                    console.error(req.responseJSON);
                    $('#list').empty();
                    $('#list').append('エラー');
                }
            });
        }

        function showList (files) {
            'use strict';
            // console.log('showList');

            $('#list').empty();

            files.forEach(function (file) {
                $('#list').append(
                    '<a class="thumbnail pull-left" href="/log/' + file.fileName + '.png" target="_blank">'
                        + '<img src="/log/thumb/' + file.fileName + '.thumb.png"'
                        + 'alt="ファイルがないよ(´・ω・｀)" />'
                        + '<div class="caption text-center">'
                        + formatDateTime(file.registeredTime)
                        + '</div>');
            });
        }

        function showPager (items, itemsPerPage) {
            'use strict';
            // console.log('showPager');

            $('#pagination').pagination({
                items: items,
                itemsOnPage: itemsPerPage,
                currentPage: page,
                prevText: '前',
                nextText: '次',
                hrefTextPrefix: '',
                onPageClick: function (pageNumber, event) {
                    page = pageNumber;
                    getList(roomId, page);
                    history.pushState(null, null, '/' + roomId + '/log/' + page);
                    return false;
                },
            });
        }

        function formatDateTime (dateTime) {
            'use strict';
            // console.log('formatDateTime');

            var date = new Date(dateTime);

            return date.getFullYear() + '/'
                + ('0' + (date.getMonth() + 1)).slice(-2) + '/'
                + ('0' + date.getDate()).slice(-2)
                + '<br />'
                + date.getHours() + ':'
                + ('0' + date.getMinutes()).slice(-2) + ':'
                + ('0' + date.getSeconds()).slice(-2);
        }
    });
})();
