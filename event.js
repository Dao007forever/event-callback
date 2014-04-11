var url = require("url");
var redis = require("redis");
var http = require("http");
var Handler = require("./src/handler");
var config = require("./config");

// Create only 1 client and login
client = redis.createClient(config.redis.port, config.redis.host);
client.auth(config.redis.password, function () {
    console.log("Logged in");
    client.setnx("counter", 0);
});

var handler = new Handler(client);

client.on("error", function (err) {
    console.log("Error " + err);
});

// Send QUIT command to Redis on exit
process.on("exit", function() {
    client.quit();
    console.log("About to exit");
});

http.createServer(function (req, res) {
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
        console.log(req.content);
        try {
            json = JSON.parse(req.content);
        } catch (e) {
            console.log(e);
        }

        if (validate(json)) {
            console.log(json.type);
            if (json.type == "register") {
                handler.register(json);
            } else if (json.type == "invoke") {
                handler.invoke(json);
            } else if (json.type == "delete") {
                handler.delete(json);
            }
        }

        res.end('{"status":"success"}');
    });
}).listen(config.web.port);

function validate (obj) {
    if (obj) {
        if (obj.type && obj.event) {
            return true;
        }
    }
    console.log("FAILED");
    return false;
}

