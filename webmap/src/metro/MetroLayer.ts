import * as L from 'leaflet';
import {MetroNetwork} from './MetroNetwork';
import {toLatLng} from '../util/Util';
import {MetroLabels} from './MetroLabels';
import {railwayCopyIcon} from './RailwayIcons';
import {roundRoute} from './MetroGeometry';

export class MetroLayer extends L.FeatureGroup {
    private readonly _labels: MetroLabels;

    constructor(network: MetroNetwork) {
        super();
        const visibleLines = network.lines.filter(line => !line.defaultHidden);
        for (const line of visibleLines) {
            const points = line.paths.map(path => roundRoute(path, line.cornerRadius).map(point => toLatLng(point)));
            const dashArray = line.planned ? '12 8' : undefined;
            const lineCap = line.planned ? 'butt' : 'round';
            const weight = line.hubLink ? 8 : 4;
            const strokes: L.Layer[] = [
                L.polyline(points, {color: '#171b24', weight: weight + 4, opacity: 0.8, dashArray, lineCap, interactive: false}),
                L.polyline(points, {color: line.color, weight, opacity: 1, dashArray, lineCap})
                    .bindTooltip(() => this.label(line.name + (line.planned ? ' · план' : '')), {className: 'railway-route-tooltip'})
            ];
            if (line.secondaryColor) {
                strokes.push(L.polyline(points, {color: line.secondaryColor, weight: 3, opacity: 1, dashArray, lineCap})
                    .bindTooltip(() => this.label(line.name + (line.planned ? ' · план' : '')), {className: 'railway-route-tooltip'}));
            }
            this.addLayer(L.featureGroup(strokes));
        }
        const visibleStations = new Set(visibleLines.flatMap(line => line.stations));
        const stations = network.stations.filter(station => visibleStations.has(station.id));
        const markers = new Map<string, L.CircleMarker>();
        for (const station of stations) {
            const lines = visibleLines.filter(line => line.stations.includes(station.id));
            const marker = L.circleMarker(toLatLng([station.x, station.z]), {
                radius: station.kind === 'hub' ? 8 : station.kind === 'terminal' ? 5 : 4,
                color: station.color ?? (lines.length === 1 ? lines[0].color : '#8e9aad'),
                weight: station.kind === 'hub' ? 4 : 3,
                fillColor: station.kind === 'hub' ? '#eef5ff' : '#101c29',
                fillOpacity: station.planned ? 0.25 : 1, dashArray: station.planned ? '4 3' : undefined
            });
            marker.bindPopup(() => {
                const content = document.createElement('div');
                content.className = 'railway-station-popup';
                const name = document.createElement('h3');
                name.textContent = station.name;
                content.appendChild(name);
                const kind = station.kind === 'hub' ? 'Вокзал' : station.kind === 'terminal' ? 'Конечная'
                    : station.kind === 'landmark' ? 'Ориентир' : 'Станция';
                const type = document.createElement('div');
                type.textContent = kind + (station.planned ? ' · план' : '');
                content.appendChild(type);
                const coordinates = document.createElement('div');
                coordinates.textContent = station.y === undefined
                    ? `X ${station.x} · Z ${station.z}`
                    : `X ${station.x} · Y ${station.y} · Z ${station.z}`;
                coordinates.className = 'railway-coordinates';
                content.appendChild(coordinates);
                if (station.description) {
                    const description = document.createElement('p');
                    description.textContent = station.description;
                    content.appendChild(description);
                }
                if (navigator.clipboard) {
                    const copy = document.createElement('button');
                    copy.type = 'button';
                    copy.className = 'railway-copy';
                    copy.appendChild(railwayCopyIcon());
                    const label = document.createElement('span');
                    label.textContent = 'Координаты';
                    copy.appendChild(label);
                    copy.addEventListener('click', async () => {
                        try {
                            await navigator.clipboard.writeText([station.x, station.y, station.z].filter(n => n !== undefined).join(' '));
                            label.textContent = 'Скопировано';
                        } catch { label.textContent = 'Выдели координаты выше'; }
                    });
                    content.appendChild(copy);
                }
                return content;
            }, {className: 'railway-popup', maxWidth: 280});
            marker.bindTooltip(() => this.label(station.name + (station.planned ? ' · план' : '')), {
                permanent: true, direction: 'right', offset: [10, 0], className: 'metro-station-label'
            });
            markers.set(station.id, marker);
            this.addLayer(marker);
        }
        this._labels = new MetroLabels(stations, markers);
    }

    onAdd(map: L.Map): this {
        super.onAdd(map);
        this._labels.addTo(map);
        return this;
    }

    onRemove(map: L.Map): this {
        this._labels.remove();
        super.onRemove(map);
        return this;
    }

    setLabelsVisible(visible: boolean): void {
        this._labels.setVisible(visible);
    }

    private label(text: string): HTMLElement {
        const label = document.createElement('span');
        label.textContent = text;
        return label;
    }
}
