package net.pl3x.map.core.renderer.task;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.ByteBuffer;
import net.pl3x.map.core.image.FileWriteBatch;

/** Parent tile writes belonging to one world's scheduled region batch. */
public final class RenderBatch implements AutoCloseable {
    // At most 64 MiB of conservatively estimated input references across both queues.
    private static final long INPUT_BUDGET = 32L * 1024L * 1024L;
    private final FileWriteBatch<BufferedImage> images = new FileWriteBatch<>(INPUT_BUDGET);
    private final FileWriteBatch<ByteBuffer> blockInfo = new FileWriteBatch<>(INPUT_BUDGET);

    public FileWriteBatch<BufferedImage> images() {
        return this.images;
    }

    public FileWriteBatch<ByteBuffer> blockInfo() {
        return this.blockInfo;
    }

    @Override
    public void close() throws IOException {
        IOException failure = null;
        try {
            this.images.close();
        } catch (IOException e) {
            failure = e;
        }
        try {
            this.blockInfo.close();
        } catch (IOException e) {
            if (failure == null) failure = e;
            else failure.addSuppressed(e);
        }
        if (failure != null) throw failure;
    }
}
