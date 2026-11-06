export interface MetroStation {
    id: string;
    name: string;
    x: number;
    y?: number;
    z: number;
}

export interface MetroLine {
    id: string;
    name: string;
    color: string;
    points: [number, number][];
    stations: string[];
}

export interface MetroNetwork {
    label: string;
    lines: MetroLine[];
    stations: MetroStation[];
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected an object');
    }
    return value as Record<string, unknown>;
}

function text(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Expected a nonempty string');
    }
    return value;
}

function coordinate(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 30000000) {
        throw new Error('Invalid Minecraft coordinate');
    }
    return value;
}

export function parseMetroConfig(value: unknown): Map<string, MetroNetwork> {
    const config = object(value);
    if (config.version !== 1) {
        throw new Error('Unsupported metro configuration version');
    }
    const result = new Map<string, MetroNetwork>();
    for (const [world, raw] of Object.entries(object(config.worlds))) {
        const data = object(raw);
        if (!Array.isArray(data.stations) || !Array.isArray(data.lines)) {
            throw new Error(`Missing stations or lines in ${world}`);
        }
        const stations: MetroStation[] = data.stations.map(raw => {
            const station = object(raw);
            return {
                id: text(station.id), name: text(station.name),
                x: coordinate(station.x), z: coordinate(station.z),
                ...(station.y === undefined ? {} : {y: coordinate(station.y)})
            };
        });
        const ids = new Set(stations.map(station => station.id));
        if (ids.size !== stations.length) {
            throw new Error(`Duplicate station ID in ${world}`);
        }
        const lineIds = new Set<string>();
        const lines: MetroLine[] = data.lines.map(raw => {
            const line = object(raw);
            const id = text(line.id);
            const color = text(line.color);
            if (lineIds.has(id) || !/^#[0-9a-f]{6}$/i.test(color)) {
                throw new Error(`Duplicate line ID or invalid color in ${world}`);
            }
            lineIds.add(id);
            if (!Array.isArray(line.points) || line.points.length < 2 || !Array.isArray(line.stations)) {
                throw new Error(`Missing route points or stations for ${id}`);
            }
            const points: [number, number][] = line.points.map(point => {
                if (!Array.isArray(point) || point.length !== 2) {
                    throw new Error(`Expected [x, z] route point for ${id}`);
                }
                return [coordinate(point[0]), coordinate(point[1])];
            });
            const stops: string[] = line.stations.map(station => {
                const stationId = text(station);
                if (!ids.has(stationId)) {
                    throw new Error(`Unknown station ${stationId} on ${id}`);
                }
                return stationId;
            });
            if (new Set(stops).size !== stops.length) {
                throw new Error(`Duplicate station on ${id}`);
            }
            return {id, name: text(line.name), color, points, stations: stops};
        });
        result.set(world, {label: data.label === undefined ? 'Metro' : text(data.label), lines, stations});
    }
    return result;
}
