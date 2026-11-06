const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {parseMetroConfig} = load('src/metro/MetroNetwork.ts');
const example = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/metro.json')));

test('parses coordinate routes and a shared interchange', () => {
    const world = parseMetroConfig(example()).get('world');
    assert.equal(world.stations.length, 5);
    assert.equal(world.lines.length, 2);
    assert.equal(world.lines.filter(line => line.stations.includes('central')).length, 2);
    assert.equal(world.stations[0].x, -1000);
});

test('keeps world networks separate and accepts an empty configuration', () => {
    assert.equal(parseMetroConfig({version: 1, worlds: {}}).size, 0);
    const data = example();
    data.worlds.world_nether = structuredClone(data.worlds.world);
    assert.equal(parseMetroConfig(data).size, 2);
});

for (const [description, mutate] of [
    ['unknown station', data => data.worlds.world.lines[0].stations.push('missing')],
    ['duplicate station', data => data.worlds.world.stations.push(data.worlds.world.stations[0])],
    ['duplicate line', data => data.worlds.world.lines.push(data.worlds.world.lines[0])],
    ['duplicate stop', data => data.worlds.world.lines[0].stations.push('west')],
    ['invalid coordinate', data => data.worlds.world.stations[0].x = Infinity],
    ['out-of-world coordinate', data => data.worlds.world.lines[0].points[0][0] = 30000001],
    ['string coordinate', data => data.worlds.world.lines[0].points[0][0] = '-1000'],
    ['invalid color', data => data.worlds.world.lines[0].color = 'url(https://example.com)'],
    ['incomplete route', data => data.worlds.world.lines[0].points = [[0, 0]]],
    ['wrong version', data => data.version = 2],
]) {
    test(`rejects ${description}`, () => {
        const data = example();
        mutate(data);
        assert.throws(() => parseMetroConfig(data));
    });
}
