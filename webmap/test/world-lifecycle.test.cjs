const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');

function setup() {
    const pending = [];
    const sources = [];
    let created = 0;
    class EventSource {
        constructor() { sources.push(this); }
        addEventListener() {}
        close() { this.closed = true; }
    }
    class MarkerLayer {
        constructor() { created++; }
        update() {}
        unload() { this.unloaded = true; }
    }
    const {World} = load('src/world/World.ts', {
        '../settings/Lang': {Label: class {}},
        '../palette/BlockInfo': {BlockInfo: class {}},
        '../tilelayer/DoubleTileLayer': {DoubleTileLayer: class {}},
        '../layergroup/MarkerLayer': {MarkerLayer},
        '../util/Util': {getJSON: () => new Promise(resolve => pending.push(resolve))}
    }, {EventSource});
    const world = new World({}, {}, {name: 'world'});
    return {world, pending, sources, created: () => created};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a world unloaded during layer discovery cannot resurrect marker layers', async () => {
    const s = setup();
    s.world.loadMarkers();
    s.world.unload();
    s.pending[0]([{key: 'stale'}]);
    await settle();
    assert.equal(s.created(), 0);
    assert.equal(s.sources[0].closed, true);
    assert.equal(s.world.markerLayers.length, 0);
});

test('only the latest marker discovery response is applied', async () => {
    const s = setup();
    s.world.loadMarkers();
    s.world.loadMarkers();
    s.pending[1]([{key: 'current'}]);
    await settle();
    s.pending[0]([{key: 'old'}]);
    await settle();
    assert.equal(s.created(), 1);
    assert.equal(s.world.markerLayers.length, 1);
    assert.equal(s.sources[0].closed, true);
    s.world.unload();
});
