const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');
const {parsePreferences} = load('src/metro/RailwayPreferences.ts');

test('railways and station labels default to visible', () => {
    for (const saved of [null, '{broken', 'null', '{}']) {
        assert.equal(parsePreferences(saved).visible, true);
        assert.equal(parsePreferences(saved).labels, true);
    }
});

test('saved railway and label choices are independent', () => {
    const hiddenRailway = parsePreferences('{"visible":false,"labels":true}');
    assert.equal(hiddenRailway.visible, false);
    assert.equal(hiddenRailway.labels, true);
    const hiddenLabels = parsePreferences('{"visible":true,"labels":false}');
    assert.equal(hiddenLabels.visible, true);
    assert.equal(hiddenLabels.labels, false);
});

test('existing browsers keep their station-label preference', () => {
    const previous = parsePreferences('{"scheme":true,"labels":false,"plans":false}');
    assert.equal(previous.visible, true);
    assert.equal(previous.labels, false);
});
