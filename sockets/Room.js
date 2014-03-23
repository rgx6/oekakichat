(function () {
    'use strict';

    var Room = (function () {
        'use strict';

        function Room(id) {
            'use strict';

            this.id = id;
            this.imageLog = [];
            this.userCount = 0;
        }

        Room.prototype.storeImage = function (data) {
            'use strict';

            this.imageLog.push(data);
        };

        Room.prototype.deleteImage = function () {
            'use strict';

            this.imageLog.length = 0;
        };

        return Room;
    })();

    exports.Room = Room;
})();
