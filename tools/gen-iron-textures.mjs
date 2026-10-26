/* 熨烫光照 tile 生成器（矢量花纹分支）—— 生成 data/iron-textures/tiles.js
 *
 * 用法：
 *   node tools/gen-iron-textures.mjs            # 生成并写入 tiles.js
 *   node tools/gen-iron-textures.mjs --dry      # 只打印指标，不写文件
 *   可选覆盖：--src <素材目录> --sigma 1.0 --hp 12 --levels 65 --cap 320
 *
 * ============================================================
 *  【为什么和 tools/gen-iron-textures.py 不一样】（2026-10-16 重做）
 * ============================================================
 *  ① 彻底去掉"边界淡出"。
 *     那是上一版为了遮接缝用的，代价是把 tile 四周约 26px 的信号抹成中性灰 →
 *     平铺后每 256px 出现一条"没有印记"的十字带（实测振幅掉到中位数的 6%）。
 *     hh 反馈的"边界模糊"就是这个。实测：4 张花纹 tile 边缘振幅只有中心的
 *     5.8%~15.6%，而 4 张澡巾（镜像分支）是 98%~100% —— 差别就在这个淡出。
 *
 *  ② 单元按素材原始分辨率保留，不强行压到 128/256。
 *     原来把青海波 311×320 的周期压成 128 → 每颗豆只能看到半截花纹。
 *
 *  ③ 平铺策略按素材实际有没有周期分两支（用 roll 打分实测决定，不是猜的）：
 *       S 波  ：X 132.25 / Y 66 都很干净 → 整数倍平铺（锁相到小数周期）
 *       斜纹  ：两轴都测不出周期
 *       鱼鳞  ：仅 Y 轴可靠
 *       青海波：两轴都测不出周期
 *     后三者走「周期 + 切缝位置 联合优化」：只挪"从素材哪里切、切多大"，
 *     目标函数是**高通之后的接缝跳变 / 场 RMS**（≈接缝可见度），
 *     不动图案方向、不镜像、不淡出。镜像方案试过并否决：
 *     斜纹会变菱形万花筒、鱼鳞会变曼陀罗，方向性全丢。
 *
 *  ④ 高通/高斯一律走**环绕边界**（wrap）。原来的 reflect 会破坏周期性，
 *     等于在 tile 边界再制造一条缝。
 *
 *  ⑤ 高斯 σ 3~4 → 1.0。原来的"糊"主要来自这里（单元只有 32~128px 时 σ=4
 *     足以把条纹糊成一团）。
 *
 *  ⑥ 量化 16 档 → 65 档。16 档时摆幅 145 每档跳 18 个灰阶，印记只有 16 种
 *     深浅；65 档步长 4，且 128 可精确表示（中性点不会被推移到 136）。
 *
 *  【加新素材】
 *   往 MATS 加一条：id / label / mode / unit 或 crop，跑脚本 + node build.js。
 *   mode='tile' 需要真周期（先跑 --probe 看 roll 打分）；
 *   拿不准就用 mode='opt'，它会把周期和相位一起搜。
 *
 *  ★ 不依赖 Python：本机没有 python 解释器，之前的 .py 只能靠别的机器跑。
 *    这里用 Node 重写，JPEG 素材借 PowerShell/System.Drawing 转一次 PNG。
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';

// ── 参数 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const SIGMA = parseFloat(opt('sigma', '1.0'));
const HP_R = parseInt(opt('hp', '12'), 10);
const LEVELS = parseInt(opt('levels', '65'), 10);
const CAP = parseInt(opt('cap', '320'), 10);
const DRY = argv.includes('--dry');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC_DIR = opt('src', path.join(process.env.TEMP, 'iron-src'));
const TILES_JS = path.join(ROOT, 'data', 'iron-textures', 'tiles.js');
const MATS = [
    // mode: tile = 真周期整数倍平铺；mirror / mirrorx = 镜像（接缝跳变恒为 0，
    //       且不像"淡出"那样把边界信号抹平）
    // 探测结论（.diag/probe.js）：斜纹两轴无周期、青海波两轴无周期、
    // 鱼鳞仅 Y 可靠(392)、S 波 X 132.25 / Y 66 都很干净。
    // ★ 单元取满（reps 1x1）：同样的 tile 体积下接缝数量最少
    { id: 'huaWen1', label: '花纹1 · 斜纹', kind: 'vector', mode: 'opt', unit: [300, 300], hintX: 300, hintY: 300,
      file: '屏幕截图_15-10-2026_20478_cn.bing.com.jpeg' },
    { id: 'huaWen2', label: '花纹2 · 波浪', kind: 'vector', mode: 'tile', unit: [132, 66],
      file: '屏幕截图_15-10-2026_204721_cn.bing.com.jpeg' },
    { id: 'huaWen3', label: '花纹3 · 鱼鳞', kind: 'vector', mode: 'opt', unit: [280, 280], hintX: 280, hintY: 280,
      file: '屏幕截图_15-10-2026_204737_cn.bing.com.jpeg' },
    { id: 'huaWen4', label: '花纹4 · 青海波', kind: 'vector', mode: 'opt', unit: [310, 320], hintX: 310, hintY: 320,
      file: '屏幕截图_15-10-2026_204753_cn.bing.com.jpeg' },
];

/* 素材是 JPEG（Node 不能解码）→ 借 PowerShell/System.Drawing 转一次 PNG。
 * 已有同名 PNG 就直接用（重复跑很快）。 */
