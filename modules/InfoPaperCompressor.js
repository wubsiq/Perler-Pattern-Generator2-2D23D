class InfoPaperCompressor {
    constructor() {
        this.version = '1.0';
        this.magicPrefix = 'INFOPAPER_V1:';
    }

    isSupported() {
        return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
    }

    async textToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    async base64ToText(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    async gzipCompress(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();
        const reader = cs.readable.getReader();
        const chunks = [];
        let result;
        do {
            result = await reader.read();
            if (result.value) {
                chunks.push(result.value);
            }
        } while (!result.done);
        let totalLength = 0;
        chunks.forEach(c => totalLength += c.length);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(c => {
            merged.set(c, offset);
            offset += c.length;
        });
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < merged.length; i += chunkSize) {
            const chunk = merged.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    async gzipDecompress(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        let result;
        do {
            result = await reader.read();
            if (result.value) {
                chunks.push(result.value);
            }
        } while (!result.done);
        let totalLength = 0;
        chunks.forEach(c => totalLength += c.length);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(c => {
            merged.set(c, offset);
            offset += c.length;
        });
        return new TextDecoder().decode(merged);
    }

    compress(infoPaper) {
        if (!infoPaper || !infoPaper.pixels || !infoPaper.pixels.data) {
            throw new Error('无效的信息化图纸数据');
        }

        const pixelIndices = infoPaper.pixels.data.split(',').map(s => parseInt(s.trim(), 10));

        const rleData = this.encodeRLE(pixelIndices);

        const compressed = {
            version: infoPaper.version,
            compressor: {
                version: this.version,
                algorithm: 'rle'
            },
            metadata: infoPaper.metadata,
            pixels: {
                encoding: 'rle',
                data: rleData
            }
        };

        return compressed;
    }

    decompress(compressed) {
        if (!compressed || !compressed.pixels || !compressed.pixels.data) {
            throw new Error('无效的压缩数据');
        }

        if (compressed.pixels.encoding !== 'rle') {
            throw new Error('不支持的压缩格式: ' + compressed.pixels.encoding);
        }

        const pixelIndices = this.decodeRLE(compressed.pixels.data);

        const infoPaper = {
            version: compressed.version,
            metadata: compressed.metadata,
            pixels: {
                encoding: 'byte-stream',
                data: pixelIndices.join(',')
            }
        };

        return infoPaper;
    }

    encodeRLE(indices) {
        if (indices.length === 0) return '';

        const parts = [];
        let currentIndex = indices[0];
        let count = 1;

        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === currentIndex) {
                count++;
            } else {
                parts.push(`${currentIndex}:${count}`);
                currentIndex = indices[i];
                count = 1;
            }
        }

        parts.push(`${currentIndex}:${count}`);

        return parts.join(',');
    }

    decodeRLE(rleString) {
        if (!rleString) return [];

        const indices = [];
        const parts = rleString.split(',');

        for (const part of parts) {
            const [indexStr, countStr] = part.split(':');
            const index = parseInt(indexStr, 10);
            const count = parseInt(countStr, 10);

            if (isNaN(index) || isNaN(count)) {
                throw new Error(`无效的 RLE 数据: ${part}`);
            }

            for (let i = 0; i < count; i++) {
                indices.push(index);
            }
        }

        return indices;
    }

    toCompressedJSON(compressed) {
        return JSON.stringify(compressed);
    }

    fromCompressedJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            return parsed;
        } catch (e) {
            throw new Error(`JSON 解析失败: ${e.message}`);
        }
    }

    compressToJSON(infoPaper) {
        const compressed = this.compress(infoPaper);
        return this.toCompressedJSON(compressed);
    }

    decompressFromJSON(jsonString) {
        const compressed = this.fromCompressedJSON(jsonString);
        return this.decompress(compressed);
    }

    isPackedString(text) {
        return typeof text === 'string' && text.startsWith(this.magicPrefix);
    }

    async pack(infoPaper) {
        const compressed = this.compress(infoPaper);
        const jsonText = this.toCompressedJSON(compressed);

        if (this.isSupported()) {
            const base64 = await this.gzipCompress(jsonText);
            return this.magicPrefix + base64;
        } else {
            return jsonText;
        }
    }

    async unpack(text) {
        if (this.isPackedString(text)) {
            const base64 = text.slice(this.magicPrefix.length);
            const jsonText = await this.gzipDecompress(base64);
            const compressed = this.fromCompressedJSON(jsonText);
            return this.decompress(compressed);
        } else {
            try {
                const parsed = JSON.parse(text);
                if (parsed.compressor && parsed.pixels && parsed.pixels.encoding === 'rle') {
                    return this.decompress(parsed);
                }
            } catch (e) {
            }
            return this.fromCompressedJSON(text);
        }
    }

    getCompressionRatio(original, compressed) {
        const originalSize = typeof original === 'string' ? original.length : JSON.stringify(original).length;
        const compressedSize = typeof compressed === 'string' ? compressed.length : JSON.stringify(compressed).length;
        return {
            original: originalSize,
            compressed: compressedSize,
            ratio: originalSize > 0 ? ((originalSize - compressedSize) / originalSize * 100).toFixed(2) : 0,
            saved: Math.max(0, originalSize - compressedSize)
        };
    }
}


/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.InfoPaperCompressor = InfoPaperCompressor;
}
