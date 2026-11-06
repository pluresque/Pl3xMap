import * as L from 'leaflet';
import BaseTab from './BaseTab';
import {Pl3xMap} from '../Pl3xMap';
import {World} from '../world/World';
import {createSVGIcon} from '../util/Util';
import {MetroNetwork, parseMetroConfig} from '../metro/MetroNetwork';
import {MetroLayer} from '../metro/MetroLayer';
import '../svg/metro.svg';

export default class MetroTab extends BaseTab {
    private readonly _networks: Promise<Map<string, MetroNetwork>>;
    private _layer?: MetroLayer;
    private _selection = 0;
    private _lineInputs = new Map<string, HTMLInputElement>();

    constructor(pl3xmap: Pl3xMap) {
        super(pl3xmap, 'metro');
        this._button.appendChild(createSVGIcon('metro'));
        this._button.title = 'Метро';
        this._button.setAttribute('aria-label', 'Метро');
        this._button.hidden = true;

        this._networks = fetch('metro.json').then(async response => {
            if (response.status === 404) return new Map<string, MetroNetwork>();
            if (!response.ok) throw new Error(`Metro configuration: HTTP ${response.status}`);
            return parseMetroConfig(await response.json());
        }).catch(error => {
            console.warn('Could not load metro.json', error);
            return new Map<string, MetroNetwork>();
        });

        window.addEventListener('worldselected', (event: CustomEvent<World>) => {
            void this.selectWorld(event.detail);
        });
    }

    private async selectWorld(world: World): Promise<void> {
        const selection = ++this._selection;
        this._layer?.remove();
        this._layer = undefined;
        this._content.replaceChildren();
        this._lineInputs.clear();
        this._button.hidden = true;
        const network = (await this._networks).get(world.name);
        if (selection !== this._selection) return;
        if (!network || !network.lines.length) {
            const sidebar = this._pl3xmap.controlManager.sidebarControl;
            sidebar?.deactivateTab(this, false);
            return;
        }

        this._button.hidden = false;
        this._button.title = network.label;
        this._button.setAttribute('aria-label', network.label);
        const layer = this._layer = new MetroLayer(network);
        layer.addTo(this._pl3xmap.map);

        const heading = L.DomUtil.create('h2', '', this._content);
        heading.textContent = network.label;
        const labels = L.DomUtil.create('label', 'metro-label-toggle', this._content);
        const labelsInput = L.DomUtil.create('input', '', labels);
        labelsInput.type = 'checkbox';
        labelsInput.checked = true;
        labels.appendChild(document.createTextNode(' Названия станций'));
        labelsInput.addEventListener('change', () => layer.setLabelsVisible(labelsInput.checked));

        for (const line of network.lines) {
            const section = L.DomUtil.create('section', 'metro-line', this._content);
            section.style.setProperty('--metro-color', line.color);
            const header = L.DomUtil.create('div', 'metro-line-header', section);
            const label = L.DomUtil.create('label', '', header);
            const input = L.DomUtil.create('input', '', label);
            input.type = 'checkbox';
            input.checked = true;
            this._lineInputs.set(line.id, input);
            input.addEventListener('change', () => layer.setLineVisible(line.id, input.checked));
            const swatch = L.DomUtil.create('span', 'metro-swatch', label);
            swatch.setAttribute('aria-hidden', 'true');
            label.appendChild(document.createTextNode(line.name));
            const focus = L.DomUtil.create('button', 'metro-fit', header);
            focus.type = 'button';
            focus.textContent = '↗';
            focus.title = `Показать линию: ${line.name}`;
            focus.setAttribute('aria-label', focus.title);
            focus.addEventListener('click', () => {
                input.checked = true;
                layer.setLineVisible(line.id, true);
                this._pl3xmap.playerManager.follow = undefined;
                layer.focusLine(line.id, this._pl3xmap.map, this._content.getBoundingClientRect().width);
            });
            const list = L.DomUtil.create('ol', 'metro-stations', section);
            for (const id of line.stations) {
                const station = network.stations.find(station => station.id === id)!;
                const item = L.DomUtil.create('li', '', list);
                const button = L.DomUtil.create('button', '', item);
                button.type = 'button';
                button.textContent = station.name;
                button.addEventListener('click', () => {
                    this._pl3xmap.playerManager.follow = undefined;
                    layer.focusStation(station, this._pl3xmap.map, this._content.getBoundingClientRect().width);
                    network.lines.filter(line => line.stations.includes(id)).forEach(line => {
                        this._lineInputs.get(line.id)!.checked = true;
                    });
                });
            }
        }
    }
}