function sourcePng(m) {
    const dst = path.join(SRC_DIR, m.id + '.png');
    if (fs.existsSync(dst)) return dst;
    const src = path.join(opt('srcraw', path.join(process.env.USERPROFILE || '', 'Downloads')), m.file);
    if (!fs.existsSync(src)) throw new Error(`素材不存在：${src}（用 --srcraw <目录> 指定）`);
    fs.mkdirSync(SRC_DIR, { recursive: true });
    execFileSync('powershell', ['-NoProfile', '-Command',
        'Add-Type -AssemblyName System.Drawing;' +
        `$i=[System.Drawing.Image]::FromFile(${JSON.stringify(src)});` +
        `$b=New-Object System.Drawing.Bitmap($i);` +
        `$b.Save(${JSON.stringify(dst)},[System.Drawing.Imaging.ImageFormat]::Png);` +
        '$b.Dispose();$i.Dispose();'], { stdio: 'ignore' });
    return dst;
}

// ── PNG 解码 ─────────────────────────────────────────────────────────
function decodePNG(p) {
    const b = fs.readFileSync(p);
    let pos = 8, w = 0, h = 0, ct = 0, bd = 0;
    const idat = [];
    while (pos < b.length) {
        const len = b.readUInt32BE(pos);
        const type = b.toString('ascii', pos + 4, pos + 8);
        const data = b.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    if (bd !== 8 || ct === 3) throw new Error('unsupported png bd=' + bd + ' ct=' + ct);
    const ch = ct === 0 ? 1 : ct === 2 ? 3 : ct === 4 ? 2 : 4;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(h * stride);
    let p2 = 0;
    for (let y = 0; y < h; y++) {
        const f = raw[p2++];
        const line = raw.subarray(p2, p2 + stride); p2 += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? cur[i - ch] : 0;
            const bb = prev ? prev[i] : 0;
            const c = (prev && i >= ch) ? prev[i - ch] : 0;
            let v = line[i];
            if (f === 1) v += a;
            else if (f === 2) v += bb;
            else if (f === 3) v += (a + bb) >> 1;
            else if (f === 4) {
                const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
            }
            cur[i] = v & 255;
        }
    }
    return { w, h, ch, data: out };
}

function toLuma(img) {
    const { w, h, ch, data } = img;
    const A = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const p = i * ch;
        A[i] = ch === 1 ? data[p] : 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    return A;
}

// ── 线性代数小工具（全部环绕边界，保持周期性）─────────────────────────
function boxBlurWrap(src, w, h, r) {
    if (r <= 0) return Float64Array.from(src);
    const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
    const k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += src[y * w + ((i % w) + w) % w];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = acc / k;
            acc += src[y * w + (((x + r + 1) % w) + w) % w] - src[y * w + (((x - r) % w) + w) % w];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += tmp[(((i % h) + h) % h) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / k;
            acc += tmp[((((y + r + 1) % h) + h) % h) * w + x] - tmp[((((y - r) % h) + h) % h) * w + x];
        }
    }
    return out;
}

function gaussWrap(src, w, h, sigma) {
    if (sigma <= 0.05) return Float64Array.from(src);
    const r = Math.max(1, Math.ceil(sigma * 3));
    const ker = new Float64Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker[i + r] = v; sum += v; }
    for (let i = 0; i < ker.length; i++) ker[i] /= sum;
    const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let i = -r; i <= r; i++) s += ker[i + r] * src[y * w + ((((x + i) % w) + w) % w)];
            tmp[y * w + x] = s;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let s = 0;
            for (let i = -r; i <= r; i++) s += ker[i + r] * tmp[((((y + i) % h) + h) % h) * w + x];
            out[y * w + x] = s;
        }
    }
    return out;
}

