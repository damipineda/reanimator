import { extract } from './extract.js';
const result = await extract('local-samples/lunar-lander.swf', 'work/src-extract-test');
console.log(JSON.stringify({ ok: result.ok, filesCount: result.ok ? result.data.files.length : null, sha256: result.ok ? result.data.sha256 : null, reason: !result.ok ? result.reason : null }, null, 2));
