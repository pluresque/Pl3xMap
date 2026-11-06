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
    ['negative corner radius', data => data.worlds.world.lines[0].cornerRadius = -1],
    ['excessive corner radius', data => data.worlds.world.lines[0].cornerRadius = 257],
    ['invalid corner radius', data => data.worlds.world.lines[0].cornerRadius = '20'],
    ['diagonal segment', data => data.worlds.world.lines[0].points = [[0, 0], [100, 100]]],
    ['duplicate route point', data => data.worlds.world.lines[0].points = [[0, 0], [0, 0]]],
    ['incomplete route', data => data.worlds.world.lines[0].points = [[0, 0]]],
    ['wrong version', data => data.version = 2],
]) {
    test(`rejects ${description}`, () => {
        const data = example();
        mutate(data);
        assert.throws(() => parseMetroConfig(data));
    });
}


test('preserves every real turn instead of joining stations diagonally', () => {
    const data = example();
    const points = [[0, 0], [40, 0], [40, 80], [-20, 80], [-20, 120]];
    data.worlds.world.lines[0].points = points;
    const line = parseMetroConfig(data).get('world').lines[0];
    assert.equal(JSON.stringify(line.points), JSON.stringify(points));
});

test('optional rounding preserves the authored orthogonal corridor', () => {
    const data = example();
    data.worlds.world.lines[0].cornerRadius = 48;
    const line = parseMetroConfig(data).get('world').lines[0];
    assert.equal(line.cornerRadius,48);
    assert.equal(JSON.stringify(line.points),JSON.stringify(data.worlds.world.lines[0].points));
});

test('accepts a closed orthogonal loop without repeating the stop list', () => {
    const data = example();
    data.worlds.world.lines[0].points = [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]];
    assert.equal(parseMetroConfig(data).get('world').lines[0].points.length, 5);
});


test('keeps parallel tracks and disconnected sections as separate paths', () => {
    const data = example();
    const line = data.worlds.world.lines[0];
    delete line.points;
    line.paths = [[[0, 0], [100, 0]], [[0, 3], [100, 3]], [[200, 40], [200, 80]]];
    const parsed = parseMetroConfig(data).get('world').lines[0];
    assert.equal(parsed.paths.length, 3);
    assert.equal(JSON.stringify(parsed.paths), JSON.stringify(line.paths));
});

test('rejects an invalid secondary path', () => {
    const data = example();
    const line = data.worlds.world.lines[0];
    delete line.points;
    line.paths = [[[0, 0], [100, 0]], [[0, 3], [100, 4]]];
    assert.throws(() => parseMetroConfig(data));
});

test('rejects ambiguous points plus paths input', () => {
    const data = example();
    data.worlds.world.lines[0].paths = [[[0, 0], [100, 0]]];
    assert.throws(() => parseMetroConfig(data));
});

function railway() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/railway.json')));
}

test('hub connections use two hub colors and receive thicker styling', () => {
    const network = parseMetroConfig(railway()).get('world');
    const link = network.lines.find(line => line.id === 'hubs');
    assert.equal(link.hubLink, true);
    assert.equal(link.color, '#e05252');
    assert.equal(link.secondaryColor, '#ec963d');
    assert.equal(link.stations.join(','), 'north,central');
});

test('branches inherit the terminal color regardless of endpoint order', () => {
    const data = railway();
    const branch = data.worlds.world.connections[1];
    branch.from = 'pink'; branch.to = 'north';
    const parsed = parseMetroConfig(data).get('world').lines[1];
    assert.equal(parsed.color,'#e98fb6');
    assert.equal(parsed.hubLink,false);
});

test('planned paths and planned stations preserve their explicit status', () => {
    const world = parseMetroConfig(railway()).get('world');
    assert.equal(world.lines.find(line => line.id === 'white-plan').planned,true);
    assert.equal(world.lines[0].planned,false);
    assert.equal(world.stations.find(station => station.id === 'white').planned,true);
});

test('station colors and connection endpoints are validated', () => {
    const data = railway();
    data.worlds.world.stations[0].color = 'red';
    assert.throws(()=>parseMetroConfig(data));
    data.worlds.world.stations[0].color = '#ffffff';
    data.worlds.world.connections[0].to = 'missing';
    assert.throws(()=>parseMetroConfig(data));
});

test('a connection must include both of its endpoint stations', () => {
    const data = railway();
    data.worlds.world.connections[0].stations = ['north'];
    assert.throws(()=>parseMetroConfig(data));
});

test('an approximate proposal can start hidden without removing its geometry',()=>{
    const data=railway();
    data.worlds.world.connections[2].defaultHidden=true;
    const connection=parseMetroConfig(data).get('world').lines[2];
    assert.equal(connection.defaultHidden,true);
    assert.equal(connection.paths.length,1);
});
