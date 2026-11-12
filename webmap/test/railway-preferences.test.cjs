const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');
const {parsePreferences} = load('src/metro/RailwayPreferences.ts');

test('the railway defaults to visible', () => {
    for (const saved of [null, '{broken', 'null', '{}']) {
        assert.equal(parsePreferences(saved).visible, true);
    }
});

test('a saved railway choice is preserved across preference versions', () => {
    assert.equal(parsePreferences('{"visible":false,"labels":true}').visible, false);
    assert.equal(parsePreferences('{"visible":true,"labels":false}').visible, true);
    assert.equal(parsePreferences('{"scheme":true,"labels":false}').visible, true);
});
