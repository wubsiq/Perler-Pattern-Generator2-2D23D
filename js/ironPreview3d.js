/**
 * IronPreview3D — 拼豆成品的 3D 旋转预览
 *
 * ============================================================
 *  【为什么是 WebGL，而不是给 2D 画布套一个 CSS 3D 变换】
 * ============================================================
 *  1. 真要能"翻面"看到背面 —— 扁平的 CSS 4x4 变换在接近 90° 时会消失成一条线，
 *     没有厚度就没有说服力。拼豆成品是「一块 5mm 厚的塑料板」，翻到侧面应该
 *     看到一条有厚度的边，不是一张纸。
 *  2. 闪光晶体要"转动时部分反光" —— 这本质上是一个镜面反射问题：
 *     每颗晶体是一个随机朝向的小平面，只有法线正好把光源镜像到你眼睛的那几颗
 *     才会亮起来。2D 画布里没有法线，做不出"一部分亮、一部分不亮"。
 *
 * ============================================================
 *  【怎么做出厚度：正面贴图 + 背面贴图 + 真正挤出的一条"包边"侧壁】
 * ============================================================
 *  取已经渲染好的 2D 成品位图（含所有烫法纹理 + 格线 + 光照）当贴图，
 *  前后各铺一张当正/背面，中间用一条沿图案外轮廓生成的**挤出条带**连起来。
 *
 *  v1 是"沿 z 复制 K 层平面切片"凑厚度 —— 正面/背面看着没问题，但侧着一看
 *  是 K 条平行的竖线（9 层 = 9 条纹），一眼就露馅。所以这里换成真几何：
 *    · 轮廓从 perlerColors 里算：每颗豆子朝外的那几条边（外露面）
 *    · 每条边沿"厚度方向"拉出一圈截面：两端略微缩进（藏到正面/背面板底下），
 *      中间鼓出去 —— 这就是包边，边缘不再是被切刀切平的直角，而是滚圆的塑料边
 *    · 沿"边的方向"按一颗豆子的宽度做一次收放：相邻两颗豆子交界处收一点，
 *      形成一颗一颗的串珠感（跟实物拼豆侧面一模一样）
 *    · 每个顶点自带法线 → 塑料高光会随着转动在这条圆边上滑过去，
 *      这正是"包边做得好"和"糊一层灰边"的区别
 *
 *  【闪光晶体】
 *  晶体点阵由 2D 那边生成（同一把"粉"，坐标以格为单位），这里只负责：
 *    每颗给一个随机微面法线 → shader 里算 R = reflect(-V, N)，spec = dot(R, L)
 *    → 只有 spec 高的那几颗亮起来并放大星芒，其余保持很淡的漫反射。
 *  所以转动时是"一部分晶体闪、一部分暗"，而不是整片一起明暗。
 */