/* 面积平均缩放（缩小时用；硬边线条缩小时保持锐利，不会像 LANCZOS 那样振铃） */
function resizeArea(src, W, H, dw, dh) {
    if (dw === W && dh === H) return Float64Array.from(src);
    const out = new Float64Array(dw * dh);
    const sx = W / dw, sy = H / dh;
    for (let y = 0; y < dh; y++) {
        const y0 = y * sy, y1 = Math.min(H, (y + 1) * sy);
        for (let x = 0; x < dw; x++) {
            const x0 = x * sx, x1 = Math.min(W, (x + 1) * sx);
            let acc = 0, wsum = 0;
            for (let vy = Math.floor(y0); vy < Math.ceil(y1); vy++) {
                const wy = Math.min(vy + 1, y1) - Math.max(vy, y0);
                if (wy <= 0) continue;
                for (let vx = Math.floor(x0); vx < Math.ceil(x1); vx++) {
                    const wx = Math.min(vx + 1, x1) - Math.max(vx, x0);
                    if (wx <= 0) continue;
                    acc += src[vy * W + vx] * wx * wy;
                    wsum += wx * wy;
                }
            }
            out[y * dw + x] = wsum > 0 ? acc / wsum : 0;
        }
    }
    return out;
}

// ── 周期检测（roll 验证法，和 texture-editor 同款）────────────────────
/* 小数周期的 roll 打分（双线性采样）—— 素材被非整数倍缩放时，
 * 整数 roll 会对不齐，必须能扫小数。 */
function sampleBilinear(A, W, H, x, y) {
    if (x < 0) x += W; if (x >= W) x -= W;
    if (y < 0) y += H; if (y >= H) y -= H;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const x1 = (x0 + 1) % W, y1 = (y0 + 1) % H;
    return A[y0 * W + x0] * (1 - fx) * (1 - fy) + A[y0 * W + x1] * fx * (1 - fy) +
        A[y1 * W + x0] * (1 - fx) * fy + A[y1 * W + x1] * fx * fy;
}
function rollScoreFine(A, W, H, axis, p, step) {
    const st = step || 2;
    let s = 0, n = 0;
    for (let y = 0; y < H; y += st) {
        for (let x = 0; x < W; x += st) {
            const v = axis === 1 ? sampleBilinear(A, W, H, x + p, y) : sampleBilinear(A, W, H, x, y + p);
            s += Math.abs(A[y * W + x] - v);
            n++;
        }
    }
    return s / n;
}
function probePeriods(A, W, H) {
    const st = 2;
    let base = 0, nb = 0;
    for (const sh of [7, 11, 17, 23, 29]) {
        for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) {
            base += Math.abs(A[y * W + x] - A[((y + sh) % H) * W + ((x + sh) % W)]); nb++;
        }
    }
    base /= nb;
    const out = {};
    for (const axis of [1, 0]) {
        const lo = Math.max(8, Math.floor(Math.min(W, H) * 0.08));
        const hi = Math.floor(Math.min(W, H) * 0.50);
        const list = [];
        for (let p = lo; p <= hi; p += 0.25) list.push({ p, v: rollScoreFine(A, W, H, axis, p, 2) / base });
        list.sort((a, b) => a.v - b.v);
        out[axis === 1 ? 'x' : 'y'] = list.slice(0, 5).map(o => [+o.p.toFixed(2), +o.v.toFixed(3)]);
    }
    out.baseline = base;
    return out;
}
/* 在整数提示附近细化到小数周期（0.05 步长）—— 素材被非整数缩放时用它锁相 */
function refinePeriod(A, W, H, axis, hint) {
    let best = { p: hint, v: Infinity };
    for (let p = hint * 0.94; p <= hint * 1.06; p += 0.05) {
        const v = rollScoreFine(A, W, H, axis, p, 3);
        if (v < best.v) best = { p: Math.round(p * 100) / 100, v };
    }
    return best;
}

/* ★ 直接用「平铺边界的跳变」当目标函数挑周期 —— 比 roll 打分更贴近我们真正在乎的东西。
 *   roll 打分受素材自身对比度分布影响，实测会挑出残留接缝的周期。 */
