import * as L from 'leaflet';
import BaseTab from './BaseTab';
import {Pl3xMap} from '../Pl3xMap';
import {World} from '../world/World';
import {createSVGIcon} from '../util/Util';
import {MetroLine, MetroNetwork, parseMetroConfig} from '../metro/MetroNetwork';
import {MetroLayer} from '../metro/MetroLayer';
import {railwayIcon} from '../metro/RailwayIcons';
import {countLabel, matchesRoute, parsePreferences, RailwayPreferences, routeMeasure} from '../metro/RailwayView';
import '../svg/metro.svg';

interface RouteRow {
    element: HTMLElement;
    main: HTMLButtonElement;
    visibility: HTMLButtonElement;
}

export default class MetroTab extends BaseTab {
    private readonly _networks: Promise<Map<string, MetroNetwork>>;
    private _layer?: MetroLayer;
    private _network?: MetroNetwork;
    private _selection = 0;
    private _selected?: string;
    private _query = '';
    private _filter: 'all' | 'built' | 'planned' = 'all';
    private _rows = new Map<string, RouteRow>();
    private _groups = new Map<boolean, HTMLElement>();
    private _detail?: HTMLElement;
    private _empty?: HTMLElement;
    private _plans?: HTMLButtonElement;
    private _counts?: HTMLElement;
    private _preferences: RailwayPreferences;

    constructor(pl3xmap: Pl3xMap) {
        super(pl3xmap, 'metro');
        this._button.appendChild(createSVGIcon('metro'));
        this._button.classList.add('railway-launcher');
        this._button.title = 'Железная дорога';
        this._button.setAttribute('aria-label', 'Железная дорога');
        this._button.hidden = true;
        this._content.classList.add('railway-panel');
        let saved: string | null = null;
        try { saved = localStorage.getItem('pl3xmap.railway.preferences'); } catch { /* storage is optional */ }
        this._preferences = parsePreferences(saved);
        this._networks = fetch('metro.json').then(async response => {
            if (response.status === 404) return new Map<string, MetroNetwork>();
            if (!response.ok) throw new Error(`Railway configuration: HTTP ${response.status}`);
            return parseMetroConfig(await response.json());
        }).catch(error => {
            console.warn('Could not load metro.json', error);
            return new Map<string, MetroNetwork>();
        });
        window.addEventListener('worldselected', (event: CustomEvent<World>) => void this.selectWorld(event.detail));
    }

    onActivate(): void {
        this.sidebar()?.classList.add('sidebar--railway');
        this._layer?.refreshLabels();
        super.onActivate();
    }

    onDeactivate(): void {
        this.sidebar()?.classList.remove('sidebar--railway');
        this._layer?.refreshLabels();
    }

    private sidebar(): HTMLElement | null {
        return this._pl3xmap.map.getContainer().querySelector('#sidebar');
    }

    private savePreferences(): void {
        try { localStorage.setItem('pl3xmap.railway.preferences', JSON.stringify(this._preferences)); } catch { /* storage is optional */ }
    }

    private createButton(parent: HTMLElement, className: string, label: string, icon?: Parameters<typeof railwayIcon>[0]): HTMLButtonElement {
        const button = L.DomUtil.create('button', className, parent);
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.title = label;
        if (icon) button.appendChild(railwayIcon(icon));
        return button;
    }

