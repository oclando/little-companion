(function(root) {
  function filterWords(words, { sources = [], query = '', mode = 'all', wrongIds = [], learnedIds = [] } = {}) {
    const wrong = new Set(wrongIds), learned = new Set(learnedIds), search = query.trim().toLowerCase();
    return words.filter(w => w.front?.trim() && w.back?.trim())
      .filter(w => !sources.length || (w.libraryIds?.length ? w.libraryIds : ['list_default']).some(id => sources.includes(id)))
      .filter(w => !search || `${w.front} ${w.back}`.toLowerCase().includes(search))
      .filter(w => mode === 'all' || (mode === 'due' ? new Date(w.dueAt || w.nextReviewAt || w.createdAt || 0).getTime() <= Date.now() : mode === 'new' ? !learned.has(w.id) && !(w.repetitions || w.reviewCount || w.lastReviewedAt) : wrong.has(w.id) || w.lapses > 0));
  }
  function sampleGroups(words, sourceIds, count=10, learnedIds=[], random=Math.random) {
    const learned=new Set(learnedIds), used=new Set(), ids=[], groups=[];
    const pools=[...new Set(sourceIds)].map(sourceId=>({sourceId,words:filterWords(words,{sources:[sourceId]}).map(w=>({w,rank:random()})).sort((a,b)=>Number(learned.has(a.w.id))-Number(learned.has(b.w.id))||a.rank-b.rank).map(x=>x.w)}));
    for(const pool of pools)groups.push({sourceId:pool.sourceId,wordIds:[]});
    for(let i=0;i<Math.max(1,Math.min(100,Number(count)||10));i++)for(const [j,pool] of pools.entries()){
      const word=pool.words.find(w=>!used.has(w.id));if(!word)continue;
      used.add(word.id);ids.push(word.id);groups[j].wordIds.push(word.id);
    }
    return {ids,groups};
  }
  const api = { filterWords, sampleGroups };
  if (typeof module === 'object') module.exports = api; else root.WordSelection = api;
})(typeof window !== 'undefined' ? window : globalThis);
