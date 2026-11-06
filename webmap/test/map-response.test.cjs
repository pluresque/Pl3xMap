const assert = require('node:assert/strict');
const {test} = require('node:test');
const {gzipSync} = require('node:zlib');
const load = require('./load-typescript.cjs');
const globals = {Blob, Response, TextDecoder, DecompressionStream};
const {readMapBytes,readMapJSON} = load('src/util/MapResponse.ts',{},globals);
const text = JSON.stringify({name:'Северный вокзал',blocks:[1,2,3]});

test('reads ordinary JSON and already HTTP-decoded gzip without decoding twice',async()=>{
    for (const headers of [{},{'Content-Encoding':'gzip'}]) {
        const data=await readMapJSON(new Response(text,{headers}));
        assert.equal(JSON.stringify(data),text);
    }
});

test('reads gzip JSON delivered as raw bytes by a static host or embedded browser',async()=>{
    const data=await readMapJSON(new Response(gzipSync(text)));
    assert.equal(JSON.stringify(data),text);
});

test('preserves both plain and compressed binary block information exactly',async()=>{
    const binary=Buffer.from([0,255,2,17,0,128,5,6,7,8,9]);
    for(const body of [binary,gzipSync(binary)]) {
        assert.deepEqual(Buffer.from(await readMapBytes(new Response(body))),binary);
    }
    assert.equal((await readMapBytes(new Response(new Uint8Array()))).byteLength,0);
});

test('rejects corrupt compressed data instead of passing it to the block parser',async()=>{
    const corrupt=gzipSync(text).subarray(0,12);
    await assert.rejects(readMapBytes(new Response(corrupt)));
});

test('browsers without a gzip decoder still accept normal responses',async()=>{
    const reader=load('src/util/MapResponse.ts',{}, {...globals,DecompressionStream:undefined});
    assert.equal(JSON.stringify(await reader.readMapJSON(new Response(text))),text);
    await assert.rejects(reader.readMapJSON(new Response(gzipSync(text))),/Content-Encoding: gzip/);
});
