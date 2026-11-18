const assert = require('assert');
const crypto = require('crypto');
const Provider = require('../src/translation-provider');

const baidu = Provider.baiduRequest('attention', 'app-id', 'secret', 'salt-1');
const baiduParams = new URLSearchParams(baidu.body);
assert.equal(baiduParams.get('q'), 'attention');
assert.equal(baiduParams.get('sign'), crypto.createHash('md5').update('app-idattentionsalt-1secret').digest('hex'));
assert.equal(Provider.parseBaiduResponse({ trans_result: [{ dst: '注意' }, { dst: '关注' }] }), '注意\n关注');

const baiduApiKey = Provider.baiduApiKeyRequest('attention', 'app-id', 'SK-test', 'nmt');
assert.equal(baiduApiKey.url, 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate');
assert.equal(baiduApiKey.headers.authorization, 'Bearer SK-test');
assert.deepEqual(JSON.parse(baiduApiKey.body), { appid: 'app-id', from: 'en', to: 'zh', q: 'attention', model_type: 'nmt' });

const longText = 'abcdefghijklmnopqrstuvwxyz';
assert.equal(Provider.youdaoInput(longText), 'abcdefghij26qrstuvwxyz');
const youdao = Provider.youdaoRequest(longText, 'key', 'secret', 'salt-2', '1700000000');
const youdaoParams = new URLSearchParams(youdao.body);
assert.equal(youdaoParams.get('sign'), crypto.createHash('sha256').update('keyabcdefghij26qrstuvwxyzsalt-21700000000secret').digest('hex'));
assert.equal(Provider.parseYoudaoResponse({ errorCode: '0', translation: ['上下文译文'] }), '上下文译文');
assert.throws(() => Provider.parseBaiduResponse({ error_code: '54001', error_msg: 'Invalid Sign' }), /54001/);

console.log('translation provider tests passed');
