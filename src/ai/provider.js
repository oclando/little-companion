function endpoint(baseUrl) {
  const url = new URL(String(baseUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址需要是 HTTP(S) 地址，不能含密码、查询或片段');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('远程 API 请使用 HTTPS；HTTP 仅用于本机模型');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}

async function complete({ settings, apiKey, messages, signal, onDelta = () => {}, fetchImpl = fetch }) {
  let response;
  try { response = await fetchImpl(endpoint(settings.baseUrl), {
    method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: settings.model, messages, stream: settings.stream !== false, ...(new URL(settings.baseUrl).hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}), ...(settings.temperature !== undefined ? { temperature: Number(settings.temperature) } : {}), max_tokens: Number(settings.maxTokens) || 1400 })
  }); } catch (error) {
    if (signal?.aborted || ['AbortError', 'TimeoutError'].includes(error.name)) throw error;
    throw new Error(`无法连接 API（${error.cause?.code || '网络连接失败'}）。请检查基础地址、系统代理与网络；第三方接口请填写完整的 /v1 基础路径。`);
  }
  if (!response.ok) {
    // Provider bodies may echo credentials; deliberately never return raw response bodies.
    throw new Error(`API 请求失败（HTTP ${response.status}）。${({ 400: '请求参数或模型不兼容，可关闭流式输出再试。', 401: '请检查密钥。', 403: '接口拒绝访问，请检查权限。', 404: '接口路径或模型不存在，请检查 /v1 路径和模型名称。', 429: '请求过于频繁或额度不足。' })[response.status] || '请检查地址、模型与服务状态。'}`);
  }
  if (response.headers.get('content-type')?.includes('application/json')) {
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('API 没有返回聊天正文');
    onDelta(content); return { content, finishReason: body.choices[0].finish_reason || 'stop' };
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = '', content = '', finishReason = null, done = false;
  const consume = line => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { done = true; return; }
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error('API 在生成过程中返回错误，请重试');
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta?.content;
    if (typeof delta === 'string') { content += delta; onDelta(delta); }
    if (content.length > 150000) throw new Error('API 回复超过长度上限');
  };
  try {
    while (!done) {
      const { value, done: ended } = await reader.read();
      buffer += decoder.decode(value, { stream: !ended });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop();
      for (const line of lines) consume(line);
      if (ended) { if (buffer) consume(buffer); break; }
      if (buffer.length > 1024 * 1024) throw new Error('API 流数据格式异常');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!done && !finishReason) throw new Error('连接提前中断，未保存不完整回复');
  if (!content.trim()) throw new Error('API 没有返回聊天正文，请确认所选模型支持聊天');
  return { content, finishReason: finishReason || 'stop' };
}

module.exports = { endpoint, complete };
