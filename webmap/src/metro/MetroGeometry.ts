type Point = [number, number];

/** Round explicit orthogonal bends, keeping each endpoint and the chosen corridor. */
export function roundRoute(points: Point[], radius: number): Point[] {
    if (!radius || points.length < 3) return points;
    const result: Point[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const previous = points[i - 1], corner = points[i], next = points[i + 1];
        const incoming = [corner[0] - previous[0], corner[1] - previous[1]];
        const outgoing = [next[0] - corner[0], next[1] - corner[1]];
        const firstLength = Math.hypot(...incoming), secondLength = Math.hypot(...outgoing);
        if (!firstLength || !secondLength || incoming[0] * outgoing[1] === incoming[1] * outgoing[0]) {
            result.push(corner);
            continue;
        }
        const distance = Math.min(radius, firstLength / 2, secondLength / 2);
        const entry: Point = [corner[0] - incoming[0] / firstLength * distance, corner[1] - incoming[1] / firstLength * distance];
        const exit: Point = [corner[0] + outgoing[0] / secondLength * distance, corner[1] + outgoing[1] / secondLength * distance];
        const center: Point = [entry[0] + exit[0] - corner[0], entry[1] + exit[1] - corner[1]];
        const start = Math.atan2(entry[1] - center[1], entry[0] - center[0]);
        const direction = Math.sign(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]);
        result.push(entry);
        for (let step = 1; step <= 8; step++) {
            const angle = start + direction * Math.PI / 2 * step / 8;
            result.push(step === 8 ? exit : [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance]);
        }
    }
    result.push(points[points.length - 1]);
    return result;
}
