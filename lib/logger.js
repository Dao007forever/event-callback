var winston = require('winston');
var fs = require('fs');

fs.exists(__dirname + '/../logs', function(exists) {
    if (!exists) {
        fs.mkdir(__dirname + '/../logs', function(err) {
            if (err) throw err;
        });
    }
});

// Define levels to be like log4j in java
var customLevels = {
    levels: {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    },
    colors: {
        debug: 'blue',
        info: 'green',
        warn: 'yellow',
        error: 'red'
    }
};

// create the main logger
var mainLogger = new(winston.Logger)({
    level: 'debug',
    levels: customLevels.levels,
    transports: [
        new winston.transports.File({
            filename: __dirname + '/../logs/debug.log',
            maxsize: 1024 * 1024 * 10, // 10MB
            level: 'debug',
            levels: customLevels.levels,
            json: false
        })
    ],
    exitOnError: false
});

// make winston aware of your awesome colour choices
winston.addColors(customLevels.colors);

var Logging = function() {
    // always return the singleton instance, if it has been initialised once already.
    if (Logging.prototype._singletonInstance) {
        return Logging.prototype._singletonInstance;
    }

    this.loggers = {
        main : mainLogger
    };

    this.get = function(name) {
        return this.loggers[name];
    }

    Logging.prototype._singletonInstance = this;
};

new Logging(); // Force instantiation of the singleton logger here

module.exports.Logging = Logging;
