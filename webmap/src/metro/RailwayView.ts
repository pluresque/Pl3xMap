import {MetroLine, MetroNetwork} from './MetroNetwork';

export function normalizeSearch(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}

export function matchesRoute(line: MetroLine, network: MetroNetwork, query: string): boolean {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const names = [line.name, ...network.stations.filter(station => line.stations.includes(station.id)).map(station => station.name)];
    const haystack = normalizeSearch(names.join(' '));
    return terms.every(term => haystack.includes(term));
}

export function countLabel(count: number, one: string, few: string, many: string): string {
    const rule = new Intl.PluralRules('ru-RU').select(count);
    return `${count} ${rule === 'one' ? one : rule === 'few' ? few : many}`;
}

export function routeMeasure(line: MetroLine): string {
    if (line.paths.length > 1) return '';
    const points = line.paths[0];
    const length = points.slice(1).reduce((sum, point, i) => sum + Math.abs(point[0] - points[i][0]) + Math.abs(point[1] - points[i][1]), 0);
    return `≈ ${Math.round(length).toLocaleString('ru-RU')} блоков`;
}

export interface RailwayPreferences {
    scheme: boolean;
    labels: boolean;
    plans?: boolean;
}

export function parsePreferences(raw: string | null): RailwayPreferences {
    const defaults = {scheme: false, labels: true};
    if (!raw) return defaults;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return defaults;
        return {scheme: typeof data.scheme === 'boolean' ? data.scheme : false,
            labels: typeof data.labels === 'boolean' ? data.labels : true,
            ...(typeof data.plans === 'boolean' ? {plans: data.plans} : {})};
    } catch {
        return defaults;
    }
}
