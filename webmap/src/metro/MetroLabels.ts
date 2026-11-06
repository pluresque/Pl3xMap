import * as L from 'leaflet';
import {MetroStation} from './MetroNetwork';
import Pl3xMapLeafletMap from '../map/Pl3xMapLeafletMap';
import {LabelCandidate, LabelRect, placeLabels} from './LabelLayout';

export class MetroLabels {
    private _map?: Pl3xMapLeafletMap;
    private _frame?: number;
    private _showLabels = true;
    private _zooming = false;
    private readonly _zoomEnd = (): void => { this._zooming = false; this.refresh(); };
    private _hovered?: string;
    private _selected?: Set<string>;
    private _sidebar?: Element | null;
    private readonly _refresh = (): void => this.refresh();
    private readonly _hide = (): void => {
        this._zooming = true;
        this.markers.forEach(marker => {
            const element = marker.getTooltip()?.getElement();
            if (element) element.style.visibility = 'hidden';
        });
    };

    constructor(private readonly stations: MetroStation[], private readonly markers: Map<string, L.CircleMarker>) {
        markers.forEach((marker, id) => {
            marker.on('mouseover', () => { this._hovered = id; this.refresh(); });
            marker.on('mouseout', () => { this._hovered = undefined; this.refresh(); });
        });
    }

    addTo(map: L.Map): void {
        this._map = map as Pl3xMapLeafletMap;
        map.on('moveend resize layeradd layerremove popupopen popupclose', this._refresh);
        map.on('zoomstart', this._hide);
        map.on('zoomend', this._zoomEnd);
        this._sidebar = map.getContainer().querySelector('#sidebar');
        this._sidebar?.addEventListener('transitionend', this._refresh);
        this.refresh();
    }

    remove(): void {
        this._map?.off('moveend resize layeradd layerremove popupopen popupclose', this._refresh);
        this._map?.off('zoomstart', this._hide);
        this._map?.off('zoomend', this._zoomEnd);
        this._sidebar?.removeEventListener('transitionend', this._refresh);
        if (this._frame !== undefined) cancelAnimationFrame(this._frame);
        this._frame = undefined;
        this._map = undefined;
        this._hovered = undefined;
        this._zooming = false;
    }

    setSelection(stations?: Set<string>): void {
        this._selected = stations;
        this.refresh();
    }

    setVisible(visible: boolean): void {
        this._showLabels = visible;
        this.refresh();
    }

    refresh(): void {
        if (!this._map || this._frame !== undefined) return;
        this._frame = requestAnimationFrame(() => {
            this._frame = undefined;
            this.layout();
        });
    }

    private layout(): void {
        const map = this._map;
        if (!map || this._zooming) return;
        const container = map.getContainer();
        const bounds = container.getBoundingClientRect();
        const obstacles: LabelRect[] = [];
        container.querySelectorAll<HTMLElement>('#sidebar__buttons, #sidebar__content[aria-hidden="false"], .leaflet-tooltip:not(.metro-station-label), .leaflet-popup, .leaflet-control:not(#sidebar)')
            .forEach(element => {
                const rect = element.getBoundingClientRect();
                if (rect.width && rect.height && getComputedStyle(element).visibility !== 'hidden') obstacles.push(rect);
            });
        const showPersistent = this._showLabels && map.getCurrentZoom() <= 0;
        const candidates: LabelCandidate[] = [];
        const elements = new Map<string, HTMLElement>();
        for (const station of this.stations) {
            const marker = this.markers.get(station.id)!;
            const element = marker.getTooltip()?.getElement();
            if (!map.hasLayer(marker) || !element) continue;
            elements.set(station.id, element);
            if (!showPersistent && this._hovered !== station.id) continue;
            if (this._selected && !this._selected.has(station.id) && this._hovered !== station.id) continue;
            const point = map.latLngToContainerPoint(marker.getLatLng());
            if (point.x < 0 || point.y < 0 || point.x > bounds.width || point.y > bounds.height) continue;
            const priority = this._hovered === station.id ? -10 : station.kind === 'hub' ? 0
                : station.kind === 'terminal' ? 1 : station.kind === 'landmark' ? 3 : 2;
            candidates.push({id: station.id, x: bounds.left + point.x, y: bounds.top + point.y,
                width: element.offsetWidth, height: element.offsetHeight, priority});
        }
        const positions = placeLabels(candidates, bounds, obstacles);
        elements.forEach((element, id) => {
            const direction = positions.get(id);
            const tooltip = this.markers.get(id)!.getTooltip()!;
            if (direction) {
                tooltip.options.direction = direction;
                tooltip.options.offset = direction === 'left' ? [-10, 0] : direction === 'right' ? [10, 0]
                    : direction === 'top' ? [0, -10] : [0, 10];
                tooltip.update();
            }
            element.style.visibility = direction ? 'visible' : 'hidden';
        });
    }
}