    private async selectWorld(world: World): Promise<void> {
        const generation = ++this._selection;
        this._layer?.remove();
        this._layer = undefined;
        this._network = undefined;
        this._selected = undefined;
        this._query = '';
        this._filter = 'all';
        this._rows.clear();
        this._groups.clear();
        this._content.replaceChildren();
        this._content.classList.remove('railway-detail-mode');
        this.sidebar()?.classList.remove('sidebar--railway-detail');
        this._button.hidden = true;
        this._pl3xmap.map.getContainer().classList.remove('railway-enabled', 'railway-muted');
        const network = (await this._networks).get(world.name);
        if (generation !== this._selection) return;
        if (!network || !network.lines.length) {
            this.sidebar()?.classList.remove('railway-available');
            this._pl3xmap.controlManager.sidebarControl?.deactivateTab(this, false);
            return;
        }

        this._network = network;
        this._button.hidden = false;
        this._button.title = network.label;
        this._button.setAttribute('aria-label', network.label);
        this.sidebar()?.classList.add('railway-available');
        this._pl3xmap.map.getContainer().classList.add('railway-enabled');
        this._pl3xmap.map.getContainer().classList.toggle('railway-muted', this._preferences.scheme);
        const layer = this._layer = new MetroLayer(network);
        layer.addTo(this._pl3xmap.map);
        layer.setLabelsVisible(this._preferences.labels);
        if (this._preferences.plans !== undefined) {
            network.lines.filter(line => line.planned).forEach(line => layer.setLineVisible(line.id, this._preferences.plans!));
        }
        layer.on('routeselect', (event: L.LeafletEvent) => {
            this._pl3xmap.controlManager.sidebarControl?.activateTab(this);
            this.selectRoute((event as L.LeafletEvent & {id: string}).id, false);
        });
        layer.on('selectionclear', () => this.clearSelection());
        this.render(network);
    }

    private render(network: MetroNetwork): void {
        const header = L.DomUtil.create('header', 'railway-header', this._content);
        const brand = L.DomUtil.create('div', 'railway-brand', header);
        const eyebrow = L.DomUtil.create('span', 'railway-eyebrow', brand);
        eyebrow.textContent = 'ТРАНСПОРТНАЯ СЕТЬ';
        const heading = L.DomUtil.create('h2', '', brand);
        heading.textContent = network.label;
        this._counts = L.DomUtil.create('p', 'railway-counts', brand);
        this.createButton(header, 'railway-icon-button railway-close', 'Закрыть схему', 'close')
            .addEventListener('click', () => this._pl3xmap.controlManager.sidebarControl?.collapse());

        const toolbar = L.DomUtil.create('div', 'railway-toolbar', this._content);
        const modes = L.DomUtil.create('div', 'railway-modes', toolbar);
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', 'Вид карты');
        for (const [label, scheme] of [['Карта', false], ['Схема', true]] as const) {
            const button = this.createButton(modes, 'railway-mode', `Вид: ${label}`);
            button.textContent = label;
            button.title = scheme ? 'Приглушённый фон, яркие маршруты' : 'Обычные цвета карты';
            button.setAttribute('aria-pressed', String(this._preferences.scheme === scheme));
            button.addEventListener('click', () => {
                this._preferences.scheme = scheme;
                this._pl3xmap.map.getContainer().classList.toggle('railway-muted', scheme);
                modes.querySelectorAll('button').forEach(child => child.setAttribute('aria-pressed', String(child === button)));
                this.savePreferences();
            });
        }
        this._plans = this.createButton(toolbar, 'railway-chip', 'Планируемые маршруты');
        this._plans.addEventListener('click', () => {
            const planned = network.lines.filter(line => line.planned);
            const visible = !planned.some(line => this._layer!.isLineVisible(line.id));
            planned.forEach(line => this._layer!.setLineVisible(line.id, visible));
            this._preferences.plans = visible;
            this.savePreferences();
            this.refreshRows();
        });
        this.createButton(toolbar, 'railway-icon-button railway-overview', 'Показать всю сеть', 'overview')
            .addEventListener('click', () => this.overview());

        const search = L.DomUtil.create('label', 'railway-search', this._content);
        search.appendChild(railwayIcon('search'));
        const input = L.DomUtil.create('input', '', search);
        input.type = 'search';
        input.placeholder = 'Станция, направление или игрок';
        input.setAttribute('aria-label', 'Поиск направления или станции');
        input.addEventListener('input', () => { this._query = input.value; this.refreshRows(); });

        const filters = L.DomUtil.create('div', 'railway-filters', this._content);
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', 'Фильтр направлений');
        for (const [key, label, count] of [
            ['all', 'Все', network.lines.length],
            ['built', 'Пути', network.lines.filter(line => !line.planned).length],
            ['planned', 'Планы', network.lines.filter(line => line.planned).length]
        ] as const) {
            const button = this.createButton(filters, 'railway-filter', `Фильтр: ${label}`);
            button.textContent = `${label} ${count}`;
            button.setAttribute('aria-pressed', String(key === this._filter));
            button.addEventListener('click', () => {
                this._filter = key;
                filters.querySelectorAll('button').forEach(child => child.setAttribute('aria-pressed', String(child === button)));
                this.refreshRows();
            });
        }
        const list = L.DomUtil.create('div', 'railway-routes', this._content);
        for (const planned of [false, true]) {
            const group = L.DomUtil.create('section', 'railway-group', list);
            this._groups.set(planned, group);
            const heading = L.DomUtil.create('h3', 'railway-group-heading', group);
            heading.textContent = planned ? 'Планируемые направления' : 'Построенные пути';
            for (const line of network.lines.filter(line => line.planned === planned)) this.renderRow(line, group);
        }
        this._empty = L.DomUtil.create('div', 'railway-empty', list);
        this._empty.setAttribute('role', 'status');
        this._empty.textContent = 'Ничего не найдено. Попробуй название станции или ник.';
        this._detail = L.DomUtil.create('section', 'railway-detail', this._content);
        this._detail.hidden = true;
        this._detail.setAttribute('aria-label', 'Выбранное направление');

        const footer = L.DomUtil.create('footer', 'railway-footer', this._content);
        const legend = L.DomUtil.create('div', 'railway-legend', footer);
        legend.innerHTML = '<span><i class="railway-key railway-key-built"></i>Пути</span><span><i class="railway-key railway-key-plan"></i>План</span><span><i class="railway-key railway-key-hub"></i>Вокзал</span>';
        const labels = L.DomUtil.create('label', 'railway-label-toggle', footer);
        const caption = L.DomUtil.create('span', '', labels);
        caption.textContent = 'Названия станций';
        const labelsInput = L.DomUtil.create('input', '', labels);
        labelsInput.type = 'checkbox';
        labelsInput.checked = this._preferences.labels;
        const toggle = L.DomUtil.create('span', 'railway-switch', labels);
        toggle.setAttribute('aria-hidden', 'true');
        labelsInput.addEventListener('change', () => {
            this._preferences.labels = labelsInput.checked;
            this._layer!.setLabelsVisible(labelsInput.checked);
            this.savePreferences();
        });
        this.refreshRows();
    }

