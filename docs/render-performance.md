# Server render baseline

Measured on 2026-11-07 before server renderer changes. Server plugin
`26.3-557`, core commit `9876e4b`. The deployed web changes do not modify
these Java rendering classes.

The workload is `pl3xmap radiusrender world 512 -768 -768`: nine existing
regions (X and Z from -3 through -1), 9216 occupied chunk slots, no players.
The host has four logical CPUs and the default automatic renderer pool uses
two workers. PNG compression quality is 0.0, biome blend 3, zoom levels 0–3.
No configuration or world generation changes were made for the baseline.

Three runs took approximately 13.2 seconds from command submission to the
first observed idle status, including scheduling and observation delay.
For the repeat run, worker creation to last output write was 7.86 seconds.
The two execution profiles agree closely:

| Active task stage | Share |
| --- | ---: |
| Load region / decode NBT / populate | 30.6% |
| PNG encoding | 26.4% |
| Scan / colors / lighting | 23.3% |
| Block metadata GZIP encoding | 13.8% |
| Other save/zoom work | 5.9% |

Estimated temporary Java allocations in renderer workers were 1.54 GB for
this workload. This is allocation volume, not retained heap. About 70% came
through chunk loading, including neighboring chunks. The observed disk
wait was small; filesystem caches were not cleared.

For these nine regions, each format saves 36 times across zoom levels 0–3,
while only 15 output paths are distinct. This count follows the render/save
loops and region coordinates; it is not a system-call trace. Coalescing
updates to parent tiles is the first optimization to test.

The machine-readable baseline is `benchmarks/render-baseline.json`.
Raw profiles remain outside the repository because they include broader
server configuration metadata. Profiles were saved locally using spark's
`--save-to-file` option.

## Comparison requirements

Keep the renderer, PNG compression, biome blend and all world render
settings unchanged. Repeat on the same existing regions after JVM warmup.
Compare decoded ARGB pixels for every affected PNG and decompressed bytes
for every block-info file, including unchanged areas of parent tiles.
Compressed bytes can differ without a pixel or metadata difference.
Track worker CPU time, allocation volume, wall time and game tick health.
Account separately for queue wait and the status polling interval.

A bounded cache is required for a full-world render: coalescing a small
benchmark must not retain unlimited tile or region buffers. Failure paths
must drain other pending writes and leave file locks usable.

## Parent write coalescing

A `RenderBatch` scopes parent updates to the regions scheduled for one world.
Base zoom-0 tiles retain immediate writes. Higher zooms queue the existing
pixel and block-info patch operations and load the latest parent under its
normal file lock when the queue is flushed. Downsampling, color conversion,
PNG compression parameters and GZIP encoding remain unchanged.

Each queue conservatively accounts for captured source buffers and evicts
pending parent writes when its 32 MiB input budget is exceeded. Both queues
are closed before the render progress becomes idle and before world cleanup.
A failed parent write does not prevent other pending files from being drained.
Callers outside a scheduled batch retain immediate-write behavior.

Run the JDK-only cache contract checks with `scripts/test-tile-write-batch.sh`
using JDK 25. They cover ordered coalescing, bounded retention, concurrent
patches, file locks, deferred reads of the latest parent, failure recovery,
ARGB pixel equivalence and decompressed block metadata equivalence.

For a controlled comparison against an installed universal plugin, use
`scripts/build-render-patch.py --base-jar ORIGINAL.jar --output PATCHED.jar`
with JDK 25 on PATH. It compiles only the changed renderer classes against
the exact original plugin, preserving all other dependency and resource
contents. Signed input JARs are rejected. A JSON build manifest records the
input checksum, commit and changed classes. A normal distribution build can
still be produced using the repository's Gradle build.
