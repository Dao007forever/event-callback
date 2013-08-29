var url = require("url");
var redis = require("redis");
var http = require("http");
var querystring = require("querystring");
var request = require("request");
var Q = require("q");
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

var db = {
    get: Q.nbind(client.get, client),
    set: Q.nbind(client.set, client),
    incr: Q.nbind(client.incr, client),
    expire: Q.nbind(client.expire, client),
    sadd: Q.nbind(client.sadd, client),
    srem: Q.nbind(client.srem, client),
    smembers: Q.nbind(client.smembers, client),
    del: Q.nbind(client.del, client)
}

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
                db.sadd("event:" + json.event, json.action);
                if (options) {
                    var expire;
                    if (json.options.expire) {
                        expire = parseInt(json.options.expire);
                    } else {
                        // 10 hours
                        expire = 36000;
                    }

                    db.incr("counter")
                    .then(
                        function (reply) {
                            var optionIndex = "option:" + reply;
                            db.sadd("action:" + json.event + ":" + json.action, reply);
                            db.set(optionIndex, options);
                            db.expire(optionIndex, expire);
                        }
                    ).done();
                }
            } else if (json.type == "invoke") {
                console.log(json.event + " happened");
                var event = "event:" + json.event;
                db.smembers(event)
                .then(function(actions) {
                    console.log(actions);
                    console.log("Actions: " + actions);
                    return Q.all(actions.map(
                        function (action) {
                            console.log("Do '" + action + "'");
                            // TODO: wrap this and pass along with the promise
                            var eventAction = "action:" + json.event + ":" + action;
                            return db.smembers(eventAction);
                        })).then(
                            function (options) {
                                console.log(options);
                                console.log("Options: " + options);
                                var merged = [].concat.apply([], options);
                                console.log(merged);
                                return Q.all(merged.map(
                                    function (optionIndex) {
                                        var optionKey = "option:" + optionIndex;
                                        console.log("Option key: " + optionKey);
                                        return db.get(optionKey);
                                    })).then(
                                        function (options) {
                                            console.log(options);
                                            options.forEach(function (option) {
                                                console.log("Testing");
                                                if (option) {
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
                                                            db.srem(eventAction, optionIndex)
                                                            db.del(optionKey)
                                                        } else {
                                                            nonDurable = false;
                                                        }
                                                    }
                                                } else {
                                                    // it expired
                                                    console.log("Expired");
                                                    db.srem(eventAction, optionIndex).done();
                                                }
                                            });
                                        }
                                    );
                            });
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
                    db.smembers(eventAction, function(err, options) {
                        if (options) {
                            db.srem(event, json.action);
                            options.unshift(eventAction);
                            db.del.apply(db, options);
                        }
                    });
                } else {
                    db.smembers(eventAction, function (err, options) {
                        if (options && options.length > 0) {
                            options.forEach(function (optionIndex, i) {
                                var optionKey = "option:" + optionIndex;
                                db.get(optionKey, function (err, option) {
                                    var savedStr;
                                    try {
                                        savedStr = JSON.stringify(JSON.parse(option));
                                    } catch (e) {
                                        console.log(e);
                                    }
                                    if (savedStr) {
                                        if (savedStr == optionStr) {
                                            db.srem(eventAction, optionIndex);
                                            db.del(optionKey);
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
