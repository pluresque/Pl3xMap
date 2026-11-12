export interface RailwayPreferences {
    visible: boolean;
    labels: boolean;
}

export function parsePreferences(raw: string | null): RailwayPreferences {
    const defaults = {visible: true, labels: true};
    if (!raw) return defaults;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return defaults;
        return {visible: data.visible !== false, labels: data.labels !== false};
    } catch {
        return defaults;
    }
}