function buildUnit(A, W, H, x0, y0, uw, uh, sxf, syf) {
    const U = new Float64Array(uw * uh);
    for (let y = 0; y < uh; y++) {
        for (let x = 0; x < uw; x++) {
            U[y * uw + x] = (sxf === 1 && syf === 1)
                ? A[(((y0 + y) % H) + H) % H * W + ((((x0 + x) % W) + W) % W)]
                : sampleBilinear(A, W, H, x0 + x * sxf, y0 + y * syf);
        }
    }
    return U;
}
function unitSeam(U, uw, uh, axis) {
    let j = 0, i = 0;
    if (axis === 1) {
        for (let y = 0; y < uh; y++) j += Math.abs(U[y * uw + uw - 1] - U[y * uw]);
        for (let y = 0; y < uh; y++) i += Math.abs(U[y * uw + 10] - U[y * uw + 11]);
        j /= uh; i /= uh;
    } else {
        for (let x = 0; x < uw; x++) j += Math.abs(U[(uh - 1) * uw + x] - U[x]);
        for (let x = 0; x < uw; x++) i += Math.abs(U[10 * uw + x] - U[11 * uw + x]);
        j /= uw; i /= uw;
    }
    return j / (i || 1);
}
/* ★ 接缝可见度 = （边界跳变）/（高通场的 RMS）
 *   直接用原始灰阶的"内部梯度"当分母会失真：高通后平坦区梯度趋近 0，
 *   同一处接缝在两步里的比值能差 5 倍。这里统一在高通场（= 实际做浮雕的那个场）上量。 */
function seamScoreHp(U, uw, uh, axis, r) {
    const H = new Float64Array(uw * uh);
    const bg = boxBlurWrap(U, uw, uh, r);
    for (let i = 0; i < uw * uh; i++) H[i] = U[i] - bg[i];
    let j = 0, n = 0, s = 0;
    if (axis === 1) {
        for (let y = 0; y < uh; y++) { j += Math.abs(H[y * uw + uw - 1] - H[y * uw]); n++; }
    } else {
        for (let x = 0; x < uw; x++) { j += Math.abs(H[(uh - 1) * uw + x] - H[x]); n++; }
    }
    for (let i = 0; i < uw * uh; i++) s += H[i] * H[i];
    const rms = Math.sqrt(s / (uw * uh));
    j /= n;
    return { jump: j, rms, score: rms > 1e-6 ? j / rms : 0 };
}
function pickPeriodBySeam(A, W, H, x0, y0, uw, uh, axis, hint, otherScale) {
    let best = { p: hint, seam: Infinity };
    for (let p = hint * 0.96; p <= hint * 1.04; p += 0.01) {
        const s = p / (axis === 1 ? uw : uh);
        const sxf = axis === 1 ? s : otherScale;
        const syf = axis === 0 ? s : otherScale;
        const U = buildUnit(A, W, H, x0, y0, uw, uh, sxf, syf);
        const seam = unitSeam(U, uw, uh, axis);
        if (seam < best.seam) best = { p: Math.round(p * 1000) / 1000, seam };
    }
    return best;
}

/* ★★ 联合优化：周期（小数）+ 取样原点 一起搜，目标 = 平铺边界跳变最小。
 *   只动"从素材哪里切、切多大"，不改变图案方向、不做淡出、不做镜像。
 *   对角/手绘类素材（原本两轴都测不出周期）靠这一步能拿到可用的接缝。 */
