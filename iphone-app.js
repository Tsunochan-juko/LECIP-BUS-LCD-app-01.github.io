let rosenList = {};      
  let selectedValue = "";  
  let mawashi = 0;         
  const baseW = 598; const baseH = 336;
  const queryParams = new URLSearchParams(location.search);
  const pageMode = document.body.dataset.mode || (queryParams.get('mode') === 'display' ? 'display' : 'controller');
  document.body.classList.add(`mode-${pageMode}`);
  let lastRemoteEventId = null;
  let hasInitialSnapshot = false;
  let audioUnlocked = false;

  function roleLink(mode) {
    const targetPage = mode === 'display' ? 'ipad.html' : 'iphone.html';
    const url = new URL(targetPage, location.href);
    return url.href;
  }
  document.getElementById('login-button').addEventListener('click', async () => {
    if (!window.firebaseBus) { document.getElementById('connection-status').textContent = 'firebase-config.js の設定が必要です'; return; }
    try {
      await window.firebaseBus.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
      document.getElementById('connection-status').textContent = 'ログインしました。同期中です';
    } catch (error) { document.getElementById('connection-status').textContent = `ログイン失敗: ${error.message}`; }
  });
  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.firebaseBus?.logout();
    document.getElementById('login-close').hidden=true;
    document.body.classList.add('auth-required');
    document.getElementById('connection-status').textContent = 'ログアウトしました';
    document.getElementById('login-button').style.display = 'inline-block';
    document.getElementById('logout-button').style.display = 'none';
  });
  const ttsVoiceSelect = document.getElementById('tts-voice');
  function refreshTtsVoices() {
    if (!('speechSynthesis' in window)) {
      ttsVoiceSelect.disabled = true;
      document.getElementById('connection-status').textContent = 'このブラウザーは音声読み上げに対応していません';
      return;
    }
    const previous = localStorage.getItem('bus-display-tts-voice') || '';
    const japaneseVoices = speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('ja'));
    ttsVoiceSelect.innerHTML = '<option value="">端末の標準音声</option>';
    for (const voice of japaneseVoices) {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      ttsVoiceSelect.appendChild(option);
    }
    if ([...ttsVoiceSelect.options].some(option => option.value === previous)) ttsVoiceSelect.value = previous;
  }
  if ('speechSynthesis' in window) {
    refreshTtsVoices();
    speechSynthesis.addEventListener('voiceschanged', refreshTtsVoices);
  }
  ttsVoiceSelect.addEventListener('change', () => {
    localStorage.setItem('bus-display-tts-voice', ttsVoiceSelect.value);
    if (pageMode === 'controller') publishState();
  });

  let ttsReadings = {};
  const ttsReadingsReady = fetch('tts-readings.json?v=22', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('読み仮名辞書を読み込めません');
    return response.json();
  }).then(values => { ttsReadings=Object.fromEntries(Object.entries(values).map(([name, reading]) => [compactJapaneseStopName(name), reading])); }).catch(error => console.warn(error));
  function ttsReading(value) {
    const name=String(value || '').replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］/g,'').trim();
    const compactName = compactJapaneseStopName(name);
    return ttsReadings[compactName] || compactName;
  }
  function makeStopAnnouncement(stopName, data = rosenList[selectedValue] || [], index = mawashi, routeName = selectedValue) {
    const clean = value => String(value || '').replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］/g, '').trim();
    const name = clean(data[index + 1]?.[19]) || ttsReading(clean(stopName));
    if (!name) return '';
    const normal = 'つぎは、'+name+'、'+name+'、おおりのかたは、おしらせねがいます。';
    if (data.length > 2 && index >= data.length - 3) {
      return 'つぎは、しゅうてん、'+name+'、'+name+'でございます。ごじょうしゃ、ありがとうございました。';
    }
    if (index === 1) {
      const metadata = data[data.length - 1] || [];
      const company = metadata[22] || String(routeName).split(' / ')[0];
      const operator = metadata[20] || (company.includes('中央') ? 'ちゅうおうばす' : (company.includes('バス') ? ttsReading(company) : 'とうばす'));
      let system = String(metadata[14] || routeName).normalize('NFKC').match(/([東西南北]?[A-Za-z]?\d+(?:[-・]\d+)?)/)?.[1] || '';
      system=system.replace(/^[東西南北]/, value => ({'東':'ひがし','西':'にし','南':'みなみ','北':'きた'}[value]));
      system = metadata[21] || system;
      const destination = metadata[19] || data[data.length - 2]?.[19] || ttsReading(data[data.length - 2]?.[1] || data[data.length - 2]?.[0] || metadata[1]);
      return 'いつも、'+operator+'をごりよういただきまして、ありがとうございます。このばすは、'+(system ? system+'ばん、' : '')+destination+'ゆきでございます。'+normal;
    }
    return normal;
  }

  function speakStopAnnouncement(stopName, text = makeStopAnnouncement(stopName)) {
    if (!audioUnlocked || !('speechSynthesis' in window) || !stopName) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.92;
    utterance.volume = 1;
    const voiceName = ttsVoiceSelect.value || localStorage.getItem('bus-display-tts-voice');
    const voice = speechSynthesis.getVoices().find(candidate => candidate.name === voiceName);
    if (voice) utterance.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
  function setStopIndicator(requested) {
    const indicator=document.getElementById('stop-indicator');
    indicator.classList.toggle('pushed',requested);
    indicator.setAttribute('aria-label',requested?'停車要求あり':'停車要求なし');
  }
  function publishState(eventName = '') {
    if (!window.firebaseBus || !selectedValue || !rosenList[selectedValue]) return;
    const state = {
      routeName: selectedValue,
      routeData: rosenList[selectedValue],
      dataFormat: 'renderer-v2',
      mawashi,
      stopRequested: document.getElementById('stop-indicator').classList.contains('pushed'),
      doorsOpen: document.getElementById('btn-close').disabled,
      ttsVoice: localStorage.getItem('bus-display-tts-voice') || '',
      audioSettings: { push: document.querySelector('[name=push_sound]:checked').value, door: document.querySelector('[name=door_buzzer]:checked').value },
      eventName: eventName || '',
      eventId: eventName ? `${Date.now()}-${Math.random().toString(16).slice(2)}` : '',
      updatedAt: Date.now()
    };
    window.firebaseBus.send(state).catch(error => {
      document.getElementById('connection-status').textContent = `送信エラー: ${error.message}`;
    });
  }

  function applyRemoteState(state, writerClientId) {
    if (!state || !Array.isArray(state.routeData)) return;
    try { state = BusRouteCsv.normalizeState(state); }
    catch (error) {
      document.getElementById('connection-status').textContent = '同期データの形式エラー: ' + error.message;
      return;
    }
    const routeChanged = selectedValue !== state.routeName;
    const previousMawashi = mawashi;
    if (typeof state.ttsVoice === 'string') localStorage.setItem('bus-display-tts-voice', state.ttsVoice);
    rosenList[state.routeName] = state.routeData;
    selectedValue = state.routeName;
    mawashi = Number(state.mawashi) || 0;
    const select = document.getElementById('rosen-select');
    if (![...select.options].some(option => option.value === selectedValue)) {
      const option = document.createElement('option');
      option.value = selectedValue; option.textContent = phoneRouteLabel(selectedValue);
      select.appendChild(option);
    }
    select.value = selectedValue;
    updateDisplay();
    if (routeChanged || previousMawashi !== mawashi) {
      forceSwitchToScreen1();
    }
    document.getElementById('btn-next').disabled = false;
    document.getElementById('btn-back').disabled = false;
    setStopIndicator(Boolean(state.stopRequested));
    document.getElementById('btn-open').disabled = Boolean(state.doorsOpen);
    document.getElementById('btn-close').disabled = !state.doorsOpen;
    const eventIsNew = state.eventId && state.eventId !== lastRemoteEventId;
    const isRemoteWriter = writerClientId !== window.firebaseBus?.clientId;
    if (hasInitialSnapshot && eventIsNew && isRemoteWriter) {
      if (state.eventName === 'nextStop') triggerNextStopScreen();
      if (state.eventName === 'depart') triggerDepartScreen();
      if (state.eventName === 'open') forceSwitchToScreen1();
      if (state.eventName === 'next') {
        stopBroadcast();
        const currentData = state.routeData[mawashi + 1] || [];
        const terminalData = state.routeData[state.routeData.length - 1] || [];
        if (currentData[14] && terminalData[14]) currentAnnounceAudio = playSound(`sound_file/${terminalData[14]}/${currentData[14]}`);
        else speakStopAnnouncement(currentData[1] || currentData[0]);
      }
      if (audioUnlocked && state.eventName === 'back') playSound('data/nextpush.wav');
    }
    if (state.eventId) lastRemoteEventId = state.eventId;
    hasInitialSnapshot = true;
  }

  function connectRealtimeRoom() {
    if (!window.firebaseBus) {
      document.getElementById('connection-status').textContent = 'Firebase設定を確認してください (firebase-config.js)';
      return;
    }
    hasInitialSnapshot = false;
    window.firebaseBus.connect((state, writerClientId) => {
      if (pageMode === 'display' || !selectedValue) applyRemoteState(state, writerClientId);
      else if(state) setStopIndicator(Boolean(state.stopRequested));
    })
      .then(() => {
        document.getElementById('connection-status').textContent = 'Firebase同期中';
        if (pageMode === 'controller' && selectedValue) setTimeout(() => publishState(), 300);
      })
      .catch(error => { document.getElementById('connection-status').textContent = `Firebase接続エラー: ${error.message}`; });
  }
  window.addEventListener('firebase-authenticated', () => {
    document.getElementById('login-button').style.display = 'none';
    document.getElementById('logout-button').style.display = 'inline-block';
    document.body.classList.remove('auth-required');
    document.getElementById('login-close').hidden=false;
    connectRealtimeRoom();
  });

  // 音声のチャンネル管理（Pythonの Pygame mixer に相当）
  let currentAnnounceAudio = null; // 車内放送（music）専用チャンネル

  // 効果音やチャイム（Sound）は独立して鳴らす
  function playSound(path) {
    const audio = new Audio(path);
    if (pageMode === 'display') audio.play().catch(e => console.log("音声未検出(スキップ): " + path));
    return audio;
  }

  // ★放送のみを強制停止する処理
  function stopBroadcast() {
    if (currentAnnounceAudio) {
      currentAnnounceAudio.pause();
      currentAnnounceAudio.currentTime = 0;
      currentAnnounceAudio = null;
    }
  }

  // CSV読み込み処理 (ファイル複数選択とフォルダ選択の両方に対応)
  function parseCsvText(text) {
    return BusRouteCsv.parse(text);
  }


  document.getElementById('login-close').onclick=()=>document.body.classList.remove('auth-required');
  document.getElementById('account-button').onclick = () => document.body.classList.add('auth-required');
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-button').click(); });
  const map = window.L ? L.map('map',{zoomControl:false}).setView([43.0618,141.3545],12) : null;
  if (map) L.control.zoom({position:'bottomleft'}).addTo(map);
  if (map) L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap contributors', maxZoom:19 }).addTo(map);
  const routeLayer = map ? L.layerGroup().addTo(map) : null;
  let mappedRoute = '', routeBounds = null, vehicleMarker = null, accuracyCircle = null;
  function routeStops() {
    return (rosenList[selectedValue] || []).map((row,index) => ({row,index,lat:Number(row[16]),lon:Number(row[17])})).filter(x => x.index>0 && x.row[16] && x.row[17] && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat)<=90 && Math.abs(x.lon)<=180);
  }
  function updateRouteMap() {
    const data=rosenList[selectedValue] || [], stops=routeStops(), current=mawashi+1;
    const changed=mappedRoute!==selectedValue;
    mappedRoute=selectedValue;
    document.getElementById('current-stop-label').textContent='次は '+(data[current]?.[1] || data[current]?.[0] || '—');
    document.getElementById('progress-label').textContent=Math.min(current,Math.max(0,data.length-2))+' / '+Math.max(0,data.length-2);
    document.getElementById('map-caption').textContent=stops.length ? selectedValue+' · '+stops.length+'停留所' : 'この系統には地図表示用の座標がありません。手動送りを利用できます。';
    if (!map) { document.getElementById('map-caption').textContent='地図ライブラリを読み込めませんでした'; return; }
    routeLayer.clearLayers();
    if (!stops.length) return;
    const points=stops.map(x=>[x.lat,x.lon]);
    L.polyline(points,{color:'#2563eb',weight:4,opacity:.7}).addTo(routeLayer);
    const passed=stops.filter(x=>x.index<current).map(x=>[x.lat,x.lon]);
    if(passed.length>1) L.polyline(passed,{color:'#10b981',weight:5}).addTo(routeLayer);
    stops.forEach((x,i)=>{const icon=L.divIcon({className:'stop-marker '+(x.index<current?'passed':x.index===current?'target':''),html:String(i+1),iconSize:[22,22],iconAnchor:[11,11]}); const label=document.createElement('span'); label.textContent=(i===0?'始点 · ':i===stops.length-1?'終点 · ':'')+(x.row[0] || x.row[1]); L.marker([x.lat,x.lon],{icon}).bindPopup(label).addTo(routeLayer);});
    routeBounds=L.latLngBounds(points);
    if(changed) map.fitBounds(routeBounds,{padding:[30,40],maxZoom:15});
  }
  document.getElementById('map-fit').onclick=()=>{ if(map && routeBounds) map.fitBounds(routeBounds,{padding:[30,40],maxZoom:15}); };
  document.querySelectorAll('[name=push_sound],[name=door_buzzer]').forEach(input=>input.addEventListener('change',()=>publishState()));

  function phoneRouteLabel(name) {
    const label = String(name).split(' / ').pop();
    const parts = label.split(/[｜|]/);
    if (parts.length < 2) return label;
    const system = parts.shift().trim();
    const match = system.match(/^([^0-9０-９]*[0-9０-９]+(?:[-・][0-9０-９]+)?)/);
    return (match ? match[1] : system) + '｜' + parts.join('｜').trim();
  }
  const bundledRoutePaths = new Map();
  async function loadBundledRoute(routeName) {

    const relativePath = bundledRoutePaths.get(routeName);
    if (!relativePath) return null;
    const csvUrl = 'routes/' + relativePath.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(csvUrl + '?v=22', { cache: 'no-store' });
    if (!response.ok) throw new Error(`路線CSVを読み込めません: ${relativePath}`);
    const text = await response.text();
    rosenList[routeName] = parseCsvText(text);
    return rosenList[routeName];
  }

  async function loadBundledRoutes() {
    try {
      const manifestResponse = await fetch('routes/index.json?v=22', { cache: 'no-store' });
      if (!manifestResponse.ok) return;
      const manifest = await manifestResponse.json();
      const select = document.getElementById('rosen-select');
      const groups = {};
      for (const [key, label] of [['current', '現行路線'], ['archive', '過去路線アーカイブ']]) {
        const group = document.createElement('optgroup');
        group.label = label; select.appendChild(group); groups[key] = group;
      }
      for (const entry of manifest.routes || []) {
        bundledRoutePaths.set(entry.name, entry.path);
        if (![...select.options].some(option => option.value === entry.name)) {
          const option = document.createElement('option');
          option.value = entry.name; option.textContent = phoneRouteLabel(entry.name);
          groups[entry.category === 'archive' || entry.path.startsWith('archive/') ? 'archive' : 'current'].appendChild(option);
        }
      }
      const firstRoute = (manifest.routes || [])[0];
      if (!selectedValue && firstRoute) {
        selectedValue = firstRoute.name;
        select.value = selectedValue;
        await loadBundledRoute(selectedValue);
        mawashi = 0;
        updateDisplay();
        document.getElementById('btn-next').disabled = false;
        document.getElementById('btn-back').disabled = false;
        publishState();
      }
    } catch (error) {
      console.warn('Bundled routes could not be loaded:', error);
    }
  }
  loadBundledRoutes();

  document.getElementById('rosen-select').addEventListener('change', async (e) => {
    selectedValue = e.target.value; mawashi = 0;
    if (selectedValue) {
      try {
        await loadBundledRoute(selectedValue);
        updateDisplay(); forceSwitchToScreen1();
        document.getElementById('btn-next').disabled = false;
        document.getElementById('btn-back').disabled = false;
        publishState();
      } catch (error) {
        document.getElementById('connection-status').textContent = error.message;
      }
    }
  });

  // 描画更新処理
  function renderFareGrid(currentData) {
    const grid = document.getElementById('fare-grid');
    grid.innerHTML = '';
    let entries = null;
    try { const parsed = JSON.parse(currentData[18] || 'null'); if (Array.isArray(parsed) && parsed.length) entries = parsed; } catch {}
    let counter = 1, fareCount = 0; 
    for (let i3 = 0; i3 < 2; i3++) {
      for (let i2 = 0; i2 < 3; i2++) {
        const cell = document.createElement('div');
        cell.className = 'abs fare-cell';
        cell.style.left = `calc(${3 + i2 * 198} / ${baseW} * 100%)`;
        cell.style.top = `calc(${96 + i3 * 96.5} / ${baseH} * 100%)`;
        
        const entry = entries?.[fareCount];
        let val = entries ? (entry?.fare ?? '') : (currentData[3 + fareCount] || "");
        if (entries && val === '' && entry) val = '―';
        if (val !== '' && !/^\d+$/.test(String(val))) val = '―'; 
        if ((!entries || entry?.number === 1) && fareCount === 0 && val !== "") {
          cell.innerHTML = `<div class="abs cell-top flex-center"><span style="font-size: calc(10 * var(--pt-ratio) / var(--base-w) * 100cqw); margin-right:5px; color:#fff;">券なし</span><span class="cell-no">${counter}</span></div><div class="abs cell-bottom flex-center"><span class="cell-val">${val}</span></div>`;
        } else {
          cell.innerHTML = `<div class="abs cell-top flex-center"><span class="cell-no">${counter}</span></div><div class="abs cell-bottom flex-center"><span class="cell-val">${val}</span></div>`;
        }
        grid.appendChild(cell); counter++; fareCount++;
      }
    }

  }
  function compactJapaneseStopName(value) {
    return String(value || '').replace(/[\s\u3000]+/g, '');
  }
  function formatJapaneseStopName(value) {
    const name = compactJapaneseStopName(value);
    const chars = Array.from(name);
    if (chars.length === 2) return chars.join('　');
    if (chars.length >= 3 && chars.length <= 5) return chars.join(' ');
    return name;
  }

  function updateDisplay() {
    if (!selectedValue || !rosenList[selectedValue]) return;
    const data = rosenList[selectedValue];
    if (mawashi + 1 >= data.length) return; 

    document.getElementById('mawashi-display').textContent = mawashi;
    const currentData = data[mawashi + 1];
    updateRouteMap();

    // ★Python版の size_adjustment 処理を移植（文字数が11以上の時は縮小）
    const displayedStopName = formatJapaneseStopName(currentData[1] || currentData[0]);
    const currentLength = Array.from(displayedStopName).length;
    let textSize = 35;
    if (currentLength >= 11) {
        textSize = Math.floor(35 * 11 / currentLength);
    }
    const fontSizeCalc = `calc(${textSize} * var(--pt-ratio) / var(--base-w) * 100cqw)`;
    
    const mainDestText = document.getElementById('main-dest-text');
    mainDestText.textContent = displayedStopName; 
    mainDestText.style.fontSize = fontSizeCalc;

    const sc2NextStopJa = document.getElementById('sc2-next-stop-ja');
    const metadata=data[data.length-1] || [];
    // Original 16-column CSV: route summary is column 16. Columns 17/18 are now coordinates.
    const initialSummary=String(metadata[15] || selectedValue).replace(/^([^◆♦]+)[◆♦]/, (_, system) => {
      const code = system.match(/^([^0-9０-９]*[0-9０-９]+(?:[-・][0-9０-９]+)?)/)?.[1];
      return (code || system) + '◆';
    });
    const initialLength=Array.from(initialSummary).length;
    const initialTextSize=initialLength>=12 ? Math.floor(35*12/initialLength+.3) : 35;
    sc2NextStopJa.textContent = mawashi===0 ? initialSummary : displayedStopName;
    sc2NextStopJa.style.fontSize = mawashi===0 ? `calc(${initialTextSize} * var(--pt-ratio) / var(--base-w) * 100cqw)` : fontSizeCalc;
    
    const nextBoxText = document.getElementById('next-box-text');
    if (data.length <= mawashi + 3 && mawashi > 0) {
      nextBoxText.innerHTML = "終<br>点";
    } else {
      nextBoxText.innerHTML = "次<br>は";
    }

    document.getElementById('scroll-txt').textContent = currentData[9] || "";
    idou = baseW; 

    renderFareGrid(currentData);

    document.getElementById('sc2-next-stop-en').textContent = mawashi===0 ? '' : (currentData[2] || ''); 

    for (let n_text = 0; n_text < 4; n_text++) {
      let targetRow = null;
      if (data.length <= mawashi + 6) {
        targetRow = data[4 - n_text + mawashi];
      } else if (mawashi === 0) {
        if (n_text === 0) targetRow = data[data.length - 2];
        else targetRow = data[5 - n_text + mawashi];
      } else {
        if (n_text === 0) targetRow = data[data.length - 2];
        else targetRow = data[4 - n_text + mawashi];
      }

      if (targetRow) {
        document.getElementById(`sc3-ja-${n_text}`).textContent = compactJapaneseStopName(targetRow[0] || targetRow[1]);
        document.getElementById(`sc3-en-${n_text}`).textContent = targetRow[2] || "";
      } else {
        document.getElementById(`sc3-ja-${n_text}`).textContent = "";
        document.getElementById(`sc3-en-${n_text}`).textContent = "";
      }
    }
    if(mawashi===0 && currentScNo===0) forceSwitchToScreen1();
  }

  // ==========================================
  // アニメーション・画面切り替え管理
  // ==========================================
  const allMainScreens = document.querySelectorAll('#dp-screen .screen');
  const allInterruptScreens = document.querySelectorAll('#dp-screen .interrupt-screen');
  const mainScreens = [document.getElementById('screen1'), document.getElementById('screen2'), document.getElementById('screen3')];
  const waitTimes = [8000, 6000, 6000];
  let currentScNo = 0;
  let screenTimer = null;
  const move_sw = 5500; 

  let lcdBlackoutTimer=null;
  function hideAllScreens() {
    const blackout=document.getElementById('lcd-blackout');
    clearTimeout(lcdBlackoutTimer);
    blackout.hidden=false;
    lcdBlackoutTimer=setTimeout(()=>{blackout.hidden=true;},100);
    allMainScreens.forEach(s => s.classList.remove('active'));
    allInterruptScreens.forEach(s => s.classList.remove('active'));
  }

  function switchScreen() {
    hideAllScreens();
    currentScNo = (currentScNo + 1) % mainScreens.length;
    if(mawashi===0 && currentScNo===0) currentScNo=1;
    mainScreens[currentScNo].classList.add('active');
    screenTimer = setTimeout(switchScreen, waitTimes[currentScNo]);
  }

  function forceSwitchToScreen1() {
    clearTimeout(screenTimer);
    hideAllScreens();
    currentScNo = mawashi===0 ? 1 : 0;
    mainScreens[currentScNo].classList.add('active');
    screenTimer = setTimeout(switchScreen, waitTimes[currentScNo]);
  }

  function triggerNextStopScreen() {
    clearTimeout(screenTimer);
    hideAllScreens();
    document.getElementById('screen-ns1').classList.add('active');
    screenTimer = setTimeout(() => {
      hideAllScreens();
      document.getElementById('screen-ns2').classList.add('active');
      screenTimer = setTimeout(forceSwitchToScreen1, move_sw);
    }, move_sw);
  }

  function triggerDepartScreen() {
    clearTimeout(screenTimer);
    hideAllScreens();
    document.getElementById('screen-d1').classList.add('active');
    screenTimer = setTimeout(() => {
      hideAllScreens();
      document.getElementById('screen-d2').classList.add('active');
      screenTimer = setTimeout(forceSwitchToScreen1, move_sw);
    }, move_sw);
  }

  screenTimer = setTimeout(switchScreen, waitTimes[0]);

  let idou = baseW;
  function animateScroll() {
    idou -= 2; 
    const scrollTxt = document.getElementById('scroll-txt');
    const dpRect = document.getElementById('dp-screen').getBoundingClientRect();
    const rect = scrollTxt.getBoundingClientRect();
    if (idou < -((rect.width / dpRect.width) * baseW)) idou = baseW;
    scrollTxt.style.left = `calc(${idou} / ${baseW} * 100%)`;
    requestAnimationFrame(animateScroll);
  }
  animateScroll();

  // ★「次止まります」アナウンスの延期監視処理（キュー）

  // ==========================================
  // ボタン操作
  // ==========================================
  document.getElementById('btn-next').addEventListener('click', () => {
    const data = rosenList[selectedValue];
    if (data && mawashi < data.length - 3) { 
      stopBroadcast(); // ★前の放送を強制停止
      mawashi++;
      updateDisplay();
      forceSwitchToScreen1(); 
      setStopIndicator(false);
      
      const currentData = data[mawashi + 1];
      publishState('next');
    }
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    if (mawashi > 0) {
      stopBroadcast(); // ★前の放送を強制停止
      mawashi--;
      updateDisplay();
      forceSwitchToScreen1(); 
      setStopIndicator(false);
      currentAnnounceAudio = playSound(`data/nextpush.wav`);
      publishState('back');
    }
  });

  const btnOpen = document.getElementById('btn-open');
  const btnClose = document.getElementById('btn-close');
  
  btnOpen.addEventListener('click', () => {
    btnOpen.disabled = true; btnClose.disabled = false;
    setStopIndicator(false);
    forceSwitchToScreen1(); 
    clearTimeout(screenTimer); 
    
    const doorBuzzerVal = document.querySelector('input[name="door_buzzer"]:checked').value;
    if (doorBuzzerVal === "1") playSound(`data/taihei_door_open.wav`);
    else playSound(`data/buzzer${doorBuzzerVal}.wav`);
    publishState('open');
  });

  btnClose.addEventListener('click', () => {
    btnClose.disabled = true; btnOpen.disabled = false;
    
    const doorBuzzerVal = document.querySelector('input[name="door_buzzer"]:checked').value;
    if (doorBuzzerVal === "1") playSound(`data/taihei_door_close.wav`);
    else playSound(`data/buzzer${doorBuzzerVal}.wav`);
    
    triggerDepartScreen(); 
    publishState('depart');
    
    setTimeout(() => {
      if (rosenList[selectedValue]) {
        const destName = rosenList[selectedValue][rosenList[selectedValue].length - 1][1];
        if (destName === "石狩営業所" || destName === "北営業所" || destName === "東営業所") {
          playSound(`data/door_close_${destName}.wav`);
        }
      }
    }, 3000);
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    setStopIndicator(false);
    publishState('reset');
  });

  function newDepartureTracker() { return { key:'', arrived:false, outsideSince:null, outsideFixes:0, sent:false }; }
  let gpsDepartureTracker=newDepartureTracker();
  function departureDecision(tracker,key,distance,accuracy,radius,now,doorsClosed,isTerminal) {
    if(tracker.key!==key) Object.assign(tracker,newDepartureTracker(),{key});
    if(!Number.isFinite(distance) || !Number.isFinite(accuracy) || accuracy>Math.max(50,radius)) return 'poor';
    if(distance<=radius) {
      tracker.arrived=true; tracker.outsideSince=null;tracker.outsideFixes=0;
      return isTerminal?'terminal':'arrived';
    }
    const exitRadius=radius+Math.max(20,accuracy);
    if(!tracker.arrived || distance<exitRadius || !doorsClosed) {
      tracker.outsideSince=null;tracker.outsideFixes=0;
      return tracker.arrived?'waiting':'approach';
    }
    if(tracker.sent) return 'waiting';
    if(tracker.outsideSince===null) tracker.outsideSince=now;
    tracker.outsideFixes++;
    if(tracker.outsideFixes>=2 && now-tracker.outsideSince>=3000) {tracker.sent=true;return 'depart';}
    return 'waiting';
  }

  let gpsWatchId = null;
  let gpsLastAdvanceAt = 0;
  let gpsLastAdvancedIndex = -1;
  document.getElementById('rosen-select').addEventListener('change',()=>{ gpsLastAdvanceAt=0; gpsLastAdvancedIndex=-1; });
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const rad = degrees => degrees * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  document.getElementById('gps-auto').addEventListener('change',()=>{ gpsDepartureTracker=newDepartureTracker(); });
  document.getElementById('gps-start').addEventListener('click', () => {
    const status = document.getElementById('gps-status');
    if (!navigator.geolocation) { status.textContent = 'このブラウザーは位置情報に対応していません'; return; }
    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    gpsDepartureTracker=newDepartureTracker();
    status.textContent = 'GPS位置を取得中です…';
    gpsWatchId = navigator.geolocation.watchPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      if(map) {
        const point=[latitude,longitude];
        if(!vehicleMarker) vehicleMarker=L.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).addTo(map); else vehicleMarker.setLatLng(point);
        if(!accuracyCircle) accuracyCircle=L.circle(point,{radius:accuracy,color:'#2563eb',weight:1,fillOpacity:.08}).addTo(map); else accuracyCircle.setLatLng(point).setRadius(accuracy);
        if(document.getElementById('map-follow').checked) map.panTo(point,{animate:true});
      }
      status.textContent = `現在地 ${latitude.toFixed(5)}, ${longitude.toFixed(5)} · 精度 約${Math.round(accuracy)}m`;
      const route = rosenList[selectedValue];
      if (!document.getElementById('gps-auto').checked) { status.textContent+=' · 手動送り'; return; }
      const currentIndex=mawashi+1;
      const current=route && route[currentIndex];
      if(!current || !current[16] || !current[17]) {status.textContent+=' · 現在の停留所に座標がありません';return;}
      const radius=Math.max(10,Number(document.getElementById('gps-radius').value)||45);
      const distance=distanceMeters(latitude,longitude,Number(current[16]),Number(current[17]));
      const decision=departureDecision(gpsDepartureTracker,selectedValue+':'+currentIndex,distance,accuracy,radius,Date.now(),document.getElementById('btn-close').disabled,currentIndex===route.length-2);
      if(decision==='depart') {
        document.getElementById('btn-next').click();
        status.textContent=current[0]+'を出発 · 次の停留所を放送';
      } else if(decision==='terminal') {
        navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;
        status.textContent='終点に到着しました。GPS追跡を終了しました。';
      } else if(decision==='arrived') status.textContent=current[0]+'に到着 · 出発を待っています';
      else if(decision==='approach') status.textContent+=' · '+current[0]+'への到着を待っています';
      else if(decision==='poor') status.textContent+=' · 精度が低いため自動送りを保留';
    }, error => {
      const messages = { 1: '位置情報の許可が必要です', 2: '現在地を取得できません', 3: '位置情報の取得がタイムアウトしました' };
      status.textContent = messages[error.code] || error.message;
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  });
  document.getElementById('gps-stop').addEventListener('click', () => {
    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    document.getElementById('gps-status').textContent = 'GPS停止中';
  });
