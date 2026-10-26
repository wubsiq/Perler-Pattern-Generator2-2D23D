const fs = require('fs');
const html = fs.readFileSync('workbench.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatch) {
    scriptMatch.forEach((script, i) => {
        const code = script.replace(/<\/?script>/g, '');
        try {
            new Function(code);
            console.log('Script block', i, 'syntax: OK');
        } catch(e) {
            console.log('Script block', i, 'error:', e.message);
        }
    });
} else {
    console.log('No inline scripts found');
}
