export interface RailwayPreferences {
    visible: boolean;
}

export function parsePreferences(raw: string | null): RailwayPreferences {
    const defaults = {visible: true};
    if (!raw) return defaults;
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return defaults;
        return {visible: data.visible !== false};
    } catch {
        return defaults;
    }
}
