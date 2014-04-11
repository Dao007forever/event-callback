var should = require('chai').should();
var redis = require('node-redis-mock');
var Q = require('q');

var Handler = require('../lib/handler');

function PromiseClient(client) {
    this.get = Q.denodeify(client.get.bind(client));
    this.set = Q.denodeify(client.set.bind(client));
    this.incr = Q.denodeify(client.incr.bind(client));
    this.expire = Q.denodeify(client.expire.bind(client));
    this.sadd = Q.denodeify(client.sadd.bind(client));
    this.srem = Q.denodeify(client.srem.bind(client));
    this.smembers = Q.denodeify(client.smembers.bind(client));
    this.del = Q.denodeify(client.del.bind(client));
}

describe('Handler', function() {
    describe('register', function() {
        it('should add the action (with options) to the list', function(done) {
            var client = redis.createClient();
            var handler = new Handler(client);
            var pclient = new PromiseClient(client);
            var json = {
                event : 'test',
                action: 'action',
                options: {
                    url: "http://example.com"
                }
            };

            handler.register(json);
            pclient.smembers('event:test')
                .then(function (actions) {
                    actions.should.eql([ 'action' ]);
                    return pclient.get('counter');
                })
                .then(function (index) {
                    index.should.equal('1');
                    return pclient.smembers('action:test:action');
                })
                .then(function (indexes) {
                    indexes.should.eql([ '1' ]);
                    return pclient.get('option:1');
                })
                .then(function (options) {
                    options.should.equal(JSON.stringify(json.options));
                    done();
                });
        });
    });

    describe('invoke', function() {
        it('should call action')
    });
});