    private renderRow(line: MetroLine, parent: HTMLElement): void {
        const element = L.DomUtil.create('div', 'railway-route', parent);
        element.style.setProperty('--route-color', line.color);
        if (line.planned) element.classList.add('is-planned');
        const visibility = this.createButton(element, 'railway-visibility', `Скрыть: ${line.name}`, 'eye');
        visibility.addEventListener('click', () => {
            this._layer!.setLineVisible(line.id, !this._layer!.isLineVisible(line.id));
            this.refreshRows();
        });
        const main = this.createButton(element, 'railway-route-main', `Выбрать: ${line.name}`);
        const swatch = L.DomUtil.create('span', 'railway-route-swatch', main);
        swatch.setAttribute('aria-hidden', 'true');
        if (line.secondaryColor) swatch.style.setProperty('--route-secondary', line.secondaryColor);
        const copy = L.DomUtil.create('span', 'railway-route-copy', main);
        const name = L.DomUtil.create('span', 'railway-route-name', copy);
        name.textContent = line.name;
        const meta = L.DomUtil.create('span', 'railway-route-meta', copy);
        meta.textContent = [line.hubLink ? 'Между вокзалами' : line.planned ? 'К конечной' : 'Проложенные рельсы', routeMeasure(line)].filter(Boolean).join(' · ');
        main.appendChild(railwayIcon('arrow'));
        main.addEventListener('click', () => this.selectRoute(line.id, true));
        this._rows.set(line.id, {element, main, visibility});
    }

