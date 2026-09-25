/* TraitView chart helpers.
   Classic script on purpose so existing globals and inline handlers keep working. */

/* chart */
let PLOT_BOUND=false, LAST_XS=[];
// jv: "make sure that on desktop that the bar graph correctly only shows
// the per collection trait counts as well and not the 0 counts" -- same
// bug as the trait-count pills (renderTraitChips in app.js): the old
// Math.max(16, ...) floor and the for-loop starting from 1 meant every
// collection always showed bars for counts 1-16 regardless of what's
// actually in it, including dead zero-height bars below and above the
// collection's real range. Only including counts that actually have at
// least one token now, for whatever range a given collection actually has
// -- xs/ys can be a sparse, non-contiguous-from-1 list (e.g. [3,4,5,6,7]),
// which Plotly's bar type handles correctly since it just plots the given
// (x,y) pairs directly, not an implied contiguous range.
function computeXYFromBuckets(b){
  const xs=[],ys=[];
  const allCounts = Object.keys(b).map(Number).filter(c => (b[c]||0) > 0).sort((a,c) => a-c);
  for(const c of allCounts){ xs.push(c); ys.push(b[c]); }
  const maxSeen = xs.length ? xs[xs.length-1] : 0;
  const minSeen = xs.length ? xs[0] : 0;
  return {xs,ys,maxSeen,minSeen};
}
function colorsFor(xs){ return { fill: xs.map(x => (currentTraitCount===x ? 'rgba(45,212,191,0.95)' : 'rgba(122,162,255,0.88)')), line: xs.map(x => (currentTraitCount===x ? 'rgba(45,212,191,1)' : 'rgba(122,162,255,1)')) }; }
function drawOrUpdateChart(buckets){
  if(typeof Plotly === 'undefined'){ window.ensurePlotly && window.ensurePlotly(); setTimeout(()=>drawOrUpdateChart(buckets), 80); return; }
  const {xs,ys,maxSeen,minSeen}=computeXYFromBuckets(buckets); LAST_XS=xs; const cols=colorsFor(xs);
  const data=[{x:xs,y:ys,type:'bar',hovertemplate:'Traits %{x}<br>%{y} tokens<extra></extra>',
               marker:{line:{width:1.2,color:cols.line},color:cols.fill},width:0.9}];
  const chartEl = document.getElementById('chartHost');
  const chartW = chartEl ? Math.min((chartEl.parentElement||chartEl).offsetWidth - 16, window.innerWidth - 32) : 900;
  const layout={height:300,bargap:0.25,showlegend:false,margin:{l:48,r:12,t:10,b:48},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',
                font:{color:getComputedStyle(document.body).getPropertyValue('--text')},
                xaxis:{tickmode:'linear',dtick:1,range:[minSeen-0.8,maxSeen+0.8],title:'Trait count',fixedrange:true},
                yaxis:{title:'Tokens',rangemode:'tozero',fixedrange:true},
                bargap:0.02,bargroupgap:0.02,hovermode:'x',hoverdistance:40,autosize:true};
  const config={displayModeBar:false,responsive:true,scrollZoom:false,fillFrame:false};
  if(!PLOT_BOUND){
    Plotly.newPlot('chartHost', data, layout, config);
    const plot=document.getElementById('chartHost');
    plot.on('plotly_click', async (ev)=>{
      if(!ev?.points?.length) return;
      const c=Number(ev.points[0].x);
      // jv: "on mobile I can click the 0 trait bar because it's too small" --
      // not actually a hitbox-size issue at all: `c < 1` here excluded a
      // click on the 0 bar entirely, no matter how squarely it was tapped,
      // since the histogram itself legitimately shows a real 0-trait-count
      // bar (computeXYFromBuckets above only includes counts with at least
      // one token in them, and 0 is a valid trait count some tokens
      // actually have). Changed to `c < 0` so 0 is treated the same as any
      // other real bar -- negative values, which should never occur, stay
      // excluded.
      if(!Number.isInteger(c) || c < 0) return;
      currentTraitCount=(currentTraitCount===c?null:c);
      document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.toggle('active',Number(n.dataset.count)===currentTraitCount));
      await renderTokenGridFromState();
      // jv: "the pill for it isn't showing anymore when a trait count is
      // selected" -- this handler updated currentTraitCount, re-rendered
      // the grid, and recolored the bar, but never called
      // updateActivePills() at all, the one function that actually renders
      // the removable pill for currentTraitCount (js/app.js). Selecting a
      // trait count via the sidebar's own dropdown must go through a
      // different path that already calls it; this histogram's own click
      // never did.
      if(typeof updateActivePills === 'function') updateActivePills();
      const cols2=colorsFor(LAST_XS);
      Plotly.restyle('chartHost', {'marker.color':[cols2.fill], 'marker.line.color':[cols2.line]}, [0]);
    });
    PLOT_BOUND=true;
  } else {
    Plotly.react('chartHost', data, layout, config);
  }
}
