const crypto = require('crypto');

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function youdaoInput(value) {
  const text = normalizeText(value);
  return text.length <= 20 ? text : `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

function baiduRequest(text, appId, secret, salt = crypto.randomBytes(8).toString('hex')) {
  const source = normalizeText(text);
  const params = new URLSearchParams({
    q: source,
    from: 'en',
    to: 'zh',
    appid: String(appId || ''),
    salt,
    sign: crypto.createHash('md5').update(`${appId}${source}${salt}${secret}`).digest('hex')
  });
  return { url: 'https://fanyi-api.baidu.com/api/trans/vip/translate', body: params.toString() };
}

function baiduApiKeyRequest(text, appId, apiKey, modelType = 'nmt') {
  const source = normalizeText(text);
  return {
    url: 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json;charset=UTF-8',
      authorization: `Bearer ${String(apiKey || '').trim()}`
    },
    body: JSON.stringify({
      appid: String(appId || '').trim(),
      from: 'en',
      to: 'zh',
      q: source,
      model_type: modelType === 'llm' ? 'llm' : 'nmt'
    })
  };
}

function youdaoRequest(text, appKey, secret, salt = crypto.randomUUID(), curtime = String(Math.floor(Date.now() / 1000))) {
  const source = normalizeText(text);
  const sign = crypto.createHash('sha256').update(`${appKey}${youdaoInput(source)}${salt}${curtime}${secret}`).digest('hex');
  const params = new URLSearchParams({
    q: source,
    from: 'en',
    to: 'zh-CHS',
    appKey: String(appKey || ''),
    salt,
    sign,
    signType: 'v3',
    curtime
  });
  return { url: 'https://openapi.youdao.com/api', body: params.toString() };
}

function parseBaiduResponse(payload) {
  if (payload?.error_code) {
    const code = String(payload.error_code);
    const help = {
      '52003': '未授权：请检查 App ID 是否来自“开发者信息”，以及当前鉴权方式对应的服务是否已开通',
      '54001': '鉴权失败：请检查 API Key/密钥是否完整，且没有多复制空格',
      '54003': '访问频率受限：请稍后重试或检查服务版本的 QPS 限制',
      '58000': '客户端 IP 不允许：请在百度开发者信息中清空服务器 IP 限制',
      '58003': '百度风控拦截了当前 IP，通常次日解封；需要立即解决时请联系百度翻译开放平台'
    }[code];
    throw new Error(`百度翻译错误 ${code}：${help || payload.error_msg || '未知错误'}`);
  }
  const translated = (payload?.trans_result || []).map(item => String(item?.dst || '').trim()).filter(Boolean).join('\n');
  if (!translated) throw new Error('百度翻译没有返回有效译文');
  return translated;
}

function parseYoudaoResponse(payload) {
  const errorCode = Array.isArray(payload?.errorCode) ? payload.errorCode[0] : payload?.errorCode;
  if (String(errorCode ?? '0') !== '0') throw new Error(`有道翻译错误 ${errorCode}`);
  const translated = (payload?.translation || []).map(item => String(item || '').trim()).filter(Boolean).join('\n');
  if (!translated) throw new Error('有道翻译没有返回有效译文');
  return translated;
}

module.exports = { normalizeText, youdaoInput, baiduRequest, baiduApiKeyRequest, youdaoRequest, parseBaiduResponse, parseYoudaoResponse };
