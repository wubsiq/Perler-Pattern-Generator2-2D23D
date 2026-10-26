/* 语法快检
 *
 * 之前只查 workbench.html 的内联脚本，漏掉了 js/editor.js 这个外链大文件——
 * 结果"重复 let 声明"这种硬错在浏览器里才炸（整页白屏），本地检查却显示通过。
 * 现在两边都查。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let bad = 0;

// 1. workbench.html 的内联脚本
const html = fs.readFileSync('workbench.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatch) {
    scriptMatch.forEach((script, i) => {
        const code = script.replace(/<\/?script>/g, '');
        try {
            new vm.Script(code);
            console.log('workbench.html  Script block', i, 'syntax: OK');
        } catch (e) {
            bad++;
            console.log('workbench.html  Script block', i, 'error:', e.message);
        }
    });
} else {
    console.log('workbench.html: No inline scripts found');
}

// 2. 外链大文件：单独 new vm.Script 走一遍
const EXTERNAL = ['js/editor.js', 'js/ironPreview.js', 'js/colors.js', 'js/colorUtils.js'];
for (const f of EXTERNAL) {
    if (!fs.existsSync(f)) { console.log(f, ': (missing, skip)'); continue; }
    const code = fs.readFileSync(f, 'utf8');
    try {
        new vm.Script(code, { filename: f });
        console.log(f.padEnd(20), 'syntax: OK');
    } catch (e) {
        bad++;
        console.log(f.padEnd(20), 'error:', e.message);
    }
}

process.exit(bad ? 1 : 0);
