var url = require("url");
var redis = require("redis");
var http = require("http");
var Handle = require("./handle");
// This auth_pass hasn't been released
client = redis.createClient(19844, "pub-redis-19844.us-east-1-4.3.ec2.garantiadata.com", {auth_pass: "hoiio123kid"});
client.auth("hoiio123kid", function () {
    console.log("Logged in");
    client.setnx("counter", 0);
});

var handle = new Handle(client);

client.on("error", function (err) {
    console.log("Error " + err);
});

process.on("exit", function() {
    client.quit();
    console.log("About to exit");
});

http.createServer(function (req, res) {
    req.content = "";
    req.addListener("data", function(chunk) {
        req.content += chunk;
    });

    req.addListener("end", function() {
        //parse req.content and do stuff with it
        var json;
        try {
            json = JSON.parse(req.content);
        } catch (e) {
            console.log(e);
        }

        if (validate(json)) {
            console.log(json.type);
            if (json.type == "register") {
                handle.register(json);
            } else if (json.type == "invoke") {
                handle.invoke(json);
            } else if (json.type == "delete") {
                handle.delete(json);
            }
        }
    });

    res.end("ack=success");
}).listen(5000);

function validate (obj) {
    if (obj) {
        if (obj.type && obj.event) {
            return true;
        }
    }
    console.log("FAILED");
    return false;
}

