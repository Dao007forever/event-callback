var url = require("url");
var redis = require("redis");
var http = require("http");
var querystring = require("querystring");
var request = require("request");
// This auth_pass hasn't been released
client = redis.createClient(19844, "pub-redis-19844.us-east-1-4.3.ec2.garantiadata.com", {auth_pass: "hoiio123kid"});
client.auth("hoiio123kid", function () {
    console.log("Logged in");
    client.setnx("counter", 0);
});

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
                var options;
                if (json.options) {
                    options = JSON.stringify(json.options);
                }
                console.log("Register '" + json.event + "' => '" + json.action + "' with option '" + options + "'");
                client.sadd("event:" + json.event, json.action);
                if (options) {
                    client.incr("counter", function (err, reply) {
                        client.sadd("action:" + json.event + ":" + json.action, reply);
                        client.set("option:" + reply, options);
                    });
                }
            } else if (json.type == "invoke") {
                console.log(json.event + " happened");
                var event = "event:" + json.event;
                client.smembers(event, function(err, actions) {
                    if (actions) {
                        actions.forEach(function (action, i) {
                            console.log("Do '" + action + "'");
                            var eventAction = "action:" + json.event + ":" + action;
                            client.smembers(eventAction, function (err, options) {
                                if (options && options.length > 0) {
                                    options.forEach(function (optionIndex, i) {
                                        var optionKey = "option:" + optionIndex;
                                        client.get(optionKey, function (err, option) {
                                            console.log("Option: " + option);
                                            var jsOption;
                                            try {
                                                jsOption = JSON.parse(option);
                                            } catch (e) {
                                                console.log(e);
                                            }
                                            if (jsOption) {
                                                console.log(jsOption);
                                                doPost(jsOption);
                                                if (jsOption.durable !== true) {
                                                    client.srem(eventAction, optionIndex);
                                                    client.del(optionKey);
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        });
                    }
                });
            } else if (json.type == "delete") {
                var optionStr;
                if (json.options) {
                    optionStr = JSON.stringify(json.options);
                }
                console.log("Delete '" + json.event + "' => '" + json.action + "' with option '" + optionStr + "'");
                var event = "event:" + json.event;
                var eventAction = "action:" + json.event + ":" + json.action;
                if (!optionStr) {
                    client.srem(event, json.action);
                    client.del(eventAction);
                } else {
                    client.smembers(eventAction, function (err, options) {
                        if (options && options.length > 0) {
                            options.forEach(function (optionIndex, i) {
                                var optionKey = "option:" + optionIndex;
                                client.get(optionKey, function (err, option) {
                                    var savedStr;
                                    try {
                                        savedStr = JSON.stringify(JSON.parse(option));
                                    } catch (e) {
                                        console.log(e);
                                    }
                                    if (savedStr) {
                                        if (savedStr == optionStr) {
                                            client.srem(eventAction, optionIndex);
                                            client.del(optionKey);
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
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

function doPost (options) {
    var url = options.url;
    var body = querystring.stringify(options.body);
    // An object of options to indicate where to post to
    console.log(body);
    var postOptions = {
        uri: url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
        },
        body: body
    };

    console.log(postOptions);
    request(postOptions, function(err, response, body) {
        if (!err && response.statusCode == 200) {
            console.log(body);
        } else {
            console.log(err);
        }
    });
}
