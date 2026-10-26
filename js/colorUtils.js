function rgbToXyz(r, g, b) {
    r = r / 255;
    g = g / 255;
    b = b / 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    r *= 100;
    g *= 100;
    b *= 100;

    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    return [x, y, z];
}

function xyzToLab(x, y, z) {
    x = x / 95.047;
    y = y / 100.000;
    z = z / 108.883;

    x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + (16/116);
    y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + (16/116);
    z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + (16/116);

    const l = (116 * y) - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);

    return [l, a, b];
}

function rgbToLab(r, g, b) {
    const xyz = rgbToXyz(r, g, b);
    return xyzToLab(xyz[0], xyz[1], xyz[2]);
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [h * 360, s * 100, l * 100];
}

function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h, s = max === 0 ? 0 : d / max, v = max;

    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [h * 360, s * 100, v * 100];
}

function deltaE76(lab1, lab2) {
    const dl = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dl * dl + da * da + db * db);
}

function deltaE94(lab1, lab2) {
    const dl = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    
    const c1 = Math.sqrt(lab1[1] * lab1[1] + lab1[2] * lab1[2]);
    const c2 = Math.sqrt(lab2[1] * lab2[1] + lab2[2] * lab2[2]);
    const dc = c1 - c2;
    
    const dh = Math.sqrt(da * da + db * db - dc * dc);
    
    const kL = 1;
    const kC = 1;
    const kH = 1;
    const K1 = 0.045;
    const K2 = 0.015;
    
    const SL = 1;
    const SC = 1 + K1 * c1;
    const SH = 1 + K2 * c1;
    
    const term1 = dl / (kL * SL);
    const term2 = dc / (kC * SC);
    const term3 = dh / (kH * SH);
    
    return Math.sqrt(term1 * term1 + term2 * term2 + term3 * term3);
}

function deltaE2000(lab1, lab2) {
    const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    
    const kL = 1, kC = 1, kH = 1;
    
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cavg = (C1 + C2) / 2;
    
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cavg, 7) / (Math.pow(Cavg, 7) + Math.pow(25, 7))));
    
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);
    
    let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
    if (h1p < 0) h1p += 360;
    
    let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
    if (h2p < 0) h2p += 360;
    
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    
    let dhp;
    if (C1p * C2p === 0) {
        dhp = 0;
    } else if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
    } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
    } else {
        dhp = h2p - h1p + 360;
    }
    
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    
    const Lpavg = (L1 + L2) / 2;
    const Cpavg = (C1p + C2p) / 2;
    
    let Hpavg;
    if (C1p * C2p === 0) {
        Hpavg = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        Hpavg = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
        Hpavg = (h1p + h2p + 360) / 2;
    } else {
        Hpavg = (h1p + h2p - 360) / 2;
    }
    
    const T = 1 - 0.17 * Math.cos((Hpavg - 30) * Math.PI / 180)
              + 0.24 * Math.cos(2 * Hpavg * Math.PI / 180)
              + 0.32 * Math.cos((3 * Hpavg + 6) * Math.PI / 180)
              - 0.20 * Math.cos((4 * Hpavg - 63) * Math.PI / 180);
    
    const SL = 1 + (0.015 * Math.pow(Lpavg - 50, 2)) / Math.sqrt(20 + Math.pow(Lpavg - 50, 2));
    const SC = 1 + 0.045 * Cpavg;
    const SH = 1 + 0.015 * Cpavg * T;
    
    const RT = -2 * Math.sqrt(Math.pow(Cpavg, 7) / (Math.pow(Cpavg, 7) + Math.pow(25, 7)))
               * Math.sin(60 * Math.exp(-Math.pow((Hpavg - 275) / 25, 2)) * Math.PI / 180);
    
    const term1 = dLp / (kL * SL);
    const term2 = dCp / (kC * SC);
    const term3 = dHp / (kH * SH);
    
    return Math.sqrt(term1 * term1 + term2 * term2 + term3 * term3 + RT * term2 * term3);
}

