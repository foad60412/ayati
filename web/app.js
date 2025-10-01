const verseEl = document.getElementById('verse');
const refEl   = document.getElementById('ref');
const player  = document.getElementById('player');

const playBtn = document.getElementById('playBtn');
const progEl  = document.getElementById('prog');
const barEl   = document.getElementById('bar');
const timeEl  = document.getElementById('time');

const btnNew  = document.getElementById('btn-new');
const btnShare= document.getElementById('btn-share');
const btnInstallAndroid = document.getElementById('btn-install-android');
const iosCard = document.getElementById('ios-card');

const shareDlg   = document.getElementById('shareDlg');
const shareUrl   = document.getElementById('shareUrl');
const copyBtn    = document.getElementById('copyBtn');
const closeShare = document.getElementById('closeShare');

let current = null;
let deferredPrompt = null;

/* أسماء السور */
const SURAH_NAMES = [null,"الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
"هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
"الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
"لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
"فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
"الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
"الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
"نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
"التكوير","الإنفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
"الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
"القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
"المسد","الإخلاص","الفلق","الناس"];

function fmt(n){const m=Math.floor(n/60),s=Math.floor(n%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

async function fetchAyah() {
  const r = await fetch('/api/random-ayah',{cache:'no-store'});
  current = await r.json();

  verseEl.textContent = current.text || '...';
  const name = SURAH_NAMES[current.surah] || `سورة ${current.surah}`;
  refEl.textContent = `${name} • آية ${current.ayah} (${current.verse_key})`;

  player.src = current.audio_url || '';
  progEl.style.width = '0%';
  timeEl.textContent = '00:00 / 00:00';
  playBtn.textContent = '⏵';
}

/* تحميل أولي + إظهار بطاقة iOS عند Safari */
window.addEventListener('load', async ()=>{
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) iosCard.hidden = false;
  await fetchAyah();
  try{
    await fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'visit'})});
  }catch{}
});

/* آية أخرى */
btnNew.addEventListener('click', fetchAyah);

/* مشغّل الصوت */
playBtn.addEventListener('click', ()=>{
  if (!player.src) return;
  if (player.paused){ player.play(); } else { player.pause(); }
});
player.addEventListener('play', ()=>{
  playBtn.textContent = '⏸';
  try{
    fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'play',meta:{verse_key:current?.verse_key||''}})});
  }catch{}
});
player.addEventListener('pause', ()=>{ playBtn.textContent = '⏵'; });
player.addEventListener('loadedmetadata', ()=>{
  timeEl.textContent = `00:00 / ${isFinite(player.duration)?fmt(player.duration):'00:00'}`;
});
player.addEventListener('timeupdate', ()=>{
  const d = player.duration||0, c = player.currentTime||0;
  if (d>0){ progEl.style.width = `${(c/d)*100}%`; }
  timeEl.textContent = `${fmt(c)} / ${isFinite(d)?fmt(d):'00:00'}`;
});

/* سحب/نقر على الشريط */
function seekFromClientX(x){
  const rect = barEl.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (x - rect.left)/rect.width));
  if (isFinite(player.duration)) player.currentTime = ratio * player.duration;
}
barEl.addEventListener('click', e=>seekFromClientX(e.clientX));
let dragging=false;
barEl.addEventListener('pointerdown', e=>{dragging=true; seekFromClientX(e.clientX);});
addEventListener('pointermove', e=>{ if(dragging) seekFromClientX(e.clientX); });
addEventListener('pointerup', ()=>dragging=false);
barEl.addEventListener('keydown', e=>{
  if(!isFinite(player.duration)) return;
  if(e.key==='ArrowRight'){ player.currentTime = Math.min(player.duration, player.currentTime+2); }
  if(e.key==='ArrowLeft'){ player.currentTime = Math.max(0, player.currentTime-2); }
});

/* مشاركة: Web Share ثم نافذة بديلة */
btnShare.addEventListener('click', async ()=>{
  const url  = location.origin;
  const text = current ? `آيتي اليوم: ${current.text} • ${current.verse_key}` : 'نور آية';
  try{
    if (navigator.share){ await navigator.share({title:'نور آية', text, url}); }
    else { throw new Error('no-web-share'); }
  }catch{
    shareUrl.textContent = `${text}\n${url}`;
    shareDlg.showModal();
  }
});
copyBtn.addEventListener('click', async ()=>{
  try{
    await navigator.clipboard.writeText(shareUrl.textContent);
    copyBtn.textContent='تم النسخ';
    setTimeout(()=>copyBtn.textContent='نسخ',1200);
  }catch{}
});
closeShare.addEventListener('click', ()=>shareDlg.close());

/* Android A2HS */
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  deferredPrompt = e;           // لا نعيد تعريف let هنا
  btnInstallAndroid.hidden = false;
});
btnInstallAndroid.addEventListener('click', async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstallAndroid.hidden = true;
});

/* نجوم الخلفية */
/* خلفية نجوم: ثابتة مع وميض خفيف لعدد قليل */
(function(){
  const cvs = document.getElementById('stars'); if (!cvs) return;
  const ctx = cvs.getContext('2d');

  // إعداد
  const TOTAL = 220;        // إجمالي النجوم
  const TWINKLE_RATIO = 0.10; // نسبة النجوم اللامعة المتحركة
  const twinkleCount = Math.max(3, Math.floor(TOTAL * TWINKLE_RATIO));

  // لوح خارج الشاشة لرسم النجوم الثابتة مرة واحدة
  let off = document.createElement('canvas');
  let offctx = off.getContext('2d');

  // بيانات نجوم الوميض فقط
  let twinklers = [];

  function resize(){
    cvs.width = innerWidth;
    cvs.height = innerHeight;

    off.width = cvs.width;
    off.height = cvs.height;

    // ارسم الخلفية الثابتة (90% من النجوم)
    offctx.clearRect(0,0,off.width,off.height);
    const staticCount = TOTAL - twinkleCount;
    for (let i=0; i<staticCount; i++){
      const x = Math.random()*off.width;
      const y = Math.random()*off.height;
      const r = Math.random()*1.4 + 0.4;
      offctx.fillStyle = 'rgba(255,255,255,0.95)';
      offctx.beginPath(); offctx.arc(x,y,r,0,Math.PI*2); offctx.fill();
    }

    // حضّر نجوم الوميض (أماكن ثابتة، شفافية تتغير)
    twinklers = Array.from({length: twinkleCount}, ()=>({
      x: Math.random()*cvs.width,
      y: Math.random()*cvs.height,
      r: Math.random()*1.6 + 0.6,
      t: Math.random()*Math.PI*2,   // طور البداية
      s: 0.015 + Math.random()*0.02 // سرعة الوميض
    }));
  }

  addEventListener('resize', resize);
  resize();

  function tick(){
    // ارسم الطبقة الثابتة كصورة واحدة
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.drawImage(off, 0, 0);

    // ارسم اللامعات فقط مع تغيير الشفافية
    for (const st of twinklers){
      st.t += st.s;
      const alpha = 0.25 + 0.55 * (0.5 + 0.5*Math.sin(st.t)); // بين ~0.25 و ~0.8
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI*2); ctx.fill();
    }

    requestAnimationFrame(tick);
  }
  tick();
})();
