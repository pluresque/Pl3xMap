const assert = require('node:assert/strict');
const {test} = require('node:test');
const load = require('./load-typescript.cjs');
const {roundRoute} = load('src/metro/MetroGeometry.ts');

test('rounding keeps endpoints and follows both chosen legs instead of a diagonal shortcut', () => {
    for (const sign of [-1, 1]) {
        const path = [[0,0],[100,0],[100,sign*100]];
        const rounded = roundRoute(path,20);
        assert.equal(JSON.stringify(rounded[0]),JSON.stringify(path[0]));
        assert.equal(JSON.stringify(rounded.at(-1)),JSON.stringify(path.at(-1)));
        assert.ok(rounded.some(([x,z])=>x===80 && z===0));
        assert.ok(rounded.some(([x,z])=>x===100 && z===sign*20));
        assert.ok(rounded.every(([x,z])=>x>=0 && x<=100 && Math.abs(z)<=100));
        assert.ok(rounded.slice(1,-1).every(([x,z])=>x>=80 && Math.abs(z)<=20));
    }
});

test('large radii cannot cross a short neighboring leg or move a station', () => {
    const path = [[0,0],[100,0],[100,10],[200,10]];
    const rounded = roundRoute(path,256);
    assert.equal(rounded[0][0],0);
    assert.equal(rounded.at(-1)[0],200);
    assert.ok(rounded.every(([x,z])=>x>=0 && x<=200 && z>=-1e-10 && z<=10+1e-10));
    assert.ok(rounded.slice(1).every(([x],i)=>x>=rounded[i][0]-1e-10));
});

test('unsmoothed surveyed paths preserve all original vertices', () => {
    const surveyed = [[0,0],[1,0],[1,1]];
    assert.equal(roundRoute(surveyed,0),surveyed);
    const straight = [[0,0],[10,0],[20,0]];
    assert.equal(JSON.stringify(roundRoute(straight,10)),JSON.stringify(straight));
});
