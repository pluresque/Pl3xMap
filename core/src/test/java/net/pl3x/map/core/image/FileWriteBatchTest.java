package net.pl3x.map.core.image;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import javax.imageio.ImageIO;

/** JDK-only contract tests, runnable without a Minecraft server or Gradle dependencies. */
public final class FileWriteBatchTest {
    private static int checks;

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static void coalescesAndKeepsOrder() throws Exception {
        AtomicReference<int[]> file = new AtomicReference<>(new int[2]);
        AtomicInteger reads = new AtomicInteger(), writes = new AtomicInteger();
        ReentrantLock lock = new ReentrantLock();
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(100);
        for (int i = 0; i < 4; i++) {
            batch.update(Path.of("parent"), 1, lock,
                    () -> { reads.incrementAndGet(); return file.get().clone(); },
                    value -> value[0] = value[0] * 10 + 1,
                    value -> { writes.incrementAndGet(); file.set(value.clone()); });
        }
        check(reads.get() == 0 && writes.get() == 0, "parent must remain pending");
        batch.close();
        check(reads.get() == 1 && writes.get() == 1, "read and compress parent once");
        check(file.get()[0] == 1111, "overlapping operations must retain submission order");
        batch.close();
        check(writes.get() == 1, "closing twice must not write twice");
    }

    private static void boundedInputsAndOversizeUpdate() throws Exception {
        AtomicInteger applied = new AtomicInteger();
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(3);
        ReentrantLock lock = new ReentrantLock();
        for (int i = 1; i <= 30; i++) {
            batch.update(Path.of("parent" + (i % 5)), 1, lock, () -> new int[1],
                    value -> applied.incrementAndGet(), value -> {});
            check(i - applied.get() <= 3, "retained input estimate exceeded budget");
        }
        batch.close();
        check(applied.get() == 30, "eviction must not drop patches");
        FileWriteBatch<int[]> small = new FileWriteBatch<>(1);
        small.update(Path.of("large"), 20, lock, () -> new int[1],
                value -> applied.incrementAndGet(), value -> {});
        check(applied.get() == 31, "oversize inputs must be flushed immediately");
        small.close();
    }

    private static void usesLatestFileUnderLock() throws Exception {
        ReentrantLock lock = new ReentrantLock();
        AtomicReference<int[]> file = new AtomicReference<>(new int[2]);
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(100);
        batch.update(Path.of("parent"), 1, lock,
                () -> { check(lock.isHeldByCurrentThread(), "reader needs file lock"); return file.get().clone(); },
                value -> { check(lock.isHeldByCurrentThread(), "patch needs file lock"); value[0] = 9; },
                value -> { check(lock.isHeldByCurrentThread(), "writer needs file lock"); file.set(value.clone()); });
        // Represents an unrelated immediate writer updating another part of this parent.
        lock.lock();
        try { file.set(new int[]{0, 71}); } finally { lock.unlock(); }
        batch.close();
        check(Arrays.equals(file.get(), new int[]{9, 71}), "flush must read latest file and preserve other patches");
    }