function optimizeTile(A, W, H, uw, uh, hintX, hintY, iterations) {
    let x0 = Math.max(0, Math.floor((W - uw) / 2));
    let y0 = Math.max(0, Math.floor((H - uh) / 2));
    let sxf = 1, syf = 1, seamX = Infinity, seamY = Infinity;
    const evalAxes = () => {
        const U = buildUnit(A, W, H, x0, y0, uw, uh, sxf, syf);
        seamX = seamScoreHp(U, uw, uh, 1, 12).score;
        seamY = seamScoreHp(U, uw, uh, 0, 12).score;
        return U;
    };
    evalAxes();
    for (let it = 0; it < (iterations || 2); it++) {
        // 1) 周期（小数）单独搜
        let bx = { s: sxf, e: seamX };
        for (let p = hintX * 0.90; p <= hintX * 1.10; p += 0.25) {
            const s = p / uw;
            const U = buildUnit(A, W, H, x0, y0, uw, uh, s, syf);
            const e = seamScoreHp(U, uw, uh, 1, 12).score;
            if (e < bx.e) bx = { s, e };
        }
        sxf = bx.s;
        let by = { s: syf, e: Infinity };
        for (let p = hintY * 0.90; p <= hintY * 1.10; p += 0.25) {
            const s = p / uh;
            const U = buildUnit(A, W, H, x0, y0, uw, uh, sxf, s);
            const e = seamScoreHp(U, uw, uh, 0, 12).score;
            if (e < by.e) by = { s, e };
        }
        syf = by.s;
        // 2) 取样原点（相位）搜一遍 —— 让切缝落在图案里最"平"的地方
        let best = { x0, y0, e: seamX + seamY };
        const R = 40, ST = 4;
        for (let dy = -R; dy <= R; dy += ST) {
            for (let dx = -R; dx <= R; dx += ST) {
                const nx = x0 + dx, ny = y0 + dy;
                if (nx < 0 || ny < 0 || nx + uw * sxf >= W || ny + uh * syf >= H) continue;
                const U = buildUnit(A, W, H, nx, ny, uw, uh, sxf, syf);
                const e = seamScoreHp(U, uw, uh, 1, 12).score + seamScoreHp(U, uw, uh, 0, 12).score;
                if (e < best.e) best = { x0: nx, y0: ny, e };
            }
        }
        x0 = best.x0; y0 = best.y0;
        evalAxes();
    }
    return { x0, y0, sxf, syf, seamX, seamY };
}
function detectPeriod(A, W, H) {
    const sc = 4;
    const dw = Math.max(8, Math.floor(W / sc)), dh = Math.max(8, Math.floor(H / sc));
    const g = resizeArea(A, W, H, dw, dh);
    let mean = 0;
    for (let i = 0; i < dw * dh; i++) mean += g[i];
    mean /= dw * dh;
    for (let i = 0; i < dw * dh; i++) g[i] -= mean;
    const lo = Math.max(3, Math.floor(Math.min(dh, dw) * 0.10));
    const hi = Math.floor(Math.min(dh, dw) * 0.48);
    const scan = (ax) => {
        let best = Infinity, bp = 0;
        const n = ax === 1 ? dw : dh;
        for (let p = lo; p < hi; p++) {
            let s = 0;
            for (let y = 0; y < dh; y++) {
                for (let x = 0; x < dw; x++) {
                    const x2 = ax === 1 ? (x + p) % dw : x;
                    const y2 = ax === 0 ? (y + p) % dh : y;
                    s += Math.abs(g[y * dw + x] - g[y2 * dw + x2]);
                }
            }
            s /= dw * dh;
            if (s < best) { best = s; bp = p; }
        }
        return { s: best, p: bp * sc };
    };
    const sxr = scan(1), syr = scan(0);
    // 随机基线
    let rnd = 0;
    for (const sh of [7, 11, 17, 23, 29]) {
        let s = 0;
        for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) s += Math.abs(g[y * dw + x] - g[((y + sh) % dh) * dw + ((x + sh) % dw)]);
        rnd += s / (dw * dh);
    }
    rnd /= 5;
    const rx = sxr.s / rnd, ry = syr.s / rnd;
    const TH = 0.95;
    let px = sxr.p, py = syr.p, note;
    if (rx > TH && ry > TH) { note = '两轴都不可靠'; px = 0; py = 0; }
    else if (rx > TH) { px = py; note = `X 不可靠(${rx.toFixed(2)})→借用 Y`; }
    else if (ry > TH) { py = px; note = `Y 不可靠(${ry.toFixed(2)})→借用 X`; }
    else note = '两轴都可靠';
    return { px, py, scoreX: rx, scoreY: ry, note };
}

// ── PNG 编码（8 位灰度，逐行选最优 filter）──────────────────────────
const CRC_T = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
}
function encodeGrayPNG(G, w, h) {
    const raw = Buffer.alloc(h * (w + 1));
    const prev = Buffer.alloc(w);
    const cur = Buffer.alloc(w);
    const cand = [Buffer.alloc(w), Buffer.alloc(w), Buffer.alloc(w), Buffer.alloc(w), Buffer.alloc(w)];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) cur[x] = G[y * w + x];
        for (let x = 0; x < w; x++) {
            const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0;
            cand[0][x] = cur[x];
            cand[1][x] = (cur[x] - a) & 255;
            cand[2][x] = (cur[x] - b) & 255;
            cand[3][x] = (cur[x] - ((a + b) >> 1)) & 255;
            const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
            cand[4][x] = (cur[x] - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c))) & 255;
        }
        let bestF = 0, bestS = Infinity;
        for (let f = 0; f < 5; f++) {
            let s = 0;
            for (let x = 0; x < w; x++) { const v = cand[f][x]; s += v < 128 ? v : 256 - v; }
            if (s < bestS) { bestS = s; bestF = f; }
        }
        raw[y * (w + 1)] = bestF;
        cand[bestF].copy(raw, y * (w + 1) + 1);
        cur.copy(prev);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ── 指标 ─────────────────────────────────────────────────────────────
