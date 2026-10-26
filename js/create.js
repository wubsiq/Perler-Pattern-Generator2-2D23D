/* =============================================================
 * create.js — 导入入口 + 三步处理
 *
 * 流程：原图 →（裁切旋转）→ 图1 →（像素化）→ 像素网格 →（拼豆化）→ 色号网格
 * 三步共用同一个 T 形窗口，数据全程留在内存里，最后一次性交给编辑器。
 *
 * 依赖（全局，v1 原文件未改动）：
 *   js/colors.js      → colorSets
 *   js/colorUtils.js  → rgbToLab / deltaE2000 / calculateColorDistance ...
 * ============================================================= */

(() => {
    'use strict';

    /* =========================================================
     * 0. 常量与工具
     * ========================================================= */

    const MAX_SOURCE_EDGE = 3200;   // 源图长边上限，超过先缩，避免内存炸
    const MAX_CELLS = 60000;        // 总格数上限（约 245×245），超了就等比/单边压回来
    const MAX_EDGE = 400;           // 单边格数上限

    const PALETTE_LABELS = {
        mard221: 'Mard 221 色',
        mard291: 'Mard 291 色',
        mard291Refined: 'Mard 291 色 · 精炼',
        mard120: 'Mard 120 色',
        mard72: 'Mard 72 色',
        mard48: 'Mard 48 色',
        mard24: 'Mard 24 色',
        mardGray: 'Mard 黑白灰 23 色',
        mardH: 'Mard H 系中性色 23 色',
        perler24: 'Perler 24 色',
        perler48: 'Perler 48 色',
        perler72: 'Perler 72 色',
        hama: 'Hama 10 色'
    };

    const MAPPING_LABELS = {
        cie2000: 'CIEDE2000（最准，慢）',
        'cie2000-smoothed': 'CIEDE2000 · 大色块优化',
        cie94: 'CIE94',
        cie76: 'CIE76（Lab）',
        'weighted-rgb': '加权 RGB（快）',
        hsl: 'HSL',
        hsv: 'HSV'
    };

    const $ = (id) => document.getElementById(id);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const rgbCss = (r, g, b) => `rgb(${r},${g},${b})`;
    const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

    function debounce(fn, ms) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    /**
     * 按宿主实际可用尺寸算每格像素。
     * 预览画布按「显示尺寸」出图，而不是固定 1000px 再缩，
     * 这样格内色号和网格线在屏幕上才是 1:1 的，不会糊。
     */
    function fitScale(host, cols, rows, max = 48) {
        const availW = Math.max(80, host.clientWidth - 36);
        const availH = Math.max(80, host.clientHeight - 36);
        return clamp(Math.floor(Math.min(availW / cols, availH / rows)), 2, max);
    }

    /* =========================================================
     * 1. 状态
     * ========================================================= */

    const S = {
        step: 0,               // 0 = 入口
        src: null,             // 源图 canvas（已限尺寸）
        srcName: '',

        rotation: 0,           // 0 / 90 / 180 / 270
        flipH: false,
        flipV: false,
        crop: { x: 0, y: 0, w: 1, h: 1 },   // 归一化，作用在「工作图」上
        work: null,            // 旋转翻转后的工作图 canvas
        fig1: null,            // 裁切结果（图1）

        pixel: {
            block: 12,             // 只是「大致块大小」，真正决定输出的是下面的 cols/rows
            cols: 0,               // 0 = 还没定过，进第 2 步时按 block 推
            rows: 0,
            lock: true,            // 锁定原图宽高比
            method: 'majority',
            contrast: false,
            contrastFactor: 1.15,
            showGrid: true,
            gridColor: '#8E949E'
        },
        grid: null,            // { cols, rows, rgb: Uint8ClampedArray, alpha: Uint8Array }

        perler: {
            palette: 'mard221',
            mapping: 'cie2000'
        },
        perlerGrid: null,      // { cols, rows, codes: string[], used: Map }
    };

    /* =========================================================
     * 2. DOM
     * ========================================================= */

    const entryView = $('entryView');
    const flowView = $('flowView');
    const leftBody = $('leftBody');
    const rightBody = $('rightBody');
    const leftTitle = $('leftTitle');
    const rightTitle = $('rightTitle');
    const leftMeta = $('leftMeta');
    const rightMeta = $('rightMeta');
    const controls = $('controls');
    const flowStatus = $('flowStatus');
    const btnNext = $('btnNext');
    const btnBack = $('btnBack');
    const btnReset = $('btnReset');
    const fileInput = $('fileInput');
    const dropOverlay = $('dropOverlay');

    // 当前步骤里所有舞台的布局函数，resize 时全部重跑
    let layouters = [];
    function relayout() {
        layouters.forEach(fn => {
            try { fn(); } catch (_) { }
        });
    }

    /* =========================================================
     * 3. 图片载入
     * ========================================================= */

    function loadFile(file) {
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            toast('这个文件不是图片');
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            adoptImage(img, file.name);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            toast('图片读不出来，换个格式试试');
        };
        img.src = url;
    }

    function adoptImage(img, name) {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
            toast('图片尺寸无效');
            return;
        }

        const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);

        S.src = c;
        S.srcName = name || '未命名';
        S.rotation = 0;
        S.flipH = false;
        S.flipV = false;
        S.crop = { x: 0, y: 0, w: 1, h: 1 };
        S.fig1 = null;
        S.grid = null;
        S.perlerGrid = null;

        // 根据图片尺寸给个合适的初始块大小，目标 ~64 格
        const edge = Math.max(cw, ch);
        S.pixel.block = clamp(Math.round(edge / 64), 2, 64);
        S.pixel.cols = 0;
        S.pixel.rows = 0;

        goStep(1);
    }

    /* =========================================================
     * 4. 工作图（旋转 + 翻转）
     * ========================================================= */

    function buildWork() {
        if (!S.src) return null;
        const sw = S.src.width;
        const sh = S.src.height;
        const swap = S.rotation === 90 || S.rotation === 270;
        const w = swap ? sh : sw;
        const h = swap ? sw : sh;

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(S.rotation * Math.PI / 180);
        ctx.scale(S.flipH ? -1 : 1, S.flipV ? -1 : 1);
        ctx.drawImage(S.src, -sw / 2, -sh / 2);
        ctx.restore();

        S.work = c;
        return c;
    }

    function cropRect(work) {
        const x = clamp(Math.round(S.crop.x * work.width), 0, work.width - 1);
        const y = clamp(Math.round(S.crop.y * work.height), 0, work.height - 1);
        const w = clamp(Math.round(S.crop.w * work.width), 1, work.width - x);
        const h = clamp(Math.round(S.crop.h * work.height), 1, work.height - y);
        return { x, y, w, h };
    }

    function buildFig1() {
        const work = S.work || buildWork();
        if (!work) return null;
        const r = cropRect(work);

        const c = document.createElement('canvas');
        c.width = r.w;
        c.height = r.h;
        const ctx = c.getContext('2d');
        ctx.drawImage(work, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        S.fig1 = c;
        return c;
    }

    /* =========================================================
     * 5. 舞台（把 canvas 塞进 pane 并按容器缩放）
     * ========================================================= */

    function mountStage(host, canvas, opts = {}) {        host.innerHTML = '';
        const stage = document.createElement('div');
        stage.className = 'stage';
        if (opts.checker) stage.classList.add('checker');

        const view = document.createElement('canvas');
        view.width = canvas.width;
        view.height = canvas.height;
        view.getContext('2d').drawImage(canvas, 0, 0);
        if (opts.pixelated) view.classList.add('pixelated');
        stage.appendChild(view);

        host.appendChild(stage);

        const layout = () => {
            const availW = Math.max(60, host.clientWidth - 32);
            const availH = Math.max(60, host.clientHeight - 32);
            const s = Math.min(availW / view.width, availH / view.height);
            view.style.width = Math.max(1, Math.round(view.width * s)) + 'px';
            view.style.height = Math.max(1, Math.round(view.height * s)) + 'px';
            if (typeof opts.afterLayout === 'function') opts.afterLayout(stage, view, s);
        };

        // 宿主尺寸一变就重排（面板折叠、窗口缩放、抽屉展开都能吃到）
        host._stageLayout = layout;
        if (!host._stageRO) {
            host._stageRO = new ResizeObserver(() => {
                if (host._stageLayout) host._stageLayout();
            });
            host._stageRO.observe(host);
        }

        layouters.push(layout);
        requestAnimationFrame(layout);

        return { stage, view, layout };
    }

    /* =========================================================
     * 6. 步骤切换
     * ========================================================= */

    function goStep(n) {
        S.step = n;
        layouters = [];
        entryView.hidden = n !== 0;
        flowView.hidden = n === 0;
        btnReset.hidden = n === 0;

        document.querySelectorAll('.flow-step').forEach(el => {
            const k = Number(el.dataset.step);
            el.classList.toggle('is-active', k === n);
            el.classList.toggle('is-done', k < n);
        });

        btnBack.disabled = n === 1;
        btnNext.textContent = n === 3 ? '进入画布' : '下一步';

        if (n === 1) renderStep1();
        if (n === 2) renderStep2();
        if (n === 3) renderStep3();
    }

    function resetAll() {
        S.src = null;
        S.fig1 = null;
        S.grid = null;
        S.perlerGrid = null;
        S.step = 0;
        leftBody.innerHTML = '';
        rightBody.innerHTML = '';
        controls.innerHTML = '';
        flowStatus.textContent = '';
        goStep(0);
    }

    /* =========================================================
     * 7. 步骤 1 — 裁切旋转
     * ========================================================= */

    function renderStep1() {
        leftTitle.textContent = '原图';
        rightTitle.textContent = '裁切预览';
        controls.innerHTML = '';

        const work = buildWork();

        // ---- 左：可裁切的工作图 ----
        const { stage, view, layout } = mountStage(leftBody, work, {
            afterLayout: (st, v) => positionCropBox(st, v)
        });

        const layer = document.createElement('div');
        layer.className = 'crop-layer';

        const box = document.createElement('div');
        box.className = 'crop-box';
        ['nw', 'ne', 'sw', 'se'].forEach(h => {
            const d = document.createElement('div');
            d.className = 'crop-handle';
            d.dataset.h = h;
            box.appendChild(d);
        });

        layer.appendChild(box);
        stage.appendChild(layer);

        leftMeta.textContent = `${work.width} × ${work.height}`;

        // ---- 裁切框几何 ----
        function positionCropBox(st, v) {
            const dw = v.clientWidth || parseInt(v.style.width) || 1;
            const dh = v.clientHeight || parseInt(v.style.height) || 1;
            box.style.left = (S.crop.x * dw) + 'px';
            box.style.top = (S.crop.y * dh) + 'px';
            box.style.width = (S.crop.w * dw) + 'px';
            box.style.height = (S.crop.h * dh) + 'px';
            box.style.setProperty('--cw', (S.crop.w * dw) + 'px');
            box.style.setProperty('--ch', (S.crop.h * dh) + 'px');
        }

        layout();

        // ---- 拖拽 ----
        let drag = null;

        function relPt(e) {
            const r = layer.getBoundingClientRect();
            return {
                x: clamp((e.clientX - r.left) / r.width, 0, 1),
                y: clamp((e.clientY - r.top) / r.height, 0, 1)
            };
        }

        layer.addEventListener('pointerdown', (e) => {
            const handle = e.target.closest('.crop-handle');
            const p = relPt(e);

            if (handle) {
                drag = { mode: 'resize', h: handle.dataset.h, start: { ...S.crop }, p0: p };
            } else if (e.target === box) {
                drag = { mode: 'move', start: { ...S.crop }, p0: p };
            } else {
                // 空白处起手 → 重新框选
                drag = { mode: 'new', p0: p };
                S.crop = { x: p.x, y: p.y, w: 0.001, h: 0.001 };
            }

            layer.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        layer.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const p = relPt(e);

            if (drag.mode === 'new') {
                const x = Math.min(drag.p0.x, p.x);
                const y = Math.min(drag.p0.y, p.y);
                S.crop = {
                    x,
                    y,
                    w: Math.max(0.01, Math.abs(p.x - drag.p0.x)),
                    h: Math.max(0.01, Math.abs(p.y - drag.p0.y))
                };
            } else if (drag.mode === 'move') {
                const dx = p.x - drag.p0.x;
                const dy = p.y - drag.p0.y;
                S.crop.x = clamp(drag.start.x + dx, 0, 1 - drag.start.w);
                S.crop.y = clamp(drag.start.y + dy, 0, 1 - drag.start.h);
                S.crop.w = drag.start.w;
                S.crop.h = drag.start.h;
            } else {
                const s0 = drag.start;
                let x1 = s0.x, y1 = s0.y, x2 = s0.x + s0.w, y2 = s0.y + s0.h;
                if (drag.h.includes('w')) x1 = clamp(p.x, 0, x2 - 0.01);
                if (drag.h.includes('e')) x2 = clamp(p.x, x1 + 0.01, 1);
                if (drag.h.includes('n')) y1 = clamp(p.y, 0, y2 - 0.01);
                if (drag.h.includes('s')) y2 = clamp(p.y, y1 + 0.01, 1);
                S.crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
            }

            positionCropBox(stage, view);
            updateStep1Preview();
        });

        const endDrag = (e) => {
            if (!drag) return;
            drag = null;
            try { layer.releasePointerCapture(e.pointerId); } catch (_) { }
        };
        layer.addEventListener('pointerup', endDrag);
        layer.addEventListener('pointercancel', endDrag);

        // ---- 右：裁切预览 ----
        updateStep1Preview();

        // ---- 下：参数 ----
        controls.innerHTML = `
            <div class="ctl">
                <span class="ctl-label">旋转</span>
                <div class="ctl-btns">
                    <button class="icon-btn" data-rot="-90" title="左转 90°">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 9h9a5 5 0 015 5v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 5.5L4 9l3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn" data-rot="90" title="右转 90°">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 9h-9a5 5 0 00-5 5v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16.5 5.5L20 9l-3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn" data-flip="h" title="左右翻转">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3v18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2.5"/><path d="M8.5 6.5L3.5 12l5 5.5V6.5zM15.5 6.5l5 5.5-5 5.5V6.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn" data-flip="v" title="上下翻转">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 12h18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2.5"/><path d="M6.5 8.5L12 3.5l5.5 5H6.5zM6.5 15.5L12 20.5l5.5-5H6.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                    </button>
                </div>
            </div>

            <div class="ctl-sep"></div>

            <div class="ctl">
                <span class="ctl-label">裁切</span>
                <div class="ctl-btns">
                    <button class="btn btn-sm" data-crop="auto">自动去边</button>
                    <button class="btn btn-sm" data-crop="full">整张</button>
                    <button class="btn btn-sm" data-crop="square">方形</button>
                    <button class="btn btn-sm" data-crop="ratio">原比例</button>
                </div>
            </div>

            <div class="ctl-sep"></div>

            <div class="ctl">
                <span class="ctl-label">裁切尺寸</span>
                <span class="ctl-val" id="cropVal">—</span>
            </div>
        `;

        controls.querySelectorAll('[data-rot]').forEach(b => {
            b.addEventListener('click', () => {
                S.rotation = (S.rotation + Number(b.dataset.rot) + 360) % 360;
                S.crop = { x: 0, y: 0, w: 1, h: 1 };
                renderStep1();
            });
        });

        controls.querySelectorAll('[data-flip]').forEach(b => {
            b.addEventListener('click', () => {
                if (b.dataset.flip === 'h') S.flipH = !S.flipH;
                else S.flipV = !S.flipV;
                renderStep1();
            });
        });

        controls.querySelectorAll('[data-crop]').forEach(b => {
            b.addEventListener('click', () => {
                const mode = b.dataset.crop;
                if (mode === 'full') {
                    S.crop = { x: 0, y: 0, w: 1, h: 1 };
                } else if (mode === 'square') {
                    const w = work.width, h = work.height;
                    if (w >= h) {
                        const nw = h / w;
                        S.crop = { x: (1 - nw) / 2, y: 0, w: nw, h: 1 };
                    } else {
                        const nh = w / h;
                        S.crop = { x: 0, y: (1 - nh) / 2, w: 1, h: nh };
                    }
                } else if (mode === 'ratio') {
                    const srcRatio = S.src.width / S.src.height;
                    const workRatio = work.width / work.height;
                    if (Math.abs(srcRatio - workRatio) < 0.001) {
                        S.crop = { x: 0, y: 0, w: 1, h: 1 };
                    }
                } else if (mode === 'auto') {
                    const r = detectEdges(work);
                    if (r) S.crop = r;
                    else toast('没找到可裁的纯色边');
                }
                renderStep1();
            });
        });

        updateStep1Preview();

        flowStatus.innerHTML = '拖动四个角调整裁切范围 · 画布上任意位置拖拽可重新框选';
    }

    // 步骤 1 的预览（裁切结果）
    let updateStep1Preview = () => { };

    updateStep1Preview = debounce(function () {
        if (S.step !== 1 || !S.work) return;
        const fig = buildFig1();
        if (!fig) return;

        const host = rightBody;
        const exists = host.querySelector('.stage canvas');
        if (exists) {
            // 原地换内容，避免整块重建导致闪烁
            const view = exists;
            view.width = fig.width;
            view.height = fig.height;
            view.getContext('2d').drawImage(fig, 0, 0);
            relayout();
        } else {
            mountStage(host, fig);
        }

        rightMeta.textContent = `${fig.width} × ${fig.height}`;

        const cv = document.getElementById('cropVal');
        if (cv) cv.textContent = `${fig.width} × ${fig.height}`;

        flowStatus.innerHTML = `裁切后 <strong>${fig.width} × ${fig.height}</strong> px，下一步做像素化`;
    }, 60);

    /* ---------- 自动去边 ---------- */

    function detectEdges(work) {
        // 缩到小图检测，性能稳，结果仍是归一化坐标
        const k = Math.min(1, 700 / Math.max(work.width, work.height));
        const w = Math.max(1, Math.round(work.width * k));
        const h = Math.max(1, Math.round(work.height * k));

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(work, 0, 0, w, h);

        let data;
        try {
            data = ctx.getImageData(0, 0, w, h).data;
        } catch (_) {
            return null;
        }

        const at = (x, y) => (y * w + x) * 4;

        // 参考色：四角平均
        const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
        const ref = [0, 1, 2].map(ch => Math.round(corners.reduce((a, i) => a + data[i + ch], 0) / 4));

        const tol = 30;
        const isBg = (i) => {
            if (data[i + 3] < 16) return true;
            const dr = data[i] - ref[0], dg = data[i + 1] - ref[1], db = data[i + 2] - ref[2];
            return Math.sqrt(dr * dr + dg * dg + db * db) < tol;
        };

        const rowClean = (y) => {
            for (let x = 0; x < w; x++) if (!isBg(at(x, y))) return false;
            return true;
        };
        const colClean = (x) => {
            for (let y = 0; y < h; y++) if (!isBg(at(x, y))) return false;
            return true;
        };

        const limitY = Math.floor(h * 0.45);
        const limitX = Math.floor(w * 0.45);

        let top = 0;
        while (top < limitY && rowClean(top)) top++;
        let bottom = h - 1;
        while (bottom > h - 1 - limitY && rowClean(bottom)) bottom--;
        let left = 0;
        while (left < limitX && colClean(left)) left++;
        let right = w - 1;
        while (right > w - 1 - limitX && colClean(right)) right--;

        // 收缩不足 2% 视为没有边
        const rx = left / w, ry = top / h;
        const rw = (right - left + 1) / w, rh = (bottom - top + 1) / h;
        if (rx < 0.02 && ry < 0.02 && rw > 0.98 && rh > 0.98) return null;

        return { x: rx, y: ry, w: rw, h: rh };
    }

    /* =========================================================
     * 8. 步骤 2 — 像素化
     * ========================================================= */

    function renderStep2() {
        leftTitle.textContent = '图 1（已裁切）';
        rightTitle.textContent = '像素预览';

        if (!S.fig1) buildFig1();
        const fig = S.fig1;
        if (!fig) { goStep(1); return; }

        mountStage(leftBody, fig);
        leftMeta.textContent = `${fig.width} × ${fig.height}`;

        // 第一次进这一步（或刚换过图）：按块大小推一个网格数
        if (!(S.pixel.cols > 0 && S.pixel.rows > 0)) setTargetsFromBlock(fig);
        fitTargets(fig);

        controls.innerHTML = `
            <div class="ctl ctl-w-l">
                <span class="ctl-label">像素化方法</span>
                <select class="select" id="pxMethod">
                    <option value="majority">主色（推荐）</option>
                    <option value="average">平均色（柔和）</option>
                    <option value="center">中心点（硬边）</option>
                </select>
            </div>

            <div class="ctl ctl-w-m">
                <span class="ctl-label">
                    像素块大小
                    <span class="ctl-val" id="pxBlockVal">12 px</span>
                </span>
                <div class="ctl-slider">
                    <input class="range" type="range" id="pxBlock" min="2" max="64" step="1" value="12">
                </div>
            </div>

            <div class="ctl ctl-w-l">
                <span class="ctl-label">输出网格</span>
                <div class="px-grid">
                    <input class="input px-cell" type="number" id="pxCols" min="1" max="400"
                           inputmode="numeric" aria-label="横向格数">
                    <span class="px-times">×</span>
                    <input class="input px-cell" type="number" id="pxRows" min="1" max="400"
                           inputmode="numeric" aria-label="纵向格数">
                    <button class="link-btn is-on" id="pxLock" type="button" aria-pressed="true"
                            title="保持原图宽高比">
                        <svg class="lnk-on" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M10.2 13.8l3.6-3.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
                            <path d="M8.4 15.6l-1.2 1.2a3.9 3.9 0 105.5 5.5l1.2-1.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
                            <path d="M15.6 8.4l1.2-1.2a3.9 3.9 0 10-5.5-5.5l-1.2 1.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
                        </svg>
                        <svg class="lnk-off" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M9.2 16.4l-1.1 1.1a3.8 3.8 0 01-5.4-5.4l2-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M14.8 7.6l1.1-1.1a3.8 3.8 0 015.4 5.4l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M4.2 19.8L19.8 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <span class="ctl-hint" id="pxGridInfo">—</span>
            </div>

            <div class="ctl">
                <span class="ctl-label">增强对比度</span>
                <div class="ctl-row">
                    <label class="check">
                        <input type="checkbox" id="pxContrast">
                        <span>开启</span>
                    </label>
                    <input class="range" type="range" id="pxContrastVal" min="1" max="1.8" step="0.05" value="1.15"
                           style="width:96px" disabled>
                </div>
            </div>

            <div class="ctl-sep"></div>

            <div class="ctl">
                <span class="ctl-label">像素划分线</span>
                <div class="ctl-row">
                    <label class="check">
                        <input type="checkbox" id="pxShowGrid" checked>
                        <span>显示</span>
                    </label>
                    <input class="color-well" type="color" id="pxGridColor" value="#000000" title="划分线颜色">
                </div>
            </div>
        `;

        const elMethod = $('pxMethod');
        const elBlock = $('pxBlock');
        const elBlockVal = $('pxBlockVal');
        const elCols = $('pxCols');
        const elRows = $('pxRows');
        const elLock = $('pxLock');
        const elGridInfo = $('pxGridInfo');
        const elContrast = $('pxContrast');
        const elContrastVal = $('pxContrastVal');
        const elShowGrid = $('pxShowGrid');
        const elGridColor = $('pxGridColor');

        elMethod.value = S.pixel.method;
        elContrast.checked = S.pixel.contrast;
        elContrastVal.value = S.pixel.contrastFactor;
        elContrastVal.disabled = !S.pixel.contrast;
        elShowGrid.checked = S.pixel.showGrid;
        elGridColor.value = S.pixel.gridColor;

        // skip = 正在输入的那个框不回写，否则光标会被顶到末尾
        function syncPixelUI(skip) {
            const b = fig.width / S.pixel.cols;
            elBlock.value = clamp(Math.round(b), 2, 64);
            elBlockVal.textContent = fmtNum(b) + ' px';
            if (skip !== 'cols') elCols.value = S.pixel.cols;
            if (skip !== 'rows') elRows.value = S.pixel.rows;
            elLock.classList.toggle('is-on', S.pixel.lock);
            elLock.setAttribute('aria-pressed', String(S.pixel.lock));
            elLock.querySelector('.lnk-on').hidden = !S.pixel.lock;
            elLock.querySelector('.lnk-off').hidden = S.pixel.lock;
            elLock.title = S.pixel.lock ? '保持原图宽高比（点一下解锁）' : '宽高各自独立（点一下锁定）';
            if (elGridInfo) elGridInfo.textContent = gridInfo(fig);
        }

        const recalc = debounce(() => {
            recomputePixel();
            renderPixelPreview();
        }, 90);

        // 控件就位后再算第一次，参数值才有地方显示
        syncPixelUI();
        recomputePixel();
        renderPixelPreview();

        elMethod.addEventListener('change', () => {
            S.pixel.method = elMethod.value;
            recalc();
        });

        elBlock.addEventListener('input', () => {
            S.pixel.block = Number(elBlock.value);
            setTargetsFromBlock(fig);
            syncPixelUI();
            recalc();
        });

        function editCells(which, raw) {
            if (raw === '') return;                    // 清空途中不打断
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            const v = clamp(Math.round(n), 1, MAX_EDGE);
            if (which === 'cols') {
                S.pixel.cols = v;
                if (S.pixel.lock) S.pixel.rows = Math.max(1, Math.round(v * fig.height / fig.width));
            } else {
                S.pixel.rows = v;
                if (S.pixel.lock) S.pixel.cols = Math.max(1, Math.round(v * fig.width / fig.height));
            }
            fitTargets(fig);
            syncPixelUI(which);
            recalc();
        }

        elCols.addEventListener('input', () => editCells('cols', elCols.value));
        elRows.addEventListener('input', () => editCells('rows', elRows.value));
        // 失焦时把夹紧后的真实值写回去（输 9999 会被压到 400）
        elCols.addEventListener('blur', () => { elCols.value = S.pixel.cols; });
        elRows.addEventListener('blur', () => { elRows.value = S.pixel.rows; });
        [elCols, elRows].forEach(el => el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                el.blur();
            }
        }));

        elLock.addEventListener('click', () => {
            S.pixel.lock = !S.pixel.lock;
            syncPixelUI();
            recalc();
        });

        elContrast.addEventListener('change', () => {
            S.pixel.contrast = elContrast.checked;
            elContrastVal.disabled = !elContrast.checked;
            recalc();
        });

        elContrastVal.addEventListener('input', () => {
            S.pixel.contrastFactor = Number(elContrastVal.value);
            recalc();
        });

        elShowGrid.addEventListener('change', () => {
            S.pixel.showGrid = elShowGrid.checked;
            renderPixelPreview();
        });

        elGridColor.addEventListener('input', () => {
            S.pixel.gridColor = elGridColor.value;
            renderPixelPreview();
        });

        flowStatus.innerHTML = '填格数就行，块尺寸自动算 · 建议 ≤ 200 格';
    }

    /* ---------- 网格目标 ---------- */

    // 块大小 → 目标格数。锁比例时只按长边算，短边用比例推，免得两次取整把比例带歪。
    function setTargetsFromBlock(fig) {
        const b = Math.max(1, S.pixel.block);
        if (S.pixel.lock) {
            if (fig.width >= fig.height) {
                S.pixel.cols = Math.max(1, Math.round(fig.width / b));
                S.pixel.rows = Math.max(1, Math.round(S.pixel.cols * fig.height / fig.width));
            } else {
                S.pixel.rows = Math.max(1, Math.round(fig.height / b));
                S.pixel.cols = Math.max(1, Math.round(S.pixel.rows * fig.width / fig.height));
            }
        } else {
            S.pixel.cols = Math.max(1, Math.round(fig.width / b));
            S.pixel.rows = Math.max(1, Math.round(fig.height / b));
        }
        fitTargets(fig);
    }

    // 夹在合理范围内：单边 ≤ MAX_EDGE，总格数 ≤ MAX_CELLS
    function fitTargets(fig) {
        let cols = clamp(Math.round(S.pixel.cols || 1), 1, MAX_EDGE);
        let rows = clamp(Math.round(S.pixel.rows || 1), 1, MAX_EDGE);

        if (cols * rows > MAX_CELLS) {
            if (S.pixel.lock) {
                const k = Math.sqrt(MAX_CELLS / (cols * rows));
                cols = Math.max(1, Math.floor(cols * k));
                rows = Math.max(1, Math.floor(rows * k));
            } else if (cols >= rows) {
                rows = Math.max(1, Math.floor(MAX_CELLS / cols));
            } else {
                cols = Math.max(1, Math.floor(MAX_CELLS / rows));
            }
        }

        S.pixel.cols = cols;
        S.pixel.rows = rows;
        return { cols, rows };
    }

    function gridInfo(fig) {
        const cols = S.pixel.cols;
        const rows = S.pixel.rows;
        const bw = fig.width / cols;
        const bh = fig.height / rows;
        const size = Math.abs(bw - bh) < 0.06
            ? `${fmtNum(bw)} px`
            : `${fmtNum(bw)} × ${fmtNum(bh)} px`;
        const n = cols * rows;
        let tip = `每格 ${size} · 共 ${n.toLocaleString()} 格`;
        if (n >= 40000) tip += ' · 格子很多，算起来会慢一点';
        return tip;
    }

    function fmtNum(v) {
        return String(Math.round(v * 100) / 100);
    }

    /* ---------- 像素化核心 ---------- */

    function recomputePixel() {
        const fig = S.fig1;
        if (!fig) return;

        if (!(S.pixel.cols > 0 && S.pixel.rows > 0)) setTargetsFromBlock(fig);
        const { cols, rows } = fitTargets(fig);

        const W = fig.width;
        const H = fig.height;

        // 块尺寸允许小数：格数定了，边界就是 W/cols、H/rows。
        // 所以「原图 16:9 但按 104×104 输出」会横向压扁——这正是用户要的拉伸。
        const bw = W / cols;
        const bh = H / rows;

        const ctx = fig.getContext('2d', { willReadFrequently: true });
        let src;
        try {
            src = ctx.getImageData(0, 0, W, H);
        } catch (_) {
            toast('画布被污染，无法读取像素');
            return;
        }

        const rgb = new Uint8ClampedArray(cols * rows * 3);
        const alpha = new Uint8Array(cols * rows);
        const data = src.data;
        const method = S.pixel.method;

        for (let ry = 0; ry < rows; ry++) {
            const y0 = Math.floor(ry * bh);
            const y1 = Math.min(H, Math.max(y0 + 1, Math.ceil((ry + 1) * bh)));

            for (let rx = 0; rx < cols; rx++) {
                const x0 = Math.floor(rx * bw);
                const x1 = Math.min(W, Math.max(x0 + 1, Math.ceil((rx + 1) * bw)));

                let outR, outG, outB, outA = 255;

                if (method === 'center') {
                    const sx = Math.min(W - 1, Math.floor(x0 + (x1 - x0) / 2));
                    const sy = Math.min(H - 1, Math.floor(y0 + (y1 - y0) / 2));
                    const i = (sy * W + sx) * 4;
                    outR = data[i]; outG = data[i + 1]; outB = data[i + 2]; outA = data[i + 3];
                } else {
                    const sw = x1 - x0;
                    const sh = y1 - y0;
                    // 块内采样步长：大块不用逐像素扫，省时间
                    const stx = Math.max(1, Math.floor(sw / 8));
                    const sty = Math.max(1, Math.floor(sh / 8));

                    if (method === 'average') {
                        let r = 0, g = 0, b = 0, n = 0, transparent = 0, total = 0;
                        for (let y = y0; y < y1; y += sty) {
                            for (let x = x0; x < x1; x += stx) {
                                const i = (y * W + x) * 4;
                                total++;
                                if (data[i + 3] < 24) { transparent++; continue; }
                                r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
                            }
                        }
                        if (n === 0 || transparent > total * 0.6) {
                            outR = outG = outB = 255; outA = 0;
                        } else {
                            outR = Math.round(r / n); outG = Math.round(g / n); outB = Math.round(b / n);
                        }
                    } else {
                        // majority：量化到 5bit/通道 后统计众数
                        const bucket = new Map();
                        let transparent = 0, total = 0;
                        for (let y = y0; y < y1; y += sty) {
                            for (let x = x0; x < x1; x += stx) {
                                const i = (y * W + x) * 4;
                                total++;
                                if (data[i + 3] < 24) { transparent++; continue; }
                                const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
                                const cur = bucket.get(key);
                                if (cur) {
                                    cur.n++;
                                    cur.r += data[i]; cur.g += data[i + 1]; cur.b += data[i + 2];
                                } else {
                                    bucket.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
                                }
                            }
                        }
                        if (transparent > total * 0.6) {
                            outR = outG = outB = 255; outA = 0;
                        } else {
                            let best = null;
                            bucket.forEach(v => { if (!best || v.n > best.n) best = v; });
                            if (best) {
                                outR = Math.round(best.r / best.n);
                                outG = Math.round(best.g / best.n);
                                outB = Math.round(best.b / best.n);
                            } else {
                                outR = outG = outB = 255; outA = 0;
                            }
                        }
                    }
                }

                const idx = ry * cols + rx;
                rgb[idx * 3] = outR;
                rgb[idx * 3 + 1] = outG;
                rgb[idx * 3 + 2] = outB;
                alpha[idx] = outA;
            }
        }

        // 增强对比度
        if (S.pixel.contrast && S.pixel.contrastFactor > 1.001) {
            const f = S.pixel.contrastFactor;
            for (let i = 0; i < rgb.length; i += 3) {
                if (alpha[i / 3] === 0) continue;
                rgb[i] = clamp(Math.round((rgb[i] - 128) * f + 128), 0, 255);
                rgb[i + 1] = clamp(Math.round((rgb[i + 1] - 128) * f + 128), 0, 255);
                rgb[i + 2] = clamp(Math.round((rgb[i + 2] - 128) * f + 128), 0, 255);
            }
        }

        S.grid = { cols, rows, rgb, alpha };

        const info = $('pxGridInfo');
        if (info) info.textContent = gridInfo(fig);
        const bv = $('pxBlockVal');
        if (bv) bv.textContent = fmtNum(W / cols) + ' px';
        const bs = $('pxBlock');
        if (bs) {
            const v = clamp(Math.round(W / cols), 2, 64);
            if (Number(bs.value) !== v) bs.value = v;
        }
    }

    /* ---------- 像素预览渲染 ---------- */

    function renderPixelPreview() {
        if (!S.grid) return;

        // 等一帧：此时右侧 pane 的尺寸才是最终的
        requestAnimationFrame(() => {
            if (S.step !== 2 || !S.grid) return;
            const { cols, rows, rgb, alpha } = S.grid;

            const scale = fitScale(rightBody, cols, rows);
            const c = document.createElement('canvas');
            c.width = cols * scale;
            c.height = rows * scale;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            // 底：透明格用棋盘格
            if (Array.prototype.some.call(alpha, v => v === 0)) {
                const t = Math.max(6, Math.round(scale * 0.9));
                for (let y = 0; y < c.height; y += t) {
                    for (let x = 0; x < c.width; x += t) {
                        ctx.fillStyle = ((x / t + y / t) | 0) % 2 ? '#EDEFF3' : '#FFFFFF';
                        ctx.fillRect(x, y, t, t);
                    }
                }
            }

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const i = y * cols + x;
                    if (alpha[i] === 0) continue;
                    ctx.fillStyle = rgbCss(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }

            // 划分线：1px，跟显示尺寸 1:1。
            // 格子密的时候线会糊成一片黑纱，所以 scale 小就干脆不画，画也压淡
            if (S.pixel.showGrid && scale >= 6) {
                ctx.strokeStyle = S.pixel.gridColor;
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let x = 1; x < cols; x++) {
                    ctx.moveTo(x * scale + .5, 0);
                    ctx.lineTo(x * scale + .5, c.height);
                }
                for (let y = 1; y < rows; y++) {
                    ctx.moveTo(0, y * scale + .5);
                    ctx.lineTo(c.width, y * scale + .5);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            mountStage(rightBody, c);
            rightMeta.textContent = `${cols} × ${rows} 格`;
        });
    }

    /* =========================================================
     * 9. 步骤 3 — 拼豆化
     * ========================================================= */

    function renderStep3() {
        leftTitle.textContent = '像素图';
        rightTitle.textContent = '拼豆图';

        if (!S.grid) { goStep(2); return; }

        // 左：像素图（复用预览渲染，但渲染到左边）
        renderPixelTo(leftBody);
        leftMeta.textContent = `${S.grid.cols} × ${S.grid.rows} 格`;

        const palKeys = Object.keys(PALETTE_LABELS);
        const mapKeys = Object.keys(MAPPING_LABELS);

        controls.innerHTML = `
            <div class="ctl ctl-w-l">
                <span class="ctl-label">颜色套装</span>
                <select class="select" id="plPalette">
                    ${palKeys.map(k => `<option value="${k}">${PALETTE_LABELS[k]}</option>`).join('')}
                </select>
            </div>

            <div class="ctl ctl-w-l">
                <span class="ctl-label">颜色映射方法</span>
                <select class="select" id="plMapping">
                    ${mapKeys.map(k => `<option value="${k}">${MAPPING_LABELS[k]}</option>`).join('')}
                </select>
            </div>

            <div class="ctl-sep"></div>

            <div class="ctl">
                <span class="ctl-label">用色</span>
                <span class="ctl-val" id="plUsed">—</span>
            </div>

            <div class="ctl">
                <span class="ctl-label">总豆数</span>
                <span class="ctl-val" id="plTotal">—</span>
            </div>
        `;

        const elPal = $('plPalette');
        const elMap = $('plMapping');
        elPal.value = S.perler.palette;
        elMap.value = S.perler.mapping;

        const recalc = debounce(() => {
            recomputePerler();
            renderPerlerPreview();
        }, 80);

        elPal.addEventListener('change', () => {
            S.perler.palette = elPal.value;
            recalc();
        });
        elMap.addEventListener('change', () => {
            S.perler.mapping = elMap.value;
            recalc();
        });

        // 控件就位后再算第一次
        recomputePerler();
        renderPerlerPreview();

        flowStatus.innerHTML = '确认配色后进入画布，可以在里面继续改单个豆子';
    }

    function renderPixelTo(host) {
        if (!S.grid) return;
        const { cols, rows, rgb, alpha } = S.grid;

        requestAnimationFrame(() => {
            if (!S.grid) return;
            const scale = fitScale(host, cols, rows);
            const c = document.createElement('canvas');
            c.width = cols * scale;
            c.height = rows * scale;
            const ctx = c.getContext('2d');
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const i = y * cols + x;
                    if (alpha[i] === 0) continue;
                    ctx.fillStyle = rgbCss(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
            mountStage(host, c);
        });
    }

    /* ---------- 拼豆化核心 ---------- */

    let paletteCache = { key: '', colors: [], labs: [] };

    function getPalette(key) {
        if (paletteCache.key === key) return paletteCache;
        const arr = (typeof colorSets !== 'undefined' && colorSets[key]) ? colorSets[key] : [];
        const colors = arr.map(c => ({ name: c.name, rgb: c.rgb, hex: rgbHex(c.rgb[0], c.rgb[1], c.rgb[2]) }));
        const labs = colors.map(c => rgbToLab(c.rgb[0], c.rgb[1], c.rgb[2]));
        paletteCache = { key, colors, labs };
        return paletteCache;
    }

    function recomputePerler() {
        if (!S.grid) return;
        const { cols, rows, rgb, alpha } = S.grid;
        const pal = getPalette(S.perler.palette);
        if (!pal.colors.length) return;

        const method = S.perler.mapping;
        const useLab = method === 'cie2000' || method === 'cie2000-smoothed';
        const cache = new Map();
        const codes = new Array(cols * rows);
        const used = new Map();

        function nearest(r, g, b) {
            const ck = (r << 16) | (g << 8) | b;
            const hit = cache.get(ck);
            if (hit !== undefined) return hit;

            let best = 0;
            let bestD = Infinity;

            if (useLab) {
                const lab = rgbToLab(r, g, b);
                for (let i = 0; i < pal.labs.length; i++) {
                    const d = deltaE2000(lab, pal.labs[i]);
                    if (d < bestD) { bestD = d; best = i; }
                }
            } else {
                for (let i = 0; i < pal.colors.length; i++) {
                    const d = calculateColorDistance([r, g, b], pal.colors[i].rgb, method);
                    if (d < bestD) { bestD = d; best = i; }
                }
            }

            const name = pal.colors[best].name;
            cache.set(ck, name);
            return name;
        }

        for (let i = 0; i < cols * rows; i++) {
            if (alpha[i] === 0) {
                codes[i] = '';
                continue;
            }
            const code = nearest(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
            codes[i] = code;
            used.set(code, (used.get(code) || 0) + 1);
        }

        // 大色块优化：去掉孤立单点（只做一轮）
        if (method === 'cie2000-smoothed') {
            smoothCodes(codes, cols, rows, used);
        }

        S.perlerGrid = { cols, rows, codes, used };

        const usedEl = $('plUsed');
        const totalEl = $('plTotal');
        if (usedEl) usedEl.textContent = used.size + ' 色';
        if (totalEl) {
            let n = 0;
            used.forEach(v => n += v);
            totalEl.textContent = n.toLocaleString() + ' 颗';
        }
    }

    function smoothCodes(codes, cols, rows, used) {
        const snapshot = codes.slice();
        const counts = new Map(used);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                const c = snapshot[i];
                if (!c) continue;
                if ((counts.get(c) || 0) > 1) continue;   // 不是孤点

                const nbs = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                        const v = snapshot[ny * cols + nx];
                        if (v && v !== c) nbs.push(v);
                    }
                }
                if (!nbs.length) continue;

                const tally = new Map();
                nbs.forEach(v => tally.set(v, (tally.get(v) || 0) + 1));
                let bestV = nbs[0], bestN = 0;
                tally.forEach((n, v) => { if (n > bestN) { bestN = n; bestV = v; } });

                codes[i] = bestV;
                counts.set(c, counts.get(c) - 1);
                counts.set(bestV, counts.get(bestV) + 1);
            }
        }
    }

    /* ---------- 拼豆预览渲染 ---------- */

    function renderPerlerPreview() {
        if (!S.perlerGrid) return;
        const { cols, rows, codes } = S.perlerGrid;
        const pal = getPalette(S.perler.palette);

        const hexOf = new Map();
        pal.colors.forEach(c => hexOf.set(c.name, c.hex));

        requestAnimationFrame(() => {
            if (S.step !== 3 || !S.perlerGrid) return;

            const scale = fitScale(rightBody, cols, rows);
            const c = document.createElement('canvas');
            c.width = cols * scale;
            c.height = rows * scale;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            // 每格至少 13px 才塞得下 3 个字符的色号，否则只出颜色
            const showText = scale >= 13;
            const fontSize = Math.max(6, Math.floor(scale * 0.36));

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const code = codes[y * cols + x];
                    if (!code) continue;

                    const hex = hexOf.get(code) || '#fff';
                    ctx.fillStyle = hex;
                    ctx.fillRect(x * scale, y * scale, scale, scale);

                    if (showText) {
                        ctx.fillStyle = luminanceOf(hex) > 0.62 ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.9)';
                        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(code, x * scale + scale / 2, y * scale + scale / 2 + 0.5);
                    }
                }
            }

            if (scale >= 5) {
                ctx.strokeStyle = 'rgba(0,0,0,.20)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let x = 1; x < cols; x++) {
                    ctx.moveTo(x * scale + .5, 0);
                    ctx.lineTo(x * scale + .5, c.height);
                }
                for (let y = 1; y < rows; y++) {
                    ctx.moveTo(0, y * scale + .5);
                    ctx.lineTo(c.width, y * scale + .5);
                }
                ctx.stroke();
            }

            mountStage(rightBody, c);
            rightMeta.textContent = `${cols} × ${rows} · ${S.perlerGrid.used.size} 色`;
        });
    }

    function luminanceOf(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    /* =========================================================
     * 10. 进入编辑器
     * ========================================================= */

    function toEditor() {
        if (!S.perlerGrid) return;
        const pal = getPalette(S.perler.palette);
        const hexOf = new Map();
        pal.colors.forEach(c => hexOf.set(c.name, c.hex));

        const colors = {};
        S.perlerGrid.used.forEach((_, code) => {
            if (hexOf.has(code)) colors[code] = hexOf.get(code);
        });

        const doc = {
            v: 2,
            cols: S.perlerGrid.cols,
            rows: S.perlerGrid.rows,
            grid: S.perlerGrid.codes,
            palette: S.perler.palette,
            colors,
            beadSize: 30,
            name: S.srcName.replace(/\.[^.]+$/, '') || '未命名图纸'
        };

        try {
            sessionStorage.setItem('perlerDoc', JSON.stringify(doc));
        } catch (e) {
            toast('图纸太大，存不进浏览器缓存');
            return;
        }
        location.href = 'editor.html';
    }

    /* =========================================================
     * 11. 事件绑定
     * ========================================================= */

    $('btnImport').addEventListener('click', () => fileInput.click());
    $('btnBlank').addEventListener('click', () => {
        location.href = 'editor.html?new=1';
    });

    fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (f) loadFile(f);
        fileInput.value = '';
    });

    btnNext.addEventListener('click', () => {
        if (S.step === 1) {
            buildFig1();
            goStep(2);
        } else if (S.step === 2) {
            if (!S.grid) recomputePixel();
            goStep(3);
        } else if (S.step === 3) {
            toEditor();
        }
    });

    btnBack.addEventListener('click', () => {
        if (S.step > 1) goStep(S.step - 1);
    });

    btnReset.addEventListener('click', resetAll);

    // 拖拽导入
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        dragDepth++;
        dropOverlay.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });
    window.addEventListener('dragleave', (e) => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dropOverlay.hidden = true;
    });
    window.addEventListener('drop', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault();
        dragDepth = 0;
        dropOverlay.hidden = true;
        loadFile(e.dataTransfer.files[0]);
    });

    // 尺寸变化 → 重排
    let rzTimer;
    window.addEventListener('resize', () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(() => relayout(), 120);
    });

    /* =========================================================
     * 12. 小提示
     * ========================================================= */

    let toastTimer;
    function toast(msg) {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.style.cssText = `
                position:fixed;left:50%;bottom:34px;transform:translateX(-50%);
                background:#22252B;color:#fff;font-size:13px;padding:10px 18px;
                border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);z-index:999;
                opacity:0;transition:opacity .2s ease, transform .2s ease;pointer-events:none;
            `;
            document.body.appendChild(el);
        }
        el.textContent = msg;
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(-4px)';
        });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%)';
        }, 2200);
    }

    /* =========================================================
     * 13. 启动
     * ========================================================= */

    // 自动化测试用的只读钩子（带 ?debug 才挂，正式页面不暴露）
    if (location.search.includes('debug')) {
        window.__cr = { S, recomputePixel, renderPixelPreview, setTargetsFromBlock, fitTargets, gridInfo };
    }

    goStep(0);

})();
