# Server render performance

## Parent-write comparison, 2026-11-07

Parent write coalescing reduced renderer worker CPU by **24.1%** on the
same nine-region workload. All 15 PNGs and 15 block-info files remained
byte-identical, including their entire decoded payloads and the portions of
parent tiles outside the rendered area. Compression, resolution and color
settings did not change.

| Metric | Before | After |
| --- | ---: | ---: |
| Renderer worker CPU, mean of two runs | 14.81 CPU-s | 11.24 CPU-s |
| PNG + GZIP active wall samples, mean | 5.85 s | 2.48 s |
| Tile saves, both formats | 72 | 30 |
| Parent tile saves, both formats | 54 | 12 |
| Java `/proc/io` write-bytes delta, mean per profile window | 35.11 MiB | 13.30 MiB |
| Estimated renderer allocation volume, one sampled run | 1.54 GB | 1.52 GB |

The original save counts follow the original loops and region coordinates;
the patched counts were observed with Linux inotify on successful final
file renames. Every parent was written once in each patched warm/measured
run. Larger batches can exceed the bounded cache and write a parent again
after eviction.

The two original worker CPU measurements were 14.25 and 15.37 CPU-s; the
patched measurements were 10.81 and 11.66 CPU-s. These are per-thread
`utime + stime` deltas at 100 Hz, including the final parent flush. Active
wall sampling also includes `RenderBatch.close`; idle worker parking is
excluded. Wall samples are separate from the CPU counters.

Command-to-observed-idle times were 11.18/13.17 s before and 11.17/11.15 s
after. They include scheduling and two-second status polling, so this is
not a precise measurement of render wall time. The original JVM was
long-lived; the patched JVM was restarted and given two warmup renders.
There were no players and filesystem caches were not cleared.

No RAM improvement is claimed. Peak process RSS averaged 4.81 GiB before
and 5.81 GiB after; committed heap was 4.00 versus 5.23 GiB. The restart
confounds this comparison. Estimated allocation volume barely changed.
The queue bounds limit retained source references, not the whole server
heap. There was no comparable per-run RSS growth in repeated patched runs.
TPS remained 20.0, with maximum observed five-second tick-time reports of
11.3/17.5 ms in the patched CPU runs; this does not characterize active
player load.

The baseline core was `9876e4b`; the renderer change is `adf332d`, packaged
at `4a329a6` against the exact installed JAR. All other dependency and
resource payloads were checked unchanged. The patched build is deployed,
the renderer is idle, and the original background profiler resumed.
The Pl3xMap config and `metro.json` checksums did not change. One MCA file
changed during the graceful restart/save, but all 30 output files still
matched both compressed bytes and decoded contents.

Validation: 178 JDK-only contract assertions passed locally and in
[CI](https://github.com/pluresque/Pl3xMap/actions/runs/42323913608), followed
by full comparison of 3,932,160 RGBA pixels and 15,728,820 metadata bytes
from the actual server render. Machine-readable results and individual
measurements are in `benchmarks/render-parent-batch-comparison.json`.

## Original baseline

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
