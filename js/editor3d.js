/*!
 * editor3d.js —— 编辑器的 3D 视图（多实例）
 *
 * 跟 ironPreview3d.js 是两套东西，别混：
 *   ironPreview3d  = 「预览成品」弹窗里的单块拟真特效（澡巾包边、熔融、晶体闪粉），
 *                    几何是照着那一张成品图一次性烘出来的，塞不进第二块。
 *   本文件        = 主画布的 3D 视图。一个区域 = 一块板，多块并排，
 *                    每块有自己的位置/旋转/镜像（region.local）。
 *
 * 数据流（单向）：
 *   region.cells(色号字符串[]) ──bakeRegionTexture（在 editor.js 里，能用 PAL_MAP）──▶ canvas
 *   canvas ──setInstance 上传──▶ GL 纹理 + 板几何（w/h 决定尺寸）
 *   每帧：model = T(世界位置) · T(local.pos) · R(local.rot) · S(flipX)
 *
 * 关键约定：
 *   1 格 = 1 世界单位。板厚固定 THICK。
 *   2D 的 (x, y) 直接映射成 3D 的 (x, z)，所以 3D 里各板的相对位置跟 2D 一致 ——
 *   用户扫一眼就知道哪块是哪块，不用重新学一套空间关系。local.pos 叠在这之上。
 *
 * 坐标轴：y 朝上；-z 朝屏幕里（默认机位在 +z）。
 */
