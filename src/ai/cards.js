const zlib = require('zlib');

// Keep the original document, including unknown extensions, for round-trip export.
function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('角色卡必须是 JSON 对象');
  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('角色卡缺少 name');
  return {
    raw: structuredClone(raw), name: data.name.trim(),
    avatar: /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.extensions?.companion_avatar || '') && data.extensions.companion_avatar.length < 500000 ? data.extensions.companion_avatar : null,
    description: String(data.description || ''), personality: String(data.personality || ''),
    scenario: String(data.scenario || ''), first_mes: String(data.first_mes || ''),
    mes_example: String(data.mes_example || ''), system_prompt: String(data.system_prompt || ''),
    post_history_instructions: String(data.post_history_instructions || ''),
    alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.map(String) : [],
    character_book: data.character_book || null,
    format: raw.spec || 'legacy'
  };
}

function parseCard(buffer, extension) {
  if (buffer.length > 20 * 1024 * 1024) throw new Error('角色卡不能超过 20 MB');
  if (extension.toLowerCase() !== '.png') return normalizeCard(JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')));
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('不是有效的 PNG');
  const found = new Map();
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) throw new Error('PNG 数据不完整');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    const zero = chunk.indexOf(0);
    if (['tEXt', 'zTXt', 'iTXt'].includes(type) && zero >= 0) {
      const key = chunk.toString('latin1', 0, zero);
      if (key === 'chara' || key === 'ccv3') {
        let payload = chunk.subarray(zero + 1);
        if (type === 'zTXt') payload = zlib.inflateSync(payload.subarray(1), { maxOutputLength: 4 * 1024 * 1024 });
        if (type === 'iTXt') {
          const compressed = payload[0];
          let pos = 2;
          for (let i = 0; i < 2; i++) { const end = payload.indexOf(0, pos); if (end < 0) throw new Error('PNG 文字块无效'); pos = end + 1; }
          payload = payload.subarray(pos);
          if (compressed) payload = zlib.inflateSync(payload, { maxOutputLength: 4 * 1024 * 1024 });
        }
        const encoded = payload.toString('utf8');
        found.set(key, JSON.parse(encoded.trim().startsWith('{') ? encoded : Buffer.from(encoded, 'base64').toString('utf8')));
      }
    }
    offset += length + 12;
  }
  if (!found.size) throw new Error('PNG 中没有找到酒馆角色卡数据（chara / ccv3）');
  return normalizeCard(found.get('ccv3') || found.get('chara'));
}

module.exports = { normalizeCard, parseCard };
