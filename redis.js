var redis = require("redis");
var net = require("net");
client = redis.createClient();

client.on("error", function (err) {
    console.log("Error " + err);
});

process.on("exit", function() {
    client.quit();
    console.log("About to exit");
});

net.createServer(function (socket) {
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    socket.setEncoding("utf8");

    socket.on('data', function (data) {
        var s = data.replace(/(\n|\r|\r\n)$/, '')
        var event = s.split(" ");
        if (event.length >= 2) {
            var a = event[0], b = event[1], option = event[2];
            console.log("Register '" + a + "' => '" + b + "' with option '" + option + "'");
            client.sadd(a, b + " " + option);
        } else if (event.length == 1) {
            var a = event[0];
            client.smembers(a, function (err, replies) {
                if (replies) {
                    replies.forEach(function(reply, i) {
                        console.log("Do '" + reply + "'");
                        var option = reply.split(" ")[1];
                        if (option == "autokill") {
                            client.srem(a, reply);
                        }
                    });
                } else {
                    console.log("No matching rule for ''" + a + "'");
                }
            });
        }
    });
}).listen(5000);
