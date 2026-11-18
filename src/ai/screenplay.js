// Typed presentation events: never infer a speaker from quotation marks or names.
function parseScreenplay(content, actorId) {
  const text = String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : data.segments;
  if (!Array.isArray(rows) || !rows.length || rows.length > 12) throw new Error('剧情格式不正确，请重试');
  return rows.map(row => {
    if (!['narration', 'dialogue'].includes(row.type) || typeof row.text !== 'string' || !row.text.trim()) throw new Error('剧情段落无效');
    if (row.type === 'dialogue' && row.actorId !== actorId) throw new Error('剧情发言角色不匹配');
    return { type: row.type, actorId: row.type === 'dialogue' ? actorId : null, text: row.text.trim().slice(0, 3000), source: 'ai' };
  });
}
module.exports = { parseScreenplay };
