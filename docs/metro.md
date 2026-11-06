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
- Each world's `label` names its metro tab.
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
- A line's `stations` lists station IDs in travel order. Reuse a station ID on
  multiple lines for an interchange. For a circular line, close the geometry by
  repeating its first point; list each station only once.

Only configured worlds with at least one line display the metro tab. Missing
`metro.json` is supported. Invalid configuration disables the overlay and logs
an explanation in the browser console. The file is fetched once per page load;
reload the browser after editing it. There is no continuous metro polling.

Line checkboxes hide routes and their exclusive stations. Shared stations remain
visible while any serving line is enabled. Clicking a station enables its lines,
centers the map and shows its coordinates. Station labels can be disabled.

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
