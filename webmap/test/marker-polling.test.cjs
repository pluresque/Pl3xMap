const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');

function setup() {
    const timers = new Map();
    const requests = [];
    let nextId = 0;
    let mutations = 0;
    class LayerGroup {
        setZIndex() {}
        clearLayers() { mutations++; }
        removeFrom() {}
        removeLayer() {}
    }
    const mocks = {
        leaflet: {LayerGroup},
        '../Pl3xMap': {Pl3xMap: {instance: {map: {}}}},
        '../util/Util': {
            isset: value => value !== null && value !== undefined,
            fireCustomEvent() {}, removeCss() {}
        },
        '../marker/options/MarkerOptions': {MarkerOptions: class {}},
        '../marker/Marker': {Type: class {}}
    };
    for (const type of ['Circle', 'Ellipse', 'Icon', 'MultiPolygon', 'MultiPolyline', 'Polygon', 'Polyline', 'Rectangle']) {
        mocks[`../marker/${type}`] = {[type]: class {}};
    }
    const {MarkerLayer} = load('src/layergroup/MarkerLayer.ts', mocks, {
        EventSource: {OPEN: 1},
        setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        fetch(url, options) {
            return new Promise((resolve, reject) => requests.push({url, options, resolve, reject}));
        },
        console: {warn() {}}
    });
    const layer = new MarkerLayer('test', 'Test', 1, true, false, 0, 500);
    layer.parseMarker = data => ({
        key: data.data.key,
        update() { mutations++; },
        marker: {addTo() { mutations++; }, remove() { mutations++; }}
    });
    const world = {name: 'world'};
    const response = data => ({ok: true, json: async () => data});
    const marker = key => [{type: 'icon', data: {key}}];
    return {layer, world, timers, requests, response, marker, mutations: () => mutations};
}

test('push updates do not multiply the fallback polling timer', async () => {
    const s = setup();
    const update = s.layer.update(s.world, true);
    s.requests[0].resolve(s.response([]));
    await update;
    for (let i = 0; i < 1000; i++) s.layer.updateMarkers([], s.world);
    assert.equal(s.timers.size, 1);
    assert.equal(s.requests.length, 1);
});

test('overlapping refreshes share one in-flight request', async () => {
    const s = setup();
    const first = s.layer.update(s.world, true);
    await s.layer.update(s.world, true);
    assert.equal(s.requests.length, 1);
    s.requests[0].resolve(s.response([]));
    await first;
    assert.equal(s.timers.size, 1);
});

test('a failed request schedules a retry', async () => {
    const s = setup();
    const first = s.layer.update(s.world, true);
    s.requests[0].resolve({ok: false, status: 503});
    await first;
    assert.equal(s.timers.size, 1);
    const retry = [...s.timers.values()][0];
    retry();
    assert.equal(s.requests.length, 2);
    s.layer.unload();
    s.requests[1].reject(new Error('aborted'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(s.timers.size, 0);
});

test('unloading aborts requests and ignores late responses', async () => {
    const s = setup();
    const first = s.layer.update(s.world, true);
    s.layer.unload();
    const mutations = s.mutations();
    assert.equal(s.requests[0].options.signal.aborted, true);
    s.requests[0].resolve(s.response(s.marker('late')));
    await first;
    assert.equal(s.mutations(), mutations);
    assert.equal(s.timers.size, 0);
});

test('an older HTTP response cannot replace a newer push update', async () => {
    const s = setup();
    const first = s.layer.update(s.world, true);
    s.layer.updateMarkers(s.marker('new'), s.world);
    const mutations = s.mutations();
    s.requests[0].resolve(s.response(s.marker('old')));
    await first;
    assert.equal(s.mutations(), mutations);
});

test('unchanged marker payloads skip Leaflet mutations', () => {
    const s = setup();
    s.layer.updateMarkers(s.marker('station'), s.world);
    const mutations = s.mutations();
    for (let i = 0; i < 1000; i++) s.layer.updateMarkers(s.marker('station'), s.world);
    assert.equal(s.mutations(), mutations);
});

test('the SSE watchdog reschedules instead of permanently stopping', async () => {
    const s = setup();
    s.world.eventSource = {readyState: 1};
    s.layer.timestamp = Date.now();
    await s.layer.update(s.world);
    assert.equal(s.requests.length, 0);
    assert.equal(s.timers.size, 1);
    s.layer.timestamp = 0;
    const retry = [...s.timers.values()][0];
    retry();
    assert.equal(s.requests.length, 1);
    s.layer.unload();
    s.requests[0].reject(new Error('aborted'));
    await new Promise(resolve => setImmediate(resolve));
});
