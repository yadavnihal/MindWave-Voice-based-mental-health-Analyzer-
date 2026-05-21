/* ── Constants ──────────────────────────────────────────────────────────────── */
const EMOTIONS = ['neutral','happy','sad','fear','angry','disgust','surprised'];
const INV_MAP  = {0:'neutral',1:'happy',2:'sad',3:'fear',4:'angry',5:'disgust',6:'surprised'};
const LABEL_MAP = Object.fromEntries(EMOTIONS.map((e,i) => [e, i]));
const EMO_COLORS = {
  neutral:  '#888780',
  happy:    '#639922',
  sad:      '#378ADD',
  fear:     '#BA7517',
  angry:    '#E24B4A',
  disgust:  '#7F77DD',
  surprised:'#D4537E',
};
const NEG = ['fear','angry','disgust','sad'];

/* ── State ──────────────────────────────────────────────────────────────────── */
let charts       = {};
let currentData  = null;
let sessions     = JSON.parse(localStorage.getItem('mw_sessions') || '[]');
let mediaRecorder = null;
let audioChunks  = [];
let recInterval  = null;
let recSeconds   = 0;
let selectedFile = null;

/* ── Init ────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  checkModelStatus();
  setupNavigation();
  setupDropZone();
  renderHistory();
  showEmptyState(true);
});

/* ── Model status ────────────────────────────────────────────────────────────── */
async function checkModelStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    const pill = document.getElementById('model-pill');
    const txt  = document.getElementById('model-status-text');

    if (data.model_loaded) {
      pill.className = 'model-pill loaded';
      txt.textContent = `model ready · ${data.device}`;
    } else {
      pill.className = 'model-pill error';
      txt.textContent = 'demo mode';
      document.getElementById('demo-badge').style.display = 'inline-flex';
    }
  } catch {
    const pill = document.getElementById('model-pill');
    pill.className = 'model-pill error';
    document.getElementById('model-status-text').textContent = 'server offline';
  }
}

/* ── Navigation ──────────────────────────────────────────────────────────────── */
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
  });
}

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelector(`[data-section="${name}"]`).classList.add('active');

  const titles = { dashboard: 'Dashboard', upload: 'Analyse audio', history: 'Session history' };
  const subs   = {
    dashboard: currentData ? `Last session · ${currentData.duration_seconds}s` : 'No analysis yet',
    upload:    'Upload or record audio to analyse',
    history:   `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`,
  };
  document.getElementById('page-title').textContent = titles[name];
  document.getElementById('page-sub').textContent   = subs[name];
}

/* ── Drop zone ───────────────────────────────────────────────────────────────── */
function setupDropZone() {
  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-input');

  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });

  fi.addEventListener('change', () => {
    if (fi.files[0]) setFile(fi.files[0]);
  });
}

function setFile(file) {
  selectedFile = file;
  const el = document.getElementById('file-chosen');
  el.style.display = 'inline-block';
  el.textContent   = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  document.getElementById('analyse-btn').disabled = false;
  document.getElementById('error-box').style.display = 'none';
}

/* ── Recording ───────────────────────────────────────────────────────────────── */
async function toggleRecord() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecord();
  } else {
    startRecord();
  }
}

async function startRecord() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener('dataavailable', e => audioChunks.push(e.data));
    mediaRecorder.addEventListener('stop', () => {
      const blob = new Blob(audioChunks, { type: 'audio/wav' });
      const file = new File([blob], `recording_${Date.now()}.wav`, { type: 'audio/wav' });
      setFile(file);
      clearInterval(recInterval);
      document.getElementById('record-panel').style.display = 'none';
      document.getElementById('record-btn').classList.remove('recording');
      stream.getTracks().forEach(t => t.stop());
    });

    mediaRecorder.start();
    recSeconds = 0;
    document.getElementById('record-panel').style.display = 'block';
    document.getElementById('record-btn').classList.add('recording');
    buildWaveform();
    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = recSeconds % 60;
      document.getElementById('rec-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
  } catch (err) {
    showError(`Microphone access denied: ${err.message}`);
  }
}

function stopRecord() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function buildWaveform() {
  const wf = document.getElementById('waveform');
  wf.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const b = document.createElement('div');
    b.className = 'wbar';
    b.style.animationDelay = `${(i * 0.05).toFixed(2)}s`;
    b.style.height = `${8 + Math.random() * 28}px`;
    wf.appendChild(b);
  }
}

