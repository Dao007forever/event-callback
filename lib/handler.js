var Q = require("q");
var querystring = require("querystring");
var request = require("request");
var timer = require("timers");
var util = require("util");

function Handler(client) {
    this.client = client;
    // Wrap node-redis in Q-promise
    this.db = {
        get: Q.denodeify(client.get.bind(client)),
        set: Q.denodeify(client.set.bind(client)),
        incr: Q.denodeify(client.incr.bind(client)),
        expire: Q.denodeify(client.expire.bind(client)),
        sadd: Q.denodeify(client.sadd.bind(client)),
        srem: Q.denodeify(client.srem.bind(client)),
        smembers: Q.denodeify(client.smembers.bind(client)),
        del: Q.denodeify(client.del.bind(client))
    };
}

Handler.prototype.register = function (json) {
    var self = this;
    var options;
    if (json.options) {
        options = JSON.stringify(json.options);
    }
    console.log("Register '" + json.event + "' => '" + json.action + "' with option '" + options + "'");

    // Each event will contain a set of actions
    return self.db.sadd("event:" + json.event, json.action)
        .then(function() {
            if (options) {
                var expire;
                if (json.options.expire) {
                    expire = parseInt(json.options.expire);
                } else {
                    // 10 hours
                    expire = 36000;
                }
                return Q.all([ self.db.incr("counter"), expire ]);
            }
        })
        .spread(function (reply, expire) {
            var optionIndex = "option:" + reply;
            // Each action is given an id
            return Q.all(
                [
                    self.db.sadd("action:" + json.event + ":" + json.action, reply),
                    self.db.set(optionIndex, options),
                    self.db.expire(optionIndex, expire)
                ]);
        });
}

Handler.prototype.invoke = function (json) {
    var self = this;
    console.log("Invoke '" + json.event + "' happened");
    var event = "event:" + json.event;
    return self.db.smembers(event)
        .then(function(actions) {
            console.log("Actions: " + util.inspect(actions));
            return Q.all(actions.map(
                function (action) {
                    // The key of the action
                    var eventAction = "action:" + json.event + ":" + action;
                    // return a promise of action ids and the action name
                    return compose(self.db.smembers(eventAction), eventAction);
                }
            ));
        })
        .then(function (options) {
            console.log("Options: " + util.inspect(options));
            return Q.all(options.map(
                function (optionAction) {
                    var eventAction = optionAction[1];
                    return Q.all(optionAction[0].map(function (index) {
                        var optionKey = "option:" + index;
                        console.log("Option key: " + optionKey);
                        return self.db.get(optionKey)
                            .then(function (option) {
                                if (option) {
                                    console.log("Option: " + option);
                                    var jsOption;
                                    try {
                                        jsOption = JSON.parse(option);
                                    } catch (e) {
                                        console.log(e);
                                    }
                                    if (jsOption) {
                                        // wait 1s before doPost, open may not have created UserApp
                                        timer.setTimeout(doPost, 1000, jsOption, 3);
                                        // Remove the action if it's not durable
                                        if (jsOption.durable !== true) {
                                            return Q.all(
                                                [
                                                    self.db.srem(eventAction, index),
                                                    self.db.del(optionKey)
                                                ]);
                                        }
                                    }
                                } else {
                                    // it expired
                                    console.log("Expired");
                                    return self.db.srem(eventAction, index);
                                }
                            });
                    }));
                }));
        });
}

Handler.prototype.delete = function (json) {
    var self = this;
    var optionStr;
    if (json.options) {
        optionStr = JSON.stringify(json.options);
    }
    console.log("Delete '" + json.event + "' => '" + json.action + "' with option '" + optionStr + "'");
    var event = "event:" + json.event;
    var eventAction = "action:" + json.event + ":" + json.action;
    if (!optionStr) {
        // Remove all the action ids
        return self.db.smembers(eventAction)
            .then(function (options) {
                options = options || [];
                var optionKeys = options.map(function (index) {
                    return "option:" + index;
                });
                optionKeys.unshift(eventAction);
                console.log(optionKeys);
                return Q.all([
                    self.db.srem(event, json.action),
                    self.db.del(optionKeys)
                ]);
            });
    } else {
        // Remove only the actions that have options matching the given option
        return self.db.smembers(eventAction)
            .then(function (options) {
                console.log(options);
                return Q.all(options.map(function (optionIndex) {
                    var optionKey = "option:" + optionIndex;
                    console.log(optionKey);
                    return self.db.get(optionKey)
                        .then(function (option) {
                            var savedStr;
                            try {
                                savedStr = JSON.stringify(JSON.parse(option));
                            } catch (e) {
                                console.log(e);
                            }
                            console.log("In db  : " + savedStr);
                            console.log("Receive: " + optionStr);
                            if (savedStr) {
                                if (savedStr == optionStr) {
                                    return Q.all([
                                        self.db.srem(eventAction, optionIndex),
                                        self.db.del(optionKey)
                                    ]);
                                }
                            }
                        });
                }));
            });
    }
}

// This function will transform an array of arguments containing promises into a promise, e.g
// [promise, A, B, ...] => all(promise, promise resolving to A, promise resolving to B, ...)
// We do this because Q.all() only accepts an array of promises
function compose() {
    var args = Array.prototype.slice.apply(arguments);
    return Q.all(args);
}

function doPost (options, retry) {
    retry = retry || 0;
    if (retry == 0) {
        return;
    }

    var url = options.url;
    var body = querystring.stringify(options.body);
    // An object of options to indicate where to post to
    var postOptions = {
        uri: url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
        },
        body: body
    };

    request(postOptions, function(err, response, body) {
        console.log(options);
        if (!err && response.statusCode == 200) {
            console.log("Status code: " + response.statusCode);
            console.log(body);
            try {
                bodyJson = JSON.parse(body);
            } catch (e) {
                console.log(e);
                timer.setTimeout(doPost, 1000, options, retry - 1);
            }
            if (bodyJson.status != "success_ok") {
                timer.setTimeout(doPost, 1000, options, retry - 1);
            }
        } else {
            console.log("Error :" + err);
            console.log("Status code: " + response.statusCode);
            timer.setTimeout(doPost, 1000, options, retry - 1);
        }
    });
}

module.exports = Handler;
