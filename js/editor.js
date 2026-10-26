/* =============================================================
 * editor.js — 无限画布编辑器
 *
 * 数据模型：
 *   doc.grid 是扁平的色号数组，长度 cols*rows，'' 表示透明格。
 *   view 是相机：屏幕坐标 = 世界坐标（格子单位）× scale + offset
 *
 * 依赖（全局）：colorSets / rgbToLab / deltaE2000
 * ============================================================= */

(() => {
    'use strict';

    /* =========================================================
     * 0. 常量 / 工具
     * ========================================================= */

    const MAX_UNDO = 40;
    const STORAGE_KEY = 'perler.designs';
    const SESSION_KEY = 'perlerDoc';

    const $ = (id) => document.getElementById(id);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16)
        ];
    }

    function luminance(hex) {
        const [r, g, b] = hexToRgb(hex);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function toast(msg) {
        let el = $('edToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'edToast';
            el.style.cssText = `
                position:fixed;left:50%;bottom:70px;transform:translateX(-50%) translateY(6px);
                background:#22252B;color:#fff;font-size:12.8px;padding:9px 17px;
                border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.22);z-index:999;
                opacity:0;transition:opacity .2s, transform .2s;pointer-events:none;white-space:nowrap;
            `;
            document.body.appendChild(el);
        }
        el.textContent = msg;
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
        });
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(6px)';
        }, 2000);
    }

    /* =========================================================
     * 1. 文档
     * ========================================================= */

    /* ---------------------------------------------------------
     * 世界 / 区域
     *
     * 坐标系说明（改多区域时踩过的地方，先写清楚）：
     *   世界坐标 = 格子整数坐标，可以为负。格 (x,y) 占 [x,x+1]×[y,y+1]。
     *   屏幕坐标 = 世界坐标 × view.scale + (view.x, view.y)
     *
     *   D 不是"整个文档"，而是"**当前区域**的别名"：
     *     D.grid  → region.cells（同一个数组引用，不拷贝）
     *     D.cols  → region.w
     *     D.rows  → region.h
     *     D.x/y   → region 左上角的世界坐标
     *
     *   这么设计是为了让 D.x=D.y=0 时，整个编辑器（44 处 D.grid[...]
     *   和 250 处 D.cols/D.rows）行为与"单图纸"时代完全一致，
     *   多区域只是把 D 重新绑定到另一个 region 上。
     * --------------------------------------------------------- */

    const W = {
        nextId: 1,
        regions: []
    };

    // 区域边框/标签的取色顺序（避开调色板里常用的豆子色，免得看不出来）
    const REGION_COLORS = [
        '#185FA5', '#0F6E56', '#854F0B', '#993556',
        '#534AB7', '#A32D2D', '#3B6D11', '#0C447C'
    ];

    const D = {
        id: 0,
        x: 0,               // 区域左上角世界坐标（多区域时非 0）
        y: 0,
        cols: 29,
        rows: 29,
        grid: [],
        palette: 'mard221',
        name: '未命名图纸'
    };

    function makeRegion(x, y, w, h, name) {
        return {
            id: W.nextId++,
            x, y, w, h,
            cells: new Array(w * h).fill(''),
            color: REGION_COLORS[(W.nextId - 2) % REGION_COLORS.length],
            name: name || '未命名图纸',
            createdAt: Date.now(),
            // 3D 里的实例变换：位置 / 旋转 / 水平镜像
            local: { pos: [0, 0, 0], rot: [0, 0, 0], flipX: false }
        };
    }

    // 把 D 重新指向某个区域（D.cells/grid 是同一个数组引用，改哪边都是改它）
    function bindRegion(r) {
        D.id = r.id;
        D.x = r.x;
        D.y = r.y;
        D.cols = r.w;
        D.rows = r.h;
        D.grid = r.cells;
        D.name = r.name;
    }

    // 把 D 上被改过的元信息写回区域。
    // cells 也要写：改画布尺寸时会换一个新数组（rebuildGrid），不跟就会留两份数据。
    function syncRegionMeta() {
        const r = regionById(D.id);
        if (!r) return;
        r.x = D.x;
        r.y = D.y;
        r.w = D.cols;
        r.h = D.rows;
        r.cells = D.grid;
        r.name = D.name;
    }

    function regionById(id) {
        for (let i = 0; i < W.regions.length; i++) {
            if (W.regions[i].id === id) return W.regions[i];
        }
        return null;
    }

    /* ---------------------------------------------------------
     * 坐标系约定（全文件只有这一处转换，别再手写减法）
     *
     *   世界坐标 world：无限画布上的整数格坐标，可以是负数。
     *     指针交互、hover、多边形顶点、拖拽路径、草稿区都用它。
     *
     *   局部坐标 local：当前区域内的 0..cols / 0..rows。
     *     D.grid、选区遮罩、区域内部遍历都用它。
     *
     *   toLocal(wc,wr)  世界 → 局部（纯平移，不查边界）
     *   localOf(wc,wr)  世界 → 局部（不在当前区域内返回 null）
     *   gidx(wc,wr)     世界 → D.grid 下标（越界返回 -1）
     * --------------------------------------------------------- */

    /**
     * 世界坐标 → D.grid 的下标。越界返回 -1。
     *
     * D.grid[-1] 是 undefined，跟"空格"读出来一样，所以现有那批
     * `const code = D.grid[gidx(c,r)]; if (!code) continue;`
     * 的写法天然兼容越界，不用到处加判断。
     *
     * 注意：参数是**世界坐标**。区域内部的局部坐标要自己减 D.x/D.y。
     */
    function gidx(c, r) {
        const lx = c - D.x;
        const ly = r - D.y;
        if (lx < 0 || ly < 0 || lx >= D.cols || ly >= D.rows) return -1;
        return ly * D.cols + lx;
    }

    /** 世界坐标 → 当前区域的局部坐标（纯平移，不管有没有越界）。 */
    function toLocal(wc, wr) {
        return { c: wc - D.x, r: wr - D.y };
    }

    /**
     * 局部坐标 → D.grid / 选区遮罩的下标。
     *
     * D.grid 和 state.select.mask 都是 cols*rows 的紧凑数组，
     * 所以区域内一律用局部坐标 + 这个函数取下标，别再手写 r * D.cols + c。
     */
    function lidx(c, r) {
        return r * D.cols + c;
    }

    /**
     * 世界坐标 → 当前区域的局部坐标。不在区域内返回 null。
     *
     * 选区 mask 跟 D.grid 同尺寸（天然按局部下标排），所以从指针进来的
     * 世界坐标要先过这里再进选区那一套。
     */
    function localOf(wc, wr) {
        const c = wc - D.x;
        const r = wr - D.y;
        if (c < 0 || r < 0 || c >= D.cols || r >= D.rows) return null;
        return { c, r };
    }

    // D 当前指向的区域对象（cells 与 D.grid 是同一个数组引用）
    function currentRegion() {
        return regionById(D.id);
    }

    // 命中的区域（后加的在上层，所以倒着找）
    function regionAt(wx, wy) {
        for (let i = W.regions.length - 1; i >= 0; i--) {
            const r = W.regions[i];
            if (wx >= r.x && wy >= r.y && wx < r.x + r.w && wy < r.y + r.h) return r;
        }
        return null;
    }

    // 全部区域的外接矩形（小窗和相机适配用）
    function worldBounds() {
        if (!W.regions.length) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const r of W.regions) {
            if (r.x < x0) x0 = r.x;
            if (r.y < y0) y0 = r.y;
            if (r.x + r.w > x1) x1 = r.x + r.w;
            if (r.y + r.h > y1) y1 = r.y + r.h;
        }
        return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    }

    // 接管当前 D 里的内容当成第一个区域（不拷贝数组）
    function ensureRegion() {
        if (W.regions.length) return W.regions[0];
        const r = makeRegion(0, 0, D.cols, D.rows, D.name);
        r.cells = D.grid;
        W.regions.push(r);
        bindRegion(r);
        return r;
    }

    // 调色板缓存：code -> { code, hex, rgb, series }
    let PAL = [];
    let PAL_MAP = new Map();

    function buildPalette(key) {
        const raw = (typeof colorSets !== 'undefined' && colorSets[key]) ? colorSets[key] : [];
        PAL = raw.map(c => {
            const hex = '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('');
            return {
                code: c.name,
                hex,
                rgb: c.rgb,
                series: (c.name.match(/^[A-Za-z]+/) || [''])[0].toUpperCase()
            };
        });
        PAL_MAP = new Map(PAL.map(p => [p.code, p]));
    }

    /* =========================================================
     * 1b. 持久化：World ↔ 存储层
     *
     * 存的是**整个世界**，不只是当前区域：
     *   - 全部区域（位置/尺寸/内容/颜色/名字）
     *   - 草稿区（区域外的散画）
     *   - 当前区域 id
     *   - 相机位置与缩放
     *
     * 自动保存：任何改动 → 标脏 → 1s 后写一次。
     * 存不进去也不能崩，存储层自己降级（IndexedDB → localStorage）。
     * ========================================================= */

    const AUTOSAVE_DELAY = 1000;      // 停手 1 秒才写
    let saveTimer = null;
    let savePending = false;
    let saveEnabled = true;           // 整个自动保存的开关
    let saveSlot = 'current';         // 存到哪个槽位（current / demo）
    let restoredFromStore = false;    // 本次是不是从存档恢复的

    /** 把当前世界拍成一份可结构化克隆的普通对象。 */
    function serializeWorld() {
        return {
            v: 1,
            nextId: W.nextId,
            curId: D.id,
            regions: W.regions.map(r => ({
                id: r.id,
                x: r.x, y: r.y, w: r.w, h: r.h,
                cells: r.cells.slice(),
                color: r.color,
                name: r.name,
                createdAt: r.createdAt,
                local: r.local ? {
                    pos: (r.local.pos || []).slice(),
                    rot: (r.local.rot || []).slice(),
                    flipX: !!r.local.flipX
                } : null
            })),
            drafts: serializeDrafts(),
            view: { x: view.x, y: view.y, scale: view.scale },
            palette: D.palette,
            savedAt: Date.now()
        };
    }

    /**
     * 用一份存档把整个世界恢复回来。
     * 存档结构不对就返回 false（宁可空白也别画出错乱的东西）。
     */
    function restoreWorld(data) {
        if (!data || !Array.isArray(data.regions) || !data.regions.length) return false;

        const regs = [];
        for (const r of data.regions) {
            if (!r || typeof r.x !== 'number' || typeof r.y !== 'number') return false;
            const w = Math.max(1, r.w | 0);
            const h = Math.max(1, r.h | 0);
            let cells = Array.isArray(r.cells) ? r.cells.slice(0, w * h) : [];
            while (cells.length < w * h) cells.push('');
            regs.push({
                id: r.id,
                x: r.x | 0, y: r.y | 0, w, h,
                cells,
                color: r.color || REGION_COLORS[0],
                name: r.name || '未命名图纸',
                createdAt: r.createdAt || Date.now(),
                local: r.local ? {
                    pos: (r.local.pos || [0, 0, 0]).slice(),
                    rot: (r.local.rot || [0, 0, 0]).slice(),
                    flipX: !!r.local.flipX
                } : { pos: [0, 0, 0], rot: [0, 0, 0], flipX: false }
            });
        }

        // id 必须唯一，否则 regionById 会指错
        const seen = new Set();
        for (const r of regs) {
            while (seen.has(r.id)) r.id++;
            seen.add(r.id);
        }

        W.regions = regs;
        W.nextId = Math.max(
            Number(data.nextId) || 1,
            regs.reduce((m, r) => Math.max(m, r.id + 1), 1)
        );

        // 草稿区
        loadDrafts(Array.isArray(data.drafts) ? data.drafts : []);

        // 调色板（要先建 PAL_MAP，后面的色号校验要用）
        buildPalette(data.palette || 'mard221');
        D.palette = data.palette || 'mard221';

        // 色号不在当前色卡里的格子清空，避免画出一堆认不出的颜色
        for (const r of regs) {
            for (let i = 0; i < r.cells.length; i++) {
                const code = r.cells[i];
                if (code && !PAL_MAP.has(code)) r.cells[i] = '';
            }
        }

        // 相机
        if (data.view && typeof data.view.x === 'number') {
            view.x = data.view.x;
            view.y = data.view.y;
            view.scale = clamp(data.view.scale || view.scale, 3, 80);
        }

        // 绑定当前区域
        const cur = regionById(data.curId) || regs[0];
        if (cur) bindRegion(cur);

        return true;
    }

    /** 标脏：停手 AUTOSAVE_DELAY 毫秒后写一次。 */
    function markDirty() {
        if (!saveEnabled) return;
        savePending = true;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            flushSave();
        }, AUTOSAVE_DELAY);
    }

    /** 撤销一次待写（"打开"不算改动，不该触发保存）。 */
    function cancelPendingSave() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        savePending = false;
    }

    /** 立刻写一次（不等 debounce）。 */
    async function flushSave() {
        if (!saveEnabled) return;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (!savePending) return;
        await saveWorldNow();
    }

    /**
     * 无条件写一次存档（不管有没有 pending 标志）。
     *
     * "从 create.js 交接过来"这种场景要用：交接是一次性的，
     * 读走就得立刻落库，不然刷新之后就没了。
     */
    async function saveWorldNow() {
        if (!saveEnabled) return false;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        savePending = false;
        if (!window.WorldStore) return false;
        try {
            await window.WorldStore.putWorld(serializeWorld(), saveSlot);
            return true;
        } catch (_) {
            return false;        // 存不进去也不能崩
        }
    }

    // 页面藏起来（切标签页 / 关窗口）时抢着存一次
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSave();
    });
    window.addEventListener('pagehide', () => { flushSave(); });

    /**
     * 把当前槽位里的存档挪进"我的图纸"，然后清空槽位。
     *
     * 用户点"新建空白"时调用：上次没保存的活儿不该直接消失，
     * 挪进图纸列表里，用户还能翻出来。
     */
    async function archiveCurrentWorld() {
        if (!window.WorldStore) return;
        try {
            const old = await window.WorldStore.getWorld('current');
            if (!old || !old.regions || !old.regions.length) return;

            // 空世界不值得备份
            let filled = 0;
            for (const r of old.regions) {
                for (const c of (r.cells || [])) if (c) { filled++; break; }
            }
            if (!filled) return;

            const rec = {
                id: 'auto_' + Date.now(),
                name: '自动备份 ' + new Date().toLocaleString('zh-CN', { hour12: false }),
                savedAt: Date.now(),
                auto: true,
                world: old
            };
            await window.WorldStore.putDesign(rec);
            await window.WorldStore.clearWorld('current');
        } catch (_) { /* 备份失败也别挡住新建 */ }
    }

    /**
     * 载入文档。三级优先级：
     *   1. ?new / ?demo —— 明确要一张新的，不读任何存档
     *   2. sessionStorage 的 perlerDoc —— create.js 刚传过来的图纸（一次性交接）
     *   3. IndexedDB 里的会话 —— 上次没关干净的活儿
     *   4. 空画布
     *
     * 第 2 级读完就删掉：不然用户刷新一次，
     * 交接过来的旧图纸会把刷新后新画的东西盖回去。
     */
    async function loadDoc() {
        const params = new URLSearchParams(location.search);
        const wantNew = !!params.get('new');
        const wantDemo = !!params.get('demo');

        // ?demo 是示例：存到独立槽位，不污染用户自己的活儿
        saveSlot = wantDemo ? 'demo' : 'current';
        saveEnabled = !wantDemo;

        if (wantNew || wantDemo) {
            const n = wantDemo ? 29 : Number(params.get('cols') || 29);
            D.cols = clamp(n, 5, 200);
            D.rows = clamp(Number(params.get('rows') || n), 5, 200);
            D.palette = 'mard221';
            D.grid = new Array(D.cols * D.rows).fill('');

            buildPalette(D.palette);

            if (wantDemo) {
                D.name = '示例 · 心';
                drawDemoHeart();
            } else {
                D.name = '未命名图纸';
            }
            ensureRegion();

            // ?new 意味着用户要重新开始：把上次没保存的活儿挪进"我的图纸"存一份，
            // 别直接冲掉——万一用户是点错了，还能找回来
            if (wantNew) await archiveCurrentWorld();

            return;
        }

        // 2. create.js 的交接（sessionStorage）
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
            try {
                const d = JSON.parse(raw);
                D.cols = d.cols;
                D.rows = d.rows;
                D.grid = d.grid;
                D.palette = d.palette || 'mard221';
                D.name = d.name || '未命名图纸';
                buildPalette(D.palette);

                // 补齐色卡里可能缺的色号
                D.grid = D.grid.map(code => (code && !PAL_MAP.has(code)) ? '' : code);
                ensureRegion();

                // 消费掉这次交接
                sessionStorage.removeItem(SESSION_KEY);

                // 立刻把交接内容落进 IndexedDB。
                // 这一步很关键：交接是一次性的（读走就删），
                // 但用户刷新后还得看到同一份图纸 —— 靠的就是这份存档。
                // 同时用户接着画的改动也会更新它，
                // 不会被那份过期的交接内容盖回去。
                await saveWorldNow();

                return;
            } catch (_) { }
        }

        // 3. IndexedDB 会话恢复
        if (window.WorldStore) {
            try {
                const saved = await window.WorldStore.getWorld();
                if (saved && restoreWorld(saved)) {
                    restoredFromStore = true;
                    return;
                }
            } catch (_) { }
        }

        // 4. 兜底：空画布
        D.cols = 29;
        D.rows = 29;
        D.grid = new Array(D.cols * D.rows).fill('');
        buildPalette(D.palette);
        ensureRegion();
    }

    function drawDemoHeart() {
        const mid = findCode('A14') || (PAL[0] ? PAL[0].code : '');
        if (!mid) return;
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                const x = (c - (D.cols - 1) / 2) / (D.cols * 0.30);
                // canvas 的 r 向下增大，取负才是数学坐标（心尖朝下）
                const y = -((r - (D.rows - 1) / 2) / (D.rows * 0.34));
                const v = Math.pow(x * x + y * y - 1, 3) - x * x * Math.pow(y, 3);
                if (v <= 0) D.grid[lidx(c, r)] = mid;
            }
        }
    }

    function findCode(prefix) {
        const hit = PAL.find(p => p.code === prefix);
        return hit ? hit.code : null;
    }

    /* =========================================================
     * 2. 状态
     * ========================================================= */

    const state = {
        tool: null,            // 进来先不选工具：次面板显示图纸统计，左键拖动平移
        cmd: null,             // 命令类工具（颜色转换/量化/描边…），在次面板里操作
        color: '',
        lastPicked: '',
        brushSize: 1,
        brushShape: 'square',  // square | round | cross
        emptyColor: '#ffffff', // 空格底色：擦/删掉的格子画布上显示成这个颜色
        hover: null,           // { c, r } 光标所在格，用于笔刷预览
        focus: null,           // 单色提亮：只正常显示这个色号，其余变淡
        select: null,          // { mask, inverse, sb, shape, shapeCount }
        selShape: 'rect',      // rect | lasso | smudge | polygon
        selOp: 'new',          // new | add | sub | inter —— 下一次落笔怎么和已有选区合并
        selSmudge: 3,          // 涂抹选区的笔宽（格），3 = 3×3
        poly: [],              // 多边形正在点的顶点
        polyOp: 'new',         // 多边形开始点第一个顶点时锁定的合并方式
        panning: false,
        spaceDown: false
    };

    // 有笔刷大小概念的工具才画预览框
    const BRUSH_TOOLS = new Set(['brush', 'razor', 'chainRazor']);

    const view = { x: 0, y: 0, scale: 22 };
    let refScale = 22;          // 缩放百分比的基准（适应窗口 = 100%）

    const canvas = $('board');
    const vp = $('viewport');
    const ctx = canvas.getContext('2d');

    let dpr = 1;

    /* =========================================================
     * 3. 视图
     * ========================================================= */

    let lastVpW = 0;
    let lastVpH = 0;

    function resizeCanvas() {
        const w = vp.clientWidth;
        const h = vp.clientHeight;

        // 容器尺寸变了（侧栏/次面板收起展开），把视图挪半个差值，
        // 图纸保持在眼睛看到的中间，不会突然偏到一边
        if (lastVpW && lastVpH && (lastVpW !== w || lastVpH !== h)) {
            view.x += (w - lastVpW) / 2;
            view.y += (h - lastVpH) / 2;
        }
        lastVpW = w;
        lastVpH = h;

        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
    }

    function fitView() {
        const w = vp.clientWidth;
        const h = vp.clientHeight;
        // 手机上留白收到 18：画布本来就窄，再留 56 等于把图纸缩一半
        const pad = window.innerWidth <= 760 ? 18 : 56;
        const s = Math.min((w - pad * 2) / D.cols, (h - pad * 2) / D.rows);
        view.scale = clamp(s, 4, 64);
        view.x = (w - D.cols * view.scale) / 2;
        view.y = (h - D.rows * view.scale) / 2;
        refScale = view.scale;      // 适应窗口 = 100%
        updateZoomLabel();
        requestRender();
    }

    /**
     * 只重算缩放基准（100% 对应多少），不动相机位置。
     *
     * 从存档恢复时用：相机位置是用户上次自己摆的，得留着；
     * 但窗口尺寸可能变了，"100%" 的含义得按新窗口重算。
     */
    function fitViewScaleOnly() {
        const w = vp.clientWidth;
        const h = vp.clientHeight;
        const pad = window.innerWidth <= 760 ? 18 : 56;
        const s = Math.min((w - pad * 2) / D.cols, (h - pad * 2) / D.rows);
        refScale = clamp(s, 4, 64);
    }

    function zoomAt(factor, sx, sy) {
        const before = {
            wx: (sx - view.x) / view.scale,
            wy: (sy - view.y) / view.scale
        };
        view.scale = clamp(view.scale * factor, 3, 80);
        view.x = sx - before.wx * view.scale;
        view.y = sy - before.wy * view.scale;
        updateZoomLabel();
        requestRender();
    }

    function updateZoomLabel() {
        $('zoomVal').textContent = Math.round(view.scale / refScale * 100) + '%';
    }

    let raf = null;
    function requestRender() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            draw();
        });
    }

    /* =========================================================
     * 4. 绘制
     * ========================================================= */

    /**
     * 无限背景网格。
     *
     * 区域外也要有格子感——否则平移出去就是一片空白，用户不知道自己还在不在
     * 画布上，也不知道离图纸多远。这条网格只负责"感觉"，不承载任何数据。
     *
     * 间距按缩放分级：格子小的时候跳 5 格画，再小就不画
     * （每格都画会糊成一片灰，反而更脏）。
     */
    function drawWorldGrid(W, H, cell) {
        const step = cell >= 12 ? 1 : (cell >= 6 ? 5 : 0);
        if (!step) return;

        // 屏幕四边对应的世界坐标（可以为负）
        const w0 = -view.x / cell;
        const w1 = (W - view.x) / cell;
        const h0 = -view.y / cell;
        const h1 = (H - view.y) / cell;

        // 数量保护：极端缩放 + 超宽屏时别把几万条线全画出来
        if ((w1 - w0) / step > 900 || (h1 - h0) / step > 900) return;

        const startC = Math.floor(w0 / step) * step;
        const startR = Math.floor(h0 / step) * step;

        ctx.save();
        ctx.strokeStyle = step === 1 ? 'rgba(20,22,26,.055)' : 'rgba(20,22,26,.085)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = startC; c * cell + view.x <= W; c += step) {
            const x = Math.round(view.x + c * cell) + .5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
        }
        for (let r = startR; r * cell + view.y <= H; r += step) {
            const y = Math.round(view.y + r * cell) + .5;
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 画一颗豆子。x/y 是格子左上角的屏幕坐标。
     * 区域内的豆子和草稿区的豆子共用这一套画法，两边看起来才一致。
     */
    function drawBead(x, y, cell, code, drawCodes) {
        const p = PAL_MAP.get(code);
        if (!p) return;

        // 单色提亮：非目标色统一画成淡灰，保留形状但不抢眼
        if (state.focus && code !== state.focus) {
            ctx.fillStyle = '#E7E8EC';
            if (cell >= 10) {
                ctx.beginPath();
                roundRect(ctx, x + 0.5, y + 0.5, cell - 1, cell - 1, Math.min(cell * 0.22, 4));
                ctx.fill();
            } else {
                ctx.fillRect(x, y, cell, cell);
            }
            return;
        }

        ctx.fillStyle = p.hex;
        if (cell >= 10) {
            ctx.beginPath();
            const rad = Math.min(cell * 0.22, 4);
            roundRect(ctx, x + 0.5, y + 0.5, cell - 1, cell - 1, rad);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, cell, cell);
        }

        if (drawCodes) {
            ctx.fillStyle = luminance(p.hex) > 0.62 ? 'rgba(0,0,0,.68)' : 'rgba(255,255,255,.82)';
            ctx.font = `600 ${Math.floor(cell * 0.34)}px system-ui, -apple-system, sans-serif`;
            ctx.fillText(code, x + cell / 2, y + cell / 2 + 0.5);
        }
    }

    /**
     * 画草稿区（区域外的散画）。
     * 按块遍历，只碰有内容的块，所以草稿再多也不会拖慢平移。
     * 整体压到 0.8 不透明度：一眼能看出"这些还不是图纸"，跟区域里的成品区分开。
     */
    function drawDrafts(cell, W, H) {
        if (!drafts.size) return;

        const c0 = Math.floor(-view.x / cell);
        const c1 = Math.ceil((W - view.x) / cell);
        const r0 = Math.floor(-view.y / cell);
        const r1 = Math.ceil((H - view.y) / cell);

        const bx0 = Math.floor(c0 / DRAFT_CHUNK), bx1 = Math.floor(c1 / DRAFT_CHUNK);
        const by0 = Math.floor(r0 / DRAFT_CHUNK), by1 = Math.floor(r1 / DRAFT_CHUNK);

        const drawCodes = cell >= 20;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let cy = by0; cy <= by1; cy++) {
            for (let cx = bx0; cx <= bx1; cx++) {
                const ch = drafts.get(draftChunkKey(cx, cy));
                if (!ch) continue;
                const baseX = cx * DRAFT_CHUNK;
                const baseY = cy * DRAFT_CHUNK;

                for (const [li, code] of ch) {
                    const wx = baseX + (li % DRAFT_CHUNK);
                    const wy = baseY + Math.floor(li / DRAFT_CHUNK);
                    if (wx < c0 || wx >= c1 || wy < r0 || wy >= r1) continue;
                    drawBead(view.x + wx * cell, view.y + wy * cell, cell, code, drawCodes);
                }
            }
        }
        ctx.restore();
    }

    function draw() {
        // 用 backing store 的尺寸而不是容器尺寸：侧栏/次面板做宽度动画时容器尺寸每帧都在变，
        // 这里跟着位图走，画面不会画到画布外面
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // 背景
        ctx.fillStyle = '#F1F2F5';
        ctx.fillRect(0, 0, W, H);

        const cell = view.scale;
        const ox = view.x;          // 世界原点的屏幕位置
        const oy = view.y;
        // 当前区域左上角的屏幕位置（多区域时 D.x/D.y 不为 0）
        const rx = ox + D.x * cell;
        const ry = oy + D.y * cell;
        const boardW = D.cols * cell;
        const boardH = D.rows * cell;

        // 无限背景网格：区域外也铺格子
        drawWorldGrid(W, H, cell);
        // 草稿（区域外的散画）：压在网格上面、区域底板下面
        drawDrafts(cell, W, H);

        // 画布投影 + 底板：底板颜色 = 空格底色
        const emptyHex = state.emptyColor || '#ffffff';
        const emptyLight = luminance(emptyHex) > 0.955;
        ctx.save();
        ctx.shadowColor = 'rgba(20,22,26,.16)';
        ctx.shadowBlur = 26;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = emptyHex;
        ctx.fillRect(rx, ry, boardW, boardH);
        ctx.restore();

        // 可见范围（世界坐标，且裁到区域内部）
        const c0 = Math.max(D.x, Math.floor(-ox / cell));
        const c1 = Math.min(D.x + D.cols, Math.ceil((W - ox) / cell));
        const r0 = Math.max(D.y, Math.floor(-oy / cell));
        const r1 = Math.min(D.y + D.rows, Math.ceil((H - oy) / cell));

        // 空格底纹：底色很浅时叠一层极淡棋盘格，能区分「空」和「白豆」；深底色就不叠
        if (cell >= 5 && emptyLight) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(rx, ry, boardW, boardH);
            ctx.clip();
            const t = cell;
            for (let r = r0; r < r1; r++) {
                for (let c = c0; c < c1; c++) {
                    if (D.grid[gidx(c, r)]) continue;
                    if ((r + c) % 2 === 0) continue;
                    ctx.fillStyle = 'rgba(20,22,26,.028)';
                    ctx.fillRect(ox + c * cell, oy + r * cell, t, t);
                }
            }
            ctx.restore();
        }

        // 豆子（区域内）
        const drawCodes = cell >= 20;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = r0; r < r1; r++) {
            for (let c = c0; c < c1; c++) {
                const code = D.grid[gidx(c, r)];
                if (!code) continue;
                drawBead(ox + c * cell, oy + r * cell, cell, code, drawCodes);
            }
        }

        // 网格线
        if (cell >= 6) {
            ctx.strokeStyle = 'rgba(20,22,26,.10)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let c = c0; c <= c1; c++) {
                const x = Math.round(ox + c * cell) + .5;
                ctx.moveTo(x, ry);
                ctx.lineTo(x, ry + boardH);
            }
            for (let r = r0; r <= r1; r++) {
                const y = Math.round(oy + r * cell) + .5;
                ctx.moveTo(rx, y);
                ctx.lineTo(rx + boardW, y);
            }
            ctx.stroke();

            // 大格子线（每 5 格），从区域原点算起，不跟着世界坐标漂
            if (cell * 5 >= 30) {
                ctx.strokeStyle = 'rgba(20,22,26,.26)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let c = D.x; c <= D.x + D.cols; c += 5) {
                    const x = Math.round(ox + c * cell) + .5;
                    ctx.moveTo(x, ry);
                    ctx.lineTo(x, ry + boardH);
                }
                for (let r = D.y; r <= D.y + D.rows; r += 5) {
                    const y = Math.round(oy + r * cell) + .5;
                    ctx.moveTo(rx, y);
                    ctx.lineTo(rx + boardW, y);
                }
                ctx.stroke();
            }
        }

        // 画布边框
        ctx.strokeStyle = 'rgba(20,22,26,.30)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + .5, ry + .5, boardW - 1, boardH - 1);

        // 坐标（编号从区域左上角算，1 起）
        if (cell >= 14) {
            ctx.fillStyle = 'rgba(20,22,26,.42)';
            ctx.font = `500 ${clamp(cell * 0.34, 9, 12)}px system-ui, sans-serif`;
            const coordStep = cell >= 26 ? 1 : 5;

            ctx.textAlign = 'center';
            for (let c = D.x; c < D.x + D.cols; c++) {
                if (coordStep === 5 && ((c - D.x) + 1) % 5 !== 0) continue;
                ctx.fillText(String(c - D.x + 1), ox + c * cell + cell / 2, ry - 7);
            }
            ctx.textAlign = 'right';
            for (let r = D.y; r < D.y + D.rows; r++) {
                if (coordStep === 5 && ((r - D.y) + 1) % 5 !== 0) continue;
                ctx.fillText(String(r - D.y + 1), rx - 8, oy + r * cell + cell / 2);
            }
        }

        // 选区：遮罩底色 + 逐格外轮廓（套索/涂抹/多边形都能画准）
        // 遮罩是**区域局部坐标**（跟 D.grid 同尺寸），所以屏幕位置用区域原点 rx/ry
        if (state.select) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(rx, ry, boardW, boardH);
            ctx.clip();

            ctx.fillStyle = 'rgba(108,76,241,.10)';
            const sel = state.select;
            if (sel.simple && !sel.inverse) {
                // 矩形是最常见的：一个矩形铺底就够，别逐格 4 万次（200×200 的图会卡）
                const b = sel.sb;
                ctx.fillRect(rx + b.c0 * cell, ry + b.r0 * cell,
                    (b.c1 - b.c0 + 1) * cell, (b.r1 - b.r0 + 1) * cell);
            } else {
                // 按行合并连续段：非矩形选区逐格 fillRect 在 200×200 上是 4 万次，
                // 合并后一般只剩几百次
                for (let r = 0; r < D.rows; r++) {
                    let run = -1;
                    for (let c = 0; c <= D.cols; c++) {
                        const on = c < D.cols && inSel(c, r);
                        if (on && run < 0) run = c;
                        else if (!on && run >= 0) {
                            ctx.fillRect(rx + run * cell, ry + r * cell, (c - run) * cell, cell);
                            run = -1;
                        }
                    }
                }
            }

            const segs = selEdges();
            if (segs && segs.length) {
                ctx.beginPath();
                for (let i = 0; i < segs.length; i += 4) {
                    ctx.moveTo(rx + segs[i] * cell, ry + segs[i + 1] * cell);
                    ctx.lineTo(rx + segs[i + 2] * cell, ry + segs[i + 3] * cell);
                }
                ctx.lineCap = 'round';
                ctx.strokeStyle = 'rgba(255,255,255,.92)';   // 白色垫底：深色豆子上也看得清
                ctx.lineWidth = 3.6;
                ctx.stroke();
                ctx.strokeStyle = SEL_LINE;
                ctx.lineWidth = 1.8;
                ctx.stroke();
            }
            ctx.restore();
        }

        // 多边形正在点：已确定的边 + 到光标的预览线
        if (state.poly.length && state.tool === 'select') {
            const pts = state.poly;
            const px = p => ox + (p.c + .5) * cell;
            const py = p => oy + (p.r + .5) * cell;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(px(pts[0]), py(pts[0]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i]), py(pts[i]));
            if (state.hover) ctx.lineTo(px(state.hover), py(state.hover));
            if (pts.length >= 3) ctx.lineTo(px(pts[0]), py(pts[0]));
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255,255,255,.9)';
            ctx.lineWidth = 3.4;
            ctx.stroke();
            ctx.strokeStyle = SEL_LINE;
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            for (const p of pts) {
                ctx.beginPath();
                ctx.arc(px(p), py(p), Math.max(2.2, cell * .13), 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.strokeStyle = SEL_LINE;
                ctx.lineWidth = 1.6;
                ctx.stroke();
            }
            ctx.restore();
        }

        // 笔刷预览：逐格画，和 paintAt 用同一份 brushCells
        if (state.hover && !state.panning && BRUSH_TOOLS.has(state.tool) && cell >= 4) {
            const cells = brushCells(state.hover.c, state.hover.r);
            const erasing = state.tool !== 'brush';
            const p = PAL_MAP.get(state.color);

            // 画笔的预览就用选中的那个色，落笔前能直接确认；浅色配深描边、深色配浅描边
            let fill = 'rgba(108,76,241,.18)';
            let stroke = 'rgba(108,76,241,.95)';
            if (erasing) {
                // 擦/删的预览用「空格底色」混一下，擦完是什么样一眼能看到
                const [er, eg, eb] = hexToRgb(state.emptyColor || '#ffffff');
                fill = `rgba(${er},${eg},${eb},.55)`;
                stroke = 'rgba(229,72,77,.95)';
            } else if (p) {
                const [pr, pg, pb] = p.rgb;
                fill = `rgba(${pr},${pg},${pb},.55)`;
                stroke = luminance(p.hex) > 0.62 ? 'rgba(20,22,26,.5)' : 'rgba(255,255,255,.92)';
            }

            ctx.save();
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.4;
            const inset = Math.min(1.2, cell * 0.12);
            for (const [cc, rr] of cells) {
                // cells 是**世界坐标**（相对光标）。区域内看选区，区域外是草稿区（不设作用域）
                const l = localOf(cc, rr);
                const x = ox + cc * cell;
                const y = oy + rr * cell;

                // 选区外：不涂色，画个灰叉 —— 一眼看出作用域挡住了这里
                if (l && !inSel(l.c, l.r)) {
                    if (cell < 7) continue;
                    ctx.save();
                    ctx.strokeStyle = 'rgba(20,22,26,.30)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x + cell * .3, y + cell * .3);
                    ctx.lineTo(x + cell * .7, y + cell * .7);
                    ctx.moveTo(x + cell * .7, y + cell * .3);
                    ctx.lineTo(x + cell * .3, y + cell * .7);
                    ctx.stroke();
                    ctx.restore();
                    continue;
                }

                ctx.fillRect(x, y, cell, cell);
                ctx.strokeRect(x + inset / 2, y + inset / 2, cell - inset, cell - inset);
            }
            ctx.restore();
        }

        syncBoardFrame();

        // 小窗跟着视口一起更新（独立的 DOM canvas，不进主画布像素）
        drawMinimap();
    }

    /* =========================================================
     * 4b. 画布尺寸：拖四边 / 四角 与 面板填数字走同一条通道
     * =========================================================
     * 拼豆画布的"大小"就是格子数。改尺寸只动 cols/rows，已画的内容
     * 按相反方向钉住：拖右边 → 左边不动；拖左边 → 右边不动、内容整体右移。
     * 往回缩时被裁掉的格子是真丢了（可以撤销）。
     */

    const MIN_BOARD = 5;
    const MAX_BOARD = 200;
    const BEAD_MM = 5;              // 标准拼豆直径 5mm，只用来算成品物理尺寸

    /* 以 base 为源铺出新尺寸的格子数组。dx/dy = 新画布左上角相对旧画布的位移 */
    function rebuildGrid(base, cols, rows, dx, dy) {
        const g = new Array(cols * rows).fill('');
        for (let r = 0; r < base.rows; r++) {
            const tr = r + dy;
            if (tr < 0 || tr >= rows) continue;
            const srow = r * base.cols;
            const trow = tr * cols;
            for (let c = 0; c < base.cols; c++) {
                const v = base.grid[srow + c];
                if (!v) continue;
                const tc = c + dx;
                if (tc < 0 || tc >= cols) continue;
                g[trow + tc] = v;
            }
        }
        return g;
    }

    /* 统一入口：面板输入、预设、手柄松手都走这里。
       opt.snap = false 时不进历史（拖动过程中用） */
    function applyBoardSize(cols, rows, opt = {}) {
        const nc = clamp(Math.round(cols) || MIN_BOARD, MIN_BOARD, MAX_BOARD);
        const nr = clamp(Math.round(rows) || MIN_BOARD, MIN_BOARD, MAX_BOARD);
        if (nc === D.cols && nr === D.rows) return false;

        const dx = opt.dx || 0;
        const dy = opt.dy || 0;
        const c0 = D.cols;
        const r0 = D.rows;

        D.grid = rebuildGrid({ cols: c0, rows: r0, grid: D.grid }, nc, nr, dx, dy);
        D.cols = nc;
        D.rows = nr;
        syncRegionMeta();

        // 选区遮罩跟尺寸绑死（索引全变了），尺寸一动就作废，别留个错位的壳
        state.select = null;
        state.poly = [];

        updateDocMeta();
        syncSizePanel();
        syncSelBar();
        requestRender();

        if (opt.snap !== false) snapshot(opt.label || `画布 ${c0}×${r0} → ${nc}×${nr}`);
        return true;
    }

    /* 画布外框跟着视图走：translate + 宽高，每帧顺手更新，不需要额外监听 */
    function syncBoardFrame() {
        const bf = $('boardFrame');
        if (!bf) return;

        const w = D.cols * view.scale;
        const h = D.rows * view.scale;
        const W = vp.clientWidth;
        const H = vp.clientHeight;
        // 区域左上角（世界原点 + 区域偏移）
        const x = view.x + D.x * view.scale;
        const y = view.y + D.y * view.scale;

        // 缩得太小：手柄会挤成一团，反而不好抓，藏起来用面板改
        if (view.scale < 5 || x > W || y > H || x + w < 0 || y + h < 0) {
            if (!bf.hidden) bf.hidden = true;
            return;
        }
        if (bf.hidden) bf.hidden = false;

        bf.style.width = w + 'px';
        bf.style.height = h + 'px';
        bf.style.transform = `translate(${x}px, ${y}px)`;
        const badge = $('bfBadge');
        if (badge) badge.textContent = `${D.cols} × ${D.rows}`;
    }

    let sizeDrag = null;

    /* =========================================================
     * 4c. 左下角小窗导航（minimap）
     *
     * 无限画布最大的问题是"用户跑丢了"——平移出去就不知道图在哪。
     * 小窗把整个世界压成一张缩略图：
     *   - 每个区域一块色块 + 编号（当前区域画真实缩略图）
     *   - 一个视口框，标出当前正在看哪一块
     *   - 点/拖小窗可以跳到任意位置
     *
     * 独立的 DOM canvas，不画进主画布：
     * 主画布的像素要留给回归对比，混进去就把基线搅脏了。
     *
     * 小窗自己的坐标系：左上角为原点，w/h 是 CSS 像素尺寸。
     * 跟世界坐标的换算靠 miniMap.s（格→小窗像素）+ miniMap.ox/oy（偏移）。
     * ========================================================= */

    const MINI_PAD = 4;             // 小窗内边距

    const miniMap = {
        canvas: null,
        ctx: null,
        w: 0, h: 0, dpr: 1,
        s: 1,                          // 小窗像素 / 世界格
        ox: 0, oy: 0,                  // 世界坐标 → 小窗坐标的偏移
        bounds: null,                  // 本次用的世界范围
        drag: null                     // 拖动跳转中
    };

    // 每个区域的缩略图缓存：区域 id → { canvas, ver }
    // ver 是区域内容的版本号，内容没变就不重画（省 CPU）
    const miniThumbs = new Map();

    function miniSetup() {
        const cv = $('minimapCanvas');
        if (!cv) return;
        miniMap.canvas = cv;
        miniMap.ctx = cv.getContext('2d');

        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = cv.clientWidth || 152;
            const h = cv.clientHeight || 66;
            if (cv.width === Math.round(w * dpr) && cv.height === Math.round(h * dpr)) return;
            cv.width = Math.round(w * dpr);
            cv.height = Math.round(h * dpr);
            miniMap.w = w;
            miniMap.h = h;
            miniMap.dpr = dpr;
            miniMap.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // 尺寸变了，缩略图缓存里的画布尺寸也不对
            miniThumbs.clear();
            drawMinimap();
        };

        // 小窗自己吃掉指针事件，别让画布那边以为在画画
        cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            miniMap.drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
            cv.setPointerCapture(e.pointerId);
            miniJumpTo(e);
        });

        cv.addEventListener('pointermove', (e) => {
            if (!miniMap.drag) return;
            e.preventDefault();
            miniJumpTo(e);
        });

        const endMini = (e) => {
            if (!miniMap.drag) return;
            miniMap.drag = null;
            try { cv.releasePointerCapture(e.pointerId); } catch (_) { }
        };
        cv.addEventListener('pointerup', endMini);
        cv.addEventListener('pointercancel', endMini);

        resize();
        new ResizeObserver(resize).observe(cv);
        window.addEventListener('resize', resize);
    }

    /**
     * 小窗点/拖 → 把视口挪到对应的世界位置。
     *
     * 落在小窗外面（越界箭头那块）时，钳到边缘：这时候用户的意思是
     * "往那个方向走"，不是"精确到那一格"。
     */
    function miniJumpTo(e) {
        const b = miniMap.bounds;
        if (!b) return;
        const rect = miniMap.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        // 小窗像素 → 世界坐标
        const wx = (px - miniMap.ox) / miniMap.s;
        const wy = (py - miniMap.oy) / miniMap.s;

        miniJumpToWorld(wx, wy);
    }

    /**
     * 把视口挪到指定的世界坐标（让该点落在视口中心）。
     *
     * 落在区域并集外面时，钳到最近的边缘：这时候用户的意思是
     * "往那个方向走"，不是"精确到那一格"。
     */
    function miniJumpToWorld(wx, wy) {
        const b = miniMap.bounds;
        if (!b) return;

        // 点在区域外：钳到最近的区域边缘，别跳到虚空里
        wx = clamp(wx, b.x0 - 2, b.x1 + 2);
        wy = clamp(wy, b.y0 - 2, b.y1 + 2);

        // 让点击处落在视口中心
        const vpW = vp.clientWidth;
        const vpH = vp.clientHeight;
        view.x = vpW / 2 - wx * view.scale;
        view.y = vpH / 2 - wy * view.scale;
        requestRender();
    }

    /**
     * 算小窗的映射：世界范围 → 小窗像素。
     *
     * 关键：范围**只按区域并集算**，不把当前视口算进去。
     *
     * 这是最初就定下的口径：无限画布最大的坑是"用户跑丢了"，
     * 小窗存在的意义就是恒定地告诉用户"图纸都在这儿"。
     * 一旦把视口也塞进范围，用户拖得越远，区域在小窗里就越小——
     * 正好在最需要它的时候失效。
     *
     * 视口跑出范围怎么办？钳到边缘 + 在小窗边上画个三角箭头指方向。
     */
    function miniComputeBounds() {
        const b = worldBounds();
        if (!b) return null;

        // 范围 = 区域并集（不掺视口）
        const x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;

        // 视口的世界范围（看得见的那一块）——只用来画视口框和箭头
        const vpW = vp.clientWidth / view.scale;
        const vpH = vp.clientHeight / view.scale;
        const viewW = {
            x0: -view.x / view.scale, y0: -view.y / view.scale,
            x1: (-view.x) / view.scale + vpW, y1: (-view.y) / view.scale + vpH
        };

        const w = Math.max(1, x1 - x0);
        const h = Math.max(1, y1 - y0);

        const availW = miniMap.w - MINI_PAD * 2;
        const availH = miniMap.h - MINI_PAD * 2;
        const s = Math.min(availW / w, availH / h);

        // 居中
        const ox = MINI_PAD + (availW - w * s) / 2 - x0 * s;
        const oy = MINI_PAD + (availH - h * s) / 2 - y0 * s;

        return { x0, y0, x1, y1, s, ox, oy, region: b, view: viewW };
    }

    /**
     * 区域缩略图：把区域内容画成一张小图。
     *
     * 只有当前区域要真实缩略图（用户得看清自己在画哪块），
     * 其他区域只画色块 + 编号。
     */
    function miniThumb(r) {
        const ver = regionVersion(r);
        const hit = miniThumbs.get(r.id);
        if (hit && hit.ver === ver) return hit.canvas;

        const TW = 64, TH = 64;
        const cv = document.createElement('canvas');
        cv.width = TW;
        cv.height = TH;
        const g = cv.getContext('2d');

        // 区域按比例缩进缩略图
        const cell = Math.min(TW / Math.max(1, r.w), TH / Math.max(1, r.h));
        const dw = r.w * cell;
        const dh = r.h * cell;
        const ox = (TW - dw) / 2;
        const oy = (TH - dh) / 2;

        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, TW, TH);
        for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
                const code = r.cells[y * r.w + x];
                if (!code) continue;
                const p = PAL_MAP.get(code);
                if (!p) continue;
                g.fillStyle = p.hex;
                g.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell), Math.ceil(cell));
            }
        }

        miniThumbs.set(r.id, { ver, canvas: cv });
        return cv;
    }

    // 区域内容版本号：cells 数组引用变了就说明重画过
    function regionVersion(r) {
        if (!r._ver) r._ver = { cells: r.cells, n: 0 };
        if (r._ver.cells !== r.cells) {
            r._ver.cells = r.cells;
            r._ver.n++;
        }
        return r._ver.n;
    }

    function drawMinimap() {
        const g = miniMap.ctx;
        if (!g) return;

        // 注意：这里不能叫 W / H —— 外层的 W 是"世界"（W.regions）。
        const mw = miniMap.w, mh = miniMap.h;
        g.clearRect(0, 0, mw, mh);

        const b = miniComputeBounds();
        miniMap.bounds = b;
        if (!b) return;

        miniMap.s = b.s;
        miniMap.ox = b.ox;
        miniMap.oy = b.oy;

        const toX = (wx) => b.ox + wx * b.s;
        const toY = (wy) => b.oy + wy * b.s;

        // 网格底纹：让人知道这是个无限格子图
        g.strokeStyle = 'rgba(255,255,255,.07)';
        g.lineWidth = 1;
        g.beginPath();
        for (let wx = Math.ceil(b.x0); wx <= b.x1; wx += 5) {
            const x = Math.round(toX(wx)) + .5;
            g.moveTo(x, 0); g.lineTo(x, mh);
        }
        for (let wy = Math.ceil(b.y0); wy <= b.y1; wy += 5) {
            const y = Math.round(toY(wy)) + .5;
            g.moveTo(0, y); g.lineTo(mw, y);
        }
        g.stroke();

        // 区域色块 + 编号
        for (const r of W.regions) {
            const x = toX(r.x);
            const y = toY(r.y);
            const w = Math.max(2, r.w * b.s);
            const h = Math.max(2, r.h * b.s);

            const isCur = r.id === D.id;
            if (isCur) {
                // 当前区域画真实缩略图
                const th = miniThumb(r);
                if (th) {
                    g.save();
                    g.beginPath();
                    g.rect(x, y, w, h);
                    g.clip();
                    g.drawImage(th, x, y, w, h);
                    g.restore();
                }
            } else {
                g.fillStyle = r.color;
                g.globalAlpha = .82;
                g.fillRect(x, y, w, h);
                g.globalAlpha = 1;
            }

            g.strokeStyle = isCur ? '#ffffff' : r.color;
            g.lineWidth = isCur ? 1.6 : 1;
            g.strokeRect(x + .5, y + .5, Math.max(1, w - 1), Math.max(1, h - 1));

            // 编号：区域多了就缩小，但不低于 9px（再小就看不清了）
            const fs = clamp(Math.floor(Math.min(w, h) * .5), 9, 12);
            if (w >= 10 && h >= 10) {
                g.font = `700 ${fs}px system-ui, -apple-system, sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                // 深字 + 白描边：当前区域的缩略图底色是白的，白字等于看不见；
                // 其他区域底色是彩色块，深字才压得住。白描边两边都保底。
                g.lineWidth = 3;
                g.lineJoin = 'round';
                g.strokeStyle = 'rgba(255,255,255,.92)';
                g.strokeText(String(r.id), x + w / 2, y + h / 2);
                g.fillStyle = 'rgba(20,22,26,.92)';
                g.fillText(String(r.id), x + w / 2, y + h / 2);
            }
        }

        // ---- 视口框：钳到区域并集范围内 ----
        const v = b.view;
        const vx = toX(v.x0);
        const vy = toY(v.y0);
        const vw = (v.x1 - v.x0) * b.s;
        const vh = (v.y1 - v.y0) * b.s;

        // 区域并集在小窗里的矩形（范围就是它，所以框超出时钳到这里）
        const bx0 = toX(b.x0), by0 = toY(b.y0);
        const bx1 = toX(b.x1), by1 = toY(b.y1);

        const cx = clamp(vx, bx0, bx1);
        const cy = clamp(vy, by0, by1);
        const cw = clamp(vx + vw, bx0, bx1) - cx;
        const ch = clamp(vy + vh, by0, by1) - cy;

        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.4;
        if (cw > 2 && ch > 2) {
            g.strokeRect(cx + .5, cy + .5, cw - 1, ch - 1);
        } else {
            // 完全在范围外：留一个 4px 的白点当"你在这边"的标记
            g.fillStyle = '#ffffff';
            g.fillRect(cx - 2, cy - 2, 4, 4);
        }

        // 视口跑出区域并集 → 小窗边上画箭头，指图纸那一侧
        miniArrowIfOut(b, v);
    }

    /**
     * 视口跑到区域并集外面时，在小窗边缘画一个三角箭头，
     * 告诉用户"图纸在那个方向"——箭头指向**图纸**那一侧，不是视口自己那侧。
     */
    function miniArrowIfOut(b, v) {
        const g = miniMap.ctx;
        const mw = miniMap.w, mh = miniMap.h;

        // 视口中心 vs 区域并集中心
        const vcx = (v.x0 + v.x1) / 2;
        const vcy = (v.y0 + v.y1) / 2;
        const r = b.region;
        const bcx = (r.x0 + r.x1) / 2;
        const bcy = (r.y0 + r.y1) / 2;

        // 判定用"视口中心"而不是整个视口矩形：
        // 缩得很小时视口比图纸还大，矩形必然超出，但那不是"跑丢"。
        // 真正的跑丢是"我盯着的地方根本没图纸"。
        if (vcx >= r.x0 && vcx <= r.x1 && vcy >= r.y0 && vcy <= r.y1) return;

        const dx = vcx - bcx;
        const dy = vcy - bcy;

        // 要回图纸，该往哪边走？dx>0 = 视口在图纸右边 → 往左走
        let dir;
        if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'left' : 'right';
        else dir = dy > 0 ? 'up' : 'down';

        // 箭头落在小窗边缘，指向 dir 那一侧
        const m = 9;
        let ax, ay, rot;
        if (dir === 'left') { ax = m; ay = mh / 2; rot = Math.PI; }
        else if (dir === 'right') { ax = mw - m; ay = mh / 2; rot = 0; }
        else if (dir === 'up') { ax = mw / 2; ay = m; rot = -Math.PI / 2; }
        else { ax = mw / 2; ay = mh - m; rot = Math.PI / 2; }

        // 箭头颜色跟当前区域一致，一眼知道指的是哪块；描白边保证在暗底上看得见
        const cur = currentRegion();
        g.save();
        g.translate(ax, ay);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(6, 0);
        g.lineTo(-3, -4.5);
        g.lineTo(-3, 4.5);
        g.closePath();
        g.fillStyle = cur ? cur.color : '#ffffff';
        g.globalAlpha = .95;
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.stroke();
        g.restore();
    }

    function boardHandleDown(e) {
        const side = e.currentTarget.dataset.side;
        if (!side) return;
        e.preventDefault();
        e.stopPropagation();

        sizeDrag = {
            side,
            cols0: D.cols,
            rows0: D.rows,
            grid0: D.grid.slice(),
            sx: e.clientX,
            sy: e.clientY,
            vx0: view.x,
            vy0: view.y,
            scale: view.scale
        };

        state.hover = null;
        e.currentTarget.setPointerCapture(e.pointerId);
        $('boardFrame').classList.add('is-resizing');
        requestRender();
    }

    function boardHandleMove(e) {
        const d = sizeDrag;
        if (!d) return;

        const dc = Math.round((e.clientX - d.sx) / d.scale);
        const dr = Math.round((e.clientY - d.sy) / d.scale);

        let cols = d.cols0;
        let rows = d.rows0;
        if (d.side.includes('e')) cols = d.cols0 + dc;
        if (d.side.includes('w')) cols = d.cols0 - dc;
        if (d.side.includes('s')) rows = d.rows0 + dr;
        if (d.side.includes('n')) rows = d.rows0 - dr;

        cols = clamp(cols, MIN_BOARD, MAX_BOARD);
        rows = clamp(rows, MIN_BOARD, MAX_BOARD);
        if (cols === D.cols && rows === D.rows) return;

        // 拖左/拖上时内容要跟着挪，才对得上"从另一侧长出来"
        const dx = d.side.includes('w') ? cols - d.cols0 : 0;
        const dy = d.side.includes('n') ? rows - d.rows0 : 0;

        D.grid = rebuildGrid({ cols: d.cols0, rows: d.rows0, grid: d.grid0 },
            cols, rows, dx, dy);
        D.cols = cols;
        D.rows = rows;
        syncRegionMeta();
        state.select = null;
        state.poly = [];

        // 钉住对侧边缘：右/下那条边不许跟着指针跑
        // TODO(T8)：多区域后这里该改 D.x/D.y 而不是 view.x/view.y，
        //           否则拖动别处的区域会把整个世界推走
        if (dx) view.x = d.vx0 + (d.cols0 - cols) * d.scale;
        if (dy) view.y = d.vy0 + (d.rows0 - rows) * d.scale;

        $('bfBadge').textContent = `${cols} × ${rows}`;
        updateDocMeta();
        syncSizePanel();
        requestRender();
    }

    function boardHandleUp(e) {
        const d = sizeDrag;
        if (!d) return;
        sizeDrag = null;

        $('boardFrame').classList.remove('is-resizing');
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }

        if (D.cols !== d.cols0 || D.rows !== d.rows0) {
            snapshot(`画布 ${D.cols}×${D.rows}`);
            syncSelBar();
            toast(`画布 ${D.cols} × ${D.rows} 格`);
            requestRender();
        }
    }

    document.querySelectorAll('#boardFrame .bf-h').forEach(h => {
        h.addEventListener('pointerdown', boardHandleDown);
        h.addEventListener('pointermove', boardHandleMove);
        h.addEventListener('pointerup', boardHandleUp);
        h.addEventListener('pointercancel', boardHandleUp);
    });

    /* 面板上的尺寸控件（次面板「画布」） */
    function syncSizePanel() {
        const cc = $('sizeCols');
        const rr = $('sizeRows');
        if (cc && document.activeElement !== cc) cc.value = D.cols;
        if (rr && document.activeElement !== rr) rr.value = D.rows;

        const meta = $('sizeMeta');
        if (meta) {
            const w = (D.cols * BEAD_MM / 10).toFixed(1);
            const h = (D.rows * BEAD_MM / 10).toFixed(1);
            meta.textContent = `${D.cols * D.rows} 颗 · 成品约 ${w} × ${h} cm`;
        }

        document.querySelectorAll('#sizePresets .mini-btn').forEach(b => {
            b.classList.toggle('is-on', D.cols === D.rows && D.cols === Number(b.dataset.size));
        });
    }

    function commitSizeInput() {
        const c = clamp(Number($('sizeCols').value) || D.cols, MIN_BOARD, MAX_BOARD);
        const r = clamp(Number($('sizeRows').value) || D.rows, MIN_BOARD, MAX_BOARD);

        if (!applyBoardSize(c, r)) { syncSizePanel(); return; }
        toast(`画布 ${D.cols} × ${D.rows} 格`);

        // 一下子缩很多时图纸会飘到屏幕外，顺手拉回来
        const bw = D.cols * view.scale;
        const bh = D.rows * view.scale;
        if (view.x + bw < 40 || view.y + bh < 40 ||
            view.x > vp.clientWidth - 40 || view.y > vp.clientHeight - 40) fitView();
    }

    ['sizeCols', 'sizeRows'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('focus', () => el.select());
        el.addEventListener('change', commitSizeInput);
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            if (e.key === 'Escape') { syncSizePanel(); el.blur(); }
        });
    });

    if ($('sizePresets')) {
        $('sizePresets').addEventListener('click', e => {
            const b = e.target.closest('[data-size]');
            if (!b) return;
            const n = Number(b.dataset.size);
            if (applyBoardSize(n, n)) {
                toast(`画布 ${n} × ${n} 格`);
                fitView();
            }
        });
    }

    function roundRect(c, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        c.beginPath();
        c.moveTo(x + rr, y);
        c.arcTo(x + w, y, x + w, y + h, rr);
        c.arcTo(x + w, y + h, x, y + h, rr);
        c.arcTo(x, y + h, x, y, rr);
        c.arcTo(x, y, x + w, y, rr);
        c.closePath();
    }

    /* =========================================================
     * 5. 坐标换算
     * ========================================================= */

    function toCell(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        const x = clientX - r.left;
        const y = clientY - r.top;
        return {
            c: Math.floor((x - view.x) / view.scale),
            r: Math.floor((y - view.y) / view.scale)
        };
    }

    // 是否落在当前区域内（**局部坐标**：0..D.cols / 0..D.rows）
    // 世界坐标的越界判断用 gidx() >= 0 或 localOf()，别混用。
    const inBounds = (c, r) => c >= 0 && r >= 0 && c < D.cols && r < D.rows;

    /* ---------------------------------------------------------
     * 草稿区（区域外的格子）
     *
     * 无限画布上区域外也能画，但**只有区域内的内容算图纸**、才会进 3D。
     * 区域外的散画叫草稿：随便画、不占区域、不参与出图。
     *
     * 存储不能开大数组（世界是无限的），按 32×32 分块稀疏存：
     *   drafts: Map<"cx,cy", Map<localIdx, code>>
     * 空块的 Map 会被删掉，所以没有内容的区域零成本。
     * --------------------------------------------------------- */

    const DRAFT_CHUNK = 32;
    const drafts = new Map();

    const draftChunkKey = (cx, cy) => cx + ',' + cy;

    function draftLocal(wx, wy) {
        const cx = Math.floor(wx / DRAFT_CHUNK);
        const cy = Math.floor(wy / DRAFT_CHUNK);
        return {
            cx, cy,
            li: (wy - cy * DRAFT_CHUNK) * DRAFT_CHUNK + (wx - cx * DRAFT_CHUNK)
        };
    }

    function getDraft(wx, wy) {
        const { cx, cy, li } = draftLocal(wx, wy);
        const ch = drafts.get(draftChunkKey(cx, cy));
        return (ch && ch.get(li)) || '';
    }

    function setDraft(wx, wy, code) {
        const { cx, cy, li } = draftLocal(wx, wy);
        const key = draftChunkKey(cx, cy);
        let ch = drafts.get(key);

        if (!code) {
            if (!ch || !ch.has(li)) return false;
            ch.delete(li);
            if (!ch.size) drafts.delete(key);   // 块空了就整块扔掉
            return true;
        }

        if (!ch) { ch = new Map(); drafts.set(key, ch); }
        if (ch.get(li) === code) return false;
        ch.set(li, code);
        return true;
    }

    // 草稿总数（统计面板 / 迁移判断用）
    function draftCount() {
        let n = 0;
        for (const ch of drafts.values()) n += ch.size;
        return n;
    }

    // 紧凑序列化：扁平数组 [wx, wy, code, ...]，撤销栈和持久化都用它
    function serializeDrafts() {
        const out = [];
        for (const [key, ch] of drafts) {
            const [cxs, cys] = key.split(',');
            const cx = Number(cxs), cy = Number(cys);
            const bx = cx * DRAFT_CHUNK, by = cy * DRAFT_CHUNK;
            for (const [li, code] of ch) {
                out.push(bx + (li % DRAFT_CHUNK), by + Math.floor(li / DRAFT_CHUNK), code);
            }
        }
        return out;
    }

    function loadDrafts(flat) {
        drafts.clear();
        if (!flat || !flat.length) return;
        for (let i = 0; i < flat.length; i += 3) {
            setDraft(flat[i], flat[i + 1], flat[i + 2]);
        }
    }

    /* =========================================================
     * 5b. 选区：遮罩模型 + 作用域
     * =========================================================
     * state.select = { mask, inverse, sb, shape, shapeCount, edges }
     *   mask       Uint8Array(cols*rows)，1 = 落在形状里（反转之前）
     *   sb         形状的外接矩形
     *   inverse    反选：mask 之外反而是"选中"
     *
     * 关键约定：所有写格子的路径都要过 inSel()。于是"有选区"就等于
     * "编辑被锁在选区内"——画笔、剃刀、连锁剃刀、填充、命令面板全部一致。
     *
     * 合并方式（对齐 PS 的四个模式）：
     *   new   新选区：替换掉原来那个
     *   add   加选：并集
     *   sub   减选：差集（原来有、这次框到的去掉）
     *   inter 交集：两边都有的留下
     * 拖拽开始时按修饰键定：Shift = 加选，Alt = 减选，Shift+Alt = 交集；
     * 不按修饰键就用面板上选的那个。触屏没有修饰键，只能靠面板。
     */

    const SEL_LINE = '#6C4CF1';

    const SEL_OP_NAME = { new: '新建', add: '加选', sub: '减选', inter: '交集' };

    /* 拖拽开始时决定用哪种合并方式：修饰键优先于面板上的选择，跟 PS 一致。
       PS 里是 Shift=加、Alt=减、Shift+Alt=交，我们也这么来。 */
    function modOp(e) {
        if (!e) return state.selOp || 'new';
        if (e.shiftKey && e.altKey) return 'inter';
        if (e.shiftKey) return 'add';
        if (e.altKey) return 'sub';
        return state.selOp || 'new';
    }

    function selSize() {
        const s = state.select;
        if (!s) return 0;
        return s.inverse ? D.cols * D.rows - s.shapeCount : s.shapeCount;
    }

    // 生效范围（反选时就是整张画布）
    function selBounds() {
        const s = state.select;
        if (!s) return null;
        return s.inverse ? { c0: 0, r0: 0, c1: D.cols - 1, r1: D.rows - 1 } : s.sb;
    }

    /* 唯一的作用域判定：真 = 这一格允许被编辑。
     *
     * 参数是**区域局部坐标**（0..D.cols / 0..D.rows）：选区遮罩跟 D.grid
     * 同尺寸，本来就按局部下标排。指针给的是世界坐标，先用 localOf() 换算再传进来。
     */
    function inSel(c, r) {
        const s = state.select;
        if (!s) return true;
        if (c < 0 || r < 0 || c >= D.cols || r >= D.rows) return false;
        const v = s.mask[lidx(c, r)] === 1;
        return s.inverse ? !v : v;
    }

    function lineCells(a, b, fn) {
        const steps = Math.max(Math.abs(b.c - a.c), Math.abs(b.r - a.r));
        for (let i = 0; i <= steps; i++) {
            const t = steps ? i / steps : 0;
            fn(Math.round(a.c + (b.c - a.c) * t), Math.round(a.r + (b.r - a.r) * t));
        }
    }

    /* 框选。a / b 是**世界坐标**（指针给的），遮罩是区域局部的，所以先平移再裁边。 */
    function rectMask(a, b) {
        const m = new Uint8Array(D.cols * D.rows);
        const la = toLocal(a.c, a.r);
        const lb = toLocal(b.c, b.r);
        const c0 = Math.max(0, Math.min(la.c, lb.c));
        const c1 = Math.min(D.cols - 1, Math.max(la.c, lb.c));
        const r0 = Math.max(0, Math.min(la.r, lb.r));
        const r1 = Math.min(D.rows - 1, Math.max(la.r, lb.r));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) m[lidx(c, r)] = 1;
        }
        return m;
    }

    /* 套索 / 多边形共用：边上的格子全算，再射线法填内部
       pts 是**世界坐标**（指针给的），遮罩是区域局部的，所以先平移。 */
    function polyMask(worldPts) {
        const m = new Uint8Array(D.cols * D.rows);
        if (!worldPts.length) return m;
        const pts = worldPts.map(p => toLocal(p.c, p.r));
        const put = (c, r) => { if (inBounds(c, r)) m[lidx(c, r)] = 1; };
        if (pts.length === 1) { put(pts[0].c, pts[0].r); return m; }

        for (let i = 1; i < pts.length; i++) lineCells(pts[i - 1], pts[i], put);
        if (pts.length >= 3) {
            lineCells(pts[pts.length - 1], pts[0], put);
            for (let r = 0; r < D.rows; r++) {
                for (let c = 0; c < D.cols; c++) {
                    const x = c + .5, y = r + .5;
                    let inside = false;
                    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                        const xi = pts[i].c + .5, yi = pts[i].r + .5;
                        const xj = pts[j].c + .5, yj = pts[j].r + .5;
                        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
                    }
                    if (inside) m[lidx(c, r)] = 1;
                }
            }
        }
        return m;
    }

    /* 涂抹选区。c / r 是**世界坐标**（指针给的），遮罩是区域局部的，所以先平移。 */
    function stampSmudge(mask, wc, wr) {
        const rad = Math.floor((Math.max(1, state.selSmudge) - 1) / 2);
        const l = toLocal(wc, wr);
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                const cc = l.c + dx, rr = l.r + dy;
                if (inBounds(cc, rr)) mask[lidx(cc, rr)] = 1;
            }
        }
    }

    /* 已有选区拍平成实体 mask（反选就地展开），当作布尔运算的左边操作数。
       反选只是省内存的写法，参与加/减/交集时按它"实际生效的样子"算。 */
    function flatMask() {
        const s = state.select;
        if (!s) return null;
        if (!s.inverse) return s.mask;
        const m = new Uint8Array(D.cols * D.rows);
        for (let i = 0; i < m.length; i++) m[i] = s.mask[i] ? 0 : 1;
        return m;
    }

    /* 左（已有）⊗ 右（这次画的） → 新 mask。返回的数组一定是新的或可独占的 */
    function combineMask(base, shape, op) {
        if (op === 'add') {
            if (!base) return shape;
            const out = new Uint8Array(D.cols * D.rows);
            for (let i = 0; i < out.length; i++) out[i] = (base[i] | shape[i]) ? 1 : 0;
            return out;
        }
        if (op === 'sub') {
            // 没有选区可减 = 减完什么都没有（PS 同样行为）
            if (!base) return new Uint8Array(D.cols * D.rows);
            const out = new Uint8Array(D.cols * D.rows);
            for (let i = 0; i < out.length; i++) out[i] = (base[i] && !shape[i]) ? 1 : 0;
            return out;
        }
        if (op === 'inter') {
            // 没有选区时交集＝新建（PS 也是这个结果）
            if (!base) return shape;
            const out = new Uint8Array(D.cols * D.rows);
            for (let i = 0; i < out.length; i++) out[i] = (base[i] & shape[i]) ? 1 : 0;
            return out;
        }
        return shape;   // new
    }

    /* 提交选区。base 显式给：拖拽中必须用「落下前的快照」，
       不然第二次移动就是把上次的合并结果再合并一遍，越拖越大。 */
    function commitSelect(shapeMask, shape, op = 'new', base, keepEmpty) {
        const left = base !== undefined ? base : (op === 'new' ? null : flatMask());
        const mask = combineMask(left, shapeMask, op);

        let n = 0, c0 = D.cols, r0 = D.rows, c1 = -1, r1 = -1;
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                if (!mask[lidx(c, r)]) continue;
                n++;
                if (c < c0) c0 = c;
                if (c > c1) c1 = c;
                if (r < r0) r0 = r;
                if (r > r1) r1 = r;
            }
        }

        if (!n) {
            // 只有"新建"时才可以真的把选区清掉；减选减空了也清，
            // 但拖拽途中（keepEmpty）先留个空壳，否则拖到一半轮廓闪没了
            state.select = keepEmpty
                ? { mask, inverse: false, sb: { c0: 0, r0: 0, c1: 0, r1: 0 }, shape, shapeCount: 0, edges: [], simple: false }
                : null;
            if (!keepEmpty) afterSelectChange();
            return n;
        }

        state.select = {
            mask, inverse: false,
            sb: { c0, r0, c1, r1 },
            shape,
            shapeCount: n,
            edges: null,
            // 只有"新建 + 矩形"才是能用一个矩形铺底的简单选区。
            // 加选两个矩形拼出来的不是矩形，画的时候不能走快路径。
            simple: op === 'new' && shape === 'rect'
        };
        afterSelectChange();
        return n;
    }

    /* 选区里有几块互不相连的区域：加选两片、减选掏个洞都会变多块。
       PS 不显示这个，但显示出来能一眼确认"加进去了 / 真的减掉了"。 */
    function countBlocks() {
        const s = state.select;
        if (!s) return 0;
        const m = flatMask() || s.mask;
        const seen = new Uint8Array(m.length);
        const stack = [];
        let blocks = 0;
        for (let i = 0; i < m.length; i++) {
            if (!m[i] || seen[i]) continue;
            blocks++;
            seen[i] = 1;
            stack.push(i);
            while (stack.length) {
                const k = stack.pop();
                const c = k % D.cols, r = (k - c) / D.cols;
                if (c > 0) { const kk = k - 1; if (!seen[kk] && m[kk]) { seen[kk] = 1; stack.push(kk); } }
                if (c < D.cols - 1) { const kk = k + 1; if (!seen[kk] && m[kk]) { seen[kk] = 1; stack.push(kk); } }
                if (r > 0) { const kk = k - D.cols; if (!seen[kk] && m[kk]) { seen[kk] = 1; stack.push(kk); } }
                if (r < D.rows - 1) { const kk = k + D.cols; if (!seen[kk] && m[kk]) { seen[kk] = 1; stack.push(kk); } }
            }
        }
        return blocks;
    }

    function afterSelectChange() {
        syncSelBar();
        requestRender();
    }

    function selClear() {
        state.select = null;
        state.poly = [];
        afterSelectChange();
    }

    function selAll() {
        const m = new Uint8Array(D.cols * D.rows);
        m.fill(1);
        commitSelect(m, 'rect', 'new');
    }

    function selInvert() {
        const s = state.select;
        if (!s) { toast('先拖一个选区出来'); return; }
        s.inverse = !s.inverse;
        s.edges = null;
        s.blocks = null;      // 反选之后块的划分完全变了，缓存得作废

        // 全选之后反选 = 一格不剩。这时候必须真的取消选区，
        // 否则会留下"画不出来又没有轮廓"的锁死状态（PS 也是提示没选中任何像素）
        if (selSize() === 0) {
            state.select = null;
            toast('反选后没有可编辑的区域，已取消选区');
        }
        afterSelectChange();
    }

    function closePolygon() {
        const pts = state.poly;
        if (pts.length < 3) { toast('多边形至少要点 3 个点'); return; }
        const m = polyMask(pts);
        const op = state.polyOp || 'new';
        state.poly = [];
        if (op === 'sub' && !state.select) {
            toast('还没有选区，没东西可减');
            afterSelectChange();
            return;
        }
        const n = commitSelect(m, 'polygon', op);
        if (!n) toast('没有剩下任何选区');
        else toast(`${SEL_OP_NAME[op]} · ${selSize().toLocaleString()} 格`);
    }

    /* 形状外轮廓的线段（单位：格），缓存到选区对象上 */
    function selEdges() {
        const s = state.select;
        if (!s) return null;
        if (s.edges) return s.edges;

        // 拖拽时每帧都要重算，这里直接读 mask，不再逐格调 inSel
        const cols = D.cols, rows = D.rows;
        const m = s.inverse ? flatMask() : s.mask;
        const segs = [];
        for (let r = 0; r < rows; r++) {
            const base = r * cols;
            for (let c = 0; c < cols; c++) {
                const i = base + c;
                if (!m[i]) continue;
                if (c === 0 || !m[i - 1]) segs.push(c, r, c, r + 1);
                if (c === cols - 1 || !m[i + 1]) segs.push(c + 1, r, c + 1, r + 1);
                if (r === 0 || !m[i - cols]) segs.push(c, r, c + 1, r);
                if (r === rows - 1 || !m[i + cols]) segs.push(c, r + 1, c + 1, r + 1);
            }
        }
        s.edges = segs;
        return segs;
    }

    /* =========================================================
     * 6. 历史
     * ========================================================= */

    const history = { stack: [], index: -1 };

    function snapshot(label) {
        history.stack = history.stack.slice(0, history.index + 1);
        history.stack.push({
            label,
            cols: D.cols,
            rows: D.rows,
            grid: D.grid.slice(),
            // 草稿也要进历史，否则画在区域外的笔画撤不回来。
            // 用扁平数组而不是 Map 快照：序列化后体积小，而且不会被后续修改带坏。
            drafts: serializeDrafts()
        });
        if (history.stack.length > MAX_UNDO) history.stack.shift();
        history.index = history.stack.length - 1;
        updateHistoryButtons();
        updateDocMeta();
        renderStats();
        markDirty();
    }

    function restore(i) {
        const s = history.stack[i];
        if (!s) return;
        D.cols = s.cols;
        D.rows = s.rows;
        D.grid = s.grid.slice();
        loadDrafts(s.drafts);
        syncRegionMeta();
        history.index = i;
        state.select = null;
        updateDocMeta();
        updateHistoryButtons();
        renderStats();
        syncSizePanel();
        syncSelBar();
        requestRender();
        markDirty();
    }

    function undo() {
        if (history.index <= 0) return;
        restore(history.index - 1);
    }

    function redo() {
        if (history.index >= history.stack.length - 1) return;
        restore(history.index + 1);
    }

    function updateHistoryButtons() {
        $('btnUndo').disabled = history.index <= 0;
        $('btnRedo').disabled = history.index >= history.stack.length - 1;
    }

    /* =========================================================
     * 7. 编辑操作
     * ========================================================= */

    // 第一刀草稿区只开放画笔/橡皮。填充、描边、选区这些落在区域外直接忽略
    // （不是静默出错，是故意不写——草稿区没有"选区内"的概念，硬写会绕开作用域）
    const DRAFT_TOOLS = new Set(['brush', 'razor', 'chainRazor']);

    /* 写一格。c / r 是**世界坐标**（指针给的）。
       落在当前区域内 → 写区域；落在区域外 → 写草稿区。 */
    function setCell(wc, wr, code) {
        const l = localOf(wc, wr);
        if (l) {
            if (!inSel(l.c, l.r)) return false;      // 作用域：选区外一律不写
            const i = lidx(l.c, l.r);
            if (D.grid[i] === code) return false;
            D.grid[i] = code;
            markDirty();
            return true;
        }
        // 区域外 → 草稿区
        if (!DRAFT_TOOLS.has(state.tool)) return false;
        const ok = setDraft(wc, wr, code);
        if (ok) markDirty();
        return ok;
    }

    /* 笔刷覆盖的格子 —— 落笔与光标预览共用，保证「看到的就是画到的」 */
    function brushCells(c, r) {
        const size = Math.max(1, Math.floor(state.brushSize));
        const half = Math.floor((size - 1) / 2);
        const c0 = c - half;
        const r0 = r - half;
        const mid = (size - 1) / 2;
        const radius = size / 2 - 0.25;     // size>=3 时只切掉四个角，形状接近圆角方块
        const out = [];

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                if (state.brushShape === 'round' && size > 2) {
                    const ddx = dx - mid;
                    const ddy = dy - mid;
                    if (ddx * ddx + ddy * ddy > radius * radius) continue;
                } else if (state.brushShape === 'cross') {
                    if (Math.abs(dx - mid) > 0.5 && Math.abs(dy - mid) > 0.5) continue;
                }
                out.push([c0 + dx, r0 + dy]);
            }
        }
        return out;
    }

    function paintAt(c, r) {
        const cells = brushCells(c, r);
        const erasing = state.tool === 'razor' || state.tool === 'chainRazor';
        let changed = false;
        for (const [cc, rr] of cells) {
            if (erasing) {
                if (setCell(cc, rr, '')) changed = true;
            } else {
                if (setCell(cc, rr, state.color)) changed = true;
            }
        }
        return changed;
    }

    function paintLine(c0, r0, c1, r1) {
        const dx = c1 - c0;
        const dy = r1 - r0;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        let changed = false;
        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : i / steps;
            if (paintAt(Math.round(c0 + dx * t), Math.round(r0 + dy * t))) changed = true;
        }
        return changed;
    }

    /* 填充。c / r 是**世界坐标**（指针给的），进入区域内部后一律用局部坐标。 */
    function floodFill(wc, wr) {
        const start = localOf(wc, wr);
        if (!start) return false;
        if (!inSel(start.c, start.r)) { toast('这一格在选区外'); return false; }
        const target = D.grid[lidx(start.c, start.r)];
        if (target === state.color) return false;

        const stack = [[start.c, start.r]];
        const seen = new Uint8Array(D.cols * D.rows);
        let changed = false;

        while (stack.length) {
            const [x, y] = stack.pop();
            if (!inBounds(x, y)) continue;
            const i = lidx(x, y);
            if (seen[i]) continue;
            if (D.grid[i] !== target) continue;
            if (!inSel(x, y)) continue;      // 不越出选区
            seen[i] = 1;
            D.grid[i] = state.color;
            changed = true;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return changed;
    }

    /* 连锁剃刀。c / r 是**世界坐标**（指针给的），进入区域内部后一律用局部坐标。 */
    function chainErase(wc, wr) {
        const start = localOf(wc, wr);
        if (!start) return false;
        if (!inSel(start.c, start.r)) { toast('这一格在选区外'); return false; }
        const target = D.grid[lidx(start.c, start.r)];
        if (!target) return false;

        const stack = [[start.c, start.r]];
        const seen = new Uint8Array(D.cols * D.rows);
        let changed = false;

        while (stack.length) {
            const [x, y] = stack.pop();
            if (!inBounds(x, y)) continue;
            const i = lidx(x, y);
            if (seen[i]) continue;
            if (D.grid[i] !== target) continue;
            if (!inSel(x, y)) continue;      // 不越出选区
            seen[i] = 1;
            D.grid[i] = '';
            changed = true;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return changed;
    }

    function flip(axis) {
        const g = new Array(D.grid.length);
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                const tc = axis === 'h' ? D.cols - 1 - c : c;
                const tr = axis === 'v' ? D.rows - 1 - r : r;
                g[tr * D.cols + tc] = D.grid[lidx(c, r)];
            }
        }
        D.grid = g;
        syncRegionMeta();          // 换了新数组，得让区域跟上，否则 region.cells 指向旧数组
        snapshot(axis === 'h' ? '左右翻转' : '上下翻转');
        requestRender();
    }

    function quantizeTo(n) {
        const counts = new Map();
        for (const code of D.grid) {
            if (!code) continue;
            counts.set(code, (counts.get(code) || 0) + 1);
        }
        if (counts.size <= n) {
            toast(`当前只有 ${counts.size} 色，不用量化`);
            return;
        }

        // 保留用得最多的 n 种，其余按 CIEDE2000 就近合并
        const keep = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
        const keepSet = new Set(keep);

        const keepInfo = keep.map(code => {
            const p = PAL_MAP.get(code);
            return { code, rgb: p.rgb, lab: rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]) };
        });

        const cache = new Map();
        const remap = new Map();

        counts.forEach((_, code) => {
            if (keepSet.has(code)) { remap.set(code, code); return; }
            const p = PAL_MAP.get(code);
            if (!p) { remap.set(code, ''); return; }
            const lab = rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]);
            let best = keepInfo[0].code;
            let bd = Infinity;
            for (const k of keepInfo) {
                const d = deltaE2000(lab, k.lab);
                if (d < bd) { bd = d; best = k.code; }
            }
            remap.set(code, best);
        });

        for (let i = 0; i < D.grid.length; i++) {
            const code = D.grid[i];
            if (!code) continue;
            D.grid[i] = remap.get(code) || '';
        }

        snapshot(`颜色量化为 ${n} 色`);
        requestRender();
        toast(`已合并到 ${n} 色`);
    }

    /* =========================================================
     * 智能优化：逐条勾选 + 实时预览 + 优化刷
     *
     * 预览分两层画：
     *   base    —— 原图 + 已勾选建议替换后的颜色，离屏缓存，只在"内核"变化时重画
     *   overlay —— 每帧叠上去的「会变（红边）/ 已排除（绿边）」标记
     * 涂抹时只 drawImage(base) + 少量标记，120×120 以上也不掉帧。
     *
     * 命中判定按 getBoundingClientRect 归一化（不是按画布设备像素），
     * 所以画布被 CSS 缩放过、或者格子只有几个像素，涂的位置也不歪。
     * ========================================================= */

    const SO = {
        sug: [],                // [{ from, to, count, delta, accepted }]
        accepted: new Set(),    // 勾上的建议下标
        erased: new Set(),      // 优化刷排除的格子（flat index）
        erasedByCode: new Map(),
        marked: [],             // 会被替换的格子
        scopeIdx: null,         // 只作用于选区时的下标表
        base: null,
        ctx: null,
        colorCount: 0,
        w: 0,
        h: 0,
        cellX: 1,
        cellY: 1,
        dpr: 1,
        focusCode: '',
        brush: { mode: 'erase', size: 2 },
        markColor: '#ff2d55',
        erasedColor: '#0ca678',
        scopeSel: true,
        drawing: false,
        last: null,
        paintRaf: 0,
        rebuildT: 0,
        erasedDirty: false
    };

    function labOf(code) {
        const p = PAL_MAP.get(code);
        if (!p) return null;
        if (!p.lab) p.lab = rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]);
        return p.lab;
    }

    function soScopeIdx() {
        if (!state.select || !SO.scopeSel) return null;
        const out = [];
        for (let r = 0; r < D.rows; r++) {
            const base = r * D.cols;
            for (let c = 0; c < D.cols; c++) if (inSel(c, r)) out.push(base + c);
        }
        return out;
    }

    function analyzeOptimize(minPct, maxDelta, scope) {
        const counts = new Map();
        const add = (i) => {
            const code = D.grid[i];
            if (!code) return;
            counts.set(code, (counts.get(code) || 0) + 1);
        };
        if (scope) { for (let k = 0; k < scope.length; k++) add(scope[k]); }
        else { for (let i = 0; i < D.grid.length; i++) add(i); }

        let total = 0;
        counts.forEach(n => { total += n; });
        if (!total) return [];

        const used = [...counts.entries()].sort((a, b) => b[1] - a[1]);

        // 低频阈：少于总豆子数 minPct% 的色算「用得很少」
        const minCount = Math.max(2, Math.round(total * minPct / 100));
        // 常用色池：用量至少是低频阈的 3 倍
        const dominant = used.filter(([, n]) => n >= minCount * 3);
        if (!dominant.length) return [];

        const out = [];
        for (const [code, n] of used) {
            if (n >= minCount) continue;
            const a = labOf(code);
            if (!a) continue;

            let best = null;
            let bestD = Infinity;
            for (const [dc] of dominant) {
                if (dc === code) continue;
                const b = labOf(dc);
                if (!b) continue;
                const d = deltaE2000(a, b);
                if (d < bestD) { bestD = d; best = dc; }
            }

            if (best && bestD <= maxDelta) {
                out.push({ from: code, to: best, count: n, delta: bestD, accepted: true });
            }
        }

        return out.sort((a, b) => a.count - b.count);
    }

    /* ---- 内核算力：谁会被换 / 谁被排除 ---- */

    function soPruneErased() {
        SO.erased.forEach(i => {
            if (i < 0 || i >= D.grid.length || !D.grid[i]) SO.erased.delete(i);
        });
    }

    // 只跟「已勾建议 + 图纸」有关，涂抹时不用重算
    function soRecomputeMarked() {
        const repl = new Map();
        SO.accepted.forEach(i => {
            const s = SO.sug[i];
            if (s && !repl.has(s.from)) repl.set(s.from, s.to);
        });
        SO.marked = [];
        for (let i = 0; i < D.grid.length; i++) {
            if (repl.has(D.grid[i])) SO.marked.push(i);
        }
    }

    function soRecomputeErased() {
        SO.erasedByCode = new Map();
        SO.erased.forEach(i => {
            const code = D.grid[i];
            if (!code) return;
            SO.erasedByCode.set(code, (SO.erasedByCode.get(code) || 0) + 1);
        });
    }

    function soHitCount() {
        let n = 0;
        for (let k = 0; k < SO.marked.length; k++) if (!SO.erased.has(SO.marked[k])) n++;
        return n;
    }

    /* ---- 尺寸 / 底图 ---- */

    function soLayout(force) {
        const wrap = $('soWrap');
        if (!wrap) return false;
        const availW = wrap.clientWidth - 2;
        const availH = wrap.clientHeight - 2;
        if (availW < 24 || availH < 24) return false;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cell = Math.min(availW / D.cols, availH / D.rows);
        const cssW = Math.max(D.cols, Math.floor(D.cols * cell));
        const cssH = Math.max(D.rows, Math.floor(D.rows * cell));
        const devW = Math.max(D.cols, Math.round(cssW * dpr));
        const devH = Math.max(D.rows, Math.round(cssH * dpr));

        if (!force && devW === SO.w && devH === SO.h) return true;

        const cv = $('soCanvas');
        SO.w = devW;
        SO.h = devH;
        SO.dpr = dpr;
        SO.cellX = devW / D.cols;
        SO.cellY = devH / D.rows;
        cv.width = devW;
        cv.height = devH;
        cv.style.width = cssW + 'px';
        cv.style.height = cssH + 'px';
        SO.ctx = cv.getContext('2d');
        return true;
    }

    function soBuildBase() {
        if (!SO.w || !SO.h) return;
        let cvs = SO.base;
        if (!cvs) cvs = SO.base = document.createElement('canvas');
        if (cvs.width !== SO.w || cvs.height !== SO.h) {
            cvs.width = SO.w;
            cvs.height = SO.h;
        }

        const g = cvs.getContext('2d');
        const emptyHex = state.emptyColor || '#ffffff';
        g.fillStyle = emptyHex;
        g.fillRect(0, 0, SO.w, SO.h);

        const repl = new Map();
        SO.accepted.forEach(i => {
            const s = SO.sug[i];
            if (s && !repl.has(s.from)) repl.set(s.from, s.to);
        });

        const hexCache = new Map();
        const hexOf = (code) => {
            if (!code) return emptyHex;
            const t = repl.get(code);
            if (t !== undefined) code = t;
            let hex = hexCache.get(code);
            if (hex === undefined) {
                const p = PAL_MAP.get(code);
                hex = p ? p.hex : emptyHex;
                hexCache.set(code, hex);
            }
            return hex;
        };

        // 逐行合并同色连续段：4 万格也只有几百次 fillRect
        const cols = D.cols;
        const cx = SO.cellX;
        const cy = SO.cellY;
        for (let r = 0; r < D.rows; r++) {
            const y0 = Math.round(r * cy);
            const y1 = Math.round((r + 1) * cy);
            let c = 0;
            while (c < cols) {
                const hex = hexOf(D.grid[lidx(c, r)]);
                let c2 = c + 1;
                while (c2 < cols && hexOf(D.grid[lidx(c2, r)]) === hex) c2++;
                g.fillStyle = hex;
                const x0 = Math.round(c * cx);
                const x1 = Math.round(c2 * cx);
                g.fillRect(x0, y0, x1 - x0, y1 - y0);
                c = c2;
            }
        }
    }

    /* ---- 画：底图 + 标记 ---- */

    function soPaint() {
        const g = SO.ctx;
        const tiny = (w, h) => w < 9 || h < 9;
        if (!g || !SO.base) return;

        g.clearRect(0, 0, SO.w, SO.h);
        g.drawImage(SO.base, 0, 0);

        const cols = D.cols;
        const cx = SO.cellX;
        const cy = SO.cellY;
        const small = Math.min(cx, cy);
        // 描边跟着格子长，但有上下限：大格子别画成红框，小格子也得看得见
        const lw = Math.max(1.4, Math.min(2.4, small * 0.08));
        const focus = SO.focusCode;
        const marks = SO.marked;
        const heavy = marks.length > 6000;   // 大面积时省掉描边，只铺色

        g.fillStyle = SO.markColor;
        for (let k = 0; k < marks.length; k++) {
            const i = marks[k];
            const c = i % cols;
            const r = (i - c) / cols;
            const x0 = Math.round(c * cx);
            const x1 = Math.round((c + 1) * cx);
            const y0 = Math.round(r * cy);
            const y1 = Math.round((r + 1) * cy);
            const w = x1 - x0;
            const h = y1 - y0;

            // 悬停某一行建议时，那一撮格子标得更实
            const hot = focus && D.grid[i] === focus;
            // 格子小的时候靠底色撑可见度，格子大了就只留细边，别把原色盖住
            const tiny = w < 9 || h < 9;
            g.globalAlpha = hot ? 0.5 : (tiny ? 0.32 : 0.15);
            g.fillRect(x0, y0, w, h);
            g.globalAlpha = 1;

            if (!heavy && w >= 4 && h >= 4) {
                const t = hot ? Math.min(5, lw * 1.7) : lw;
                g.lineWidth = t;
                g.strokeStyle = SO.markColor;
                g.strokeRect(x0 + t / 2, y0 + t / 2, w - t, h - t);
            }
        }

        // 被优化刷排除的格子：还原原色后打自己的标记（盖掉上面的红边）
        if (!SO.erased.size) return;
        const emptyHex = state.emptyColor || '#ffffff';
        SO.erased.forEach(i => {
            const c = i % cols;
            const r = (i - c) / cols;
            const x0 = Math.round(c * cx);
            const x1 = Math.round((c + 1) * cx);
            const y0 = Math.round(r * cy);
            const y1 = Math.round((r + 1) * cy);
            const w = x1 - x0;
            const h = y1 - y0;

            const p = PAL_MAP.get(D.grid[i]);
            g.fillStyle = p ? p.hex : emptyHex;
            g.fillRect(x0, y0, w, h);

            g.globalAlpha = tiny(w, h) ? 0.34 : 0.18;
            g.fillStyle = SO.erasedColor;
            g.fillRect(x0, y0, w, h);
            g.globalAlpha = 1;

            if (w >= 4 && h >= 4) {
                g.lineWidth = lw;
                g.strokeStyle = SO.erasedColor;
                g.strokeRect(x0 + lw / 2, y0 + lw / 2, w - lw, h - lw);
            }
        });
    }

    function soSchedule() {
        if (SO.paintRaf) return;
        SO.paintRaf = requestAnimationFrame(() => {
            SO.paintRaf = 0;
            if (SO.erasedDirty) {
                SO.erasedDirty = false;
                soRecomputeErased();
                soUpdateRowCounts();
                soSummary();
            }
            soPaint();
        });
    }

    /* ---- 右栏：摘要 + 建议列表 ---- */

    function soSummary() {
        // 打开期间色数不会变（应用后就关窗了），别每帧全图扫一遍
        const used = SO.colorCount;
        const hit = soHitCount();
        const chosen = SO.accepted.size;
        const off = SO.erased.size;
        const after = Math.max(0, used - SO.sug.length);

        let html;
        if (!SO.sug.length) {
            html = '没找到可以合并的颜色。把「低频判定」调大，或把「颜色接近度」放宽试试。';
        } else {
            html = `可以合并 <b>${SO.sug.length}</b> 个颜色，色数 <b>${used}</b> → <b>${after}</b>；` +
                   `勾了 <b>${chosen}</b> 个，会动 <b>${hit}</b> 颗豆子`;
            if (off) html += `，另有 <b>${off}</b> 颗被笔画排除在外`;
            if (SO.scopeIdx) html += `（只算选区里的）`;
        }
        $('smSummary').innerHTML = html;

        const apply = $('smartApply');
        apply.disabled = !chosen;
        apply.textContent = chosen ? `合并 ${chosen} 色 · ${hit} 颗` : '合并';

        $('soHeadHint').textContent =
            `${D.cols} × ${D.rows} · ${used} 色` + (SO.scopeIdx ? ' · 只作用于选区' : '');

        $('soListCount').textContent = SO.sug.length
            ? `${SO.sug.length} 个建议 · 勾了 ${chosen}`
            : '没有建议';

        const cellCss = SO.cellX / (SO.dpr || 1);
        $('soInfo').textContent = off ? `已排除 ${off} 颗` : (SO.sug.length ? `会变 ${hit} 颗` : '');
        $('soZoom').textContent = SO.w ? `每格 ${cellCss.toFixed(1)}px` : '';
    }

    function soUpdateRowCounts() {
        const rows = $('smList').querySelectorAll('.sm-row');
        for (let k = 0; k < rows.length; k++) {
            const row = rows[k];
            const s = SO.sug[+row.dataset.i];
            if (!s) continue;
            const off = SO.erasedByCode.get(s.from) || 0;
            const cell = row.querySelector('.sm-count');
            if (!cell) continue;
            cell.innerHTML = `${s.count - off} 颗` +
                (off ? ` <span class="sm-erased">· 已排除 ${off}</span>` : '');
        }
    }

    function soRenderList() {
        const host = $('smList');
        host.innerHTML = '';

        if (!SO.sug.length) {
            // 摘要那边已经把原因和怎么调写清楚了，这里不再重复一遍
            soSummary();
            return;
        }

        SO.sug.forEach((s, i) => {
            const pFrom = PAL_MAP.get(s.from);
            const pTo = PAL_MAP.get(s.to);
            const row = document.createElement('label');
            row.className = 'sm-row' + (s.accepted ? ' is-on' : '');
            row.dataset.i = i;
            row.dataset.code = s.from;
            row.title = `${s.from} → ${s.to}，ΔE ${s.delta.toFixed(1)}`;
            row.innerHTML =
                `<input type="checkbox" data-i="${i}" ${s.accepted ? 'checked' : ''}>` +
                `<span class="sm-main">` +
                    `<span class="sm-line1">` +
                        `<span class="sm-swatch" style="background:${pFrom ? pFrom.hex : '#fff'}"></span>` +
                        `<span class="sm-code">${s.from}</span>` +
                        `<span class="sm-arrow">→</span>` +
                        `<span class="sm-swatch" style="background:${pTo ? pTo.hex : '#fff'}"></span>` +
                        `<span class="sm-code">${s.to}</span>` +
                    `</span>` +
                    `<span class="sm-line2 sm-count"></span>` +
                `</span>` +
                `<span class="sm-delta">ΔE ${s.delta.toFixed(1)}</span>`;
            host.appendChild(row);
        });

        soUpdateRowCounts();
        soSummary();
    }

    /* ---- 开关建议 ---- */

    function soToggleSug(i, on) {
        const s = SO.sug[i];
        if (!s) return;
        s.accepted = on;
        if (on) SO.accepted.add(i); else SO.accepted.delete(i);

        const row = $('smList').querySelector(`.sm-row[data-i="${i}"]`);
        if (row) {
            row.classList.toggle('is-on', on);
            const cb = row.querySelector('input');
            if (cb) cb.checked = on;
        }
        soAfterAcceptChange();
    }

    function soAfterAcceptChange() {
        soRecomputeMarked();
        soBuildBase();
        soPaint();
        soSummary();
    }

    function soSetAll(on) {
        SO.accepted = new Set();
        SO.sug.forEach((s, i) => {
            s.accepted = on;
            if (on) SO.accepted.add(i);
        });
        $('smList').querySelectorAll('.sm-row').forEach(row => {
            row.classList.toggle('is-on', on);
            const cb = row.querySelector('input');
            if (cb) cb.checked = on;
        });
        soAfterAcceptChange();
    }

    /* ---- 全量刷新 ---- */

    function renderSmart() {
        const minPct = clamp(Number($('smRatio').value) || 3, 1, 20);
        const maxDelta = clamp(Number($('smDelta').value) || 9, 2, 20);
        $('smDeltaVal').textContent = `ΔE ≤ ${maxDelta}`;

        SO.scopeIdx = soScopeIdx();
        SO.colorCount = usedColors().length;
        SO.sug = analyzeOptimize(minPct, maxDelta, SO.scopeIdx);
        SO.accepted = new Set();
        SO.sug.forEach((s, i) => { if (s.accepted) SO.accepted.add(i); });

        soPruneErased();
        soRecomputeMarked();
        soRecomputeErased();
        soRenderList();
        if (soLayout(true)) soBuildBase();
        soPaint();
    }

    // 拖动滑块时抖一下再算，别每一帧都重排建议
    function soRebuildSoon() {
        clearTimeout(SO.rebuildT);
        SO.rebuildT = setTimeout(renderSmart, 110);
    }

    /* ---- 优化刷 ---- */

    function soCellAt(e) {
        const cv = $('soCanvas');
        const rect = cv.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const c = Math.floor((e.clientX - rect.left) / rect.width * D.cols);
        const r = Math.floor((e.clientY - rect.top) / rect.height * D.rows);
        if (c < 0 || r < 0 || c >= D.cols || r >= D.rows) return null;
        return { c, r };
    }

    function soApplyBrush(from, to, mode) {
        const rad = SO.brush.size - 1;
        const x0 = from ? from.c : to.c;
        const y0 = from ? from.r : to.r;
        const steps = Math.max(Math.abs(to.c - x0), Math.abs(to.r - y0));
        let changed = false;

        // 两次 pointermove 之间补点，快速划也不会断成虚线
        for (let s = 0; s <= steps; s++) {
            const c = Math.round(x0 + (to.c - x0) * (steps ? s / steps : 0));
            const r = Math.round(y0 + (to.r - y0) * (steps ? s / steps : 0));

            for (let dy = -rad; dy <= rad; dy++) {
                const rr = r + dy;
                if (rr < 0 || rr >= D.rows) continue;
                for (let dx = -rad; dx <= rad; dx++) {
                    const cc = c + dx;
                    if (cc < 0 || cc >= D.cols) continue;
                    if (SO.scopeIdx && !inSel(cc, rr)) continue;

                    const i = lidx(cc, rr);
                    if (!D.grid[i]) continue;         // 空格不参与优化

                    if (mode === 'erase') {
                        if (!SO.erased.has(i)) { SO.erased.add(i); changed = true; }
                    } else if (SO.erased.delete(i)) {
                        changed = true;
                    }
                }
            }
        }
        return changed;
    }

    function soMoveCursor(e) {
        const cur = $('soCursor');
        const cv = $('soCanvas');
        const rect = cv.getBoundingClientRect();
        const cell = soCellAt(e);
        if (!cell || !rect.width) { cur.hidden = true; return; }

        const cellCss = rect.width / D.cols;
        const n = SO.brush.size * 2 - 1;
        const size = n * cellCss;
        const left = cell.c * cellCss - (cellCss * (n - 1)) / 2;
        const top = cell.r * cellCss - (cellCss * (n - 1)) / 2;

        cur.hidden = false;
        cur.style.width = size + 'px';
        cur.style.height = size + 'px';
        cur.style.transform = `translate(${left}px, ${top}px)`;

        const p = PAL_MAP.get(D.grid[lidx(cell.c, cell.r)]);
        $('soInfo').textContent = p
            ? `${p.code} · ${cell.c},${cell.r}${SO.erased.has(lidx(cell.c, cell.r)) ? ' · 已排除' : ''}`
            : `${cell.c},${cell.r} · 空格`;
    }

    function soStroke(e, forceMode) {
        const cell = soCellAt(e);
        if (!cell) { SO.last = null; return; }
        const mode = forceMode || ((e.altKey || (e.buttons & 2)) ? 'restore' : SO.brush.mode);
        if (soApplyBrush(SO.last, cell, mode)) {
            SO.erasedDirty = true;
            soSchedule();
        }
        SO.last = cell;
        soMoveCursor(e);
    }

    /* ---- 开关 / 绑定 ---- */

    function soClose() {
        SO.drawing = false;
        SO.last = null;
        SO.focusCode = '';
        const cur = $('soCursor');
        if (cur) cur.hidden = true;
    }

    function openSmartOptimize() {
        $('smartSheet').hidden = false;
        $('scrim').hidden = false;
        $('soCursor').hidden = true;

        SO.erased.clear();
        SO.last = null;
        SO.focusCode = '';
        SO.scopeSel = true;
        $('soScope').checked = true;
        $('soScopeWrap').hidden = !state.select;

        soSyncBrushUi();
        renderSmart();
    }

    function soSyncBrushUi() {
        $('soBrush').value = SO.brush.size;
        $('soBrushVal').textContent = SO.brush.size;
        $('soMarkColor').value = SO.markColor;
        $('soErasedColor').value = SO.erasedColor;
        document.querySelectorAll('#soModes .so-mode[data-mode]').forEach(b => {
            b.classList.toggle('is-on', b.dataset.mode === SO.brush.mode);
        });
    }

    function applySmart() {
        const chosen = SO.accepted;
        if (!chosen.size) { toast('先勾上要合并的颜色'); return; }

        const repl = new Map();
        chosen.forEach(i => {
            const s = SO.sug[i];
            if (s && !repl.has(s.from)) repl.set(s.from, s.to);
        });

        let n = 0;
        const put = (i) => {
            if (SO.erased.has(i)) return;             // 笔画排掉的，一根都不动
            const t = repl.get(D.grid[i]);
            if (t === undefined) return;
            D.grid[i] = t;
            n++;
        };

        if (SO.scopeIdx) { for (let k = 0; k < SO.scopeIdx.length; k++) put(SO.scopeIdx[k]); }
        else { for (let i = 0; i < D.grid.length; i++) put(i); }

        if (state.focus && repl.has(state.focus)) state.focus = repl.get(state.focus);

        const kept = SO.erased.size;
        snapshot(`智能优化：合并 ${chosen.size} 色`);
        requestRender();
        closeSheets();
        toast(`合并 ${chosen.size} 个颜色，改了 ${n} 颗` + (kept ? `，${kept} 颗按笔画保留原色` : ''));
    }

    /* 事件 */

    $('smRatio').addEventListener('input', soRebuildSoon);
    $('smDelta').addEventListener('input', soRebuildSoon);
    $('smartApply').addEventListener('click', applySmart);

    $('soScope').addEventListener('change', (e) => {
        SO.scopeSel = e.target.checked;
        renderSmart();
    });

    $('soBrush').addEventListener('input', (e) => {
        SO.brush.size = clamp(Number(e.target.value) || 1, 1, 10);
        $('soBrushVal').textContent = SO.brush.size;
    });

    $('soModes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        SO.brush.mode = b.dataset.mode;
        soSyncBrushUi();
    });

    $('soAllOn').addEventListener('click', () => soSetAll(true));
    $('soAllOff').addEventListener('click', () => soSetAll(false));

    $('soClearErased').addEventListener('click', () => {
        if (!SO.erased.size) return;
        SO.erased.clear();
        soRecomputeErased();
        soUpdateRowCounts();
        soSummary();
        soPaint();
    });

    $('soMarkColor').addEventListener('input', (e) => {
        SO.markColor = e.target.value;
        soPaint();
    });

    $('soErasedColor').addEventListener('input', (e) => {
        SO.erasedColor = e.target.value;
        soPaint();
    });

    $('soMax').addEventListener('click', () => {
        const s = $('smartSheet');
        s.classList.toggle('is-max');
        $('soMax').textContent = s.classList.contains('is-max') ? '⤢' : '⛶';
        requestAnimationFrame(() => {
            if (soLayout(true)) { soBuildBase(); soPaint(); }
        });
    });

    // 建议列表：勾选 / 悬停聚焦
    $('smList').addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"]');
        if (!cb) return;
        soToggleSug(+cb.dataset.i, cb.checked);
    });

    $('smList').addEventListener('pointerover', (e) => {
        const row = e.target.closest('.sm-row');
        if (!row) return;
        const code = row.dataset.code;
        if (code === SO.focusCode) return;
        SO.focusCode = code;
        soPaint();
    });

    $('smList').addEventListener('pointerleave', () => {
        if (!SO.focusCode) return;
        SO.focusCode = '';
        soPaint();
    });

    // 预览画布：涂抹
    const soCanvas = $('soCanvas');

    soCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    soCanvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        soCanvas.setPointerCapture(e.pointerId);
        SO.drawing = true;
        SO.last = null;
        soStroke(e);
    });

    soCanvas.addEventListener('pointermove', (e) => {
        if (!SO.drawing) { soMoveCursor(e); return; }
        soStroke(e);
    });

    soCanvas.addEventListener('pointerup', () => { SO.drawing = false; SO.last = null; });
    soCanvas.addEventListener('pointercancel', () => { SO.drawing = false; SO.last = null; });
    soCanvas.addEventListener('pointerleave', () => {
        if (!SO.drawing) $('soCursor').hidden = true;
    });

    // 尺寸变化（最大化 / 旋屏 / 窗口拉伸）后重排底图
    if (typeof ResizeObserver !== 'undefined') {
        let soRoRaf = 0;
        new ResizeObserver(() => {
            if ($('smartSheet').hidden || soRoRaf) return;
            soRoRaf = requestAnimationFrame(() => {
                soRoRaf = 0;
                if ($('smartSheet').hidden) return;
                if (soLayout(true)) { soBuildBase(); soPaint(); soSummary(); }
            });
        }).observe($('soWrap'));
    }

    function trimBounds(pad = 0) {
        const b = contentBounds();
        if (!b) { toast('画布是空的'); return; }

        const p = clamp(Math.floor(pad) || 0, 0, 10);
        const c0 = Math.max(0, b.c0 - p);
        const r0 = Math.max(0, b.r0 - p);
        const c1 = Math.min(D.cols - 1, b.c1 + p);
        const r1 = Math.min(D.rows - 1, b.r1 + p);

        const nw = c1 - c0 + 1;
        const nh = r1 - r0 + 1;
        if (nw === D.cols && nh === D.rows) { toast('已经是内容边界'); return; }

        const g = new Array(nw * nh).fill('');
        for (let r = 0; r < nh; r++) {
            for (let c = 0; c < nw; c++) {
                g[r * nw + c] = D.grid[lidx(c + c0, r + r0)];
            }
        }

        D.cols = nw;
        D.rows = nh;
        D.grid = g;
        syncRegionMeta();          // 区域要跟着换尺寸和换数组
        state.select = null;
        snapshot(`画布收窄到 ${nw}×${nh}`);
        updateDocMeta();
        fitView();
        toast(`画布已收窄到 ${nw} × ${nh}`);
    }

    /**
     * 把画布裁剪到当前选区。
     *
     * 和 trimBounds 一样会换新数组 + 改尺寸，所以必须 syncRegionMeta()，
     * 否则 region.cells 停在旧数组上。
     */
    function cropToSel() {
        if (!state.select) { toast('先选一块区域'); return; }
        if (state.select.inverse) { toast('反选状态下不能裁剪'); return; }
        const { c0, r0, c1, r1 } = state.select.sb;
        const nw = c1 - c0 + 1;
        const nh = r1 - r0 + 1;
        const g = new Array(nw * nh).fill('');
        for (let r = 0; r < nh; r++) {
            for (let c = 0; c < nw; c++) {
                g[r * nw + c] = D.grid[lidx(c + c0, r + r0)];
            }
        }
        D.cols = nw;
        D.rows = nh;
        D.grid = g;
        syncRegionMeta();          // 区域要跟着换尺寸和换数组
        state.select = null;
        snapshot(`裁剪到选区 ${nw}×${nh}`);
        updateDocMeta();
        fitView();
        toast(`画布裁剪到 ${nw} × ${nh}`);
    }

    /* =========================================================
     * 8. 指针交互
     * ========================================================= */

    let drag = null;

    canvas.addEventListener('pointerdown', (e) => {
        const { c, r } = toCell(e.clientX, e.clientY);

        // 中键 / 空格 → 平移
        if (e.button === 1 || state.spaceDown) {
            drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
            state.panning = true;
            state.hover = null;
            canvas.classList.add('is-panning');
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            requestRender();
            return;
        }

        if (e.button !== 0) return;

        // 没选工具（再点一次当前工具＝释放）时，左键拖动就是平移画布
        if (!state.tool) {
            drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
            state.panning = true;
            state.hover = null;
            canvas.classList.add('is-panning');
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            requestRender();
            return;
        }

        // 无选中颜色时，绘画类工具先提示
        if ((state.tool === 'brush' || state.tool === 'fill' || state.tool === 'outline') && !state.color) {
            toast('先在右边选一个颜色');
            return;
        }

        canvas.setPointerCapture(e.pointerId);

        switch (state.tool) {
            case 'brush':
            case 'razor':
                drag = { mode: 'paint', last: { c, r }, changed: false };
                drag.changed = paintAt(c, r) || drag.changed;
                requestRender();
                break;

            case 'chainRazor':
                if (chainErase(c, r)) {
                    snapshot('连锁剃刀');
                    requestRender();
                }
                break;

            case 'fill':
                if (floodFill(c, r)) {
                    snapshot('填充');
                    requestRender();
                }
                break;

            case 'picker': {
                const l = localOf(c, r);
                if (l) {
                    const code = D.grid[lidx(l.c, l.r)];
                    if (code) {
                        state.color = code;
                        state.lastPicked = code;
                        syncColorUI();
                        toast('取到 ' + code);
                    } else {
                        toast('这一格是空的');
                    }
                }
                break;
            }

            case 'select': {
                const shape = state.selShape || 'rect';
                const op = modOp(e);

                if (shape === 'polygon') {
                    const pts = state.poly;
                    // 第一个顶点就锁定合并方式，中途改修饰键不影响这一笔
                    if (!pts.length) {
                        if (op === 'sub' && !state.select) { toast('还没有选区，没东西可减'); break; }
                        state.polyOp = op;
                    }
                    const first = pts[0];
                    // 点回起点 = 闭合
                    if (pts.length >= 3 && first && first.c === c && first.r === r) {
                        closePolygon();
                        break;
                    }
                    const last = pts[pts.length - 1];
                    if (last && last.c === c && last.r === r) break;   // 双击的第二次，别加重复点
                    pts.push({ c, r });
                    syncSelBar();
                    requestRender();
                    break;
                }

                if (op === 'sub' && !state.select) { toast('还没有选区，没东西可减'); break; }

                drag = {
                    mode: 'select', shape, op,
                    // base = 落下前的选区快照。拖拽中每帧都用它重新合并，
                    // 否则加选会一帧一帧地叠上去，越拖越大。
                    // new 时也存着，这样拖到一半补按 Shift/Alt 能立刻变成加选/减选
                    base: flatMask(),
                    prevSelect: state.select,
                    anchor: { c, r }, last: { c, r }, moved: false, mask: null, path: [{ c, r }]
                };
                if (shape === 'smudge') {
                    drag.mask = new Uint8Array(D.cols * D.rows);
                    stampSmudge(drag.mask, c, r);
                    commitSelect(drag.mask, 'smudge', op, drag.base, true);
                } else if (shape === 'lasso') {
                    commitSelect(polyMask(drag.path), 'lasso', op, drag.base, true);
                } else {
                    commitSelect(rectMask({ c, r }, { c, r }), 'rect', op, drag.base, true);
                }
                break;
            }

            default:
                break;
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const { c, r } = toCell(e.clientX, e.clientY);

        // 预览框跟着光标走：拖动绘制时也要更新（平移除外）
        if (!drag || drag.mode !== 'pan') {
            const h = state.hover;
            if (!h || h.c !== c || h.r !== r) {
                state.hover = { c, r };
                requestRender();
            }
        }

        if (!drag) return;

        if (drag.mode === 'pan') {
            view.x = drag.ox + (e.clientX - drag.sx);
            view.y = drag.oy + (e.clientY - drag.sy);
            requestRender();
            return;
        }

        if (drag.mode === 'paint') {
            if (drag.last.c !== c || drag.last.r !== r) {
                if (paintLine(drag.last.c, drag.last.r, c, r)) {
                    drag.changed = true;
                    requestRender();
                }
                drag.last = { c, r };
            }
            return;
        }

        if (drag.mode === 'select') {
            // PS 的手感：拖到一半补按 Shift 就变加选、按 Alt 就变减选，松手就撤销
            if (drag.shape !== 'polygon') {
                const liveOp = modOp(e);
                if (liveOp !== drag.op) { drag.op = liveOp; drag.opDirty = true; }
            }

            const lc = drag.last.c, lr = drag.last.r;
            const movedCell = lc !== c || lr !== r;
            // 只是换了修饰键、鼠标没动也要重算一次，否则要等下一帧才看到变化
            if (!movedCell && !drag.opDirty) return;
            if (movedCell) drag.moved = true;
            drag.opDirty = false;

            if (drag.shape === 'smudge') {
                // 手指划得快会跳格，把上一格到这一格连起来补上
                if (movedCell) lineCells({ c: lc, r: lr }, { c, r }, (cc, rr) => stampSmudge(drag.mask, cc, rr));
                drag.last = { c, r };
                commitSelect(drag.mask, 'smudge', drag.op, drag.base, true);
            } else if (drag.shape === 'lasso') {
                if (movedCell) {
                    drag.path.push({ c, r });
                    if (drag.path.length > 800) drag.path.splice(1, 1);
                }
                drag.last = { c, r };
                commitSelect(polyMask(drag.path), 'lasso', drag.op, drag.base, true);
            } else {
                drag.last = { c, r };
                commitSelect(rectMask(drag.anchor, { c, r }), 'rect', drag.op, drag.base, true);
            }
            return;
        }
    });

    function endDrag(e) {
        if (!drag) return;
        const mode = drag.mode;

        if (mode === 'paint' && drag.changed) {
            const label = state.tool === 'razor' ? '剃刀' : '画笔';
            snapshot(label);
        }

        if (mode === 'select') {
            // 单击（没拖动）在「新建」下＝取消选区（PS 同款）；
            // 加/减/交集下单击什么都没变，要还原成落下前那个选区，不能把旧选区吃掉
            if (!drag.moved && drag.shape !== 'smudge') {
                if (drag.op === 'new') {
                    state.select = null;
                    state.poly = [];
                } else {
                    state.select = drag.prevSelect;
                }
            }
            // 减空了 / 交集为空 → 干脆当没有选区，别留个空壳把整张画布锁死
            if (state.select && selSize() === 0) state.select = null;
            // 选区变了：属性页的操作条、命令面板的预估都要跟着刷新
            // 这里先把 drag 清掉，syncSelBar 里才会补算块数（它靠 !drag 判断"已抬手"）
            drag = null;
            if (state.select) state.select.blocks = null;
            syncSelBar();
            if (state.tool || state.cmd) renderProps();
            renderStats();
            requestRender();
        }

        // 触屏没有 hover，抬手就把预览框收掉
        if (e && e.pointerType === 'touch') state.hover = null;

        drag = null;
        state.panning = false;
        canvas.classList.remove('is-panning');
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
        requestRender();
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // 多边形选区：双击闭合（触屏还有面板上的「闭合」按钮兜底）
    canvas.addEventListener('dblclick', (e) => {
        if (state.tool !== 'select' || (state.selShape || 'rect') !== 'polygon') return;
        if (state.poly.length < 3) return;
        e.preventDefault();
        closePolygon();
    });

    canvas.addEventListener('pointerleave', () => {
        if (!state.hover) return;
        state.hover = null;
        requestRender();
    });

    // 缩放
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const factor = Math.pow(1.0016, -e.deltaY);
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // 空格平移
    window.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select, [contenteditable]')) return;

        // 智能优化弹窗在最上层：只认 Esc，别让 B/R/Delete 改到背后的图纸
        if (!$('smartSheet').hidden) {
            if (e.key === 'Escape') { e.preventDefault(); closeSheets(); }
            return;
        }

        if (e.code === 'Space' && !state.spaceDown) {
            state.spaceDown = true;
            canvas.classList.add('is-pan-ready');
            e.preventDefault();
        }

        const k = e.key.toLowerCase();
        if (k === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
        } else if (k === 'y' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            redo();
        } else if ((e.ctrlKey || e.metaKey) && k === 'a') {
            // PS 的 Ctrl+A：全选。别让它把页面文字也全选了
            e.preventDefault();
            selAll();
            if (state.tool || state.cmd) renderProps();
        } else if ((e.ctrlKey || e.metaKey) && k === 'd') {
            // PS 的 Ctrl+D：取消选区
            e.preventDefault();
            selClear();
            if (state.tool || state.cmd) renderProps();
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'i') {
            // PS 的 Ctrl+Shift+I：反选
            e.preventDefault();
            selInvert();
            if (state.tool || state.cmd) renderProps();
        } else if (k === 'delete' || k === 'backspace') {
            // PS 的 Delete：清掉选区里的内容。没选区就什么都不做
            if (state.select) {
                e.preventDefault();
                clearSelContent();
            }
        } else if (k === 'b') setTool('brush');
        else if (k === 'r') setTool('razor');
        else if (k === 'g') setTool('fill');
        else if (k === 'i') setTool('picker');
        else if (k === 'm') setTool('select');
        else if (k === 'escape') {
            // 三段：丢掉没闭合的多边形 → 取消选区 → 释放工具
            if (state.poly.length) {
                state.poly = [];
                syncSelBar();
            } else if (state.select) {
                selClear();
                if (state.tool || state.cmd) renderProps();
            } else if (state.tool || state.cmd) {
                releaseTool();
            }
            requestRender();
        } else if (k === 'enter') {
            if (state.tool === 'select' && (state.selShape || 'rect') === 'polygon' && state.poly.length >= 3) {
                e.preventDefault();
                closePolygon();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            state.spaceDown = false;
            canvas.classList.remove('is-pan-ready');
        }
    });

    /* =========================================================
     * 9. 工具栏
     * ========================================================= */

    const TOOLS = [
        { id: 'brush', name: '画笔', emoji: '✏️', kind: 'tool' },
        { id: 'select', name: '选区', emoji: '📐', kind: 'tool' },
        { id: 'razor', name: '剃刀', emoji: '🔪', kind: 'tool' },
        { id: 'chainRazor', name: '连锁剃刀', emoji: '⛓️', kind: 'tool' },
        { id: 'fill', name: '填充', emoji: '🪣', kind: 'tool' },
        { id: 'picker', name: '取色器', emoji: '💧', kind: 'tool' },
        { sep: true },
        { id: 'canvas', name: '画布', emoji: '🔲', kind: 'cmd' },
        { id: 'colorConvert', name: '颜色转换', emoji: '🔄', kind: 'cmd' },
        { id: 'colorRemove', name: '颜色剔除', emoji: '🚫', kind: 'cmd' },
        { id: 'quantize', name: '颜色量化', emoji: '🎯', kind: 'cmd' },
        { id: 'noise', name: '杂色过滤', emoji: '✨', kind: 'cmd' },
        { id: 'smartOptimize', name: '智能优化', emoji: '🧠', kind: 'cmd' },
        { id: 'bounds', name: '画布边界', emoji: '📏', kind: 'cmd' },
        { id: 'outline', name: '描边', emoji: '🖍️', kind: 'cmd' }
    ];

    function buildToolbar() {
        const host = $('toolSection');
        host.innerHTML = '';

        const KEYMAP = { brush: 'B', razor: 'R', fill: 'G', picker: 'I', select: 'M' };

        TOOLS.forEach(t => {
            if (t.sep) {
                const d = document.createElement('div');
                d.className = 'tool-sep';
                host.appendChild(d);
                return;
            }

            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tool-item';
            b.dataset.id = t.id;
            b.dataset.kind = t.kind;
            b.title = t.name + (KEYMAP[t.id] ? ` (${KEYMAP[t.id]})` : '');
            // 画笔的图标就是"当前颜色"：一个色圆，选什么色圆就是什么色
            const icon = t.id === 'brush'
                ? '<span class="tool-dot" id="brushToolDot"></span>'
                : `<span class="tool-emoji">${t.emoji}</span>`;
            b.innerHTML = `<span class="tool-icon">${icon}</span>
                           <span class="tool-label">${t.name}</span>`;
            b.addEventListener('click', () => onToolClick(t));
            host.appendChild(b);
        });

        syncToolUI();
    }

    function onToolClick(t) {
        if (t.kind === 'tool') {
            // 再点一次当前工具 = 释放（什么都不选），次面板回到图纸统计
            if (state.tool === t.id) releaseTool();
            else setTool(t.id);
            return;
        }

        // 智能优化有自己的弹窗（要逐条勾选建议），保持原样
        if (t.id === 'smartOptimize') {
            openSmartOptimize();
            return;
        }

        // 其余命令类：不直接执行，进次面板给参数和「执行」按钮
        if (state.cmd === t.id) releaseTool();
        else setCmd(t.id);
    }

    function setCmdsyncUiFlag() {
        const insp = $('inspector');
        if (insp) insp.classList.toggle('is-cmd', !!state.cmd);
    }

    function setTool(id) {
        if (id !== 'select') state.poly = [];
        state.tool = id;
        state.cmd = null;
        colorCardManual = null;
        state.hover = null;
        setCmdsyncUiFlag();
        syncToolUI();
        setInspTab('props');
        autoUnfold();
        requestRender();
    }

    function setCmd(id) {
        state.tool = null;      // 命令模式不落笔：左键拖动 = 平移
        state.cmd = id;
        colorCardManual = null;
        state.hover = null;
        setCmdsyncUiFlag();
        syncToolUI();
        setInspTab('props');
        autoUnfold(true);
        // 有选区就先按选区算（用户还能手动切回全图）
        if (state.select) {
            ['cc', 'cr', 'ol'].forEach(k => { if (cmdState[k]) cmdState[k].scope = 'sel'; });
        }
        refreshCmd();
        requestRender();
    }

    // 桌面选工具顺手展开次面板；手机上不弹——画布权重最高，点工具是"我要开始画"，
    // 不是"我要调参数"，参数走右侧导轨那个箭头。命令类必须靠面板，所以 force。
    function autoUnfold(force) {
        if (!inspFolded) return;
        if (force || window.innerWidth > 760) setFolded(false);
    }

    function releaseTool() {
        state.tool = null;
        state.cmd = null;
        colorCardManual = null;
        state.hover = null;
        setCmdsyncUiFlag();
        syncToolUI();
        setInspTab('stats');
        // 手机上退出命令后，底部抽屉没理由继续占着下半屏——收回右侧导轨
        if (window.innerWidth <= 760) setFolded(true);
        requestRender();
    }

    // 只改动发生变化的那两项，不遍历整条工具栏，也不重绘画布
    let activeToolEl = null;

    function syncToolUI() {
        const key = state.cmd || state.tool;
        const next = key
            ? document.querySelector(`.tool-item[data-id="${key}"]`)
            : null;
        if (activeToolEl && activeToolEl !== next) activeToolEl.classList.remove('is-active');
        if (next) next.classList.add('is-active');
        activeToolEl = next;

        canvas.classList.toggle('is-idle', !state.tool);

        const hint = $('edHint');
        if (hint) {
            const map = {
                brush: '画笔：拖动涂色',
                fill: '填充：点一下同色区域',
                picker: '取色：点击格子取色',
                select: '选区：矩形 / 套索 / 涂抹 / 多边形，画完所有工具只在选区内生效',
                razor: '剃刀：拖动擦成空格',
                chainRazor: '连锁剃刀：点一下删掉相连的同色块',
                canvas: '画布：拖四边改尺寸，或在右侧填格子数',
                colorConvert: '颜色转换：在右侧面板选源颜色和目标色',
                colorRemove: '颜色剔除：在右侧面板选要剔除的颜色',
                quantize: '颜色量化：在右侧面板设保留色数',
                noise: '杂色过滤：在右侧面板设判定条件',
                bounds: '画布边界：在右侧面板设留白后裁剪',
                outline: '描边：在右侧面板设颜色、方向和粗细'
            };
            const text = state.tool || state.cmd
                ? (map[state.cmd || state.tool] || '')
                : '未选工具：拖动平移画布 · 点左边工具开始编辑';
            if (text && hint.textContent !== text) hint.textContent = text;
        }

        // 属性视图只显示跟当前工具/命令相关的那一段
        renderProps();
        syncColorCard();

        // 没有选中任何工具/命令时，「工具属性」这一栏是空的
        const propsTab = document.querySelector('.insp-tab[data-tab="props"]');
        if (propsTab) propsTab.disabled = !(state.tool || state.cmd);
    }

    /* 色卡只在"这个工具真的会用到颜色"时铺开，其余收成一行当前色，
       把整块高度让给参数面板。用户点箭头的手动选择优先，切工具时归位。 */
    const COLOR_TOOLS = new Set(['brush', 'fill', 'picker', 'colorConvert', 'colorRemove', 'outline']);
    let colorCardManual = null;

    function syncColorCard() {
        const host = $('toolColors');
        if (!host) return;
        const key = state.cmd || state.tool;
        const need = !!key && COLOR_TOOLS.has(key);
        host.classList.toggle('is-min', colorCardManual === null ? !need : colorCardManual);
    }

    if ($('tcMore')) {
        $('tcMore').addEventListener('click', () => {
            const host = $('toolColors');
            colorCardManual = !host.classList.contains('is-min');
            syncColorCard();
        });
    }

    // 展开 / 收起：侧栏浮在画布上，画布尺寸不变，所以这里只切 class，不重绘
    $('toolToggle').addEventListener('click', () => {
        $('toolbar').classList.toggle('is-open');
    });

    /* =========================================================
     * 10. 次面板：工具属性 / 图纸统计 / 收起成色块导轨
     * ========================================================= */

    let inspTab = 'stats';      // stats | props
    let inspFolded = false;     // 收起后只留一条色块导轨
    let statsDirty = true;

    function setInspTab(tab) {
        if (tab === 'props' && !(state.tool || state.cmd)) tab = 'stats';
        inspTab = tab;

        document.querySelectorAll('.insp-tab').forEach(b => {
            b.classList.toggle('is-active', b.dataset.tab === tab);
        });
        $('viewProps').hidden = tab !== 'props';
        $('viewStats').hidden = tab !== 'stats';

        // 切回统计时才补渲染，画图过程中不用一直重建列表
        if (tab === 'stats') renderStats();
        else renderProps();
    }

    document.querySelectorAll('.insp-tab').forEach(b => {
        b.addEventListener('click', () => {
            if (b.disabled) return;
            if (inspFolded) setFolded(false);
            setInspTab(b.dataset.tab);
        });
    });

    // 收起 / 展开：收起时面板只剩一条色块导轨，画布吃满空间
    function setFolded(on) {
        if (inspFolded === on) return;
        inspFolded = on;
        const insp = $('inspector');
        insp.classList.toggle('is-folded', on);
        $('inspStrip').hidden = !on;
        $('inspFold').title = on ? '展开次面板' : '收起次面板';
        syncInspOpenFlag();
        if (on) renderStrip();
        else if (inspTab === 'stats' && statsDirty) renderStats();
    }

    // 桌面：次面板浮在画布上，右下角提示条跟着让位
    function syncInspOpenFlag() {
        const main = document.querySelector('.ed-main');
        if (main) main.classList.toggle('is-insp-open', !$('inspector').classList.contains('is-folded'));
    }

    $('inspFold').addEventListener('click', () => setFolded(!inspFolded));

    // 手机上抽屉是浮层，会把画布下半截盖住 → 量出它的高度写进 --drawer-h，
    // 画布让出这块空间，图纸始终完整可见（桌面栏在流内，不用管）
    (function trackDrawerSpace() {
        const insp = $('inspector');
        if (!insp) return;

        const sync = () => {
            const mobile = window.innerWidth <= 760;
            const h = mobile && !insp.classList.contains('is-folded')
                ? Math.round(insp.getBoundingClientRect().height)
                : 0;
            document.documentElement.style.setProperty('--drawer-h', h + 'px');
        };

        if ('ResizeObserver' in window) new ResizeObserver(sync).observe(insp);
        window.addEventListener('resize', sync);
        sync();
    })();

    function ratioLabel(w, h) {
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const g = gcd(w, h) || 1;
        const a = w / g;
        const b = h / g;
        if (a <= 12 && b <= 12) return `${a}:${b}`;
        return `${(w / h).toFixed(2)}:1`;
    }

    function renderStats() {
        statsDirty = true;

        // 收起态只需要那条色块导轨。注意这里**不能**清 statsDirty：
        // 统计视图这次没真的渲染，清了之后展开抽屉就会是空白（手机端踩过）
        if (inspFolded) {
            renderStrip();
            return;
        }
        if (inspTab !== 'stats') return;   // 不可见就先记脏，切回来再画
        statsDirty = false;

        const used = usedColors();
        const total = D.cols * D.rows;
        const filled = used.reduce((s, x) => s + x[1], 0);

        const cards = [
            ['画布', `${D.cols}×${D.rows}`],
            ['豆子数', filled.toLocaleString()],
            ['颜色数', String(used.length)],
            ['宽高比', ratioLabel(D.cols, D.rows)]
        ];
        $('statCards').innerHTML = cards
            .map(([k, v]) => `<div class="stat-card"><b>${v}</b><span>${k}</span></div>`)
            .join('');

        // 提亮的颜色如果已经不存在了，自动取消
        if (state.focus && !used.some(([code]) => code === state.focus)) {
            state.focus = null;
        }
        $('focusClear').hidden = !state.focus;

        const host = $('statList');
        host.innerHTML = '';
        const frag = document.createDocumentFragment();

        used.forEach(([code, n]) => {
            const p = PAL_MAP.get(code);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'stat-row';
            row.dataset.code = code;
            if (code === state.focus) row.classList.add('is-focus');
            row.title = p ? `${code} · ${p.hex}` : code;
            row.innerHTML =
                `<span class="stat-swatch" style="background:${p ? p.hex : '#fff'}"></span>` +
                `<span class="stat-code">${code}</span>` +
                `<span class="stat-count">${n.toLocaleString()}</span>` +
                `<span class="stat-pct">${total ? Math.round(n / filled * 100) : 0}%</span>`;
            row.addEventListener('click', () => toggleFocus(code));
            frag.appendChild(row);
        });

        if (!used.length) {
            const e = document.createElement('div');
            e.className = 'stat-empty';
            e.textContent = '画布是空的';
            frag.appendChild(e);
        }

        host.appendChild(frag);
    }

    // 收起态的那一条：纯色块，按用量从多到少排，点一下单色提亮
    function renderStrip() {
        const used = usedColors();
        const host = $('stripList');
        host.innerHTML = '';

        if (state.focus && !used.some(([code]) => code === state.focus)) {
            state.focus = null;
        }

        if (!used.length) {
            const e = document.createElement('div');
            e.className = 'strip-empty';
            e.textContent = '空';
            host.appendChild(e);
            return;
        }

        const frag = document.createDocumentFragment();
        used.forEach(([code, n]) => {
            const p = PAL_MAP.get(code);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'strip-swatch';
            b.dataset.code = code;
            b.style.background = p ? p.hex : '#fff';
            b.title = `${code} · ${n.toLocaleString()} 颗`;
            if (code === state.focus) b.classList.add('is-focus');
            b.addEventListener('click', () => toggleFocus(code));
            frag.appendChild(b);
        });
        host.appendChild(frag);
    }

    function toggleFocus(code) {
        state.focus = state.focus === code ? null : code;
        document.querySelectorAll('#statList .stat-row, #stripList .strip-swatch').forEach(r => {
            r.classList.toggle('is-focus', r.dataset.code === state.focus);
        });
        $('focusClear').hidden = !state.focus;
        requestRender();
    }

    $('focusClear').addEventListener('click', () => {
        state.focus = null;
        document.querySelectorAll('#statList .stat-row, #stripList .strip-swatch').forEach(r => {
            r.classList.remove('is-focus');
        });
        $('focusClear').hidden = true;
        requestRender();
    });

    const TOOL_TIPS = {
        brush: '拖动涂色；光标框就是实际会涂到的格子。',
        razor: '拖动擦成空格，点一下删一格，可连续擦。',
        chainRazor: '点一下删掉相连的同色块。',
        select: '拖出形状就是选区；多个形状可加选 / 减选 / 交集。',
        fill: '点一下填满同色连通区域。',
        picker: '点格子取它的色号。',

        // 命令类：改参数不动图，按面板里的按钮才执行
        canvas: '',
        colorConvert: '选好源色和目标色，点「转换」才动图。',
        colorRemove: '选一种颜色剔除，它全部变成空格。',
        quantize: '保留用量最多的 N 色，其余就近合并。',
        noise: '低频、孤立的零星格子并进周围的主色。',
        outline: '外描边沿图形外缘加一圈，内描边把边缘染色。',
        bounds: '去掉四周空白，只留图形外框加指定留白。'
    };

    function renderProps() {
        const key = state.cmd ? `cmd:${state.cmd}` : (state.tool || '');

        document.querySelectorAll('#viewProps [data-panel]').forEach(el => {
            el.hidden = !key || !el.dataset.panel.split(/\s+/).includes(key);
        });

        // 段内行：笔迹颜色只给画笔
        document.querySelectorAll('#viewProps .tp-row[data-when]').forEach(el => {
            el.hidden = !state.tool || !el.dataset.when.split(/\s+/).includes(state.tool);
        });

        if (key === 'cmd:canvas') syncSizePanel();

        syncSelBar();
        if (state.cmd) refreshCmd();

        // 底部提示：一句话，跟面板里不重复；没话说就不留空行
        const tip = state.cmd ? TOOL_TIPS[state.cmd] : TOOL_TIPS[state.tool];
        const tipEl = $('propsTip');
        tipEl.textContent = tip || '';
        tipEl.hidden = !tip;
    }

    /* =========================================================
     * 10b. 命令面板：颜色转换 / 剔除 / 量化 / 杂色 / 描边 / 边界
     * ========================================================= */

    const cmdState = {
        cc: { from: '', scope: 'all' },
        cr: { from: '', scope: 'all' },
        q: { n: 12 },
        n: { max: 3, same: 25 },
        ol: { dir: 'out', width: 1, diag: false, scope: 'all' },
        bd: { pad: 0 }
    };

    // 范围内的每一格：scope=sel 且真有选区时只走选区（按遮罩，套索/涂抹/反选都准）
    function forEachIn(scope, fn) {
        const scoped = scope === 'sel' && !!state.select;
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                if (!scoped || inSel(c, r)) fn(c, r);
            }
        }
    }

    function countCode(code, scope) {
        if (!code) return 0;
        let n = 0;
        forEachIn(scope, (c, r) => { if (D.grid[lidx(c, r)] === code) n++; });
        return n;
    }

    // 画布上实际用到的颜色，做成一条小色块，点一下就选
    function fillSwatches(hostId, current, onPick) {
        const host = $(hostId);
        if (!host) return;
        host.innerHTML = '';

        const used = usedColors();
        if (!used.length) {
            const e = document.createElement('span');
            e.className = 'cmd-empty';
            e.textContent = '画布是空的';
            host.appendChild(e);
            return;
        }

        const frag = document.createDocumentFragment();
        used.forEach(([code, n]) => {
            const p = PAL_MAP.get(code);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cmd-sw' + (code === current ? ' is-on' : '');
            b.style.background = p ? p.hex : '#fff';
            b.title = `${code} · ${n.toLocaleString()} 颗`;
            b.addEventListener('click', () => onPick(code));
            frag.appendChild(b);
        });
        host.appendChild(frag);
    }

    function syncScopeGroup(prefix, scope) {
        const group = document.querySelector(`[data-scope-group="${prefix}"]`);
        if (!group) return;
        const hasSel = !!state.select;
        group.querySelectorAll('[data-scope]').forEach(b => {
            const isSel = b.dataset.scope === 'sel';
            b.disabled = isSel && !hasSel;
            b.classList.toggle('is-on', b.dataset.scope === (hasSel ? scope : 'all'));
        });
    }

    document.querySelectorAll('[data-scope-group]').forEach(group => {
        group.addEventListener('click', (e) => {
            const b = e.target.closest('[data-scope]');
            if (!b || b.disabled) return;
            const prefix = group.dataset.scopeGroup;
            const st = cmdState[prefix];
            if (!st) return;
            st.scope = b.dataset.scope;
            refreshCmd();
        });
    });

    function refreshCmd() {
        const id = state.cmd;
        if (!id) return;

        if (id === 'colorConvert' || id === 'colorRemove') {
            const pre = id === 'colorConvert' ? 'cc' : 'cr';
            const st = cmdState[pre];

            fillSwatches(pre + 'Swatches', st.from, code => {
                st.from = code;
                refreshCmd();
            });
            syncScopeGroup(pre, st.scope);

            const p = PAL_MAP.get(st.from);
            $(pre + 'FromDot').style.background = p ? p.hex : '#fff';
            $(pre + 'FromCode').textContent = p ? p.code : '未选';

            const n = countCode(st.from, st.scope);
            $(pre + 'Stat').textContent = st.from
                ? `${st.scope === 'sel' ? '选区内' : '全图'}共 ${n.toLocaleString()} 颗要${id === 'colorConvert' ? '转换' : '剔除'}`
                : '点上面任意一个色块，选要处理哪个颜色';
        }

        if (id === 'quantize') {
            const used = usedColors().length;
            const max = Math.max(2, Math.min(24, used || 24));
            const n = clamp(cmdState.q.n, 2, max);
            cmdState.q.n = n;

            $('qNow').textContent = used ? `${used} 色` : '空画布';
            const r = $('qN');
            r.max = max;
            r.value = n;
            $('qNVal').textContent = `${n} 色`;
            document.querySelectorAll('#qPresets [data-n]').forEach(b => {
                const val = Number(b.dataset.n);
                b.hidden = val > max;                       // 超过当前色数的预设没意义
                b.classList.toggle('is-on', val === n);
            });
            $('qPresets').hidden = ![...document.querySelectorAll('#qPresets [data-n]')].some(b => !b.hidden);
            $('qStat').textContent = used > n
                ? `${used} 色 → ${n} 色，其余按色差就近并入`
                : `当前 ${used} 色；滑块拖到 ${used} 以下才会合并`;
        }

        if (id === 'noise') {
            $('nMax').value = cmdState.n.max;
            $('nSame').value = cmdState.n.same;
            $('nSameVal').textContent = `<${cmdState.n.same}%`;
            const plan = planNoise(cmdState.n);
            $('nStat').textContent = plan.length
                ? `预计处理 ${plan.length.toLocaleString()} 个孤立格`
                : '没找到符合条件的杂点';
        }

        if (id === 'outline') {
            const plan = planOutline(cmdState.ol);
            $('olStat').textContent = plan.length
                ? `将描 ${plan.length.toLocaleString()} 个格子`
                : '没有可以描边的地方';
            ['olDir', 'olWidth'].forEach(gid => {
                $(gid).querySelectorAll('.mini-btn').forEach(b => {
                    const on = gid === 'olDir'
                        ? b.dataset.dir === cmdState.ol.dir
                        : Number(b.dataset.w) === cmdState.ol.width;
                    b.classList.toggle('is-on', on);
                });
            });
            $('olDiag').checked = cmdState.ol.diag;
            syncScopeGroup('ol', cmdState.ol.scope);
        }

        if (id === 'bounds') {
            const b = contentBounds();
            if (!b) {
                $('bdStat').textContent = '画布是空的，没东西可裁';
            } else {
                const pad = cmdState.bd.pad;
                const nw = b.c1 - b.c0 + 1 + pad * 2;
                const nh = b.r1 - b.r0 + 1 + pad * 2;
                $('bdStat').textContent = `当前 ${D.cols}×${D.rows} → ${nw}×${nh}`;
            }
            $('bdPad').value = cmdState.bd.pad;
        }
    }

    /* ---- 各命令的纯计算部分（先算，面板里报数，点按钮才落到画布） ---- */

    function contentBounds() {
        let c0 = D.cols, r0 = D.rows, c1 = -1, r1 = -1;
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                if (!D.grid[lidx(c, r)]) continue;
                if (c < c0) c0 = c;
                if (c > c1) c1 = c;
                if (r < r0) r0 = r;
                if (r > r1) r1 = r;
            }
        }
        return c1 < 0 ? null : { c0, r0, c1, r1 };
    }

    function planOutline(opt) {
        const filled = new Uint8Array(D.cols * D.rows);
        for (let i = 0; i < filled.length; i++) filled[i] = D.grid[i] ? 1 : 0;

        const scoped = opt.scope === 'sel' && !!state.select;
        const inScope = (c, r) => !scoped || inSel(c, r);
        const has = (c, r) => inBounds(c, r) && filled[lidx(c, r)] === 1;

        const out = [];
        const rimmed = new Set();

        for (let step = 0; step < opt.width; step++) {
            const add = [];

            for (let r = 0; r < D.rows; r++) {
                for (let c = 0; c < D.cols; c++) {
                    if (!inScope(c, r)) continue;
                    const i = lidx(c, r);
                    let edge = false;

                    for (let dy = -1; dy <= 1 && !edge; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (!dx && !dy) continue;
                            if (!opt.diag && dx && dy) continue;
                            if (has(c + dx, r + dy) !== (opt.dir === 'in')) { edge = true; break; }
                        }
                    }

                    if (!edge) continue;
                    if (opt.dir === 'in') {
                        if (filled[i] !== 1 || rimmed.has(i)) continue;
                        rimmed.add(i);
                    } else {
                        if (filled[i] === 1) continue;
                    }
                    add.push([c, r, i]);
                }
            }

            if (!add.length) break;
            add.forEach(([c, r, i]) => { filled[i] = 1; out.push([c, r]); });
            if (opt.dir === 'in' && step + 1 < opt.width) {
                // 内描边下一轮：把刚描的一圈也当成"外侧"，继续往内吃
                add.forEach(([, , i]) => { filled[i] = 0; rimmed.add(i); });
                add.forEach(([, , i]) => { filled[i] = 0; });
            }
        }
        return out;
    }

    function planNoise(opt) {
        const counts = new Map();
        for (const code of D.grid) {
            if (!code) continue;
            counts.set(code, (counts.get(code) || 0) + 1);
        }

        // 杂色过滤没有全图/选区切换：有选区就默认只清选区里的杂点
        const scoped = !!state.select;
        const inScope = (c, r) => !scoped || inSel(c, r);
        const before = D.grid.slice();
        const plan = [];

        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                const i = lidx(c, r);
                const code = before[i];
                if (!code) continue;
                if (!inScope(c, r)) continue;
                if ((counts.get(code) || 0) > opt.max) continue;

                let same = 0, total = 0;
                const tally = new Map();
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const nc = c + dx, nr = r + dy;
                        if (!inBounds(nc, nr)) continue;
                        const v = before[lidx(nc, nr)];
                        total++;
                        if (v === code) same++;
                        else if (v) tally.set(v, (tally.get(v) || 0) + 1);
                    }
                }

                if (!total || !tally.size) continue;
                if (same / total * 100 >= opt.same) continue;   // 邻居里同色够多，不算孤立

                let best = '', bestN = 0;
                tally.forEach((v, k) => { if (v > bestN) { bestN = v; best = k; } });
                plan.push([i, best]);
            }
        }
        return plan;
    }

    /* ---- 执行按钮 ---- */

    $('ccRun').addEventListener('click', () => {
        const st = cmdState.cc;
        if (!st.from) { toast('先选源颜色'); return; }
        if (!state.color) { toast('先在下面色卡里点一个目标颜色'); return; }
        if (st.from === state.color) { toast('源颜色和目标颜色是同一个'); return; }
        const n = countCode(st.from, st.scope);
        if (!n) { toast('这个范围内没有该颜色'); return; }

        forEachIn(st.scope, (c, r) => {
            const i = lidx(c, r);
            if (D.grid[i] === st.from) D.grid[i] = state.color;
        });
        snapshot(`颜色转换 ${st.from}→${state.color}`);
        requestRender();
        refreshCmd();
        toast(`${st.from} → ${state.color}，换了 ${n} 颗`);
    });

    $('crRun').addEventListener('click', () => {
        const st = cmdState.cr;
        if (!st.from) { toast('先选要剔除的颜色'); return; }
        const n = countCode(st.from, st.scope);
        if (!n) { toast('这个范围内没有该颜色'); return; }

        forEachIn(st.scope, (c, r) => {
            const i = lidx(c, r);
            if (D.grid[i] === st.from) D.grid[i] = '';
        });
        if (state.focus === st.from) state.focus = null;
        snapshot(`颜色剔除 ${st.from}`);
        requestRender();
        refreshCmd();
        toast(`剔除 ${st.from}，清掉 ${n} 颗`);
    });

    $('qN').addEventListener('input', (e) => {
        cmdState.q.n = Number(e.target.value) || 12;
        refreshCmd();
    });

    $('qPresets').addEventListener('click', (e) => {
        const b = e.target.closest('[data-n]');
        if (!b || b.disabled) return;
        cmdState.q.n = Number(b.dataset.n);
        refreshCmd();
    });

    $('qRun').addEventListener('click', () => {
        quantizeTo(cmdState.q.n);
        refreshCmd();
    });

    $('nMax').addEventListener('input', (e) => {
        cmdState.n.max = clamp(Number(e.target.value) || 1, 1, 30);
        refreshCmd();
    });

    $('nSame').addEventListener('input', (e) => {
        cmdState.n.same = Number(e.target.value);
        refreshCmd();
    });

    $('nRun').addEventListener('click', () => {
        const plan = planNoise(cmdState.n);
        if (!plan.length) { toast('没找到符合条件的杂点'); return; }
        plan.forEach(([i, code]) => { D.grid[i] = code; });
        snapshot(`杂色过滤 ${plan.length} 格`);
        requestRender();
        refreshCmd();
        toast(`处理了 ${plan.length} 个格子`);
    });

    $('olDir').addEventListener('click', (e) => {
        const b = e.target.closest('[data-dir]');
        if (!b) return;
        cmdState.ol.dir = b.dataset.dir;
        refreshCmd();
    });

    $('olWidth').addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (!b) return;
        cmdState.ol.width = Number(b.dataset.w);
        refreshCmd();
    });

    $('olDiag').addEventListener('change', (e) => {
        cmdState.ol.diag = e.target.checked;
        refreshCmd();
    });

    $('olRun').addEventListener('click', () => {
        if (!state.color) { toast('先在下面色卡里点一个描边颜色'); return; }
        const plan = planOutline(cmdState.ol);
        if (!plan.length) { toast('没有可以描边的地方'); return; }
        plan.forEach(([c, r]) => { D.grid[lidx(c, r)] = state.color; });
        snapshot(`描边 ${plan.length} 格`);
        requestRender();
        refreshCmd();
        toast(`描了 ${plan.length} 个格子`);
    });

    $('bdPad').addEventListener('input', (e) => {
        cmdState.bd.pad = clamp(Number(e.target.value) || 0, 0, 10);
        refreshCmd();
    });

    $('bdRun').addEventListener('click', () => {
        trimBounds(cmdState.bd.pad);
        refreshCmd();
    });

    /* =========================================================
     * 10c. 选区操作条
     * ========================================================= */

    /* 清掉选区里的豆子（PS 的 Delete）。没有选区时什么都不做——整张图一键清空太危险 */
    function clearSelContent() {
        if (!state.select) { toast('先选一块区域'); return 0; }
        let n = 0;
        for (let r = 0; r < D.rows; r++) {
            for (let c = 0; c < D.cols; c++) {
                if (!inSel(c, r)) continue;
                const i = lidx(c, r);
                if (D.grid[i]) { D.grid[i] = ''; n++; }
            }
        }
        if (n) {
            snapshot('清空选区');
            renderStats();
            requestRender();
        }
        toast(n ? `清掉 ${n.toLocaleString()} 格` : '选区里本来就是空的');
        return n;
    }

    function syncSelBar() {
        const s = state.select;
        const bar = $('selBar');
        if (bar) bar.hidden = !s;

        if (s) {
            // 拖拽中每帧跑一次全图 BFS 太浪费，抬手（endDrag）再补算
            if (s.blocks == null && !drag) s.blocks = countBlocks();
            const b = selBounds();
            const w = b.c1 - b.c0 + 1;
            const h = b.r1 - b.r0 + 1;
            const n = selSize().toLocaleString();
            // 多块的时候报外接尺寸会骗人（两片小方框可能外接整张画布）；
            // 拖拽中块数还没算（null），先只报颗数
            $('selInfo').textContent = s.inverse ? `反选 · ${n} 格`
                : s.blocks > 1 ? `${s.blocks} 块 · ${n} 格`
                    : s.blocks === 1 ? `${w}×${h} · ${n} 格`
                        : `${n} 格`;
            const scope = $('selScope');
            if (scope) scope.textContent = s.inverse ? '反选 · 只编辑框外' : '仅选区内';
        }
        syncSelUI();
    }

    const SEL_SHAPE_NAME = { rect: '矩形', lasso: '套索', smudge: '涂抹', polygon: '多边形' };

    /* 选区面板的状态（形状 / 涂抹宽度 / 信息 / 按钮可用性） */
    function syncSelUI() {
        const s = state.select;
        const shape = state.selShape || 'rect';
        const op = state.selOp || 'new';

        document.querySelectorAll('#selShape [data-shape]').forEach(b => {
            b.classList.toggle('is-on', b.dataset.shape === shape);
        });

        document.querySelectorAll('#selOps [data-op]').forEach(b => {
            b.classList.toggle('is-on', b.dataset.op === op);
            // 只有"减选"在没选区时真的没东西可减（交集没选区＝新建，加选同理）
            b.disabled = !s && b.dataset.op === 'sub';
        });

        const sm = $('selSmudgeRow');
        if (sm) sm.hidden = shape !== 'smudge';
        const smi = $('selSmudge');
        if (smi) smi.value = String(state.selSmudge);

        const close = $('selClose');
        if (close) close.hidden = !(shape === 'polygon' && state.poly.length >= 3);

        const stat = $('selStat');
        if (stat) {
            if (s) {
                stat.textContent = `${SEL_SHAPE_NAME[s.shape] || ''} · ${s.inverse ? '反选' : '已选'} ${selSize().toLocaleString()} 格`;
            } else if (state.poly.length) {
                stat.textContent = `多边形：已点 ${state.poly.length} 个点，双击闭合`;
            } else {
                // 加选 / 交集在没选区时就当新建（PS 也是这样），只有减选是真的缺前置
                stat.textContent = op === 'sub' ? '还没有选区 · 先拖一块出来' : '还没有选区';
            }
        }

        document.querySelectorAll('[data-selact]').forEach(b => {
            const a = b.dataset.selact;
            if (a === 'invert' || a === 'none') b.disabled = !s;
        });
    }

    document.querySelector('#selBar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sel]');
        if (!b || !state.select) return;
        const s = state.select;

        switch (b.dataset.sel) {
            case 'fill': {
                if (!state.color) { toast('先在下面色卡里点一个颜色'); return; }
                let n = 0;
                for (let r = 0; r < D.rows; r++) {
                    for (let c = 0; c < D.cols; c++) {
                        if (!inSel(c, r)) continue;
                        const i = lidx(c, r);
                        if (D.grid[i] !== state.color) { D.grid[i] = state.color; n++; }
                    }
                }
                if (n) snapshot('填充选区');
                toast(n ? `填了 ${n.toLocaleString()} 格` : '选区内已经是这个颜色');
                break;
            }
            case 'clear': {
                clearSelContent();
                break;
            }
            case 'crop': {
                cropToSel();
                break;
            }
            case 'none':
                state.select = null;
                state.poly = [];
                break;
        }

        syncSelBar();
        renderProps();
        renderStats();
        requestRender();
    });

    // 形状切换
    const selShapeBox = $('selShape');
    if (selShapeBox) {
        selShapeBox.addEventListener('click', (e) => {
            const b = e.target.closest('[data-shape]');
            if (!b) return;
            state.selShape = b.dataset.shape;
            state.poly = [];            // 换形状就丢掉没闭合的顶点
            setTool('select');
            syncSelBar();
            renderProps();
            requestRender();
        });
    }

    // 合并方式切换（新建 / 加选 / 减选 / 交集）
    const selOpBox = $('selOps');
    if (selOpBox) {
        selOpBox.addEventListener('click', (e) => {
            const b = e.target.closest('[data-op]');
            if (!b || b.disabled) return;
            // 已经有选区时切到"新建"很容易手滑把选区弄没，这里给个明确提示
            state.selOp = b.dataset.op;
            state.poly = [];            // 换方式就丢掉没闭合的顶点
            setTool('select');
            syncSelBar();
            renderProps();
            requestRender();
        });
    }

    // 涂抹笔宽
    const selSmudgeInput = $('selSmudge');
    if (selSmudgeInput) {
        selSmudgeInput.addEventListener('input', (e) => {
            state.selSmudge = clamp(Number(e.target.value) || 1, 1, 6);
        });
    }

    /* 按住 Shift / Alt 时，把"这一笔会变成什么方式"提前亮出来。
       触屏没有修饰键，所以面板上的选择才是基准，这里只是预览。 */
    function previewMod(e) {
        const box = $('selOps');
        if (!box) return;
        const shift = !!e.shiftKey, alt = !!e.altKey;
        const op = shift && alt ? 'inter' : shift ? 'add' : alt ? 'sub' : null;
        box.querySelectorAll('[data-op]').forEach(b => {
            b.classList.toggle('is-mod', op === b.dataset.op);
        });
        const chip = $('selModChip');
        if (chip) {
            chip.hidden = !op;
            if (op) chip.textContent = `这一笔：${SEL_OP_NAME[op]}`;
        }
    }

    window.addEventListener('keydown', (e) => { if (e.key === 'Shift' || e.key === 'Alt') previewMod(e); });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift' || e.key === 'Alt') previewMod(e); });
    window.addEventListener('blur', () => previewMod({ shiftKey: false, altKey: false }));

    // 全选 / 反选 / 取消 / 闭合
    document.querySelectorAll('[data-selact]').forEach(b => {
        b.addEventListener('click', () => {
            switch (b.dataset.selact) {
                case 'all': selAll(); break;
                case 'invert': selInvert(); break;
                case 'none': selClear(); break;
                case 'close': closePolygon(); break;
            }
            if (state.tool || state.cmd) renderProps();
        });
    });

    /* =========================================================
     * 10d. 画笔库（本地）
     * ========================================================= */

    const BRUSH_KEY = 'perler.brushPresets.v1';
    let brushPresets = [];

    function loadBrushPresets() {
        try {
            const raw = localStorage.getItem(BRUSH_KEY);
            brushPresets = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(brushPresets)) brushPresets = [];
        } catch (_) {
            brushPresets = [];
        }
    }

    function saveBrushPresets() {
        try {
            localStorage.setItem(BRUSH_KEY, JSON.stringify(brushPresets));
        } catch (_) { /* 隐私模式下写不了，忽略 */ }
    }

    const SHAPE_LABEL = { square: '方块', round: '圆形', cross: '十字' };

    function renderBrushLib() {
        const host = $('brushLibList');
        if (!host) return;
        host.innerHTML = '';

        if (!brushPresets.length) {
            const e = document.createElement('span');
            e.className = 'cmd-empty';
            e.textContent = '还没有保存的笔刷';
            host.appendChild(e);
            return;
        }

        brushPresets.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'brush-chip';

            const use = document.createElement('button');
            use.type = 'button';
            use.className = 'brush-use';
            use.innerHTML = `<b>${p.name}</b><span>${SHAPE_LABEL[p.shape] || '方块'} ${p.size}</span>`;
            use.addEventListener('click', () => {
                state.brushSize = p.size;
                state.brushShape = p.shape;
                $('brushSize').value = p.size;
                document.querySelectorAll('#brushShape .mini-btn').forEach(b => {
                    b.classList.toggle('is-on', b.dataset.shape === p.shape);
                });
                requestRender();
                toast(`用上了「${p.name}」`);
            });

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'brush-del';
            del.textContent = '✕';
            del.title = '删除这个笔刷';
            del.addEventListener('click', () => {
                brushPresets.splice(i, 1);
                saveBrushPresets();
                renderBrushLib();
            });

            row.appendChild(use);
            row.appendChild(del);
            host.appendChild(row);
        });
    }

    $('btnBrushSave').addEventListener('click', () => {
        const name = window.prompt('给这个笔刷起个名字', `${SHAPE_LABEL[state.brushShape] || '方块'} ${state.brushSize}`);
        if (name === null) return;
        const n = (name || '').trim() || `笔刷 ${brushPresets.length + 1}`;
        brushPresets.push({ name: n, size: state.brushSize, shape: state.brushShape });
        saveBrushPresets();
        renderBrushLib();
        toast(`已保存「${n}」`);
    });

    loadBrushPresets();
    renderBrushLib();


    /* =========================================================
     * 11. 颜色面板
     * ========================================================= */

    let seriesFilter = '';

    function buildColorPanel() {
        // 系列
        const series = [...new Set(PAL.map(p => p.series).filter(Boolean))].sort();
        const host = $('colorSeries');
        host.innerHTML = '';

        const mk = (label, val) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.dataset.v = val;
            if (val === seriesFilter) b.classList.add('is-active');
            b.addEventListener('click', () => {
                seriesFilter = val;
                host.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x.dataset.v === val));
                renderColorGrid();
            });
            return b;
        };

        host.appendChild(mk('全部', ''));
        series.forEach(s => host.appendChild(mk(s, s)));

        renderColorGrid();
        syncColorUI();
    }

    function renderColorGrid() {
        const q = ($('colorSearch').value || '').trim().toUpperCase();
        const grid = $('colorGrid');
        grid.innerHTML = '';

        const list = PAL.filter(p => {
            if (seriesFilter && p.series !== seriesFilter) return false;
            if (q && !p.code.toUpperCase().includes(q)) return false;
            return true;
        });

        const frag = document.createDocumentFragment();
        list.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tc-cell';
            b.style.background = p.hex;
            b.dataset.code = p.code;
            b.title = `${p.code} · ${p.hex}`;
            if (p.code === state.color) b.classList.add('is-active');
            b.addEventListener('click', () => {
                state.color = p.code;
                syncColorUI();
            });
            frag.appendChild(b);
        });

        grid.appendChild(frag);
    }

    function syncColorUI() {
        const p = PAL_MAP.get(state.color);
        const hex = p ? p.hex : '#fff';

        $('currentSwatch').style.background = hex;
        $('currentCode').textContent = p ? p.code : '—';
        if ($('brushToolDot')) $('brushToolDot').style.background = hex;
        $('currentHex').textContent = p ? p.hex.toUpperCase() : '点色块选色';

        // 各处「当前颜色」色块跟着走，落笔/转换前能肉眼确认
        const chips = [
            ['fillColorDot', 'fillColorCode'],
            ['ccToDot', 'ccToCode'],
            ['olColorDot', 'olColorCode']
        ];
        chips.forEach(([dotId, codeId]) => {
            const d = $(dotId);
            const l = $(codeId);
            if (d) d.style.background = hex;
            if (l) l.textContent = p ? p.code : '未选';
        });

        document.querySelectorAll('.tc-cell').forEach(b => {
            b.classList.toggle('is-active', b.dataset.code === state.color);
        });

        if (state.cmd) refreshCmd();
    }

    $('colorSearch').addEventListener('input', renderColorGrid);

    /* =========================================================
     * 11. 参数控件
     * ========================================================= */

    $('brushSize').addEventListener('input', (e) => {
        state.brushSize = clamp(Number(e.target.value) || 1, 1, 20);
        requestRender();          // 预览框立刻跟着变大小
    });

    document.querySelectorAll('#brushShape .mini-btn').forEach(b => {
        b.addEventListener('click', () => {
            state.brushShape = b.dataset.shape;
            document.querySelectorAll('#brushShape .mini-btn').forEach(x => {
                x.classList.toggle('is-on', x === b);
            });
            requestRender();
        });
    });

    // 空格底色：擦掉的格子按这个颜色显示（导出时仍是空格）
    function syncEmptyColorUI() {
        const hex = (state.emptyColor || '#ffffff').toUpperCase();
        const dot = $('eraseColorDot');
        const label = $('eraseColorCode');
        if (dot) dot.style.background = hex;
        if (label) label.textContent = hex;
        const main = $('emptyColor');
        if (main && main.value !== hex.toLowerCase()) main.value = hex.toLowerCase();
        const pip = $('emptyColorPip');
        if (pip && pip.value !== hex.toLowerCase()) pip.value = hex.toLowerCase();
    }

    function setEmptyColor(v) {
        state.emptyColor = v;
        syncEmptyColorUI();
        requestRender();
    }

    ['emptyColor', 'emptyColorPip'].forEach(id => {
        $(id).addEventListener('input', (e) => setEmptyColor(e.target.value));
    });

    $('eraseColorChip').addEventListener('click', (e) => {
        // 点 chip 直接弹系统取色器（input 覆在 chip 上，点击落到 input 时不要再转一次）
        if (e.target.id === 'emptyColorPip') return;
        $('emptyColorPip').click();
    });

    syncEmptyColorUI();

    document.querySelectorAll('[data-flip]').forEach(b => {
        b.addEventListener('click', () => flip(b.dataset.flip));
    });

    $('fillColorChip').addEventListener('click', () => {
        $('colorSearch').focus();
        $('colorSearch').select();
    });

    $('ccToChip').addEventListener('click', () => {
        $('colorSearch').focus();
        $('colorSearch').select();
    });

    $('olColorChip').addEventListener('click', () => {
        $('colorSearch').focus();
        $('colorSearch').select();
    });

    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);

    /* =========================================================
     * 12. 缩放按钮
     * ========================================================= */

    $('zoomIn').addEventListener('click', () => {
        zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2);
    });
    $('zoomOut').addEventListener('click', () => {
        zoomAt(0.8, vp.clientWidth / 2, vp.clientHeight / 2);
    });
    $('zoomFit').addEventListener('click', fitView);

    /* =========================================================
     * 13. 图纸渲染（下载 / 预览共用）
     * ========================================================= */

    const OPT = {
        bead: 30,
        style: 'color-code',
        shape: 'round-square',
        legend: 'bottom',
        emptyColor: '#ffffff',
        grid: true,
        gridColor: '#9aa0aa',
        gridWidth: 1,
        coords: true,
        coordColor: '#000000',
        bigGrid: false,
        bigGridColor: '#8b4513',
        bigGridSize: 5,
        bigGridWidth: 2,
        watermark: ''
    };

    function usedColors() {
        const m = new Map();
        for (const code of D.grid) {
            if (!code) continue;
            m.set(code, (m.get(code) || 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }

    function renderChart(opts) {
        const bead = opts.bead;
        const used = usedColors().sort((a, b) => a[0].localeCompare(b[0], 'zh'));
        const total = used.reduce((n, [, c]) => n + c, 0);

        const chartW0 = D.cols * bead;
        const chartH0 = D.rows * bead;

        // 顶部摘要条：左边标题/水印，右边 [104x104/1024颗/23色]
        const summaryText = `[${D.cols}x${D.rows}/${total}颗/${used.length}色]`;
        const targetSumW = chartW0 * 0.36;
        let sumSize = Math.max(12, Math.floor(targetSumW / summaryText.length * 1.6));
        const probe = document.createElement('canvas').getContext('2d');
        probe.font = `bold ${sumSize}px system-ui, sans-serif`;
        const sumW = probe.measureText(summaryText).width;
        if (sumW > 0) sumSize = Math.max(12, Math.floor(sumSize * targetSumW / sumW));
        const summaryMargin = sumSize + 10;

        // 坐标框：四边各留一圈，每格一个框（v1 的样子）
        const coordSize = opts.coords ? Math.max(26, Math.round(bead * 1.4)) : 0;
        const padOuter = coordSize ? 0 : Math.max(6, bead * 0.2);

        const chartW = coordSize * 2 + chartW0 + padOuter * 2;
        const chartH = summaryMargin + coordSize * 2 + chartH0 + padOuter * 2;

        // ---- 图例尺寸 ----
        const legendColsMax = 10;
        let legend = null;
        let cw = chartW;
        let ch = chartH;

        // 标题不再带「N 种色 / M 颗」——右上角摘要已经写了，重复
        const legendTitle = '颜色图例';

        if (opts.legend !== 'none' && used.length) {
            if (opts.legend === 'wrap') {
                // 环绕图纸：左边两列 → 右边两列 → 下方（行数不限）
                const rectW = Math.max(52, Math.round(chartW0 * 0.072));
                const rectH = Math.max(18, Math.round(rectW / 3));
                const gap = Math.max(3, Math.round(rectW * 0.045));
                const rowH = Math.round(rectH * 1.55);
                const nameSize = Math.max(8, Math.floor(rectH * 0.52));
                const cols = 2;                                        // 每侧固定两列
                const margin = Math.max(10, Math.round(bead * 0.6));    // 色块区离坐标框的间距
                const sideW = cols * (rectW + gap) - gap;
                const sideH = chartH - summaryMargin;                   // 与图纸等高（含上下坐标框）
                const maxRows = Math.max(1, Math.floor(sideH / rowH));
                const sideCap = maxRows * cols;                         // 单侧容量

                // 分配：even = 左右对半分（真正「环绕」住图纸）；fill = 先灌满左边再往右走
                let leftN, rightN;
                if (opts.wrapSplit === 'fill') {
                    leftN = Math.min(used.length, sideCap);
                    rightN = Math.min(Math.max(used.length - leftN, 0), sideCap);
                } else {
                    leftN = Math.min(Math.ceil(used.length / 2), sideCap);
                    rightN = Math.min(used.length - leftN, sideCap);
                }
                const belowN = used.length - leftN - rightN;

                // 哪侧没色块就不给哪侧留宽，免得旁边空一大片
                const edge = Math.max(8, Math.round(bead * 0.35));
                const leftPad = (leftN ? margin + sideW : 0) + edge;
                const rightPad = (rightN ? margin + sideW : 0) + edge;

                cw = chartW + leftPad + rightPad;
                const belowCols = Math.max(1, Math.floor((cw - edge * 2) / (rectW + gap)));
                const belowRows = belowN ? Math.ceil(belowN / belowCols) : 0;
                ch = chartH + (belowRows ? belowRows * rowH + Math.round(bead * 0.6) : 0);

                legend = {
                    mode: 'wrap', rectW, rectH, gap, rowH, cols, nameSize, margin, sideW,
                    sideCap, leftN, rightN, belowN, belowCols, belowRows,
                    leftPad, rightPad, edge,
                    titleText: '', slots: null
                };
            } else {
                const rectW = Math.max(60, Math.round(chartW0 * 0.10));
                const rectH = Math.max(20, Math.round(rectW / 3));
                const gap = Math.max(4, Math.round(rectW * 0.05));
                const rowH = Math.round(rectH * 1.8);
                const titleSize = clamp(Math.round(chartW0 * 0.024), 13, 26);
                const nameSize = Math.max(8, Math.floor(rectH * 0.52));

                let cols;
                if (opts.legend === 'side') {
                    // 右侧栏：先一列，太高再拆两列
                    cols = 1;
                    const maxRows = Math.max(6, Math.floor((chartH - 60) / rowH));
                    if (used.length > maxRows) cols = Math.ceil(used.length / maxRows);
                } else {
                    // 底部：一行最多 10 块，宽度不够就往下折
                    const perRow = Math.max(1, Math.floor((chartW0 - 20) / (rectW + gap)));
                    cols = Math.min(legendColsMax, perRow, used.length);
                }

                const rows = Math.ceil(used.length / cols);
                const titleText = legendTitle;

                // 标题比色块排还宽时，画布按标题撑开——不然右侧图例的标题会被裁掉
                probe.font = `bold ${titleSize}px system-ui, sans-serif`;
                const titleW = probe.measureText(titleText).width;

                const blockW = cols * (rectW + gap) - gap;
                const legendW = Math.max(blockW, Math.ceil(titleW) + 6, 120);
                const legendH = titleSize + 12 + rows * rowH;

                legend = { mode: opts.legend, rectW, rectH, gap, rowH, cols, rows, titleSize, nameSize, legendW, legendH, titleText };

                if (opts.legend === 'side') {
                    cw = chartW + Math.round(bead * 0.8) + legend.legendW + 16;
                    ch = Math.max(chartH, legend.legendH + summaryMargin + 16);
                } else {
                    cw = Math.max(chartW, legend.legendW + 24);
                    ch = chartH + 22 + legend.legendH;
                }
            }
        }

        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(cw));
        c.height = Math.max(1, Math.round(ch));
        const g = c.getContext('2d');

        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);

        // 环绕图例的左侧占宽由实际色块决定，图纸按左边距对齐；其他布局图纸贴左
        const ox = legend && legend.mode === 'wrap'
            ? legend.leftPad + coordSize + padOuter
            : coordSize + padOuter;
        const oy = summaryMargin + coordSize + padOuter;

        // 环绕图例的落位：先填左边，再填右边，剩下的在下方一行行铺开
        if (legend && legend.mode === 'wrap') {
            const L = legend;
            const leftX0 = ox - coordSize - padOuter - L.margin - L.sideW;
            const rightX0 = ox + chartW0 + coordSize + padOuter + L.margin;
            const sideH = chartH - summaryMargin;
            const leftTop = summaryMargin + Math.max(0, (sideH - Math.ceil(L.leftN / L.cols) * L.rowH) / 2);
            const rightTop = summaryMargin + Math.max(0, (sideH - Math.ceil(L.rightN / L.cols) * L.rowH) / 2);
            const belowY0 = chartH + Math.round(bead * 0.3);
            const fullW = L.belowCols * (L.rectW + L.gap) - L.gap;
            const belowX0 = Math.round((cw - fullW) / 2);
            const stepX = L.rectW + L.gap;

            const slots = [];
            for (let i = 0; i < L.leftN; i++) {
                slots.push({
                    x: leftX0 + (i % L.cols) * stepX,
                    y: leftTop + Math.floor(i / L.cols) * L.rowH
                });
            }
            for (let i = 0; i < L.rightN; i++) {
                slots.push({
                    x: rightX0 + (i % L.cols) * stepX,
                    y: rightTop + Math.floor(i / L.cols) * L.rowH
                });
            }
            for (let i = 0; i < L.belowN; i++) {
                slots.push({
                    x: belowX0 + (i % L.belowCols) * stepX,
                    y: belowY0 + Math.floor(i / L.belowCols) * L.rowH
                });
            }

            L.slots = slots;
            L.x = leftX0;
            L.y = belowY0;
            L.startY = leftTop;
            L.zoneCounts = { left: L.leftN, right: L.rightN, below: L.belowN };
        }

        // ---- 四边坐标框 ----
        if (opts.coords) {
            const fontSizeCoord = Math.max(9, Math.floor(bead * 0.45));
            g.font = `${fontSizeCoord}px system-ui, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = opts.coordColor;
            g.strokeStyle = 'rgba(20,22,26,.72)';
            g.lineWidth = 1;

            const bx = (x, y, w, h) => g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

            // 豆子小到塞不下三位数时，改成每 5 格标一格（框也跟着合并）
            const step = bead >= 14 ? 1 : 5;
            const boxW = bead * step;

            // 上
            for (let col = 0; col < D.cols; col += step) {
                const x = ox + col * bead;
                bx(x, oy - coordSize, boxW, coordSize);
                g.fillText(String(Math.min(D.cols, col + step)), x + boxW / 2, oy - coordSize / 2);
            }
            // 下
            for (let col = 0; col < D.cols; col += step) {
                const x = ox + col * bead;
                bx(x, oy + chartH0, boxW, coordSize);
                g.fillText(String(Math.min(D.cols, col + step)), x + boxW / 2, oy + chartH0 + coordSize / 2);
            }
            // 左
            for (let r = 0; r < D.rows; r += step) {
                const y = oy + r * bead;
                bx(ox - coordSize, y, coordSize, boxW);
                g.fillText(String(Math.min(D.rows, r + step)), ox - coordSize / 2, y + boxW / 2);
            }
            // 右
            for (let r = 0; r < D.rows; r += step) {
                const y = oy + r * bead;
                bx(ox + chartW0, y, coordSize, boxW);
                g.fillText(String(Math.min(D.rows, r + step)), ox + chartW0 + coordSize / 2, y + boxW / 2);
            }
        }

        // ---- 珠子 ----
        for (let r = 0; r < D.rows; r++) {
            for (let col = 0; col < D.cols; col++) {
                const code = D.grid[lidx(col, r)];
                const x = ox + col * bead;
                const y = oy + r * bead;

                if (!code) {
                    g.fillStyle = opts.emptyColor;
                    g.fillRect(x, y, bead, bead);
                    continue;
                }

                const p = PAL_MAP.get(code);
                const hex = p ? p.hex : '#ffffff';

                if (opts.style === 'symbol') {
                    g.fillStyle = '#ffffff';
                    g.fillRect(x, y, bead, bead);
                } else {
                    g.fillStyle = hex;
                    paintBead(g, x, y, bead, opts.shape, hex);
                }

                if (opts.style !== 'color' && bead >= 12) {
                    // 色号长度不一样，字号跟着缩，三位色号挤不进四格宽就白瞎了
                    const base = Math.max(6, Math.floor(bead * 0.45));
                    const len = code.length;
                    const fs = len <= 1 ? Math.floor(base * 1.1)
                        : len === 2 ? base
                            : len === 3 ? Math.floor(base * 0.86)
                                : Math.floor(base * 0.72);

                    g.fillStyle = opts.style === 'symbol'
                        ? '#111111'
                        : (luminance(hex) > 0.62 ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.86)');
                    g.font = `600 ${fs}px system-ui, sans-serif`;
                    g.textAlign = 'center';
                    g.textBaseline = 'middle';
                    g.fillText(code, x + bead / 2, y + bead / 2 + 0.5);
                }
            }
        }

        // ---- 网格线 ----
        if (opts.grid) {
            g.strokeStyle = opts.gridColor;
            g.lineWidth = Math.max(0.5, opts.gridWidth);
            g.beginPath();
            for (let col = 0; col <= D.cols; col++) {
                const x = ox + col * bead + 0.5;
                g.moveTo(x, oy);
                g.lineTo(x, oy + chartH0);
            }
            for (let r = 0; r <= D.rows; r++) {
                const y = oy + r * bead + 0.5;
                g.moveTo(ox, y);
                g.lineTo(ox + chartW0, y);
            }
            g.stroke();
        }

        // ---- 大格子线 ----
        if (opts.bigGrid) {
            g.strokeStyle = opts.bigGridColor;
            g.lineWidth = Math.max(0.5, opts.bigGridWidth);
            g.beginPath();
            for (let col = 0; col <= D.cols; col += opts.bigGridSize) {
                const x = ox + col * bead + 0.5;
                g.moveTo(x, oy);
                g.lineTo(x, oy + chartH0);
            }
            for (let r = 0; r <= D.rows; r += opts.bigGridSize) {
                const y = oy + r * bead + 0.5;
                g.moveTo(ox, y);
                g.lineTo(ox + chartW0, y);
            }
            g.stroke();
        }

        // ---- 顶栏：左标题/水印，右摘要 ----
        const summaryY = summaryMargin / 2 + 1;
        const leftText = opts.watermark || D.name || '';
        if (leftText) {
            g.font = `${Math.max(10, Math.floor(sumSize * 0.7))}px system-ui, sans-serif`;
            g.fillStyle = '#666';
            g.textAlign = 'left';
            g.textBaseline = 'middle';
            g.fillText(leftText, ox, summaryY);
        }

        g.font = `bold ${sumSize}px system-ui, sans-serif`;
        g.fillStyle = '#333';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(summaryText, ox + chartW0, summaryY);

        // 布局量留给自动化测试核对用
        c.__meta = {
            summaryText, summaryMargin, sumSize, coordSize, padOuter,
            ox, oy, chartW0, chartH0, chartW, chartH, legend
        };

        // ---- 图例 ----
        if (legend) {
            const paintBlock = (x, y, code, count) => {
                const p = PAL_MAP.get(code);
                const hex = p ? p.hex : '#ffffff';

                g.fillStyle = hex;
                g.fillRect(x, y, legend.rectW, legend.rectH);
                g.strokeStyle = 'rgba(20,22,26,.28)';
                g.lineWidth = 1;
                g.strokeRect(x + 0.5, y + 0.5, legend.rectW - 1, legend.rectH - 1);

                const label = `${code} × ${count}`;
                g.fillStyle = luminance(hex) > 0.62 ? 'rgba(0,0,0,.78)' : '#fff';
                g.font = `600 ${legend.nameSize}px system-ui, sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                // 色号长（三位数 + 大数量）就缩字号，别顶出色块
                const tw = g.measureText(label).width;
                if (tw > legend.rectW - 6) {
                    const fs = Math.max(6, Math.floor(legend.nameSize * (legend.rectW - 6) / tw));
                    g.font = `600 ${fs}px system-ui, sans-serif`;
                }
                g.fillText(label, x + legend.rectW / 2, y + legend.rectH / 2 + 0.5);
            };

            if (legend.mode === 'wrap') {
                used.forEach(([code, count], i) => {
                    const s = legend.slots[i];
                    if (s) paintBlock(s.x, s.y, code, count);
                });
            } else {
                const bottom = legend.mode === 'bottom';
                const lx = bottom ? Math.max(ox, (c.width - legend.legendW) / 2) : ox + chartW0 + Math.round(bead * 0.8) + 16;
                const ly = bottom ? chartH + 18 : summaryMargin;

                // 标题
                g.font = `bold ${legend.titleSize}px system-ui, sans-serif`;
                g.fillStyle = '#667eea';
                g.textAlign = 'left';
                g.textBaseline = 'top';
                g.fillText(legend.titleText, lx, ly);

                const startY = ly + legend.titleSize + 12;
                legend.x = lx;
                legend.y = ly;
                legend.startY = startY;

                used.forEach(([code, count], i) => {
                    const col = i % legend.cols;
                    const row = Math.floor(i / legend.cols);
                    paintBlock(lx + col * (legend.rectW + legend.gap), startY + row * legend.rowH, code, count);
                });
            }
        }

        return c;
    }

    function paintBead(g, x, y, size, shape, hex) {
        if (shape === 'square') {
            g.fillRect(x, y, size, size);
            return;
        }

        if (shape === 'ring') {
            const cx = x + size / 2;
            const cy = y + size / 2;
            const outer = size / 2 - 0.5;
            const inner = outer * 0.56;
            g.beginPath();
            g.arc(cx, cy, outer, 0, Math.PI * 2);
            g.fill();
            // 内圈要「填白」而不是 destination-out：擦成透明的话，
            // 导出的 PNG 里环心是透明的，贴到深色底上会露出底色。
            g.save();
            g.fillStyle = '#ffffff';
            g.beginPath();
            g.arc(cx, cy, inner, 0, Math.PI * 2);
            g.fill();
            g.restore();
            return;
        }

        // round-square
        roundRect(g, x + 0.5, y + 0.5, size - 1, size - 1, Math.min(size * 0.22, 7));
        g.fill();
    }

    /* =========================================================
     * 14. 抽屉 / 弹层
     * ========================================================= */

    const drawer = $('drawer');
    const scrim = $('scrim');
    const historySheet = $('historySheet');
    const infoSheet = $('infoSheet');

    function openDrawer(kind) {
        $('drawerTitle').textContent = kind === 'iron' ? '预览成品效果' : '下载拼豆图纸';
        drawer.hidden = false;
        scrim.hidden = false;
        $('drawerConfirm').textContent = kind === 'iron' ? '生成预览' : '生成并下载';
        drawer.dataset.kind = kind;

        // 画布上的空格底色带进导出设置，所见即所得
        $('optEmptyColor').value = state.emptyColor || '#ffffff';
    }

    function closeDrawer() {
        drawer.hidden = true;
        scrim.hidden = true;
    }

    function closeSheets() {
        historySheet.hidden = true;
        infoSheet.hidden = true;
        $('smartSheet').hidden = true;
        scrim.hidden = true;
        soClose();
    }

    $('btnDownload').addEventListener('click', () => openDrawer('download'));
    $('btnIron').addEventListener('click', openIronPreview);
    $('btnHistory').addEventListener('click', () => { renderHistory(); historySheet.hidden = false; scrim.hidden = false; });

    $('drawerClose').addEventListener('click', closeDrawer);
    $('drawerCancel').addEventListener('click', closeDrawer);
    $('historyClose').addEventListener('click', closeSheets);
    $('infoClose').addEventListener('click', closeSheets);
    $('smartClose').addEventListener('click', closeSheets);
    $('smartCancel').addEventListener('click', closeSheets);
    scrim.addEventListener('click', () => { closeDrawer(); closeSheets(); });

    $('drawerConfirm').addEventListener('click', () => {
        readOptions();
        const kind = drawer.dataset.kind;

        const c = renderChart(OPT);
        c.toBlob(blob => {
            if (!blob) { toast('生成失败'); return; }
            const safe = (D.name || '拼豆图纸').replace(/[\\/:*?"<>|]/g, '_');
            const d = new Date();
            const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
            download(blob, `${safe}_${D.cols}x${D.rows}_${stamp}.png`);
            toast('图纸已下载');
            closeDrawer();
        }, 'image/png');
    });

    function readOptions() {
        const bead = clamp(Number($('optBeadNum').value) || 30, 10, 60);
        OPT.bead = bead;
        OPT.style = $('optStyle').value;
        OPT.shape = $('optShape').value;
        OPT.legend = $('optLegend').value;
        OPT.emptyColor = $('optEmptyColor').value;
        OPT.grid = $('optGrid').checked;
        OPT.gridColor = $('optGridColor').value;
        OPT.gridWidth = Number($('optGridWidth').value);
        OPT.coords = $('optCoords').checked;
        OPT.coordColor = $('optCoordColor').value;
        OPT.bigGrid = $('optBigGrid').checked;
        OPT.bigGridColor = $('optBigGridColor').value;
        OPT.bigGridSize = clamp(Number($('optBigGridSize').value) || 5, 2, 20);
        OPT.bigGridWidth = Number($('optBigGridWidth').value);
        OPT.watermark = $('optWatermark').value.trim();
    }

    // 豆子尺寸滑块与数字联动
    $('optBead').addEventListener('input', () => {
        $('optBeadNum').value = $('optBead').value;
    });
    $('optBeadNum').addEventListener('input', () => {
        $('optBead').value = $('optBeadNum').value;
    });

    /* ---------- 操作历史 ---------- */

    function renderHistory() {
        const list = $('histList');
        list.innerHTML = '';

        if (!history.stack.length) {
            list.innerHTML = '<li class="hist-empty">还没有操作</li>';
            return;
        }

        history.stack.forEach((s, i) => {
            const li = document.createElement('li');
            if (i === history.index) li.classList.add('is-current');
            li.innerHTML = `<span class="hist-idx">${i + 1}</span><span>${s.label}</span>`;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                restore(i);
                renderHistory();
            });
            list.appendChild(li);
        });

        // 滚到当前项
        requestAnimationFrame(() => {
            const cur = list.querySelector('.is-current');
            if (cur) cur.scrollIntoView({ block: 'nearest' });
        });
    }

    /* =========================================================
     * 15. 顶部其他操作
     * ========================================================= */

    function safeName() {
        return (D.name || '拼豆图纸').replace(/[\\/:*?"<>|]/g, '_');
    }

    function currentDoc() {
        const colors = {};
        usedColors().forEach(([code]) => {
            const p = PAL_MAP.get(code);
            if (p) colors[code] = p.hex;
        });
        return {
            v: 2,
            name: D.name,
            cols: D.cols,
            rows: D.rows,
            grid: D.grid,
            palette: D.palette,
            colors,
            beadSize: OPT.bead,
            savedAt: new Date().toISOString()
        };
    }

    /* ---------- 图纸数据 → v1 的数据形状 ---------- */

    // v1 那套模块（图纸信息编码、成品预览）吃的是二维 perlerColors 数组，
    // 这里统一转一次；只在打开弹层时转，编辑过程中不背这个开销。
    function gridMatrix() {
        const m = new Array(D.rows);
        for (let r = 0; r < D.rows; r++) {
            const row = new Array(D.cols);
            for (let c = 0; c < D.cols; c++) {
                const code = D.grid[lidx(c, r)];
                if (!code) {
                    row[c] = { name: 'transparent', rgb: [255, 255, 255], hex: '#ffffff', isTransparent: true };
                    continue;
                }
                const p = PAL_MAP.get(code);
                row[c] = {
                    name: code,
                    hex: p ? p.hex : '#ffffff',
                    rgb: p ? p.rgb : [255, 255, 255],
                    isTransparent: false
                };
            }
            m[r] = row;
        }
        return m;
    }

    /* ---------- 导出图纸信息 ---------- */

    const infoMgr = new InfoPaperManager();
    let infoTextCache = '';

    // 编码成 v1 的 INFOPAPER_V1 紧凑格式（RLE + gzip + base64），跨版本通用
    async function buildInfoText() {
        const paper = infoMgr.converter.toInfoPaper(gridMatrix(), D.palette, D.cols, D.rows);
        const packed = await infoMgr.compressor.pack(paper);
        return { paper, packed };
    }

    async function refreshInfoSheet() {
        const badge = $('infoBadge');
        const ta = $('infoText');
        badge.textContent = '正在打包…';
        badge.classList.remove('is-error');
        ta.value = '';
        infoTextCache = '';

        if (!D.grid.some(Boolean)) {
            badge.textContent = '图纸还是空的，先画点什么再导出';
            badge.classList.add('is-error');
            return;
        }

        try {
            const { paper, packed } = await buildInfoText();
            infoTextCache = packed;
            const counts = paper.metadata.colorCounts;
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            badge.textContent = `${D.cols} × ${D.rows} · ${total} 颗豆 · ${Object.keys(counts).length} 色 · 文本 ${(packed.length / 1024).toFixed(1)} KB`;
            ta.value = packed;
        } catch (e) {
            badge.textContent = '打包失败：' + (e && e.message ? e.message : e);
            badge.classList.add('is-error');
        }
    }

    function openInfoSheet() {
        infoSheet.hidden = false;
        scrim.hidden = false;
        refreshInfoSheet();
    }

    async function currentInfoText() {
        if (infoTextCache) return infoTextCache;
        const { packed } = await buildInfoText();
        infoTextCache = packed;
        return packed;
    }

    $('btnExportInfo').addEventListener('click', openInfoSheet);

    $('infoCopy').addEventListener('click', async () => {
        let text = '';
        try {
            text = await currentInfoText();
        } catch (e) {
            toast('打包失败');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            toast('图纸信息已复制到剪贴板');
        } catch (_) {
            // http / 权限被拒时的兜底：从只读文本框里选中再执行拷贝
            const ta = $('infoText');
            ta.focus();
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            toast(ok ? '图纸信息已复制' : '复制失败，请手动全选复制');
        }
    });

    $('infoTxt').addEventListener('click', async () => {
        let text = '';
        try {
            text = await currentInfoText();
        } catch (e) {
            toast('打包失败');
            return;
        }
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        download(blob, `${safeName()}_${D.cols}x${D.rows}_图纸信息.txt`);
        toast('txt 已下载');
    });

    $('infoJson').addEventListener('click', () => {
        const doc = currentDoc();
        const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
        download(blob, `${safeName()}.json`);
        toast('工程文件已下载');
    });

    /* ---------- 成品预览（v1 的特殊烫渲染） ---------- */

    // v1 的预览模块只认 perlerColors / perlerWidth / perlerHeight，
    // 用一个适配对象接过来，预览代码本身一行不改。
    const IronView = Object.create(IronPreviewMixin);

    // 澡巾纹理是 318KB 的 base64，编辑器首屏不背这个包袱，点预览时再拉
    let ironTexLoading = null;

    function ensureIronTextures() {
        if (window.IRON_ZAOJIN_TILES) return Promise.resolve();
        if (!ironTexLoading) {
            ironTexLoading = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'data/iron-textures/tiles.js';
                s.onload = () => resolve();
                s.onerror = () => { ironTexLoading = null; reject(new Error('纹理加载失败')); };
                document.head.appendChild(s);
            });
        }
        return ironTexLoading;
    }

    async function openIronPreview() {
        if (!D.grid.some(Boolean)) {
            toast('图纸还是空的，先画点什么');
            return;
        }

        if (!window.IRON_ZAOJIN_TILES) {
            toast('正在准备纹理…');
            try { await ensureIronTextures(); } catch (_) { /* 没纹理也能出图，澡巾会退化成纯颗粒 */ }
        }

        IronView.perlerColors = gridMatrix();
        IronView.perlerWidth = D.cols;
        IronView.perlerHeight = D.rows;
        IronView.openIronPreview();
    }

    $('btnSave').addEventListener('click', () => {
        let list = [];
        try {
            list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (_) { list = []; }

        const doc = currentDoc();

        // 同画布尺寸 + 同名视为覆盖
        const idx = list.findIndex(x => x.name === doc.name && x.cols === doc.cols && x.rows === doc.rows);
        if (idx >= 0) list[idx] = doc;
        else list.unshift(doc);

        if (list.length > 30) list = list.slice(0, 30);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            toast(idx >= 0 ? '已更新到我的图纸' : '已保存到我的图纸');
        } catch (_) {
            toast('存储空间不足，先删几张旧图纸');
        }
    });

    $('docName').addEventListener('change', (e) => {
        D.name = e.target.value.trim() || '未命名图纸';
        e.target.value = D.name;
        syncRegionMeta();
    });

    /* =========================================================
     * 16. 元信息
     * ========================================================= */

    function updateDocMeta() {
        const used = usedColors().length;
        $('docMeta').textContent = `${D.cols} × ${D.rows} · ${used} 色`;
    }

    /* =========================================================
     * 17. 初始化
     * ========================================================= */

    async function boot() {
        await loadDoc();
        buildToolbar();
        buildColorPanel();

        // 默认颜色：用图里出现最多的，否则色卡第一个
        const used = usedColors();
        state.color = used.length ? used[0][0] : (PAL[0] ? PAL[0].code : '');
        state.lastPicked = state.color;
        syncColorUI();

        $('docName').value = D.name;
        updateDocMeta();
        syncSizePanel();

        // 手机上先收起次面板，把画布让出来
        if (window.innerWidth <= 760) setFolded(true);
        syncInspOpenFlag();

        resizeCanvas();
        // 从存档恢复的话，相机位置也跟着恢复（restoreWorld 里已经写好了 view）
        // 但窗口尺寸可能变了，得重算缩放基准
        if (restoredFromStore) {
            fitViewScaleOnly();
        } else {
            fitView();
        }
        updateZoomLabel();

        // 左下角小窗：独立 DOM canvas，自带指针事件
        miniSetup();
        requestRender();

        snapshot('打开');

        // "打开"这一步不算改动：把刚才那次待写撤掉，
        // 否则一进页面就往存档里写一份，跟用户动没动手没关系
        cancelPendingSave();

        // 侧栏 / 次面板的宽度动画期间，容器每帧都在变尺寸；等它稳定下来再重设
        // backing store，否则每次 canvas.width 赋值都会清空画面，看着像在刷新
        let resizeTimer = null;
        new ResizeObserver(() => {
            if (!vp.clientWidth || !vp.clientHeight) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                resizeCanvas();
                requestRender();
            }, 80);
        }).observe(vp);

        // 顶部按钮尺寸 + 工具展开会影响画布宽度
        requestAnimationFrame(() => {
            resizeCanvas();
            requestRender();
        });

        // 自动化测试用的只读钩子（带 ?debug 才挂，正式页面不暴露）
        if (location.search.includes('debug')) {
            window.__ed = { D, state, view, inSel, selSize, selBounds, toCell, rectMask, polyMask,
                SO, soPaint, snapshot, renderChart, OPT, usedColors, PAL_MAP, IronView,
                W, gidx, lidx, localOf, toLocal, regionAt, worldBounds, makeRegion, bindRegion, syncRegionMeta,
                setCellWorld: (wc, wr, code) => setCell(wc, wr, code),
                draftCount, serializeDrafts, loadDrafts, getDraft,
                miniMap, miniSetup, drawMinimap, miniComputeBounds, miniJumpTo, miniJumpToWorld,
                flip, trimBounds, cropToSel,
                // 持久化
                serializeWorld, restoreWorld, markDirty, flushSave, saveWorldNow, cancelPendingSave,
                store: window.WorldStore,
                render: () => requestRender(),
                redraw: () => { fitView(); requestRender(); } };
        }
    }

    boot();

})();