/* ── Analysis ────────────────────────────────────────────────────────────────── */
async function runAnalysis() {
  if (!selectedFile) return;

  const btn     = document.getElementById('analyse-btn');
  const progWrap = document.getElementById('progress-wrap');
  const progFill = document.getElementById('progress-fill');
  const progLbl  = document.getElementById('progress-label');

  btn.disabled = true;
  progWrap.style.display = 'block';
  document.getElementById('error-box').style.display = 'none';

  const steps = [
    [10,  'Uploading audio…'],
    [35,  'Loading model…'],
    [60,  'Running wav2vec2 inference…'],
    [80,  'Computing emotion probabilities…'],
    [95,  'Building dashboard…'],
  ];

  let stepIdx = 0;
  const progTimer = setInterval(() => {
    if (stepIdx < steps.length) {
      const [pct, label] = steps[stepIdx++];
      progFill.style.width = `${pct}%`;
      progLbl.textContent  = label;
    }
  }, 600);

  try {
    const formData = new FormData();
    formData.append('audio', selectedFile);

    const res  = await fetch('/api/analyze', { method: 'POST', body: formData });
    const data = await res.json();

    clearInterval(progTimer);

    if (!res.ok) {
      showError(data.error || 'Analysis failed.');
      progWrap.style.display = 'none';
      btn.disabled = false;
      return;
    }

    progFill.style.width = '100%';
    progLbl.textContent  = 'Done!';

    setTimeout(() => {
      progWrap.style.display = 'none';
      btn.disabled = false;
      applyResults(data, selectedFile.name);
      saveSession(data, selectedFile.name);
      switchSection('dashboard');
    }, 400);

  } catch (err) {
    clearInterval(progTimer);
    showError(`Network error: ${err.message}`);
    progWrap.style.display = 'none';
    btn.disabled = false;
  }
}

/* ── Render results ──────────────────────────────────────────────────────────── */
function applyResults(data, filename) {
  currentData = { ...data, filename };
  document.getElementById('demo-badge').style.display = data.demo_mode ? 'inline-flex' : 'none';
  renderMetrics(data.metrics, data.overall_average_energy);
  buildAllCharts(data.predictions, data.energy_results);
  showEmptyState(false);
}

function renderMetrics(metrics, avgEnergy) {
  const stress = metrics.stress_score;
  const neg    = metrics.negative_emotion_ratio;
  const mood   = metrics.mood_stability_index;

  setMetric('m-stress', `${stress.toFixed(2)}%`,   stress > 40 ? 'bad' : stress > 20 ? 'warn' : 'ok');
  setMetric('m-neg',    neg.toFixed(2),             neg > 0.5   ? 'bad' : neg > 0.25   ? 'warn' : 'ok');
  setMetric('m-mood',   mood.toFixed(2),            mood > 0.6  ? 'bad' : mood > 0.3   ? 'warn' : 'ok');
  setMetric('m-dom',    metrics.dominant_emotion,   'ok');
  setMetric('m-energy', avgEnergy.toFixed(4),       '');
}

function setMetric(id, val, cls) {
  const el = document.getElementById(id);
  el.textContent  = val;
  el.className    = `mc-val ${cls}`;
}

function showEmptyState(show) {
  const es  = document.getElementById('empty-state');
  const cg  = document.querySelector('.chart-grid');
  const mr  = document.getElementById('metrics-row');
  es.className  = show ? 'empty-state show' : 'empty-state';
  if (cg) cg.style.display  = show ? 'none' : 'grid';
  if (mr) mr.style.display  = show ? 'none' : 'grid';
}

/* ── Charts ──────────────────────────────────────────────────────────────────── */
function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

function baseLineOpts(yConfig = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    layout: { padding: { top: 4, right: 6 } },
    scales: {
      x: {
        grid: { color: 'rgba(180,178,169,0.25)' },
        ticks: { font: { size: 10 }, color: '#888780', maxTicksLimit: 8 },
      },
      y: {
        grid: { color: 'rgba(180,178,169,0.25)' },
        ticks: { font: { size: 10 }, color: '#888780' },
        ...yConfig,
      },
    },
  };
}

