export interface LabelRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface LabelCandidate {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    priority: number;
}

export type LabelDirection = 'right' | 'left' | 'top' | 'bottom';

function intersects(a: LabelRect, b: LabelRect, gap: number): boolean {
    return a.left < b.right + gap && a.right + gap > b.left
        && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

export function placeLabels(labels: LabelCandidate[], bounds: LabelRect, obstacles: LabelRect[] = []): Map<string, LabelDirection> {
    const placed = new Map<string, LabelDirection>();
    const occupied = [...obstacles];
    for (const label of [...labels].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
        const {x, y, width: w, height: h} = label;
        const candidates: [LabelDirection, number, number][] = [
            ['right', x + 10, y - h / 2], ['left', x - 10 - w, y - h / 2],
            ['top', x - w / 2, y - 10 - h], ['bottom', x - w / 2, y + 10]
        ];
        for (const [direction, left, top] of candidates) {
            const rect = {left, top, right: left + w, bottom: top + h};
            if (rect.left < bounds.left + 3 || rect.right > bounds.right - 3
                || rect.top < bounds.top + 3 || rect.bottom > bounds.bottom - 3) continue;
            if (occupied.some(other => intersects(rect, other, 5))) continue;
            placed.set(label.id, direction);
            occupied.push(rect);
            break;
        }
    }
    return placed;
}
