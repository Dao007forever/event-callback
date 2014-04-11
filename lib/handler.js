var Q = require("q");
var querystring = require("querystring");
var request = require("request");
var timer = require("timers");

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
    self.client.sadd("event:" + json.event, json.action);
    if (options) {
        var expire;
        if (json.options.expire) {
            expire = parseInt(json.options.expire);
        } else {
            // 10 hours
            expire = 36000;
        }

        self.db.incr("counter")
            .then(
                function (reply) {
                    var optionIndex = "option:" + reply;
                    // Each action is given an id
                    self.db.sadd("action:" + json.event + ":" + json.action, reply);
                    self.db.set(optionIndex, options);
                    self.db.expire(optionIndex, expire);
                }
            ).done();
    }
}

Handler.prototype.invoke = function (json) {
    var self = this;
    console.log("Invoke '" + json.event + "'' happened");
    var event = "event:" + json.event;
    self.db.smembers(event)
        .then(function(actions) {
            console.log("Actions: " + actions);
            var promises = actions.map(
                function (action) {
                    console.log("Do '" + action + "'");
                    // The key of the action
                    var eventAction = "action:" + json.event + ":" + action;
                    // return a promise of action ids and the action name
                    return compose(self.db.smembers(eventAction), eventAction);
                }
            );
            return Q.all(promises);
        })
        .then(function (options) {
            console.log("Options: ");
            console.log(options);
            options.forEach(
                function (optionAction) {
                    var eventAction = optionAction[1];
                    optionAction[0].forEach(function (index) {
                        var optionKey = "option:" + index;
                        console.log("Option key: " + optionKey);
                        self.db.get(optionKey)
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
                                            self.client.srem(eventAction, index);
                                            self.client.del(optionKey);
                                        }
                                    }
                                } else {
                                    // it expired
                                    console.log("Expired");
                                    self.client.srem(eventAction, index);
                                }
                            }).done();
                    });
                });
        }).done();
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
        self.db.smembers(eventAction)
            .then(function (options) {
                self.db.srem(event, json.action);
                var optionKeys = options.map(function (index) {
                    return "option:" + index;
                });
                optionKeys.unshift(eventAction);
                console.log(optionKeys);
                self.client.del(optionKeys);
            }).done();
    } else {
        // Remove only the actions that have options matching the given option
        self.db.smembers(eventAction)
            .then(function (options) {
                console.log(options);
                options.forEach(function (optionIndex) {
                    var optionKey = "option:" + optionIndex;
                    console.log(optionKey);
                    self.db.get(optionKey)
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
                                    self.client.srem(eventAction, optionIndex);
                                    self.client.del(optionKey);
                                }
                            }
                        }).done();
                });
            }).done();
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
