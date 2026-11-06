const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');
const {placeLabels} = load('src/metro/LabelLayout.ts');
const bounds = {left: 0, top: 0, right: 500, bottom: 400};
const label = (id, x = 250, y = 200, priority = 2) => ({id, x, y, width: 100, height: 24, priority});

test('crowded labels are hidden instead of being drawn on top of one another', () => {
    const crowded = Array.from({length: 12}, (_,i) => label(`station-${i}`, 245+i, 200));
    const placed = placeLabels(crowded, bounds);
    assert.ok(placed.size > 0 && placed.size < crowded.length);
});

test('hubs keep their labels before lower-priority terminals at the same point', () => {
    const labels = [label('terminal',250,200,1), label('hub',250,200,0), label('landmark',250,200,3)];
    assert.equal([...placeLabels(labels,bounds).keys()][0], 'hub');
});

test('labels can move to the other side to avoid the open sidebar', () => {
    const sidebar = {left: 280, top: 0, right: 500, bottom: 400};
    assert.equal(placeLabels([label('hub')],bounds,[sidebar]).get('hub'),'left');
});

test('labels do not overlap foreign tooltips or leave the map viewport', () => {
    assert.equal(placeLabels([label('edge',5,5)], bounds).size,0);
    assert.equal(placeLabels([label('covered')], bounds, [bounds]).size,0);
});

test('zooming out displays fewer labels while keeping hub priority', () => {
    const close = Array.from({length: 6},(_,i)=>label(`s${i}`,70+i*65,60+(i%2)*130,i?1:0));
    const far = close.map((l,i)=>({...l,x:245+i*2,y:200}));
    assert.ok(placeLabels(close,bounds).size > placeLabels(far,bounds).size);
    assert.ok(placeLabels(far,bounds).has('s0'));
});

test('placement is stable across different input ordering', () => {
    const items=[label('c'),label('a'),label('b')];
    assert.equal(JSON.stringify([...placeLabels(items,bounds)]),JSON.stringify([...placeLabels([...items].reverse(),bounds)]));
});
