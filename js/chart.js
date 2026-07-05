/* TraitView chart helpers.
   Classic script on purpose so existing globals and inline handlers keep working. */

/* chart */
let PLOT_BOUND=false, LAST_XS=[];
function computeXYFromBuckets(b){ const xs=[],ys=[]; const maxSeen=Math.max(16,...Object.keys(b).map(Number),0); for(let i=1;i<=maxSeen;i++){ xs.push(i); ys.push(b[i]||0);} return {xs,ys,maxSeen}; }
function colorsFor(xs){ return { fill: xs.map(x => (currentTraitCount===x ? 'rgba(45,212,191,0.95)' : 'rgba(122,162,255,0.88)')), line: xs.map(x => (currentTraitCount===x ? 'rgba(45,212,191,1)' : 'rgba(122,162,255,1)')) }; }
function drawOrUpdateChart(buckets){
  if(typeof Plotly === 'undefined'){ setTimeout(()=>drawOrUpdateChart(buckets), 80); return; }
  const {xs,ys,maxSeen}=computeXYFromBuckets(buckets); LAST_XS=xs; const cols=colorsFor(xs);
  const data=[{x:xs,y:ys,type:'bar',hovertemplate:'Traits %{x}<br>%{y} tokens<extra></extra>',
               marker:{line:{width:1.2,color:cols.line},color:cols.fill},width:0.9}];
  const chartEl = document.getElementById('chartHost');
  const chartW = chartEl ? Math.min((chartEl.parentElement||chartEl).offsetWidth - 16, window.innerWidth - 32) : 900;
  const layout={height:300,bargap:0.25,showlegend:false,margin:{l:48,r:12,t:10,b:48},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',
                font:{color:getComputedStyle(document.body).getPropertyValue('--text')},
                xaxis:{tickmode:'linear',dtick:1,range:[0.2,maxSeen+0.8],title:'Trait count',fixedrange:true},
                yaxis:{title:'Tokens',rangemode:'tozero',fixedrange:true},
                bargap:0.02,bargroupgap:0.02,hovermode:'x',hoverdistance:40,autosize:true};
  const config={displayModeBar:false,responsive:true,scrollZoom:false,fillFrame:false};
  if(!PLOT_BOUND){
    Plotly.newPlot('chartHost', data, layout, config);
    const plot=document.getElementById('chartHost');
    plot.on('plotly_click', async (ev)=>{
      if(!ev?.points?.length) return;
      const c=Number(ev.points[0].x);
      if(!Number.isInteger(c) || c < 1) return;
      currentTraitCount=(currentTraitCount===c?null:c);
      document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.toggle('active',Number(n.dataset.count)===currentTraitCount));
      await renderTokenGridFromState();
      const cols2=colorsFor(LAST_XS);
      Plotly.restyle('chartHost', {'marker.color':[cols2.fill], 'marker.line.color':[cols2.line]}, [0]);
    });
    PLOT_BOUND=true;
  } else {
    Plotly.react('chartHost', data, layout, config);
  }
}
