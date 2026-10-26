/**
 * 像素化模块
 * 负责处理原图 → 像素格子数据
 */
class Pixelator {
    constructor() {
        // 这里我们复用 colorUtils.js 中的像素化函数
        // 后续可以把这些函数移到这个类中
    }

    /**
     * 执行像素化处理
     * @param {ImageData} imageData - 原图数据
     * @param {Object} options - 像素化选项
     * @returns {Object} - 像素化结果
     */
    process(imageData, options) {
        const {
            blockSize,
            offsetX = 0,
            offsetY = 0,
            method = 'mosaic',
            targetColorCount,
            enableContrast,
            contrastFactor,
            enableSharpen,
            sharpenStrength,
            enableColorQuantize,
            colorCount,
            excludedColors
        } = options;

        let resultData;

        // 调用 colorUtils.js 中的像素化函数
        switch (method) {
            case 'pixel-art':
                resultData = pixelArtPixelate(imageData, blockSize, offsetX, offsetY);
                break;
            case 'quantized':
                resultData = quantizedPixelate(imageData, blockSize, targetColorCount, offsetX, offsetY);
                break;
            case 'majority':
                resultData = pixelateMajority(imageData, blockSize, offsetX, offsetY);
                break;
            case 'mosaic':
            default:
                resultData = pixelate(imageData, blockSize, offsetX, offsetY);
                break;
        }

        // 后处理
        if (enableContrast) {
            resultData = adjustContrast(resultData, contrastFactor);
        }

        if (enableSharpen) {
            resultData = sharpenImage(resultData, sharpenStrength);
        }

        if (enableColorQuantize) {
            resultData = quantizeColors(resultData, colorCount, excludedColors, 'layered');
        }

        // 从 resultData 提取像素格子数据（grid）
        const width = imageData.width;
        const height = imageData.height;
        const blocksX = Math.ceil((width + offsetX) / blockSize);
        const blocksY = Math.ceil((height + offsetY) / blockSize);

        const pixelGrid = this.extractGrid(resultData, blocksX, blocksY, blockSize, offsetX, offsetY);
        const colorStats = this.calculateColorStats(resultData);

        return {
            imageData: resultData,
            grid: pixelGrid,
            width: blocksX,
            height: blocksY,
            colorStats: colorStats
        };
    }

    /**
     * 从像素化后的 ImageData 提取格子数据
     * @param {ImageData} imageData - 像素化后的图片
     * @param {number} blocksX - 格子数 x
     * @param {number} blocksY - 格子数 y
     * @param {number} blockSize - 格子大小
     * @param {number} offsetX - X轴偏移
     * @param {number} offsetY - Y轴偏移
     * @returns {Array} - 二维像素格子数组
     */
    extractGrid(imageData, blocksX, blocksY, blockSize, offsetX, offsetY) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        const grid = [];

        for (let y = 0; y < blocksY; y++) {
            const row = [];
            for (let x = 0; x < blocksX; x++) {
                // 计算当前格子的中心像素
                const pixelX = -offsetX + x * blockSize + Math.floor(blockSize / 2);
                const pixelY = -offsetY + y * blockSize + Math.floor(blockSize / 2);

                // 取边界内的像素
                const sampleX = Math.max(0, Math.min(pixelX, width - 1));
                const sampleY = Math.max(0, Math.min(pixelY, height - 1));

                const idx = (sampleY * width + sampleX) * 4;
                row.push({
                    r: data[idx],
                    g: data[idx + 1],
                    b: data[idx + 2],
                    a: data[idx + 3]
                });
            }
            grid.push(row);
        }

        return grid;
    }

    /**
     * 计算颜色统计
     * @param {ImageData} imageData - 图片数据
     * @returns {Array} - 颜色统计数组
     */
    calculateColorStats(imageData) {
        const data = imageData.data;
        const colorMap = new Map();
        const totalPixels = imageData.width * imageData.height;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const key = `${r},${g},${b}`;
            
            if (!colorMap.has(key)) {
                colorMap.set(key, { r, g, b, count: 0 });
            }
            colorMap.get(key).count++;
        }
        
        return Array.from(colorMap.values()).map(color => ({
            ...color,
            percentage: ((color.count / totalPixels) * 100).toFixed(2)
        }));
    }
}




/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.Pixelator = Pixelator;
}
