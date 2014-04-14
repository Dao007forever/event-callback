var url = require("url");
var redis = require("redis");
var http = require("http");
var Handler = require("./lib/handler");
var logging = require("./lib/logger");
var config = require("config");

var logger = logging.Logging().get('main');

// Create only 1 client and login
client = redis.createClient(config.Redis.port, config.Redis.host);
if (config.Redis.password) {
    client.auth(config.Redis.password, function () {
        logger.debug("Logged in");
        client.setnx("counter", 0);
    });
}

var handler = new Handler(client);

client.on("error", function (err) {
    logger.debug("Error " + err);
});

// Send QUIT command to Redis on exit
process.on("exit", function() {
    client.quit();
    logger.debug("About to exit");
});

http.createServer(function (req, res) {
    var successEnd = function() {
        res.end('{"status":"success"}');
    };

    var failEnd = function(err) {
        res.end('{"status":"fail"}');
        if (err) {
            logger.error(err.message);
        }
    }

    req.content = "";
    // Dealing with multipart
    req.addListener("data", function(chunk) {
        // concat is faster than array join
        req.content += chunk;
        if (req.content.length > 1e6) {
            // Return 413 if the request is too long
            response.writeHead(413, {'Content-Type': 'text/plain'}).end();
            req.connection.destroy();
        }
    });

    req.addListener("end", function() {
        // parse req.content and do stuff with it
        var json;
        logger.debug(req.content);
        try {
            json = JSON.parse(req.content);
        } catch (e) {
            logger.debug(e.message);
        }

        if (validate(json)) {
            logger.debug(json.type);
            if (json.type == "register") {
                handler.register(json)
                    .done(successEnd, failEnd);
            } else if (json.type == "invoke") {
                handler.invoke(json)
                    .done(successEnd, failEnd);
            } else if (json.type == "delete") {
                handler.delete(json)
                    .done(successEnd, failEnd);
            }
        } else {
            failEnd(new Error("Invalid JSON type or event"));
        }
    });
}).listen(config.Web.port);

function validate (obj) {
    if (obj) {
        if (obj.type && obj.event) {
            return true;
        }
    }
    logger.debug("FAILED");
    return false;
}