function localAmp(G, w, h) {
    const bg = boxBlurWrap(G, w, h, 12);
    const hp = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) hp[i] = Math.abs(G[i] - bg[i]);
    return boxBlurWrap(hp, w, h, 8);
}
function report(G, w, h) {
    let mean = 0, sd = 0, mn = 1e9, mx = -1e9;
    for (let i = 0; i < w * h; i++) { mean += G[i]; if (G[i] < mn) mn = G[i]; if (G[i] > mx) mx = G[i]; }
    mean /= w * h;
    for (let i = 0; i < w * h; i++) sd += (G[i] - mean) ** 2;
    sd = Math.sqrt(sd / (w * h));
    const lv = new Set(); for (let i = 0; i < w * h; i++) lv.add(G[i]);
    // 接缝跳变 / 内部梯度
    let jx = 0, jy = 0, ix = 0, iy = 0;
    for (let y = 0; y < h; y++) { jx += Math.abs(G[y * w] - G[y * w + w - 1]); iy += Math.abs(G[y * w + 10] - G[y * w + 11]); }
    for (let x = 0; x < w; x++) { jy += Math.abs(G[x] - G[(h - 1) * w + x]); ix += Math.abs(G[10 * w + x] - G[11 * w + x]); }
    jx /= h; jy /= w; ix /= w; iy /= h;
    const amp = localAmp(G, w, h);
    const band = Math.max(6, Math.round(Math.min(w, h) * 0.05));
    let e = 0, ne = 0, c = 0, nc = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (d < band) { e += amp[y * w + x]; ne++; }
        else if (d > band * 3) { c += amp[y * w + x]; nc++; }
    }
    return {
        mean, sd, min: mn, max: mx, levels: lv.size,
        seamX: jx / (ix || 1), seamY: jy / (iy || 1),
        edgeRatio: (e / ne) / (c / nc), coreAmp: c / nc,
    };
}

