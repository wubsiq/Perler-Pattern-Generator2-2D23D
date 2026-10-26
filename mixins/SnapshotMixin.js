/**
 * SnapshotMixin — 统一快照保存/渲染/切换/恢复/删除
 * 来源: app.js L6527-L6773 (247 行)
 * 提取时间: 2026-10-02 14:54:59
 *
 * 用法: 在 build.js 中把此文件放在 app.js 之后拼接，
 *       Object.assign 会把这些方法覆盖到 PixelArtGenerator.prototype 上。
 *       原 app.js 中的同名方法保留（被覆盖），验证无误后可删除。
 */

const SnapshotMixin = {
    saveUnifiedSnapshot(type, description = '', data = null) {
        let perlerColors;
        if (data) {
            perlerColors = data;
        } else if (type === 'custom' && this.customEditData) {
            perlerColors = this.customEditData;
        } else if (this.perlerColors) {
            perlerColors = this.perlerColors;
        } else {
            return;
        }

        // 检查和上一个同类型快照是否一致，如果一致就不保存
        const lastSnapshotOfType = this.unifiedSnapshots
            .slice()
            .reverse()
            .find(s => s.type === type);
        
        if (lastSnapshotOfType) {
            let isEqual = true;
            // 比较颜色矩阵是否完全一致
            for (let y = 0; y < perlerColors.length; y++) {
                for (let x = 0; x < perlerColors[y].length; x++) {
                    const c1 = perlerColors[y][x];
                    const c2 = lastSnapshotOfType.data[y][x];
                    
                    if ((c1.isTransparent !== c2.isTransparent) ||
                        (c1.name !== c2.name) ||
                        (JSON.stringify(c1.rgb) !== JSON.stringify(c2.rgb))) {
                        isEqual = false;
                        break;
                    }
                }
                if (!isEqual) break;
            }
            
            if (isEqual) {
                // 数据一致，不保存新快照
                return;
            }
        }
        
        const snapshotId = Date.now();
        const timestamp = new Date().toLocaleString();
        
        // 计算颜色数量和总拼豆数
        const colorCounts = {};
        let totalBeans = 0;
        perlerColors.forEach(row => {
            row.forEach(color => {
                if (!color.isTransparent) {
                    const name = color.name || 'unknown';
                    colorCounts[name] = (colorCounts[name] || 0) + 1;
                    totalBeans++;
                }
            });
        });
        const colorCount = Object.keys(colorCounts).length;
        
        // 计算与上一个快照的变化量
        let colorChange = null;
        let beansChange = null;
        if (this.unifiedSnapshots.length > 0) {
            const lastSnapshot = this.unifiedSnapshots[this.unifiedSnapshots.length - 1];
            colorChange = colorCount - lastSnapshot.colorCount;
            beansChange = totalBeans - lastSnapshot.totalBeans;
        }
        
        this.unifiedSnapshots.push({
            id: snapshotId,
            type,
            timestamp,
            width: perlerColors.length > 0 ? perlerColors[0].length : 0,
            height: perlerColors.length,
            colorCount,
            totalBeans,
            colorChange,
            beansChange,
            description,
            data: perlerColors.map(row => [...row])
        });
        
        if (this.unifiedSnapshots.length > 50) {
            this.unifiedSnapshots.shift();
        }
        
        this.renderUnifiedSnapshotsList();
        if (this.snapshotsList) {
            this.snapshotsList.style.display = 'block';
        }
    },

    renderUnifiedSnapshotsList() {
        if (!this.snapshotsContainer) return;
        
        this.snapshotsContainer.innerHTML = '';
        
        if (this.unifiedSnapshots.length === 0) {
            this.snapshotsContainer.innerHTML = `
                <div style="text-align: center; color: #999; padding: 40px 20px;">
                    暂无操作历史
                </div>
            `;
            return;
        }
        
        // 按倒序显示（最新的在最上面）
        const reversedSnapshots = [...this.unifiedSnapshots].reverse();
        
        reversedSnapshots.forEach((snapshot, index) => {
            const realIndex = this.unifiedSnapshots.length - 1 - index;
            const item = document.createElement('div');
            item.className = 'snapshot-item';
            
            const typeIcon = snapshot.type === 'custom' ? '🎨' : '🔧';
            const typeText = snapshot.type === 'custom' ? getI18nText('snapshotTypeCustom') : getI18nText('snapshotTypeOptimize');
            
            // 兼容旧快照：如果没有 width/height 就从 data 推断
            const snapWidth = snapshot.width != null ? snapshot.width : (snapshot.data.length > 0 ? snapshot.data[0].length : 0);
            const snapHeight = snapshot.height != null ? snapshot.height : snapshot.data.length;
            
            const colorChangeClass = snapshot.colorChange > 0 ? 'change-negative' : 'change-positive';
            const beansChangeClass = snapshot.beansChange > 0 ? 'change-negative' : 'change-positive';
            
            const colorChangeText = snapshot.colorChange !== null 
                ? `<span class="${colorChangeClass}">${snapshot.colorChange > 0 ? `+${snapshot.colorChange}` : snapshot.colorChange}</span>` 
                : '';
            const beansChangeText = snapshot.beansChange !== null 
                ? `<span class="${beansChangeClass}">${snapshot.beansChange > 0 ? `+${snapshot.beansChange}` : snapshot.beansChange}</span>` 
                : '';
            
            const descText = snapshot.description ? `<div class="snapshot-item-desc">${snapshot.description}</div>` : '';
            
            item.innerHTML = `
                <div class="snapshot-item-info">
                    <div class="snapshot-item-title">
                        ${typeIcon} ${typeText} ${realIndex + 1}
                        <span style="font-weight: normal; font-size: 12px; color: #888; margin-left: 8px;">${snapWidth} × ${snapHeight}</span>
                    </div>
                    <div class="snapshot-item-meta">
                        ${snapshot.timestamp}
                    </div>
                    <div class="snapshot-item-meta">
                        颜色: ${snapshot.colorCount}${colorChangeText ? ` (${colorChangeText})` : ''} | 
                        拼豆: ${snapshot.totalBeans}${beansChangeText ? ` (${beansChangeText})` : ''}
                    </div>
                    ${descText}
                </div>
                <div class="snapshot-item-actions">
                    <button class="btn btn-primary" data-snapshot-id="${snapshot.id}" data-action="restore">恢复</button>
                    <button class="btn btn-secondary" data-snapshot-id="${snapshot.id}" data-action="delete">删除</button>
                </div>
            `;
            
            item.querySelector('[data-action="restore"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.restoreUnifiedSnapshot(snapshot.id);
            });
            
            item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteUnifiedSnapshot(snapshot.id);
            });
            
            this.snapshotsContainer.appendChild(item);
        });
    },

    toggleSnapshotPanel() {
        if (this.snapshotPanel.classList.contains('show')) {
            this.closePanel();
        } else {
            this.snapshotPanel.classList.add('show');
            this.renderUnifiedSnapshotsList();
        }
    },

    closePanel() {
        this.snapshotPanel.classList.remove('show');
    },

    restoreUnifiedSnapshot(snapshotId) {
        const snapshot = this.unifiedSnapshots.find(s => s.id === snapshotId);
        if (!snapshot) return;
        
        // 恢复拼豆颜色
        this.perlerColors = snapshot.data.map(row => [...row]);
        
        // 重新计算尺寸
        this.perlerHeight = this.perlerColors.length;
        this.perlerWidth = this.perlerHeight > 0 ? this.perlerColors[0].length : 0;
        
        // 重置画布边界为全部显示
        this.canvasBounds = {
            originalWidth: this.perlerWidth,
            originalHeight: this.perlerHeight,
            left: 0,
            right: this.perlerWidth,
            top: 0,
            bottom: this.perlerHeight
        };
        this.updateCanvasBoundsInputs();
        this.updateCanvasBoundsDisplay();
        
        // 无论是否在拼豆模式，都同步更新 customEditData 和 customEditHistory
        this.customEditData = this.perlerColors.map(row => [...row]);
        this.customEditHistory = [this.customEditData.map(row => [...row])];
        
        // 重新计算 colorCounts
        this.colorCounts = {};
        this.perlerColors.forEach(row => {
            row.forEach(color => {
                if (!color.isTransparent && color.name) {
                    if (this.colorCounts[color.name]) {
                        this.colorCounts[color.name]++;
                    } else {
                        this.colorCounts[color.name] = 1;
                    }
                }
            });
        });
        
        // 更新拼豆尺寸显示
        this.perlerSize.textContent = `${getI18nText('perlerSize')}: ${this.perlerWidth} × ${this.perlerHeight} ${getI18nText('beans')}`;
        
        // 重新绘制
        this.refreshPerlerChartDisplay();
        this.updateColorUsageList();
        
        // 绘制自定义画布
        if (this.customEditCanvas) {
            this.drawCustomEditCanvas();
        }
    },

    deleteUnifiedSnapshot(snapshotId) {
        this.unifiedSnapshots = this.unifiedSnapshots.filter(s => s.id !== snapshotId);
        if (this.unifiedSnapshots.length === 0 && this.snapshotsList) {
            this.snapshotsList.style.display = 'none';
        }
        this.renderUnifiedSnapshotsList();
    },
};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, SnapshotMixin);
}

if (typeof window !== 'undefined') {
    window.SnapshotMixin = SnapshotMixin;
}
