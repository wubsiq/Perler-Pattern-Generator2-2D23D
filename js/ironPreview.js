/**
 * IronPreviewMixin — 拼豆成品"特殊烫"效果预览（v5 写实版）
 *
 * ============================================================
 *  【v2 迁移说明】
 * ============================================================
 *  这份是从 v1 的 mixins/IronPreviewMixin.js 整份搬过来的，逐字不动，
 *  只在文件末尾去掉了「挂到 PixelArtGenerator.prototype」那一行。
 *
 *  v2 的用法（见 js/editor.js）：新建一个空对象继承 IronPreviewMixin，
 *  给它三个属性就够——perlerColors（二维 {name, rgb, hex, isTransparent}）、
 *  perlerWidth、perlerHeight，然后调 openIronPreview()。
 *  预览本身所有状态都存在实例上，不同实例互不干扰。
 *
 *  ⚠️ 改效果请改这份；v1 那份是旧壳子，等 v1 清理时一起删。
 *
 * ============================================================
 *  【物理模型】—— 这是本文件所有算法的基础
 * ============================================================
 *  拼豆是塑料。烫 = 高温加热融化 → 缝隙消失 → 连成一整块塑料平板。
 *
 *  ▸ 正常烫（只加热，无压贴物）
 *      · 边缘豆：外侧没有邻居约束，受热向外流动 → 边缘微微鼓起、圆润
 *      · 内部豆：四周都有豆子互相约束 → 保持较规范的正方形（仅些许扭曲）
 *      · 表面：平整微哑光，仍能隐约看出豆子的方格轮廓
 *
 *  ▸ 特殊烫（融化未凝固时用不规则物体压贴，凝固后取下）
 *      · 表面留下不规则的形变纹理（压痕/褶皱/颗粒）
 *      · 此时外轮廓也被模具限制 → 边缘不会太扭曲，只是圆润起伏
 *      · 纹理以不规则为主（绝不是规整的网格贴图）
 *
 * ============================================================
 *  【v5 相比 v4 的 3 个关键修正】
 * ============================================================
 *  ① 【内部豆零空隙】相邻豆子共用顶点/共线边必须严丝合缝。
 *     v4 给内部角加了 s×0.06 圆角 → 相邻 4 颗豆的圆角在交汇处
 *     留下小菱形空洞。v5 规定：内部角圆角一律为 0、内部边一律不位移。
 *  ② 【外部豆＝奶油边】外圈不是每颗豆孤立膨胀，而是连成一条
 *     "相互融合"的起伏波浪边（像奶油挤压）：
 *     · 外推量改用 _contourNoise()（相邻格取值相近）而非独立随机
 *     · 相邻边缘豆共用的顶点也向外位移（≈弧线凸起量的一半）→ 无凹口
 *     · 只有"凸角"（相邻两边都朝外）才用大圆角 s×0.22
 *  ③ 【纹理改为"蒙版叠层"】用户指出的关键做法。以澡巾烫为例：
 *     用 fbm 噪声生成 alpha 蒙版（_tile_noiseMask），以 destination-in
 *     叠到颗粒层上，按噪声浓淡擦除 → 颗粒成簇、浓淡不均（不规则质感）；
 *     再叠一层均匀弱颗粒兜底 → 整体仍是磨砂面。毛巾烫同理。
 *
 * ============================================================
 *  【渲染流水线】drawIronPreview() 共 4 层，全部 clip 到豆子轮廓内
 * ============================================================
 *  ① 底板（离屏 + 高斯模糊）→ 塑料融平融合感
 *  ② 纹理层（塑料基底颗粒 + fbm 连续起伏 + 特征纹理 [+ 蒙版叠层]）
 *  ③ 豆子格线（烫后仍隐约可见的方格轮廓）
 *  ④ 光照层（方向明暗 + 斜向光泽带 + 边缘内阴影 + 边缘豆顶部反光）
 */

