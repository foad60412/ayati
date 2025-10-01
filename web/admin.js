const seg = document.getElementById('rangeSeg');
const btnRefresh = document.getElementById('refresh');
const btnExport  = document.getElementById('export');

const kVisitors = document.getElementById('kpi-visitors');
const kServed   = document.getElementById('kpi-served');
const kPlays    = document.getElementById('kpi-plays');
const kShares   = document.getElementById('kpi-shares');

const tbody = document.querySelector('#tbl tbody');
const sumV = document.getElementById('sum-visitors');
const sumS = document.getElementById('sum-served');
const sumP = document.getElementById('sum-plays');
const sumSh= document.getElementById('sum-shares');
const sumR = document.getElementById('sum-rate');

let data = [];
let days = 1;          // الافتراضي: يوم واحد
let timer = null;

async function load() {
  const r = await fetch(`/api/stats?days=${days}`, {
    cache:'no-store',
    credentials:'include'
  });
  if (!r.ok) throw new Error('fetch failed');
  data = await r.json();
  render();
}

function render() {
  const today = data[0] || {visitors:0, served:0, plays:0, shares:0};
  kVisitors.textContent = today.visitors || 0;
  kServed.textContent   = today.served   || 0;
  kPlays.textContent    = today.plays    || 0;
  kShares.textContent   = today.shares   || 0;

  tbody.innerHTML = '';
  let tv=0, ts=0, tp=0, tsh=0;
  for (const row of data) {
    const rate = row.visitors ? (row.plays / row.visitors).toFixed(2) : '0';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.day}</td><td>${row.visitors||0}</td><td>${row.served||0}</td>
      <td>${row.plays||0}</td><td>${row.shares||0}</td><td>${rate}</td>`;
    tbody.appendChild(tr);
    tv += row.visitors||0; ts += row.served||0; tp += row.plays||0; tsh += row.shares||0;
  }
  sumV.textContent = tv; sumS.textContent = ts; sumP.textContent = tp; sumSh.textContent = tsh;
  sumR.textContent = tv ? (tp/tv).toFixed(2) : '0';
}

function toCSV(rows){
  const header = ['day','visitors','served','plays','shares','plays_per_visitor'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const rate = r.visitors ? (r.plays/r.visitors).toFixed(4) : '0';
    lines.push([r.day, r.visitors||0, r.served||0, r.plays||0, r.shares||0, rate].join(','));
  }
  return lines.join('\n');
}

/* events */
seg.addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  for (const b of seg.querySelectorAll('.seg-btn')) b.classList.remove('active');
  btn.classList.add('active');
  days = parseInt(btn.dataset.range, 10) || 1;
  load();
  if (timer) clearInterval(timer);
  timer = setInterval(load, 10000);
});
btnRefresh.addEventListener('click', load);
btnExport.addEventListener('click', ()=>{
  const csv = toCSV(data);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `stats_${days}d.csv`; a.click();
  URL.revokeObjectURL(url);
});

/* start: يوم واحد افتراضيًا */
load().catch(()=>alert('تعذّر جلب الإحصاءات'));
timer = setInterval(load, 10000);
