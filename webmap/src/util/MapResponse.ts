type GzipDecoder = new (format: 'gzip') => TransformStream<Uint8Array, Uint8Array>;

/** Some static hosts and embedded browsers deliver .gz bodies without decoding. */
export async function readMapBytes(response: Response): Promise<ArrayBuffer> {
    const bytes = await response.arrayBuffer();
    const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 3));
    if (prefix[0] !== 0x1f || prefix[1] !== 0x8b || prefix[2] !== 0x08) return bytes;
    const Decoder = (globalThis as typeof globalThis & {DecompressionStream?: GzipDecoder}).DecompressionStream;
    if (!Decoder) throw new Error('Compressed map data needs Content-Encoding: gzip or browser gzip decoding support');
    const decoded = new Response(bytes).body!.pipeThrough(new Decoder('gzip'));
    return new Response(decoded).arrayBuffer();
}

export async function readMapJSON(response: Response): Promise<any> {
    return JSON.parse(new TextDecoder().decode(await readMapBytes(response)));
}