const IronPreviewMixin = {

    // ============================================================
    //  〇、渲染预算（性能开关集中在这里）
    // ============================================================

    /**
     * 预览渲染的最长边像素上限。
     *
     * 预览是"看效果"，屏幕一次也就显示一千多像素，
     * 按倍率无脑堆到 6000×6000（3600 万像素）纯属浪费：
     * 混合、模糊、格线全都是按面积计费的。超过这个边长就自动降分辨率。
     */
    _IRON_PREVIEW_MAX_PX: 2800,
    /** 点"导出"时按这个上限重画一遍（导出是一次性动作，可以画大一点） */
    _IRON_EXPORT_MAX_PX: 4800,
    /**
     * 纹理的"标准豆径"。
     *
     * 所有 tile（颗粒/纤维/褶皱/闪片…）的花纹都按这个豆径设计，
     * 渲染时再按实际 cellSize 等比缩放 → 1×/1.5×/4× 倍率下
     * "一颗豆子上有多少颗粒"始终一致，不会倍率一变质感就换了个东西。
     */
    _IRON_TILE_BASE_CELL: 30,

    /**
     * 【像素级浮雕参数】摆幅与溢出压缩系数。
     *
     * 实测标定（参考图梯度 RMS 7~19.7、绝对摆幅 53~252 灰阶）：
     *   swing=145 时 → 纯白 摆幅 120 / 梯度 11.5
     *                  纯黑 摆幅  71 / 梯度  6.4
     *   都在参考图区间内。调这个值就是调"浮雕有多深"。
     *
     * knee：超界压缩系数。硬 clamp（0）会让黑白两端的纹理被切平，
     * 正好是要修的问题，所以必须 >0。实测 0.35~0.6 观感差异不大。
     */
    _IRON_RELIEF_SWING: 145,
    _IRON_RELIEF_KNEE: 0.45,

    // ============================================================
    //  一、模态框管理
    // ============================================================

    openIronPreview() {
        if (!this._ironPreviewModal) {
            this._ironPreviewModal = this._createIronPreviewModal();
            document.body.appendChild(this._ironPreviewModal);
        }
        this._ironPreviewModal.style.display = 'flex';
        this._refreshIronPreview();
        // 上次关窗前停在 3D 的话，重新拉起 GL 循环（closeIronPreview 会 stop 掉）
        if (this._ironPreviewState && this._ironPreviewState.view === '3d') {
            this._setIronView('3d');
        }
    },

    closeIronPreview() {
        if (this._ironPreviewModal) {
            this._ironPreviewModal.style.display = 'none';
        }
        // 关掉就停循环：不然背景里一直 60fps 在画，笔记本风扇会叫
        if (this._iron3d) this._iron3d.stop();
    },

    /** 创建模态框（只创建一次） */
    _createIronPreviewModal() {
        const modal = document.createElement('div');
        modal.id = 'ironPreviewModal';
        Object.assign(modal.style, {
            display: 'flex', position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.8)', zIndex: '9999',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px',
            padding: '20px', boxSizing: 'border-box'
        });

        const controls = document.createElement('div');
        controls.className = 'iron-controls';
        Object.assign(controls.style, {
            display: 'flex', gap: '14px', alignItems: 'center',
            background: '#222', color: '#fff', padding: '10px 16px',
            borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            flexWrap: 'wrap'
        });

        controls.innerHTML = `
            <span style="font-weight:600;font-size:15px;">🎨 特殊烫预览</span>

            <div class="iron-viewtabs" id="ironViewTabs">
                <button type="button" data-view="2d" class="is-on">平面</button>
                <button type="button" data-view="3d">3D 旋转</button>
            </div>
            <label id="ironAutoSpinRow" style="display:none;align-items:center;gap:4px;font-size:13px;" title="让成品缓慢自转，方便看闪光晶体在不同角度的反光">
                <input type="checkbox" id="ironAutoSpinToggle">
                自动转
            </label>

            <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                效果：
                <select id="ironModeSelect" style="padding:4px 6px;border-radius:4px;background:#333;color:#fff;border:1px solid #555;font-size:13px;">
                    <option value="normal">正常烫（边缘鼓起）</option>
                    <option value="zaoJin" selected>澡巾烫（颗粒磨砂）</option>
                    <option value="maoJin">毛巾烫（绒面纤维）</option>
                    <option value="huaFuGe">华夫格烫（方格凹凸）</option>
                    <option value="lingGe">菱格烫（斜格压花）</option>
                    <option value="hongBeiZhi">烘焙纸烫（揉皱褶皱）</option>
                    <option value="xiShan">细闪烫（细密闪粉）</option>
                    <option value="geLiTe">格利特烫（粗闪片）</option>
                    <option value="xianDuRiLa">仙度瑞拉烫（镜面星闪）</option>
                </select>
            </label>

            <label style="display:flex;align-items:center;gap:6px;font-size:13px;" id="ironZaoJinRow">
                织纹：
                <select id="ironZaoJinSelect" style="padding:4px 6px;border-radius:4px;background:#333;color:#fff;border:1px solid #555;font-size:13px;"></select>
                <button id="ironTexTuneBtn" title="展开/收起花纹大小与旋转（松手后才重画）"
                    style="padding:2px 7px;background:#3a3a3a;color:#bbb;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:11px;">几何 ▸</button>
            </label>

            <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                强度：
                <input type="range" id="ironIntensitySlider" min="0" max="100" value="75" style="width:100px;">
                <span id="ironIntensityValue" style="font-size:12px;">75%</span>
            </label>

            <label style="display:flex;align-items:center;gap:6px;font-size:13px;"
                title="渲染精度：预览已经自动缩放到窗口里，这一项只决定位图有多少像素（影响清晰度和导出前的预览画质），不再改变显示大小">
                精度：
                <select id="ironZoomSelect" style="padding:4px 6px;border-radius:4px;background:#333;color:#fff;border:1px solid #555;font-size:13px;">
                    <option value="1.0">1×</option>
                    <option value="1.5" selected>1.5×</option>
                    <option value="2.0">2×</option>
                    <option value="3.0">3×</option>
                    <option value="4.0">4×</option>
                </select>
            </label>

            <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                背景：
                <input type="color" id="ironBgColor" value="#2a2a2a" style="width:26px;height:22px;padding:0;border:none;">
                <button id="ironBgTransparent" title="导出 PNG 时带透明通道，方便直接贴到任何底色上"
                    style="padding:3px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;font-size:12px;">透明</button>
            </label>

            <label style="display:flex;align-items:center;gap:4px;font-size:13px;" title="独立叠层：在成品表面均匀撒一层闪光晶体，和上面选的烫法互不影响">
                <input type="checkbox" id="ironGlitterToggle">
                ✨ 闪光层
            </label>
            <button id="ironGlitterTuneBtn" title="展开/收起闪光晶体参数（松手后才重画）"
                style="padding:3px 8px;background:#3a3a3a;color:#bbb;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:12px;">闪光 ▸</button>

            <label style="display:flex;align-items:center;gap:4px;font-size:13px;" title="熨烫熔融边：用平滑并集(metaball)把相邻豆子粘连，凹角自动填平、凸角圆润">
                <input type="checkbox" id="ironMeltToggle">
                熔融边
            </label>

            <button id="ironMeltTuneBtn" title="展开/收起熔融参数（松手后才重画，拖动时不会卡）"
                style="padding:3px 8px;background:#3a3a3a;color:#bbb;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:12px;">参数 ▸</button>

            <label style="display:flex;align-items:center;gap:4px;font-size:13px;" title="成品落在桌面上的柔和投影（透明背景下建议关掉）">
                <input type="checkbox" id="ironShadowToggle" checked>
                投影
            </label>
            <button id="ironShadowTuneBtn" title="展开/收起投影参数（松手后才重画，拖动时不会卡）"
                style="padding:3px 8px;background:#3a3a3a;color:#bbb;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:12px;">影子 ▸</button>

            <span style="font-size:11px;color:#8a8a8a;">选"透明"后预览用棋盘格示意，导出的 PNG 才有 alpha</span>

            <button id="ironExportBtn" style="padding:5px 12px;background:#4CAF50;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;">💾 导出</button>
            <button id="ironCloseBtn" style="padding:5px 12px;background:#f44336;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px;">✕ 关闭</button>
        `;

        // ---- 花纹几何参数面板（大小 / 旋转，默认收起）----
        const texPanel = document.createElement('div');
        texPanel.id = 'ironTexPanel';
        texPanel.style.cssText = 'display:none;flex-wrap:wrap;gap:8px 16px;align-items:center;' +
            'padding:6px 10px;margin-top:6px;background:#242424;border:1px solid #3a3a3a;border-radius:6px';

        this._ironTexGeomSpec().forEach(sp => {
            const lab = document.createElement('label');
            lab.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#bbb';
            lab.title = sp.title;

            const name = document.createElement('span');
            name.textContent = sp.label;
            name.style.cssText = 'color:#fb9;min-width:28px';

            const input = document.createElement('input');
            input.type = 'range';
            input.id = 'ironTex_' + sp.id;
            input.min = sp.min; input.max = sp.max; input.step = sp.step;
            input.value = sp.def;
            input.style.cssText = 'width:104px';
            input.title = sp.title;

            const val = document.createElement('span');
            val.id = 'ironTexVal_' + sp.id;
            val.style.cssText = 'font-size:11px;color:#999;min-width:44px;text-align:right;' +
                'font-variant-numeric:tabular-nums';

            lab.appendChild(name);
            lab.appendChild(input);
            lab.appendChild(val);
            texPanel.appendChild(lab);
        });

        const texResetBtn = document.createElement('button');
        texResetBtn.id = 'ironTexResetBtn';
        texResetBtn.textContent = '复位';
        texResetBtn.title = '把花纹恢复到该变体的默认大小与角度';
        texResetBtn.style.cssText = 'padding:3px 9px;background:#444;color:#ddd;border:1px solid #666;' +
            'border-radius:4px;cursor:pointer;font-size:12px';
        texPanel.appendChild(texResetBtn);

        // ---- 熔融参数面板（默认收起）----
        // 【为什么默认收起】熔融边本身是可选特性，四个滑杆是调参时才用得上的。
        //  收起来不影响日常使用，也让控件行不挤。
        const meltPanel = document.createElement('div');
        meltPanel.id = 'ironMeltPanel';
        meltPanel.style.cssText = 'display:none;flex-wrap:wrap;gap:8px 16px;align-items:center;' +
            'padding:8px 10px;margin-top:8px;background:#242424;border:1px solid #3a3a3a;border-radius:6px';

        // 四个滑杆由 spec 生成，避免 UI 里的 range 和默认值两处漂移
        this._ironMeltParamSpec().forEach(sp => {
            const lab = document.createElement('label');
            lab.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#bbb';
            lab.title = sp.title;

            const name = document.createElement('span');
            name.textContent = sp.label;
            name.style.cssText = 'color:#8cf;min-width:28px';

            const input = document.createElement('input');
            input.type = 'range';
            input.id = 'ironMelt_' + sp.id;
            input.min = sp.min; input.max = sp.max; input.step = sp.step;
            input.value = sp.def;
            input.style.cssText = 'width:104px';
            input.title = sp.title;

            const val = document.createElement('span');
            val.id = 'ironMeltVal_' + sp.id;
            val.style.cssText = 'font-size:11px;color:#999;min-width:38px;text-align:right;' +
                'font-variant-numeric:tabular-nums';

            lab.appendChild(name);
            lab.appendChild(input);
            lab.appendChild(val);
            meltPanel.appendChild(lab);
        });

        // 复位按钮
        const meltResetBtn = document.createElement('button');
        meltResetBtn.id = 'ironMeltResetBtn';
        meltResetBtn.textContent = '复位';
        meltResetBtn.title = '恢复四个参数的出厂默认值';
        meltResetBtn.style.cssText = 'padding:3px 9px;background:#444;color:#ddd;border:1px solid #666;' +
            'border-radius:4px;cursor:pointer;font-size:12px';
        meltPanel.appendChild(meltResetBtn);

        // ---- 投影参数面板（默认收起）----
        // 同样用 spec 生成，避免 range 的 min/max 与默认值两处漂移
        const shadowPanel = document.createElement('div');
        shadowPanel.id = 'ironShadowPanel';
        shadowPanel.style.cssText = 'display:none;flex-wrap:wrap;gap:8px 16px;align-items:center;' +
            'padding:8px 10px;margin-top:8px;background:#242424;border:1px solid #3a3a3a;border-radius:6px';

        this._ironShadowParamSpec().forEach(sp => {
            const lab = document.createElement('label');
            lab.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#bbb';
            lab.title = sp.title;

            const name = document.createElement('span');
            name.textContent = sp.label;
            name.style.cssText = 'color:#f9a;min-width:28px';

            const input = document.createElement('input');
            input.type = 'range';
            input.id = 'ironShadow_' + sp.id;
            input.min = sp.min; input.max = sp.max; input.step = sp.step;
            input.value = sp.def;
            input.style.cssText = 'width:104px';
            input.title = sp.title;

            const val = document.createElement('span');
            val.id = 'ironShadowVal_' + sp.id;
            val.style.cssText = 'font-size:11px;color:#999;min-width:38px;text-align:right;' +
                'font-variant-numeric:tabular-nums';

            lab.appendChild(name);
            lab.appendChild(input);
            lab.appendChild(val);
            shadowPanel.appendChild(lab);
        });

        const shadowResetBtn = document.createElement('button');
        shadowResetBtn.id = 'ironShadowResetBtn';
        shadowResetBtn.textContent = '复位';
        shadowResetBtn.title = '恢复投影参数的出厂默认值';
        shadowResetBtn.style.cssText = 'padding:3px 9px;background:#444;color:#ddd;border:1px solid #666;' +
            'border-radius:4px;cursor:pointer;font-size:12px';
        shadowPanel.appendChild(shadowResetBtn);

        // ---- 闪光晶体参数面板（默认收起）----
        // 【为什么是独立面板】闪光层跟"烫法"是正交的两个叠层：
        //   烫法 = 塑料怎么融、表面压了什么；闪光 = 撒在上面的晶体。
        //   所以它不挂在 mode 上，而是单独一组参数，独立开关。
        const glitPanel = document.createElement('div');
        glitPanel.id = 'ironGlitterPanel';
        glitPanel.style.cssText = 'display:none;flex-wrap:wrap;gap:8px 16px;align-items:center;' +
            'padding:8px 10px;margin-top:8px;background:#242424;border:1px solid #3a3a3a;border-radius:6px';

        this._ironGlitterParamSpec().forEach(sp => {
            const lab = document.createElement('label');
            lab.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#bbb';
            lab.title = sp.title;

            const name = document.createElement('span');
            name.textContent = sp.label;
            name.style.cssText = 'color:#ffe08a;min-width:34px';

            const input = document.createElement('input');
            input.type = 'range';
            input.id = 'ironGlitter_' + sp.id;
            input.min = sp.min; input.max = sp.max; input.step = sp.step;
            input.value = sp.def;
            input.style.cssText = 'width:104px';
            input.title = sp.title;

            const val = document.createElement('span');
            val.id = 'ironGlitterVal_' + sp.id;
            val.style.cssText = 'font-size:11px;color:#999;min-width:38px;text-align:right;' +
                'font-variant-numeric:tabular-nums';

            lab.appendChild(name);
            lab.appendChild(input);
            lab.appendChild(val);
            glitPanel.appendChild(lab);
        });

        const glitResetBtn = document.createElement('button');
        glitResetBtn.id = 'ironGlitterResetBtn';
        glitResetBtn.textContent = '复位';
        glitResetBtn.title = '恢复闪光晶体参数的出厂默认值';
        glitResetBtn.style.cssText = 'padding:3px 9px;background:#444;color:#ddd;border:1px solid #666;' +
            'border-radius:4px;cursor:pointer;font-size:12px';
        glitPanel.appendChild(glitResetBtn);

        // ---- 舞台：预览画布按窗口剩余空间等比缩放，绝不溢出 ----
        //
        // 【为什么改】原来画布是按倍率原始像素铺开的（1.5× × 100 格 = 3000px），
        // 外面套一个 overflow:auto 的框 —— 结果大部分图纸只能看到左上角，
        // 手机上更惨。现在舞台吃掉控件之外的剩余高度，画布用 max-width/max-height
        // 等比缩进这个框里，还原分辨率位图不动（导出照样高清）。
        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'iron-stage';
        canvasWrap.id = 'ironStage';
        Object.assign(canvasWrap.style, {
            background: '#1a1a1a', borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            padding: '12px', border: '2px solid #333'
        });

        const canvas = document.createElement('canvas');
        canvas.id = 'ironPreviewCanvas';
        canvas.className = 'iron-c2d';
        canvas.style.display = 'block';
        canvasWrap.appendChild(canvas);

        // 3D 画布：只在切到 3D 视图时显示，尺寸跟着舞台走
        const canvas3d = document.createElement('canvas');
        canvas3d.id = 'ironPreviewCanvas3d';
        canvas3d.className = 'iron-c3d';
        canvas3d.hidden = true;
        canvasWrap.appendChild(canvas3d);

        const hint = document.createElement('div');
        hint.id = 'ironModeHint';
        Object.assign(hint.style, {
            color: '#aaa', fontSize: '12px', background: '#222',
            padding: '6px 12px', borderRadius: '6px',
            maxWidth: '80vw', textAlign: 'center'
        });

        modal.appendChild(controls);
        controls.appendChild(texPanel);
        controls.appendChild(meltPanel);
        controls.appendChild(shadowPanel);
        controls.appendChild(glitPanel);
        modal.appendChild(canvasWrap);
        modal.appendChild(hint);

        // 事件绑定
        const modeSelect = controls.querySelector('#ironModeSelect');
        const intensitySlider = controls.querySelector('#ironIntensitySlider');
        const intensityValue = controls.querySelector('#ironIntensityValue');
        const zoomSelect = controls.querySelector('#ironZoomSelect');
        const zaoJinSelect = controls.querySelector('#ironZaoJinSelect');
        const zaoJinRow = controls.querySelector('#ironZaoJinRow');
        const bgColor = controls.querySelector('#ironBgColor');

        // 澡巾变体列表（只有澡巾烫用得到，其他模式隐藏这一行）
        this._ironZaoJinList().forEach(z => {
            const o = document.createElement('option');
            o.value = z.id;
            o.textContent = z.label;
            zaoJinSelect.appendChild(o);
        });
        const syncZaoJinRow = () => {
            const on = this._ironPreviewState && this._ironPreviewState.mode === 'zaoJin';
            zaoJinRow.style.display = on ? 'flex' : 'none';
        };

        const bgTransparent = controls.querySelector('#ironBgTransparent');
        const shadowToggle = controls.querySelector('#ironShadowToggle');
        const meltToggle = controls.querySelector('#ironMeltToggle');
        const meltTuneBtn = controls.querySelector('#ironMeltTuneBtn');
        const texTuneBtn = controls.querySelector('#ironTexTuneBtn');

        // ================================================================
        //  花纹几何（大小 / 旋转）—— 与熔融参数同样的「延迟生效」设计
        //
        //  input  → 只改数字标签；change（松手）/ keyup（键盘）→ 才重画。
        //  理由见下方熔融参数的注释：一次重绘在大图上要 0.5~2.4s，
        //  拖动时逐帧重画只会剧烈卡顿，而且中间帧看不清。
        // ================================================================
        const texSpec = this._ironTexGeomSpec();
        const fmtTex = (sp, v) => (sp.step >= 1 ? v.toFixed(0) + '°' : v.toFixed(2) + '×');

        const syncTexSliders = (g) => {
            texSpec.forEach(sp => {
                const inp = controls.querySelector('#ironTex_' + sp.id);
                const val = controls.querySelector('#ironTexVal_' + sp.id);
                if (!inp || !val) return;
                const v = (g && g[sp.id] !== undefined) ? g[sp.id] : sp.def;
                inp.value = v;
                val.textContent = fmtTex(sp, v);
            });
        };

        const applyTex = (sp, raw) => {
            const v = parseFloat(raw);
            if (isNaN(v)) return;
            if (!this._ironPreviewState.texGeom) {
                this._ironPreviewState.texGeom = { scale: 1.0, rot: 0 };
            }
            this._ironPreviewState.texGeom[sp.id] = v;
            this._refreshIronPreview();
        };

        texSpec.forEach(sp => {
            const inp = controls.querySelector('#ironTex_' + sp.id);
            const val = controls.querySelector('#ironTexVal_' + sp.id);
            if (!inp) return;
            inp.addEventListener('input', () => {
                val.textContent = fmtTex(sp, parseFloat(inp.value));
            });
            inp.addEventListener('change', () => applyTex(sp, inp.value));
            inp.addEventListener('keyup', () => applyTex(sp, inp.value));
        });

        // 复位 = 回到「当前变体」的默认值（不是全局 1.0/0）
        texResetBtn.addEventListener('click', () => {
            const zj = this._ironCurrentZaoJin();
            this._ironPreviewState.texGeom = {
                scale: zj.scale !== undefined ? zj.scale : 1.0,
                rot: zj.rot !== undefined ? zj.rot : 0
            };
            syncTexSliders(this._ironPreviewState.texGeom);
            this._refreshIronPreview();
        });

        texTuneBtn.addEventListener('click', () => {
            const on = texPanel.style.display === 'none';
            texPanel.style.display = on ? 'flex' : 'none';
            texTuneBtn.textContent = on ? '几何 ▾' : '几何 ▸';
            if (on) syncTexSliders(this._ironTexGeom(this._ironPreviewState));
        });

        syncTexSliders(this._ironTexGeom(this._ironPreviewState));

        // ================================================================
        //  熔融参数滑杆 —— ★ 延迟生效的设计 ★
        //
        //  为什么不在 input 事件里重画：
        //    每改一个像素都要重跑 SDF + 整层重绘（实测大图 470ms~2.4s）。
        //    拖动滑杆时 input 每秒能触发几十次 —— 每次都重画的话，
        //    拖动过程会剧烈卡顿，而且中间帧全是半成品，完全看不清。
        //
        //  现在的做法：
        //    input  → 只更新数字标签（0.1ms，用户能实时看到数值在变）
        //    change → 松手时才重画一次（拿到最终值，只渲染一帧）
        //    keyup/keydown → 键盘微调也能生效（键盘操作不会触发 change）
        //
        //  即"数值实时、渲染延迟"，这是调参类控件的标准手感。
        // ================================================================
        const meltSpec = this._ironMeltParamSpec();
        const fmtVal = (sp, v) => (sp.step >= 1 ? v.toFixed(0) : v.toFixed(2));

        const syncMeltSliders = (m) => {
            meltSpec.forEach(sp => {
                const inp = controls.querySelector('#ironMelt_' + sp.id);
                const val = controls.querySelector('#ironMeltVal_' + sp.id);
                if (!inp || !val) return;
                const v = (m && m[sp.id] !== undefined) ? m[sp.id] : sp.def;
                inp.value = v;
                val.textContent = fmtVal(sp, v);
            });
        };

        const applyMelt = (sp, raw) => {
            const v = parseFloat(raw);
            if (isNaN(v)) return;
            // state.melt 可能还没建（第一次开面板）——补一份默认值再写
            if (!this._ironPreviewState.melt) {
                const d = this._IRON_MELT_DEFAULTS;
                this._ironPreviewState.melt = { r: d.r, k: d.k, bias: d.bias, span: d.span };
            }
            this._ironPreviewState.melt[sp.id] = v;
            this._refreshIronPreview();
        };

        meltSpec.forEach(sp => {
            const inp = controls.querySelector('#ironMelt_' + sp.id);
            const val = controls.querySelector('#ironMeltVal_' + sp.id);
            if (!inp) return;
            // 拖动中：只改数字
            inp.addEventListener('input', () => {
                val.textContent = fmtVal(sp, parseFloat(inp.value));
            });
            // 松手：重画一次
            inp.addEventListener('change', () => applyMelt(sp, inp.value));
            // 键盘：方向键在 input 里也触发，但不会触发 change → 补上
            inp.addEventListener('keyup', () => applyMelt(sp, inp.value));
        });

        meltResetBtn.addEventListener('click', () => {
            const d = this._IRON_MELT_DEFAULTS;
            this._ironPreviewState.melt = { r: d.r, k: d.k, bias: d.bias, span: d.span };
            syncMeltSliders(this._ironPreviewState.melt);
            this._refreshIronPreview();
        });

        meltTuneBtn.addEventListener('click', () => {
            const on = meltPanel.style.display === 'none';
            meltPanel.style.display = on ? 'flex' : 'none';
            meltTuneBtn.textContent = on ? '参数 ▾' : '参数 ▸';
            // 展开时把当前生效值回填到滑杆（state 可能已被改过）
            if (on) syncMeltSliders(this._ironMeltParams(this._ironPreviewState));
        });

        syncMeltSliders(this._ironMeltParams(this._ironPreviewState));

        // ---- 投影参数：与熔融参数同一套「数值实时、渲染延迟」手感 ----
        const shadowSpec = this._ironShadowParamSpec();
        const shadowTuneBtn = controls.querySelector('#ironShadowTuneBtn');

        const syncShadowSliders = (sp2) => {
            shadowSpec.forEach(sp => {
                const inp = controls.querySelector('#ironShadow_' + sp.id);
                const val = controls.querySelector('#ironShadowVal_' + sp.id);
                if (!inp || !val) return;
                const v = (sp2 && sp2[sp.id] !== undefined) ? sp2[sp.id] : sp.def;
                inp.value = v;
                val.textContent = fmtVal(sp, v);
            });
        };

        const applyShadow = (sp, raw) => {
            const v = parseFloat(raw);
            if (isNaN(v)) return;
            if (!this._ironPreviewState.shadowParams) {
                const d = this._IRON_SHADOW_DEFAULTS;
                this._ironPreviewState.shadowParams = {
                    opacity: d.opacity, blur: d.blur, dx: d.dx, dy: d.dy, spread: d.spread
                };
            }
            this._ironPreviewState.shadowParams[sp.id] = v;
            // 投影是在成品层之外单独画的（drawIronPreview 里），
            // 所以参数不进 _ironPieceKey 的缓存判定，改完直接重贴即可。
            this._refreshIronPreview();
        };

        shadowSpec.forEach(sp => {
            const inp = controls.querySelector('#ironShadow_' + sp.id);
            const val = controls.querySelector('#ironShadowVal_' + sp.id);
            if (!inp) return;
            inp.addEventListener('input', () => {
                val.textContent = fmtVal(sp, parseFloat(inp.value));
            });
            inp.addEventListener('change', () => applyShadow(sp, inp.value));
            inp.addEventListener('keyup', () => applyShadow(sp, inp.value));
        });

        shadowResetBtn.addEventListener('click', () => {
            const d = this._IRON_SHADOW_DEFAULTS;
            this._ironPreviewState.shadowParams = {
                opacity: d.opacity, blur: d.blur, dx: d.dx, dy: d.dy, spread: d.spread
            };
            syncShadowSliders(this._ironPreviewState.shadowParams);
            this._refreshIronPreview();
        });

        shadowTuneBtn.addEventListener('click', () => {
            const on = shadowPanel.style.display === 'none';
            shadowPanel.style.display = on ? 'flex' : 'none';
            shadowTuneBtn.textContent = on ? '影子 ▾' : '影子 ▸';
            if (on) syncShadowSliders(this._ironShadowParams(this._ironPreviewState));
        });

        syncShadowSliders(this._ironShadowParams(this._ironPreviewState));

        /** 透明模式：画布背景改成棋盘格（仅预览用，导出仍是真透明） */
        const applyChecker = (on) => {
            if (on) {
                Object.assign(canvas.style, {
                    backgroundImage:
                        'linear-gradient(45deg,#3a3a3a 25%,transparent 25%),' +
                        'linear-gradient(-45deg,#3a3a3a 25%,transparent 25%),' +
                        'linear-gradient(45deg,transparent 75%,#3a3a3a 75%),' +
                        'linear-gradient(-45deg,transparent 75%,#3a3a3a 75%)',
                    backgroundSize: '18px 18px',
                    backgroundPosition: '0 0,0 9px,9px -9px,-9px 0px',
                    backgroundColor: '#4a4a4a'
                });
                bgTransparent.style.background = '#1e88e5';
                bgTransparent.style.borderColor = '#64b5f6';
                bgTransparent.textContent = '透明 ✓';
            } else {
                canvas.style.backgroundImage = 'none';
                canvas.style.backgroundColor = '';
                bgTransparent.style.background = '#444';
                bgTransparent.style.borderColor = '#666';
                bgTransparent.textContent = '透明';
            }
        };

        modeSelect.addEventListener('change', () => {
            this._ironPreviewState.mode = modeSelect.value;
            syncZaoJinRow();
            this._refreshIronPreview();
        });
        zaoJinSelect.addEventListener('change', () => {
            this._ironPreviewState.zaoJin = zaoJinSelect.value;
            // 换变体 → 几何参数回到新变体的默认值（各变体花纹尺度不同）
            const zj = this._ironCurrentZaoJin();
            this._ironPreviewState.texGeom = {
                scale: zj.scale !== undefined ? zj.scale : 1.0,
                rot: zj.rot !== undefined ? zj.rot : 0
            };
            syncTexSliders(this._ironPreviewState.texGeom);
            this._refreshIronPreview();
        });
        intensitySlider.addEventListener('input', () => {
            intensityValue.textContent = intensitySlider.value + '%';
            this._ironPreviewState.intensity = parseInt(intensitySlider.value) / 100;
            this._refreshIronPreview();
        });
        zoomSelect.addEventListener('change', () => {
            this._ironPreviewState.zoom = parseFloat(zoomSelect.value);
            this._refreshIronPreview();
        });
        bgColor.addEventListener('input', () => {
            this._ironPreviewState.bgColor = bgColor.value;
            this._ironPreviewState.transparent = false;
            applyChecker(false);
            this._refreshIronPreview();
        });
        bgTransparent.addEventListener('click', () => {
            this._ironPreviewState.transparent = true;
            applyChecker(true);
            this._refreshIronPreview();
        });
        shadowToggle.addEventListener('change', () => {
            this._ironPreviewState.shadow = shadowToggle.checked;
            this._refreshIronPreview();
        });
        meltToggle.addEventListener('change', () => {
            this._ironPreviewState.melt = meltToggle.checked;
            // 打开熔融时把滑杆回填成当前生效值（可能是上次调的）
            if (meltToggle.checked && meltPanel.style.display !== 'none') {
                syncMeltSliders(this._ironMeltParams(this._ironPreviewState));
            }
            this._refreshIronPreview();
        });

        // ---- 闪光层：独立开关 + 三个参数（同样"数值实时、渲染延迟"）----
        const glitToggle = controls.querySelector('#ironGlitterToggle');
        const glitTuneBtn = controls.querySelector('#ironGlitterTuneBtn');
        const glitSpec = this._ironGlitterParamSpec();

        const syncGlitSliders = (g) => {
            glitSpec.forEach(sp => {
                const inp = controls.querySelector('#ironGlitter_' + sp.id);
                const val = controls.querySelector('#ironGlitterVal_' + sp.id);
                if (!inp || !val) return;
                const v = (g && g[sp.id] !== undefined) ? g[sp.id] : sp.def;
                inp.value = v;
                val.textContent = fmtVal(sp, v);
            });
        };

        const applyGlit = (sp, raw) => {
            const v = parseFloat(raw);
            if (isNaN(v)) return;
            this._ironPreviewState.glitter[sp.id] = v;
            this._refreshIronPreview();
        };

        glitSpec.forEach(sp => {
            const inp = controls.querySelector('#ironGlitter_' + sp.id);
            const val = controls.querySelector('#ironGlitterVal_' + sp.id);
            if (!inp) return;
            inp.addEventListener('input', () => { val.textContent = fmtVal(sp, parseFloat(inp.value)); });
            inp.addEventListener('change', () => applyGlit(sp, inp.value));
            inp.addEventListener('keyup', () => applyGlit(sp, inp.value));
        });

        glitToggle.addEventListener('change', () => {
            this._ironPreviewState.glitter.on = glitToggle.checked;
            if (glitToggle.checked && glitPanel.style.display === 'none') {
                // 第一次开闪光：顺手把参数面板展开，不然用户不知道还能调
                glitPanel.style.display = 'flex';
                glitTuneBtn.textContent = '闪光 ▾';
            }
            syncGlitSliders(this._ironGlitterParams(this._ironPreviewState));
            this._refreshIronPreview();
        });

        glitTuneBtn.addEventListener('click', () => {
            const on = glitPanel.style.display === 'none';
            glitPanel.style.display = on ? 'flex' : 'none';
            glitTuneBtn.textContent = on ? '闪光 ▾' : '闪光 ▸';
            if (on) syncGlitSliders(this._ironGlitterParams(this._ironPreviewState));
        });

        glitResetBtn.addEventListener('click', () => {
            this._ironPreviewState.glitter = this._ironGlitterParams(null);
            syncGlitSliders(this._ironPreviewState.glitter);
            this._refreshIronPreview();
        });

        syncGlitSliders(this._ironGlitterParams(this._ironPreviewState));

        // ---- 视图切换：平面 / 3D ----
        const viewTabs = controls.querySelector('#ironViewTabs');
        viewTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-view]');
            if (!btn) return;
            this._setIronView(btn.dataset.view);
        });

        const autoSpinToggle = controls.querySelector('#ironAutoSpinToggle');
        autoSpinToggle.addEventListener('change', () => {
            if (this._iron3d) {
                this._iron3d.autoSpin = autoSpinToggle.checked;
                // 打开自动转时从当前角度继续慢慢转，不要跳回正面
                if (autoSpinToggle.checked) this._iron3d.start();
            }
        });

        controls.querySelector('#ironExportBtn').addEventListener('click', () => this.exportIronPreview());
        controls.querySelector('#ironCloseBtn').addEventListener('click', () => this.closeIronPreview());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeIronPreview();
        });
        this._ironEscHandler = (e) => {
            if (e.key === 'Escape') this.closeIronPreview();
        };
        document.addEventListener('keydown', this._ironEscHandler);

        this._ironPreviewState = {
            mode: modeSelect.value,
            // 澡巾变体（4 种真实织纹）
            zaoJin: this._ironZaoJinList()[0].id,
            intensity: parseInt(intensitySlider.value) / 100,
            zoom: parseFloat(zoomSelect.value),
            bgColor: bgColor.value,
            // 背景透明：导出 PNG 带 alpha 通道，方便直接贴到任何底色上
            transparent: false,
            // 熔融边（metaball 平滑并集）：默认关闭，它会明显改变轮廓观感
            melt: false,
            shadow: shadowToggle.checked,
            // 视图：'2d' 平面 / '3d' 可旋转
            view: '2d',
            // 闪光晶体叠层：与烫法正交，独立开关（参数见 _IRON_GLITTER_DEFAULTS）
            glitter: this._ironGlitterParams(null)
        };
        zaoJinSelect.value = this._ironPreviewState.zaoJin;
        syncZaoJinRow();
        this._ironPreviewCanvas = canvas;
        this._ironPreviewCtx = canvas.getContext('2d');
        this._ironPreviewHint = hint;
        this._ironStage = canvasWrap;
        this._ironCanvas3d = canvas3d;
        this._ironTextureCache = {};
        this._ironGeo = null;
        this._ironPieceKey = null;
        this._ironPieceCanvas = null;
        this._ironLightCache = {};      // 真实织纹 tile 的异步加载缓存

        return modal;
    },

    /**
     * 触发一次预览重绘。
     *
     * 滑杆和取色器会连续触发 input 事件（拖一下几十次），
     * 这里用 requestAnimationFrame 合并成"每帧最多画一次"，
     * 否则就会排队几十次重绘，界面整片卡死。
     */
    _refreshIronPreview(immediate) {
        const state = this._ironPreviewState;
        const hints = {
            normal: '正常烫：边缘豆向外流动微微鼓起（圆润），内部豆保持规范正方形，表面平整微哑光。',
            zaoJin: '澡巾烫：细密颗粒磨砂质感（不是条纹），整体偏哑光，凹凸很细很密。',
            maoJin: '毛巾烫：绒面纤维感，大量细小绒毛造成柔和起伏，颜色偏旧偏暗。',
            huaFuGe: '华夫格烫：大面积方格凹凸，格线是平滑的立体凹槽（不是每颗豆一个小十字）。',
            lingGe: '菱格烫：45° 斜向压花格纹，起伏柔和，像压花绒面。',
            hongBeiZhi: '烘焙纸烫：大尺度揉皱褶皱，明暗起伏最大，有局部高光斑和深阴影。',
            xiShan: '细闪烫：表面平整但布满极细的闪粉颗粒，有整体光泽。',
            geLiTe: '格利特烫：粗颗粒闪片随机散布，反光强烈。',
            xianDuRiLa: '仙度瑞拉烫：深色镜面 + 星点反光，偏蓝紫光泽。'
        };
        this._ironPreviewHint.textContent = hints[state.mode] || '';

        if (!this.perlerColors || !this.perlerColors.length) {
            const ctx = this._ironPreviewCtx;
            this._ironPreviewCanvas.width = 420;
            this._ironPreviewCanvas.height = 180;
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, 420, 180);
            ctx.fillStyle = '#888';
            ctx.font = '15px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('请先生成拼豆图纸（点击"渲染拼豆图纸"按钮）', 210, 90);
            return;
        }

        if (this._ironRafId) {
            cancelAnimationFrame(this._ironRafId);
            this._ironRafId = 0;
        }
        const run = () => {
            this._ironRafId = 0;
            // 3D 视图拿成品层当贴图，晶体由 GL 按法线实时算反光；贴图里就**不能**再烘一层
            // 静态闪光，否则会看到"死闪 + 活闪"两套晶体叠在一起。
            const three = state.view === '3d';
            const st = three
                ? Object.assign({}, state, {
                    glitter: Object.assign({}, state.glitter, { on: false })
                })
                : state;
            const ms = this.drawIronPreview(this.perlerColors, this.perlerWidth, this.perlerHeight, st);
            if (three) this._sync3D();
            if (typeof ms === 'number') {
                const tail = three ? '　·　拖动旋转 · 滚轮缩放 · 双击复位' : '';
                this._ironPreviewHint.textContent =
                    `${hints[state.mode] || ''}${tail}　·　渲染 ${ms.toFixed(0)}ms`;
            }
        };
        if (immediate) run();
        else this._ironRafId = requestAnimationFrame(run);
    },

    // ============================================================
    //  一·五、视图切换（平面 / 3D）
    // ============================================================

    /**
     * 切到 3D 时按需加载 WebGL 模块（跟澡巾纹理一个思路：不进首屏）。
     */
    _ensure3D(cb) {
        if (typeof window !== 'undefined' && window.IronPreview3D) { cb(); return; }
        if (this._iron3dLoading) { this._iron3dWaiters.push(cb); return; }
        this._iron3dLoading = true;
        this._iron3dWaiters = [cb];
        const s = document.createElement('script');
        s.src = (this._ironModuleBase || 'js/') + 'ironPreview3d.js';
        s.onload = () => {
            this._iron3dLoading = false;
            const q = this._iron3dWaiters || [];
            this._iron3dWaiters = [];
            q.forEach(f => { try { f && f(); } catch (e) { console.error(e); } });
        };
        s.onerror = () => {
            this._iron3dLoading = false;
            this._iron3dWaiters = [];
            if (this._ironPreviewHint) this._ironPreviewHint.textContent = '3D 模块加载失败（js/ironPreview3d.js）';
        };
        document.head.appendChild(s);
    },

    /** 切换平面 / 3D 视图 */
    _setIronView(view) {
        const st = this._ironPreviewState;
        if (!st || !this._ironPreviewCanvas) return;
        st.view = view === '3d' ? '3d' : '2d';

        const tabs = document.querySelector('#ironViewTabs');
        if (tabs) {
            tabs.querySelectorAll('[data-view]').forEach(b => {
                b.classList.toggle('is-on', b.dataset.view === st.view);
            });
        }
        const spinRow = document.querySelector('#ironAutoSpinRow');
        if (spinRow) spinRow.style.display = st.view === '3d' ? 'flex' : 'none';

        const c2d = this._ironPreviewCanvas;
        const c3d = this._ironCanvas3d;
        if (!c3d) return;

        if (st.view === '3d') {
            c2d.style.display = 'none';
            c3d.hidden = false;
            // 先把贴图准备好（这一步是 2D 渲染，同步的），再开 GL 循环
            this._refreshIronPreview(true);
            this._ensure3D(() => {
                if (!this._ironPreviewState || this._ironPreviewState.view !== '3d') return;
                if (!this._iron3d) {
                    try {
                        this._iron3d = new window.IronPreview3D(c3d);
                    } catch (e) {
                        console.error('[豆师傅] 3D 预览初始化失败', e);
                        this._ironPreviewHint.textContent = '当前浏览器不支持 WebGL，3D 预览不可用';
                        this._setIronView('2d');
                        return;
                    }
                }
                this._sync3D();
                const spin = document.querySelector('#ironAutoSpinToggle');
                this._iron3d.autoSpin = !!(spin && spin.checked);
                this._iron3d.start();
            });
        } else {
            if (this._iron3d) this._iron3d.stop();
            c3d.hidden = true;
            c2d.style.display = 'block';
            this._refreshIronPreview(true);
        }
    },

    /** 把成品层贴图 + 晶体点阵推给 3D 模块 */
    _sync3D() {
        const g3 = this._iron3d;
        if (!g3 || !this._ironPieceCanvas || !this.perlerWidth) return;
        // 外轮廓闭环只算一次：贴图遮罩和包边侧壁用的必须是同一条线
        const loops = this._ironRimLoops();
        const tex = this._iron3dTexture(loops);
        g3.setTexture(tex.front, tex.rim, tex.mask);
        if (g3.setRim) g3.setRim(tex.map, loops);

        const st = this._ironPreviewState;
        const p = this._ironGlitterParams(st);
        if (p.on && p.bright > 0.001) {
            const pts = this._ironGlitterPoints(this.perlerWidth, this.perlerHeight, p);
            g3.setGlitter(pts, tex.map, p);
            g3.setGlitterAlpha(1);
        } else {
            g3.ptCount = 0;
            g3.setGlitterAlpha(0);
        }

        // 底色跟 2D 对齐（透明时让下面的棋盘格透出来）
        const c3d = this._ironCanvas3d;
        if (c3d) {
            c3d.style.backgroundImage = st.transparent ? this._ironPreviewCanvas.style.backgroundImage : 'none';
            c3d.style.backgroundSize = st.transparent ? this._ironPreviewCanvas.style.backgroundSize : '';
            c3d.style.backgroundPosition = st.transparent ? this._ironPreviewCanvas.style.backgroundPosition : '';
            c3d.style.backgroundColor = st.transparent ? '#4a4a4a' : st.bgColor;
        }
        g3.render();
    },

    /**
     * 3D 包边用的外轮廓环。
     *
     * 这条线同时干两件事，而且必须是同一条：
     *   1) 裁正面/背面贴图（不裁的话贴图自己的方块台阶会露在侧壁外面）
     *   2) 让包边沿着它挤出（侧壁的位置、法线、取色全来自它）
     * 所以轮廓**胖出去**就有空隙（包边贴着空气走，豆子和侧壁之间透背景），
     * **瘦进来**就把豆子切掉一圈。
     *
     * 【上一版为什么胖了 1.8 格】
     * 之前是"0/1 遮罩 → 高斯模糊 → 取 0.5 等值线"。台阶是 1 格周期，想让等值线
     * 变光滑就得给 σ≈1 格，而 σ≈1 的模糊会把 90° 直角抹成**半径 1.2 格的圆角**；
     * 实测每个台阶处轮廓比豆子胖出 1.0~1.8 格 —— 正对着看就是拐角处一个月牙形
     * 的洞。模糊还有个更硬的问题：1 格宽的特征（单豆凸齿、1 格宽的凹槽）模糊后
     * 峰值只剩 0.375，压根到不了 0.5，直接被抹掉。
     *
     * 【现在的做法：精确几何】
     *   1) 从占用格直接抽"豆子并集"的外边界，得到端点全是整数格点的有向折线
     *      —— 端点整数，接环不会因为浮点差最后一位断链（这条上一版踩过）
     *   2) 串成闭环，逐环定向（朝外那一侧必须是空气）
     *   3) 整体外扩 ROUND 格、拐角用圆角接（等价于"距离 = ROUND"的等值线，
     *      也就是真实外形外扩 ROUND：凸角按 ROUND 变圆、凹角保持直角、
     *      1 格宽的特征原样保留）
     *
     * ROUND 不能太小：贴图外缘本身有 0.03~0.085 格的融化鼓起，轮廓要是压在豆子
     * 边线上，就会把这圈鼓起裁掉（看着像被刀切平）。0.18 格正好落在这圈鼓起外面。
     *
     * @returns {Array<{pts:Float32Array, rgb:Float32Array}>|null} 单位：格（格 (x,y)
     *          占 [x,x+1]×[y,y+1]），可带小数
     */
    _ironRimLoops() {
        const grid = this.perlerColors;
        const cols = this.perlerWidth, rows = this.perlerHeight;
        if (!grid || !cols || !rows) return null;

        // ---- 1) 占用格（四周各留 1 格空白，贴边图案也能闭合）----
        const PW = cols + 2, PH = rows + 2;
        const occ = new Uint8Array(PW * PH);
        let any = false;
        for (let y = 0; y < rows; y++) {
            const row = grid[y];
            if (!row) continue;
            for (let x = 0; x < cols; x++) {
                const c = row[x];
                if (c && !c.isTransparent) { occ[(y + 1) * PW + (x + 1)] = 1; any = true; }
            }
        }
        if (!any) return null;
        const at = (px, py) => (px < 0 || py < 0 || px >= PW || py >= PH) ? 0 : occ[py * PW + px];

        // ---- 2) 抽外边界：每颗豆子朝空的那几条边，按同一绕向排好 ----
        //  padded 索引 (px,py) ↔ 格坐标 (px-1, py-1)
        const K = 65536;                                   // 整数格点 → 唯一 key
        const pk = (x, y) => (y + 1) * K + (x + 1);
        const segs = [];                                   // 扁平 [x0,y0,x1,y1]
        const byStart = new Map();
        const push = (x0, y0, x1, y1) => {
            const id = segs.length / 4;
            segs.push(x0, y0, x1, y1);
            const k = pk(x0, y0);
            const arr = byStart.get(k);
            if (arr) arr.push(id); else byStart.set(k, [id]);
        };
        for (let py = 0; py < PH; py++) {
            for (let px = 0; px < PW; px++) {
                if (!occ[py * PW + px]) continue;
                const x = px - 1, y = py - 1;
                if (!at(px, py - 1)) push(x, y, x + 1, y);             // 上边
                if (!at(px + 1, py)) push(x + 1, y, x + 1, y + 1);     // 右边
                if (!at(px, py + 1)) push(x + 1, y + 1, x, y + 1);     // 下边
                if (!at(px - 1, py)) push(x, y + 1, x, y);             // 左边
            }
        }
        if (!segs.length) return null;

        // ---- 3) 串闭环（有向，端点都是整数，接不上的情况不该发生）----
        const nSeg = segs.length / 4;
        const used = new Uint8Array(nSeg);
        const raw = [];
        for (let s0 = 0; s0 < nSeg; s0++) {
            if (used[s0]) continue;
            const pts = [];
            let cur = s0, guard = 0;
            let x = segs[s0 * 4], y = segs[s0 * 4 + 1];
            while (cur !== -1 && guard++ <= nSeg) {
                used[cur] = 1;
                pts.push(x, y);
                x = segs[cur * 4 + 2]; y = segs[cur * 4 + 3];
                const arr = byStart.get(pk(x, y));
                let nxt = -1;
                if (arr) {
                    for (let q = 0; q < arr.length; q++) {
                        if (!used[arr[q]]) { nxt = arr[q]; break; }
                    }
                }
                cur = nxt;
            }
            if (pts.length >= 6) raw.push(pts);   // 少于 3 个格点不成面
        }
        if (!raw.length) return null;

        // ---- 4) 逐环定向：沿约定外法线 (-ty, tx) 挪出去，落点必须是空气 ----
        //  ★ 不能用"外法线背离质心"：挖了洞的图案（爱心中间掏空）里，洞的环会被
        //    判反 —— 侧壁朝洞里鼓、遮罩还把洞填上。这里改成拿占位图直接验。
        const isOcc = (u, v) => at(Math.floor(u) + 1, Math.floor(v) + 1);
        const orient = (p) => {
            const n = p.length / 2;
            let vote = 0;
            const step = Math.max(1, Math.floor(n / 12));
            for (let i = 0; i < n; i += step) {
                const i0 = (i - 1 + n) % n, i1 = (i + 1) % n;
                const tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1];
                const tl = Math.hypot(tx, ty) || 1;
                vote += isOcc(p[i * 2] - (ty / tl) * 0.35, p[i * 2 + 1] + (tx / tl) * 0.35) ? -1 : 1;
            }
            if (vote >= 0) return p;
            const rev = [];
            for (let i = n - 1; i >= 0; i--) rev.push(p[i * 2], p[i * 2 + 1]);
            return rev;
        };

        // ---- 5) 外扩 ROUND + 圆角拐角 ----
        //  逐顶点把两条边的外法线各推 ROUND，中间接一段以该顶点为圆心的圆弧。
        //  等价于"距离 = ROUND"的等值线：凸角是 ROUND 半径的圆角，凹角处圆弧
        //  比真正的尖角少外扩 0.41*ROUND（≈0.07 格，看不出来）。
        //  ★ 这样做还顺手解决了侧壁在拐角处"收口"：法线是连续转过去的，
        //    每个截面环的法线不会突然掉头，包边不会在直角处挤出一圈褶皱。
        const ROUND = 0.18;
        const ARC = 5;                                        // 每 90° 分几段
        const roundLoop = (p) => {
            const n = p.length / 2, q = [];
            for (let i = 0; i < n; i++) {
                const i0 = (i - 1 + n) % n, i1 = (i + 1) % n;
                const x1 = p[i * 2], y1 = p[i * 2 + 1];
                let ax = x1 - p[i0 * 2], ay = y1 - p[i0 * 2 + 1];
                let bx = p[i1 * 2] - x1, by = p[i1 * 2 + 1] - y1;
                const al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
                ax /= al; ay /= al; bx /= bl; by /= bl;
                // 两条边的外法线（约定：外法线 = (-ty, tx)）
                const n0x = -ay, n0y = ax, n1x = -by, n1y = bx;
                if (Math.abs(ax * by - ay * bx) < 1e-9) {     // 直行，只做外扩
                    q.push(x1 + n0x * ROUND, y1 + n0y * ROUND);
                    continue;
                }
                const a0 = Math.atan2(n0y, n0x);
                let da = Math.atan2(n1y, n1x) - a0;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                for (let s = 0; s <= ARC; s++) {
                    const ang = a0 + (da * s) / ARC;
                    q.push(x1 + Math.cos(ang) * ROUND, y1 + Math.sin(ang) * ROUND);
                }
            }
            return q;
        };

        // ---- 6) 给每个点配一颗豆子的颜色 ----
        //  3D 侧壁直接用这个纯色，不去采样贴图（贴图豆缝是透明的，
        //  采到就被 discard，一圈侧壁会碎成一段段小圆环）。
        //  找不到就一圈圈往外找（贴边/细窄处 floor 会落到空格上）
        const pick = (cx, cy) => {
            for (let rr = 0; rr <= 2; rr++) {
                for (let dy = -rr; dy <= rr; dy++) {
                    for (let dx = -rr; dx <= rr; dx++) {
                        const x = cx + dx, y = cy + dy;
                        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
                        const c = grid[y] && grid[y][x];
                        if (c && !c.isTransparent && c.rgb) return c.rgb;
                    }
                }
            }
            return [180, 180, 180];
        };

        return raw.map(orient).map(roundLoop).map(p => {
            const pts = new Float32Array(p);
            const n = pts.length / 2;
            const rgb = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const i0 = (i - 1 + n) % n, i1 = (i + 1) % n;
                const tx = pts[i1 * 2] - pts[i0 * 2];
                const ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
                const tl = Math.hypot(tx, ty) || 1;
                // 外法线 = (-ty, tx)（绕向已在上面统一过）→ 反着走 0.45 格就是往豆子里
                const sx = pts[i * 2] + (ty / tl) * 0.45;
                const sy = pts[i * 2 + 1] - (tx / tl) * 0.45;
                const c = pick(Math.floor(sx), Math.floor(sy));
                rgb[i * 3] = c[0] / 255;
                rgb[i * 3 + 1] = c[1] / 255;
                rgb[i * 3 + 2] = c[2] / 255;
            }
            return { pts, rgb };
        });
    },

    /**
     * 3D 用的贴图：把成品层裁到图案的实际外接框。
     *
     * 【为什么必须裁】成品层是按整张网格铺的，图案只占其中一块（比如 29×29 网格里
     * 一个 19×22 的心形，其余全透明）。直接贴上去的话，3D 里看到的是一大圈空气，
     * 图案缩在中间很小 —— 而 3D 视图关注的是"这件东西本身"，不是网格。
     */
    _iron3dTexture(loops) {
        const src = this._ironPieceCanvas;
        const cell = (this._ironGeo && this._ironGeo.cellSize) || 20;
        const cols = this.perlerWidth, rows = this.perlerHeight;
        const pad = 18;                       // 与 drawIronPreview 里的 padding 一致
        let x0 = cols, y0 = rows, x1 = -1, y1 = -1;
        for (let y = 0; y < rows; y++) {
            const row = this.perlerColors[y];
            for (let x = 0; x < cols; x++) {
                if (!row[x] || row[x].isTransparent) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return src;

        const m = Math.max(4, Math.round(cell * 0.55));    // 余量：外缘鼓起 + 模糊
        const sx = pad + x0 * cell - m;
        const sy = pad + y0 * cell - m;
        const sw = (x1 - x0 + 1) * cell + m * 2;
        const sh = (y1 - y0 + 1) * cell + m * 2;

        let cv = this._iron3dTexCanvas;
        if (!cv) cv = this._iron3dTexCanvas = document.createElement('canvas');
        cv.width = sw;
        cv.height = sh;
        const c = cv.getContext('2d');
        c.clearRect(0, 0, sw, sh);
        c.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);

        // 侧墙贴图：同一张图模糊一遍。
        // 3D 侧墙是"同一张贴图平移堆叠"出来的，直接用清晰图会看到一条条竖向条纹
        // （每层只露出 1~2px，等于把边缘像素拉成竖条）；模糊之后层与层颜色接近，
        // 叠起来才是完整的一堵塑料侧墙。
        let rv = this._iron3dRimCanvas;
        if (!rv) rv = this._iron3dRimCanvas = document.createElement('canvas');
        rv.width = sw;
        rv.height = sh;
        const rc = rv.getContext('2d');
        rc.clearRect(0, 0, sw, sh);
        rc.filter = `blur(${Math.max(2, Math.round(cell * 0.4))}px)`;
        rc.drawImage(cv, 0, 0);
        rc.filter = 'none';

        // 轮廓遮罩：把包边那条光滑闭环填成实心，3D 用它把正面/背面的外轮廓裁掉。
        // ★ 为什么非要裁：正面贴图是"一颗颗豆子方块"，它自己的外轮廓就是 1 格一个台阶。
        //   侧壁贴得再圆，从正面看台阶还露在外面 —— 那就不叫包边，只是多了圈边。
        //   裁到同一条闭环上，正/背/侧三面的轮廓才是同一条曲线。
        // 遮罩只要形状，半分辨率就够（省一半显存：100×100 的图贴图有 2400²+）
        const MS = 0.5;
        let mv = this._iron3dMaskCanvas;
        if (!mv) mv = this._iron3dMaskCanvas = document.createElement('canvas');
        mv.width = Math.round(sw * MS);
        mv.height = Math.round(sh * MS);
        const mc = mv.getContext('2d');
        mc.clearRect(0, 0, mv.width, mv.height);
        if (loops && loops.length) {
            mc.save();
            mc.scale(MS, MS);
            // 外轮廓与洞的绕向相反 → 用 nonzero 填充，洞天然是空的
            mc.fillStyle = '#fff';
            mc.beginPath();
            for (let li = 0; li < loops.length; li++) {
                const pts = loops[li].pts;
                for (let i = 0; i < pts.length; i += 2) {
                    const px = pad + pts[i] * cell - sx;
                    const py = pad + pts[i + 1] * cell - sy;
                    if (i === 0) mc.moveTo(px, py); else mc.lineTo(px, py);
                }
                mc.closePath();
            }
            mc.fill('nonzero');
            mc.restore();
        }

        return {
            front: cv, rim: rv, mask: mv,
            // 裁剪信息：3D 那边的晶体要按这张贴图的坐标系放，不能用网格 cols/rows
            map: { pad, cell, x0: sx, y0: sy, sw, sh }
        };
    },

    // ============================================================
    //  二、每种烫法的参数表
    // ============================================================

    /**
     * 各烫法的外观参数
     *  bulge   : 边缘豆朝外边的外推幅度（×cellSize）—— 融化流动鼓起的程度
     *  blur    : 底板高斯模糊量（px）—— 融平融合程度
     *  grid    : 豆子格线强度（0~0.25）—— 烫后仍可见的豆子轮廓
     *  sheen   : 环境光光泽强度
     *  grain   : 表面细颗粒噪点强度
     */
    _ironProfiles() {
        return {
            normal:     { bulge: 0.055, blur: 0.5, grid: 0.20, sheen: 0.11, grain: 0.045 },
            // 澡巾烫的豆子格线压得很低：实拍上澡巾织纹把豆子轮廓几乎盖掉了
            zaoJin:     { bulge: 0.045, blur: 0.6, grid: 0.055, sheen: 0.05, grain: 0.09 },
            maoJin:     { bulge: 0.060, blur: 0.8, grid: 0.07, sheen: 0.02, grain: 0.06 },
            huaFuGe:    { bulge: 0.035, blur: 0.5, grid: 0.09, sheen: 0.05, grain: 0.04 },
            lingGe:     { bulge: 0.040, blur: 0.5, grid: 0.09, sheen: 0.05, grain: 0.04 },
            hongBeiZhi: { bulge: 0.085, blur: 1.2, grid: 0.05, sheen: 0.15, grain: 0.05 },
            xiShan:     { bulge: 0.045, blur: 0.6, grid: 0.12, sheen: 0.09, grain: 0.03 },
            geLiTe:     { bulge: 0.050, blur: 0.6, grid: 0.10, sheen: 0.09, grain: 0.03 },
            xianDuRiLa: { bulge: 0.050, blur: 0.6, grid: 0.08, sheen: 0.17, grain: 0.03 }
        };
    },

    // ============================================================
    //  三、主渲染流水线
    // ============================================================

    drawIronPreview(perlerColors, pw, ph, state) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
        const canvas = this._ironPreviewCanvas;
        const ctx = this._ironPreviewCtx;

        const profile = this._ironProfiles()[state.mode] || this._ironProfiles().normal;
        // 强度按 5% 量化：拖滑杆时不必每 1% 都重画一遍，也让缓存更容易命中
        const amp = Math.round(state.intensity * 20) / 20;

        // ---- 分辨率预算：倍率 × 豆径 不能超过上限 ----
        let cellSize = Math.max(6, Math.round(20 * state.zoom));
        const maxPx = state.maxPx || this._IRON_PREVIEW_MAX_PX;
        const maxDim = Math.max(pw, ph);
        if (cellSize * maxDim > maxPx) cellSize = Math.max(3, Math.floor(maxPx / maxDim));

        const padding = 18;
        const plateW = pw * cellSize;
        const plateH = ph * cellSize;
        const w = plateW + padding * 2;
        const h = plateH + padding * 2;

        // 画布尺寸没变就不要重新分配（重新分配会清空位图，还要重建后备存储）
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        // ---- 成品层（带缓存：只换背景色/开关投影时不必重画整个成品） ----
        const piece = this._ironPieceLayer(perlerColors, pw, ph, cellSize, state, profile, amp, padding);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // 【透明背景】clearRect 而不是填色 —— 留出 alpha 通道，
        // 预览看到的是 CSS 棋盘格（画在元素上，不进位图），导出时是真透明。
        ctx.clearRect(0, 0, w, h);
        if (!state.transparent) {
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, w, h);
        }
        // 透明背景下投影会变成一圈灰雾，很难看 → 自动跳过
        const useShadow = state.shadow !== false && !state.transparent;
        if (useShadow) {
            this._drawIronShadow(ctx, this._ironGeo, padding, amp, state);
        }
        ctx.drawImage(piece, 0, 0);

        return (typeof performance !== 'undefined') ? performance.now() - t0 : undefined;
    },

    /**
     * 成品层：一块透明背景的画布，里面只有成品本身（底板 + 纹理 + 格线 + 光照）。
     *
     * 单独成层的好处：换背景色、开关投影时只重画背景 + 贴图，
     * 不需要把几千万像素的纹理/光照重新算一遍。
     */
    _ironPieceLayer(perlerColors, pw, ph, cellSize, state, profile, amp, padding) {
        const melt = state.melt === true;
        const geo = this._ironGeometryCached(perlerColors, pw, ph, cellSize, profile, amp, melt, state);
        const w = pw * cellSize + padding * 2;
        const h = ph * cellSize + padding * 2;
        // 缓存 key 必须带上澡巾变体 —— 否则切换织纹会命中旧缓存看到上一个的效果
        // ★ 缓存 key 必须含花纹几何参数 —— 否则调大小/旋转会命中旧纹理层
        const tg = this._ironTexGeom(state);
        const key = `${geo.key}|${state.mode}|${amp.toFixed(2)}|${w}x${h}` +
            (state.mode === 'zaoJin' ? '|' + (state.zaoJin || '') +
                '|s' + tg.scale.toFixed(3) + 'r' + tg.rot.toFixed(1) : '') +
            '|' + this._glitterTag(state);
        if (this._ironPieceKey === key && this._ironPieceCanvas) return this._ironPieceCanvas;

        let layer = this._ironPieceCanvas;
        if (!layer) {
            layer = document.createElement('canvas');
            this._ironPieceCanvas = layer;
        }
        layer.width = w;        // 赋 width 会顺带清空整块画布
        layer.height = h;
        const ctx = layer.getContext('2d');
        const plateW = pw * cellSize;
        const plateH = ph * cellSize;
        const blurPx = geo.blurPx;
        // 统一用"量化后的强度"往下传：拖滑杆时不会每 1% 都换一套纹理
        const qstate = Object.assign({}, state, { intensity: amp });

        ctx.save();
        ctx.translate(padding, padding);

        if (melt && geo.mask) {
            // ============================================================
            //  熔融路径：底色用 metaball mask，后续层全部裁到同一轮廓
            // ============================================================
            //  mask 自带正确颜色（按最近豆取色），所以不需要 _drawBasePlate
            ctx.drawImage(geo.mask.canvas, 0, 0);

            // 用 mask 的轮廓做 clip —— 与非熔融路径的 geo.path 完全同构，
            // 后续 ②③④ 层的代码一行都不用改。
            if (geo.maskPath) ctx.clip(geo.maskPath);

            this._applyTextureLayer(ctx, plateW, plateH, cellSize, qstate, profile);
            this._drawBeadGridLines(ctx, perlerColors, pw, ph, cellSize, profile.grid * (0.5 + 0.5 * amp));
            this._applyLightingLayer(ctx, plateW, plateH, qstate, profile, amp, geo);
            // 闪光层永远最后叠：晶体是撒在表面上的，不该被烫法纹理盖住
            this._applyGlitterLayer(ctx, plateW, plateH, cellSize, qstate);

            ctx.restore();
            this._ironPieceKey = key;
            return layer;
        }

        // ---- ① 底板：离屏 + 高斯模糊（塑料融平融合感） ----
        const blurPad = Math.max(14, Math.ceil(blurPx * 3) + 4);
        // 【不要复用这块 canvas】试过复用，省下的时间抵不过残影风险：
        // 底板是"半透明 + 模糊"的合成结果，尺寸相同但内容不同的两次渲染
        // 之间残留像素会被下一层放大，实测残影达 14754 像素（maxDelta 146）。
        // 每帧新建一张空白画布反而最稳。
        const plate = document.createElement('canvas');
        plate.width = plateW + blurPad * 2;
        plate.height = plateH + blurPad * 2;
        const pCtx = plate.getContext('2d');
        pCtx.translate(blurPad, blurPad);
        this._drawBasePlate(pCtx, perlerColors, pw, ph, cellSize, geo.bulge);

        // 底板模糊用"扩张路径"裁剪，防止模糊光晕溢出到透明区
        ctx.save();
        ctx.clip(geo.expandPath);
        if (blurPx > 0.15) ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(plate, -blurPad, -blurPad);
        ctx.filter = 'none';
        ctx.restore();

        // ---- ② 纹理层 + ④ 光照层：合并成一次 clip ----
        //
        // 【性能】这两层用的是同一个 geo.path。原先各 clip 一次，但
        // clip 会强制浏览器同步等待光栅化 —— 一旦流水线里出现 clip / filter，
        // Chrome 就不能把绘制命令异步排队了，整幅 2836² 的画面被逼着当场算完。
        // 实测这一步是拖滑杆时最大的单项开销。
        //
        // 合并成一次 clip 后：只同步一次，且中间的几何层(① blur / ③ 格线)照旧
        // 画在同一个 clip 里 —— 它们本来也都在豆子轮廓内，视觉结果逐像素不变。
        ctx.save();
        ctx.clip(geo.path);

        // ---- ② 纹理层（clip 到豆子轮廓，绝不溢出） ----
        this._applyTextureLayer(ctx, plateW, plateH, cellSize, qstate, profile);

        // ---- ③ 豆子格线（烫后仍隐约可见的豆子轮廓，带轻微扭曲） ----
        // 格线本来就落在豆子内部，不需要额外 clip
        this._drawBeadGridLines(ctx, perlerColors, pw, ph, cellSize, profile.grid * (0.5 + 0.5 * amp));

        // ---- ④ 光照层 + 塑料基底光泽 + 外缘反光 ----
        this._applyLightingLayer(ctx, plateW, plateH, qstate, profile, amp, geo);

        // ---- ⑤ 闪光晶体层（独立叠层，最后加色叠上去）----
        this._applyGlitterLayer(ctx, plateW, plateH, cellSize, qstate);

        ctx.restore();
        ctx.restore();

        this._ironPieceKey = key;
        return layer;
    },

    /** 图案指纹：判断几何缓存是否还有效（扫一遍约 0.5ms，比重建路径便宜太多） */
    _ironPatternRev(perlerColors, pw, ph) {
        let h = 2166136261;
        for (let y = 0; y < ph; y++) {
            const row = perlerColors[y];
            for (let x = 0; x < pw; x++) {
                const c = row[x];
                if (c.isTransparent) { h = Math.imul(h ^ 0x9e3779b9, 16777619); continue; }
                const rgb = c.rgb;
                h = Math.imul(h ^ (rgb[0] + (rgb[1] << 8) + (rgb[2] << 16)), 16777619);
            }
        }
        return (h >>> 0).toString(36);
    },

    /**
     * 几何缓存：轮廓路径 / 扩张路径 / 外轮廓线，外加鼓起量与模糊量。
     *
     * 只要图案、豆径、鼓起量没变（换背景色、开关投影、重开弹窗…），
     * 就直接复用，省掉重新扫一遍所有格子的开销。
     *
     * 【2026-10-15 新增】熔融模式：melt=1 时走 metaball 轮廓，
     * 凹角会被填平、凸角圆润（见 _buildMetaballMask）。
     */
    _ironGeometryCached(perlerColors, pw, ph, cellSize, profile, amp, melt, state) {
        const bulge = profile.bulge * cellSize * (0.6 + 0.4 * amp);
        const blurPx = profile.blur * (0.4 + 0.6 * amp);
        const expand = blurPx * 2 + 1;
        const rev = this._ironPatternRev(perlerColors, pw, ph);
        const m = melt ? 1 : 0;
        // ★ 熔融参数必须进 key —— 否则调完滑杆会命中旧 mask，看到上一次的效果
        const mp = this._ironMeltParams(state);
        const mtag = m ? `r${mp.r.toFixed(3)}k${mp.k.toFixed(2)}b${mp.bias.toFixed(3)}s${mp.span.toFixed(2)}` : '';
        const key = `${rev}|${pw}x${ph}|${cellSize}|${bulge.toFixed(2)}|${expand.toFixed(2)}|m${m}${mtag}`;

        if (this._ironGeo && this._ironGeo.key === key) return this._ironGeo;

        let t;
        if (melt) {
            // 熔融模式：metaball SDF → mask
            // bulge 在 metaball 里被 r 取代（半径直接由豆径决定）
            const mm = this._buildMetaballMask(perlerColors, pw, ph, cellSize, mp);
            t = { mask: mm, path: null, expandPath: null, outline: null };
        } else {
            t = this._buildIronGeometry(perlerColors, pw, ph, cellSize, bulge, expand);
        }
        this._ironGeo = {
            key, bulge, blurPx, cellSize,
            plateW: pw * cellSize, plateH: ph * cellSize,
            path: t.path, expandPath: t.expandPath, outline: t.outline,
            mask: t.mask || null,
            maskPath: (t.mask && t.mask.path) || null
        };
        return this._ironGeo;
    },

    // ============================================================
    //  熔融轮廓（Metaball / Gooey 等价实现）
    // ============================================================
    //
    //  【为什么需要这个 —— 逐豆画路径的死结】
    //  原来的 _buildIronGeometry 是**逐颗豆子独立画路径**。
    //  凹角（两豆斜对角相接处）在这个模型里根本不存在"两颗豆的关系"，
    //  只能各画各的 → 结果永远是直角折断。
    //
    //  SVG 的 Gooey 滤镜能解决，但：
    //    ① 它对**所有**色块生效 → 内部色块也会糊在一起，颜色全毁
    //    ② ctx.filter = 'url(#goo)' Chrome 不支持，必须改走 DOM 渲染
    //  所以改为在 Canvas 里手写等价的 metaball。
    //
    //  【原理】
    //    每颗豆 = 一个圆角矩形的有符号距离场（SDF）
    //    多颗豆合并 = 平滑并集 smin（不是硬 min）→ 凹角自动被"填"成圆弧
    //    smin(d1,d2) = min - h²k/4，h = max(0, k-|d1-d2|)/k
    //
    //  【★ 关键性能设计：格子分辨率 SDF】
    //  逐像素算 SDF = 每像素 9 次距离，2800×2800 实测 1824ms（不可接受）。
    //  但 SDF 本身是**平滑**的，相邻像素值差 < 1px ——
    //  所以在**格子中心**算（每格 1 个采样点），再双线性插值到全分辨率。
    //  实测 1824ms → 5ms（360×），轮廓零差异。
    //
    //  【★ 另一个关键：r 是「豆径比例」不是绝对像素】
    //  固定 r=40px 在豆径 18px 的图上会把整个方块吃成圆形。
    //  必须按比例，不同倍率下观感才一致。

    // ★ 熔融边默认参数（2026-10-15 扫描标定）
    //   现在这四个值可以在预览面板里实时调（滑杆），调完会存进
    //   `_ironPreviewState.melt`。这里的常量只是「出厂默认值」。
    //
    //   R: 融合半径 = 豆径比例。
    //      R 会同时影响「豆子圆角」和「整体外扩」，两者耦合：
    //      R=0.30 时轮廓整体外扩一圈，满屏斜对角的图案直接糊成条纹。
    //      所以 R 取小值（几乎不改变豆子形状），靠 K 来填凹角。
    //   K: 平滑并集系数（单位：格）。
    //      smin 最多能把距离拉低 k/4。要填的凹角最多 0.5 格深，K≈2 就够（k/4=0.5）。
    //      K 太大会把空隙也拉成成品，整个糊成一片。
    //   BIAS: 阈值偏置。略大于 0，让边界像素归入成品（抗锯齿更自然）。
    //   SPAN: 融合范围上限（格）—— 关键参数，见 _ironSmin2 的坑说明。
    //      必须明显小于「豆子间空隙的宽度」，否则空隙会被误判成成品。
    _IRON_MELT_DEFAULTS: { r: 0.18, k: 2.0, bias: 0.02, span: 0.35 },

    /** 熔融参数的滑杆定义（UI 与默认值共用一份，避免两处漂移） */
    _ironMeltParamSpec() {
        return [
            {
                id: 'r', label: '圆角', min: 0, max: 0.45, step: 0.01, def: 0.18,
                title: '融合半径 = 豆径的比例。调大 → 豆子更圆、整体轮廓外扩；调小 → 接近直角'
            },
            {
                id: 'k', label: '融合', min: 0, max: 6, step: 0.1, def: 2.0,
                title: '平滑并集系数（格）。调大 → 凹角填得更满；过大时豆子间空隙也会被填上'
            },
            {
                id: 'bias', label: '阈值', min: -0.1, max: 0.2, step: 0.01, def: 0.02,
                title: '成品判定阈值。调大 → 轮廓外扩一圈；调小 → 轮廓收缩'
            },
            {
                id: 'span', label: '范围', min: 0.05, max: 1.0, step: 0.01, def: 0.35,
                title: '融合范围上限（格）。必须小于豆子间空隙（1 格），否则空隙会被误判成成品'
            }
        ];
    },

    // ★ 投影默认参数（2026-10-16）
    //   OPACITY  不透明度。成品离桌面越近越实，悬空则更虚。
    //   BLUR     模糊半径，按豆径比例（跟强度无关）——投影的软硬跟豆子大小无关，
    //            只跟"离桌面的距离"有关，所以这里不进 amp。
    //   DX/DY    偏移量，按豆径比例。默认右下偏移，与"光从左上来"一致。
    //            Y 为负 → 影子往左投（顶光）；X 为负 → 影子往右投。
    //   SPREAD   扩散（膨胀）量。真实阴影不是纯模糊，它还有一圈半影向外爬。
    //            实现上等价于"偏移 + 多次叠加"，这里用 spread 段数模拟。
    _IRON_SHADOW_DEFAULTS: { opacity: 0.45, blur: 0.30, dx: 0.16, dy: 0.26, spread: 0.0 },

    // ★ 闪光晶体（2026-10-26）
    //
    //  【为什么单独一层】烫法描述的是"塑料怎么融、表面压了什么"；
    //  闪光晶体是撒在成品上面的一层独立物质（细闪 / 粗闪粉）。
    //  实拍里"澡巾烫 + 粗闪"是完全成立的组合，所以两者必须正交。
    //
    //  DENSITY    密度。用「抖动网格」而不是纯随机：纯随机会结块、留空洞，
    //             而实拍的闪粉是偏均匀的一层。间距随密度从 1.1 豆缩到 0.3 豆。
    //  SIZE       晶体粒径（豆径比例）。细闪 ≈ 0.06，粗闪 ≈ 0.16。
    //  BRIGHT     反光强度。这一层是加色（lighter）叠的，越大越"不灵不灵"。
    //  TINT       冷暖。0 = 偏冷蓝白，1 = 偏暖金，0.5 = 纯白。
    _IRON_GLITTER_DEFAULTS: { density: 0.50, size: 0.45, bright: 0.70, tint: 0.5 },

    /** 闪光参数：把 state 里的覆盖值合并到默认值上 */
    _ironGlitterParams(state) {
        const d = this._IRON_GLITTER_DEFAULTS;
        const g = (state && state.glitter) || null;
        const out = {
            on: !!(g && g.on),
            density: g && g.density !== undefined ? g.density : d.density,
            size: g && g.size !== undefined ? g.size : d.size,
            bright: g && g.bright !== undefined ? g.bright : d.bright,
            tint: g && g.tint !== undefined ? g.tint : d.tint
        };
        return out;
    },

    /** 闪光参数的滑杆定义（UI 与默认值共用一份） */
    _ironGlitterParamSpec() {
        return [
            {
                id: 'density', label: '密度', min: 0, max: 1, step: 0.05, def: 0.55,
                title: '单位面积里的晶体数量。偏均匀撒布（抖动网格），不是随机结块'
            },
            {
                id: 'size', label: '粒径', min: 0.05, max: 1, step: 0.05, def: 0.45,
                title: '单颗晶体的粒径（相对豆径）。小 = 细闪（像磨砂撒粉）；大 = 粗闪（颗粒感）'
            },
            {
                id: 'bright', label: '反光', min: 0, max: 1, step: 0.05, def: 0.62,
                title: '晶体反光强度。这一层是加色叠上去的，调高会更"闪"，但太高会糊住颜色'
            },
            {
                id: 'tint', label: '冷暖', min: 0, max: 1, step: 0.05, def: 0.5,
                title: '晶体色温。0 = 冷蓝白（仙度瑞拉那种）；0.5 = 纯白；1 = 暖金'
            }
        ];
    },

    /** 投影参数的滑杆定义（UI 与默认值共用一份，避免两处漂移） */
    _ironShadowParamSpec() {
        return [
            {
                id: 'opacity', label: '浓度', min: 0, max: 1, step: 0.01, def: 0.45,
                title: '投影不透明度。0 = 完全无影；1 = 最实'
            },
            {
                id: 'blur', label: '柔和', min: 0, max: 1.2, step: 0.01, def: 0.30,
                title: '模糊半径（豆径倍数）。小 = 影子贴得很紧很硬；大 = 影子散得很开，像悬空'
            },
            {
                id: 'dx', label: '横向', min: -1.5, max: 1.5, step: 0.01, def: 0.16,
                title: '水平偏移（豆径倍数）。负值 → 影子往左投'
            },
            {
                id: 'dy', label: '纵向', min: -1.5, max: 1.5, step: 0.01, def: 0.26,
                title: '垂直偏移（豆径倍数）。负值 → 影子往上投（顶光）'
            },
            {
                id: 'spread', label: '扩散', min: 0, max: 1, step: 0.05, def: 0.0,
                title: '半影扩散。真实阴影除模糊外还有一圈向外爬的软边，0 = 只有模糊'
            }
        ];
    },

    /** 取当前生效的投影参数（state 优先，缺项回落到默认值） */
    _ironShadowParams(state) {
        const d = this._IRON_SHADOW_DEFAULTS;
        const s = (state && state.shadowParams) || null;
        return {
            opacity: s && s.opacity !== undefined ? s.opacity : d.opacity,
            blur: s && s.blur !== undefined ? s.blur : d.blur,
            dx: s && s.dx !== undefined ? s.dx : d.dx,
            dy: s && s.dy !== undefined ? s.dy : d.dy,
            spread: s && s.spread !== undefined ? s.spread : d.spread
        };
    },

    /** 取当前生效的熔融参数（state 优先，缺项回落到默认值） */
    _ironMeltParams(state) {
        const d = this._IRON_MELT_DEFAULTS;
        const m = (state && state.melt) || null;
        return {
            r: m && m.r !== undefined ? m.r : d.r,
            k: m && m.k !== undefined ? m.k : d.k,
            bias: m && m.bias !== undefined ? m.bias : d.bias,
            span: m && m.span !== undefined ? m.span : d.span
        };
    },

    /** 单个圆角矩形的有符号距离（iq 的 sdRoundBox），cell 单位下调用 */
    _ironCellDist(px, py, bx, by, cell, r) {
        const hx = cell / 2, hy = cell / 2;
        const cx = bx + hx, cy = by + hy;
        const rr = Math.min(r, hx * 0.98, hy * 0.98);
        const qx = Math.abs(px - cx) - (hx - rr);
        const qy = Math.abs(py - cy) - (hy - rr);
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    },

    /**
     * 平滑并集（带间距上限）—— 凹角靠它填平。
     *
     * ★★ 这里有一个必须加的限制，踩过坑 ★★
     *
     * 教科书写法是 smin(a,b) = min - h²·k/4，h = max(0, k-|a-b|)/k。
     * 但它在 **|a-b| 很小时也会收缩**，不管两点是不是"贴在一起"。
     *
     * 实测后果（checker 图案，豆子只斜对角相接）：
     *     空隙格心到四个豆的距离全相等 → smin 无条件收缩 k/4
     *     → k=2 时每个空隙格心距离变成 0.0 < bias → 全被判成成品
     *     → 整个图案糊成一片条纹（实测过）
     *
     * 所以必须加 `span`：只有两点的距离都**足够小**（即真的在融合区里）
     * 才让 smin 生效。远处两点走纯 min，完全不影响形状。
     *
     * @param {number} span - 融合范围（格）。超过它的距离不参与融合。
     */
    _ironSmin2(a, b, k, span) {
        if (span !== undefined && (a > span || b > span)) return Math.min(a, b);
        const h = Math.max(0, k - Math.abs(a - b)) / k;
        return Math.min(a, b) - h * h * k * 0.25;
    },

    /**
     * 生成熔融轮廓的 alpha mask（PlateW × PlateH，白=成品 / 黑=透明）。
     *
     * 流程：格子分辨率 SDF → 平滑并集 → 双线性插值到全分辨率 → 阈值成 mask。
     */
    _buildMetaballMask(perlerColors, pw, ph, cellSize, params) {
        const P = params || this._IRON_MELT_DEFAULTS;
        const rG = P.r;                            // 豆径比例
        const kG = P.k;                            // 参数直接就是「格」，不再除 4
        const biasG = P.bias;
        // 融合范围：只有这个距离内的两点才允许融合（见 _ironSmin2 注释）
        const spanG = P.span;

        // ---- 1. 格子分辨率 SDF ----
        const sdf = new Float32Array(pw * ph).fill(1e6);
        const cid = new Int32Array(pw * ph).fill(-1);
        // 色号索引表（避免在 SDF 循环里存对象引用）
        const colors = [];
        const colorIdx = new Map();
        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                const c = perlerColors[y][x];
                if (c.isTransparent) continue;
                const key = c.rgb[0] + ',' + c.rgb[1] + ',' + c.rgb[2];
                let idx = colorIdx.get(key);
                if (idx === undefined) { idx = colors.length; colors.push(c.rgb); colorIdx.set(key, idx); }
                cid[y * pw + x] = idx;
            }
        }

        for (let cy = 0; cy < ph; cy++) {
            for (let cx = 0; cx < pw; cx++) {
                const px = cx + 0.5, py = cy + 0.5;
                let d1 = 1e6, i1 = -1, d2 = 1e6, i2 = -1;
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = cy + dy;
                    if (ny < 0 || ny >= ph) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx;
                        if (nx < 0 || nx >= pw) continue;
                        const idx = cid[ny * pw + nx];
                        if (idx < 0) continue;
                        const d = this._ironCellDist(px, py, nx, ny, 1, rG);
                        if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = idx; }
                        else if (d < d2) { d2 = d; i2 = idx; }
                    }
                }
                if (i1 < 0) continue;
                const i = cy * pw + cx;
                sdf[i] = (i2 >= 0) ? this._ironSmin2(d1, d2, kG, spanG) : d1;
                // 颜色取"最近豆"（硬 min 的胜者），这与现有的填充规则一致
                cid[i] = (d1 <= d2) ? i1 : i2;
            }
        }

        // ---- 2. 双线性插值到全分辨率 → 阈值 → mask ----
        const W = pw * cellSize, H = ph * cellSize;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(W, H);
        const d = img.data;

        for (let py = 0; py < H; py++) {
            const fy = py / cellSize - 0.5;
            const y0 = Math.max(0, Math.floor(fy));
            const y1 = Math.min(ph - 1, y0 + 1);
            const ty = Math.max(0, Math.min(1, fy - y0));
            for (let px = 0; px < W; px++) {
                const fx = px / cellSize - 0.5;
                const x0 = Math.max(0, Math.floor(fx));
                const x1 = Math.min(pw - 1, x0 + 1);
                const tx = Math.max(0, Math.min(1, fx - x0));

                const s00 = sdf[y0 * pw + x0], s10 = sdf[y0 * pw + x1];
                const s01 = sdf[y1 * pw + x0], s11 = sdf[y1 * pw + x1];
                const s = (s00 * (1 - tx) + s10 * tx) * (1 - ty) + (s01 * (1 - tx) + s11 * tx) * ty;
                if (s >= biasG) continue;              // 轮廓外

                // 颜色：四角里 sdf 最小的那个
                let best = 1e6, col = -1;
                for (const q of [y0 * pw + x0, y0 * pw + x1, y1 * pw + x0, y1 * pw + x1]) {
                    const qv = sdf[q];
                    if (qv < best) { best = qv; col = cid[q]; }
                }
                if (col < 0) continue;
                const rgb = colors[col];
                const p = (py * W + px) * 4;
                d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);

        // ---- 3. 从 mask 提取轮廓路径（供 ctx.clip 用）----
        // 后续 ②③④ 层都要裁到成品轮廓内，而 canvas 的 clip() 只接受 Path2D。
        // 用 marching squares 从 alpha 通道提边界：成本约 W×H×常数，
        // 比逐像素 clip 快（clip 一条几万段子路径的 Path2D 会拖垮光栅化）。
        const mpath = this._ironMaskToPath(d, W, H);

        return { canvas: cv, w: W, h: H, path: mpath };
    },

    /**
     * 从 mask 的 alpha 通道提取**闭合**轮廓 Path2D。
     *
     * 【★ 这段为什么必须重写 —— 一个 0 像素的 bug】
     * 原实现是 marching squares：对每个格子按 case 表吐 1~2 条 `moveTo+lineTo`
     * **不闭合的独立线段**。Canvas 的 fill()/clip() 都按「闭合区域」处理路径，
     * 一堆开放线段既围不出区域、也构不成裁剪环。headless 实测（40×40 方块）：
     *   fill()  → 0 像素（对照 rect 填充 = 400）
     *   clip()  → 保留 0 像素
     * 后果是熔融模式下**纹理层 / 格线层 / 光照层全部一像素没画出来**，
     * 投影也是空的 —— 表现就是「开了熔融边，阴影就消失了」。
     * 它不是被遮挡，是几何体本身退化成了空集。
     *
     * 【现在的做法：二值 mask → 有向边 → 串闭环】
     * ① 3×3 邻域投票把锯齿边界抹平（沿用原逻辑）
     * ② 逐像素吐边界有向边，方向恒定保证「成品恒在右手边」：
     *      上边 TL→TR、右边 TR→BR、下边 BR→BL、左边 BL→TL
     *    因为环绕方向一致，**外轮廓与内洞的绕向天然相反**，
     *    nonzero fill 规则直接把洞挖掉，不需要额外的 evenodd 或反向描边。
     * ③ 按起点排序建 CSR 邻接表，二分查找把散边串成闭环。
     *    鞍点（对角相接，如棋盘格）同一顶点有 2 条出边，
     *    按「右转 > 直行 > 左转 > 掉头」固定优先级选，保证环不自交。
     *
     * headless 六项验证：实心 896/896、甜甜圈 1536/1536（洞正确挖掉）、
     * 对角相接 642/642、双孤岛 288/288、棋盘格 1.3ms、空 mask 返回空路径不崩。
     * （与期望值的个位数差异来自 ① 的边缘侵蚀，是原有行为，非本改动引入。）
     */
    _ironMaskToPath(d, W, H) {
        // ---- ① 3×3 邻域投票 → 平滑后的内外标记 ----
        const inside = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let c = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const yy = y + dy; if (yy < 0 || yy >= H) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx; if (xx < 0 || xx >= W) continue;
                        if (d[(yy * W + xx) * 4 + 3] > 128) c++;
                    }
                }
                inside[y * W + x] = c >= 5 ? 1 : 0;
            }
        }

        // ---- ② 边界有向边 ----
        // 顶点 = 像素角点 (vx, vy)，vx∈[0,W]、vy∈[0,H]，编码 vy*(W+1)+vx。
        // 只存「终点 + 方向」，起点可由 end - dir 反推，省掉一份数组。
        const CW = W + 1;
        const ex = [], ey = [], edx = [], edy = [];
        const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : inside[y * W + x];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (!at(x, y)) continue;
                if (!at(x, y - 1)) { ex.push(x + 1); ey.push(y);     edx.push(1);  edy.push(0); }
                if (!at(x + 1, y)) { ex.push(x + 1); ey.push(y + 1); edx.push(0);  edy.push(1); }
                if (!at(x, y + 1)) { ex.push(x);     ey.push(y + 1); edx.push(-1); edy.push(0); }
                if (!at(x - 1, y)) { ex.push(x);     ey.push(y);     edx.push(0);  edy.push(-1); }
            }
        }
        const n = ex.length;
        if (!n) return new Path2D();

        // ---- ③ CSR 邻接表：按起点排序，查找走二分 ----
        // 不为每个顶点开一个小数组（2800² 的图有 780 万个顶点，那样会炸内存）。
        const key = new Int32Array(n);
        for (let i = 0; i < n; i++) key[i] = (ey[i] - edy[i]) * CW + (ex[i] - edx[i]);
        const sorted = Array.from({ length: n }, (_, i) => i).sort((a, b) => key[a] - key[b]);
        const sortedKeys = new Int32Array(n);
        for (let i = 0; i < n; i++) sortedKeys[i] = key[sorted[i]];
        const slot = new Int32Array(2);
        // 同一顶点的出边最多 2 条（鞍点），所以 slot 只需 2 格
        const lookup = (k) => {
            let lo = 0, hi = n;
            while (lo < hi) { const m = (lo + hi) >> 1; if (sortedKeys[m] < k) lo = m + 1; else hi = m; }
            let c = 0;
            while (lo < n && sortedKeys[lo] === k && c < 2) slot[c++] = sorted[lo++];
            return c;
        };

        // ---- ④ 串成闭环 ----
        const used = new Uint8Array(n);
        const parts = [];
        const guardMax = n * 2 + 16;   // 理论上不会触发，防畸形数据死循环
        for (let i0 = 0; i0 < n; i0++) {
            if (used[i0]) continue;
            const startX = ex[i0] - edx[i0], startY = ey[i0] - edy[i0];
            parts.push('M', startX, startY);
            let cur = i0; used[cur] = 1;
            let px = edx[cur], py = edy[cur];
            let vx = ex[cur], vy = ey[cur];
            parts.push('L', vx, vy);
            let guard = 0;
            while (!(vx === startX && vy === startY) && guard++ < guardMax) {
                const cnt = lookup(vy * CW + vx);
                let best = -1, bestScore = 9;
                for (let c = 0; c < cnt; c++) {
                    const e = slot[c];
                    if (used[e]) continue;
                    const cross = px * edy[e] - py * edx[e];
                    const dot = px * edx[e] + py * edy[e];
                    const score = cross < 0 ? 0 : (dot > 0 ? 1 : (cross > 0 ? 2 : 3));
                    if (score < bestScore) { bestScore = score; best = e; }
                }
                if (best < 0) break;
                cur = best; used[cur] = 1;
                px = edx[cur]; py = edy[cur];
                vx = ex[cur]; vy = ey[cur];
                parts.push('L', vx, vy);
            }
            parts.push('Z');
        }
        return new Path2D(parts.join(' '));
    },

    /**
     * 落地投影：真拍照片里成品一定会在桌面上压出一圈柔和阴影，
     * 少了它画面就会"浮"在背景上。
     *
     * 做法：把轮廓画进 1/4 大小的小画布 → 在小画布上就地模糊
     * （1/16 的像素量，几乎不花时间）→ 再放大回来。
     * 大画布上直接跑 filter 才是真的贵。
     *
     * 【轮廓来源】熔融走 geo.maskPath，非熔融走 geo.path。
     * 两者现在都是**闭合**轮廓 —— 原来的 marching squares 吐的是不闭合
     * 散线段，fill() 出来是 0 像素，于是熔融模式下投影整个消失（详见
     * _ironMaskToPath 的说明）。
     */
    _drawIronShadow(ctx, geo, padding, amp, state) {
        if (!geo) return;
        // 熔融路径下轮廓在 geo.maskPath 里（Path2D），
        // 非熔融路径在 geo.path 里。两者都没有就跳过投影。
        const outline = geo.maskPath || geo.path;
        if (!outline) return;
        const P = this._ironShadowParams(state);
        if (P.opacity <= 0) return;
        const cellSize = geo.cellSize;
        const w = geo.plateW + padding * 2;
        const h = geo.plateH + padding * 2;
        const sc = 0.25;
        const sw = Math.max(2, Math.ceil(w * sc));
        const sh = Math.max(2, Math.ceil(h * sc));

        if (!this._ironShadowSrc || this._ironShadowSrc.width !== sw || this._ironShadowSrc.height !== sh) {
            const a = document.createElement('canvas');
            const b = document.createElement('canvas');
            a.width = sw; a.height = sh;
            b.width = sw; b.height = sh;
            this._ironShadowSrc = a;
            this._ironShadowBlur = b;
        }

        const src = this._ironShadowSrc;
        const sctx = src.getContext('2d');
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, sw, sh);
        sctx.save();
        sctx.scale(sc, sc);
        sctx.translate(padding, padding);
        sctx.fillStyle = '#000';
        // 扩散：在轮廓外围多画几圈等比放大的副本，模拟半影向外爬
        const layers = P.spread > 0 ? 3 : 1;
        if (layers > 1) {
            const cx = geo.plateW / 2, cy = geo.plateH / 2;
            for (let i = layers; i >= 1; i--) {
                const f = 1 + (P.spread * 0.14 * i);
                sctx.save();
                sctx.translate(cx, cy);
                sctx.scale(f, f);
                sctx.translate(-cx, -cy);
                sctx.fill(outline);
                sctx.restore();
            }
        } else {
            sctx.fill(outline);
        }
        sctx.restore();

        const blur = this._ironShadowBlur;
        const bctx = blur.getContext('2d');
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, sw, sh);
        bctx.save();
        // blur 下限给 1.2px：1/4 画布上再小的值会被量化成 0，等于不模糊
        bctx.filter = `blur(${Math.max(1.2, cellSize * P.blur * sc)}px)`;
        bctx.drawImage(src, 0, 0);
        bctx.restore();

        ctx.save();
        // 浓度：默认按强度轻微加成（强度越大成品贴得越实），
        // 但保留滑杆的绝对控制权 —— 滑到 0 就一定没有影子。
        ctx.globalAlpha = P.opacity * (0.72 + 0.28 * amp);
        // 往右下偏一点，与"光从左上来"保持一致
        // 注意要放大回原尺寸：blur 只是 1/4 大小的模糊版
        ctx.drawImage(blur, cellSize * P.dx, cellSize * P.dy, w, h);
        ctx.restore();
    },

    // ============================================================
    //  四、豆子轮廓（圆润外凸，无尖角）
    // ============================================================

    /** 确定性伪随机 → -1..1（保证重绘时形状稳定） */
    _hash(x, y, salt) {
        let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h = h ^ (h >>> 16);
        return ((h >>> 0) % 20000) / 10000 - 1;
    },

    /** 0..1 的确定性随机 */
    _rand01(x, y, salt) {
        return (this._hash(x, y, salt) + 1) / 2;
    },

    /**
     * 生成单颗豆子的路径
     *
     * 【渲染规则】（物理依据：塑料融化向外流动）
     *  · 内部豆：四周都被邻居约束 → 完全方正、零空隙
     *            （内部边一律不位移、内部角一律不圆角）
     *  · 边缘豆：朝外的边向外弧线凸出（融化流动）
     *  · 奶油边：相邻边缘豆共用的顶点也向外位移，位移量 ≈ 弧线凸起量的一半
     *            → 两侧弧线首尾相接、不再出现凹口 → 连成一条连续起伏的"奶油边"
     *  · 转角：只有"凸角"（相邻两条边都朝外）用大圆角 → 圆润如奶油挤压的转角
     *
     * 全程只有二次贝塞尔曲线，数学上不可能出现折线尖角。
     *
     * @param {number} bulge  - 边缘外流幅度基准（px）
     * @param {number} expand - 额外整体外扩（给底板模糊留余量）
     */
    _cellPath(t, perlerColors, x, y, pw, ph, s, bulge, expand) {
        const vis = (cx, cy) => {
            if (cx < 0 || cy < 0 || cx >= pw || cy >= ph) return false;
            return !perlerColors[cy][cx].isTransparent;
        };

        const upOut = !vis(x, y - 1);
        const downOut = !vis(x, y + 1);
        const leftOut = !vis(x - 1, y);
        const rightOut = !vis(x + 1, y);

        // 外推量/控制点/顶点位移统一由 _cellMetrics 给出（与 _cellEdges 同源）
        const { px, py, cU, cD, cL, cR, dxL, dxR, dyU, dyD } =
            this._cellMetrics(x, y, s, bulge, expand, upOut, downOut, leftOut, rightOut);

        const TL = { x: px + dxL, y: py + dyU };
        const TR = { x: px + s + dxR, y: py + dyU };
        const BR = { x: px + s + dxR, y: py + s + dyD };
        const BL = { x: px + dxL, y: py + s + dyD };

        // 顶点圆角：仅"凸角"（两条相邻边都朝外）用大圆角
        // 其余一律为 0 → 内部严格无缝，轮廓过渡处保持连续不出现凹口
        const R = s * 0.22;
        const rTL = (leftOut && upOut) ? R : 0;
        const rTR = (rightOut && upOut) ? R : 0;
        const rBR = (rightOut && downOut) ? R : 0;
        const rBL = (leftOut && downOut) ? R : 0;

        t.moveTo(TL.x + rTL, TL.y);

        // 上边（控制点在中点上方 → 朝外弧线；内部边控制点落在线上 → 退化为直线）
        t.quadraticCurveTo((TL.x + TR.x) / 2, (TL.y + TR.y) / 2 - cU, TR.x - rTR, TR.y);
        if (rTR > 0) t.quadraticCurveTo(TR.x, TR.y, TR.x, TR.y + rTR);

        // 右边
        t.quadraticCurveTo((TR.x + BR.x) / 2 + cR, (TR.y + BR.y) / 2, BR.x, BR.y - rBR);
        if (rBR > 0) t.quadraticCurveTo(BR.x, BR.y, BR.x - rBR, BR.y);

        // 下边
        t.quadraticCurveTo((BL.x + BR.x) / 2, (BL.y + BR.y) / 2 + cD, BL.x + rBL, BL.y);
        if (rBL > 0) t.quadraticCurveTo(BL.x, BL.y, BL.x, BL.y - rBL);

        // 左边
        t.quadraticCurveTo((TL.x + BL.x) / 2 - cL, (TL.y + BL.y) / 2, TL.x, TL.y + rTL);
        if (rTL > 0) t.quadraticCurveTo(TL.x, TL.y, TL.x + rTL, TL.y);

        t.closePath();
    },

    /**
     * 沿轮廓连续变化的外凸噪声（0~1）
     *
     * 与 _rand01 的区别：相邻格子的取值**相近**。
     * 这正是"奶油边"的关键——相邻边缘豆的鼓包量接近，
     * 外轮廓才会连成一条连贯的波浪，而不是一颗颗孤立的鼓包。
     */
    _contourNoise(x, y, salt) {
        const a = Math.sin(x * 1.1 + salt * 1.9) * Math.cos(y * 1.0 - salt * 0.7);
        const b = Math.sin((x + y) * 0.8 + salt * 2.6);
        return 0.5 + 0.3 * a + 0.2 * b;
    },

    /**
     * 一颗豆子的外流几何量（`_cellPath` 与 `_cellEdges` 共用同一套算法，
     * 保证"填充的轮廓"和"描边的外轮廓线"完全重合）
     */
    _cellMetrics(x, y, s, bulge, expand, upOut, downOut, leftOut, rightOut) {
        const px = x * s;
        const py = y * s;

        // 朝外边的外推量：用"沿轮廓连续变化"的低频噪声
        // （相邻格子的取值相近 → 相邻边缘豆鼓包量接近 → 波浪连贯而非孤立）
        const nz = (salt) => this._contourNoise(x, y, salt);
        const base = bulge * 0.55;   // 融化的平均外流量
        const vary = bulge * 0.45;   // 沿轮廓起伏的部分

        const oU = upOut ? base + vary * nz(1) + expand : 0;
        const oD = downOut ? base + vary * nz(2) + expand : 0;
        const oL = leftOut ? base + vary * nz(3) + expand : 0;
        const oR = rightOut ? base + vary * nz(4) + expand : 0;

        // 顶点位移：消掉"相邻弧线之间的凹口"，让轮廓连成连续的奶油边
        const kV = 0.5;
        return {
            px, py,
            // 边弧线的控制点凸起量（略小于外推量 → 柔和的圆弧鼓起）
            cU: oU * 0.75, cD: oD * 0.75, cL: oL * 0.75, cR: oR * 0.75,
            dxL: leftOut ? -oL * kV : 0,
            dxR: rightOut ? oR * kV : 0,
            dyU: upOut ? -oU * kV : 0,
            dyD: downOut ? oD * kV : 0
        };
    },

    /**
     * 只画"朝外的边"，且不闭合 —— 专门用来描外轮廓线。
     *
     * 描边不需要闭合（只有填充才需要），所以可以只取朝外的边，
     * 这样得到的就是真正的"成品外轮廓"，而不是每颗边缘豆的方框
     * ——后者会在成品内部留下本来不存在的线。
     * 顶点位移与 `_cellPath` 完全一致，所以描边正好压在轮廓上。
     */
    _cellEdges(t, x, y, s, bulge, upOut, downOut, leftOut, rightOut) {
        const m = this._cellMetrics(x, y, s, bulge, 0, upOut, downOut, leftOut, rightOut);
        const { px, py, cU, cD, cL, cR, dxL, dxR, dyU, dyD } = m;

        const TLx = px + dxL, TLy = py + dyU;
        const TRx = px + s + dxR, TRy = py + dyU;
        const BRx = px + s + dxR, BRy = py + s + dyD;
        const BLx = px + dxL, BLy = py + s + dyD;

        if (upOut) {
            t.moveTo(TLx, TLy);
            t.quadraticCurveTo((TLx + TRx) / 2, (TLy + TRy) / 2 - cU, TRx, TRy);
        }
        if (rightOut) {
            t.moveTo(TRx, TRy);
            t.quadraticCurveTo((TRx + BRx) / 2 + cR, (TRy + BRy) / 2, BRx, BRy);
        }
        if (downOut) {
            t.moveTo(BRx, BRy);
            t.quadraticCurveTo((BLx + BRx) / 2, (BLy + BRy) / 2 + cD, BLx, BLy);
        }
        if (leftOut) {
            t.moveTo(BLx, BLy);
            t.quadraticCurveTo((TLx + BLx) / 2 - cL, (TLy + BLy) / 2, TLx, TLy);
        }
    },

    /**
     * 一次扫格，同时产出本层需要的三条几何路径：
     *   path        —— 整体轮廓（clip + 投影用）
     *   expandPath  —— 向外扩一版（给底板模糊留余量，防止光晕溢出到透明区）
     *   outline     —— 只有朝外的边（外轮廓描边用）
     *
     * 【为什么内部格用 rect() 就够】
     * 内部豆四周都被邻居约束 → 四条边的外推量、控制点凸起量、顶点位移、圆角全为 0，
     * 于是四条二次曲线的控制点正好落在直线上 → 数学上严格等价于一个矩形。
     * 所以内部格直接 rect()，形状逐像素一致，却省掉每格 6~9 次路径 API 调用。
     *
     * 这不是可省的微优化：一张 200×200 的图纸有 2 万多颗豆，
     * 每格都铺一条曲线子路径要 2 秒；换成本做法实测 20 毫秒（×87 倍）。
     */
    /**
     * 路径数据累加器（鸭子类型，顶掉 Path2D）。
     *
     * 【为什么需要它 —— 这整个文件里最重要的一条性能结论】
     * `_buildIronGeometry` 要往 Path2D 里塞十几万条子路径（250×250 的稀疏图
     * 轻松到 20 万条）。实测表明，往 Path2D 逐条追加子路径的代价是**超线性**的：
     * Chrome 每次追加都要重分配/校验内部路径缓冲，条数越多涨得越凶。
     *
     *   250×250 稀疏图（20 万条子路径）：逐条追加 9033 ms
     *   同一张图，改成先攒 SVG path 字符串、最后 new Path2D(d) 一次：141 ms
     *
     * 而且越稀疏越糟 —— 稀疏图里几乎每颗豆都是"边缘豆"，全部要走 _cellPath
     * 的曲线分支，正好把这条最慢的路踩满：
     *
     *   图案形态          边缘豆占比    逐条追加    字符串
     *   solid（实心）      4%          251 ms     47 ms
     *   photo（照片）      8%          —          —
     *   sparse（稀疏）     92%         9033 ms    141 ms
     *   checker（棋盘）   100%         —          —
     *
     * 【关键：必须逐像素一致】
     * 只保留 3 位小数时会出现 1~3 像素的偏差（maxDelta 255，出现在曲线端点），
     * 因为 Path2D 内部按 float32 存坐标。保留 6 位小数后，
     * 4 种图案 × 3 种尺寸 = 12 组对照，path 与 expandPath 全部零差异。
     * 这个精度是刻意选的，不是随手写的 —— 别为了少几个字符降到 3 位。
     */
    _ironPathSink() {
        const parts = [];
        // 精度必须 6 位（见上方说明）：3 位会在曲线端点差出 1~3 像素
        const r6 = (v) => Math.round(v * 1000000) / 1000000;
        return {
            parts,
            moveTo(x, y) { parts.push('M', r6(x), r6(y)); },
            lineTo(x, y) { parts.push('L', r6(x), r6(y)); },
            quadraticCurveTo(cx, cy, x, y) {
                parts.push('Q', r6(cx), r6(cy), r6(x), r6(y));
            },
            closePath() { parts.push('Z'); },
            // SVG path 语法没有 rect 命令，用 M/H/V/Z 等价表达一个矩形
            rect(x, y, w, h) {
                parts.push('M', r6(x), r6(y),
                    'H', r6(x + w), 'V', r6(y + h), 'H', r6(x), 'Z');
            },
            toPath() { return new Path2D(parts.join(' ')); }
        };
    },

    _buildIronGeometry(perlerColors, pw, ph, s, bulge, expand) {
        // 先把两条路径攒成字符串，最后各建一次 Path2D
        const pathS = this._ironPathSink();
        const expandS = this._ironPathSink();
        const outline = new Path2D();

        const vis = (cx, cy) => {
            if (cx < 0 || cy < 0 || cx >= pw || cy >= ph) return false;
            return !perlerColors[cy][cx].isTransparent;
        };

        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                if (perlerColors[y][x].isTransparent) continue;

                const upOut = !vis(x, y - 1);
                const downOut = !vis(x, y + 1);
                const leftOut = !vis(x - 1, y);
                const rightOut = !vis(x + 1, y);

                if (!upOut && !downOut && !leftOut && !rightOut) {
                    pathS.rect(x * s, y * s, s, s);
                    expandS.rect(x * s, y * s, s, s);
                } else {
                    this._cellPath(pathS, perlerColors, x, y, pw, ph, s, bulge, 0);
                    this._cellPath(expandS, perlerColors, x, y, pw, ph, s, bulge, expand);
                    this._cellEdges(outline, x, y, s, bulge, upOut, downOut, leftOut, rightOut);
                }
            }
        }
        return { path: pathS.toPath(), expandPath: expandS.toPath(), outline };
    },

    /**
     * 画底板 —— 每格完全填满、无缝。
     *
     * 内部格按行合并同色长条一次 fillRect（内部格都是纯矩形），
     * 边缘豆再单独连"向外鼓出的弧面"一起画。
     * 比"每格一次 beginPath + fill"快一个数量级。
     */
    _drawBasePlate(ctx, perlerColors, pw, ph, s, bulge) {
        const vis = (cx, cy) => {
            if (cx < 0 || cy < 0 || cx >= pw || cy >= ph) return false;
            return !perlerColors[cy][cx].isTransparent;
        };
        const isInterior = (x, y) => vis(x, y - 1) && vis(x, y + 1) && vis(x - 1, y) && vis(x + 1, y);

        // ① 内部格：同色连续段合并成一条矩形
        for (let y = 0; y < ph; y++) {
            const row = perlerColors[y];
            let x = 0;
            while (x < pw) {
                const color = row[x];
                if (color.isTransparent || !isInterior(x, y)) { x++; continue; }

                const rgb = color.rgb;
                let x2 = x + 1;
                while (x2 < pw) {
                    const n = row[x2];
                    if (n.isTransparent || !isInterior(x2, y)) break;
                    if (n.rgb[0] !== rgb[0] || n.rgb[1] !== rgb[1] || n.rgb[2] !== rgb[2]) break;
                    x2++;
                }
                ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                ctx.fillRect(x * s, y * s, (x2 - x) * s, s);
                x = x2;
            }
        }

        // ② 边缘豆：带外凸弧面，只能逐颗画
        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                const color = perlerColors[y][x];
                if (color.isTransparent || isInterior(x, y)) continue;

                ctx.beginPath();
                this._cellPath(ctx, perlerColors, x, y, pw, ph, s, bulge, 0);
                ctx.fillStyle = `rgb(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]})`;
                ctx.fill();
            }
        }
    },

    // ============================================================
    //  五、豆子格线（烫后仍隐约可见，带轻微扭曲）
    // ============================================================

    /**
     * 画豆子之间的格线——真实成品上烫后仍能隐约看到方格轮廓
     * 每条格线画两道：暗线（凹槽阴影）+ 亮线（凹槽高光）→ 立体凹痕感
     * 线本身用二次曲线微微弯曲 → 对应"内部豆可能有些许扭曲"
     *
     * 【性能】所有暗线合并进一条路径、所有亮线合并进另一条，
     * 整层只要 2 次 stroke（原先是每条线一次 stroke：2 万颗豆 ≈ 4 万次）。
     * 单次 stroke 的固定开销在小尺寸下极其可观，这里是最贵的一层。
     */
    _drawBeadGridLines(ctx, perlerColors, pw, ph, s, strength) {
        if (strength <= 0.001) return;

        const vis = (cx, cy) => {
            if (cx < 0 || cy < 0 || cx >= pw || cy >= ph) return false;
            return !perlerColors[cy][cx].isTransparent;
        };

        const lw = Math.max(0.8, s * 0.045);
        const inset = s * 0.14;
        const off = Math.max(0.8, s * 0.035);

        const dark = new Path2D();
        const light = new Path2D();

        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                if (perlerColors[y][x].isTransparent) continue;

                const px = x * s;
                const py = y * s;
                const bendA = this._hash(x, y, 31) * s * 0.035;
                const bendB = this._hash(x, y, 32) * s * 0.035;

                // 上方水平格线（仅当上邻可见 → 避免重复绘制）
                if (vis(x, y - 1)) {
                    // 凹槽阴影
                    dark.moveTo(px + inset, py);
                    dark.quadraticCurveTo(px + s / 2, py + bendA, px + s - inset, py);
                    // 凹槽高光
                    light.moveTo(px + inset, py + off);
                    light.quadraticCurveTo(px + s / 2, py + off + bendA, px + s - inset, py + off);
                }

                // 左侧垂直格线
                if (vis(x - 1, y)) {
                    dark.moveTo(px, py + inset);
                    dark.quadraticCurveTo(px + bendB, py + s / 2, px, py + s - inset);
                    light.moveTo(px + off, py + inset);
                    light.quadraticCurveTo(px + off + bendB, py + s / 2, px + off, py + s - inset);
                }
            }
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(0,0,0,${strength * 0.55})`;
        ctx.stroke(dark);
        ctx.strokeStyle = `rgba(255,255,255,${strength * 0.40})`;
        ctx.stroke(light);
        ctx.restore();
    },

    /**
     * 【重大改动 2026-10-15】浮雕不再走混合模式，改成像素级绝对光影合成。
     *
     * ============================================================
     *  为什么必须改 —— overlay 是数学上不可能做对的
     * ============================================================
     *  原来的做法是把一张"以灰 128 为中性基准"的纹理 tile 用
     *  globalCompositeOperation='overlay' 叠上去。这在黑白两端完全失效：
     *
     *      overlay: base<0.5 → 2·base·blend ；base≥0.5 → 1-2(1-base)(1-blend)
     *      blend=0.5（灰128）时：
     *        base=0.00 → 0.0000   ← 原样不变
     *        base=1.00 → 1.0000   ← 原样不变
     *
     *  换成 soft-light 也一样（实测纯白上只有 3.2% 可见度）。
     *  **任何"以中性灰为基准"的混合模式，在纯黑和纯白豆子上都是恒等变换。**
     *  这就是用户说的"黑色和白色上面都没有纹路"。
     *
     *  同时它在中间调炸掉：overlay 在 base≈0.5 处斜率最大，
     *  实测中调归一化对比冲到 340%（参考图只有 18.5%）→ 这就是"烟熏感"。
     *
     * ============================================================
     *  参考图的物理事实（实测，不是猜的）
     * ============================================================
     *  把参考图七个色块的**梯度 RMS** 量出来：
     *
     *      区域      亮度    梯度RMS    绝对摆幅
     *      白云      220      19.68      106
     *      中蓝      196      18.84      129
     *      深蓝海    100      10.42      159
     *      白珠边    115      18.44      252
     *      深紫      181      18.69      207
     *      右下深蓝   70       7.04       53
     *      左上浅蓝  173      18.58      132
     *
     *  → 梯度 RMS 在 7~19.7 之间，**与底色亮度完全无关**。
     *  → 绝对摆幅 53~252 灰阶，也不随底色缩放。
     *
     *  也就是说：**真实浮雕的明暗是绝对量。**
     *  深色豆的纹路不是"更深"，而是同样幅度地在深色区间里起伏。
     *  混合模式做不到这件事（两端趋近恒等），只有像素级加减可以。
     *
     * ============================================================
     *  新做法
     * ============================================================
     *      out = base + L × SWING        （L ∈ [-1,1] 是光影场）
     *
     *  摆幅恒定 = SWING×2，与 base 无关 —— 天然满足参考图的物理事实。
     *
     *  【软压缩 knee】超出 0..255 时不能硬 clamp：
     *  纯白豆加正偏移会溢出、纯黑豆加负偏移会溢出，硬切会让两端的纹理变平
     *  （正好是要修的问题）。按比例压缩溢出部分，保住纹理的相对起伏。
     *
     *  【性能】这是唯一新增的像素级开销（getImageData + 一次遍历）。
     *  但省掉了两次 clip 的同步光栅化，净开销可接受 —— 实测见记忆文件。
     *
     *  @param {number} swing - 光影摆幅（灰阶）。实测参考图 53~252，取 145。
     *  @param {number} knee  - 溢出压缩系数（0=硬切，1=不压缩）。实测 0.35~0.6 都行。
     */
    _applyPixelRelief(ctx, width, height, cfg, swing, knee, tileId, geom, cellSize) {
        if (swing <= 0.5) return;

        // 1. 光影场：真实素材 tile 优先，取不到时回退到程序生成
        const lightTile = this._ironLightTile(cfg, tileId);
        if (!lightTile) return;   // 素材还在加载中，这一帧跳过

        // 2. 采样到目标尺寸。★ 采样倍率 = 用户滑杆 × 锚点系数（见 _ironTexAnchoredGeom）
        const eff = this._ironTexAnchoredGeom(tileId, lightTile, width, height, cellSize, geom);
        const field = this._ironSampleLightField(lightTile, width, height, eff);
        if (!field) return;

        // 3. 像素级合成
        //
        // 【坑：getImageData 认的是设备坐标，不是当前 CTM】
        // 调用点已经 ctx.translate(padding, padding) 过，
        // 直接 getImageData(0,0,width,height) 会读到画布左上角（透明区），
        // 结果整块浮雕错位。这里从 CTM 反解出设备原点。
        const m = ctx.getTransform();
        const ox = Math.round(m.e);
        const oy = Math.round(m.f);
        const canvas = ctx.canvas;
        // 越界裁剪（CTM 可能带缩放）
        const cw = Math.min(width, canvas.width - ox);
        const ch = Math.min(height, canvas.height - oy);
        if (cw <= 0 || ch <= 0) return;

        const img = ctx.getImageData(ox, oy, cw, ch);
        const d = img.data;
        const n = cw * ch;
        for (let i = 0; i < n; i++) {
            const p = i * 4;
            if (d[p + 3] === 0) continue;          // 透明像素不动
            const off = field[i] * swing;
            if (off === 0) continue;
            for (let c = 0; c < 3; c++) {
                const v = d[p + c] + off;
                if (v > 255) d[p + c] = 255 + (v - 255) * knee;
                else if (v < 0) d[p + c] = v * knee;
                else d[p + c] = v;
            }
        }
        ctx.putImageData(img, ox, oy);
    },

    /** 当前选中的澡巾变体（state.zaoJin 存 id，默认第一个） */
    _ironCurrentZaoJin() {
        const list = this._ironZaoJinList();
        const id = (this._ironPreviewState && this._ironPreviewState.zaoJin) || list[0].id;
        return list.find(z => z.id === id) || list[0];
    },

    /**
     * 澡巾织纹清单（2026-10-15）
     *
     * tile 来自真实澡巾照片提取（离线 Python：高通 + 环形对齐，无缝）。
     * `swing` 是浮雕摆幅 —— 粗圈绒面起伏大，细密短绒起伏小，各自标定过。
     *
     * 【tile 为什么不引外部 PNG，而要内联成 dataURL】
     * 浮雕合成必须 getImageData 读像素。而 file:// 协议下，
     * 页面加载任何外部图片都会把画布标记为 tainted → SecurityError。
     * （这不是 blob: URL 特有的问题，是 file:// 页面的通病 ——
     *   我一开始只改了上传链路，漏了自己新加的 tile 加载，
     *   hh 真机一按熨烫预览就炸。）
     *
     * 内联 dataURL 是纯字符串、不带来源信息，任何协议下都同源。
     * 体积靠「16 级灰度 + Floyd-Steinberg 误差扩散 + PNG」压到 34~41KB/张，
     * 量化噪声 std≈3 灰阶（摆幅 145 的 2%），肉眼看不出来。
     */
    _ironZaoJinList() {
        const TILES = (typeof window !== 'undefined' && window.IRON_ZAOJIN_TILES) || {};
        const META = (typeof window !== 'undefined' && window.IRON_ZAOJIN_META) || {};
        const ids = Object.keys(TILES);
        if (!ids.length) {
            // tiles.js 没加载（理论上不会，它被 build.js 排在第一位）→ 兜底
            return [{ id: 'zaoJin1', label: '澡巾1 · 细密短绒', swing: 0.82, scale: 1, rot: 0, kind: 'photo' }];
        }
        // 元数据由 tools/gen-iron-textures.py 生成，跟 tile 同源，不会两处漂移
        return ids.map(id => {
            const m = META[id] || {};
            return {
                id: id,
                label: m.label || id,
                swing: m.swing !== undefined ? m.swing : 1.0,
                scale: m.scale !== undefined ? m.scale : 1.0,   // 花纹大小默认值
                rot: m.rot !== undefined ? m.rot : 0,           // 花纹旋转默认角（度）
                kind: m.kind || 'photo',
                anchor: m.anchor || null,                       // 'art' | 'bead'（尺度锚点）
                baseTiles: m.baseTiles || 0                     // art 锚点下：整幅长边跨几个 tile
            };
        });
    },

    /**
     * 花纹的几何参数（大小 / 旋转）—— 由预览面板的滑杆控制。
     *
     * scale = 花纹大小倍率（相对**锚点基准**，见 _ironTexAnchoredGeom）。
     *         1.0 = 锚点基准；>1 花纹变大、整幅上的重复次数变少。
     * rot   = 花纹旋转角（度）。用于把矢量花纹的方向调成跟图案走势一致。
     *
     * ★ 这两个参数不烘焙进 tile，而是**在采样时用 canvas pattern 变换**实现，
     *   所以改它们只要重跑一次采样，不需要重新生成 tile（离线脚本跑一次要十几秒）。
     */
    _ironTexGeom(state) {
        const g = (state && state.texGeom) || null;
        return {
            scale: g && g.scale !== undefined ? g.scale : 1.0,
            rot: g && g.rot !== undefined ? g.rot : 0
        };
    },

    /**
     * ★★★ 尺度锚点（2026-10-16）—— 决定"1.0× 到底多大"
     *
     * 原来直接把用户倍率当采样倍率用，于是 tile 是**按渲染像素 1:1** 铺的：
     * 预览倍率 1×~4× 对应豆径 20~80px，同一个"大小 1.0×"覆盖的豆子从 12.8 颗
     * 变到 3.2 颗；导出又换一套分辨率预算（预览 2800 / 导出 4800），
     * 于是"预览里调好的样子，导出后不是那样"。用户要的是**以整幅为单位**。
     *
     * 现在按素材类别分两种锚点（写在 tiles.js 的 IRON_ZAOJIN_META 里）：
     *   art  ─ 矢量花纹（图案本身没有物理尺寸，是设计选择）
     *          1.0× ⇒ 作品长边跨过 baseTiles 个 tile，与素材截图同密度。
     *          任何倍率、任何导出尺寸下，图案与作品的比例恒定 → 滑杆调好的值有意义。
     *   bead ─ 实物肌理（澡巾/毛巾：一颗豆 5mm 是物理尺度）
     *          按豆径缩放，一颗豆上的颗粒数不随倍率变（与程序生成的那几层一致）。
     *
     * @returns {{scale:number, rot:number, anchor:string, anchorScale:number}}
     */
    _ironTexAnchoredGeom(tileId, tile, width, height, cellSize, geom) {
        const META = (typeof window !== 'undefined' && window.IRON_ZAOJIN_META) || {};
        const m = META[tileId] || {};
        const anchor = m.anchor || (m.kind === 'vector' ? 'art' : 'bead');
        let a = 1;
        if (anchor === 'art') {
            const tileLong = tile ? Math.max(tile.width, tile.height) : 256;
            const base = m.baseTiles || 3;
            a = Math.max(width, height) / (base * tileLong);
        } else if (cellSize) {
            a = cellSize / this._IRON_TILE_BASE_CELL;
        }
        const userScale = (geom && geom.scale !== undefined) ? geom.scale : 1.0;
        return {
            scale: userScale * a,
            rot: (geom && geom.rot) || 0,
            anchor, anchorScale: a
        };
    },

    /** 面板滑杆定义（UI 与默认值共用一份） */
    _ironTexGeomSpec() {
        return [
            {
                id: 'scale', label: '大小', min: 0.4, max: 3.0, step: 0.05, def: 1.0,
                title: '相对该素材的默认尺度。1.0× = 与素材原图同密度（整幅长边跨过固定的图案数，' +
                    '与预览倍率、导出尺寸无关）。调大 → 图案更大、整幅上的重复更少'
            },
            {
                id: 'rot', label: '旋转', min: 0, max: 180, step: 5, def: 0,
                title: '花纹旋转角（度）。用于把花纹方向调成跟图案走势一致'
            }
        ];
    },

    /**
     * 取光影 tile（canvas）。
     *
     * 优先用 `tileUrl` 指向的真实素材 PNG；
     * 加载失败（离线 / 404）时回退到程序生成的 ridged 噪声，
     * 保证功能不挂 —— 只是形态会退回旧版那样。
     */
    _ironLightTile(cfg, tileId) {
        const TILES = (typeof window !== 'undefined' && window.IRON_ZAOJIN_TILES) || null;
        const dataURL = (TILES && tileId) ? TILES[tileId] : null;
        const key = dataURL ? ('zj:' + tileId)
            : ('gen:' + cfg.warp + '_' + cfg.mask + '_' +
               (cfg.layers || []).map(l => l.a + ':' + l.s + ':' + l.fx + ':' + l.fy + ':' + l.oct).join(','));

        if (!this._ironLightCache) this._ironLightCache = {};

        if (dataURL) {
            const hit = this._ironLightCache[key];
            if (hit) return hit instanceof HTMLCanvasElement ? hit : null;
            if (key in this._ironLightCache) return null;   // 正在加载中

            // 首次：发起加载，先占位（同步渲染这一帧没有纹理，等下一帧）
            this._ironLightCache[key] = null;
            const self = this;
            const img = new Image();
            img.onload = function () {
                const cv = document.createElement('canvas');
                // ★ 不再强制 256×256：花纹 tile 是按素材原始周期生成的，
                //   可能非正方（例：斜纹 300×300、波浪 264×264、青海波 310×320），
                //   强行拉伸会同时改变图案比例和平铺周期。
                cv.width = img.naturalWidth || 256;
                cv.height = img.naturalHeight || 256;
                const cx = cv.getContext('2d');
                cx.imageSmoothingEnabled = true;
                cx.drawImage(img, 0, 0);
                self._ironLightCache[key] = cv;
                // ★ 关键：成品层是按 (几何|烫法|强度|尺寸) 缓存的，不含纹理状态。
                //   纹理是异步到位的，不清这个 key 的话重画会直接命中"还没纹理"那张，
                //   于是一整场预览都看不到织纹（v1 也有这个坑）。
                self._ironPieceKey = null;
                self._ironGeo = null;
                if (self._ironPreviewCanvas) self._refreshIronPreview(true);   // 重画一次
            };
            img.onerror = function () {
                // 素材缺失 → 回退到程序生成
                console.warn('[豆师傅] 澡巾织纹加载失败，回退到程序生成：', tileId);
                self._ironLightCache[key] = self._ironLightTile(null, null);
                self._ironPieceKey = null;
                self._ironGeo = null;
                if (self._ironPreviewCanvas) self._refreshIronPreview(true);
            };
            img.src = dataURL;
            return null;   // 这一帧先不画纹理
        }

        // 程序生成（回退路径）
        if (this._ironLightCache[key]) return this._ironLightCache[key];

        const size = 256;
        const F = this._ridgeFields(size, cfg, 'ironLight');
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < F.ao.length; i++) {
            const v = F.ao[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        const rng = (mx - mn) || 1;

        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const id = ctx.createImageData(size, size);
        for (let i = 0; i < size * size; i++) {
            const L = ((F.ao[i] - mn) / rng) * 2 - 1;      // -1..1
            const g = Math.round((L * 0.5 + 0.5) * 255);   // 128 = 中性
            id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g;
            id.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(id, 0, 0);
        this._ironLightCache[key] = canvas;
        return canvas;
    },

    /** 把光影 tile 平铺采样成 Float32Array（-1..1），尺寸 = 目标区域 */
    _ironSampleLightField(tile, w, h, geom) {
        const scratch = this._ironFieldScratch || (this._ironFieldScratch = document.createElement('canvas'));
        if (scratch.width !== w || scratch.height !== h) {
            scratch.width = w;
            scratch.height = h;
        }
        const sctx = scratch.getContext('2d', { willReadFrequently: true });
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, w, h);
        const pat = sctx.createPattern(tile, 'repeat');
        // ★ 花纹大小 / 旋转：在 pattern 变换层做，改参数不用重新生成 tile
        //   scale>1 → 图案被放大（每颗豆上的条数变少）
        //   旋转绕整幅中心，再补一次平移保证覆盖不留空角
        if (geom && (Math.abs(geom.scale - 1) > 1e-3 || Math.abs(geom.rot) > 1e-3)) {
            const sc = geom.scale;
            const rad = geom.rot * Math.PI / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            const m = new DOMMatrix();
            // 先把旋转+缩放作用在 pattern 上（矩阵里 a,b,c,d 是图案坐标系）
            m.a = cos * sc;  m.b = sin * sc;
            m.c = -sin * sc; m.d = cos * sc;
            // e,f 是平移：让图案覆盖整个采样区（取两个方向的整数倍）
            const ext = Math.ceil(Math.hypot(w, h) * sc);
            m.e = (ext - w * cos) / 2 + (h * sin) / 2;
            m.f = (ext - h * cos) / 2 - (w * sin) / 2;
            if (pat.setTransform) { try { pat.setTransform(m); } catch (e) { /* 老浏览器降级 */ } }
        }
        sctx.fillStyle = pat;
        sctx.fillRect(0, 0, w, h);

        const d = sctx.getImageData(0, 0, w, h).data;
        const out = this._ironFieldBuf && this._ironFieldBuf.length === w * h
            ? this._ironFieldBuf : (this._ironFieldBuf = new Float32Array(w * h));
        for (let i = 0; i < w * h; i++) out[i] = (d[i * 4] / 255) * 2 - 1;
        return out;
    },

    // ============================================================
    //  七、纹理层（连续形变 + 特征纹理，多层面叠加）
    // ============================================================

    _applyTextureLayer(ctx, width, height, cellSize, state, profile) {
        const amp = state.intensity;
        const mode = state.mode;

        // 纹理随豆径等比缩放：1× 和 4× 看到的"质感"是同一套东西（见 _IRON_TILE_BASE_CELL）
        const k = cellSize / this._IRON_TILE_BASE_CELL;
        // 强度量化进缓存 key —— 原来 key 里没有强度，
        // 拖滑杆时 tile 不会重建，质感会卡在第一次的强度上（旧 bug）
        const tag = `${mode}_${Math.round(amp * 10)}`;

        // --- 层 1：表面细颗粒（所有模式共用的"塑料基底"颗粒感） ---
        if (profile.grain > 0.005) {
            this._fillWithTilePattern(ctx, width, height, `grain_${tag}`,
                () => this._tile_grain(profile.grain), 'overlay', 0.9, k);
        }

        // --- 层 2：低频/中频连续起伏（整板形变，不是贴图） ---
        // 每种烫法的起伏尺度不同：澡巾烫细密、烘焙纸烫大尺度
        const noiseCfgs = {
            normal:     [{ freq: 4, oct: 2, amp: 0.05 }],
            zaoJin:     [{ freq: 3, oct: 2, amp: 0.07 }],
            maoJin:     [{ freq: 10, oct: 3, amp: 0.14 }],
            huaFuGe:    [{ freq: 4, oct: 2, amp: 0.08 }],
            lingGe:     [{ freq: 4, oct: 2, amp: 0.07 }],
            hongBeiZhi: [{ freq: 3, oct: 3, amp: 0.26 }],
            xiShan:     [{ freq: 4, oct: 1, amp: 0.035 }],
            geLiTe:     [{ freq: 4, oct: 1, amp: 0.035 }],
            xianDuRiLa: [{ freq: 4, oct: 1, amp: 0.035 }]
        };

        (noiseCfgs[mode] || []).forEach((cfg, i) => {
            // tile 从 128 提到 320：噪声是平滑的，平铺重复在小 tile 上肉眼可见
            // 频率同步放大 320/128 = 2.5 倍 → 颗粒尺度保持不变，只是不再是同一个小块循环
            this._fillWithTilePattern(ctx, width, height, `fbm_${tag}_${i}_${cfg.freq}_${cfg.oct}`,
                () => this._tile_fbm(320, Math.max(1, Math.round(cfg.freq * 2.5)), cfg.oct, `fbm_${mode}_${i}`, cfg.amp * amp),
                'overlay', 0.92, k);
        });

        // --- 层 3：特征纹理（每种烫法的辨识特征） ---
        switch (mode) {
            case 'zaoJin':
                // 澡巾烫：澡巾织纹压进半融的塑料里
                //
                // 【形态的关键修正 2026-10-15 —— 用真实素材 tile】
                // 之前用程序生成的 ridged 噪声，形态怎么调都像"大理石/水波纹"。
                //
                // 量化对照才看清问题所在 —— 我一直把各向异性往参考图成品的
                // 4.94 调，但**素材本身的方向集中度只有 0.10~0.15**
                // （0.083 = 完全随机），高频能量占 68~86%：
                //
                //   澡巾织纹 = 高频 + 各向同性 + 无固定方向的短绒圈
                //   我之前的  = 低频 ridged + 各向异性 22  → 涡卷大理石纹
                //
                // 参考图成品各向异性低，是因为烫化融化了、方向被抹平，
                // 那是**结果**不是**原因**。素材才是原因。
                //
                // 所以现在直接用真实澡巾照片提取的 tile（data/iron-textures/*.png），
                // 4 种织纹各有各的样子。
                const zj = this._ironCurrentZaoJin();
                this._applyPixelRelief(
                    ctx, width, height, this._zaoJinRidgeCfg(),
                    this._IRON_RELIEF_SWING * (zj.swing || 1) * amp,
                    this._IRON_RELIEF_KNEE,
                    zj.id,
                    this._ironTexGeom(state),
                    cellSize
                );
                break;

            case 'maoJin':
                // 毛巾烫：绒面纤维 + 整体哑光降亮
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = `rgba(152,150,147,${0.08 + 0.16 * amp})`;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
                this._fillWithTilePattern(ctx, width, height, `maoFiber_${tag}`,
                    () => this._tile_maoFiber(amp), 'overlay', 0.95, k);
                break;

            case 'huaFuGe':
                // 华夫格烫：大面积方格凹凸（格尺寸 ≈ 2.5 个豆子）
                this._fillWithTilePattern(ctx, width, height, 'waffle',
                    () => this._tile_waffle(Math.round(this._IRON_TILE_BASE_CELL * 2.5), amp), 'overlay', 0.95, k);
                break;

            case 'lingGe':
                // 菱格烫：45° 斜格压花（格尺寸 ≈ 2 个豆子）
                this._fillWithTilePattern(ctx, width, height, 'diamond',
                    () => this._tile_diamond(Math.round(this._IRON_TILE_BASE_CELL * 2), amp), 'overlay', 0.9, k);
                break;

            case 'hongBeiZhi':
                // 烘焙纸烫：揉皱褶皱（弯曲裂纹 + 局部高光斑）
                this._fillWithTilePattern(ctx, width, height, `crease_${tag}`,
                    () => this._tile_crease(amp), 'overlay', 0.95, k);
                break;

            case 'xiShan':
                // 细闪烫：极细密的闪粉颗粒
                this._fillWithTilePattern(ctx, width, height, `fineSpark_${tag}`,
                    () => this._tile_fineSpark(amp), 'source-over', 1.0, k);
                break;

            case 'geLiTe':
                // 格利特烫：粗颗粒闪片
                this._fillWithTilePattern(ctx, width, height, `glitter_${tag}`,
                    () => this._tile_glitter(amp), 'source-over', 1.0, k);
                break;

            case 'xianDuRiLa':
                // 仙度瑞拉烫：深色镜面 + 蓝紫光泽 + 星点
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = `rgba(120,115,150,${0.10 * amp})`;
                ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = 'screen';
                const g = ctx.createLinearGradient(0, 0, width, height);
                g.addColorStop(0, `rgba(120,105,255,${0.16 * amp})`);
                g.addColorStop(0.5, `rgba(190,120,255,${0.11 * amp})`);
                g.addColorStop(1, `rgba(100,150,255,${0.16 * amp})`);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
                this._fillWithTilePattern(ctx, width, height, `starSpark_${tag}`,
                    () => this._tile_starSpark(amp), 'source-over', 1.0, k);
                break;
        }
    },

    /**
     * 用缓存的 tile pattern 填充指定区域
     *
     * @param {number} [scale] tile 的缩放倍数（= 实际豆径 / 标准豆径）。
     *        花纹本身按标准豆径设计，缩放交给 CTM —— 这样 tile 与倍率无关，
     *        缓存能一直复用，而且"一颗豆上有多少颗粒"在任何倍率下都一致。
     */
    _fillWithTilePattern(ctx, width, height, key, tileFactory, blendMode, alpha, scale) {
        const tile = this._getTile(key, tileFactory);
        if (!tile) return;

        const sc = (scale && scale > 0) ? scale : 1;

        ctx.save();
        ctx.globalCompositeOperation = blendMode;
        ctx.globalAlpha = alpha;
        if (sc !== 1) ctx.scale(sc, sc);

        const pattern = ctx.createPattern(tile, 'repeat');
        if (!pattern) { ctx.restore(); return; }

        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width / sc, height / sc);
        ctx.restore();
    },

    /** tile 缓存（key 由调用方给出，已包含尺寸/强度等变化因素） */
    _getTile(key, factory) {
        if (!this._ironTextureCache) this._ironTextureCache = {};
        if (this._ironTextureCache[key]) return this._ironTextureCache[key];

        if (Object.keys(this._ironTextureCache).length > 80) {
            this._ironTextureCache = {};
        }

        const tile = factory();
        if (tile) this._ironTextureCache[key] = tile;
        return tile;
    },

    // ---------------- tile 生成工具 ----------------

    /**
     * 铺满中灰(128)的 tile
     * 【关键】overlay/multiply 混合的中性值是 128（不是 0）。
     * 所有灰度纹理必须以 128 为基准，否则整体会压暗发脏。
     */
    _newGrayTile(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgb(128,128,128)';
        ctx.fillRect(0, 0, size, size);
        return { canvas, ctx };
    },

    /** 确定性随机数生成器 */
    _seededRng(seedStr) {
        let h = 2166136261;
        for (let i = 0; i < seedStr.length; i++) {
            h ^= seedStr.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        let s = h >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    },

    /**
     * 可无缝平铺的 fbm 噪声场（多倍频 value noise，返回原始值数组）
     *
     * 这是"整板连续形变"的核心：纹理看起来是被压出来的连续表面，
     * 而不是一格一格拼贴的贴图。
     *
     * @param {number} size - tile 边长（建议 64/128）
     * @param {number} freq - 基础频率（建议 2 的幂；各倍频各自 wrap，无需整除）
     * @param {number} oct  - 倍频层数（越多越细碎）
     * @param {string} seed - 随机种子
     * @returns {Float32Array} 长度 size*size 的噪声值（约 -1..1）
     */
    _fbmValues(size, freq, oct, seed) {
        const rng = this._seededRng(seed);
        const smooth = (t) => t * t * (3 - 2 * t);

        // 每一个倍频单独建一张随机格点网格（各含 wrap 补边）
        // 【修正】旧实现所有倍频共用一张 freq 格点的网格 → 倍频升高后
        // 索引越界、且无法正确 wrap。这里按倍频各建一张即为正确做法。
        const grids = [];
        let f = freq;
        for (let o = 0; o < oct; o++) {
            const g = [];
            for (let gy = 0; gy < f; gy++) {
                g[gy] = [];
                for (let gx = 0; gx < f; gx++) g[gy][gx] = rng() * 2 - 1;
                g[gy][f] = g[gy][0];   // 水平 wrap
            }
            g[f] = g[0].slice();       // 垂直 wrap
            grids.push(g);
            f *= 2;
        }

        const out = new Float32Array(size * size);
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                let value = 0;
                let amplitude = 1;
                let total = 0;
                let ff = freq;

                for (let o = 0; o < oct; o++) {
                    const grid = grids[o];
                    const fx = (px / size) * ff;
                    const fy = (py / size) * ff;
                    const gx0 = Math.floor(fx);
                    const gy0 = Math.floor(fy);
                    const tx = smooth(fx - gx0);
                    const ty = smooth(fy - gy0);

                    const v00 = grid[gy0][gx0];
                    const v10 = grid[gy0][gx0 + 1];
                    const v01 = grid[gy0 + 1][gx0];
                    const v11 = grid[gy0 + 1][gx0 + 1];

                    const v = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;

                    value += v * amplitude;
                    total += amplitude;
                    amplitude *= 0.5;   // 每个倍频幅度减半
                    ff *= 2;            // 频率翻倍
                }

                out[py * size + px] = value / total;
            }
        }
        return out;
    },

    /**
     * 灰度 fbm tile（以 128 为中性基准，可直接用于 overlay 混合）
     *
     * @param {number} size - tile 边长（建议 64/128）
     * @param {number} freq - 基础频率
     * @param {number} oct  - 倍频层数
     * @param {string} seed - 随机种子
     * @param {number} amp  - 起伏幅度（0~1）
     */
    _tile_fbm(size, freq, oct, seed, amp) {
        const { canvas, ctx } = this._newGrayTile(size);
        const img = ctx.getImageData(0, 0, size, size);
        const vals = this._fbmValues(size, freq, oct, seed);

        for (let i = 0; i < vals.length; i++) {
            const gray = Math.max(0, Math.min(255, Math.round(128 + vals[i] * amp * 127)));
            const idx = i * 4;
            img.data[idx] = gray;
            img.data[idx + 1] = gray;
            img.data[idx + 2] = gray;
            img.data[idx + 3] = 255;
        }

        ctx.putImageData(img, 0, 0);
        return canvas;
    },

    /**
     * 噪声蒙版 tile —— 【"蒙版叠层"的关键工具】
     *
     * 生成一张"RGB 全白、alpha 随 fbm 噪声变化"的蒙版。
     * 把它以 destination-in 叠到颗粒层上，就能按噪声浓淡决定哪些区域
     * 保留颗粒、哪些区域被抹掉 → 得到"成簇、浓淡不均"的不规则质感，
     * 而不是整片均匀噪点（后者看起来像电视雪花，很假）。
     *
     * @param {number} size - tile 边长
     * @param {number} freq - 蒙版噪声基础频率（越小 → 聚簇越大块）
     * @param {number} oct  - 倍频层数
     * @param {string} seed - 随机种子
     * @param {number} lo   - 蒙版最薄弱处的 alpha（0=完全抹掉）
     * @param {number} hi   - 蒙版最浓处的 alpha（1=完全保留）
     */
    _tile_noiseMask(size, freq, oct, seed, lo, hi) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        const vals = this._fbmValues(size, freq, oct, seed);

        const loA = (lo === undefined) ? 0 : lo;
        const hiA = (hi === undefined) ? 1 : hi;

        for (let i = 0; i < vals.length; i++) {
            // fbm(-1..1) → 0..1，再 smoothstep 让聚簇边界更自然
            let n = (vals[i] + 1) / 2;
            n = n * n * (3 - 2 * n);
            const a = Math.max(0, Math.min(1, loA + (hiA - loA) * n));
            const idx = i * 4;
            img.data[idx] = 255;
            img.data[idx + 1] = 255;
            img.data[idx + 2] = 255;
            img.data[idx + 3] = Math.round(a * 255);
        }

        ctx.putImageData(img, 0, 0);
        return canvas;
    },

    // ---------------- 脊线浮雕（澡巾烫的织纹） ----------------

    /**
     * 澡巾烫织纹参数 —— 手感要调就调这里。
     *
     * 对着参考实拍定的：密集、成网、略有方向的脊线，受光侧亮、背光侧暗，
     * 整体像"压得更紧密的老虎皮毛"。
     *
     * ============================================================
     *  【实测标定 · 2026-10-15】所有数字都来自参考图实测量化，不是目测调的
     * ============================================================
     *  取参考图「澡巾烫」那块浅蓝面板做 FFT / PCA / 自相关，量到：
     *
     *      各向异性 (梯度水平能量 : 垂直能量)   4.8 ~ 7.4
     *      亮脊 PCA 长宽比                        4.4 ~ 5.3
     *      亮脊尺寸                                长 28px / 宽 5~6px
     *      分布偏度                                +0.17 ~ +1.7（尖脊突出）
     *      明暗摆幅                                33~36 灰阶（不是 84）
     *
     *  【上一版差在哪 —— 为什么"看起来不像毛"】
     *  各向异性只有 1.9（接近 1 = 各向同性）→ 视觉上就是一片磨砂噪点，
     *  根本不是"一根根毛"。根因不是参数，是算法：
     *
     *  上一版靠 `fx:5, fy:20` 的格点密度比（4:1）来造方向性，
     *  但这个比值被 `oct:3` 的三重倍频各自复现、三层再叠加，
     *  高倍频层的方向互相打架 → 总方向性被平均掉。
     *
     *  现在改成 `squash`：在**采样层**直接把垂直于脊走向的坐标压缩 squash 倍。
     *  单次线性变换、不随倍频分裂，所以方向性不会被抵消。
     *  各向异性 ≈ squash × fx/fy 的几何均值，实测调到 ~5 跟参考图对齐。
     */
    _zaoJinRidgeCfg() {
        return {
            // ============================================================
            //  【各向异性怎么调 —— 2026-10-15 实测扫描出来的，别凭感觉改】
            // ============================================================
            //  参考图实测各向异性 4.8~7.4（浅蓝面板），这是"像毛"与"像磨砂噪点"
            //  的分水岭：1.0 = 各向同性 = 一片沙点；5+ = 明显的毛流方向。
            //
            //  【踩过的两个弯路，别再走】
            //
            //  ① 靠 fx:fy 的格点密度比来造方向性 —— 无效，甚至反效果。
            //     实测（单层 oct=1）：
            //        fx:fy = 1:1  → 各向异性 3.06
            //        fx:fy = 4:22 → 各向异性 1.01   ← 比值越大越差
            //     原因：sample() 沿 y 方向密采样，只会让两个轴的梯度更平均，
            //     而不是更 anisotropy。密度比根本不是方向性的旋钮。
            //
            //  ② 把 warp 压到极小来"保方向" —— 也无效。
            //     实测（a=2,s=1,fx4:fy8）：
            //        warp 0.010 → 6.90    warp 0.045 → 5.77
            //     warp 不是破坏者，它是**微调旋钮**：它把方向性从 7.45 往下拉，
            //     正好落在参考图区间内，同时消掉过于规整的条纹感。
            //
            //  【真正控制方向性的是整数剪切 (a,s)】
            //  采样坐标 a*u + s*v，脊线垂直于 (a,s)。
            //  实测各向异性（fx:fy=4:8）：
            //     (1,0)  0.0° → 1.25      (1,1) 45.0° → 1.19
            //     (2,1) 26.6° → 6.90  ★   (3,1) 18.4° → 2.27
            //     (4,1) 14.0° → 1.40      (1,2) 63.4° → 1.10
            //  → (2,1) 是这片参数空间里的甜点。
            layers: [
                // 主毛流：26.6°，各向异性的主要来源
                { a: 2, s: 1, fx: 4, fy: 8, oct: 2, w: 1.0 },
                // 镜像毛流：-26.6°，权重压低。两族交叉成网 → "一根根短毛"的断续感；
                // 权重给太高会把主方向抹平（实测强镜像会飙到 29，太假像木纹）
                { a: 2, s: -1, fx: 4, fy: 8, oct: 2, w: 0.35 },
                // 细缩绒：极细颗粒，把主沟沿磨毛
                { a: 2, s: 1, fx: 6, fy: 14, oct: 1, w: 0.30 }
            ],
            // warp = 方向性微调旋钮，不是"越少越好"。
            // 实测（同一配置扫 warp）：0.045 → 9.81   0.16 → 8.71   0.22 → 7.43
            // 参考图平坦区实测 4.9（各样本区间 3.7~7.4）。
            // 取 0.22 —— 落在参考图区间内，同时消掉过于规整的条纹感。
            warp: 0.22,
            warpFreq: 5,
            mask: 11,         // 沟流断续场 → 一条沟时隐时现，看起来是"短毛"而不是连续条纹
                              // 实测 11 时各向异性 5.86、无缝 LR 1.18 —— 稳态区
            light: [-0.50, -0.87],  // 光源方向：左上前方（实测亮部质心偏移仅 2.8% 窗口 → 近顶光）
            // 强度：实测标定。参考图平坦区标准差 28.9 灰阶，
            // 扫描下来 relief 0.30 → std 62（过头一倍），
            // 整体乘 0.5 → std 35，正落在 28~42 区间。
            relief: 0.15,     // 梯度明暗强度（1.0 = 明暗各 ±127）
            ao: 0.11,         // 沟底压暗（大范围起伏）
            lap: 0.23,        // 拉普拉斯项：只把"沟"本身压暗 → 细而利落的暗线
            gamma: 1.0,       // 对比曲线：实测 gamma 越低偏度越接近参考的 -0.29
                              // 1.5 → -1.40（太扁）  1.0 → -0.74  0.85 → -0.59
            crest: 0.08       // 脊顶高光
        };
    },

    /**
     * 脊线高度场（0..1，平铺无缝）
     *
     * 为什么不是"随机噪点"：
     *  ① 用 ridged 噪声 r = 1 - |n|：|n| 的零值等值线是一条条弯曲线条，
     *     取它的脊就得到"一条条凸起的纹路"，而不是均匀的沙点。
     *  ② 分轴频率（fx ≠ fy）：噪声格点在 x 方向更密 → 脊线沿 x 拉长 = 毛发感。
     *     两个方向都用整数频率、格点环绕取址 → 平铺严格无缝，不会有接缝线。
     *  ③ 域扭曲：用两张低频噪声扰动采样坐标 → 脊线弯曲打卷，不是规整条纹。
     *
     * 【关键】每一层的"明暗贡献"单独归一化后再相加。
     * 因为细层的高度起伏很小但斜率很大，如果按高度直接相加再统一归一化，
     * 细层会把梯度能量全部吃掉，粗层（真正看得出纹理的那层）反而被压平
     * ——这就是"看起来糊成一片"的原因。
     *
     * @returns {{gx:Float32Array, gy:Float32Array, ao:Float32Array, lap:Float32Array}}
     *          归一化后的梯度场 / 脊高场 / 拉普拉斯场
     */
    _ridgeFields(size, cfg, seed) {
        const rng = this._seededRng(seed);
        const smooth = (t) => t * t * (3 - 2 * t);

        // 建一张"分轴分辨率"的环绕格点网
        const grid = (fx, fy, rand) => {
            const g = [];
            for (let gy = 0; gy < fy; gy++) {
                const row = [];
                for (let gx = 0; gx < fx; gx++) row.push(rand() * 2 - 1);
                row[fx] = row[0];              // 水平环绕
                g.push(row);
            }
            g[fy] = g[0].slice();              // 垂直环绕
            return g;
        };

        const mkOcts = (fx0, fy0, oct) => {
            const list = [];
            for (let o = 0; o < oct; o++) {
                const fx = Math.max(2, fx0 << o);
                const fy = Math.max(2, fy0 << o);
                list.push({ g: grid(fx, fy, rng), fx, fy });
            }
            return list;
        };
        // 每一层是一组同方向的脊线：
        //   主毛流 + 横向揉痕 + 沿毛方向的细缩绒 —— 三层叠起来才是"皱布"而不是"梳理过的头发"
        const layers = (cfg.layers || [{ a: cfg.a, s: cfg.s, fx: cfg.fx, fy: cfg.fy, oct: cfg.oct, w: 1 }])
            .map((L) => ({
                a: L.a === undefined ? 1 : L.a,
                s: L.s === undefined ? 0 : L.s,
                w: L.w === undefined ? 1 : L.w,
                octs: mkOcts(L.fx, L.fy, L.oct || 2)
            }));
        const wf = Math.max(2, cfg.warpFreq);
        const warpX = { g: grid(wf, wf, rng), fx: wf, fy: wf };
        const warpY = { g: grid(wf, wf, rng), fx: wf, fy: wf };
        const mf = cfg.mask > 0 ? Math.round(cfg.mask) : 0;   // mask<=0 → 关掉断续场
        const maskF = mf >= 2 ? { g: grid(mf, mf, rng), fx: mf, fy: mf } : null;

        // 双线性采样（按格点数换算，环绕取址）
        const sample = (O, u, v) => {
            const bx = ((u % size) + size) % size;
            const by = ((v % size) + size) % size;
            const fu = bx / size * O.fx;
            const fv = by / size * O.fy;
            const ix = Math.floor(fu), iy = Math.floor(fv);
            const tx = smooth(fu - ix), ty = smooth(fv - iy);
            const x0 = ix % O.fx, y0 = iy % O.fy;
            const x1 = (x0 + 1) % O.fx, y1 = (y0 + 1) % O.fy;
            const v00 = O.g[y0][x0], v10 = O.g[y0][x1];
            const v01 = O.g[y1][x0], v11 = O.g[y1][x1];
            return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
        };

        const gx = new Float32Array(size * size);
        const gy = new Float32Array(size * size);
        const ao = new Float32Array(size * size);
        const lap = new Float32Array(size * size);
        const warpAmp = cfg.warp * size;
        const H = new Float32Array(size * size);

        // 逐层生成高度 → 各自归一化 → 累加梯度（= 叠加各层的明暗）
        for (let li = 0; li < layers.length; li++) {
            const L = layers[li];
            let mean = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x + sample(warpX, x, y) * warpAmp;
                    const v = y + sample(warpY, x, y) * warpAmp;
                    let hh = 0, amp = 1, total = 0;
                    for (let o = 0; o < L.octs.length; o++) {
                        // 整数剪切 (a,s) → 纹理主方向倾斜；平铺仍然严格无缝
                        // （整数线性变换在环绕格点网上必然自洽）。
                        //
                        // 【方向性为什么之前上不去 —— 2026-10-15 实测定位】
                        // 上一版靠 fx:5 / fy:20 的格点密度比（4:1）造方向性，
                        // 实测各向异性只有 1.9（1 = 完全各向同性），
                        // 看起来就是一片磨砂噪点，根本不是"一根根毛"。
                        //
                        // 根因不是频率比，是 warp：旧 warp=0.035 × 256 = 9px，
                        // 而脊线间距只有 size/fy = 12.8px ——
                        // 扭曲振幅达到间距的 70%，刚成形的脊线被当场揉烂。
                        // 定量的判据（别忘了）：
                        //     warpAmp / 脊线间距  必须远小于 0.3
                        //
                        // 现在把 warp 压到 0.010（比值 0.20），
                        // 同时把密度比拉大到 22:4 = 5.5，对齐参考图实测的 4.8~7.4。
                        //
                        // 取 |n|（而不是 1-|n|）：脊顶宽、沟底尖 →
                        // 得到"亮面上一条条细而利落的暗沟"，正是参考实拍的形态
                        hh += Math.abs(sample(L.octs[o], L.a * u + L.s * v, v)) * amp;
                        total += amp;
                        amp *= 0.5;
                    }
                    const h = hh / total;
                    H[y * size + x] = h;
                    mean += h;
                }
            }
            mean /= H.length;

            let varr = 0, g2 = 0;
            for (let y = 0; y < size; y++) {
                const ym = (y + size - 1) % size, yp = (y + 1) % size;
                for (let x = 0; x < size; x++) {
                    const xm = (x + size - 1) % size, xp = (x + 1) % size;
                    const i = y * size + x;
                    const d = H[i] - mean;
                    varr += d * d;
                    const dx = (H[y * size + xp] - H[y * size + xm]) * 0.5;
                    const dy = (H[yp * size + x] - H[ym * size + x]) * 0.5;
                    g2 += dx * dx + dy * dy;
                }
            }
            const sd = Math.sqrt(varr / H.length) || 1e-6;
            const grms = Math.sqrt(g2 / H.length) || 1e-6;
            // 拉普拉斯：在沟底为负、脊顶为正 → 单独叠加时会在沟上画出"细而利落"的暗线
            // （只靠梯度做明暗，沟是软带；加了这一项才是实拍上那种细暗沟）
            let l2 = 0;
            for (let y = 0; y < size; y++) {
                const ym = (y + size - 1) % size, yp = (y + 1) % size;
                for (let x = 0; x < size; x++) {
                    const xm = (x + size - 1) % size, xp = (x + 1) % size;
                    const v = 4 * H[y * size + x] - H[y * size + xm] - H[y * size + xp]
                        - H[ym * size + x] - H[yp * size + x];
                    l2 += v * v;
                }
            }
            const lrms = Math.sqrt(l2 / H.length) || 1e-6;
            const w = L.w;

            for (let y = 0; y < size; y++) {
                const ym = (y + size - 1) % size, yp = (y + 1) % size;
                for (let x = 0; x < size; x++) {
                    const xm = (x + size - 1) % size, xp = (x + 1) % size;
                    const i = y * size + x;
                    gx[i] += (H[y * size + xp] - H[y * size + xm]) * 0.5 / grms * w;
                    gy[i] += (H[yp * size + x] - H[ym * size + x]) * 0.5 / grms * w;
                    ao[i] += (H[i] - mean) / sd * w;
                    lap[i] += (4 * H[i] - H[y * size + xm] - H[y * size + xp]
                        - H[ym * size + x] - H[yp * size + x]) / lrms * w;
                }
            }
        }

        // 断续场：让"毛"时隐时现，得到一根根短毛而不是连绵的脊线
        if (maskF) {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    // 让沟"断掉"，看起来才是一根根短毛而不是连成一片的条纹。
                    // 最低留 0.3：再低就会变成大块大块的明暗斑（实拍上是很均匀的细纹）
                    const m = 0.30 + 0.70 * (sample(maskF, x, y) * 0.5 + 0.5);
                    const i = y * size + x;
                    gx[i] *= m; gy[i] *= m; ao[i] *= m; lap[i] *= m;
                }
            }
        }
        return { gx, gy, ao, lap };
    },

    /** 旧接口保留：只取高度场（调试/其它用途） */
    _ridgeHeightField(size, cfg, seed) {
        const f = this._ridgeFields(size, cfg, seed);
        const out = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                out[y * size + x] = f.ao[y * size + x];
            }
        }
        return out;
    },

    /**
     * 把高度场变成可叠加的灰度 tile（128 = 中性灰）
     *
     * 【关键】浮雕感来自"用高度场的梯度做方向光照明"，不是画出高度本身：
     *   · 梯度在光源方向上的投影 → 受光面变亮、背光面变暗（凹凸感）
     *   · 高度高于平均值 → 脊顶提亮；低于平均值 → 沟底压暗（环境光遮蔽）
     *   · 朝向光源的脊棱再补一层高光 → 融化的塑料才有的那种亮边
     * 强度都按梯度/高度的统计量归一化，所以换 tile 尺寸或频率不会忽明忽暗。
     */
    _tile_ridgeEmboss(size, cfg, seed) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        const F = this._ridgeFields(size, cfg, seed);

        let g2 = 0, a2 = 0;
        for (let i = 0; i < F.gx.length; i++) {
            g2 += F.gx[i] * F.gx[i] + F.gy[i] * F.gy[i];
            a2 += F.ao[i] * F.ao[i];
        }
        const grms = Math.sqrt(g2 / F.gx.length) || 1e-6;
        const arms = Math.sqrt(a2 / F.ao.length) || 1e-6;
        let l2 = 0;
        for (let i = 0; i < F.lap.length; i++) l2 += F.lap[i] * F.lap[i];
        const lrms = Math.sqrt(l2 / F.lap.length) || 1e-6;

        const [lx, ly] = cfg.light;
        const relief = cfg.relief * 127 / grms;
        const ao = cfg.ao * 127 / arms;
        const lapGain = (cfg.lap === undefined ? 0.5 : cfg.lap) * 127 / lrms;
        const crest = (cfg.crest || 0) * 127;
        const lamMax = cfg.relief * 127;
        const gamma = cfg.gamma || 1;

        for (let i = 0; i < F.gx.length; i++) {
                const lam = (F.gx[i] * lx + F.gy[i] * ly) * relief;
                const crease = F.ao[i] * ao;
                let v = lam + crease + F.lap[i] * lapGain;
                if (crest > 0) {
                    const t = Math.max(0, Math.min(1, lam / lamMax));
                    v += crest * t * t;
                }
                if (gamma !== 1) {
                    // 提高中低幅度的对比：沟更利落、平的地方更平
                    const t = Math.max(-127, Math.min(127, v)) / 127;
                    v = Math.sign(t) * Math.pow(Math.abs(t), gamma) * 127;
                }

                const gray = Math.max(0, Math.min(255, Math.round(128 + Math.max(-127, Math.min(127, v)))));
                const idx = i * 4;
                img.data[idx] = gray;
                img.data[idx + 1] = gray;
                img.data[idx + 2] = gray;
                img.data[idx + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    },

    /** 塑料基底细颗粒（所有模式共用的材质感） */
    _tile_grain(amp) {
        const size = 96;
        const { canvas, ctx } = this._newGrayTile(size);
        const img = ctx.getImageData(0, 0, size, size);
        const rng = this._seededRng('grain');

        for (let i = 0; i < img.data.length; i += 4) {
            const n = (rng() - 0.5) * 2 * amp;
            const gray = Math.max(0, Math.min(255, Math.round(128 + n * 127)));
            img.data[i] = gray;
            img.data[i + 1] = gray;
            img.data[i + 2] = gray;
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    },

    /**
     * 澡巾烫：细密颗粒磨砂质感（蒙版叠层版）
     *
     * 参考实拍：澡巾烫是织物般的细密颗粒，颗粒"成簇出现、浓淡不均"，
     * 而不是整片均匀噪点（均匀噪点看起来像电视雪花，很假）。
     *
     * 【蒙版叠层的四步】
     *  ③ 弱颗粒底：整片铺一层很轻的均匀颗粒（保证整体仍是磨砂面）
     *  ① 强颗粒层：128 灰底 + 强高频颗粒 + 微弱斜向织物纹
     *  ② 蒙版擦除：fbm 噪声 → alpha（RGB 全白），以 destination-in 叠到强颗粒层
     *     → 颗粒被"擦"成一块一块的聚簇，簇间几乎干净
     *  ④ 把 ①②（已带 alpha）叠到 ③ 之上：浓处有强颗粒、淡处只剩细磨砂
     */
    _tile_zaoGrain(amp) {
        const size = 64;
        const rng = this._seededRng('zaoGrain');

        // ---- ③ 弱颗粒底（作为最终基底）----
        const base = this._newGrayTile(size);
        const bimg = base.ctx.getImageData(0, 0, size, size);
        const weakStrength = 0.05 + 0.09 * amp;
        for (let i = 0; i < bimg.data.length; i += 4) {
            const n = (rng() - 0.5) * 2 * weakStrength;
            const gray = Math.max(0, Math.min(255, Math.round(128 + n * 127)));
            bimg.data[i] = gray;
            bimg.data[i + 1] = gray;
            bimg.data[i + 2] = gray;
            bimg.data[i + 3] = 255;
        }
        base.ctx.putImageData(bimg, 0, 0);

        // ---- ① 强颗粒层 ----
        const strong = this._newGrayTile(size);
        const simg = strong.ctx.getImageData(0, 0, size, size);
        const strength = 0.18 + 0.26 * amp;
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                let v = (rng() - 0.5) * 2;
                // 很弱的斜向织物纹路（避免看起来是规则条纹）
                v += Math.sin((px + py) * 0.55) * 0.22;
                const gray = Math.max(0, Math.min(255, Math.round(128 + v * strength * 127)));
                const idx = (py * size + px) * 4;
                simg.data[idx] = gray;
                simg.data[idx + 1] = gray;
                simg.data[idx + 2] = gray;
                simg.data[idx + 3] = 255;
            }
        }
        strong.ctx.putImageData(simg, 0, 0);

        // ---- ② 蒙版擦除：只保留噪声浓处的颗粒 ----
        const mask = this._tile_noiseMask(size, 6, 3, 'zaoMask', 0.05, 1.0);
        strong.ctx.globalCompositeOperation = 'destination-in';
        strong.ctx.drawImage(mask, 0, 0);
        strong.ctx.globalCompositeOperation = 'source-over';

        // ---- ④ 强颗粒（带 alpha）叠在弱颗粒底之上 ----
        base.ctx.drawImage(strong.canvas, 0, 0);

        return base.canvas;
    },

    /**
     * 毛巾烫：绒面纤维（大量极短绒毛丝 + wrap 无缝 + 蒙版浓淡不均）
     *
     * 【蒙版叠层】绒毛画在"透明底"上（不填 128），再用 fbm 蒙版擦出浓淡，
     * 最后叠到 128 灰底上 → 绒毛密度成片变化，像真实的绒面起毛不匀，
     * 而不是整片均匀的短毛噪声。
     */
    _tile_maoFiber(amp) {
        const size = 128;

        // 纤维层：透明底，只画绒毛
        const fib = document.createElement('canvas');
        fib.width = size;
        fib.height = size;
        const ctx = fib.getContext('2d');
        const rng = this._seededRng('maoFiber');

        const count = Math.floor(900 * (0.45 + 0.55 * amp));

        const fiber = (x, y, angle, len, style) => {
            ctx.strokeStyle = style;
            ctx.lineWidth = 0.7;
            const ex = x + Math.cos(angle) * len;
            const ey = y + Math.sin(angle) * len;

            const offsets = [[0, 0]];
            if (x < len || y < len || ex > size - len || ey > size - len) {
                for (const dx of [-size, 0, size]) {
                    for (const dy of [-size, 0, size]) {
                        if (dx || dy) offsets.push([dx, dy]);
                    }
                }
            }

            for (const [dx, dy] of offsets) {
                ctx.beginPath();
                ctx.moveTo(x + dx, y + dy);
                ctx.lineTo(ex + dx, ey + dy);
                ctx.stroke();
            }
        };

        // 亮绒毛
        const brightAlpha = 0.16 + 0.16 * amp;
        for (let i = 0; i < count; i++) {
            fiber(rng() * size, rng() * size, rng() * Math.PI * 2,
                2 + rng() * 4, `rgba(255,255,255,${brightAlpha * (0.5 + rng() * 0.5)})`);
        }
        // 暗绒毛（绒面沟壑）
        for (let i = 0; i < count * 0.8; i++) {
            fiber(rng() * size, rng() * size, rng() * Math.PI * 2,
                2 + rng() * 4, `rgba(0,0,0,${(0.10 + 0.10 * amp) * (0.5 + rng() * 0.5)})`);
        }

        // 蒙版擦除：绒毛成片浓淡（留 35% 底线，避免出现完全光秃的斑块）
        const mask = this._tile_noiseMask(size, 5, 3, 'maoMask', 0.35, 1.0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';

        // 叠到 128 灰底（保持中性基准，供 overlay 混合）
        const { canvas, ctx: grayCtx } = this._newGrayTile(size);
        grayCtx.drawImage(fib, 0, 0);

        return canvas;
    },

    /**
     * 华夫格烫：大面积方格凹凸
     * 参考实拍：是整板的大方格压痕（格尺寸约 2-3 个豆子），
     * 格线是平滑立体的凹槽（暗线 + 相邻亮线），不是每颗豆一个小十字。
     */
    _tile_waffle(cell, amp) {
        // 取 4 的倍数边长：保证 s/2 为整数（格线不落在半像素）、且能被噪声频率整除（平铺无缝）
        const s = Math.max(12, Math.round(cell / 4) * 4);
        const { canvas, ctx } = this._newGrayTile(s);

        const depth = 0.16 + 0.16 * amp;
        const lw = Math.max(1.2, s * 0.07);
        // 格线弯曲量：让压痕不是笔直的刻线（真实压贴物体的边缘不会是完美直线）
        const bend = s * 0.045;

        // 凹槽：暗线 + 紧邻的亮线 → 立体压痕
        for (let i = 0; i < 2; i++) {
            const x = i * (s / 2);
            const y = i * (s / 2);
            // 两条线的弯曲方向相反，避免整板呈现同一走向的规整感
            const dir = i === 0 ? 1 : -1;

            // 垂直凹槽（端点固定在 tile 边界 → 平铺后首尾相连，无缝）
            ctx.strokeStyle = `rgba(0,0,0,${depth})`;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.quadraticCurveTo(x + bend * dir, s / 2, x, s);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255,255,255,${depth * 0.65})`;
            ctx.lineWidth = lw * 0.8;
            ctx.beginPath();
            ctx.moveTo(x + lw, 0);
            ctx.quadraticCurveTo(x + lw + bend * dir, s / 2, x + lw, s);
            ctx.stroke();

            // 水平凹槽
            ctx.strokeStyle = `rgba(0,0,0,${depth})`;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(s / 2, y + bend * dir, s, y);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255,255,255,${depth * 0.65})`;
            ctx.lineWidth = lw * 0.8;
            ctx.beginPath();
            ctx.moveTo(0, y + lw);
            ctx.quadraticCurveTo(s / 2, y + lw + bend * dir, s, y + lw);
            ctx.stroke();
        }

        // 格内柔和高光（让每格中心微微凸起）
        const grad = ctx.createRadialGradient(s / 4, s / 4, 0, s / 4, s / 4, s * 0.28);
        grad.addColorStop(0, `rgba(255,255,255,${0.06 + 0.06 * amp})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);

        // 用低频噪声调制压痕深浅 → 格线时深时浅，破除"规整贴图"感
        const mod = this._tile_fbm(s, 2, 1, 'waffleModulate', 0.5);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(mod, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        return canvas;
    },

    /** 菱格烫：45° 斜向压花格纹（平滑柔和，带轻微弯曲） */
    _tile_diamond(cell, amp) {
        // 取 4 的倍数：可被噪声频率整除，保证平铺无缝
        const s = Math.max(12, Math.round(cell / 4) * 4);
        const { canvas, ctx } = this._newGrayTile(s);

        const depth = 0.13 + 0.13 * amp;
        const lw = Math.max(1.2, s * 0.06);
        // 弯曲量：菱格的棱不是完美直线（压贴物体本身的边缘不规则）
        const bend = s * 0.05;

        // 两条对角线（端点固定在 tile 角上 → 平铺后首尾相连成连续菱形网，无缝）
        ctx.strokeStyle = `rgba(0,0,0,${depth})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s / 2 + bend, s / 2 - bend, s, s);
        ctx.moveTo(s, 0);
        ctx.quadraticCurveTo(s / 2 - bend, s / 2 - bend, 0, s);
        ctx.stroke();

        // 高光斜线（棱感）
        ctx.strokeStyle = `rgba(255,255,255,${depth * 0.7})`;
        ctx.lineWidth = lw * 0.75;
        ctx.beginPath();
        ctx.moveTo(lw, 0);
        ctx.quadraticCurveTo(s / 2 + bend, s / 2 - bend, s, s - lw);
        ctx.moveTo(s - lw, 0);
        ctx.quadraticCurveTo(s / 2 - bend, s / 2 - bend, 0, s - lw);
        ctx.stroke();

        // 低频噪声调制 → 压痕深浅不均匀，破除规整贴图感
        const mod = this._tile_fbm(s, 2, 1, 'diamondModulate', 0.45);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(mod, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        return canvas;
    },

    /**
     * 烘焙纸烫：揉皱褶皱
     * 参考实拍：大尺度揉皱起伏 + 局部高光斑 + 深阴影，最不规则
     * 做法：多条弯曲的裂纹线（带随机扰动）叠在 fbm 之上
     */
    _tile_crease(amp) {
        const size = 128;
        const { canvas, ctx } = this._newGrayTile(size);
        const rng = this._seededRng('crease');

        const count = Math.floor(26 * (0.5 + 0.5 * amp));

        for (let i = 0; i < count; i++) {
            // 从 tile 边缘随机起点出发，画一条弯曲的裂纹
            let x = rng() * size;
            let y = rng() * size;
            let angle = rng() * Math.PI * 2;

            const segments = 5 + Math.floor(rng() * 4);
            const bright = rng() > 0.45;

            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let k = 0; k < segments; k++) {
                angle += (rng() - 0.5) * 1.2;
                const len = 6 + rng() * 12;
                const nx = x + Math.cos(angle) * len;
                const ny = y + Math.sin(angle) * len;
                // 用二次曲线连接 → 平滑褶皱，不是折线
                ctx.quadraticCurveTo(x + Math.cos(angle + 0.6) * len * 0.5,
                                     y + Math.sin(angle + 0.6) * len * 0.5, nx, ny);
                x = nx;
                y = ny;

                // 跨边界时补画（粗略 wrap，保证平铺不出现明显断层）
                if (x < 0 || y < 0 || x > size || y > size) break;
            }

            ctx.strokeStyle = bright
                ? `rgba(255,255,255,${(0.12 + 0.14 * amp)})`
                : `rgba(0,0,0,${(0.14 + 0.16 * amp)})`;
            ctx.lineWidth = 0.8 + rng() * 1.6;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        return canvas;
    },

    /** 细闪烫：极细密闪粉颗粒 */
    _tile_fineSpark(amp) {
        const size = 64;
        const { canvas, ctx } = this._newGrayTile(size);
        const rng = this._seededRng('fineSpark');

        const count = Math.floor(420 * (0.35 + 0.65 * amp));

        for (let i = 0; i < count; i++) {
            const x = rng() * size;
            const y = rng() * size;
            // 高斯近似 → 大小不一更自然
            const g = (rng() + rng() + rng()) / 3;
            const r = 0.5 + g * 0.7;
            const a = 0.45 + 0.45 * rng();

            this._drawWrappedDot(ctx, x, y, r, size, `rgba(255,255,255,${a})`);
        }

        return canvas;
    },

    /** 格利特烫：粗颗粒闪片 */
    _tile_glitter(amp) {
        const size = 96;
        const { canvas, ctx } = this._newGrayTile(size);
        const rng = this._seededRng('glitter');

        const count = Math.floor(58 * (0.35 + 0.65 * amp));

        for (let i = 0; i < count; i++) {
            const x = rng() * size;
            const y = rng() * size;
            const g = (rng() + rng() + rng()) / 3;
            const r = 1.4 + g * 2.6;

            this._drawWrappedGlow(ctx, x, y, r, size, amp);
        }

        return canvas;
    },

    /** 仙度瑞拉烫：星点反光（细亮 + 十字星芒） */
    _tile_starSpark(amp) {
        const size = 96;
        const { canvas, ctx } = this._newGrayTile(size);
        const rng = this._seededRng('starSpark');

        const count = Math.floor(120 * (0.35 + 0.65 * amp));

        for (let i = 0; i < count; i++) {
            const x = rng() * size;
            const y = rng() * size;
            const g = (rng() + rng() + rng()) / 3;
            const r = 0.6 + g * 1.4;

            // 亮点
            this._drawWrappedDot(ctx, x, y, r, size, `rgba(235,240,255,${0.5 + 0.45 * rng()})`);

            // 少数大一点的加十字星芒（镜面反光的特征）
            if (rng() > 0.82) {
                const arm = r * 2.6;
                ctx.strokeStyle = `rgba(255,255,255,${0.22 + 0.22 * amp})`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(x - arm, y);
                ctx.lineTo(x + arm, y);
                ctx.moveTo(x, y - arm);
                ctx.lineTo(x, y + arm);
                ctx.stroke();
            }
        }

        return canvas;
    },

    /** 画带 wrap 的小圆点（跨 tile 边界时在对面补画 → 平铺无缝） */
    _drawWrappedDot(ctx, x, y, r, size, style) {
        ctx.fillStyle = style;
        const offsets = [[0, 0]];

        const nearL = x < r, nearR = x > size - r, nearT = y < r, nearB = y > size - r;
        if (nearL) offsets.push([size, 0]);
        if (nearR) offsets.push([-size, 0]);
        if (nearT) offsets.push([0, size]);
        if (nearB) offsets.push([0, -size]);
        if (nearL && nearT) offsets.push([size, size]);
        if (nearR && nearB) offsets.push([-size, -size]);
        if (nearL && nearB) offsets.push([size, -size]);
        if (nearR && nearT) offsets.push([-size, size]);

        for (const [dx, dy] of offsets) {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    /** 画带光晕 + wrap 的亮片（格利特烫） */
    _drawWrappedGlow(ctx, x, y, r, size, amp) {
        const offsets = [[0, 0]];
        if (x < r * 2) offsets.push([size, 0]);
        if (x > size - r * 2) offsets.push([-size, 0]);
        if (y < r * 2) offsets.push([0, size]);
        if (y > size - r * 2) offsets.push([0, -size]);

        for (const [dx, dy] of offsets) {
            const gx = x + dx;
            const gy = y + dy;
            const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
            grad.addColorStop(0, `rgba(255,255,255,${0.7 + 0.28 * amp})`);
            grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // ============================================================
    //  七、光照 + 塑料基底光泽
    // ============================================================

    /**
     * 写实感的关键一层：
     *  · 方向性明暗（光源从左上来）
     *  · 环境光反射光泽（塑料材质的高光）
     *  · 边缘内阴影（平板厚度）
     *  · 边缘豆鼓起处的顶部高光（融化流动的塑料反光）
     */
    _applyLightingLayer(ctx, width, height, state, profile, amp, geo) {
        // ---- 方向性明暗 ----
        const dirGrad = ctx.createLinearGradient(0, 0, width * 0.45, height);
        dirGrad.addColorStop(0, `rgba(255,255,255,${0.10 + 0.06 * amp})`);
        dirGrad.addColorStop(0.38, 'rgba(255,255,255,0)');
        dirGrad.addColorStop(0.72, 'rgba(0,0,0,0)');
        dirGrad.addColorStop(1, 'rgba(0,0,0,0.13)');

        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = dirGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        // ---- 塑料基底环境光（斜向柔和高光带，让表面有材质反光） ----
        if (profile.sheen > 0.01) {
            const sheen = ctx.createLinearGradient(0, height, width, 0);
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.42, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.55, `rgba(255,255,255,${profile.sheen})`);
            sheen.addColorStop(0.68, 'rgba(255,255,255,0)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = sheen;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // ---- 边缘内阴影（厚度感） ----
        const edgeGrad = ctx.createRadialGradient(
            width / 2, height / 2, Math.min(width, height) * 0.36,
            width / 2, height / 2, Math.min(width, height) * 0.60
        );
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(1, 'rgba(0,0,0,0.20)');

        ctx.save();
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        // ---- 外缘圆边的反光（塑料融化流动的边缘） ----
        this._applyRimHighlight(ctx, width, height, geo, profile, amp);
    },

    /**
     * 外缘反光。
     *
     * 物理依据：成品最外圈是融化后圆起来的边，受光侧（左上）亮、背光侧（右下）暗。
     *
     * 两处关键：
     *  ① 描的是**成品外轮廓**（只有朝外的边），不是每颗边缘豆的方框 ——
     *     描方框会把线画进成品内部，看起来像给成品贴了一圈白描边。
     *  ② 用带方向的渐变代替均匀白色 —— 光有来源，边缘才有立体感。
     */
    _applyRimHighlight(ctx, width, height, geo, profile, amp) {
        // 熔融路径没有独立的"外轮廓描边路径"，
        // 用 mask 轮廓代替 —— 它描的是成品外缘，语义一致。
        const outline = geo && (geo.outline || geo.maskPath);
        if (!outline) return;
        const s = geo.cellSize;

        const bright = Math.min(0.46, 0.20 + profile.sheen * 1.4 + 0.10 * amp);
        const dark = Math.min(0.30, 0.10 + 0.12 * amp);
        const g = ctx.createLinearGradient(0, 0, width * 0.72, height);
        g.addColorStop(0, `rgba(255,255,255,${bright})`);
        g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
        g.addColorStop(0.62, 'rgba(0,0,0,0.05)');
        g.addColorStop(1, `rgba(0,0,0,${dark})`);

        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = g;
        // 一道宽的柔光（整圈圆边受光）+ 一道窄的亮边（圆边棱上的高光）
        ctx.lineWidth = Math.max(2.5, s * 0.20);
        ctx.globalAlpha = 0.5;
        ctx.stroke(outline);
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1.2, s * 0.075);
        ctx.stroke(outline);
        ctx.restore();
    },

    // ============================================================
    //  七·五、闪光晶体层（独立叠层）
    // ============================================================
    //
    //  【为什么单独一层，而不是再做几个"XX闪烫"】
    //  实拍里"澡巾烫 + 粗闪粉"、"正常烫 + 细闪"都是成立的组合：
    //  烫法决定塑料怎么融，闪粉是另外撒上去的一层颗粒。
    //  所以这一层跟 mode 完全正交，只由自己的四个参数控制。
    //
    //  【分布：抖动网格，不是纯随机】
    //  纯随机会结块、留空洞，看着像脏点；实拍的闪粉是偏均匀的一层。
    //  这里先在网格上取点，再对每个点做 ±0.46 格的抖动 ——
    //  既有均匀的骨架，又不会排出整齐的行列。

    /** 闪光参数的缓存指纹（进 _ironPieceKey，改了才会重画成品层） */
    _glitterTag(state) {
        const p = this._ironGlitterParams(state);
        if (!p.on) return 'g0';
        return `g1d${p.density.toFixed(2)}s${p.size.toFixed(2)}b${p.bright.toFixed(2)}t${p.tint.toFixed(2)}`;
    },

    /**
     * 生成晶体点阵（2D 与 3D 共用同一份，保证两个视图里"撒的是同一把粉"）。
     *
     * 坐标单位是「格」，x∈[0, cols]、y∈[0, rows]，与渲染分辨率无关 ——
     * 所以预览、导出、3D 三种尺寸下晶体位置完全一致，不会换个倍率就重撒一遍。
     */
    _ironGlitterPoints(cols, rows, params) {
        // 图案指纹也进 key：晶体只撒在"有豆子"的格子上（见下面的剔除），
        // 图案一变就得重撒，否则会残留上一版形状里的晶体
        const grid = this.perlerColors;
        const rev = grid ? this._ironPatternRev(grid, cols, rows) : 'x';
        const key = `${cols}x${rows}|${rev}|${params.density.toFixed(2)}|${params.size.toFixed(2)}`;
        if (this._glitterCache && this._glitterCacheKey === key) return this._glitterCache;

        const rng = this._seededRng(`glitter|${cols}x${rows}`);
        // 间距（格）：密度 0 → 1.15 格一颗，密度 1 → 0.30 格一颗
        let sp = Math.max(0.30, 1.15 - 0.85 * params.density);
        // 兜底：2D 每颗要一次 drawImage，上万颗就拉大间距（视觉上差别很小）
        for (let guard = 0; guard < 30; guard++) {
            if (Math.ceil(cols / sp) * Math.ceil(rows / sp) <= 9000) break;
            sp *= 1.08;
        }
        const gx = Math.ceil(cols / sp) + 1;
        const gy = Math.ceil(rows / sp) + 1;
        const accept = 0.22 + 0.78 * params.density;

        const xs = [], ys = [], rs = [], rots = [], bigs = [], tints = [], nxs = [], nys = [], phs = [], bs = [];
        for (let iy = 0; iy < gy; iy++) {
            for (let ix = 0; ix < gx; ix++) {
                if (rng() > accept) continue;
                const x = (ix + (rng() - 0.5) * 0.92) * sp;
                const y = (iy + (rng() - 0.5) * 0.92) * sp;
                if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
                // 只撒在真的有豆子的格子上。
                // 2D 那边靠剪裁看不出来，但 3D 没有剪裁 —— 空网格区域的晶体会
                // 飘在半空变成一片"星星点点的黑底白点"，必须在这里剔掉。
                const cx0 = Math.min(cols - 1, Math.max(0, Math.floor(x)));
                const cy0 = Math.min(rows - 1, Math.max(0, Math.floor(y)));
                if (grid && grid[cy0] && grid[cy0][cx0] && grid[cy0][cx0].isTransparent) continue;
                xs.push(x); ys.push(y);
                // 粒径分布：多数偏小、少量偏大（三次均匀分布的平均值 → 中间高两头低）
                const mid = (rng() + rng() + rng()) / 3;
                rs.push(0.55 + mid * 1.05);
                rots.push(rng() * Math.PI);
                bigs.push(rng() > 0.88 ? 1 : 0);
                const tr = rng();
                tints.push(tr < 0.22 ? 0 : (tr < 0.62 ? 1 : 2));
                // 亮度分布：真实的闪粉是"少数特别亮、多数只是灰白点"
                //   均匀分布会让整层糊成一片白霜，幂次偏斜才像撒上去的颗粒
                bs.push(Math.pow(rng(), 1.7));
                // 3D 微面朝向：绕法线倾斜，决定"转到哪个角度它会反光"
                const a = rng() * Math.PI * 2;
                // 倾斜范围要够宽（≈ 0.12~0.86 → 7°~60°）：
                // 视角转过 50° 时，只有倾角足够大的那批晶体还能把光反射进眼睛。
                // 范围太窄的话，一转就"整层同时暗掉"，看着像灯被关了。
                const tilt = 0.12 + rng() * 0.74;
                nxs.push(Math.cos(a) * tilt);
                nys.push(Math.sin(a) * tilt);
                phs.push(rng() * Math.PI * 2);
            }
        }

        const n = xs.length;
        const pts = {
            key, n, spacing: sp,
            x: Float32Array.from(xs), y: Float32Array.from(ys),
            r: Float32Array.from(rs), rot: Float32Array.from(rots),
            big: Uint8Array.from(bigs), tint: Uint8Array.from(tints),
            bs: Float32Array.from(bs),
            nx: Float32Array.from(nxs), ny: Float32Array.from(nys),
            phase: Float32Array.from(phs)
        };
        this._glitterCache = pts;
        this._glitterCacheKey = key;
        return pts;
    },

    /**
     * 晶体精灵（预渲染一张，之后每颗只是 drawImage 缩放）。
     *
     *  【为什么不逐颗画渐变】一万颗各 createRadialGradient + 4 段 addColorStop，
     *  实测 1.8s 起步；预渲染一张 128² 再 drawImage 是 30ms 级。
     *  晶体的形态在 2~20px 的尺度上只有"亮点 + 星芒"，缩放完全够用。
     */
    _glitterSprite(kind, tintIdx) {
        const key = kind + tintIdx;
        if (!this._glitterSpriteCache) this._glitterSpriteCache = {};
        if (this._glitterSpriteCache[key]) return this._glitterSpriteCache[key];

        const TINTS = [[196, 224, 255], [255, 255, 255], [255, 240, 206]];
        const [r, g, b] = TINTS[tintIdx] || TINTS[1];
        const S = 128;
        const cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const c = cv.getContext('2d');
        const cx = S / 2, cy = S / 2;
        const big = kind === 'b';
        const rgb = `${r},${g},${b}`;

        // 1) 光晕：晶体的漫反射环境光
        //   ★ 半径必须收敛到 0.5S 里面一点点：光晕一旦超过包围盒的一半，
        //     相邻晶体就会互相叠加，整片糊成"白霜"，看着像撒了糖粉而不是晶体。
        const hRad = S * (big ? 0.5 : 0.42);
        const halo = c.createRadialGradient(cx, cy, 0, cx, cy, hRad);
        halo.addColorStop(0, `rgba(${rgb},0.95)`);
        halo.addColorStop(0.10, `rgba(${rgb},0.55)`);
        halo.addColorStop(0.30, `rgba(${rgb},0.14)`);
        halo.addColorStop(0.62, `rgba(${rgb},0.03)`);
        halo.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = halo;
        c.beginPath(); c.arc(cx, cy, hRad, 0, Math.PI * 2); c.fill();

        // 2) 十字星芒：大颗粒才有（粗闪）
        if (big) {
            [[0, 0.5], [Math.PI / 2, 0.5], [Math.PI / 4, 0.26], [-Math.PI / 4, 0.26]]
                .forEach(([ang, lenF], i) => {
                    const len = S * lenF;
                    c.save();
                    c.translate(cx, cy);
                    c.rotate(ang);
                    c.scale(1, i < 2 ? 0.10 : 0.07);
                    const rg = c.createRadialGradient(0, 0, 0, 0, 0, len);
                    rg.addColorStop(0, `rgba(${rgb},1)`);
                    rg.addColorStop(0.3, `rgba(${rgb},${i < 2 ? 0.42 : 0.24})`);
                    rg.addColorStop(1, `rgba(${rgb},0)`);
                    c.fillStyle = rg;
                    c.beginPath(); c.arc(0, 0, len, 0, Math.PI * 2); c.fill();
                    c.restore();
                });
        }

        // 3) 晶核：最亮的那一点（占包围盒 30% 直径，2D 那边按这个比例换算尺寸）
        const core = S * 0.15;
        const cg = c.createRadialGradient(cx - core * 0.22, cy - core * 0.22, 0, cx, cy, core);
        cg.addColorStop(0, 'rgba(255,255,255,1)');
        cg.addColorStop(0.5, `rgba(${rgb},0.95)`);
        cg.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = cg;
        c.beginPath(); c.arc(cx, cy, core, 0, Math.PI * 2); c.fill();

        this._glitterSpriteCache[key] = cv;
        return cv;
    },

    /**
     * 把晶体撒到成品上（加色叠加）。
     * 调用点都在 clip 内部，所以溢出的晶体自然被成品轮廓裁掉，
     * 边缘会看到"半颗"——这正是真实照片里闪粉压在边上的样子。
     */
    _applyGlitterLayer(ctx, width, height, cellSize, state) {
        const p = this._ironGlitterParams(state);
        if (!p.on || p.density <= 0.001 || p.bright <= 0.001) return;
        const cols = this.perlerWidth, rows = this.perlerHeight;
        if (!cols || !rows) return;

        const pts = this._ironGlitterPoints(cols, rows, p);
        if (!pts.n) return;

        // 目标晶体直径（豆径比例）：细闪 ≈ 0.07 豆，粗闪 ≈ 0.40 豆
        const dia = cellSize * (0.05 + 0.30 * p.size);
        // 精灵图里晶核只占包围盒 30% → 放大到 dia/0.30 才让"颗粒"看起来是 dia
        const k = 1 / 0.30;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < pts.n; i++) {
            const big = pts.big[i] === 1;
            const spr = this._glitterSprite(big ? 'b' : 's', pts.tint[i]);
            const s = dia * k * pts.r[i] * (big ? 1.9 : 1);
            // 亮度：颗粒自身的反光系数（多数很暗）+ 用户的反光滑杆
            const a = p.bright * (0.14 + 0.86 * pts.bs[i]) * 0.9;
            ctx.globalAlpha = Math.min(1, a);
            ctx.drawImage(spr, pts.x[i] * cellSize - s / 2, pts.y[i] * cellSize - s / 2, s, s);
        }
        ctx.restore();
    },

    // ============================================================
    //  八、导出
    // ============================================================

    exportIronPreview() {
        if (!this._ironPreviewCanvas) return;
        if (!this.perlerColors || !this.perlerColors.length) {
            alert('请先生成拼豆图纸！');
            return;
        }

        if (this._ironExporting) return;
        this._ironExporting = true;

        const hint = this._ironPreviewHint;
        const prevHint = hint.textContent;
        hint.textContent = '⏳ 正在生成高清图…';

        // 先让"正在生成"显示出来，再干重活（渲染是同步的，不 yield 一下就看不到提示）
        requestAnimationFrame(() => {
            const state = this._ironPreviewState;
            const off = document.createElement('canvas');
            const prevCanvas = this._ironPreviewCanvas;
            const prevCtx = this._ironPreviewCtx;

            this._ironPreviewCanvas = off;
            this._ironPreviewCtx = off.getContext('2d');
            try {
                // 导出按更高的分辨率预算重画一遍（预览那张为了秒开是降过分辨率的）
                this.drawIronPreview(this.perlerColors, this.perlerWidth, this.perlerHeight,
                    Object.assign({}, state, { maxPx: this._IRON_EXPORT_MAX_PX }));

                const link = document.createElement('a');
                // 文件名带 alpha 标记，方便事后分辨哪张是透明底的
                link.download = `iron-${state.mode}${state.transparent ? '-alpha' : ''}-${Date.now()}.png`;
                link.href = off.toDataURL('image/png');
                link.click();
            } finally {
                this._ironPreviewCanvas = prevCanvas;
                this._ironPreviewCtx = prevCtx;
                this._ironExporting = false;
                // 缓存里现在是高清那张，作废；再把屏幕上的预览画回预览分辨率
                this._ironPieceKey = null;
                this._ironGeo = null;
                hint.textContent = prevHint;
                this._refreshIronPreview(true);
            }
        });
    }
};

// v2 独立模块：不再往 v1 的 PixelArtGenerator.prototype 上挂，
// 由 js/editor.js 建一个适配对象（perlerColors / perlerWidth / perlerHeight）来驱动。
window.IronPreviewMixin = IronPreviewMixin;
