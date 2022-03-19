(function () {
    'use strict';

    var mongoose = require('mongoose');
    var Schema = mongoose.Schema;

    var RoomSchema = new Schema({
        roomId:              { type: String, require: true, index: true },
        configId:            { type: String, require: true, index: true },
        name:                { type: String, require: true },
        width:               { type: Number, require: true },
        height:              { type: Number, require: true },
        isChatAvailable:     { type: Boolean, require: true },
        isTextChatAvailable: { type: Boolean, require: true },
        isLogAvailable:      { type: Boolean, require: true },
        isLogOpen:           { type: Boolean, require: true },
        registeredTime:      { type: Date, require: true },
        updatedTime:         { type: Date, require: true },
    });
    RoomSchema.set('autoIndex', false);
    mongoose.model('Room', RoomSchema);

    var LogSchema = new Schema({
        roomId:         { type: String, require: true, index: true },
        fileName:       { type: String, require: true, index: true },
        isDeleted:      { type: Boolean, require: true },
        registeredTime: { type: Date, require: true },
        updatedTime:    { type: Date, require: true },
    });
    LogSchema.set('autoIndex', false);
    mongoose.model('Log', LogSchema);

    var ChatSchema = new Schema({
        roomId:         { type: String, require: true, index: true },
        message:        { type: String, require: true},
        registeredTime: { type: Date, require: true, index: true },
        isDeleted:      { type: Boolean, require: true },
    });
    ChatSchema.index({ roomId: 1, registeredTime: 1 });
    ChatSchema.set('autoIndex', false);
    mongoose.model('Chat', ChatSchema);

    var TemporaryLogSchema = new Schema({
        roomId:         { type: String, require: true, index: true },
        log:            { type: Schema.Types.Mixed, require: true },
        registeredTime: { type: Date, require: true },
        updatedTime:    { type: Date, require: true },
        isDeleted:      { type: Boolean, require: true },
    });
    TemporaryLogSchema.set('autoIndex', false);
    mongoose.model('TemporaryLog', TemporaryLogSchema);

    mongoose.connect('mongodb://localhost/OekakiChat', {
        useCreateIndex: true,
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    exports.Room = mongoose.model('Room');
    exports.Log = mongoose.model('Log');
    exports.Chat = mongoose.model('Chat');
    exports.TemporaryLog = mongoose.model('TemporaryLog');
})();
