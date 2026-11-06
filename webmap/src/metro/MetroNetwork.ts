export interface MetroStation {
    id: string;
    name: string;
    x: number;
    y?: number;
    z: number;
    kind?: 'hub' | 'terminal' | 'landmark';
    color?: string;
    planned: boolean;
}

export interface MetroLine {
    id: string;
    name: string;
    color: string;
    points: [number, number][];
    paths: [number, number][][];
    stations: string[];
    from?: string;
    to?: string;
    hubLink: boolean;
    defaultHidden: boolean;
    secondaryColor?: string;
    planned: boolean;
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

function color(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new Error('Expected a six-digit hex color');
    }
    return value;
}

function planned(value: unknown): boolean {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw new Error('planned must be a boolean');
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
        if (data.lines !== undefined && data.connections !== undefined) {
            throw new Error(`Use connections or legacy lines, not both, in ${world}`);
        }
        const connections = data.connections ?? data.lines;
        if (!Array.isArray(data.stations) || !Array.isArray(connections)) {
            throw new Error(`Missing stations or lines in ${world}`);
        }
        const stations: MetroStation[] = data.stations.map(raw => {
            const station = object(raw);
            const kind = station.kind;
            if (kind !== undefined && kind !== 'hub' && kind !== 'terminal' && kind !== 'landmark') {
                throw new Error('Unknown station kind');
            }
            return {
                id: text(station.id), name: text(station.name), kind: kind as MetroStation['kind'],
                color: color(station.color), planned: planned(station.planned),
                x: coordinate(station.x), z: coordinate(station.z),
                ...(station.y === undefined ? {} : {y: coordinate(station.y)})
            };
        });
        const ids = new Set(stations.map(station => station.id));
        if (ids.size !== stations.length) {
            throw new Error(`Duplicate station ID in ${world}`);
        }
        const lineIds = new Set<string>();
        const lines: MetroLine[] = connections.map(raw => {
            const line = object(raw);
            const id = text(line.id);
            const explicitColor = color(line.color);
            if (lineIds.has(id)) throw new Error(`Duplicate connection ID in ${world}`);
            const from = line.from === undefined ? undefined : text(line.from);
            const to = line.to === undefined ? undefined : text(line.to);
            if ((from === undefined) !== (to === undefined)) throw new Error(`Missing connection endpoint for ${id}`);
            if (from !== undefined && (!ids.has(from) || !ids.has(to!) || from === to)) {
                throw new Error(`Invalid connection endpoints for ${id}`);
            }
            const first = stations.find(station => station.id === from);
            const second = stations.find(station => station.id === to);
            const hubLink = first?.kind === 'hub' && second?.kind === 'hub';
            const terminal = first?.kind === 'terminal' ? first : second?.kind === 'terminal' ? second : undefined;
            const routeColor = terminal?.color ?? (hubLink ? first?.color : undefined) ?? explicitColor ?? '#a9b3c2';
            const secondaryColor = hubLink && second?.color && second.color !== routeColor ? second.color : undefined;
            const stopIds = line.stations ?? (from === undefined ? [] : [from, to]);
            lineIds.add(id);
            if (line.points !== undefined && line.paths !== undefined) {
                throw new Error(`Use either points or paths for ${id}`);
            }
            const rawPaths = line.paths === undefined ? [line.points] : line.paths;
            if (!Array.isArray(rawPaths) || !rawPaths.length || !Array.isArray(stopIds)) {
                throw new Error(`Missing route paths or stations for ${id}`);
            }
            const paths: [number, number][][] = rawPaths.map(raw => {
                if (!Array.isArray(raw) || raw.length < 2) {
                    throw new Error(`Missing route points for ${id}`);
                }
                const points: [number, number][] = raw.map(point => {
                    if (!Array.isArray(point) || point.length !== 2) {
                        throw new Error(`Expected [x, z] route point for ${id}`);
                    }
                    return [coordinate(point[0]), coordinate(point[1])];
                });
                for (let i = 1; i < points.length; i++) {
                    const [x, z] = points[i];
                    const [previousX, previousZ] = points[i - 1];
                    if (x === previousX && z === previousZ) {
                        throw new Error(`Repeated route point on ${id}`);
                    }
                    if (x !== previousX && z !== previousZ) {
                        throw new Error(`Diagonal segment on ${id}: add bend coordinates between route points ${i} and ${i + 1}`);
                    }
                }
                return points;
            });
            const stops: string[] = stopIds.map(station => {
                const stationId = text(station);
                if (!ids.has(stationId)) {
                    throw new Error(`Unknown station ${stationId} on ${id}`);
                }
                return stationId;
            });
            if (new Set(stops).size !== stops.length) {
                throw new Error(`Duplicate station on ${id}`);
            }
            if (from !== undefined && (!stops.includes(from) || !stops.includes(to!))) {
                throw new Error(`Connection stops must include both endpoints for ${id}`);
            }
            return {id, name: text(line.name), color: routeColor, secondaryColor, hubLink,
                from, to, defaultHidden: planned(line.defaultHidden), planned: planned(line.planned), points: paths[0], paths, stations: stops};
        });
        result.set(world, {label: data.label === undefined ? 'Metro' : text(data.label), lines, stations});
    }
    return result;
}