    private static void concurrentPatches() throws Exception {
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(7);
        AtomicReference<int[]> file = new AtomicReference<>(new int[128]);
        ReentrantLock lock = new ReentrantLock();
        try (var pool = Executors.newFixedThreadPool(4)) {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 128; i++) {
                final int position = i;
                futures.add(pool.submit(() -> {
                    try {
                        batch.update(Path.of("shared"), 1, lock, () -> file.get().clone(),
                                value -> value[position] = position + 1, value -> file.set(value.clone()));
                    } catch (IOException e) { throw new RuntimeException(e); }
                }));
            }
            for (var future : futures) future.get();
        }
        batch.close();
        for (int i = 0; i < 128; i++) check(file.get()[i] == i + 1, "concurrent patch lost");
    }

    private static void drainsFailuresAndReleasesLocks() throws Exception {
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(100);
        ReentrantLock lock = new ReentrantLock();
        AtomicInteger succeeded = new AtomicInteger();
        batch.update(Path.of("bad-read"), 1, lock, () -> { throw new IOException("read failed"); }, value -> {}, value -> {});
        batch.update(Path.of("bad-update"), 1, lock, () -> new int[1], value -> { throw new IllegalStateException("update failed"); }, value -> {});
        batch.update(Path.of("bad-write"), 1, lock, () -> new int[1], value -> {}, value -> { throw new IOException("write failed"); });
        batch.update(Path.of("good"), 1, lock, () -> new int[1], value -> value[0] = 42, value -> succeeded.set(value[0]));
        try { batch.close(); throw new AssertionError("failure must propagate"); }
        catch (IOException failure) {
            check(failure.getSuppressed().length == 2, "all file failures must be retained");
        }
        check(succeeded.get() == 42, "one failure must not discard other files");
        check(!lock.isLocked(), "failure left a file lock held");
        batch.update(Path.of("late"), 1, lock, () -> new int[1], value -> value[0] = 77, value -> succeeded.set(value[0]));
        check(succeeded.get() == 77, "late updates must execute immediately instead of leaking in closed queue");
    }

    private static void evictionFailureRetainsOtherFiles() throws Exception {
        FileWriteBatch<int[]> batch = new FileWriteBatch<>(1);
        ReentrantLock lock = new ReentrantLock();
        AtomicInteger persisted = new AtomicInteger();
        batch.update(Path.of("bad"), 1, lock, () -> new int[1], value -> {},
                value -> { throw new IOException("evicted write failed"); });
        try {
            batch.update(Path.of("good"), 1, lock, () -> new int[1], value -> value[0] = 63,
                    value -> persisted.set(value[0]));
            throw new AssertionError("eviction failure must propagate");
        } catch (IOException expected) {
            check(!lock.isLocked(), "eviction failure left lock held");
        }
        batch.close();
        check(persisted.get() == 63, "eviction failure discarded a different queued file");
    }

    private static void pngPixelsStayIdentical(Path dir) throws Exception {
        BufferedImage initial = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) {
            initial.setRGB(x, y, ((x % 3 == 0 ? 0 : 127) << 24) | (x * 7 << 16) | (y * 7 << 8) | 71);
        }
        Path immediate = dir.resolve("immediate.png"), deferred = dir.resolve("deferred.png");
        ImageIO.write(initial, "png", immediate.toFile());
        ImageIO.write(initial, "png", deferred.toFile());
        AtomicInteger immediateWrites = new AtomicInteger(), deferredWrites = new AtomicInteger();
        ReentrantLock lock = new ReentrantLock();
        try (FileWriteBatch<BufferedImage> a = new FileWriteBatch<>(0);
             FileWriteBatch<BufferedImage> b = new FileWriteBatch<>(100)) {
            for (int patch = 0; patch < 4; patch++) {
                final int offsetX = (patch % 2) * 16, offsetY = (patch / 2) * 16;
                Consumer<BufferedImage> update = image -> {
                    for (int y = offsetY; y < offsetY + 16; y++) for (int x = offsetX; x < offsetX + 16; x++) {
                        if ((x + y) % 7 == 0) continue; // retain pixels outside the patch's write mask
                        int argb = ((x + y) % 5 == 0) ? 0 : 0x80000000 | (x * 3 << 16) | (y * 5 << 8) | 11;
                        image.setRGB(x, y, argb);
                    }
                };
                a.update(immediate, 1, lock, () -> ImageIO.read(immediate.toFile()), update,
                        image -> { ImageIO.write(image, "png", immediate.toFile()); immediateWrites.incrementAndGet(); });
                b.update(deferred, 1, lock, () -> ImageIO.read(deferred.toFile()), update,
                        image -> { ImageIO.write(image, "png", deferred.toFile()); deferredWrites.incrementAndGet(); });
            }
        }
        int[] first = ImageIO.read(immediate.toFile()).getRGB(0, 0, 32, 32, null, 0, 32);
        int[] second = ImageIO.read(deferred.toFile()).getRGB(0, 0, 32, 32, null, 0, 32);
        check(Arrays.equals(first, second), "PNG ARGB pixels changed after coalescing");
        check(immediateWrites.get() == 4 && deferredWrites.get() == 1, "PNG compression was not coalesced");
    }

    private static ByteBuffer readGzip(Path path) throws IOException {
        try (var in = new GZIPInputStream(Files.newInputStream(path))) {
            return ByteBuffer.wrap(in.readAllBytes());
        }
    }

    private static void writeGzip(Path path, ByteBuffer bytes) throws IOException {
        try (var out = new GZIPOutputStream(Files.newOutputStream(path))) { out.write(bytes.array()); }
    }

    private static void metadataBytesStayIdentical(Path dir) throws Exception {
        ByteBuffer initial = ByteBuffer.allocate(12 + 64 * 4);
        for (int i = 0; i < initial.capacity(); i++) initial.put(i, (byte) (i * 13));
        Path first = dir.resolve("immediate.gz"), second = dir.resolve("deferred.gz");
        writeGzip(first, initial); writeGzip(second, initial);
        ReentrantLock lock = new ReentrantLock();
        AtomicInteger writes = new AtomicInteger();
        try (FileWriteBatch<ByteBuffer> a = new FileWriteBatch<>(0);
             FileWriteBatch<ByteBuffer> b = new FileWriteBatch<>(100)) {
            for (int patch = 0; patch < 4; patch++) {
                final int offset = patch * 8;
                Consumer<ByteBuffer> update = buffer -> {
                    buffer.putInt(0, 0x706c3378); buffer.putInt(4, 0x6d617001); buffer.putInt(8, -64);
                    for (int i = offset; i < offset + 8; i++) buffer.putInt(12 + i * 4, i * 1009);
                };
                a.update(first, 1, lock, () -> readGzip(first), update, buffer -> writeGzip(first, buffer));
                b.update(second, 1, lock, () -> readGzip(second), update, buffer -> { writeGzip(second, buffer); writes.incrementAndGet(); });
            }
        }
        check(Arrays.equals(readGzip(first).array(), readGzip(second).array()), "decompressed metadata bytes changed");
        check(writes.get() == 1, "metadata compression was not coalesced");
    }

    public static void main(String[] args) throws Exception {
        coalescesAndKeepsOrder(); boundedInputsAndOversizeUpdate(); usesLatestFileUnderLock();
        concurrentPatches(); drainsFailuresAndReleasesLocks(); evictionFailureRetainsOtherFiles();
        Path dir = Files.createTempDirectory("pl3x-batch-contract-");
        try { pngPixelsStayIdentical(dir); metadataBytesStayIdentical(dir); }
        finally {
            try (var paths = Files.walk(dir)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
        System.out.println("Parent tile batching: " + checks + " contract assertions passed");
    }
}
