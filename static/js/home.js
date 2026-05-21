/* ── MindWave Homepage JS ──────────────────────────────────────────────────── */

/* Mobile menu toggle */
function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

/* Smooth scroll for anchor links */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('mobileMenu').classList.remove('open');
    }
  });
});

/* ── Chart defaults (green palette) ────────────────────────────────────────── */
const GREEN = '#16a34a';
const GREEN_L = '#4ade80';
const GREEN_XL = 'rgba(22,163,74,0.08)';
const AMBER = '#f59e0b';
const RED = '#ef4444';

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#9ca3af';

/* ── Emotion timeline preview chart ─────────────────────────────────────────── */
(function buildPreviewChart() {
  const ctx = document.getElementById('previewChart');
  if (!ctx) return;

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const happyData  = [62, 74, 68, 80, 91, 76, 84];
  const stressData = [28, 22, 35, 18, 12, 24, 16];

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Happy',
          data: happyData,
          borderColor: GREEN,
          backgroundColor: 'rgba(22,163,74,0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: GREEN,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.45,
        },
        {
          label: 'Stress',
          data: stressData,
          borderColor: AMBER,
          backgroundColor: 'rgba(245,158,11,0.07)',
          borderWidth: 2,
          pointBackgroundColor: AMBER,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.45,
          borderDash: [4, 3],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          backgroundColor: 'rgba(15,26,15,0.9)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.75)',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { display: false },
          ticks: { callback: v => v + '%', maxTicksLimit: 5 }
        }
      }
    }
  });
})();

/* ── Emotion distribution pie ────────────────────────────────────────────────── */
(function buildPreviewPie() {
  const ctx = document.getElementById('previewPie');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Happy', 'Neutral', 'Sad', 'Angry', 'Other'],
      datasets: [{
        data: [44, 28, 12, 8, 8],
        backgroundColor: ['#16a34a', '#86efac', '#fbbf24', '#f87171', '#c084fc'],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,26,15,0.9)',
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
        }
      }
    }
  });
})();

/* ── Audio energy chart ──────────────────────────────────────────────────────── */
(function buildEnergyChart() {
  const ctx = document.getElementById('previewEnergy');
  if (!ctx) return;

  const segs = 18;
  const energy = Array.from({ length: segs }, (_, i) => {
    const base = 0.4 + 0.5 * Math.sin(i * 0.6);
    return +(base + (Math.random() - 0.5) * 0.2).toFixed(3);
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: energy.map((_, i) => `${i * 5}s`),
      datasets: [{
        label: 'Energy',
        data: energy,
        backgroundColor: energy.map(v =>
          v > 0.75 ? 'rgba(22,163,74,0.85)' :
          v > 0.45 ? 'rgba(74,222,128,0.75)' :
                     'rgba(187,247,208,0.7)'
        ),
        borderRadius: 3,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` Energy: ${(ctx.parsed.y * 100).toFixed(0)}%` }
        }
      },
      scales: {
        x: { display: false },
        y: {
          min: 0, max: 1,
          grid: { color: 'rgba(0,0,0,0.04)' },
          border: { display: false },
          ticks: { callback: v => (v * 100).toFixed(0) + '%', maxTicksLimit: 4 }
        }
      }
    }
  });
})();

/* ── Scroll animations ───────────────────────────────────────────────────────── */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.hn-feat-card, .hn-step, .hn-about-grid, .hn-brain-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  io.observe(el);
});
