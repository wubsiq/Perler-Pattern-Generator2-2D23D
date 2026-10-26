/**
 * QuantizeDragMixin — 颜色量化+各面板拖拽初始化-10方法
 * 来源: app.js L7362-L7747
 */

const QuantizeDragMixin = {
    openColorQuantizePanel() {
        if (this.colorQuantizePanel) {
            this.colorQuantizePanel.style.display = 'block';
            this.updateQuantizeColorList();
        }
    },

    closeColorQuantizePanel() {
        if (this.colorQuantizePanel) {
            this.colorQuantizePanel.style.display = 'none';
            this.quantizePickMode = false;
            if (this.quantizePickColorBtn) {
                this.quantizePickColorBtn.classList.remove('color-pick-active');
            }
        }
    },

    updateQuantizeColorList() {
        if (!this.quantizeColorList) return;

        if (!this.customEditData) {
            this.quantizeColorList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center; margin: 20px 0;">' + getI18nText('noImageForQuantize') + '</p>';
            return;
        }

        const colorCounts = {};
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                const color = this.customEditData[y][x];
                if (color.isTransparent) continue;
                if (!colorCounts[color.name]) {
                    colorCounts[color.name] = { color, count: 0 };
                }
                colorCounts[color.name].count++;
            }
        }

        const sortedColors = Object.values(colorCounts).sort((a, b) => b.count - a.count);

        if (sortedColors.length === 0) {
            this.quantizeColorList.innerHTML = '<p style="color: #999; font-size: 0.85em; text-align: center; margin: 20px 0;">' + getI18nText('noColorsInImage') + '</p>';
            return;
        }

        let html = '';
        for (const item of sortedColors) {
            const hex = this.rgbToHex(item.color.rgb[0], item.color.rgb[1], item.color.rgb[2]);
            const textColor = getContrastTextColor(item.color.rgb);
            html += `
                <div class="quantize-color-item" style="display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 4px; cursor: pointer; transition: opacity 0.2s;" data-color="${item.color.name}">
                    <input type="checkbox" class="quantize-color-checkbox" data-color="${item.color.name}" checked style="cursor: pointer;">
                    <div style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #ddd; background-color: ${hex}; display: flex; align-items: center; justify-content: center; font-size: 0.7em; font-weight: 600; color: ${textColor};">${item.color.name}</div>
                    <span class="quantize-color-name" style="flex: 1; font-size: 0.85em;">${item.color.name}</span>
                    <span class="quantize-color-count" style="font-size: 0.8em; color: #666;">${item.count}</span>
                </div>
            `;
        }
        this.quantizeColorList.innerHTML = html;

        const updateItemVisual = (item, checked) => {
            const nameEl = item.querySelector('.quantize-color-name');
            const countEl = item.querySelector('.quantize-color-count');
            if (checked) {
                item.style.opacity = '1';
                if (nameEl) nameEl.style.textDecoration = 'none';
                if (countEl) countEl.style.opacity = '1';
            } else {
                item.style.opacity = '0.4';
                if (nameEl) nameEl.style.textDecoration = 'line-through';
                if (countEl) countEl.style.opacity = '0.5';
            }
        };

        this.quantizeColorList.querySelectorAll('.quantize-color-item').forEach(item => {
            const checkbox = item.querySelector('.quantize-color-checkbox');
            updateItemVisual(item, checkbox.checked);

            checkbox.addEventListener('change', () => {
                updateItemVisual(item, checkbox.checked);
            });

            item.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const cb = item.querySelector('.quantize-color-checkbox');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });
        });
    },

    applyColorQuantize() {
        if (!this.customEditData || !this.customEditor) {
            alert(getI18nText('alertNoEditableImage'));
            return;
        }

        const checkboxes = this.quantizeColorList.querySelectorAll('.quantize-color-checkbox:checked');
        const keepColors = Array.from(checkboxes).map(cb => cb.dataset.color);

        if (keepColors.length === 0) {
            alert(getI18nText('alertNoKeepColors'));
            return;
        }

        const colorSetName = this.colorSetSelect.value;
        const colorSet = colorSets[colorSetName];
        const mappingMethod = this.colorMappingMethod.value;

        const isInSelection = (x, y) => {
            if (!this.customEditor.selection) return true;
            return this.customEditor.isInSelection(x, y);
        };

        const hasSelection = this.customEditor.selection !== null;

        let affectedCount = 0;
        const keepSet = new Set(keepColors);
        for (let y = 0; y < this.perlerHeight; y++) {
            for (let x = 0; x < this.perlerWidth; x++) {
                if (hasSelection && !this.customEditor.isInSelection(x, y)) continue;
                const color = this.customEditData[y][x];
                if (!color.isTransparent && !keepSet.has(color.name)) {
                    affectedCount++;
                }
            }
        }

        if (affectedCount === 0) {
            alert(getI18nText('alertNoColorsToQuantize'));
            return;
        }

        console.log(`正在进行颜色量化，保留 ${keepColors.length} 种颜色，影响 ${affectedCount} 个色块...`);

        this.saveCustomEditHistory();

        const newData = quantizePerlerColors(
            this.customEditData,
            keepColors,
            colorSet,
            mappingMethod,
            hasSelection ? isInSelection : null
        );

        this.customEditData = newData;
        this.drawCustomEditCanvas();

        this.updateQuantizeColorList();

        console.log('颜色量化完成！');
    },

    closeColorConvertPanel() {
        if (this.colorConvertPanel) {
            this.colorConvertPanel.style.display = 'none';
            this.colorConvertPickMode = null;
            this.pickSourceColorBtn.classList.remove('color-pick-active');
            this.pickTargetColorBtn.classList.remove('color-pick-active');
        }
    },

    initColorConvertPanelDrag() {
        if (!this.colorConvertPanel || !this.colorConvertPanelHeader) return;

        const panel = this.colorConvertPanel;
        const header = this.colorConvertPanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorConvertBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorConvertPanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorConvertPanelDragState || !this.colorConvertPanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorConvertPanelDragState) {
                this.colorConvertPanelDragState.dragging = false;
            }
        });
    },

    initStrokePanelDrag() {
        if (!this.strokePanel || !this.strokePanelHeader) return;

        const panel = this.strokePanel;
        const header = this.strokePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeStrokePanelBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.strokePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.strokePanelDragState || !this.strokePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.strokePanelDragState) {
                this.strokePanelDragState.dragging = false;
            }
        });
    },

    initColorRemovePanelDrag() {
        if (!this.colorRemovePanel || !this.colorRemovePanelHeader) return;

        const panel = this.colorRemovePanel;
        const header = this.colorRemovePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorRemoveBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorRemovePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorRemovePanelDragState || !this.colorRemovePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorRemovePanelDragState) {
                this.colorRemovePanelDragState.dragging = false;
            }
        });
    },

    initNoiseFilterPanelDrag() {
        if (!this.noiseFilterPanel || !this.noiseFilterPanelHeader) return;

        const panel = this.noiseFilterPanel;
        const header = this.noiseFilterPanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeNoiseFilterBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.noiseFilterPanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.noiseFilterPanelDragState || !this.noiseFilterPanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.noiseFilterPanelDragState) {
                this.noiseFilterPanelDragState.dragging = false;
            }
        });
    },

    initColorQuantizePanelDrag() {
        if (!this.colorQuantizePanel || !this.colorQuantizePanelHeader) return;

        const panel = this.colorQuantizePanel;
        const header = this.colorQuantizePanelHeader;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeColorQuantizeBtn) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';

            this.colorQuantizePanelDragState = { dragging: true };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.colorQuantizePanelDragState || !this.colorQuantizePanelDragState.dragging) return;

            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);

            const maxLeft = window.innerWidth - panel.offsetWidth - 10;
            const maxTop = window.innerHeight - panel.offsetHeight - 10;

            panel.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (this.colorQuantizePanelDragState) {
                this.colorQuantizePanelDragState.dragging = false;
            }
        });
    },
};

if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, QuantizeDragMixin);
}
if (typeof window !== 'undefined') {
    window.QuantizeDragMixin = QuantizeDragMixin;
}
