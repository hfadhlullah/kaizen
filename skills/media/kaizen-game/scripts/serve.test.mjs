// node serve.test.mjs: the path guard and allowlist matching of serve.mjs
import assert from 'node:assert';
import { reqPath, globRe, allowed } from './serve.mjs';
assert.equal(reqPath('//'), '//');
assert.equal(reqPath('/%'), null);
assert.equal(reqPath('/a/%2e%2e/x?q=1'), '/x');        // dot segments resolve, nothing climbs above root
assert.equal(reqPath('/a%20b'), '/a b');
const res = ['index.html', 'game.html', 'rounds/*.js', 'assets/**'].map(globRe);
assert.ok(allowed('/game.html', res));
assert.ok(allowed('/rounds/kurir.js', res));
assert.ok(!allowed('/rounds/sub/kurir.js', res));       // * is one segment
assert.ok(!allowed('/rounds/kurir.mjs', res));
assert.ok(allowed('/assets/kit/Textures/colormap.png', res));
assert.ok(!allowed('/v1/game.html', res));               // old versions stay private
assert.ok(!allowed('/assets/.env', res));                // no dotfiles, even under **
assert.ok(!allowed('/assets/../tools/serve.json', res));
assert.ok(!allowed('/gameXhtml', res));                  // dots are literal
console.log('serve OK');
