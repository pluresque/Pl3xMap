import * as L from 'leaflet';
import {MetroNetwork, MetroStation} from './MetroNetwork';
import {toLatLng} from '../util/Util';
import {MetroLabels} from './MetroLabels';

export class MetroLayer extends L.FeatureGroup {
    private readonly _routes = new Map<string, L.FeatureGroup>();
    private readonly _stations = new Map<string, L.CircleMarker>();
    private readonly _visible = new Set<string>();
    private readonly _labels: MetroLabels;

    constructor(readonly network: MetroNetwork) {
        super();
        for (const line of network.lines) {
            const points = line.paths.map(path => path.map(point => toLatLng(point)));
            const dashArray = line.planned ? '12 8' : undefined;
            const lineCap = line.planned ? 'butt' : 'round';
            const weight = line.hubLink ? 8 : 4;
            const strokes: L.Layer[] = [
                L.polyline(points, {color: '#171b24', weight: weight + 4, opacity: 0.8, dashArray, lineCap, interactive: false}),
                L.polyline(points, {color: line.color, weight, opacity: 1, dashArray, lineCap})
                    .bindTooltip(() => this.label(line.name + (line.planned ? ' · план' : '')))
            ];
            if (line.secondaryColor) {
                strokes.push(L.polyline(points, {color: line.secondaryColor, weight: 3, opacity: 1, dashArray, lineCap})
                    .bindTooltip(() => this.label(line.name + (line.planned ? ' · план' : ''))));
            }
            const route = L.featureGroup(strokes);
            this._routes.set(line.id, route);
            if (!line.defaultHidden) {
                this._visible.add(line.id);
                this.addLayer(route);
            }
        }
        for (const station of network.stations) {
            const lines = network.lines.filter(line => line.stations.includes(station.id));
            const marker = L.circleMarker(toLatLng([station.x, station.z]), {
                radius: station.kind === 'hub' ? 9 : station.kind === 'terminal' ? 6 : 5,
                color: station.color ?? (lines.length === 1 ? lines[0].color : '#8e9aad'),
                weight: station.kind === 'hub' ? 4 : 3,
                fillColor: station.kind === 'landmark' ? '#ffffff' : station.color ?? '#ffffff',
                fillOpacity: station.planned ? 0.25 : 1, dashArray: station.planned ? '4 3' : undefined
            });
            marker.bindPopup(() => {
                const content = document.createElement('div');
                const name = document.createElement('strong');
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
                content.appendChild(coordinates);
                const routes = document.createElement('div');
                routes.textContent = lines.map(line => line.name).join(' · ');
                content.appendChild(routes);
                return content;
            });
            marker.bindTooltip(() => this.label(station.name), {
                permanent: true, direction: 'right', offset: [10, 0], className: 'metro-station-label'
            });
            this._stations.set(station.id, marker);
        }
        this._labels = new MetroLabels(network.stations, this._stations);
        this.updateStations();
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

    setLineVisible(id: string, visible: boolean): void {
        const route = this._routes.get(id);
        if (!route) return;
        if (visible) {
            this._visible.add(id);
            this.addLayer(route);
        } else {
            this._visible.delete(id);
            this.removeLayer(route);
        }
        this.updateStations();
    }

    isLineVisible(id: string): boolean {
        return this._visible.has(id);
    }

    setLabelsVisible(visible: boolean): void {
        this._labels.setVisible(visible);
    }

    focusLine(id: string, map: L.Map, sidebarWidth: number = 0): void {
        const bounds = this._routes.get(id)?.getBounds();
        if (bounds?.isValid()) map.fitBounds(bounds, {
            paddingTopLeft: [32, 32], paddingBottomRight: [sidebarWidth + 80, 32],
            maxZoom: map.getMaxZoom()
        });
    }

    focusStation(station: MetroStation, map: L.Map, sidebarWidth: number = 0): void {
        for (const line of this.network.lines) {
            if (line.stations.includes(station.id) && (!line.defaultHidden || station.planned)) {
                this.setLineVisible(line.id, true);
            }
        }
        const point = toLatLng([station.x, station.z]);
        map.fitBounds(L.latLngBounds(point, point), {
            paddingTopLeft: [32, 32], paddingBottomRight: [sidebarWidth + 80, 32],
            maxZoom: map.getMaxZoom()
        });
        this._stations.get(station.id)?.openPopup();
    }

    private updateStations(): void {
        const visibleStations = new Set<string>();
        for (const line of this.network.lines) {
            if (this._visible.has(line.id)) line.stations.forEach(id => visibleStations.add(id));
        }
        for (const station of this.network.stations) {
            const marker = this._stations.get(station.id)!;
            if (visibleStations.has(station.id)) this.addLayer(marker);
            else this.removeLayer(marker);
        }
        this._labels.refresh();
    }

    private label(text: string): HTMLElement {
        const label = document.createElement('span');
        label.textContent = text;
        return label;
    }
}