function buildAllCharts(predictions, energy_results) {
  destroyCharts();

  const tFmt    = t => `${parseFloat(t).toFixed(1)}s`;
  const times   = predictions.map(p => tFmt(p.start_time_seconds));
  const emoNums = predictions.map(p => LABEL_MAP[p.predicted_emotion] ?? 0);
  const stressIdx = predictions.map(p =>
    NEG.reduce((s, e) => s + (p.probabilities?.[e] || 0), 0)
  );

  const eTimes = energy_results.map(e => tFmt(e.start_time_seconds));
  const eVals  = energy_results.map(e => parseFloat(e.energy.toFixed(4)));

  /* Chart 1 – emotion over time */
  charts.c1 = new Chart(document.getElementById('c1'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        data: emoNums,
        borderColor: '#378ADD',
        backgroundColor: 'rgba(55,138,221,0.07)',
        pointRadius: 5,
        pointBackgroundColor: predictions.map(p => EMO_COLORS[p.predicted_emotion] || '#888'),
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      ...baseLineOpts({
        min: -0.5, max: 6.5,
        ticks: {
          font: { size: 9 }, color: '#888780', stepSize: 1,
          callback: v => INV_MAP[Math.round(v)] || '',
        },
      }),
    },
  });

  /* Chart 2 – energy */
  charts.c2 = new Chart(document.getElementById('c2'), {
    type: 'line',
    data: {
      labels: eTimes,
      datasets: [{
        data: eVals,
        borderColor: '#1D9E75',
        backgroundColor: 'rgba(29,158,117,0.07)',
        pointRadius: 4,
        pointBackgroundColor: '#1D9E75',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      }],
    },
    options: baseLineOpts({ min: 0, max: 1 }),
  });

  /* Chart 3 – stress index */
  const stressFormatted = stressIdx.map(v => parseFloat(v.toFixed(3)));
  charts.c3 = new Chart(document.getElementById('c3'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        data: stressFormatted,
        borderColor: '#E24B4A',
        backgroundColor: 'rgba(226,75,74,0.07)',
        pointRadius: 4,
        pointBackgroundColor: '#E24B4A',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      }],
    },
    options: baseLineOpts({ min: 0, max: 1 }),
  });

  /* Chart 4 – pie */
  const emoCounts = {};
  predictions.forEach(p => { emoCounts[p.predicted_emotion] = (emoCounts[p.predicted_emotion] || 0) + 1; });
  const pieLabels = Object.keys(emoCounts);
  const pieData   = pieLabels.map(k => emoCounts[k]);
  const pieColors = pieLabels.map(k => EMO_COLORS[k] || '#888');
  const total     = pieData.reduce((a, b) => a + b, 0);

  charts.c4 = new Chart(document.getElementById('c4'), {
    type: 'pie',
    data: {
      labels: pieLabels,
      datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      layout: { padding: 6 },
    },
  });

  /* Pie legend */
  const leg = document.getElementById('pie-legend');
  leg.innerHTML = pieLabels.map((l, i) => `
    <div class="pie-legend-item">
      <div class="pie-legend-dot" style="background:${pieColors[i]}"></div>
      <span>${l}</span>
      <span class="pie-legend-val">${((pieData[i] / total) * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

/* ── Session history ─────────────────────────────────────────────────────────── */
function saveSession(data, filename) {
  const session = {
    id:        Date.now(),
    filename,
    timestamp: new Date().toLocaleString(),
    duration:  data.duration_seconds,
    metrics:   data.metrics,
    avgEnergy: data.overall_average_energy,
    demo:      data.demo_mode,
    data,
  };
  sessions.unshift(session);
  if (sessions.length > 20) sessions.pop();
  localStorage.setItem('mw_sessions', JSON.stringify(sessions));
  renderHistory();
}

function renderHistory() {
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');

  if (sessions.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = sessions.map(s => {
    const dom   = s.metrics.dominant_emotion || '—';
    const color = EMO_COLORS[dom] || '#888';
    const stress = s.metrics.stress_score?.toFixed(1) || '—';
    const cls   = s.metrics.stress_score > 40 ? 'bad' : s.metrics.stress_score > 20 ? 'warn' : 'ok';
    return `
      <div class="history-item" onclick="loadSession(${s.id})">
        <div class="hi-emo" style="background:${color}22;color:${color}">${dom.slice(0,3).toUpperCase()}</div>
        <div class="hi-info">
          <div class="hi-name">${s.filename}${s.demo ? ' <span style="font-size:10px;color:#BA7517">(demo)</span>' : ''}</div>
          <div class="hi-meta">${s.timestamp} · ${s.duration}s · ${s.metrics.total_segments} segments</div>
        </div>
        <div class="hi-stress mc-val ${cls}" style="font-size:14px">${stress}%</div>
      </div>
    `;
  }).join('');
}

function loadSession(id) {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  applyResults(session.data, session.filename);
  switchSection('dashboard');
}

/* ── Utility ─────────────────────────────────────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById('error-box');
  el.textContent  = msg;
  el.style.display = 'block';
}
