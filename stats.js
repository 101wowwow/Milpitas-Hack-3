// Basic stats logic for the Analysis page
// Reads `userStats` from localStorage if available, otherwise generates sample data.
// Computes a burnout score and renders two Chart.js charts.

(function(){
  // Helpers to generate sample data for the last 30 days
  function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
  function formatDate(d){ return d.toISOString().slice(0,10); }

  function generateSample(days=30){
    const data=[];
    for(let i=days-1;i>=0;i--){
      const date=daysAgo(i);
      // stress 0-10, happiness 0-10, energy 0-10, social 0-10, confidence 0-10
      const stress = Math.round(Math.max(0, Math.min(10, 3 + Math.random()*6 + (i<7?1:0))));
      const happiness = Math.round(Math.max(0, Math.min(10, 7 - Math.random()*4 - (i<7?1:0))));
      const workScreenTime = +(Math.round((Math.random()*6 + (i<7?1:0))*10)/10); // hours
      const casualScreenTime = +(Math.round((Math.random()*3 + Math.random()*2)*10)/10);
      const taskCompletionRate = +(Math.round((0.6 + Math.random()*0.4 - (i<7?0.05:0))*100)/100);
      const energy = Math.round(Math.max(0, Math.min(10, 5 + Math.random()*4 - (i<7?1:0))));
      const social = Math.round(Math.max(0, Math.min(10, 4 + Math.random()*4 - (i<7?1:0))));
      const confidence = Math.round(Math.max(0, Math.min(10, 5 + Math.random()*4 - (i<7?1:0))));
      const missedPlanned = Math.random() < 0.15 ? 1 : 0; // boolean
      data.push({ date: formatDate(date), stress, happiness, workScreenTime, casualScreenTime, taskCompletionRate, energy, social, confidence, missedPlanned });
    }
    return data;
  }

  // Map questionnaire string values to numeric scales 0-10
  const MAPS = {
    stress: { 'Very low': 0, 'Low': 2.5, 'Medium': 5, 'High': 7.5, 'Very high': 10 },
    mood: { 'Very low': 0, 'Low': 2.5, 'Neutral': 5, 'Good': 7.5, 'Very good': 10 },
    sleep: { 'Poor': 2, 'Fair': 4, 'Okay': 6, 'Good': 8, 'Great': 10 }
  };

  function loadStats(){
    try{
      const qRaw = localStorage.getItem('dailyQuestionnaireEntries');
      const scheduleRaw = localStorage.getItem('schedulePatternEntries');
      const questionnaires = qRaw ? JSON.parse(qRaw) : [];
      const schedules = scheduleRaw ? JSON.parse(scheduleRaw) : [];

      // Build date map for last 30 days
      const days = 30;
      const result = [];
      for(let i=days-1;i>=0;i--){
        const d = new Date(); d.setDate(d.getDate()-i);
        const date = d.toISOString().slice(0,10);

        // find latest questionnaire for date
        const qForDate = questionnaires.filter(q=>q.date===date).slice(-1)[0];

        // basic defaults
        const stress = qForDate ? (MAPS.stress[qForDate.stress] ?? 0) : null;
        const happiness = qForDate ? (MAPS.mood[qForDate.mood] ?? null) : null;
        const energy = qForDate ? (MAPS.sleep[qForDate.sleepQuality] ?? null) : null;

        // schedule-derived flags (missed planned tasks not explicitly tracked) - default 0
        const missedPlanned = 0;

        // no screen time data available in this app; leave as null so charts can fall back to 0 when rendering
        const workScreenTime = null;
        const casualScreenTime = null;

        const taskCompletionRate = null;

        result.push({ date, stress, happiness, workScreenTime, casualScreenTime, taskCompletionRate, energy, social: null, confidence: null, missedPlanned });
      }

      // if there's no questionnaire data at all, fall back to generated sample data for demo
      const hasAny = result.some(r=>r.stress !== null || r.happiness !== null);
      if(!hasAny) return generateSample(30);
      return result;
    }catch(e){ return generateSample(30); }
  }

  const stats = loadStats();

  // Compute burn-out risk score 0-100 from weighted factors
  function computeBurnout(latest, history){
    // weights
    const w = {
      workScreenTime: 14,
      stress: 18,
      happiness: 16,
      energy: 12,
      social: 10,
      confidence: 12,
      missedPlanned: 18
    };

    // normalize each metric to 0-1 risk
    const workScreen = (typeof latest.workScreenTime === 'number') ? latest.workScreenTime : 0;
    const stressVal = (typeof latest.stress === 'number') ? latest.stress : 5;
    const happinessVal = (typeof latest.happiness === 'number') ? latest.happiness : 5;
    const energyVal = (typeof latest.energy === 'number') ? latest.energy : 5;
    const socialVal = (typeof latest.social === 'number') ? latest.social : 5;
    const confidenceVal = (typeof latest.confidence === 'number') ? latest.confidence : 5;
    const normWork = Math.min(1, workScreen/8); // 8+ hours high
    const normStress = Math.min(1, stressVal/10);
    const normHappiness = 1 - Math.min(1, happinessVal/10);
    const normEnergy = 1 - Math.min(1, energyVal/10);
    const normSocial = 1 - Math.min(1, socialVal/10);
    const normConfidence = 1 - Math.min(1, confidenceVal/10);
    const normMissed = latest.missedPlanned ? 1 : 0;

    // additional trend factors: declining happiness, increasing stress
    let trend = 0;
    const last7 = history.slice(-7);
    if(last7.length>=2){
      const hStart = (typeof last7[0].happiness === 'number') ? last7[0].happiness : 5;
      const hEnd = (typeof last7[last7.length-1].happiness === 'number') ? last7[last7.length-1].happiness : 5;
      const sStart = (typeof last7[0].stress === 'number') ? last7[0].stress : 5;
      const sEnd = (typeof last7[last7.length-1].stress === 'number') ? last7[last7.length-1].stress : 5;
      const hDiff = (hEnd - hStart);
      const sDiff = (sEnd - sStart);
      // if happiness declined, increase risk; if stress increased, increase risk
      trend += Math.min(1, Math.max(0, -hDiff/10))*10; // up to 10 points
      trend += Math.min(1, Math.max(0, sDiff/10))*12; // up to 12 points
    }

    // weighted sum
    const score = Math.round(
      100 * (
        (w.workScreenTime*normWork + w.stress*normStress + w.happiness*normHappiness + w.energy*normEnergy + w.social*normSocial + w.confidence*normConfidence + w.missedPlanned*normMissed) / Object.values(w).reduce((a,b)=>a+b,0)
      ) + trend
    );

    return Math.max(0, Math.min(100, score));
  }

  function updateMeter(){
    const latest = stats[stats.length-1];
    const score = computeBurnout(latest, stats);
    const fill = document.getElementById('burnout-fill');
    const text = document.getElementById('burnout-text');
    const reasons = document.getElementById('burnout-reasons');
    const stress4 = document.getElementById('stress-4d');

    // compute simple reason list
    const reasonsArr = [];
    if(latest.workScreenTime>=8) reasonsArr.push('High work screentime');
    if(latest.stress>=7) reasonsArr.push('High stress');
    if(latest.happiness<=4) reasonsArr.push('Low happiness');
    if(latest.energy<=4) reasonsArr.push('Low energy');
    if(latest.social<=3) reasonsArr.push('Low social');
    if(latest.confidence<=4) reasonsArr.push('Low confidence');
    if(latest.missedPlanned) reasonsArr.push('Missed planned tasks');

    fill.style.width = score + '%';
    text.textContent = score + '%';
    reasons.textContent = reasonsArr.length ? reasonsArr.join(' • ') : 'No major flags';

    // 4-day stress sum
    const last4 = stats.slice(-4).map(s=>s.stress||0);
    const sum4 = last4.reduce((a,b)=>a+b,0);
    stress4.textContent = sum4;

    // if sum surpasses 30, visually emphasize
    if(sum4>30){
      fill.style.boxShadow = '0 0 12px rgba(239,68,68,0.35)';
      reasons.textContent = 'Recent high stress • ' + reasons.textContent;
    } else {
      fill.style.boxShadow = 'none';
    }
  }

  // Chart rendering
  let timeseriesChart=null, xyChart=null;

  function renderTimeseries(metric){
    const ctx = document.getElementById('timeseries-chart').getContext('2d');
    const labels = stats.map(s=>s.date);
    const data = stats.map(s=>{
      if(metric==='taskCompletionRate') return Math.round((s.taskCompletionRate||0)*100);
      if(metric==='workScreenTime' || metric==='casualScreenTime') return s[metric];
      return s[metric];
    });

    const datasetLabel = metric.replace(/([A-Z])/g, ' $1');

    if(timeseriesChart) timeseriesChart.destroy();
    timeseriesChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: datasetLabel, data, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.12)', tension:0.2, fill:true }] },
      options: { responsive:true, maintainAspectRatio:false, scales:{ y: { beginAtZero:true } } }
    });
  }

  function renderXY(xkey,ykey){
    const ctx = document.getElementById('xy-chart').getContext('2d');
    const points = stats.map(s=>({ x: s[xkey], y: s[ykey], label: s.date }));

    if(xyChart) xyChart.destroy();
    xyChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [{ label: `${xkey} vs ${ykey}`, data: points, backgroundColor:'#ef4444' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ title: (items)=> items[0].raw.label, label: (ctx)=> `x: ${ctx.raw.x}, y: ${ctx.raw.y}` } } }, scales:{ x:{ title:{ display:true, text: xkey } }, y:{ title:{ display:true, text: ykey } } } }
    });
  }

  // wire controls
  document.addEventListener('DOMContentLoaded', function(){
    updateMeter();
    renderTimeseries(document.getElementById('timeseries-metric').value);
    renderXY(document.getElementById('xy-x').value, document.getElementById('xy-y').value);

    document.getElementById('refresh-timeseries').addEventListener('click', function(){
      renderTimeseries(document.getElementById('timeseries-metric').value);
    });
    document.getElementById('refresh-xy').addEventListener('click', function(){
      renderXY(document.getElementById('xy-x').value, document.getElementById('xy-y').value);
    });
  });

})();
