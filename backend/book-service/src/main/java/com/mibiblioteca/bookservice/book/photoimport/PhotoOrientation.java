package com.mibiblioteca.bookservice.book.photoimport;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** Bounded TIFF IFD0 orientation reader for JPEG APP1 and PNG eXIf. Never follows other EXIF pointers. */
final class PhotoOrientation {
    int read(byte[] bytes) {
        Integer orientation = null;
        if (bytes[0] == (byte) 137) {
            for (int offset = 8; offset < bytes.length;) {
                int length = ByteBuffer.wrap(bytes, offset, 4).getInt(); // PNG structure/CRC already validated
                if (new String(bytes, offset + 4, 4, StandardCharsets.US_ASCII).equals("eXIf")) {
                    orientation = merge(orientation, tiff(bytes, offset + 8, length));
                }
                offset += length + 12;
            }
        } else {
            int offset = 2;
            while (offset < bytes.length) {
                if ((bytes[offset++] & 255) != 255) throw malformed();
                while (offset < bytes.length && (bytes[offset] & 255) == 255) offset++;
                if (offset >= bytes.length) throw malformed();
                int marker = bytes[offset++] & 255;
                if (marker == 0xda || marker == 0xd9) break;
                if (marker == 1 || marker >= 0xd0 && marker <= 0xd7) continue;
                if (offset + 2 > bytes.length) throw malformed();
                int length = (bytes[offset] & 255) * 256 + (bytes[offset + 1] & 255);
                if (length < 2 || length > bytes.length - offset) throw malformed();
                if (marker == 0xe1 && length >= 8 && bytes[offset + 2] == 'E' && bytes[offset + 3] == 'x'
                    && bytes[offset + 4] == 'i' && bytes[offset + 5] == 'f' && bytes[offset + 6] == 0 && bytes[offset + 7] == 0) {
                    orientation = merge(orientation, tiff(bytes, offset + 8, length - 8));
                }
                offset += length;
            }
        }
        return orientation == null ? 1 : orientation;
    }

    private Integer tiff(byte[] bytes, int start, int length) {
        if (length < 8) throw malformed();
        var buffer = ByteBuffer.wrap(bytes, start, length).slice();
        if (buffer.get(0) == 'I' && buffer.get(1) == 'I') buffer.order(ByteOrder.LITTLE_ENDIAN);
        else if (buffer.get(0) == 'M' && buffer.get(1) == 'M') buffer.order(ByteOrder.BIG_ENDIAN);
        else throw malformed();
        if (Short.toUnsignedInt(buffer.getShort(2)) != 42) throw malformed();
        long offset = Integer.toUnsignedLong(buffer.getInt(4));
        if (offset < 8 || offset > length - 2) throw malformed();
        int count = Short.toUnsignedInt(buffer.getShort((int) offset));
        if (offset + 2 + (long) count * 12 + 4 > length) throw malformed();
        Integer orientation = null;
        for (int i = 0; i < count; i++) {
            int entry = (int) offset + 2 + i * 12;
            if (Short.toUnsignedInt(buffer.getShort(entry)) == 0x112) {
                if (buffer.getShort(entry + 2) != 3 || buffer.getInt(entry + 4) != 1) throw malformed();
                int value = Short.toUnsignedInt(buffer.getShort(entry + 8));
                if (value < 1 || value > 8) throw malformed();
                orientation = merge(orientation, value);
            }
        }
        return orientation;
    }

    private Integer merge(Integer previous, Integer next) {
        if (previous != null && next != null && !previous.equals(next)) throw malformed();
        return next == null ? previous : next;
    }

    private PhotoImportException malformed() { return PhotoImportException.invalid("Invalid or ambiguous EXIF orientation", "file"); }
}
