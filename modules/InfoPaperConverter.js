class InfoPaperConverter {
    constructor() {
        this.version = '1.0';
    }

    buildColorIndexMap(colorSetName) {
        if (!colorSets[colorSetName]) {
            console.warn(`[InfoPaperConverter] 未知的颜色集: ${colorSetName}, 使用 mard291 作为回退`);
            colorSetName = 'mard291';
        }
        const colorSet = colorSets[colorSetName];
        const colorToIndex = new Map();
        const indexToColor = new Map();

        colorToIndex.set('transparent', 0);
        indexToColor.set(0, { name: 'transparent', rgb: [255, 255, 255], isTransparent: true });

        colorSet.forEach((color, index) => {
            const colorKey = `${color.rgb[0]},${color.rgb[1]},${color.rgb[2]}`;
            colorToIndex.set(colorKey, index + 1);
            colorToIndex.set(color.name, index + 1);
            indexToColor.set(index + 1, { ...color, isTransparent: false });
        });

        return { colorToIndex, indexToColor, colorSetName: colorSetName };
    }

    toInfoPaper(perlerColors, colorSetName, width, height) {
        if (!perlerColors || !Array.isArray(perlerColors) || perlerColors.length === 0) {
            throw new Error('无效的拼豆数据');
        }

        const { colorToIndex, colorSetName: actualColorSet } = this.buildColorIndexMap(colorSetName);

        const pixelData = [];
        const colorCounts = {};

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const color = perlerColors[y][x];
                let colorIndex;

                if (color.isTransparent) {
                    colorIndex = 0;
                } else {
                    let rgb = color.rgb;
                    if (!rgb && color.hex) {
                        const h = color.hex.replace('#', '');
                        rgb = [
                            parseInt(h.substr(0, 2), 16),
                            parseInt(h.substr(2, 2), 16),
                            parseInt(h.substr(4, 2), 16)
                        ];
                    }
                    const colorKey = rgb ? `${rgb[0]},${rgb[1]},${rgb[2]}` : null;
                    colorIndex = colorKey ? colorToIndex.get(colorKey) : undefined;

                    if (colorIndex === undefined) {
                        colorIndex = colorToIndex.get(color.name);
                    }

                    if (colorIndex === undefined) {
                        console.warn(`未知颜色: ${color.name} (${rgb ? rgb.join(',') : color.hex})，使用透明色代替`);
                        colorIndex = 0;
                    }
                }

                pixelData.push(colorIndex);

                if (colorIndex > 0) {
                    const colorName = color.name;
                    if (colorCounts[colorName]) {
                        colorCounts[colorName]++;
                    } else {
                        colorCounts[colorName] = 1;
                    }
                }
            }
        }

        const infoPaper = {
            version: this.version,
            metadata: {
                width: width,
                height: height,
                colorSet: actualColorSet,
                colorCounts: colorCounts
            },
            pixels: {
                encoding: 'byte-stream',
                data: pixelData.join(',')
            }
        };

        return infoPaper;
    }

    isLLMFormat(data) {
        return data && data.version === "2.0" && Array.isArray(data.rows);
    }

    fromLLMFormat(data) {
        if (!this.isLLMFormat(data)) {
            throw new Error('不是 LLM v2.0 格式');
        }

        const colorSetName = data.colorSet || 'mard221';
        const { indexToColor } = this.buildColorIndexMap(colorSetName);

        const rows = data.rows;
        if (rows.length === 0) {
            throw new Error('图纸数据为空');
        }

        const firstRow = rows[0].split(',').map(s => parseInt(s.trim(), 10));
        const width = firstRow.length;
        const height = rows.length;

        if (width === 0) {
            throw new Error('图纸宽度为0');
        }

        const perlerColors = [];
        for (let y = 0; y < height; y++) {
            const rowStr = rows[y];
            let rowIndices = rowStr.split(',').map(s => parseInt(s.trim(), 10));
            
            if (rowIndices.length < width) {
                const lastColor = rowIndices.length > 0 ? rowIndices[rowIndices.length - 1] : 0;
                while (rowIndices.length < width) {
                    rowIndices.push(lastColor);
                }
            } else if (rowIndices.length > width) {
                rowIndices = rowIndices.slice(0, width);
            }

            const row = [];
            for (let x = 0; x < width; x++) {
                const index = rowIndices[x];
                let color = indexToColor.get(index);
                if (color === undefined) {
                    color = indexToColor.get(0);
                }
                row.push({ ...color });
            }
            perlerColors.push(row);
        }

        return {
            perlerColors: perlerColors,
            width: width,
            height: height,
            colorSet: colorSetName,
            colorCounts: this.calculateColorCounts(perlerColors)
        };
    }

    fromInfoPaper(infoPaper) {
        if (!infoPaper || typeof infoPaper !== 'object') {
            throw new Error('无效的信息化图纸数据');
        }

        if (!infoPaper.metadata || !infoPaper.pixels) {
            throw new Error('信息化图纸数据缺少必要字段');
        }

        const { width, height, colorSet, colorCounts } = infoPaper.metadata;
        const { data } = infoPaper.pixels;

        if (!width || !height || !colorSet || !data) {
            throw new Error('信息化图纸数据缺少必要信息');
        }

        const { indexToColor } = this.buildColorIndexMap(colorSet);

        const pixelIndices = data.split(',').map(s => parseInt(s.trim(), 10));

        if (pixelIndices.length !== width * height) {
            throw new Error(`像素数据长度不匹配：预期 ${width * height}，实际 ${pixelIndices.length}`);
        }

        const perlerColors = [];
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                const index = pixelIndices[y * width + x];
                const color = indexToColor.get(index);

                if (color === undefined) {
                    throw new Error(`未知的颜色编号: ${index}`);
                }

                row.push({ ...color });
            }
            perlerColors.push(row);
        }

        return {
            perlerColors: perlerColors,
            width: width,
            height: height,
            colorSet: colorSet,
            colorCounts: colorCounts || this.calculateColorCounts(perlerColors)
        };
    }

    calculateColorCounts(perlerColors) {
        const colorCounts = {};
        for (let y = 0; y < perlerColors.length; y++) {
            for (let x = 0; x < perlerColors[y].length; x++) {
                const color = perlerColors[y][x];
                if (!color.isTransparent) {
                    if (colorCounts[color.name]) {
                        colorCounts[color.name]++;
                    } else {
                        colorCounts[color.name] = 1;
                    }
                }
            }
        }
        return colorCounts;
    }

    toJSON(infoPaper) {
        return JSON.stringify(infoPaper, null, 2);
    }

    fromJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            return this.fromInfoPaper(parsed);
        } catch (e) {
            throw new Error(`JSON 解析失败: ${e.message}`);
        }
    }
}


/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.InfoPaperConverter = InfoPaperConverter;
}
