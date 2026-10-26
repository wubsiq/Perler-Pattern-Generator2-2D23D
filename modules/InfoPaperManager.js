class InfoPaperManager {
    constructor() {
        this.converter = new InfoPaperConverter();
        this.compressor = new InfoPaperCompressor();
    }

    exportToClipboard(perlerColors, colorSetName, width, height) {
        try {
            const infoPaper = this.converter.toInfoPaper(perlerColors, colorSetName, width, height);
            const jsonString = this.converter.toJSON(infoPaper);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(jsonString).then(() => {
                    alert('信息化图纸数据已复制到剪贴板！');
                }).catch((err) => {
                    console.error('复制失败:', err);
                    this.showFallbackCopyDialog(jsonString);
                });
            } else {
                this.showFallbackCopyDialog(jsonString);
            }
        } catch (e) {
            alert(`导出失败: ${e.message}`);
            console.error(e);
        }
    }

    async exportCompressedToClipboard(perlerColors, colorSetName, width, height) {
        try {
            const infoPaper = this.converter.toInfoPaper(perlerColors, colorSetName, width, height);
            const packed = await this.compressor.pack(infoPaper);
            const originalJSON = this.converter.toJSON(infoPaper);
            const ratio = this.compressor.getCompressionRatio(originalJSON, packed);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(packed).then(() => {
                    alert(`压缩版图纸已复制！节省 ${ratio.ratio}% 体积 (${(ratio.saved / 1024).toFixed(1)}KB)\n原始 ${(ratio.original / 1024).toFixed(1)}KB → 压缩后 ${(ratio.compressed / 1024).toFixed(1)}KB`);
                }).catch((err) => {
                    console.error('复制失败:', err);
                    this.showFallbackCopyDialog(packed);
                });
            } else {
                this.showFallbackCopyDialog(packed);
            }
        } catch (e) {
            alert(`压缩导出失败: ${e.message}`);
            console.error(e);
        }
    }

    exportToFile(perlerColors, colorSetName, width, height) {
        try {
            const infoPaper = this.converter.toInfoPaper(perlerColors, colorSetName, width, height);
            const jsonString = this.converter.toJSON(infoPaper);

            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `infopaper_${colorSetName}_${width}x${height}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (e) {
            alert(`导出失败: ${e.message}`);
            console.error(e);
        }
    }

    async exportCompressedToFile(perlerColors, colorSetName, width, height) {
        try {
            const infoPaper = this.converter.toInfoPaper(perlerColors, colorSetName, width, height);
            const packed = await this.compressor.pack(infoPaper);

            const blob = new Blob([packed], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `infopaper_packed_${colorSetName}_${width}x${height}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (e) {
            alert(`压缩导出失败: ${e.message}`);
            console.error(e);
        }
    }

    isCompressedData(data) {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            return parsed && parsed.compressor && parsed.pixels && parsed.pixels.encoding === 'rle';
        } catch (e) {
            return false;
        }
    }

    isPackedData(data) {
        return this.compressor.isPackedString(data);
    }

    async smartImport(text, callback) {
        try {
            let result;

            if (this.isPackedData(text)) {
                const infoPaper = await this.compressor.unpack(text);
                result = this.converter.fromInfoPaper(infoPaper);
            } else if (this.isCompressedData(text)) {
                const infoPaper = this.compressor.decompressFromJSON(text);
                result = this.converter.fromInfoPaper(infoPaper);
            } else {
                const data = JSON.parse(text);
                if (this.converter.isLLMFormat(data)) {
                    result = this.converter.fromLLMFormat(data);
                } else {
                    result = this.converter.fromInfoPaper(data);
                }
            }

            if (callback) {
                callback(null, result);
            }
            return result;
        } catch (e) {
            const errorMsg = `导入失败: ${e.message}`;
            alert(errorMsg);
            console.error(e);
            if (callback) {
                callback(e, null);
            }
            return null;
        }
    }

    importFromText(text, callback) {
        return this.smartImport(text, callback);
    }

    importFromFile(file, callback) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                this.smartImport(text, callback);
            } catch (err) {
                const errorMsg = `导入失败: ${err.message}`;
                alert(errorMsg);
                console.error(err);
                if (callback) {
                    callback(err, null);
                }
            }
        };

        reader.onerror = () => {
            const errorMsg = '文件读取失败';
            alert(errorMsg);
            if (callback) {
                callback(new Error(errorMsg), null);
            }
        };

        reader.readAsText(file);
    }

    showFallbackCopyDialog(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '100%';
        textarea.style.height = '300px';
        textarea.style.zIndex = '9999';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                alert('数据已复制到剪贴板！');
            } else {
                alert('无法自动复制，请手动复制文本框中的内容');
            }
        } catch (err) {
            console.error('复制失败:', err);
            alert('无法自动复制，请手动复制文本框中的内容');
        }

        setTimeout(() => {
            document.body.removeChild(textarea);
        }, 100);
    }

    showImportDialog(onSuccess, onCancel) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 600px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;

        dialog.innerHTML = `
            <h2 style="margin-top: 0; color: #333;">导入信息化图纸</h2>
            <p style="color: #666; font-size: 14px;">支持普通 JSON、RLE 压缩版、以及 INFOPAPER_V1 紧凑格式</p>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #666;">选择文件：</label>
                <input type="file" id="infopaper-file-input" accept=".json,.txt" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #666;">或粘贴数据：</label>
                <textarea id="infopaper-text-input" placeholder="在此粘贴图纸数据..." style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-family: monospace; font-size: 12px;"></textarea>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="infopaper-cancel-btn" style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 5px; cursor: pointer;">取消</button>
                <button id="infopaper-import-btn" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">导入</button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        const fileInput = dialog.querySelector('#infopaper-file-input');
        const textInput = dialog.querySelector('#infopaper-text-input');
        const importBtn = dialog.querySelector('#infopaper-import-btn');
        const cancelBtn = dialog.querySelector('#infopaper-cancel-btn');

        const closeDialog = () => {
            document.body.removeChild(modal);
            if (onCancel) {
                onCancel();
            }
        };

        const handleImport = () => {
            const file = fileInput.files[0];
            const text = textInput.value.trim();

            if (file) {
                this.importFromFile(file, (err, result) => {
                    if (!err && result) {
                        document.body.removeChild(modal);
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    }
                });
            } else if (text) {
                this.importFromText(text, (err, res) => {
                    if (!err && res) {
                        document.body.removeChild(modal);
                        if (onSuccess) {
                            onSuccess(res);
                        }
                    }
                });
            } else {
                alert('请选择文件或粘贴数据');
            }
        };

        importBtn.addEventListener('click', handleImport);
        cancelBtn.addEventListener('click', closeDialog);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDialog();
            }
        });
    }

    showModeSelectDialog(result, onEditMode, onFocusMode, onCancel) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;

        const colorCount = Object.keys(result.colorCounts).length;
        const totalBeans = Object.values(result.colorCounts).reduce((a, b) => a + b, 0);

        dialog.innerHTML = `
            <h2 style="margin-top: 0; color: #333;">图纸信息</h2>
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <p style="margin: 5px 0; color: #666;">📐 尺寸: ${result.width} × ${result.height} 颗拼豆</p>
                <p style="margin: 5px 0; color: #666;">🎨 色系: ${result.colorSet}</p>
                <p style="margin: 5px 0; color: #666;">🌈 颜色种类: ${colorCount} 种</p>
                <p style="margin: 5px 0; color: #666;">🔢 总拼豆数: ${totalBeans} 颗</p>
            </div>
            <h3 style="color: #333;">选择使用模式</h3>
            <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;">
                <button id="infopaper-edit-btn" style="padding: 15px; border: 2px solid #667eea; background: white; color: #667eea; border-radius: 5px; cursor: pointer; font-size: 16px; text-align: left;">
                    <div style="font-size: 18px; font-weight: bold;">🎨 编辑模式</div>
                    <div style="font-size: 14px; margin-top: 5px; color: #666;">进入图纸编辑界面，可以修改、优化图纸</div>
                </button>
                <button id="infopaper-focus-btn" style="padding: 15px; border: 2px solid #48bb78; background: white; color: #48bb78; border-radius: 5px; cursor: pointer; font-size: 16px; text-align: left;">
                    <div style="font-size: 18px; font-weight: bold;">🎯 专注模式</div>
                    <div style="font-size: 14px; margin-top: 5px; color: #666;">进入全屏拼豆模式，方便实际拼豆操作</div>
                </button>
            </div>
            <div style="display: flex; justify-content: flex-end;">
                <button id="infopaper-cancel-btn" style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 5px; cursor: pointer;">取消</button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        const editBtn = dialog.querySelector('#infopaper-edit-btn');
        const focusBtn = dialog.querySelector('#infopaper-focus-btn');
        const cancelBtn = dialog.querySelector('#infopaper-cancel-btn');

        const closeDialog = () => {
            document.body.removeChild(modal);
            if (onCancel) {
                onCancel();
            }
        };

        editBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onEditMode) {
                onEditMode(result);
            }
        });

        focusBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onFocusMode) {
                onFocusMode(result);
            }
        });

        cancelBtn.addEventListener('click', closeDialog);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDialog();
            }
        });
    }
}


/* =============================================================
 * 模块导出（供全局引用/调试）
 * ============================================================= */
if (typeof window !== 'undefined') {
    window.InfoPaperManager = InfoPaperManager;
}