    private refreshRows(): void {
        if (!this._network || !this._layer) return;
        let matches = 0;
        for (const line of this._network.lines) {
            const row = this._rows.get(line.id)!;
            const visible = this._layer.isLineVisible(line.id);
            row.element.hidden = !matchesRoute(line, this._network, this._query)
                || (this._filter === 'built' && line.planned) || (this._filter === 'planned' && !line.planned);
            if (!row.element.hidden) matches++;
            row.element.classList.toggle('is-hidden', !visible);
            row.element.classList.toggle('is-selected', line.id === this._selected);
            row.main.setAttribute('aria-pressed', String(line.id === this._selected));
            row.visibility.setAttribute('aria-pressed', String(visible));
            row.visibility.setAttribute('aria-label', `${visible ? 'Скрыть' : 'Показать'}: ${line.name}`);
            row.visibility.title = row.visibility.getAttribute('aria-label')!;
            row.visibility.replaceChildren(railwayIcon(visible ? 'eye' : 'hidden'));
        }
        this._groups.forEach((group, planned) => {
            group.hidden = !this._network!.lines.some(line => line.planned === planned && !this._rows.get(line.id)!.element.hidden);
        });
        this._empty!.hidden = matches > 0;
        const plans = this._network.lines.filter(line => line.planned);
        const active = plans.filter(line => this._layer!.isLineVisible(line.id)).length;
        this._plans!.textContent = `Планы ${active}/${plans.length}`;
        this._plans!.setAttribute('aria-pressed', String(active > 0));
        this._plans!.title = active ? 'Скрыть все планы на карте' : 'Показать все планы на карте';
        this._plans!.hidden = !plans.length;
        const built = this._network.lines.filter(line => !line.planned).length;
        this._counts!.textContent = countLabel(built, 'участок', 'участка', 'участков') + ' · ' + countLabel(plans.length, 'план', 'плана', 'планов');
    }

    private selectRoute(id: string, fit: boolean): void {
        if (!this._layer || !this._network) return;
        const line = this._network.lines.find(line => line.id === id);
        if (!line) return;
        this._selected = id;
        this._layer.setLineVisible(id, true);
        this._layer.setSelection(id);
        this._content.classList.add('railway-detail-mode');
        this.sidebar()?.classList.add('sidebar--railway-detail');
        this.renderDetail(line);
        this.refreshRows();
        if (fit) {
            this._pl3xmap.playerManager.follow = undefined;
            const {right, bottom} = this.padding();
            this._layer.focusLine(id, this._pl3xmap.map, right, bottom);
        }
    }

    private renderDetail(line: MetroLine): void {
        const detail = this._detail!;
        detail.hidden = false;
        detail.replaceChildren();
        detail.style.setProperty('--route-color', line.color);
        const back = this.createButton(detail, 'railway-detail-back', 'К списку направлений', 'back');
        back.appendChild(document.createTextNode('К списку'));
        back.addEventListener('click', () => this.clearSelection());
        const title = L.DomUtil.create('h3', '', detail);
        title.textContent = line.name;
        const description = L.DomUtil.create('p', 'railway-detail-description', detail);
        description.textContent = line.description ?? (line.planned ? 'Планируемое направление · трасса приблизительная' : 'Геометрия по рельсам в мире');
        const stops = L.DomUtil.create('div', 'railway-detail-stops', detail);
        for (const id of line.stations) {
            const station = this._network!.stations.find(station => station.id === id)!;
            const button = this.createButton(stops, 'railway-stop', `Станция: ${station.name}`, 'pin');
            button.appendChild(document.createTextNode(station.name));
            button.addEventListener('click', () => {
                this._pl3xmap.playerManager.follow = undefined;
                const {right, bottom} = this.padding();
                this._layer!.focusStation(station, this._pl3xmap.map, right, bottom);
                this.refreshRows();
            });
        }
    }

    private clearSelection(): void {
        this._selected = undefined;
        this._layer?.setSelection();
        this._content.classList.remove('railway-detail-mode');
        this.sidebar()?.classList.remove('sidebar--railway-detail');
        if (this._detail) this._detail.hidden = true;
        this.refreshRows();
    }

    private padding(): {right: number; bottom: number} {
        if (this._content.hidden) return {right: 0, bottom: 0};
        const rect = this._content.getBoundingClientRect();
        return window.matchMedia('(max-width: 600px)').matches
            ? {right: 0, bottom: rect.height + 20}
            : {right: rect.width + 60, bottom: 0};
    }

    private overview(): void {
        this.clearSelection();
        this._pl3xmap.playerManager.follow = undefined;
        if (window.matchMedia('(max-width: 600px)').matches) this._pl3xmap.controlManager.sidebarControl?.collapse();
        const {right, bottom} = this.padding();
        this._layer?.focusNetwork(this._pl3xmap.map, right, bottom);
    }
}