function weightedRgbDistance(rgb1, rgb2) {
    const rmean = (rgb1[0] + rgb2[0]) / 2;
    const r = rgb1[0] - rgb2[0];
    const g = rgb1[1] - rgb2[1];
    const b = rgb1[2] - rgb2[2];
    
    return Math.sqrt(
        (2 + rmean / 256) * r * r +
        4 * g * g +
        (2 + (255 - rmean) / 256) * b * b
    );
}

function hslDistance(hsl1, hsl2) {
    let hDiff = Math.abs(hsl1[0] - hsl2[0]);
    if (hDiff > 180) hDiff = 360 - hDiff;
    
    const sDiff = hsl1[1] - hsl2[1];
    const lDiff = hsl1[2] - hsl2[2];
    
    return Math.sqrt(
        hDiff * hDiff * 0.8 +
        sDiff * sDiff * 0.1 +
        lDiff * lDiff * 0.5
    );
}

function hsvDistance(hsv1, hsv2) {
    let hDiff = Math.abs(hsv1[0] - hsv2[0]);
    if (hDiff > 180) hDiff = 360 - hDiff;
    
    const sDiff = hsv1[1] - hsv2[1];
    const vDiff = hsv1[2] - hsv2[2];
    
    return Math.sqrt(
        hDiff * hDiff * 0.8 +
        sDiff * sDiff * 0.1 +
        vDiff * vDiff * 0.5
    );
}

