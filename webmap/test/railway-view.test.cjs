const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const {matchesRoute,routeMeasure,parsePreferences}=load('src/metro/RailwayView.ts');
const {parseMetroConfig}=load('src/metro/MetroNetwork.ts');
const world=()=>parseMetroConfig(JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/railway.json')))).get('world');

test('search finds a route by a connected station, regardless of case',()=>{
    const network=world();
    assert.equal(matchesRoute(network.lines[0],network,'центральный'),true);
    assert.equal(matchesRoute(network.lines[1],network,'РОЗОВАЯ'),true);
    assert.equal(matchesRoute(network.lines[1],network,'центральный'),false);
});

test('search normalizes ё and requires every query term',()=>{
    const network=world();network.stations[0].name='Жёлтый вокзал';
    assert.equal(matchesRoute(network.lines[0],network,'  желтый  вокзал '),true);
    assert.equal(matchesRoute(network.lines[0],network,'желтый розовая'),false);
});

test('parallel path collections do not imply a doubled journey length',()=>{
    const line=world().lines[0];
    assert.ok(routeMeasure(line).startsWith('≈ '));
    line.paths=[line.paths[0],line.paths[0]];
    assert.equal(routeMeasure(line),'');
});

test('invalid or unavailable saved preferences fall back safely',()=>{
    assert.equal(parsePreferences('{broken').scheme,false);
    assert.equal(parsePreferences('null').labels,true);
    assert.equal(parsePreferences(null).plans,undefined);
    const saved=parsePreferences('{"scheme":false,"labels":false,"plans":false}');
    assert.equal(saved.scheme,false);assert.equal(saved.labels,false);assert.equal(saved.plans,false);
});
