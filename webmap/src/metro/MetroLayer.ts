import * as L from 'leaflet';
import {MetroNetwork, MetroStation} from './MetroNetwork';
import {toLatLng} from '../util/Util';

export class MetroLayer extends L.FeatureGroup {
    private readonly _routes = new Map<string, L.FeatureGroup>();
    private readonly _stations = new Map<string, L.CircleMarker>();
    private readonly _visible = new Set<string>();
    private _showLabels = true;

    constructor(readonly network: MetroNetwork) {
        super();
        for (const line of network.lines) {
            const points = line.points.map(point => toLatLng(point));
            const route = L.featureGroup([
                L.polyline(points, {color: '#171b24', weight: 9, opacity: 0.85, interactive: false}),
                L.polyline(points, {color: line.color, weight: 5, opacity: 1})
                    .bindTooltip(() => this.label(line.name))
            ]);
            this._routes.set(line.id, route);
            this._visible.add(line.id);
            this.addLayer(route);
        }
        for (const station of network.stations) {
            const lines = network.lines.filter(line => line.stations.includes(station.id));
            const marker = L.circleMarker(toLatLng([station.x, station.z]), {
                radius: lines.length > 1 ? 7 : 5,
                color: lines.length === 1 ? lines[0].color : '#263042',
                weight: 3, fillColor: '#ffffff', fillOpacity: 1
            });
            marker.bindPopup(() => {
                const content = document.createElement('div');
                const name = document.createElement('strong');
                name.textContent = station.name;
                content.appendChild(name);
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
            this._stations.set(station.id, marker);
        }
        this.updateStations();
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

    setLabelsVisible(visible: boolean): void {
        this._showLabels = visible;
        this.updateStations();
    }

    focusLine(id: string, map: L.Map): void {
        const bounds = this._routes.get(id)?.getBounds();
        if (bounds?.isValid()) map.fitBounds(bounds, {padding: [40, 40], maxZoom: map.getMaxZoom()});
    }

    focusStation(station: MetroStation, map: L.Map): void {
        for (const line of this.network.lines) {
            if (line.stations.includes(station.id)) this.setLineVisible(line.id, true);
        }
        map.setView(toLatLng([station.x, station.z]), map.getMaxZoom());
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
            marker.unbindTooltip();
            marker.bindTooltip(() => this.label(station.name), {
                permanent: this._showLabels, direction: 'right', offset: [9, 0],
                className: 'metro-station-label'
            });
        }
    }

    private label(text: string): HTMLElement {
        const label = document.createElement('span');
        label.textContent = text;
        return label;
    }
}