// ── 主流程 ───────────────────────────────────────────────────────────
function main() {
const results = [];
const tiles = {};

for (const m of MATS) {
    const img = decodePNG(sourcePng(m));
    const A = toLuma(img);
    const det = detectPeriod(A, img.w, img.h);
    const base = m.unit || m.crop;
    let x0 = Math.max(0, Math.floor((img.w - base[0]) / 2));
    let y0 = Math.max(0, Math.floor((img.h - base[1]) / 2));
    let uw = Math.min(base[0], img.w - x0), uh = Math.min(base[1], img.h - y0);

    // ★ 周期锁相：素材的周期常常是非整数像素（截图被缩放过），
    //   直接按整数裁 + 平铺会残留半个像素的错位（实测接缝 1.2~2.0 倍内部梯度）。
    //   这里把小数周期重采样成整数，平铺于是精确无缝。
    let lockNote = '';
    let sxf = 1, syf = 1;
    if (m.mode === 'tile') {
        const fx = pickPeriodBySeam(A, img.w, img.h, x0, y0, uw, uh, 1, uw, 1);
        const fy = pickPeriodBySeam(A, img.w, img.h, x0, y0, uw, uh, 0, uh, fx.p / uw);
        sxf = fx.p / uw; syf = fy.p / uh;
        lockNote = `锁相 ${fx.p}x${fy.p}（接缝 ${fx.seam.toFixed(2)}/${fy.seam.toFixed(2)}）`;
    } else if (m.mode === 'opt') {
        const r = optimizeTile(A, img.w, img.h, uw, uh, m.hintX, m.hintY, 2);
        x0 = r.x0; y0 = r.y0; sxf = r.sxf; syf = r.syf;
        lockNote = `联合优化 周期 ${(r.sxf * uw).toFixed(2)}x${(r.syf * uh).toFixed(2)} 原点 ${x0},${y0}` +
            `（接缝 ${r.seamX.toFixed(2)}/${r.seamY.toFixed(2)}）`;
    } else if (m.mode === 'mirrorx') {
        const fy = pickPeriodBySeam(A, img.w, img.h, x0, y0, uw, uh, 0, uh, 1);
        syf = fy.p / uh;
        lockNote = `Y 锁相 ${fy.p}（接缝 ${fy.seam.toFixed(2)}）`;
    }

    let U = new Float64Array(uw * uh);
    for (let y = 0; y < uh; y++) {
        for (let x = 0; x < uw; x++) {
            U[y * uw + x] = (sxf === 1 && syf === 1)
                ? A[(y0 + y) * img.w + x0 + x]
                : sampleBilinear(A, img.w, img.h, x0 + x * sxf, y0 + y * syf);
        }
    }

    // 按策略铺成 tile
    let T, tw, th, repNote;
    if (m.mode === 'tile' || m.mode === 'opt') {
        // 真周期 → 整数倍平铺，数学无缝
        const mx = Math.max(1, Math.round(256 / uw));
        const my = Math.max(1, Math.round(256 / uh));
        tw = uw * mx; th = uh * my;
        T = new Float64Array(tw * th);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) T[y * tw + x] = U[(y % uh) * uw + (x % uw)];
        repNote = `整数倍 ${mx}x${my}`;
    } else {
        // 镜像：每 2 个单元翻一次 → 边界跳变恒为 0
        const mirrorX = m.mode === 'mirror' || m.mode === 'mirrorx';
        const mirrorY = m.mode === 'mirror';
        const sx = mirrorX ? 2 : 1, sy = mirrorY ? 2 : 1;
        tw = uw * sx; th = uh * sy;
        T = new Float64Array(tw * th);
        for (let y = 0; y < th; y++) {
            const sy2 = mirrorY && (Math.floor(y / uh) % 2) ? (uh - 1 - (y % uh)) : (y % uh);
            for (let x = 0; x < tw; x++) {
                const sx2 = mirrorX && (Math.floor(x / uw) % 2) ? (uw - 1 - (x % uw)) : (x % uw);
                T[y * tw + x] = U[sy2 * uw + sx2];
            }
        }
        repNote = mirrorX && mirrorY ? '四象限镜像' : (mirrorX ? 'X 镜像 / Y 周期' : 'X 周期 / Y 镜像');
    }

    // 只缩小、不放大（放大不增加信息，只会更糊）
    const long = Math.max(tw, th);
    if (long > CAP) {
        const s = CAP / long;
        const nw = Math.max(4, Math.round(tw * s)), nh = Math.max(4, Math.round(th * s));
        T = resizeArea(T, tw, th, nw, nh);
        tw = nw; th = nh;
    }

    // 4) 高通（wrap）+ 轻模糊（wrap）
    let F = T;
    if (HP_R > 0) {
        const bg = boxBlurWrap(T, tw, th, HP_R);
        F = new Float64Array(tw * th);
        for (let i = 0; i < tw * th; i++) F[i] = T[i] - bg[i];
    }
    if (SIGMA > 0.05) F = gaussWrap(F, tw, th, SIGMA);

    // 5) 去均值 + 对称归一化（不含任何淡出 → 全 tile 振幅一致）
    let mean = 0; for (let i = 0; i < tw * th; i++) mean += F[i];
    mean /= tw * th;
    for (let i = 0; i < tw * th; i++) F[i] -= mean;
    const abs = Float64Array.from(F, v => Math.abs(v)).sort();
    const amp99 = abs[Math.floor(abs.length * 0.99)] || 1;
    // 6) 65 档量化：步长 4，128 精确可表示（中性点不被推移）
    const step = 256 / (LEVELS - 1);
    const G = new Uint8Array(tw * th);
    for (let i = 0; i < tw * th; i++) {
        const v = Math.max(-1, Math.min(1, F[i] / amp99));
        const q = Math.round((v * 0.5 + 0.5) * (LEVELS - 1));
        G[i] = Math.max(0, Math.min(255, Math.round(q * step)));
    }
    const png = encodeGrayPNG(G, tw, th);
    tiles[m.id] = 'data:image/png;base64,' + png.toString('base64');

    const r = report(Float64Array.from(G), tw, th);
    // baseTiles：让 1.0× 时"整幅长边跨过的 tile 数"= 素材截图长边跨过的 tile 数
    //   → 观感上与素材原图同样的密度（用户再用滑杆 0.4~3× 调）
    const srcLong = Math.max(img.w, img.h);
    const tileLong = Math.max(tw, th);
    const baseTiles = Math.max(1.2, Math.round((srcLong / tileLong) * 10) / 10);

    results.push({
        id: m.id, label: m.label, kind: m.kind,
        src: `${img.w}x${img.h}`,
        detect: { px: det.px, py: det.py, scoreX: +det.scoreX.toFixed(3), scoreY: +det.scoreY.toFixed(3), note: det.note },
        mode: m.mode, unit: [uw, uh], tile: [tw, th], layout: repNote,
        srcLong, baseTiles,
        pngBytes: png.length, b64Bytes: Math.round(png.length * 4 / 3),
        metrics: {
            mean: +r.mean.toFixed(1), sd: +r.sd.toFixed(1), min: r.min, max: r.max, levels: r.levels,
            seamX: +r.seamX.toFixed(3), seamY: +r.seamY.toFixed(3),
            edgeRatio: +r.edgeRatio.toFixed(3), coreAmp: +r.coreAmp.toFixed(1),
        },
    });
    console.log(`[${m.id}] 素材 ${img.w}x${img.h}（roll ${det.scoreX.toFixed(2)}/${det.scoreY.toFixed(2)}，周期 ${det.px}x${det.py}）` +
        ` → ${m.mode} 单元 ${uw}x${uh} → tile ${tw}x${th}（${repNote}${lockNote ? '，' + lockNote : ''}）`);
    console.log(`        接缝 ${r.seamX.toFixed(3)}/${r.seamY.toFixed(3)}  边缘/中心振幅 ${r.edgeRatio.toFixed(3)}` +
        `  灰阶 ${r.levels} 档  mean ${r.mean.toFixed(1)} sd ${r.sd.toFixed(1)}  baseTiles ${baseTiles}`);
    console.log(`        PNG ${(png.length / 1024).toFixed(1)}KB  base64 ${(png.length * 4 / 3 / 1024).toFixed(1)}KB`);
}

