package net.pl3x.map.core.image;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.Lock;
import java.util.function.Consumer;

/** Coalesces read-modify-write operations without retaining unbounded inputs. */
public final class FileWriteBatch<T> implements AutoCloseable {
    @FunctionalInterface
    public interface Reader<T> {
        T read() throws IOException;
    }

    @FunctionalInterface
    public interface Writer<T> {
        void write(T value) throws IOException;
    }

    private final long budget;
    private final Map<Path, Pending<T>> pending = new LinkedHashMap<>(16, 0.75F, true);
    private long retainedBytes;
    private boolean closed;

    public FileWriteBatch(long budget) {
        if (budget < 0) throw new IllegalArgumentException("Negative write batch budget");
        this.budget = budget;
    }

    /**
     * Inputs captured by update must remain immutable until this batch is closed.
     * The estimate conservatively includes the source buffer for every update,
     * even when several updates share that buffer.
     */
    public synchronized void update(Path path, long inputBytes, Lock lock,
                                    Reader<T> reader, Consumer<T> update, Writer<T> writer) throws IOException {
        if (inputBytes < 1) throw new IllegalArgumentException("Missing retained input size");
        if (this.closed || this.budget == 0) {
            Pending<T> write = new Pending<>(path, lock, reader, writer);
            write.updates.add(update);
            write.flush();
            return;
        }

        Pending<T> write = this.pending.computeIfAbsent(path, key -> new Pending<>(key, lock, reader, writer));
        write.updates.add(update);
        write.bytes += inputBytes;
        this.retainedBytes += inputBytes;
        while (this.retainedBytes > this.budget) flushOldest();
    }

    private void flushOldest() throws IOException {
        var iterator = this.pending.values().iterator();
        Pending<T> write = iterator.next();
        iterator.remove();
        this.retainedBytes -= write.bytes;
        write.flush();
    }

    /** Drains other files even if one write fails, and rejects further queuing. */
    @Override
    public synchronized void close() throws IOException {
        this.closed = true;
        IOException failure = null;
        while (!this.pending.isEmpty()) {
            try {
                flushOldest();
            } catch (IOException e) {
                if (failure == null) failure = e;
                else failure.addSuppressed(e);
            }
        }
        if (failure != null) throw failure;
    }

    private static final class Pending<T> {
        private final Path path;
        private final Lock lock;
        private final Reader<T> reader;
        private final Writer<T> writer;
        private final List<Consumer<T>> updates = new ArrayList<>();
        private long bytes;

        private Pending(Path path, Lock lock, Reader<T> reader, Writer<T> writer) {
            this.path = path;
            this.lock = lock;
            this.reader = reader;
            this.writer = writer;
        }

        private void flush() throws IOException {
            this.lock.lock();
            try {
                T value = this.reader.read();
                for (Consumer<T> update : this.updates) update.accept(value);
                this.writer.write(value);
            } catch (Exception e) {
                throw new IOException("Could not flush tile " + this.path, e);
            } finally {
                this.lock.unlock();
                this.updates.clear();
            }
        }
    }
}
