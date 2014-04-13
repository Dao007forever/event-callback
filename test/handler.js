var proxyquire = require('proxyquire');
var should = require('chai').should();
var redis = require('node-redis-mock');
var sinon = require('sinon');
var Q = require('q');

var timer = { setTimeout : function() {console.log("AAAAAAAAAAAA");} };
var Handler = proxyquire('../lib/handler',
                         {
                             'timers' : timer
                         });

function PromiseClient(client) {
    this.get = Q.denodeify(client.get.bind(client));
    this.set = Q.denodeify(client.set.bind(client));
    this.incr = Q.denodeify(client.incr.bind(client));
    this.expire = Q.denodeify(client.expire.bind(client));
    this.sadd = Q.denodeify(client.sadd.bind(client));
    this.srem = Q.denodeify(client.srem.bind(client));
    this.smembers = Q.denodeify(client.smembers.bind(client));
    this.del = Q.denodeify(client.del.bind(client));
    this.exists = Q.denodeify(client.exists.bind(client));
}

describe('Handler', function() {
    var client, handler, pclient;

    beforeEach(function() {
        client = redis.createClient();
        handler = new Handler(client);
        pclient = new PromiseClient(client);
    });

    describe('register', function() {
        it('should add the action (with options) to the list', function(done) {
            var json = {
                event : 'test',
                action: 'action',
                options: {
                    url: "http://example.com"
                }
            };

            handler.register(json)
                .then(function() {
                    return Q.all([
                        pclient.smembers('event:test'),
                        pclient.get('counter'),
                        pclient.smembers('action:test:action'),
                        pclient.get('option:1')
                    ])
                        .spread(function (actions, index, indexes, options) {
                            actions.should.eql([ 'action' ]);
                            index.should.equal('1');
                            indexes.should.eql([ '1' ]);
                            options.should.equal(JSON.stringify(json.options));
                            done();
                        });
                }).done();
        });
    });

    describe('invoke', function() {
        it('should do registered actions', function(done) {
            var options = { url: 'http://example.com' };
            var json = { event: 'test' };
            var mock = sinon.mock(timer);
            mock.expects('setTimeout').once();

            Q.all([
                pclient.sadd('event:test', 'action'),
                pclient.sadd('action:test:action', '1'),
                pclient.set('option:1', JSON.stringify(options))
            ])
                .then(function() {
                    return handler.invoke(json)
                        .then(function() {
                            mock.verify();
                            done();
                        });
                }).done();
        });
    });

    describe('delete', function(done) {
        it('should remove all the actions if no options is given', function(done) {
            var options1 = { url: 'http://example.com' };
            var options2 = { url: 'http://example2.com' };
            var json = { event: 'test', action: 'action' };

            Q.all([
                pclient.sadd('event:test', 'action'),
                pclient.sadd('action:test:action', '1'),
                pclient.sadd('action:test:action', '2'),
                client.set('option:1', JSON.stringify(options1)),
                client.set('option:2', JSON.stringify(options2)),
            ])
                .then(function() {
                    return handler.delete(json)
                        .then(function() {
                            return Q.all([
                                pclient.smembers('event:test'),
                                pclient.exists('action:test:action'),
                                pclient.exists('option:1'),
                                pclient.exists('option:2')
                            ])
                                .spread(function(actions, actionExists, option1, option2) {
                                    actions.should.eql([]);
                                    actionExists.should.equal(0);
                                    option1.should.equal(0);
                                    option2.should.equal(0);
                                    done();
                                });
                        });
                }).done();
        });
    });
});