// ── 写回 tiles.js（澡巾那 4 张原样保留，只替换 4 张花纹）─────────────
const old = fs.readFileSync(TILES_JS, 'utf8');
const keep = [...old.matchAll(/"(\w+)":\s*"(data:image\/png;base64,[^"]+)"/g)]
    .filter(m => !/^huaWen/.test(m[1]));
if (keep.length < 4) throw new Error('读不到原有 tile 条目，中止（避免把澡巾弄丢）');

const allTiles = Object.fromEntries([...keep.map(m => [m[1], m[2]]), ...Object.entries(tiles)]);
const ZAOJIN_LABEL = {
    zaoJin1: '澡巾1 · 细密短绒', zaoJin2: '澡巾2 · 粗圈绒面',
    zaoJin3: '澡巾3 · 细圈绒面', zaoJin4: '澡巾4 · 粗颗粒',
};
const ZAOJIN_SWING = { zaoJin1: 0.82, zaoJin2: 1.00, zaoJin3: 0.95, zaoJin4: 0.70 };
const meta = {};
for (const id of Object.keys(allTiles)) {
    const isVec = /^huaWen/.test(id);
    const hit = results.find(r => r.id === id);
    meta[id] = {
        label: hit ? hit.label : (ZAOJIN_LABEL[id] || id),
        swing: isVec ? 1.0 : (ZAOJIN_SWING[id] !== undefined ? ZAOJIN_SWING[id] : 1.0),
        scale: 1.0, rot: 0,
        kind: isVec ? 'vector' : 'photo',
        // ★ 尺度锚点：
        //   art  = 以整幅为单位（1.0× 时作品长边跨过 baseTiles 个 tile）
        //   bead = 以豆径为单位（实物肌理，一颗豆上的颗粒数不随倍率变）
        anchor: isVec ? 'art' : 'bead',
    };
    if (isVec) meta[id].baseTiles = hit ? hit.baseTiles : 3;
}

const body = Object.entries(allTiles)
    .map(([id, url]) => `  ${JSON.stringify(id)}: ${JSON.stringify(url)}`)
    .join(',\n');
const header = ['/* 熨烫光照 tile —— 内联为 dataURL（由 tools/gen-iron-textures.mjs 生成，勿手改）',
    ' *',
    ' * 为什么内联而不是外部 PNG：熨烫预览的像素级浮雕必须 getImageData 读像素，',
    ' * 而 file:// 协议下加载任何外部图片都会把画布标记为 tainted → SecurityError。',
    ' * dataURL 是纯字符串、不带来源信息，任何协议下都同源。',
    ' *',
    ' * huaWen1~4：由 tools/gen-iron-textures.mjs 从素材截图重算 —— 真周期整数倍平铺，',
    ' *            或「周期 + 切缝位置联合优化」；不做边界淡出，单元按原分辨率保留。',
    ' * zaoJin1~4：实拍照片，四象限镜像 + 环形对齐（tools/gen-iron-textures.py）。',
    ' */', ''].join('\n');
const out = `${header}window.IRON_ZAOJIN_TILES = {\n${body}\n};\n` +
    `/* 变体元数据：label / 摆幅 / 默认大小 / 默认旋转 / 类别 / 尺度锚点 / 整幅重复次数 */\n` +
    `window.IRON_ZAOJIN_META = ${JSON.stringify(meta)};\n`;

const total = Object.values(allTiles).reduce((a, u) => a + u.length, 0);
if (DRY) {
    console.log(`\n[dry-run] 未写文件。tiles.js 会有 ${Object.keys(allTiles).length} 个条目，约 ${(total / 1024).toFixed(0)}KB`);
} else {
    fs.writeFileSync(TILES_JS, out);
    console.log(`\n已写入 ${path.relative(ROOT, TILES_JS)} —— ${Object.keys(allTiles).length} 个条目，共 ${(total / 1024).toFixed(0)}KB`);
    console.log('接着跑：node build.js');
}
}

export {
    decodePNG, toLuma, probePeriods, rollScoreFine, resizeArea, detectPeriod,
    boxBlurWrap, gaussWrap, report, encodeGrayPNG, MATS, SRC_DIR,
};
main();