(function () {
    'use strict';

    var THICK = 1.1;            // 板厚（格）
    var MAX_TEX = 2048;         // 单边纹理上限，超了就降烘焙分辨率

    /* ============================ 矩阵（列主序） ============================ */

    function identity() {
        var m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    }

    function mul(a, b) {
        // 返回 a·b：先应用 b，再应用 a
        var m = new Float32Array(16);
        for (var c = 0; c < 4; c++) {
            for (var r = 0; r < 4; r++) {
                m[c * 4 + r] =
                    a[r] * b[c * 4] +
                    a[4 + r] * b[c * 4 + 1] +
                    a[8 + r] * b[c * 4 + 2] +
                    a[12 + r] * b[c * 4 + 3];
            }
        }
        return m;
    }

    function mTranslate(x, y, z) {
        var m = identity();
        m[12] = x; m[13] = y; m[14] = z;
        return m;
    }

    function mScale(x, y, z) {
        var m = identity();
        m[0] = x; m[5] = y; m[10] = z;
        return m;
    }

    function mRotX(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
        return m;
    }

    function mRotY(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
        return m;
    }

    function mRotZ(a) {
        var c = Math.cos(a), s = Math.sin(a), m = identity();
        m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
        return m;
    }

    function mPerspective(fovy, aspect, near, far) {
        var f = 1 / Math.tan(fovy / 2);
        var nf = 1 / (near - far);
        var m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) * nf;
        m[11] = -1;
        m[14] = 2 * far * near * nf;
        return m;
    }

    function mLookAt(eye, center, up) {
        var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
        var l = Math.hypot(zx, zy, zz) || 1;
        zx /= l; zy /= l; zz /= l;

        var xx = up[1] * zz - up[2] * zy;
        var xy = up[2] * zx - up[0] * zz;
        var xz = up[0] * zy - up[1] * zx;
        l = Math.hypot(xx, xy, xz) || 1;
        xx /= l; xy /= l; xz /= l;

        var yx = zy * xz - zz * xy;
        var yy = zz * xx - zx * xz;
        var yz = zx * xy - zy * xx;

        var m = identity();
        m[0] = xx; m[1] = yx; m[2] = zx;
        m[4] = xy; m[5] = yy; m[6] = zy;
        m[8] = xz; m[9] = yz; m[10] = zz;
        m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        return m;
    }

    /** 法线矩阵：只有旋转 + 镜像，所以取旋转部分、镜像轴取反即可（不用求逆）。 */
    function normalMat(model, flipX) {
        var m = new Float32Array(9);
        var sx = flipX ? -1 : 1;
        // model 的左上 3x3 = R·S，S 是对角 (±1,1,1)。
        // 法线要走 R·S⁻¹ = R·S（S 自逆），再除以 sx 归一 —— 直接乘 sx 就够。
        m[0] = model[0] * sx; m[1] = model[1] * sx; m[2] = model[2] * sx;
        m[3] = model[4]; m[4] = model[5]; m[5] = model[6];
        m[6] = model[8]; m[7] = model[9]; m[8] = model[10];
        return m;
    }

    /* ============================== 着色器 ============================== */

    var VS = [
        'attribute vec3 aPos;',
        'attribute vec3 aNormal;',
        'attribute vec2 aUV;',
        'uniform mat4 uProj;',
        'uniform mat4 uView;',
        'uniform mat4 uModel;',
        'uniform mat3 uNormalMat;',
        'varying vec2 vUV;',
        'varying vec3 vN;',
        'varying vec3 vWorld;',
        'void main() {',
        '  vec4 wp = uModel * vec4(aPos, 1.0);',
        '  vWorld = wp.xyz;',
        '  vN = normalize(uNormalMat * aNormal);',
        '  vUV = aUV;',
        '  gl_Position = uProj * uView * wp;',
        '}'
    ].join('\n');

    var FS = [
        'precision mediump float;',
        'varying vec2 vUV;',
        'varying vec3 vN;',
        'varying vec3 vWorld;',
        'uniform sampler2D uTex;',
        'uniform float uUseTex;',
        'uniform vec3 uColor;',
        'uniform vec3 uEye;',
        'uniform float uHover;',
        'uniform float uFlat;',
        'void main() {',
        '  vec3 base = mix(uColor, texture2D(uTex, vUV).rgb, uUseTex);',
        // 主光从左上前方来
        '  vec3 L = normalize(vec3(-0.45, 0.86, 0.55));',
        '  float diff = max(dot(normalize(vN), L), 0.0);',
        // 顶面贴的是图纸本身：颜色必须跟 2D 看到的完全一致，所以几乎不打光
        // （早期版本让它跟侧面一起吃光照，白底被压成灰底、豆子全暗一档，
        //   用户拿 3D 判断颜色就会判错——这个视图的第一职责是看清，不是好看）
        '  float lit = (uUseTex > 0.5) ? 1.0 : (0.62 + 0.38 * diff);',
        // 侧面越远越淡一点，给一点纵深
        '  float d = length(vWorld - uEye);',
        '  lit *= 1.0 - clamp((d - 200.0) / 900.0, 0.0, 0.10);',
        '  vec3 col = base * lit;',
        '  col += uHover * vec3(0.10, 0.13, 0.22);',
        // uFlat=1：选中框那种纯色线，不吃光照
        '  col = mix(col, uColor, uFlat);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    function compile(gl, type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('shader: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    /* ============================== 几何 ============================== */

    /**
     * 一块板的几何：顶面 + 4 个侧面。
     * 本地空间：x∈[-w/2,w/2]，y∈[0,THICK]，z∈[-h/2,h/2]；原点在板中心的地面。
     * 返回 { data: Float32Array, topCount, sideOffset(顶点数) }
     * 布局：pos(3) normal(3) uv(2) → 8 floats/顶点
     */
    function buildBoard(w, h) {
        var hw = w / 2, hh = h / 2, t = THICK;
        var v = [];
        function push(px, py, pz, nx, ny, nz, u, uv2) {
            v.push(px, py, pz, nx, ny, nz, u, uv2);
        }
        // ---- 顶面（两个三角）----
        // 绕序必须让 (b-a)×(c-a) 指向 +y，否则被 CULL_FACE 当背面剔掉 ——
        // 表现是「只看得见一圈侧壁、图完全没有」，而且不报任何错。
        // 另外 z 越负越靠上，所以 UV 的 v 在 z=-hh 处为 1。
        push(-hw, t, -hh, 0, 1, 0, 0, 1);
        push(-hw, t, hh, 0, 1, 0, 0, 0);
        push(hw, t, hh, 0, 1, 0, 1, 0);

        push(-hw, t, -hh, 0, 1, 0, 0, 1);
        push(hw, t, hh, 0, 1, 0, 1, 0);
        push(hw, t, -hh, 0, 1, 0, 1, 1);

        var topCount = 6;

        // ---- 侧面（4 个，法线朝外）----
        // 前 (+z)
        push(-hw, 0, hh, 0, 0, 1, 0, 0);
        push(hw, 0, hh, 0, 0, 1, 1, 0);
        push(hw, t, hh, 0, 0, 1, 1, 1);
        push(-hw, 0, hh, 0, 0, 1, 0, 0);
        push(hw, t, hh, 0, 0, 1, 1, 1);
        push(-hw, t, hh, 0, 0, 1, 0, 1);
        // 后 (-z)
        push(hw, 0, -hh, 0, 0, -1, 0, 0);
        push(-hw, 0, -hh, 0, 0, -1, 1, 0);
        push(-hw, t, -hh, 0, 0, -1, 1, 1);
        push(hw, 0, -hh, 0, 0, -1, 0, 0);
        push(-hw, t, -hh, 0, 0, -1, 1, 1);
        push(hw, t, -hh, 0, 0, -1, 0, 1);
        // 右 (+x)
        push(hw, 0, hh, 1, 0, 0, 0, 0);
        push(hw, 0, -hh, 1, 0, 0, 1, 0);
        push(hw, t, -hh, 1, 0, 0, 1, 1);
        push(hw, 0, hh, 1, 0, 0, 0, 0);
        push(hw, t, -hh, 1, 0, 0, 1, 1);
        push(hw, t, hh, 1, 0, 0, 0, 1);
        // 左 (-x)
        push(-hw, 0, -hh, -1, 0, 0, 0, 0);
        push(-hw, 0, hh, -1, 0, 0, 1, 0);
        push(-hw, t, hh, -1, 0, 0, 1, 1);
        push(-hw, 0, -hh, -1, 0, 0, 0, 0);
        push(-hw, t, hh, -1, 0, 0, 1, 1);
        push(-hw, t, -hh, -1, 0, 0, 0, 1);

        return {
            data: new Float32Array(v),
            topCount: topCount,
            sideCount: v.length / 8 - topCount
        };
    }

    /** 单位立方体的 12 条棱（选中框用）。pos(3)+normal(3)+uv(2)，跟板同一套顶点布局。 */
    function buildUnitBoxLines() {
        var c = [
            [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5],
            [-.5, .5, -.5], [.5, .5, -.5], [.5, .5, .5], [-.5, .5, .5]
        ];
        var E = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];
        var v = [];
        E.forEach(function (e) {
            [c[e[0]], c[e[1]]].forEach(function (p) {
                v.push(p[0], p[1], p[2], 0, 1, 0, 0, 0);
            });
        });
        return v;
    }

    /* ============================== 主体 ============================== */
    function Editor3D(canvas) {
        var opts = { alpha: true, antialias: true, premultipliedAlpha: false };
        var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
        if (!gl) throw new Error('no webgl');

        this.canvas = canvas;
        this.gl = gl;

        var p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error('link: ' + gl.getProgramInfoLog(p));
        }
        this.prog = p;
        this.loc = {
            aPos: gl.getAttribLocation(p, 'aPos'),
            aNormal: gl.getAttribLocation(p, 'aNormal'),
            aUV: gl.getAttribLocation(p, 'aUV'),
            uProj: gl.getUniformLocation(p, 'uProj'),
            uView: gl.getUniformLocation(p, 'uView'),
            uModel: gl.getUniformLocation(p, 'uModel'),
            uNormalMat: gl.getUniformLocation(p, 'uNormalMat'),
            uTex: gl.getUniformLocation(p, 'uTex'),
            uUseTex: gl.getUniformLocation(p, 'uUseTex'),
            uColor: gl.getUniformLocation(p, 'uColor'),
            uEye: gl.getUniformLocation(p, 'uEye'),
            uHover: gl.getUniformLocation(p, 'uHover'),
            uFlat: gl.getUniformLocation(p, 'uFlat')
        };

        // 选中框：一个以原点为中心的单位立方体线框，按每块板的尺寸缩放后画在板外层
        this.boxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buildUnitBoxLines()), gl.STATIC_DRAW);

        this.items = new Map();     // id -> { id, w, h, buf, tex, hasTex, local, cx, cz }
        this.hoverId = null;
        this.selectedId = null;

        // 相机：绕 target 的球面机位。默认斜上方俯视，能同时看见顶面和一点厚度
        this.yaw = -0.42;
        this.pitch = 0.62;
        this.dist = 120;
        this.target = [0, 0, 0];
        this.fov = 34 * Math.PI / 180;

        this._raf = 0;
        this._last = 0;
        this._dirty = true;
        this.onPick = null;

        this._bindEvents();
        this.resize();
    }

    Editor3D.prototype = {

        /* ---------------- 实例管理 ---------------- */

        /**
         * 增/改一块板。w/h 变了会重建几何；传 texture 会重新上传纹理。
         * @param {number} id
         * @param {{w:number,h:number,cx:number,cz:number,local:object}} info  cx/cz = 2D 世界坐标推出的板心
         * @param {HTMLCanvasElement} [texture]
         */
        setInstance(id, info, texture) {
            var gl = this.gl;
            var it = this.items.get(id);
            if (!it) {
                it = { id: id, w: 0, h: 0, buf: gl.createBuffer(), tex: gl.createTexture(), hasTex: false };
                this.items.set(id, it);
            }

            if (it.w !== info.w || it.h !== info.h) {
                var g = buildBoard(info.w, info.h);
                gl.bindBuffer(gl.ARRAY_BUFFER, it.buf);
                gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW);
                it.topCount = g.topCount;
                it.sideCount = g.sideCount;
                it.w = info.w;
                it.h = info.h;
            }

            it.cx = info.cx;
            it.cz = info.cz;
            it.local = info.local || { pos: [0, 0, 0], rot: [0, 0, 0], flipX: false };

            if (texture) this._uploadTex(it, texture);
            this._dirty = true;
            return it;
        },

        removeInstance(id) {
            var it = this.items.get(id);
            if (!it) return;
            this.gl.deleteBuffer(it.buf);
            this.gl.deleteTexture(it.tex);
            this.items.delete(id);
            this._dirty = true;
        },

        clear() {
            Array.from(this.items.keys()).forEach(id => this.removeInstance(id));
            this._dirty = true;
        },

        _uploadTex(it, src) {
            var gl = this.gl;
            gl.bindTexture(gl.TEXTURE_2D, it.tex);
            // canvas 第一行在上 → 翻过来，让 v=1 对应顶面画面上方
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            // 缩小时必须走 mipmap，否则 104 格的板缩到屏幕一两百像素会满屏摩尔纹
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            // 斜看时靠各向异性把细节拉回来，没有就退回三线性
            var aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
            if (aniso) {
                var max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
                gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
            }
            it.hasTex = true;
        },

        /* ---------------- 相机 ---------------- */

        frameAll() {
            var items = Array.from(this.items.values());
            if (!items.length) {
                this.target = [0, 0, 0];
                this.dist = 90;
                this._dirty = true;
                return;
            }
            var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            items.forEach(it => {
                var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
                var cx = it.cx + p[0], cz = it.cz + p[2];
                // 用长边的一半（不用对角线）：对角线会把包围盒撑大 40%，
                // 多块板一起 frame 时整组会缩得比实际小一圈，画面四周全是空的
                var r = Math.max(it.w, it.h) / 2 * 1.08;   // 1.08 给旋转留点余量
                x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r);
                z0 = Math.min(z0, cz - r); z1 = Math.max(z1, cz + r);
            });
            this.target = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
            var span = Math.max(x1 - x0, z1 - z0, 12);
            // 竖屏时水平视野更窄，按宽高比放大距离
            var aspect = Math.max(0.45, (this.canvas.width || 1) / (this.canvas.height || 1));
            var fitH = span / (2 * Math.tan(this.fov / 2));
            var fitW = span / (2 * Math.tan(this.fov / 2) * Math.min(1, aspect));
            this.dist = Math.max(fitH, fitW) * 1.14 + 8;
            this._dirty = true;
            this.render();
        },

        focusItem(id) {
            var it = this.items.get(id);
            if (!it) return;
            var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
            this.target = [it.cx + p[0], 0, it.cz + p[2]];
            var span = Math.max(it.w, it.h, 8);
            this.dist = span / (2 * Math.tan(this.fov / 2)) * 1.55 + 6;
            this._dirty = true;
            this.render();
        },

        resetCamera() {
            this.yaw = -0.42;
            this.pitch = 0.62;
            this.frameAll();
        },

        /* ---------------- 事件 ---------------- */

        _bindEvents() {
            var c = this.canvas;
            var self = this;
            var mode = null;        // 'orbit' | 'pan'
            var lastX = 0, lastY = 0, moved = 0;

            c.style.touchAction = 'none';
            c.style.cursor = 'grab';

            c.addEventListener('contextmenu', e => e.preventDefault());

            c.addEventListener('pointerdown', e => {
                c.setPointerCapture && c.setPointerCapture(e.pointerId);
                lastX = e.clientX; lastY = e.clientY;
                moved = 0;
                // 右/中键平移；左键旋转
                mode = (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
                c.style.cursor = mode === 'pan' ? 'move' : 'grabbing';
            });

            c.addEventListener('pointermove', e => {
                if (!mode) {
                    self._hoverAt(e);
                    return;
                }
                var dx = e.clientX - lastX, dy = e.clientY - lastY;
                lastX = e.clientX; lastY = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);

                if (mode === 'orbit') {
                    self.yaw += dx * 0.008;
                    // 只允许从上方看（0.22 ~ 1.45 弧度）。
                    // 场景就是一堆水平放的板，允许拖到 0 或负数的话，
                    // 板会变成一条看不见的窄边 —— 用户会以为东西没了。
                    self.pitch = Math.max(0.22, Math.min(1.45, self.pitch + dy * 0.008));
                } else {
                    self._panBy(dx, dy);
                }
                self._dirty = true;
            });

            var end = function (e) {
                if (!mode) return;
                var wasPanning = mode === 'pan';
                mode = null;
                c.style.cursor = 'grab';
                // 没拖动 = 一次点击 → 拾取
                if (moved < 5 && !wasPanning && e && typeof e.clientX === 'number') {
                    self._pickAt(e.clientX, e.clientY);
                }
            };
            c.addEventListener('pointerup', end);
            c.addEventListener('pointercancel', () => { mode = null; c.style.cursor = 'grab'; });

            c.addEventListener('pointerleave', () => {
                if (self.hoverId !== null) { self.hoverId = null; self._dirty = true; }
            });

            c.addEventListener('wheel', e => {
                e.preventDefault();
                var k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
                self.dist = Math.max(4, Math.min(4000, self.dist * k));
                self._dirty = true;
            }, { passive: false });

            c.addEventListener('dblclick', () => self.resetCamera());
        },

        _panBy(dx, dy) {
            // 只平移 xz 平面（像拖动一张桌子），不改 target 高度：
            // 允许上下平移的话，用户很容易把场景推出画面还找不回来
            var k = this.dist * 0.0016;
            var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
            // right = (cy, 0, -sy)：屏幕向右的世界方向
            // fwd   = (-sy, 0, -cy)：屏幕上方向在水平面的投影
            this.target[0] -= (dx * cy + dy * -sy) * k;
            this.target[2] -= (dx * -sy + dy * -cy) * k;
            this._dirty = true;
        },

        _eye() {
            var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            return [
                this.target[0] + this.dist * cp * Math.sin(this.yaw),
                this.target[1] + this.dist * sp,
                this.target[2] + this.dist * cp * Math.cos(this.yaw)
            ];
        },

        /**
         * 世界点 → 屏幕像素（相对 canvas 左上角，CSS px）。
         * 拾取反算、3D 里摆文字标签都要用；测试也靠它算点击位置。
         */
        project(p) {
            var c = this.canvas;
            var eye = this._eye();
            var proj = mPerspective(this.fov, (c.width || 1) / (c.height || 1), 0.5, 6000);
            var view = mLookAt(eye, this.target, [0, 1, 0]);
            var m = mul(proj, view);
            var x = p[0], y = p[1], z = p[2];
            var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
            var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
            var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
            if (Math.abs(cw) < 1e-9) return null;
            var dpr = this.dpr || 1;
            return {
                x: (cx / cw + 1) / 2 * (c.width / dpr),
                y: (1 - cy / cw) / 2 * (c.height / dpr),
                z: cw
            };
        },

        /**
         * 把屏幕点投成射线，跟每块板的顶面（y=THICK）求交，取最近命中的那块。
         * @param {boolean} [silent] 只返回命中 id，不改选中态、不触发回调（悬停用）
         */
        _pickAt(clientX, clientY, silent) {
            if (!this.onPick && !silent) return null;
            var r = this.canvas.getBoundingClientRect();
            var nx = ((clientX - r.left) / r.width) * 2 - 1;
            var ny = 1 - ((clientY - r.top) / r.height) * 2;

            var eye = this._eye();
            // 视线基向量必须跟 mLookAt 同一套推导，不能自己另推一遍：
            // mLookAt 里 z = normalize(eye - center)（指向相机后方），
            // 而这里若用 f = center - eye 再拿 (f.z,0,-f.x) 当 right，符号正好差一个负号，
            // 结果是「射线左右镜像」，点左边那块选中右边那块，且不报任何错。
            var zx = eye[0] - this.target[0];
            var zy = eye[1] - this.target[1];
            var zz = eye[2] - this.target[2];
            var zl = Math.hypot(zx, zy, zz) || 1;
            zx /= zl; zy /= zl; zz /= zl;

            // right = normalize(worldUp × z)
            var rx = zz, rz = -zx;
            var rl = Math.hypot(rx, rz) || 1;
            rx /= rl; rz /= rl;
            // up = z × right
            var ux = zy * rz - zz * 0;
            var uy = zz * rx - zx * rz;
            var uz = zx * 0 - zy * rx;
            // 视线朝前 = -z
            var fx = -zx, fy = -zy, fz = -zz;

            var aspect = (this.canvas.width || 1) / (this.canvas.height || 1);
            var th = Math.tan(this.fov / 2);
            var dir = [
                fx + rx * nx * th * aspect + ux * ny * th,
                fy + 0 * nx * th * aspect + uy * ny * th,
                fz + rz * nx * th * aspect + uz * ny * th
            ];

            var best = null, bestT = Infinity;
            this.items.forEach(function (it) {
                var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
                var cx = it.cx + p[0], cz = it.cz + p[2];
                var planeY = THICK + p[1];
                if (Math.abs(dir[1]) < 1e-6) return;
                var t = (planeY - eye[1]) / dir[1];
                if (t <= 0 || t >= bestT) return;
                var hx = eye[0] + dir[0] * t - cx;
                var hz = eye[2] + dir[2] * t - cz;
                // 只对绕 Y 做逆旋转。拾取是按「顶面」近似求交的，X/Z 那点倾角
                // 带来的偏差在一格以内，不值得为它引一套完整的射线-OBB 求交。
                var rot = (it.local && it.local.rot) || [0, 0, 0];
                var cc = Math.cos(-(rot[1] || 0)), ss = Math.sin(-(rot[1] || 0));
                var qx = hx * cc + hz * ss;
                var qz = -hx * ss + hz * cc;
                if (it.local && it.local.flipX) qx = -qx;
                if (Math.abs(qx) <= it.w / 2 && Math.abs(qz) <= it.h / 2) {
                    bestT = t;
                    best = it.id;
                }
            });

            if (silent) return best;
            this.selectedId = best;
            this.onPick(best);
            this._dirty = true;
            return best;
        },

        _hoverAt(e) {
            if (!this.onPick) return;
            var before = this.hoverId;
            var id = this._pickAt(e.clientX, e.clientY, true);
            this.hoverId = id;
            if (id !== before) this._dirty = true;
        },

        /* ---------------- 渲染 ---------------- */

        resize() {
            var c = this.canvas;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(1, Math.round(c.clientWidth * dpr));
            var h = Math.max(1, Math.round(c.clientHeight * dpr));
            if (c.width !== w || c.height !== h) {
                c.width = w;
                c.height = h;
            }
            this.dpr = dpr;
        },

        start() {
            if (this._raf) return;
            var self = this;
            // 没有持续动画（自转已去掉）：只在 dirty 时出一帧。
            // 静止时这个 rAF 几乎是空转，比按 60fps 重画整场景省得多。
            var tick = function () {
                if (self._dirty) self.render();
                self._raf = requestAnimationFrame(tick);
            };
            this._raf = requestAnimationFrame(tick);
        },

        stop() {
            if (this._raf) cancelAnimationFrame(this._raf);
            this._raf = 0;
            this._last = 0;
        },

        dispose() {
            this.stop();
            this.clear();
            var gl = this.gl;
            gl.deleteBuffer(this.boxBuf);
            gl.deleteProgram(this.prog);
        },

        render() {
            var gl = this.gl;
            var c = this.canvas;
            if (!c.clientWidth || !c.clientHeight) { this._dirty = false; return; }
            this.resize();

            gl.viewport(0, 0, c.width, c.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);

            var eye = this._eye();
            var proj = mPerspective(this.fov, c.width / c.height, 0.5, 6000);
            var view = mLookAt(eye, this.target, [0, 1, 0]);

            gl.useProgram(this.prog);
            var L = this.loc;
            gl.uniformMatrix4fv(L.uProj, false, proj);
            gl.uniformMatrix4fv(L.uView, false, view);
            gl.uniform3fv(L.uEye, new Float32Array(eye));
            gl.uniform1i(L.uTex, 0);
            gl.activeTexture(gl.TEXTURE0);

            var self = this;
            gl.uniform1f(L.uFlat, 0.0);

            this.items.forEach(function (it) {
                var model = self._modelOf(it);
                gl.uniformMatrix4fv(L.uModel, false, model);
                gl.uniformMatrix3fv(L.uNormalMat, false, normalMat(model, !!(it.local && it.local.flipX)));

                var hover = (it.id === self.selectedId) ? 1.0 :
                    (it.id === self.hoverId ? 0.45 : 0.0);
                gl.uniform1f(L.uHover, hover);

                gl.bindBuffer(gl.ARRAY_BUFFER, it.buf);
                gl.enableVertexAttribArray(L.aPos);
                gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 32, 0);
                gl.enableVertexAttribArray(L.aNormal);
                gl.vertexAttribPointer(L.aNormal, 3, gl.FLOAT, false, 32, 12);
                gl.enableVertexAttribArray(L.aUV);
                gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 32, 24);

                // 顶面：贴图
                gl.bindTexture(gl.TEXTURE_2D, it.tex);
                gl.uniform1f(L.uUseTex, it.hasTex ? 1 : 0);
                gl.uniform3f(L.uColor, 0.93, 0.93, 0.95);
                gl.drawArrays(gl.TRIANGLES, 0, it.topCount);

                // 侧面：纯色（板边），比顶面暗一档，看得出厚度
                gl.uniform1f(L.uUseTex, 0.0);
                gl.uniform3f(L.uColor, 0.78, 0.79, 0.83);
                gl.drawArrays(gl.TRIANGLES, it.topCount, it.sideCount);
            });

            // ---- 选中框 ----
            // 只靠给板加一点自发光根本看不出来（尤其白底图纸）。
            // 画一圈比板略大的洋红线框，选中哪块一眼就认得。
            if (this.selectedId !== null) {
                var sit = this.items.get(this.selectedId);
                if (sit) {
                    // 放大 1.6% + 抬高 0.02：跟板面共面会 z-fighting，边线一闪一闪的
                    var boxModel = mul(this._modelOf(sit), mScale(sit.w * 1.016, THICK * 1.6 + 0.6, sit.h * 1.016));
                    boxModel = mul(boxModel, mTranslate(0, 0.5, 0));
                    gl.uniformMatrix4fv(L.uModel, false, boxModel);
                    gl.uniformMatrix3fv(L.uNormalMat, false, normalMat(boxModel, false));
                    gl.uniform1f(L.uHover, 0.0);
                    gl.uniform1f(L.uUseTex, 0.0);
                    gl.uniform1f(L.uFlat, 1.0);
                    gl.uniform3f(L.uColor, 0.42, 0.30, 0.95);

                    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
                    gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 32, 0);
                    gl.vertexAttribPointer(L.aNormal, 3, gl.FLOAT, false, 32, 12);
                    gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 32, 24);
                    // 线框不该被板自己挡住后面那几条棱 → 关掉深度测试反而更像"套框"
                    gl.disable(gl.DEPTH_TEST);
                    gl.drawArrays(gl.LINES, 0, 24);
                    gl.enable(gl.DEPTH_TEST);
                }
            }

            this._dirty = false;
        },

        /** 实例的世界矩阵：T(2D 位置 + local 偏移) · Ry · Rx · Rz · 镜像 */
        _modelOf(it) {
            var p = it.local && it.local.pos ? it.local.pos : [0, 0, 0];
            var rot = (it.local && it.local.rot) || [0, 0, 0];
            var model = mTranslate(it.cx + p[0], p[1], it.cz + p[2]);
            model = mul(model, mRotY(rot[1] || 0));
            model = mul(model, mRotX(rot[0] || 0));
            model = mul(model, mRotZ(rot[2] || 0));
            if (it.local && it.local.flipX) model = mul(model, mScale(-1, 1, 1));
            return model;
        }
    };

    Editor3D.THICK = THICK;
    Editor3D.MAX_TEX = MAX_TEX;
    window.Editor3D = Editor3D;
})();
