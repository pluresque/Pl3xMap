# Metro overlay

The fork adds a coordinate-based metro overlay to the web map. It renders routes
and stations in the browser; it does not scan blocks, load chunks, or schedule
Minecraft tasks.

## Configuration

Place a UTF-8 `metro.json` next to the deployed web map's `index.html`, usually
`plugins/Pl3xMap/web/metro.json`. Start from `webmap/examples/metro.json` and
replace **all demo coordinates and station names** before publishing it.

This file is deliberately not bundled with the plugin, so extracting a new web
bundle will not overwrite an existing network. Keep a separate backup of it.

- `version` must be `1`.
- `worlds` uses the same world keys as `tiles/settings.json` (for example `world`
  or `world_nether`). Coordinates are local to that world; Nether coordinates
  are not multiplied by eight.
- Each world's `label` names its railway overlay in the Layers tab.
- `stations` contains unique `id`, `name`, `x`, `z`, and optional `y` fields.
- `lines` contains unique `id`, `name`, six-digit hex `color`, `points`, and
  `stations` fields.
- Each route point is `[x, z]`. Include bends in their actual order. Adjacent
  points must share X or Z, so segments follow the two block axes. Diagonal
  segments and consecutive duplicate points are rejected. For example, a route
  from `[0, 0]` to `[100, 100]` needs a real bend such as `[100, 0]` in between.
  Arbitrarily winding routes can have as many bends as needed. The viewer does
  not guess which corridor or side of a building the tracks use. Station
  coordinates do not automatically reshape the route.
- For parallel tracks, branches, or disconnected built sections, use `paths`
  instead of `points`: an array of independent point arrays. For example,
  `"paths": [[[0, 0], [100, 0]], [[0, 3], [100, 3]]]` draws two parallel tracks
  without connecting their ends. The same bend checks apply to every path.
  Crossings do not create stations or imply a rail connection.
- A line's `stations` lists station IDs in travel order. Reuse a station ID on
  multiple lines for an interchange. For a circular line, close the geometry by
  repeating its first point; list each station only once.

Worlds with a configured network show the railway overlay in the Layers tab.
The railway starts enabled and the browser remembers the layer checkbox.
Hover over a station to see its name, or click it for its coordinates.

The viewer fetches `metro.json` once per page load. A missing file leaves the
Layers tab available. Invalid configuration is reported in the browser console.

## Build and verification

From `webmap/`:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

The web bundle is written to `webmap/dist/`. Java code and server configuration
are unchanged. A web-only deployment does not require a Minecraft restart. Save
copies of the old `pl3xmap.js`, `styles.css`, and matching source maps before
replacing them. Preserve the existing `tiles/`, images, and custom markers.
Upstream plugin updates may replace customized web assets on startup unless
`settings.web-directory.read-only` is enabled; maintain these assets with the
fork's build when updating. Do not deploy demo routes to a live map.

## Marker polling changes

The fallback poller now has one timer and at most one request per marker layer.
SSE marker updates no longer start additional polling chains. Failures retry;
a recent push postpones the next poll without stopping fallback polling.
Unloading a world aborts pending marker requests and invalidates pending layer
loads. A late HTTP response cannot overwrite a newer SSE payload. Identical
payloads skip Leaflet marker mutations.

These changes target redundant browser work and HTTP traffic. They have not
been benchmarked for Minecraft TPS, world rendering throughput, or heap use.

Map data requests revalidate the HTTP cache, including tiles, marker payloads
and the railway configuration. This keeps browser caching from masking updates
when a standalone server previously used heuristic freshness. Unchanged data
can still use conditional HTTP responses. When serving compressed map files
directly, set `Content-Encoding: gzip` on `*.gz` and proxy `/sse/*` to the
internal map server to retain live updates.
JSON and binary block metadata also recognize undecoded gzip bodies. Browsers
with native gzip stream support can read those responses from static hosts or
embedded viewers; normally HTTP-decoded responses pass through unchanged.

## Railway networks

Use `connections` instead of legacy `lines` for station-to-station networks.
The two keys cannot be combined in one world. `lines` remains supported.
See `webmap/examples/railway.json` for an explicitly fictional demonstration.

A station may have `kind: "hub"`, `"terminal"`, or `"landmark"`, plus a hex
`color`. Leave its kind unset if its network role has not been established.
Connection `from` and `to` refer to station IDs. If `stations` is omitted it is
inferred from those endpoints. Branches inherit the terminal's color, regardless
of endpoint order. Connections between hubs have a thicker stroke and use both
hub colors. Routes without established endpoints can retain explicit colors and
station lists without implying a surveyed connection.

Set `planned: true` on a connection for a dashed path, or on a station for a
hollow dashed marker. Planned geometry is still explicitly specified and must
have orthogonal bends. `defaultHidden: true` starts an optional connection
unchecked, for example when a proposed corridor has not been agreed upon.
Do not present a sketch as an alignment recovered from rail blocks.

Optional `cornerRadius` rounds explicitly authored orthogonal bends, in world
blocks (0–256; default 0). It keeps endpoints and limits each curve to half of
the neighboring segments. Use it for schematic planning corridors; leave it at
zero to retain the vertices of a surveyed rail path. Independent `paths` are
rounded separately and are never joined through an empty gap.

Station labels are horizontal, with truncation for long names. At overview zoom
levels (more than one block per CSS pixel), permanent names are hidden: hover a
point or click it for details. Closer in, labels try four positions while avoiding
each other, other visible tooltips, popups and the sidebar. Hubs take priority
over terminals, then unclassified stations and landmarks. Layout runs in the
browser after map movement/zoom/resize, coalesced into animation frames. It does
not fetch additional data or schedule Minecraft work.

## Route browser

The railway panel has search by station or player name, built/planned filters,
individual visibility buttons, a global plans toggle and a fit-network action.
Selecting a row or clicking its path emphasizes that route without hiding the
rest of the network. Station actions and details appear in the selection card,
instead of repeating every endpoint throughout the list.

On screens up to 600 CSS pixels wide the panel becomes a bottom sheet. Selecting
a route switches it to a compact detail card and fits the path above it. The
fit-network action closes the mobile sheet. Wider screens use a side panel and
reserve its width when fitting a route.

Normal map colors are the default. The optional Scheme view mutes background
tiles; it does not change the rendered world files. View, label and global plan
preferences are stored in local storage when available. Broken or disabled
storage falls back to defaults. `description` can be supplied on a station or
connection for details shown when selected. Station popups include coordinates
and a copy action where the browser supports clipboard writes.

The explicit **Названия станций** switch stays available in both the list and
the compact mobile route card. It hides permanent station names while keeping
individual names available on hover or in a popup.

For a network diagram, provide one centerline per rail corridor. Keep both
surveyed tracks in a separate audit artifact if needed. Independent `paths`
remain useful for branches and disconnected pieces, rather than drawing both
rails as separate network lines.
