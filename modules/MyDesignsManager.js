class MyDesignsManager {
    constructor() {
        this.storageKey = 'perler_my_designs_v1';
        this.maxDesigns = 50;
        this.converter = new InfoPaperConverter();
        this.compressor = new InfoPaperCompressor();
    }

    async saveDesign(perlerColors, width, height, colorSet) {
        if (!perlerColors || !perlerColors.length) {
            throw new Error('没有可保存的拼豆图纸');
        }

        try {
            const infoPaper = this.converter.toInfoPaper(perlerColors, colorSet, width, height);
            const compressed = await this.compressor.compress(infoPaper);
            const thumbnail = this.generateThumbnail(perlerColors, width, height);
            const totalColors = this.countTotalColors(perlerColors);

            const design = {
                id: this.generateId(),
                timestamp: Date.now(),
                width: width,
                height: height,
                colorSet: infoPaper.metadata.colorSet,
                totalColors: totalColors,
                thumbnail: thumbnail,
                compressedData: compressed
            };

            const designs = this.getAllDesigns();

            if (designs.length >= this.maxDesigns) {
                designs.pop();
            }

            designs.unshift(design);

            localStorage.setItem(this.storageKey, JSON.stringify(designs));

            console.log(`[MyDesignsManager] 图纸已保存: ${design.id}`);
            return design;
        } catch (err) {
            console.error('[MyDesignsManager] 保存失败:', err);
            throw err;
        }
    }

    async loadDesign(id) {
        const designs = this.getAllDesigns();
        const design = designs.find(d => d.id === id);

        if (!design) {
            throw new Error('未找到该图纸');
        }

        try {
            const infoPaper = await this.compressor.decompress(design.compressedData);
            const result = this.converter.fromInfoPaper(infoPaper);
            console.log(`[MyDesignsManager] 图纸已加载: ${id}`);
            return result;
        } catch (err) {
            console.error('[MyDesignsManager] 加载失败:', err);
            throw new Error('图纸数据已损坏');
        }
    }

    deleteDesign(id) {
        const designs = this.getAllDesigns();
        const index = designs.findIndex(d => d.id === id);

        if (index === -1) {
            throw new Error('未找到该图纸');
        }

        designs.splice(index, 1);
        localStorage.setItem(this.storageKey, JSON.stringify(designs));
        console.log(`[MyDesignsManager] 图纸已删除: ${id}`);
    }

    getAllDesigns() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) return [];
            return JSON.parse(data);
        } catch (err) {
            console.error('[MyDesignsManager] 读取图纸列表失败:', err);
            return [];
        }
    }

    clearAllDesigns() {
        localStorage.removeItem(this.storageKey);
        console.log('[MyDesignsManager] 所有图纸已清除');
    }

    async exportDesignToJSON(id) {
        const designs = this.getAllDesigns();
        const design = designs.find(d => d.id === id);

        if (!design) {
            throw new Error('未找到该图纸');
        }

        const infoPaper = await this.compressor.decompress(design.compressedData);
        const exportData = {
            exportedAt: new Date().toISOString(),
            sourceApp: 'PixelArt/Perler Converter',
            design: {
                id: design.id,
                timestamp: design.timestamp,
                width: design.width,
                height: design.height,
                colorSet: design.colorSet,
                totalColors: design.totalColors
            },
            infoPaper: infoPaper
        };

        return JSON.stringify(exportData, null, 2);
    }

    async importDesignFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            let result;
            let infoPaper;

            if (this.converter.isLLMFormat(data)) {
                result = this.converter.fromLLMFormat(data);
                infoPaper = this.converter.toInfoPaper(result.perlerColors, result.colorSet, result.width, result.height);
            } else if (data.infoPaper) {
                infoPaper = data.infoPaper;
                result = this.converter.fromInfoPaper(infoPaper);
            } else if (data.pixels) {
                infoPaper = data;
                result = this.converter.fromInfoPaper(infoPaper);
            } else {
                throw new Error('无效的图纸文件格式');
            }

            const compressed = await this.compressor.compress(infoPaper);
            const thumbnail = this.generateThumbnail(result.perlerColors, result.width, result.height);

            const design = {
                id: this.generateId(),
                timestamp: Date.now(),
                width: result.width,
                height: result.height,
                colorSet: result.colorSet,
                totalColors: this.countTotalColors(result.perlerColors),
                thumbnail: thumbnail,
                compressedData: compressed
            };

            const designs = this.getAllDesigns();
            if (designs.length >= this.maxDesigns) {
                designs.pop();
            }
            designs.unshift(design);
            localStorage.setItem(this.storageKey, JSON.stringify(designs));

            console.log(`[MyDesignsManager] 图纸已导入: ${design.id}`);
            return design;
        } catch (err) {
            console.error('[MyDesignsManager] 导入失败:', err);
            throw err;
        }
    }

    async importDesignFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const text = e.target.result;
                    const design = await this.importDesignFromJSON(text);
                    resolve(design);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    generateThumbnail(perlerColors, width, height, maxSize = 120) {
        try {
            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const thumbWidth = Math.max(1, Math.floor(width * scale));
            const thumbHeight = Math.max(1, Math.floor(height * scale));
            const cellSize = Math.max(1, Math.floor(thumbWidth / width));

            const canvas = document.createElement('canvas');
            canvas.width = thumbWidth;
            canvas.height = thumbHeight;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, thumbWidth, thumbHeight);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const color = perlerColors[y] && perlerColors[y][x];
                    if (color && !color.isTransparent && (color.rgb || color.hex)) {
                        let rgb = color.rgb;
                        if (!rgb && color.hex) {
                            const h = color.hex.replace('#', '');
                            rgb = [
                                parseInt(h.substr(0, 2), 16),
                                parseInt(h.substr(2, 2), 16),
                                parseInt(h.substr(4, 2), 16)
                            ];
                        }
                        if (rgb) {
                            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                        }
                    }
                }
            }

            return canvas.toDataURL('image/png', 0.8);
        } catch (err) {
            console.error('[MyDesignsManager] 缩略图生成失败:', err);
            return null;
        }
    }

    countTotalColors(perlerColors) {
        const colorSet = new Set();
        for (let y = 0; y < perlerColors.length; y++) {
            for (let x = 0; x < perlerColors[y].length; x++) {
                const color = perlerColors[y][x];
                if (color && !color.isTransparent) {
                    if (color.name) {
                        colorSet.add(color.name);
                    } else if (color.rgb) {
                        colorSet.add(`${color.rgb[0]},${color.rgb[1]},${color.rgb[2]}`);
                    } else if (color.hex) {
                        colorSet.add(color.hex);
                    }
                }
            }
        }
        return colorSet.size;
    }

    generateId() {
        return 'design_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    getCompressedData(id) {
        const designs = this.getAllDesigns();
        const design = designs.find(d => d.id === id);
        if (!design) {
            throw new Error('未找到该图纸');
        }
        // 如果是对象，序列化为字符串
        if (typeof design.compressedData === 'object') {
            return JSON.stringify(design.compressedData);
        }
        return design.compressedData;
    }

    // 获取 INFOPAPER_V1 格式的打包数据（与图纸管理导入兼容）
    async getPackedData(id) {
        const designs = this.getAllDesigns();
        const design = designs.find(d => d.id === id);
        if (!design) {
            throw new Error('未找到该图纸');
        }
        
        // 如果已经是 INFOPAPER_V1 格式，直接返回
        if (typeof design.compressedData === 'string' && design.compressedData.startsWith('INFOPAPER_V1:')) {
            return design.compressedData;
        }
        
        // 否则解压后重新打包
        const infoPaper = await this.compressor.decompress(design.compressedData);
        return await this.compressor.pack(infoPaper);
    }

    async copyCompressedDataToClipboard(id) {
        // 获取 INFOPAPER_V1 格式的数据
        let packedData = await this.getPackedData(id);
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(packedData);
                console.log(`[MyDesignsManager] 图纸数据已复制到剪贴板(INFOPAPER_V1格式): ${id}`);
                return true;
            }
        } catch (err) {
            console.warn('[MyDesignsManager] Clipboard API 不可用，使用降级方案:', err);
        }

        const textarea = document.createElement('textarea');
        textarea.value = packedData;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, packedData.length);
        
        try {
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (success) {
                console.log(`[MyDesignsManager] 图纸数据已复制到剪贴板(降级方案): ${id}`);
                return true;
            } else {
                throw new Error('复制失败');
            }
        } catch (err) {
            document.body.removeChild(textarea);
            console.error('[MyDesignsManager] 复制到剪贴板失败:', err);
            throw new Error('无法复制到剪贴板，请手动复制');
        }
    }
}


/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.MyDesignsManager = MyDesignsManager;
}
