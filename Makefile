REPORTER = dot

test:
	@NODE_ENV=test ./node_modules/.bin/mocha --reporter $(REPORTER)

test-debug:
	@NODE_ENV=test ./node_modules/.bin/mocha --debug-brk --reporter $(REPORTER)

test-w:
	@NODE_ENV=test ./node_modules/.bin/mocha --reporter $(REPORTER) \
		--watch

.PHONY: test test-debug test-w