const colorMappingMethods = {
    'cie2000': {
        name: 'CIEDE2000',
        nameZh: 'CIEDE2000 (最精确)',
        description: '最精确的颜色差异算法，适合专业色彩匹配',
        findClosest: function(rgb, colorSet) {
            const lab1 = rgbToLab(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const lab2 = rgbToLab(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = deltaE2000(lab1, lab2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'cie2000-smoothed': {
        name: 'CIEDE2000',
        nameZh: 'CIEDE2000 (大色块优化)',
        description: 'CIEDE2000算法优化版，保持大色块颜色统一',
        findClosest: function(rgb, colorSet) {
            const lab1 = rgbToLab(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const lab2 = rgbToLab(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = deltaE2000(lab1, lab2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'cie94': {
        name: 'CIE94',
        nameZh: 'CIE94 (精确)',
        description: '改进的Lab颜色差异算法，精确度较高',
        findClosest: function(rgb, colorSet) {
            const lab1 = rgbToLab(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const lab2 = rgbToLab(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = deltaE94(lab1, lab2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'cie76': {
        name: 'CIE76',
        nameZh: 'CIE76 (Lab)',
        description: '原始的Lab颜色差异算法，速度快',
        findClosest: function(rgb, colorSet) {
            const lab1 = rgbToLab(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const lab2 = rgbToLab(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = deltaE76(lab1, lab2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'weighted-rgb': {
        name: 'Weighted RGB',
        nameZh: '加权RGB',
        description: '考虑人眼对不同颜色敏感度的RGB算法',
        findClosest: function(rgb, colorSet) {
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const distance = weightedRgbDistance(rgb, color.rgb);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'hsl': {
        name: 'HSL',
        nameZh: 'HSL色彩空间',
        description: '基于色相、饱和度、亮度的颜色匹配',
        findClosest: function(rgb, colorSet) {
            const hsl1 = rgbToHsl(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const hsl2 = rgbToHsl(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = hslDistance(hsl1, hsl2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    },
    'hsv': {
        name: 'HSV',
        nameZh: 'HSV色彩空间',
        description: '基于色相、饱和度、明度的颜色匹配',
        findClosest: function(rgb, colorSet) {
            const hsv1 = rgbToHsv(rgb[0], rgb[1], rgb[2]);
            let closest = null;
            let minDistance = Infinity;
            
            for (const color of colorSet) {
                const hsv2 = rgbToHsv(color.rgb[0], color.rgb[1], color.rgb[2]);
                const distance = hsvDistance(hsv1, hsv2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = color;
                }
            }
            
            return closest;
        }
    }
};

function findClosestColor(rgb, colorSet, method = 'cie2000') {
    const mappingMethod = colorMappingMethods[method] || colorMappingMethods['cie2000'];
    return mappingMethod.findClosest(rgb, colorSet);
}

function calculateColorDistance(rgb1, rgb2, method = 'cie2000') {
    switch (method) {
        case 'cie2000':
            const lab1 = rgbToLab(rgb1[0], rgb1[1], rgb1[2]);
            const lab2 = rgbToLab(rgb2[0], rgb2[1], rgb2[2]);
            return deltaE2000(lab1, lab2);
        case 'cie94':
            const lab94_1 = rgbToLab(rgb1[0], rgb1[1], rgb1[2]);
            const lab94_2 = rgbToLab(rgb2[0], rgb2[1], rgb2[2]);
            return deltaE94(lab94_1, lab94_2);
        case 'cie76':
            const lab76_1 = rgbToLab(rgb1[0], rgb1[1], rgb1[2]);
            const lab76_2 = rgbToLab(rgb2[0], rgb2[1], rgb2[2]);
            return deltaE76(lab76_1, lab76_2);
        case 'weighted-rgb':
            return weightedRgbDistance(rgb1, rgb2);
        case 'hsl':
            const hsl1 = rgbToHsl(rgb1[0], rgb1[1], rgb1[2]);
            const hsl2 = rgbToHsl(rgb2[0], rgb2[1], rgb2[2]);
            return hslDistance(hsl1, hsl2);
        case 'hsv':
            const hsv1 = rgbToHsv(rgb1[0], rgb1[1], rgb1[2]);
            const hsv2 = rgbToHsv(rgb2[0], rgb2[1], rgb2[2]);
            return hsvDistance(hsv1, hsv2);
        default:
            return weightedRgbDistance(rgb1, rgb2);
    }
}

function pixelate(imageData, blockSize, offsetX = 0, offsetY = 0) {
    const width = imageData.width;
    const height = imageData.height;

    const blocksX = Math.ceil((width + offsetX) / blockSize);
    const blocksY = Math.ceil((height + offsetY) / blockSize);

    // 第一遍：计算每个块的颜色
    const blockColors = new Array(blocksX * blocksY);
    const blockHasColor = new Array(blocksX * blocksY).fill(false);

    for (let blockY = 0; blockY < blocksY; blockY++) {
        for (let blockX = 0; blockX < blocksX; blockX++) {
            let r = 0, g = 0, b = 0, count = 0;

            const blockStartX = -offsetX + blockX * blockSize;
            const blockStartY = -offsetY + blockY * blockSize;

            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const srcX = blockStartX + dx;
                    const srcY = blockStartY + dy;
                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                        const index = (srcY * width + srcX) * 4;
                        const alpha = imageData.data[index + 3];
                        if (alpha >= 128) {
                            r += imageData.data[index];
                            g += imageData.data[index + 1];
                            b += imageData.data[index + 2];
                            count++;
                        }
                    }
                }
            }

            const blockIndex = blockY * blocksX + blockX;
            if (count > 0) {
                blockColors[blockIndex] = {
                    r: Math.round(r / count),
                    g: Math.round(g / count),
                    b: Math.round(b / count)
                };
                blockHasColor[blockIndex] = true;
            }
        }
    }

    // 第二遍：填充像素
    const newData = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const blockX = Math.floor((x + offsetX) / blockSize);
            const blockY = Math.floor((y + offsetY) / blockSize);
            const blockIndex = blockY * blocksX + blockX;
            
            const index = (y * width + x) * 4;
            if (blockX >= 0 && blockX < blocksX && blockY >= 0 && blockY < blocksY && blockHasColor[blockIndex]) {
                newData.data[index] = blockColors[blockIndex].r;
                newData.data[index + 1] = blockColors[blockIndex].g;
                newData.data[index + 2] = blockColors[blockIndex].b;
                newData.data[index + 3] = 255;
            } else {
                newData.data[index] = 255;
                newData.data[index + 1] = 255;
                newData.data[index + 2] = 255;
                newData.data[index + 3] = 0;
            }
        }
    }

    return newData;
}

function pixelateMajority(imageData, blockSize, offsetX = 0, offsetY = 0) {
    const width = imageData.width;
    const height = imageData.height;

    const blocksX = Math.ceil((width + offsetX) / blockSize);
    const blocksY = Math.ceil((height + offsetY) / blockSize);

    // 第一遍：计算每个块的颜色
    const blockColors = new Array(blocksX * blocksY);
    const blockHasColor = new Array(blocksX * blocksY).fill(false);

    for (let blockY = 0; blockY < blocksY; blockY++) {
        for (let blockX = 0; blockX < blocksX; blockX++) {
            const colorCounts = {};
            let maxCount = 0;
            let dominantColor = null;

            const blockStartX = -offsetX + blockX * blockSize;
            const blockStartY = -offsetY + blockY * blockSize;

            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const srcX = blockStartX + dx;
                    const srcY = blockStartY + dy;
                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                        const index = (srcY * width + srcX) * 4;
                        const r = imageData.data[index];
                        const g = imageData.data[index + 1];
                        const b = imageData.data[index + 2];
                        const a = imageData.data[index + 3];

                        if (a >= 128) {
                            const key = `${r},${g},${b}`;
                            if (!colorCounts[key]) {
                                colorCounts[key] = { count: 0, r, g, b };
                            }
                            colorCounts[key].count++;

                            if (colorCounts[key].count > maxCount) {
                                maxCount = colorCounts[key].count;
                                dominantColor = colorCounts[key];
                            }
                        }
                    }
                }
            }

            const blockIndex = blockY * blocksX + blockX;
            if (dominantColor) {
                blockColors[blockIndex] = dominantColor;
                blockHasColor[blockIndex] = true;
            }
        }
    }

    // 第二遍：填充像素
    const newData = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const blockX = Math.floor((x + offsetX) / blockSize);
            const blockY = Math.floor((y + offsetY) / blockSize);
            const blockIndex = blockY * blocksX + blockX;
            
            const index = (y * width + x) * 4;
            if (blockX >= 0 && blockX < blocksX && blockY >= 0 && blockY < blocksY && blockHasColor[blockIndex]) {
                newData.data[index] = blockColors[blockIndex].r;
                newData.data[index + 1] = blockColors[blockIndex].g;
                newData.data[index + 2] = blockColors[blockIndex].b;
                newData.data[index + 3] = 255;
            } else {
                newData.data[index] = 255;
                newData.data[index + 1] = 255;
                newData.data[index + 2] = 255;
                newData.data[index + 3] = 0;
            }
        }
    }

    return newData;
}

function pixelArtPixelate(imageData, blockSize, offsetX = 0, offsetY = 0) {
    const width = imageData.width;
    const height = imageData.height;
    
    const startX = -offsetX;
    const startY = -offsetY;
    
    const blocksX = Math.ceil((width + offsetX) / blockSize);
    const blocksY = Math.ceil((height + offsetY) / blockSize);
    
    const smallData = new ImageData(blocksX, blocksY);
    const blockHasNonTransparent = new Array(blocksX * blocksY).fill(false);
    
    for (let y = 0; y < blocksY; y++) {
        for (let x = 0; x < blocksX; x++) {
            let r = 0, g = 0, b = 0, count = 0;
            
            for (let dy = 0; dy < blockSize; dy++) {
                for (let dx = 0; dx < blockSize; dx++) {
                    const srcX = startX + x * blockSize + dx;
                    const srcY = startY + y * blockSize + dy;
                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                        const index = (srcY * width + srcX) * 4;
                        const alpha = imageData.data[index + 3];
                        if (alpha >= 128) {
                            r += imageData.data[index];
                            g += imageData.data[index + 1];
                            b += imageData.data[index + 2];
                            count++;
                            blockHasNonTransparent[y * blocksX + x] = true;
                        }
                    }
                }
            }
            
            const dstIndex = (y * blocksX + x) * 4;
            if (count > 0) {
                smallData.data[dstIndex] = Math.round(r / count);
                smallData.data[dstIndex + 1] = Math.round(g / count);
                smallData.data[dstIndex + 2] = Math.round(b / count);
                smallData.data[dstIndex + 3] = 255;
            } else {
                smallData.data[dstIndex] = 255;
                smallData.data[dstIndex + 1] = 255;
                smallData.data[dstIndex + 2] = 255;
                smallData.data[dstIndex + 3] = 0;
            }
        }
    }
    
    const segmentedData = regionSegmentation(smallData);
    
    const resultData = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const blockX = Math.floor((x + offsetX) / blockSize);
            const blockY = Math.floor((y + offsetY) / blockSize);
            if (blockX >= 0 && blockX < blocksX && blockY >= 0 && blockY < blocksY) {
                const srcIndex = (blockY * blocksX + blockX) * 4;
                const dstIndex = (y * width + x) * 4;
                
                if (blockHasNonTransparent[blockY * blocksX + blockX]) {
                    resultData.data[dstIndex] = segmentedData.data[srcIndex];
                    resultData.data[dstIndex + 1] = segmentedData.data[srcIndex + 1];
                    resultData.data[dstIndex + 2] = segmentedData.data[srcIndex + 2];
                    resultData.data[dstIndex + 3] = 255;
                } else {
                    resultData.data[dstIndex] = 255;
                    resultData.data[dstIndex + 1] = 255;
                    resultData.data[dstIndex + 2] = 255;
                    resultData.data[dstIndex + 3] = 0;
                }
            }
        }
    }
    
    return resultData;
}

function regionSegmentation(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const result = new ImageData(width, height);
    
    const visited = new Uint8Array(width * height);
    const labels = new Int32Array(width * height);
    let labelCount = 0;
    const regionColors = [];
    
    const colorThreshold = 60;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (!visited[idx]) {
                const stack = [{x, y}];
                const regionPixels = [];
                const seedIndex = idx * 4;
                const seedR = imageData.data[seedIndex];
                const seedG = imageData.data[seedIndex + 1];
                const seedB = imageData.data[seedIndex + 2];
                
                while (stack.length > 0) {
                    const {x: cx, y: cy} = stack.pop();
                    const cidx = cy * width + cx;
                    
                    if (cx < 0 || cx >= width || cy < 0 || cy >= height || visited[cidx]) {
                        continue;
                    }
                    
                    const cDataIndex = cidx * 4;
                    const cr = imageData.data[cDataIndex];
                    const cg = imageData.data[cDataIndex + 1];
                    const cb = imageData.data[cDataIndex + 2];
                    
                    const dist = Math.sqrt(
                        Math.pow(cr - seedR, 2) +
                        Math.pow(cg - seedG, 2) +
                        Math.pow(cb - seedB, 2)
                    );
                    
                    if (dist > colorThreshold) {
                        continue;
                    }
                    
                    visited[cidx] = 1;
                    labels[cidx] = labelCount;
                    regionPixels.push({r: cr, g: cg, b: cb});
                    
                    stack.push({x: cx + 1, y: cy});
                    stack.push({x: cx - 1, y: cy});
                    stack.push({x: cx, y: cy + 1});
                    stack.push({x: cx, y: cy - 1});
                }
                
                if (regionPixels.length > 0) {
                    let sumR = 0, sumG = 0, sumB = 0;
                    for (const pixel of regionPixels) {
                        sumR += pixel.r;
                        sumG += pixel.g;
                        sumB += pixel.b;
                    }
                    const count = regionPixels.length;
                    regionColors.push({
                        r: Math.round(sumR / count),
                        g: Math.round(sumG / count),
                        b: Math.round(sumB / count)
                    });
                    labelCount++;
                }
            }
        }
    }
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const label = labels[idx];
            const dstIdx = idx * 4;
            if (label >= 0 && label < regionColors.length) {
                const color = regionColors[label];
                result.data[dstIdx] = color.r;
                result.data[dstIdx + 1] = color.g;
                result.data[dstIdx + 2] = color.b;
                result.data[dstIdx + 3] = 255;
            }
        }
    }
    
    return result;
}

function adjustContrast(imageData, factor) {
    const data = imageData.data;
    const amount = (factor - 1) * 0.8;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        const adjustedLuminance = luminance + (luminance - 128) * amount;
        const clampedLum = Math.min(255, Math.max(0, adjustedLuminance));
        
        if (luminance > 0) {
            const ratio = clampedLum / luminance;
            data[i] = Math.min(255, Math.max(0, r * ratio));
            data[i + 1] = Math.min(255, Math.max(0, g * ratio));
            data[i + 2] = Math.min(255, Math.max(0, b * ratio));
        } else {
            data[i] = clampedLum;
            data[i + 1] = clampedLum;
            data[i + 2] = clampedLum;
        }
    }
    
    return imageData;
}

function sharpenImage(imageData, strength) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const result = new Uint8ClampedArray(data);
    
    const kernel = [0, -strength, 0, -strength, 1 + 4 * strength, -strength, 0, -strength, 0];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let r = 0, g = 0, b = 0;
            let ki = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    r += data[idx] * kernel[ki];
                    g += data[idx + 1] * kernel[ki];
                    b += data[idx + 2] * kernel[ki];
                    ki++;
                }
            }
            
            const idx = (y * width + x) * 4;
            result[idx] = Math.min(255, Math.max(0, r));
            result[idx + 1] = Math.min(255, Math.max(0, g));
            result[idx + 2] = Math.min(255, Math.max(0, b));
        }
    }
    
    for (let i = 0; i < data.length; i++) {
        data[i] = result[i];
    }
    
    return imageData;
}

function quantizeColors(imageData, colorCount, excludedColors = new Set(), strategy = 'top-level') {
    const data = imageData.data;
    
    // 1. 收集所有不被排除的唯一颜色
    const uniqueColors = [];
    const colorKeySet = new Set();
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = `${r},${g},${b}`;
        
        if (excludedColors.has(key)) continue;
        
        if (!colorKeySet.has(key)) {
            colorKeySet.add(key);
            uniqueColors.push([r, g, b]);
        }
    }
    
    // 2. 使用 Median Cut 算法选择 N 个有代表性的颜色
    //    （根据颜色空间的分布来选，确保覆盖所有色调，而不是只取高频色）
    let palette;
    if (uniqueColors.length > colorCount) {
        palette = medianCutQuantize(uniqueColors, colorCount);
    } else if (uniqueColors.length > 0) {
        palette = uniqueColors;
    } else {
        // Fallback: 如果所有颜色都被排除，从原始数据取前 N 种
        const fallbackColors = [];
        const fallbackSet = new Set();
        for (let i = 0; i < data.length && fallbackColors.length < Math.max(2, colorCount); i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const key = `${r},${g},${b}`;
            if (!fallbackSet.has(key)) {
                fallbackSet.add(key);
                fallbackColors.push([r, g, b]);
            }
        }
        palette = fallbackColors;
    }
    
    // 3. 将每个像素映射到调色板中最接近的颜色
    //    缓存优化：同一种颜色不必重复计算最近距离
    const mappingCache = new Map();
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = `${r},${g},${b}`;
        
        let closest;
        if (mappingCache.has(key)) {
            closest = mappingCache.get(key);
        } else {
            closest = findClosestInPalette([r, g, b], palette);
            mappingCache.set(key, closest);
        }
        
        data[i] = closest[0];
        data[i + 1] = closest[1];
        data[i + 2] = closest[2];
    }
    
    return imageData;
}

function getContrastTextColor(rgb) {
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

function medianCutQuantize(colors, maxColors) {
    if (colors.length <= maxColors) {
        return colors;
    }

    const buckets = [colors];
    
    while (buckets.length < maxColors) {
        let maxRange = -1;
        let splitIndex = -1;
        let splitChannel = -1;

        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            if (bucket.length <= 1) continue;

            let minR = 255, maxR = 0;
            let minG = 255, maxG = 0;
            let minB = 255, maxB = 0;

            for (const color of bucket) {
                minR = Math.min(minR, color[0]);
                maxR = Math.max(maxR, color[0]);
                minG = Math.min(minG, color[1]);
                maxG = Math.max(maxG, color[1]);
                minB = Math.min(minB, color[2]);
                maxB = Math.max(maxB, color[2]);
            }

            const rangeR = maxR - minR;
            const rangeG = maxG - minG;
            const rangeB = maxB - minB;
            const maxRangeBucket = Math.max(rangeR, rangeG, rangeB);

            if (maxRangeBucket > maxRange) {
                maxRange = maxRangeBucket;
                splitIndex = i;
                if (maxRangeBucket === rangeR) splitChannel = 0;
                else if (maxRangeBucket === rangeG) splitChannel = 1;
                else splitChannel = 2;
            }
        }

        if (splitIndex === -1) break;

        const bucketToSplit = buckets[splitIndex];
        bucketToSplit.sort((a, b) => a[splitChannel] - b[splitChannel]);
        const mid = Math.floor(bucketToSplit.length / 2);
        const bucket1 = bucketToSplit.slice(0, mid);
        const bucket2 = bucketToSplit.slice(mid);

        buckets.splice(splitIndex, 1, bucket1, bucket2);
    }

    const palette = [];
    for (const bucket of buckets) {
        let sumR = 0, sumG = 0, sumB = 0;
        for (const color of bucket) {
            sumR += color[0];
            sumG += color[1];
            sumB += color[2];
        }
        const avgR = Math.round(sumR / bucket.length);
        const avgG = Math.round(sumG / bucket.length);
        const avgB = Math.round(sumB / bucket.length);
        palette.push([avgR, avgG, avgB]);
    }

    return palette;
}

function findClosestInPalette(rgb, palette) {
    let closest = palette[0];
    let minDist = weightedRgbDistance(rgb, palette[0]);

    for (const color of palette) {
        const dist = weightedRgbDistance(rgb, color);
        if (dist < minDist) {
            minDist = dist;
            closest = color;
        }
    }

    return closest;
}

function quantizedPixelate(imageData, blockSize, maxColors, offsetX = 0, offsetY = 0) {
    let tempData = pixelate(imageData, blockSize, offsetX, offsetY);
    
    const colors = [];
    const colorMap = new Map();
    
    for (let i = 0; i < tempData.data.length; i += 4) {
        const r = tempData.data[i];
        const g = tempData.data[i + 1];
        const b = tempData.data[i + 2];
        const key = `${r},${g},${b}`;
        
        if (!colorMap.has(key)) {
            colorMap.set(key, [r, g, b]);
            colors.push([r, g, b]);
        }
    }

    let palette = colors;
    if (colors.length > maxColors) {
        palette = medianCutQuantize(colors, maxColors);
    }

    for (let i = 0; i < tempData.data.length; i += 4) {
        const r = tempData.data[i];
        const g = tempData.data[i + 1];
        const b = tempData.data[i + 2];
        const closest = findClosestInPalette([r, g, b], palette);
        tempData.data[i] = closest[0];
        tempData.data[i + 1] = closest[1];
        tempData.data[i + 2] = closest[2];
    }

    return tempData;
}

function mapWithNeighborConsistencyOnMatrix(perlerColors, colorSet) {
    const width = perlerColors[0] ? perlerColors[0].length : 0;
    const height = perlerColors.length;
    const result = perlerColors.map(row => [...row]);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const currentColor = result[y][x];
            
            if (currentColor.isTransparent) {
                continue;
            }
            
            const neighbors = [
                result[y - 1][x],
                result[y + 1][x],
                result[y][x - 1],
                result[y][x + 1]
            ];

            const nonTransparentNeighbors = neighbors.filter(c => !c.isTransparent);
            if (nonTransparentNeighbors.length === 0) {
                continue;
            }

            const neighborNames = nonTransparentNeighbors.map(c => c.name);
            const currentName = currentColor.name;
            const uniqueNames = [...new Set(neighborNames)];

            if (uniqueNames.length > 1 && nonTransparentNeighbors.every(c => c.name !== currentName)) {
                const freq = {};
                neighborNames.forEach(name => {
                    freq[name] = (freq[name] || 0) + 1;
                });
                const mostName = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
                const mostColor = nonTransparentNeighbors.find(c => c.name === mostName);
                if (mostColor) {
                    result[y][x] = mostColor;
                }
            }
        }
    }

    return result;
}