(function () {
    'use strict';

    const VS_PLATE = `
attribute vec2 aPos;
attribute vec2 aUV;
uniform mat4 uMVP;
uniform float uZ;
varying vec2 vUV;
void main() {
    vUV = aUV;
    gl_Position = uMVP * vec4(aPos, uZ, 1.0);
}`;

    const FS_PLATE = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uRim;
uniform sampler2D uMask;
uniform float uRimMix;
uniform float uShade;
uniform float uUseMask;
void main() {
    // 轮廓遮罩：正面/背面只保留包边那条光滑闭环以内的像素。
    // 不裁的话，贴图自己的豆子方块台阶会露在侧壁外面，包边就白做了。
    // ★ 用 smoothstep 过渡而不是硬 discard：硬切出来的边是一圈锯齿。
    float mk = 1.0;
    if (uUseMask > 0.5) mk = smoothstep(0.25, 0.62, texture2D(uMask, vUV).a);
    vec4 a = texture2D(uTex, vUV);
    vec4 b = texture2D(uRim, vUV);
    vec4 t = mix(a, b, uRimMix);
    float al = t.a * mk;
    if (al < 0.02) discard;
    gl_FragColor = vec4(t.rgb * uShade, al);
}`;

    // ---------- 包边侧壁：真几何 + 逐顶点法线 + 顶点色 ----------
    //  颜色不走贴图，而是 2D 那边按轮廓点所属的豆子直接给的纯色。
    //  ★ 为什么不采样贴图：贴图里豆子之间有缝（alpha 接近 0），侧壁一旦采到缝就被
    //    discard 掉，一圈侧壁会碎成一段一段的（像挂了一串小圆环）。
    //    顺带还免了斜视时 mipmap 把侧壁糊成一团的问题。
    const VS_RIM = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform mat3 uRot;
uniform vec2 uScale;
uniform vec3 uCam;
uniform vec3 uLight;
uniform vec3 uLight2;
varying vec3 vColor;
varying float vDiff;
varying float vSpec;
void main() {
    vColor = aColor;
    // 顶点位置直接送 MVP（里面已含 model 旋转），Pw 只用来算光照
    vec3 Pw = uRot * vec3(aPos.xy * uScale, aPos.z);
    vec3 Nw = normalize(uRot * aNormal);
    vec3 V = normalize(uCam - Pw);
    float d1 = max(dot(Nw, normalize(uLight)), 0.0);
    float d2 = max(dot(Nw, normalize(uLight2)), 0.0);
    vDiff = 0.46 + 0.42 * d1 + 0.22 * d2;
    // 塑料高光：两盏灯各一个窄瓣。圆边上的法线连续变化，
    // 所以任何时候都只有一小段边缘被打亮 —— 转起来才像真的塑料。
    vec3 R1 = reflect(-V, Nw);
    float s1 = pow(max(dot(R1, normalize(uLight)), 0.0), 26.0);
    float s2 = pow(max(dot(R1, normalize(uLight2)), 0.0), 26.0);
    vSpec = 0.55 * s1 + 0.24 * s2;
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

    const FS_RIM = `
precision mediump float;
varying vec3 vColor;
varying float vDiff;
varying float vSpec;
void main() {
    vec3 c = vColor * vDiff + vec3(vSpec);
    gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
}`;

    const VS_POINT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform mat4 uMVP;
uniform mat3 uRot;
uniform vec3 uCam;
uniform vec2 uScale;
uniform vec3 uLight;
uniform vec3 uLight2;
uniform float uBaseSize;
uniform float uTime;
uniform float uSide;
uniform float uHalfT;
varying vec3 vColor;
varying float vBright;
void main() {
    vec3 p = aPos;
    p.z += uSide * uHalfT;
    // 背面那批晶体的微面法线要跟着翻过去，否则背面的反光方向是错的
    vec3 nl = vec3(aNormal.xy, aNormal.z * uSide);
    // ★ Pw 只用来算光照；顶点位置直接送 MVP —— uMVP 里已经含 model(旋转)，
    //   这里再乘一次 uRot 就等于转了两次，晶体整片跑到成品外面去了。
    vec3 Pw = uRot * vec3(p.xy * uScale, p.z);
    vec3 Nw = normalize(uRot * nl);
    vec3 V = normalize(uCam - Pw);
    vec3 R = reflect(-V, Nw);
    // 两盏灯：单灯时成品转过 ~50° 之后，那盏灯镜像进眼睛的方向落到
    // 微面倾角分布之外，整层会"一起暗掉"（像被人关了灯）。两盏错开方向的灯
    // 保证任何转角下都有一批晶体恰好对上 —— 这才是实拍里"一直有一部分在闪"。
    float d1 = max(dot(R, normalize(uLight)), 0.0);
    float d2 = max(dot(R, normalize(uLight2)), 0.0);
    // 两个波瓣：窄的负责"某几颗突然爆亮"，宽的负责整体的丝绒般光泽。
    // 只用一个高次幂的话，同一时刻亮的晶体太少，看起来像零星的噪点而不是闪。
    float spec = 0.72 * (pow(d1, 46.0) + 0.55 * pow(d2, 46.0))
               + 0.28 * (pow(d1, 7.0) + 0.45 * pow(d2, 7.0));
    // 呼吸式微闪（不同相位），避免整层同步闪烁
    float tw = 0.74 + 0.26 * sin(uTime * 2.1 + aPhase * 6.2831);
    // ★ 底光不能太低：0.08 试过，不反光的那 9 成晶体基本看不见，
    //   整层只剩零星几个亮点，像屏幕上的坏点。0.34 才接近 2D 那边撒出来的"粉感"。
    vBright = (0.34 + 0.66 * spec) * tw;
    vColor = aColor;
    gl_Position = uMVP * vec4(p, 1.0);
    float sz = uBaseSize * aSize * (0.72 + 2.6 * spec);
    gl_PointSize = max(1.0, sz);
}`;

    const FS_POINT = `precision mediump float;
varying vec3 vColor;
varying float vBright;
uniform float uAlpha;
void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float core = smoothstep(0.32, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.26;
    float rayH = smoothstep(0.5, 0.0, abs(c.y) * 9.0) * smoothstep(0.5, 0.0, abs(c.x));
    float rayV = smoothstep(0.5, 0.0, abs(c.x) * 9.0) * smoothstep(0.5, 0.0, abs(c.y));
    float a = core + halo + (rayH + rayV) * 0.5;
    // ★ 预乘 alpha：混合用 (ONE, ONE) 加色。如果这里直接写 alpha=1.0，
    //   点精灵的整个方形区域（含四角 a≈0）都会把 alpha 通道顶到 1，
    //   合成到页面上就是一片片不透明的黑方块。
    float m = a * vBright * uAlpha;
    gl_FragColor = vec4(vColor * m, m);
}`;

    const TINTS = [[0.77, 0.88, 1.0], [1.0, 1.0, 1.0], [1.0, 0.94, 0.81]];

    // ---- 极简 mat4 / mat3（列主序，跟 WebGL 一致）----
    function perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2);
        const nf = 1 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        ]);
    }
    function mul4(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                    a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return o;
    }
    /** 旋转矩阵（先绕 Y 再绕 X），返回 3x3 列主序 */
    function rot3(yaw, pitch) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        // R = Rx(pitch) * Ry(yaw)
        const m = [
            cy, sp * sy, -cp * sy,
            0, cp, sp,
            sy, -sp * cy, cp * cy
        ];
        return new Float32Array(m);
    }
    function to4(m3) {
        return new Float32Array([
            m3[0], m3[1], m3[2], 0,
            m3[3], m3[4], m3[5], 0,
            m3[6], m3[7], m3[8], 0,
            0, 0, 0, 1
        ]);
    }

    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('shader: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }
    function program(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error('link: ' + gl.getProgramInfoLog(p));
        }
        return p;
    }

    function IronPreview3D(canvas) {
        const opts = { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false };
        const gl2 = canvas.getContext('webgl2', opts);
        const gl = gl2 || canvas.getContext('webgl', opts);
        if (!gl) throw new Error('no webgl');
        this.isGL2 = !!gl2;

        this.canvas = canvas;
        this.gl = gl;
        this.version = gl.getParameter(gl.VERSION) || '';

        this.progPlate = program(gl, VS_PLATE, FS_PLATE);
        this.progPoint = program(gl, VS_POINT, FS_POINT);
        this.progRim = program(gl, VS_RIM, FS_RIM);

        // ---- 平面四边形（两三角）----
        this.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1,
            1, -1, 1, 1,
            1, 1, 1, 0,
            -1, -1, 0, 1,
            1, 1, 1, 0,
            -1, 1, 0, 0
        ]), gl.STATIC_DRAW);

        // 包边几何：位置(3) + 法线(3) + uv(2)
        this.rimBuf = gl.createBuffer();
        this.rimCount = 0;

        this.tex = gl.createTexture();
        this.rimTex = gl.createTexture();
        this.maskTex = gl.createTexture();
        this.texW = 0;
        this.texH = 0;
        this.hasTex = false;

        this.ptBuf = gl.createBuffer();
        this.ptCount = 0;

        // 相机 / 姿态
        this.yaw = 0;
        this.pitch = 0;
        this.zoom = 1;
        this.autoSpin = false;      // 默认停在正面：先看清图案，想看转动再开
        this.spinSpeed = 0.35;          // 弧度/秒
        this.velYaw = 0;
        this.velPitch = 0;
        this.time = 0;
        this.timeScale = 1;
        this.alpha = 0.78;
        this.bg = '#1a1a1a';

        this._raf = 0;
        this._last = 0;
        this._dragging = false;

        this._bindEvents();
        this.resize();
    }

    IronPreview3D.prototype = {

        /**
         * 上传成品贴图。
         * @param {HTMLCanvasElement} front 清晰的正面（2D 那边渲染好的成品层，已裁到图案）
         * @param {HTMLCanvasElement} [rim] 侧墙用的模糊压暗版
         */
        setTexture(front, rim, mask) {
            const gl = this.gl;
            if (!front || !front.width) return;
            const upload = (tex, src) => {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                // 【为什么要 mipmap】贴图 900~4800px，屏幕上只有几百 px。
                // 只开 LINEAR 的话，缩小采样会漏掉大量像素 —— 静止时是摩尔纹，
                // 转动时整片画面会"沙沙"地跳（时间性闪烁，比静止纹更难看）。
                // WebGL2 支持非 2 次幂贴图生成 mipmap，直接开三级线性。
                if (this.isGL2) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                }
            };
            upload(this.tex, front);
            upload(this.rimTex, rim || front);
            // 遮罩只要形状，放大缩小时不能糊出灰边 → 不用 mipmap，直接线性
            if (mask && mask.width) {
                gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                this.hasMask = true;
            } else {
                this.hasMask = false;
            }

            // 斜视时各向异性过滤能把被 mipmap 糊掉的斜向细节拉回来一大截。
            // 不加的话，成品转到 50° 以上就像隔了层毛玻璃。
            const aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
            if (aniso) {
                const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
                const lvl = Math.min(8, max);
                [this.tex, this.rimTex].forEach(tx => {
                    gl.bindTexture(gl.TEXTURE_2D, tx);
                    gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, lvl);
                });
            }
            this.texW = front.width;
            this.texH = front.height;
            this.hasTex = true;
        },

        /**
         * 生成"包边"侧壁：沿图案外轮廓挤出的一圈连续圆边。
         *
         * @param {object} map 裁剪信息 { pad, cell, x0, y0, sw, sh }（与晶体同一套坐标）
         * @param {Array<{pts:Float32Array, rgb:Float32Array}>} loops
         *        外轮廓闭环 + 每个点对应的豆子颜色（都由 2D 那边算好）
         */
        setRim(map, loops) {
            this.rimCount = 0;
            const gl = this.gl;
            if (!gl || !map || !loops || !loops.length) return;
            const { pad, cell, x0, y0, sw, sh } = map;
            // 厚度（世界单位）：约一颗豆。和 setGlitter 用同一公式，
            // 免得闪光层关掉时 halfT 还是上一次的旧值。
            this.halfT = cell * (2 / Math.max(sw, sh)) * 0.45;
            const halfT = this.halfT;

            const T_SEG = 6;       // 沿厚度切几刀（看圆边够了）
            const OFF = 0;         // 轮廓本身已经比豆子外形外扩 0.18 格（见 _ironRimLoops）
            const RMAX = 0.30;     // 最鼓处鼓出一颗豆的多少（= 包边的厚度感）
            // 截面轮廓：t=0 在正面、t=1 在背面。
            // ★ 两端退到 -0.6（= 0.18 格，正好缩到轮廓线以里、被正面贴图盖住），
            //   中间鼓到 1.0。这不是"接缝藏起来"的小技巧，是必需的：
            //   正面贴图的可视边缘在"豆子外形 +0.085 格"（融化鼓起）处，
            //   而轮廓线在 +0.18 格 —— 中间那 0.1 格宽的一圈，贴图是透明的，
            //   全靠侧壁的这段裙边铺在后面，不然正面看就是一圈漏背景的细缝。
            const prof = (t) => -0.6 + 1.6 * Math.pow(Math.sin(Math.PI * t), 0.55);

            // 格坐标（连续）→ 贴图四边形局部坐标
            const LX = (cx) => ((pad + cx * cell - x0) / sw - 0.5) * 2;
            const LY = (cy) => (0.5 - (pad + cy * cell - y0) / sh) * 2;
            const CXL = 2 * cell / sw, CYL = -2 * cell / sh;   // 1 格 = 局部多少（y 反向）

            let total = 0;
            loops.forEach(o => { total += o.pts.length / 2; });
            const data = new Float32Array(total * T_SEG * 6 * 9);
            let o = 0;

            const NX = [], NY = [], NZ = [], NU = [], NV = [];
            const NOutX = [], NOutY = [], ARC = [];

            for (let li = 0; li < loops.length; li++) {
                const pts = loops[li].pts, rgb = loops[li].rgb;
                const n = pts.length / 2;
                if (n < 3) continue;

                // ---- 每个轮廓点的外法线（格空间，各向同性）+ 累积弧长 ----
                let arc = 0;
                for (let i = 0; i < n; i++) {
                    const i0 = (i - 1 + n) % n, i1 = (i + 1) % n;
                    let tx = pts[i1 * 2] - pts[i0 * 2];
                    let ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
                    const tl = Math.hypot(tx, ty) || 1;
                    tx /= tl; ty /= tl;
                    // 绕向由 2D 那边统一过：外法线 = (-ty, tx)
                    NOutX[i] = -ty; NOutY[i] = tx;
                    if (i > 0) {
                        arc += Math.hypot(pts[i * 2] - pts[(i - 1) * 2],
                                          pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]);
                    }
                    ARC[i] = arc;
                }

                // ---- 顶点点阵：n × (T_SEG+1) ----
                const cnt = n * (T_SEG + 1);
                const gx = new Float32Array(cnt * 3);
                const gc = new Float32Array(cnt * 3);
                for (let i = 0; i < n; i++) {
                    const bx = pts[i * 2] + NOutX[i] * OFF;
                    const by = pts[i * 2 + 1] + NOutY[i] * OFF;
                    // 每颗豆子只做 4% 的轻微收放：实物烫过之后豆缝是熔平的，
                    // 边是一整片连续的塑料面，只留一点点起伏暗示"这是一颗颗豆子"。
                    const sca = 0.96 + 0.04 * Math.cos(2 * Math.PI * (ARC[i] + 0.5));
                    const cr = rgb ? rgb[i * 3] : 0.7, cg = rgb ? rgb[i * 3 + 1] : 0.7,
                          cb = rgb ? rgb[i * 3 + 2] : 0.7;
                    for (let j = 0; j <= T_SEG; j++) {
                        const t = j / T_SEG;
                        const b = RMAX * prof(t) * sca;
                        const k = i * (T_SEG + 1) + j;
                        gx[k * 3] = LX(bx + NOutX[i] * b);
                        gx[k * 3 + 1] = LY(by + NOutY[i] * b);
                        gx[k * 3 + 2] = halfT * (1 - 2 * t);
                        gc[k * 3] = cr; gc[k * 3 + 1] = cg; gc[k * 3 + 2] = cb;
                    }
                }

                // ---- 法线：对相邻顶点差分求两个切向再叉乘 ----
                //   ★ 朝向必须用"带 z 分量的参考方向"来定，不能只看 xy：
                //     截面两端法线几乎正对镜头（xy≈0），只比 xy 的话正负会被噪声决定，
                //     一条侧壁上就会出现一道亮一道暗的"分层"（看着还以为是切片）。
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j <= T_SEG; j++) {
                        const t = j / T_SEG;
                        const k = i * (T_SEG + 1) + j;
                        const ka = ((i + 1) % n) * (T_SEG + 1) + j;
                        const kb = ((i - 1 + n) % n) * (T_SEG + 1) + j;
                        const kc = i * (T_SEG + 1) + Math.min(T_SEG, j + 1);
                        const kd = i * (T_SEG + 1) + Math.max(0, j - 1);
                        const ux = gx[ka * 3] - gx[kb * 3];
                        const uy = gx[ka * 3 + 1] - gx[kb * 3 + 1];
                        const uz = gx[ka * 3 + 2] - gx[kb * 3 + 2];
                        const vx = gx[kc * 3] - gx[kd * 3];
                        const vy = gx[kc * 3 + 1] - gx[kd * 3 + 1];
                        const vz = gx[kc * 3 + 2] - gx[kd * 3 + 2];
                        let nx = uy * vz - uz * vy;
                        let ny = uz * vx - ux * vz;
                        let nz = ux * vy - uy * vx;
                        const len = Math.hypot(nx, ny, nz);
                        // 参考方向：外法线(xy) + 按厚度位置给的 z。
                        // 正面那半边朝 +z、背面那半边朝 -z —— 圆边本来就是这么卷过去的。
                        const ox = NOutX[i] * CXL, oy = NOutY[i] * CYL;
                        const oz = (0.5 - t) * 12;
                        if (len < 1e-9) {
                            const ol = Math.hypot(ox, oy, oz) || 1;
                            nx = ox / ol; ny = oy / ol; nz = oz / ol;
                        } else {
                            nx /= len; ny /= len; nz /= len;
                            if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
                        }
                        NX[k] = nx; NY[k] = ny; NZ[k] = nz;
                    }
                }

                // ---- 拆三角形（首尾相接，环是闭合的）----
                const emit = (k) => {
                    data[o++] = gx[k * 3]; data[o++] = gx[k * 3 + 1]; data[o++] = gx[k * 3 + 2];
                    data[o++] = NX[k]; data[o++] = NY[k]; data[o++] = NZ[k];
                    data[o++] = gc[k * 3]; data[o++] = gc[k * 3 + 1]; data[o++] = gc[k * 3 + 2];
                };
                for (let i = 0; i < n; i++) {
                    const i2 = (i + 1) % n;
                    for (let j = 0; j < T_SEG; j++) {
                        const a = i * (T_SEG + 1) + j;
                        const b = i2 * (T_SEG + 1) + j;
                        const c = i2 * (T_SEG + 1) + j + 1;
                        const d = i * (T_SEG + 1) + j + 1;
                        emit(a); emit(b); emit(c);
                        emit(a); emit(c); emit(d);
                    }
                }
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, this.rimBuf);
            gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
            this.rimCount = o / 9;
        },

        /**
         * 写入闪光晶体点阵。
         *
         * ★ 坐标必须按"裁剪后的贴图"归一化，不能用 grid 的 cols/rows ——
         *   3D 贴图裁到了图案外接框，网格里空着的行列已经被切掉了。
         *   用 cols/rows 算的话晶体整体会偏移、比例也不对。
         *
         * @param {object} pts 2D 那边的点阵（格为单位）
         * @param {object} map 裁剪信息 { pad, cell, x0, y0, sw, sh }
         * @param {object} p 闪光参数（bright / size）
         */
        setGlitter(pts, map, p) {
            const gl = this.gl;
            if (!pts || !pts.n || !map) { this.ptCount = 0; return; }

            const n = pts.n;
            const data = new Float32Array(n * 11);
            const { pad, cell, x0, y0, sw, sh } = map;
            // 贴图像素 → 世界单位（长边 = 2）
            const wpt = 2 / Math.max(sw, sh);
            // 厚度（世界单位）：成品厚度约一颗豆
            this.halfT = cell * wpt * 0.45;

            for (let i = 0; i < n; i++) {
                const o = i * 11;
                // 格 → 成品层像素 → 裁剪贴图的 uv → 四边形局部坐标 [-1,1]
                const u = (pad + pts.x[i] * cell - x0) / sw;
                const v = (pad + pts.y[i] * cell - y0) / sh;
                data[o] = (u - 0.5) * 2;
                data[o + 1] = (0.5 - v) * 2;
                data[o + 2] = 0;

                // 微面法线：z 分量由倾斜量反推，保证是单位向量
                const nx = pts.nx[i], ny = pts.ny[i];
                const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
                data[o + 3] = nx;
                data[o + 4] = ny;
                data[o + 5] = nz;

                const t = TINTS[pts.tint[i]] || TINTS[1];
                // 颗粒自身的反光系数（多数很暗、少数很亮）直接烘进颜色里：
                // 不然整层会同时亮起来，看着像一整片白霜而不是"一把晶体"
                const alb = 0.30 + 0.70 * (pts.bs ? pts.bs[i] : 1);
                data[o + 6] = t[0] * alb;
                data[o + 7] = t[1] * alb;
                data[o + 8] = t[2] * alb;

                // 粒径：与 2D 同一个公式（格），换算到世界单位；再除以 0.30
                // 是因为精灵图里晶核只占包围盒 30%，gl_PointSize 给的是包围盒
                const diaCells = (0.05 + 0.30 * (p.size || 0.42)) * (pts.r[i] || 1) * (pts.big[i] ? 1.9 : 1);
                data[o + 9] = diaCells * cell * wpt / 0.30;
                data[o + 10] = pts.phase[i];
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            this.ptCount = n;
            this.ptBright = (p.bright !== undefined ? p.bright : 0.7);
        },

        /** 每帧的亮度（闪光层关掉时传 0） */
        setGlitterAlpha(v) { this.alpha = v; },

        setBackground(css) { this.bg = css; },

        /** 舞台尺寸变化时调用（也由内部 ResizeObserver 触发） */
        resize() {
            const c = this.canvas;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(c.clientWidth * dpr));
            const h = Math.max(1, Math.round(c.clientHeight * dpr));
            if (c.width !== w || c.height !== h) {
                c.width = w;
                c.height = h;
            }
            this.dpr = dpr;
        },

        reset() {
            this.yaw = 0;
            this.pitch = 0;
            this.zoom = 1;
            this.velYaw = 0;
            this.velPitch = 0;
            this.autoSpin = true;
        },

        _bindEvents() {
            const c = this.canvas;
            let lastX = 0, lastY = 0, moved = 0;

            c.style.touchAction = 'none';
            c.style.cursor = 'grab';

            c.addEventListener('pointerdown', (e) => {
                this._dragging = true;
                moved = 0;
                lastX = e.clientX; lastY = e.clientY;
                this.velYaw = 0; this.velPitch = 0;
                c.setPointerCapture && c.setPointerCapture(e.pointerId);
                c.style.cursor = 'grabbing';
            });
            c.addEventListener('pointermove', (e) => {
                if (!this._dragging) return;
                const dx = e.clientX - lastX, dy = e.clientY - lastY;
                lastX = e.clientX; lastY = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);
                this._rotateBy(dx, dy);
                this.velYaw = dx * 0.0075;
                this.velPitch = dy * 0.0075;
            });
            const end = () => {
                if (!this._dragging) return;
                this._dragging = false;
                c.style.cursor = 'grab';
                // 甩一下之后惯性地继续转一会儿
                if (moved < 4) { this.velYaw = 0; this.velPitch = 0; }
            };
            c.addEventListener('pointerup', end);
            c.addEventListener('pointercancel', end);
            c.addEventListener('pointerleave', end);

            c.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.zoom = Math.min(2.4, Math.max(0.45, this.zoom * (1 - Math.sign(e.deltaY) * 0.08)));
            }, { passive: false });

            c.addEventListener('dblclick', () => this.reset());
        },

        _rotateBy(dx, dy) {
            this.yaw += dx * 0.0075;
            // 上下翻转限到 ±78°，避免完全颠倒看不出图形
            this.pitch = Math.max(-1.36, Math.min(1.36, this.pitch + dy * 0.0075));
        },

        start() {
            if (this._raf) return;
            const tick = (t) => {
                const dt = this._last ? Math.min(0.05, (t - this._last) / 1000) : 0.016;
                this._last = t;
                this.time += dt * this.timeScale;

                if (!this._dragging) {
                    if (Math.abs(this.velYaw) > 1e-4 || Math.abs(this.velPitch) > 1e-4) {
                        this.yaw += this.velYaw;
                        this.pitch = Math.max(-1.36, Math.min(1.36, this.pitch + this.velPitch));
                        this.velYaw *= 0.94;
                        this.velPitch *= 0.94;
                    } else if (this.autoSpin) {
                        this.yaw += this.spinSpeed * dt;
                    }
                }
                this.render();
                this._raf = requestAnimationFrame(tick);
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
            const gl = this.gl;
            gl.deleteTexture(this.tex);
            gl.deleteTexture(this.maskTex);
            gl.deleteBuffer(this.quad);
            gl.deleteBuffer(this.ptBuf);
            gl.deleteBuffer(this.rimBuf);
        },

        render() {
            const gl = this.gl;
            const W = this.canvas.width, H = this.canvas.height;
            if (!W || !H) return;
            if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.dpr) ||
                this.canvas.height !== Math.round(this.canvas.clientHeight * this.dpr)) {
                this.resize();
            }

            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.BLEND);

            if (!this.hasTex) return;

            const ar = this.texW / this.texH;
            // 四边形顶点固定是 -1..1，按纹理宽高比缩一个方向 → 长边恒为 2
            const sx = ar >= 1 ? 1 : ar;
            const sy = ar >= 1 ? 1 / ar : 1;

            const FOV = 38 * Math.PI / 180;
            const dist = 3.0 / this.zoom;
            const proj = perspective(FOV, this.canvas.width / this.canvas.height, 0.1, 40);
            const rot = rot3(this.yaw, this.pitch);

            const model = to4(rot);
            const view = new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, -dist, 1
            ]);
            const scale = new Float32Array([
                sx, 0, 0, 0,
                0, sy, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ]);
            const mvp = mul4(proj, mul4(view, mul4(model, scale)));

            // 世界单位 → 设备像素（用于 gl_PointSize）
            const pxPerWorld = this.canvas.height / (2 * dist * Math.tan(FOV / 2));

            // ---------- 成品板：背面 + 包边 + 正面 ----------
            const halfT = this.halfT || 0.02;
            gl.useProgram(this.progPlate);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
            const aPosL = gl.getAttribLocation(this.progPlate, 'aPos');
            const aUVL = gl.getAttribLocation(this.progPlate, 'aUV');
            gl.enableVertexAttribArray(aPosL);
            gl.vertexAttribPointer(aPosL, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aUVL);
            gl.vertexAttribPointer(aUVL, 2, gl.FLOAT, false, 16, 8);
            gl.uniformMatrix4fv(gl.getUniformLocation(this.progPlate, 'uMVP'), false, mvp);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            gl.uniform1i(gl.getUniformLocation(this.progPlate, 'uTex'), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.rimTex);
            gl.uniform1i(gl.getUniformLocation(this.progPlate, 'uRim'), 1);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
            gl.uniform1i(gl.getUniformLocation(this.progPlate, 'uMask'), 2);
            gl.uniform1f(gl.getUniformLocation(this.progPlate, 'uUseMask'), this.hasMask ? 1 : 0);

            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(true);

            const uZ = gl.getUniformLocation(this.progPlate, 'uZ');
            const uShade = gl.getUniformLocation(this.progPlate, 'uShade');
            const uRimMix = gl.getUniformLocation(this.progPlate, 'uRimMix');

            // 哪一面朝相机（决定"清晰的那张贴在哪一层"）
            const frontIsPlus = Math.cos(this.yaw) * Math.cos(this.pitch) >= 0;
            const zNear = frontIsPlus ? halfT : -halfT;
            const zFar = -zNear;

            // ---- 背面：就是一张平板（实物烫完背面是平的，比正面再暗一点点）----
            gl.uniform1f(uRimMix, 0);
            gl.uniform1f(uZ, zFar);
            gl.uniform1f(uShade, 0.9);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            // ---- 包边：真正的挤出圆边，替掉原来那 9 层切片 ----
            if (this.rimCount) {
                const R = this.progRim;
                gl.useProgram(R);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.rimBuf);
                const stride = 9 * 4;
                [['aPos', 3, 0], ['aNormal', 3, 12], ['aColor', 3, 24]].forEach(([name, size, off]) => {
                    const loc = gl.getAttribLocation(R, name);
                    if (loc < 0) return;
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
                });
                gl.uniformMatrix4fv(gl.getUniformLocation(R, 'uMVP'), false, mvp);
                gl.uniformMatrix3fv(gl.getUniformLocation(R, 'uRot'), false, rot);
                gl.uniform2f(gl.getUniformLocation(R, 'uScale'), sx, sy);
                gl.uniform3f(gl.getUniformLocation(R, 'uCam'), 0, 0, dist);
                gl.uniform3f(gl.getUniformLocation(R, 'uLight'), -0.45, 0.55, 0.72);
                gl.uniform3f(gl.getUniformLocation(R, 'uLight2'), 0.58, -0.30, 0.76);
                gl.drawArrays(gl.TRIANGLES, 0, this.rimCount);
            }

            // ---- 正面：清晰贴图，往相机方向挪一丝，压过背面板 ----
            gl.useProgram(this.progPlate);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
            gl.enableVertexAttribArray(aPosL);
            gl.vertexAttribPointer(aPosL, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aUVL);
            gl.vertexAttribPointer(aUVL, 2, gl.FLOAT, false, 16, 8);
            gl.uniform1f(uRimMix, 0);
            gl.uniform1f(uZ, zNear + (frontIsPlus ? 1 : -1) * halfT * 0.06);
            gl.uniform1f(uShade, 1.0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            // ---------- 闪光晶体：正反两面各画一遍，靠深度测试只留可见的那面 ----------
            if (this.ptCount && this.alpha > 0.01) {
                gl.useProgram(this.progPoint);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
                const P = this.progPoint;
                const stride = 11 * 4;
                const attrs = [
                    ['aPos', 3, 0], ['aNormal', 3, 12], ['aColor', 3, 24],
                    ['aSize', 1, 36], ['aPhase', 1, 40]
                ];
                attrs.forEach(([name, size, off]) => {
                    const loc = gl.getAttribLocation(P, name);
                    if (loc < 0) return;
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
                });
                gl.uniformMatrix4fv(gl.getUniformLocation(P, 'uMVP'), false, mvp);
                gl.uniformMatrix3fv(gl.getUniformLocation(P, 'uRot'), false, rot);
                gl.uniform2f(gl.getUniformLocation(P, 'uScale'), sx, sy);
                gl.uniform3f(gl.getUniformLocation(P, 'uCam'), 0, 0, dist);
                // 光从左上前方来 —— 偏正面，转到平面时也会有一批晶体正对镜面
                // 主光在左上前方（与 2D 那边的打光方向一致），补光在右下前方
                gl.uniform3f(gl.getUniformLocation(P, 'uLight'), -0.45, 0.55, 0.72);
                gl.uniform3f(gl.getUniformLocation(P, 'uLight2'), 0.58, -0.30, 0.76);
                gl.uniform1f(gl.getUniformLocation(P, 'uBaseSize'), pxPerWorld);
                gl.uniform1f(gl.getUniformLocation(P, 'uTime'), this.time);
                gl.uniform1f(gl.getUniformLocation(P, 'uAlpha'),
                    Math.min(1, this.alpha * (this.ptBright !== undefined ? this.ptBright : 1)));
                gl.uniform1f(gl.getUniformLocation(P, 'uHalfT'), halfT + 0.004);

                gl.blendFunc(gl.ONE, gl.ONE);
                // 先画远的那面，再画近的（虽然深度测试会兜底，但顺序对混合更友好）
                const frontVisible = Math.cos(this.yaw) * Math.cos(this.pitch) >= 0;
                const sides = this.ptsSides || (frontVisible ? [-1, 1] : [1, -1]);
                sides.forEach(sd => {
                    gl.uniform1f(gl.getUniformLocation(P, 'uSide'), sd);
                    gl.drawArrays(gl.POINTS, 0, this.ptCount);
                });
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            }
        }
    };

    window.IronPreview3D = IronPreview3D;
})();
