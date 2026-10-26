/**
 * ShowcaseMixin — 案例Showcase初始化+骨架+卡片+滚动+预览+焦点模式
 * 来源: app.js L7748-L7960 (213 行)
 * 提取时间: 2026-10-02 14:55:24
 *
 * 用法: 在 build.js 中把此文件放在 app.js 之后拼接，
 *       Object.assign 会把这些方法覆盖到 PixelArtGenerator.prototype 上。
 *       原 app.js 中的同名方法保留（被覆盖），验证无误后可删除。
 */

const ShowcaseMixin = {
    initShowcase() {
        if (!this.showcaseGrid || !this.showcaseSection) return;

        this.showcaseLoaded = false;
        this.showcaseSkeleton = this.createShowcaseSkeleton(6);
        this.showcaseGrid.appendChild(this.showcaseSkeleton);
        this.loadAndRenderShowcase();
    },

    createShowcaseSkeleton(count) {
        const container = document.createElement('div');
        container.style.cssText = 'display: contents;';

        const skeletonCount = count || 6;
        for (let i = 0; i < skeletonCount; i++) {
            const card = document.createElement('div');
            card.className = 'showcase-card showcase-skeleton-card';

            const preview = document.createElement('div');
            preview.className = 'showcase-preview showcase-skeleton-preview';

            const name = document.createElement('div');
            name.className = 'showcase-name showcase-skeleton-info';
            name.style.height = '20px';
            name.style.lineHeight = '20px';
            name.style.width = '60%';
            name.style.margin = '4px auto 4px';
            name.style.borderRadius = '4px';

            const info = document.createElement('div');
            info.className = 'showcase-info showcase-skeleton-info';
            info.style.height = '18px';
            info.style.lineHeight = '18px';
            info.style.width = '70%';
            info.style.margin = '0 auto';
            info.style.borderRadius = '4px';

            card.appendChild(preview);
            card.appendChild(name);
            card.appendChild(info);
            container.appendChild(card);
        }

        return container;
    },

    async loadAndRenderShowcase() {
        try {
            this.allPackedItems = await this.loadSamplePatternsRaw();
            this.currentShowcasePage = 0;
            this.showcasePageSize = 10;
            if (this.showcaseSkeleton) this.showcaseSkeleton.remove();
            await this.renderShowcasePage();
            this.setupShowcaseScrollListener();
        } catch (err) {
            console.warn('加载示例图纸失败:', err);
            if (this.showcaseSkeleton) this.showcaseSkeleton.remove();
            this.showcaseError();
        }
    },

    async renderShowcasePage() {
        const start = this.currentShowcasePage * this.showcasePageSize;
        const end = start + this.showcasePageSize;
        const items = this.allPackedItems.slice(start, end);

        if (items.length === 0) {
            this.removeShowcaseScrollListener();
            return;
        }

        const cards = await this.createSampleCards(items);
        cards.forEach((card) => this.showcaseGrid.appendChild(card));
        this.currentShowcasePage++;

        if (end >= this.allPackedItems.length) {
            this.removeShowcaseScrollListener();
        }
    },

    async createSampleCards(items) {
        const cards = [];
        for (const item of items) {
            if (!item.packedData) continue;
            try {
                const infoPaper = await this.infoPaperManager.compressor.unpack(item.packedData);
                const sample = this.infoPaperManager.converter.fromInfoPaper(infoPaper);
                if (sample) {
                    const card = this.createSampleCard(sample);
                    cards.push(card);
                }
            } catch (e) {
                console.warn('解码示例图纸失败:', e);
            }
        }
        return cards;
    },

    setupShowcaseScrollListener() {
        this.showcaseScrollHandler = () => {
            const showcase = this.showcaseSection;
            if (!showcase) return;

            const rect = showcase.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            if (rect.bottom <= windowHeight + 200) {
                this.renderShowcasePage();
            }
        };

        window.addEventListener('scroll', this.showcaseScrollHandler, { passive: true });
    },

    removeShowcaseScrollListener() {
        if (this.showcaseScrollHandler) {
            window.removeEventListener('scroll', this.showcaseScrollHandler);
            this.showcaseScrollHandler = null;
        }
    },

    createSampleCard(sample) {
        const card = document.createElement('div');
        card.className = 'showcase-card';

        const preview = document.createElement('div');
        preview.className = 'showcase-preview';

        const canvas = document.createElement('canvas');
        this.renderPreviewCanvas(canvas, sample.perlerColors, sample.width, sample.height);
        preview.appendChild(canvas);

        const info = document.createElement('div');
        info.className = 'showcase-info';
        const colorCount = Object.keys(sample.colorCounts).length;
        info.textContent = `${sample.width} × ${sample.height} · ${colorCount} ${getI18nText('colorCountText')}`;

        card.appendChild(preview);
        card.appendChild(info);

        card.addEventListener('click', () => {
            this.launchSampleFocusMode(sample.perlerColors, sample.width, sample.height, sample.colorSet);
        });

        return card;
    },

    async loadSamplePatternsRaw() {
        const url = new URL(`sample-patterns.json?v=${this.APP_VERSION}`, location.href).href;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    },

    showcaseError() {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 20px;';

        const msg = document.createElement('div');
        msg.style.cssText = 'color: #d9534f; margin-bottom: 12px; font-size: 14px;';
        msg.textContent = getI18nText('sampleLoadFailed');

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn';
        retryBtn.textContent = getI18nText('reloadSample');
        retryBtn.style.cssText = 'background: #667eea; color: #fff; border-color: #667eea; padding: 8px 20px; cursor: pointer;';
        retryBtn.addEventListener('click', () => {
            wrapper.remove();
            this.showcaseLoaded = false;
            this.initShowcase();
        });

        wrapper.appendChild(msg);
        wrapper.appendChild(retryBtn);
        this.showcaseGrid.appendChild(wrapper);
    },

    renderPreviewCanvas(canvas, perlerColors, width, height) {
        const cellSize = Math.max(4, Math.min(16, Math.floor(160 / Math.max(width, height))));
        canvas.width = width * cellSize;
        canvas.height = height * cellSize;
        const ctx = canvas.getContext('2d');

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const color = perlerColors[y][x];
                if (color.isTransparent) continue;
                ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    },

    launchSampleFocusMode(perlerColors, width, height, colorSet) {
        this.hideShowcase();
        const container = document.createElement('div');
        container.id = 'focus-mode-container';
        document.body.appendChild(container);

        this.focusModeRenderer.init(
            '#focus-mode-container',
            perlerColors,
            width,
            height,
            colorSet,
            () => {
                this.showShowcase();
                document.body.removeChild(container);
            }
        );
    }

};

// 在 PixelArtGenerator 类定义后执行，覆盖 prototype 上的同名方法
if (typeof PixelArtGenerator !== 'undefined') {
    Object.assign(PixelArtGenerator.prototype, ShowcaseMixin);
}

if (typeof window !== 'undefined') {
    window.ShowcaseMixin = ShowcaseMixin;
}