function computeMinColorDistance(colorSet, method = 'cie2000') {
    let minDist = Infinity;
    for (let i = 0; i < colorSet.length; i++) {
        for (let j = i + 1; j < colorSet.length; j++) {
            const dist = calculateColorDistance(colorSet[i].rgb, colorSet[j].rgb, method);
            if (dist < minDist) {
                minDist = dist;
            }
        }
    }
    return minDist;
}

function filterNoisePixels(perlerColors, noiseThreshold = 4, iterationCount = 1, isInSelection = null) {
    const width = perlerColors[0] ? perlerColors[0].length : 0;
    const height = perlerColors.length;
    
    let result = perlerColors.map(row => [...row]);
    
    const colorMap = new Map();
    for (const row of result) {
        for (const color of row) {
            if (!color.isTransparent && !colorMap.has(color.name)) {
                colorMap.set(color.name, color);
            }
        }
    }
    
    for (let iter = 0; iter < iterationCount; iter++) {
        const newResult = result.map(row => [...row]);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (isInSelection && !isInSelection(x, y)) continue;
                
                const currentColor = result[y][x];
                if (currentColor.isTransparent) continue;
                
                const neighborColors = {};
                let totalNeighbors = 0;
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dy === 0 && dx === 0) continue;
                        
                        const nx = x + dx;
                        const ny = y + dy;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborColor = result[ny][nx];
                            if (!neighborColor.isTransparent) {
                                neighborColors[neighborColor.name] = (neighborColors[neighborColor.name] || 0) + 1;
                                totalNeighbors++;
                            }
                        }
                    }
                }
                
                if (totalNeighbors === 0) continue;
                
                let maxCount = 0;
                let dominantColorName = null;
                
                for (const [name, count] of Object.entries(neighborColors)) {
                    if (count > maxCount) {
                        maxCount = count;
                        dominantColorName = name;
                    }
                }
                
                if (dominantColorName && maxCount >= noiseThreshold) {
                    const dominantColor = colorMap.get(dominantColorName);
                    if (dominantColor) {
                        newResult[y][x] = dominantColor;
                    }
                }
            }
        }
        
        result = newResult;
    }
    
    return result;
}

