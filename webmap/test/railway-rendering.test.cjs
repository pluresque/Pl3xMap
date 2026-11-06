const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');

function render() {
    const {parseMetroConfig} = load('src/metro/MetroNetwork.ts');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/railway.json')));
    const network = parseMetroConfig(data).get('world');
    const polylines=[],circles=[];
    class Group {
        layers=[];
        constructor(layers=[]) { this.layers.push(...layers); }
        addLayer(layer) { this.layers.push(layer); return this; }
        removeLayer(layer) { this.layers=this.layers.filter(l=>l!==layer);return this; }
    }
    const stroke = (points, options) => {
        const line={points,options,bindTooltip(){return this;}};
        polylines.push(line);return line;
    };
    const {MetroLayer} = load('src/metro/MetroLayer.ts',{
        leaflet:{FeatureGroup:Group,featureGroup:layers=>new Group(layers),polyline:stroke,
            circleMarker(point,options) {
                const marker={point,options,bindPopup(){return this;},bindTooltip(){return this;}};
                circles.push(marker);return marker;
            }},
        '../util/Util':{toLatLng:point=>point},
        './MetroLabels':{MetroLabels:class {refresh(){}}}
    });
    const layer = new MetroLayer(network);
    return {polylines,circles,layer};
}

test('inter-hub paths are thicker and contain both hub colors',()=>{
    const {polylines}=render();
    assert.ok(polylines.some(line=>line.options.color==='#e05252' && line.options.weight===8));
    assert.ok(polylines.some(line=>line.options.color==='#ec963d' && line.options.weight===3));
    assert.ok(polylines.some(line=>line.options.color==='#e98fb6' && line.options.weight===4));
});

test('planned paths have gaps in both the outline and colored stroke',()=>{
    const {polylines}=render();
    const planned=polylines.filter(line=>line.points[0][0][0]===-400);
    assert.equal(planned.length,2);
    assert.ok(planned.every(line=>line.options.dashArray==='12 8'));
    assert.ok(planned.every(line=>line.options.lineCap==='butt'));
});

test('hub markers are larger and unbuilt stations use a dashed outline',()=>{
    const {circles}=render();
    assert.ok(circles[0].options.radius>circles[2].options.radius);
    assert.equal(circles[3].options.dashArray,'4 3');
    assert.equal(circles[3].options.fillOpacity,0.25);
});
