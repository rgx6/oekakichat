(function () {
    'use strict';

    var mongoose = require('mongoose');
    var Schema = mongoose.Schema;

    var RoomSchema = new Schema({
        roomId:          { type: String, require: true, index: true },
        configId:        { type: String, require: true, index: true },
        name:            { type: String, require: true },
        width:           { type: Number, require: true },
        height:          { type: Number, require: true },
        isChatAvailable: { type: Boolean, require: true },
        isLogAvailable:  { type: Boolean, require: true },
        isLogOpen:       { type: Boolean, require: true },
        registeredTime:  { type: Date, require: true },
        updatedTime:     { type: Date, require: true },
    });
    mongoose.model('Room', RoomSchema);

    var LogSchema = new Schema({
        roomId:         { type: String, require: true, index: true },
        fileName:       { type: String, require: true, index: true },
        isDeleted:      { type: Boolean, require: true },
        registeredTime: { type: Date, require: true },
        updatedTime:    { type: Date, require: true },
    });
    mongoose.model('Log', LogSchema);

    mongoose.connect('mongodb://localhost/OekakiChat');

    exports.Room = mongoose.model('Room');
    exports.Log = mongoose.model('Log');
})();
