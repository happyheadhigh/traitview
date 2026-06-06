/* TraitView comboInsights helpers.
   Classic script on purpose so existing globals and inline handlers keep working. */

const COMBO_ROWS_CACHE = { ready:false, promise:null, rows:[] };
const COMBO_COUNT_CACHE = new Map();
const COMBO_INSIGHT_CACHE = new Map();

function comboNorm(s){ return String(s || '').trim().toLowerCase(); }
function comboPartTrait(part){ return part?.trait || part?.name || ''; }
function comboPartKey(part){ return `${comboNorm(comboPartTrait(part))}=${comboNorm(part.value)}`; }
function comboHasPart(row, part){
  const wantTrait = comboNorm(comboPartTrait(part));
  const wantValue = comboNorm(part.value);
  return row.entries.some(([k,v]) => comboNorm(k) === wantTrait && comboNorm(v) === wantValue);
}
function comboTraitCountLabel(count){
  return count === 1 ? '1 of 1' : `Only ${count}`;
}
function comboPct(count){
  const total = TOKEN_COUNT || 10000;
  const pct = total ? (count / total) * 100 : 0;
  return pct < 0.1 ? pct.toFixed(3) : pct.toFixed(2);
}
function comboTraitPhrase(entry){
  if(!entry) return '';
  return `${entry.value}`;
}
function comboPartName(entry){
  return entry ? entry.name : '';
}
function comboPluralType(typeValue){
  const s = String(typeValue || 'tokens').trim();
  if(!s) return 'tokens';
  if(/s$/i.test(s)) return s;
  return `${s}s`;
}
function comboFindTrait(entries, patterns){
  return entries.find(([k,v]) => patterns.some(re => re.test(k) || re.test(v)))
    ? (() => {
        const hit = entries.find(([k,v]) => patterns.some(re => re.test(k) || re.test(v)));
        return { name: hit[0], value: hit[1] };
      })()
    : null;
}
function comboUniqueParts(parts){
  const seen = new Set();
  return parts.filter(Boolean).filter(part => {
    const key = comboPartKey(part);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function ensureComboRows(){
  if(COMBO_ROWS_CACHE.ready) return COMBO_ROWS_CACHE.rows;
  if(COMBO_ROWS_CACHE.promise) return COMBO_ROWS_CACHE.promise;
  COMBO_ROWS_CACHE.promise = (async()=>{
    const rows = [];
    for(const idx of indices()){
      const ch = await ensureChunk(idx);
      for(const [sid,data] of Object.entries(ch || {})){
        const id = +sid;
        if(!Number.isFinite(id) || id < 1 || id > (TOKEN_COUNT || 10000)) continue;
        const entries = keepEntries(data.traits);
        if(entries.length) rows.push({ id, entries });
      }
    }
    COMBO_ROWS_CACHE.rows = rows;
    COMBO_ROWS_CACHE.ready = true;
    return rows;
  })();
  return COMBO_ROWS_CACHE.promise;
}
async function comboCount(parts, notParts){
  const yes = comboUniqueParts(parts || []);
  const no = comboUniqueParts(notParts || []);
  if(!yes.length) return 0;
  const key = yes.map(comboPartKey).sort().join('|') + (no.length ? `!${no.map(comboPartKey).sort().join('|')}` : '');
  if(COMBO_COUNT_CACHE.has(key)) return COMBO_COUNT_CACHE.get(key);
  const rows = await ensureComboRows();
  let count = 0;
  for(const row of rows){
    if(yes.every(part => comboHasPart(row, part)) && no.every(part => !comboHasPart(row, part))) count++;
  }
  COMBO_COUNT_CACHE.set(key, count);
  return count;
}
function comboVisualTraits(entries){
  const type = comboFindTrait(entries, [/^type$/i, /base/i, /skin/i, /body/i, /species/i]);
  const eyes = comboFindTrait(entries, [/eyes?/i]);
  const teeth = comboFindTrait(entries, [/teeth/i, /mouth/i, /grill/i]);
  const hair = comboFindTrait(entries, [/^hair$/i, /hair/i]);
  const facialHair = comboFindTrait(entries, [/facial/i, /beard/i, /mustache/i, /moustache/i]);
  const headwear = comboFindTrait(entries, [/headwear/i, /\bhat\b/i, /\bcap\b/i, /crown/i, /helmet/i]);
  const jewellery = comboFindTrait(entries, [/jewellery/i, /jewelry/i, /chain/i, /earring/i, /bracelet/i, /necklace/i, /ring/i, /watch/i, /grill/i]);
  return { type, eyes, teeth, hair, facialHair, headwear, jewellery };
}
function comboInsightSort(a,b){
  if(a.count !== b.count) return a.count - b.count;
  return b.weight - a.weight;
}
function pushComboInsight(list, insight){
  if(!insight || !insight.text || !insight.count) return;
  const key = insight.text.toLowerCase();
  if(list.some(i => i.text.toLowerCase() === key)) return;
  list.push(insight);
}
async function buildComboInsights(id, row){
  id = +id;
  if(COMBO_INSIGHT_CACHE.has(id)) return COMBO_INSIGHT_CACHE.get(id);
  const entries = keepEntries(row.traits);
  const total = TOKEN_COUNT || 10000;
  const visual = comboVisualTraits(entries);
  const type = visual.type;
  const traitStats = entries.map(([name,value]) => {
    const count = (TRAIT_FREQ[name]?.[value]) || 1;
    const pct = total ? (count / total) * 100 : 0;
    return { name, value, count, pct };
  }).sort((a,b) => a.count - b.count);
  const insights = [];
  const rareLimit = Math.max(4, Math.floor(total * 0.01));

  for(const t of traitStats.slice(0, 5)){
    if(t.count <= rareLimit){
      pushComboInsight(insights, {
        count: t.count,
        weight: 70 - t.count,
        label: comboTraitCountLabel(t.count),
        text: `${comboTraitPhrase(t)} appears on only ${t.count} OCAS.`,
        meta: `${traitDisplayLabel(t.name)} - ${comboPct(t.count)}% of collection`
      });
    }
  }

  if(type){
    for(const t of traitStats){
      if(comboPartKey(t) === comboPartKey(type)) continue;
      const count = await comboCount([type, t]);
      if(count > 0 && count <= Math.max(5, Math.floor(total * 0.005))){
        pushComboInsight(insights, {
          count,
          weight: 92 - count,
          label: count === 1 ? 'Type match' : 'Type combo',
          text: count === 1
            ? `This is the only ${type.value} with ${t.value}.`
            : `Only ${count} ${comboPluralType(type.value)} have ${t.value}.`,
          meta: `${traitDisplayLabel(type.name)} + ${traitDisplayLabel(t.name)}`
        });
      }
    }
  }

  const allTraitParts = traitStats.map(t => ({ name:t.name, value:t.value, count:t.count }));
  for(let a = 0; a < allTraitParts.length; a++){
    for(let b = a + 1; b < allTraitParts.length; b++){
      const p1 = allTraitParts[a], p2 = allTraitParts[b];
      if(comboPartKey(p1) === comboPartKey(p2)) continue;
      const count = await comboCount([p1, p2]);
      if(count > 0 && count <= Math.max(4, Math.floor(total * 0.004))){
        pushComboInsight(insights, {
          count,
          weight: 84 - count,
          label: count === 1 ? '1 of 1' : 'Rare combo',
          text: count === 1
            ? `No other OCAS shares this ${traitDisplayLabel(p1.name)} + ${traitDisplayLabel(p2.name)} combo.`
            : `Only ${count} OCAS share this ${traitDisplayLabel(p1.name)} + ${traitDisplayLabel(p2.name)} combo.`,
          meta: `${traitDisplayLabel(p1.name)}: ${p1.value} + ${traitDisplayLabel(p2.name)}: ${p2.value}`
        });
      }
    }
  }

  const comboDefs = [
    { label:'Rare combo', parts:[visual.type, visual.eyes], name:'Type + Eyes', weight:86 },
    { label:'Rare combo', parts:[visual.type, visual.teeth], name:'Type + Teeth', weight:86 },
    { label:'Rare combo', parts:[visual.type, visual.hair], name:'Type + Hair', weight:82 },
    { label:'Rare combo', parts:[visual.type, visual.headwear], name:'Type + Headwear', weight:80 },
    { label:'Rare combo', parts:[visual.type, visual.jewellery], name:'Type + Jewellery', weight:76 },
    { label:'Face combo', parts:[visual.eyes, visual.teeth], name:'Eyes + Teeth', weight:78 },
    { label:'Style combo', parts:[visual.hair, visual.headwear], name:'Hair + Headwear', weight:72 },
    { label:'Face combo', parts:[visual.type, visual.eyes, visual.teeth], name:'Type + Eyes + Teeth', weight:94 },
    { label:'Face combo', parts:[visual.type, visual.eyes, visual.teeth, visual.hair], name:'Type + Eyes + Teeth + Hair', weight:96 }
  ];

  for(const def of comboDefs){
    const parts = comboUniqueParts(def.parts);
    if(parts.length < 2 || parts.length !== def.parts.filter(Boolean).length) continue;
    const count = await comboCount(parts);
    if(count > 0 && count <= Math.max(8, Math.floor(total * 0.008))){
      pushComboInsight(insights, {
        count,
        weight: def.weight - count,
        label: count === 1 ? '1 of 1' : def.label,
        text: count === 1
          ? `No other OCAS shares this ${def.name} combo.`
          : `Only ${count} OCAS share this ${def.name} combo.`,
        meta: parts.map(p => `${traitDisplayLabel(p.name)}: ${p.value}`).join(' + ')
      });
    }
  }

  const faceParts = comboUniqueParts([visual.type, visual.eyes, visual.teeth, visual.hair, visual.facialHair, visual.headwear]);
  if(faceParts.length >= 3){
    const count = await comboCount(faceParts);
    if(count > 0 && count <= 4){
      pushComboInsight(insights, {
        count,
        weight: 110 - count,
        label: count === 1 ? '1 of 1' : 'Closest face',
        text: count === 1
          ? 'No other OCAS shares this high-impact face combo.'
          : `Only ${count} OCAS share this high-impact face combo.`,
        meta: faceParts.map(p => traitDisplayLabel(p.name)).join(' + ')
      });
    }
  }

  if(type){
    for(const t of traitStats.slice(0, 8)){
      if(comboPartKey(t) === comboPartKey(type) || t.count > 30) continue;
      const domain = TRAIT_DOMAIN[type.name] || [];
      const values = domain instanceof Set ? [...domain] : (Array.isArray(domain) ? domain : Object.keys(domain));
      let top = null;
      for(const typeValue of values.slice(0, 24)){
        const candidate = { name:type.name, value:typeValue };
        const count = await comboCount([t, candidate]);
        if(!top || count > top.count) top = { value:typeValue, count };
      }
      const exceptionCount = top ? t.count - top.count : 0;
      if(top && top.value !== type.value && exceptionCount > 0 && exceptionCount <= 4){
        pushComboInsight(insights, {
          count: exceptionCount,
          weight: 68 - exceptionCount,
          label: 'Trait exception',
          text: `Only ${exceptionCount} ${t.value} OCAS are not ${top.value}.`,
          meta: `${traitDisplayLabel(t.name)} exception within ${traitDisplayLabel(type.name)}`
        });
        break;
      }
    }
  }

  const best = insights.sort(comboInsightSort).slice(0, 6);
  const result = { insights: best, rarest: traitStats.slice(0, 4) };
  COMBO_INSIGHT_CACHE.set(id, result);
  return result;
}
function renderComboInsights(data){
  if(!data.insights.length){
    const rare = data.rarest.map(t => `${comboEsc(t.value)} (${t.count})`).join(', ');
    return `<div class="combo-insights-fallback">No extreme combo insights found, but this token's rarest traits are: ${rare || 'not available'}.</div>`;
  }
  return `<div class="combo-insights-list">${data.insights.map(i => `
    <div class="combo-insight-card">
      <div class="combo-insight-label">${comboEsc(i.label)}</div>
      <div class="combo-insight-text">
        ${comboEsc(i.text)}
        <div class="combo-insight-meta">${comboEsc(i.meta)} - ${comboPct(i.count)}%</div>
      </div>
    </div>`).join('')}</div>`;
}
async function hydrateComboInsights(id, row){
  const body = document.getElementById('comboInsightsBody');
  if(!body) return;
  const tokenId = +id;
  body.innerHTML = '<div class="combo-insights-fallback">Analyzing local trait combos...</div>';
  try{
    const data = await buildComboInsights(tokenId, row);
    if(window._modalCurrentId !== tokenId) return;
    body.innerHTML = renderComboInsights(data);
  }catch(e){
    console.warn('[ComboInsights] failed:', e);
    if(window._modalCurrentId !== tokenId) return;
    body.innerHTML = '<div class="combo-insights-fallback">Combo insights could not be generated for this token.</div>';
  }
}
function toggleComboInsights(){
  const panel = document.getElementById('comboInsightsPanel');
  const btn = document.getElementById('comboInsightsToggle');
  if(!panel) return;
  const collapsed = panel.classList.toggle('is-collapsed');
  if(btn) btn.textContent = collapsed ? 'Show' : 'Hide';
}