function quantizePerlerColors(perlerColors, keepColorNames, colorSet, mappingMethod = 'ciede2000', isInSelection = null) {
    const width = perlerColors[0] ? perlerColors[0].length : 0;
    const height = perlerColors.length;
    
    const result = perlerColors.map(row => [...row]);
    const keepSet = new Set(keepColorNames);
    
    const keepColors = colorSet.filter(c => keepSet.has(c.name) && !c.isTransparent);
    if (keepColors.length === 0) {
        return result;
    }
    
    const replaceCache = new Map();
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isInSelection && !isInSelection(x, y)) continue;
            
            const currentColor = result[y][x];
            if (currentColor.isTransparent) continue;
            if (keepSet.has(currentColor.name)) continue;
            
            if (replaceCache.has(currentColor.name)) {
                result[y][x] = replaceCache.get(currentColor.name);
                continue;
            }
            
            let minDist = Infinity;
            let closestColor = keepColors[0];
            
            for (const keepColor of keepColors) {
                const dist = calculateColorDistance(currentColor.rgb, keepColor.rgb, mappingMethod);
                if (dist < minDist) {
                    minDist = dist;
                    closestColor = keepColor;
                }
            }
            
            replaceCache.set(currentColor.name, closestColor);
            result[y][x] = closestColor;
        }
    }
    
    return result;
}
