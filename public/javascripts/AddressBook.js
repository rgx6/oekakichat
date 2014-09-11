var AddressBook = (function () {
    // 'use strict';

    function AddressBook() {
        'use strict';

        this.roomList = localStorage.AddressBook ? JSON.parse(localStorage.AddressBook) : [];
    }

    AddressBook.prototype.save = function () {
        'use strict';

        localStorage.AddressBook = JSON.stringify(this.roomList);
    };

    AddressBook.prototype.push = function (name, roomId, configId) {
        'use strict';

        var hit = this.roomList.some(function (room) {
            if (room.roomId === roomId) {
                room.name = name;
                if (configId) room.configId = configId;
                return true;
            } else {
                return false;
            }
        });
        if (!hit) {
            this.roomList.push({
                name: name,
                roomId: roomId,
                configId: configId
            });
        }
        this.save();
    };

    AddressBook.prototype.remove = function (roomId) {
        'use strict';

        roomList = this.roomList;
        roomList.some(function (room, i) {
            if (room.roomId === roomId) {
                roomList.splice(i, 1);
                return true;
            } else {
                return false;
            }
        });
        this.save();
    };

    return AddressBook;
})();
