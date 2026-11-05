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
  let displayAudioContext = null;
  let speechUnlocked = false;
  function selectDisplayVoice(utterance) {
    const voices = speechSynthesis.getVoices();
    const requested = document.getElementById('tts-voice').value || localStorage.getItem('bus-display-tts-voice');
    const voice = voices.find(v => v.name === requested && /^ja/i.test(v.lang))
      || voices.find(v => /^ja/i.test(v.lang) && v.default)
      || voices.find(v => /^ja/i.test(v.lang));
    if (voice) utterance.voice = voice;
  }
  function watchSpeechStart(utterance, failed) {
    const timer = setTimeout(() => {
      if (currentSpeechUtterance !== utterance) return;
      currentSpeechUtterance = null;
      speechUnlocked = false;
      const button = document.getElementById('audio-retry');
      button.textContent = '読み上げが開始しません · 音声確認';
      showAudioRetry();
      speechSynthesis.cancel();
      if (failed) failed();
    }, 8000);
    utterance.onstart = () => { clearTimeout(timer); speechUnlocked = true; };
    utterance.addEventListener('end', () => clearTimeout(timer));
    utterance.addEventListener('error', () => clearTimeout(timer));
  }
  function activateDisplaySpeech() {
    if (!('speechSynthesis' in window)) { showAudioRetry(); return; }
    if (speechUnlocked || currentSpeechUtterance) return;
    const utterance = new SpeechSynthesisUtterance('おんせいを、ゆうこうにしました。');
    utterance.lang = 'ja-JP'; utterance.rate = .92; utterance.volume = 1;
    selectDisplayVoice(utterance);
    currentSpeechUtterance = utterance;
    utterance.onend = () => {
      if (currentSpeechUtterance === utterance) currentSpeechUtterance = null;
      document.getElementById('audio-retry').hidden = audioUnlocked && speechUnlocked;
    };
    utterance.onerror = event => {
      if (currentSpeechUtterance === utterance) currentSpeechUtterance = null;
      speechUnlocked = false;
      document.getElementById('audio-retry').textContent = '読み上げエラー: ' + event.error + ' · 音声確認';
      showAudioRetry();
    };
    watchSpeechStart(utterance);
    utterance.addEventListener('start', () => {
      document.getElementById('audio-retry').textContent = '音声を再生中 · 聞こえない場合は音量・出力先を確認';
      showAudioRetry();
    });
    speechSynthesis.resume();
    speechSynthesis.speak(utterance);
  }
  function showAudioRetry() {
    document.getElementById('audio-retry').hidden = false;
  }
  function unlockDisplayAudio() {
    activateDisplaySpeech();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { showAudioRetry(); return Promise.resolve(false); }
    try {
      if (!displayAudioContext || displayAudioContext.state === 'closed') displayAudioContext = new AudioContextClass();
      return displayAudioContext.resume().then(() => {
        loadAdvanceChime().catch(console.warn);
        audioUnlocked = displayAudioContext.state === 'running';
        document.getElementById('audio-retry').hidden = audioUnlocked && speechUnlocked && !currentSpeechUtterance;
        return audioUnlocked;
      }).catch(() => { audioUnlocked = false; showAudioRetry(); return false; });
    } catch { showAudioRetry(); return Promise.resolve(false); }
  }
  let advanceChimeBuffer = null;
  let announcementGeneration = 0;
  async function loadAdvanceChime() {
    if (!advanceChimeBuffer) {
      const response = await fetch('data/nextpush.wav');
      if (!response.ok) throw new Error('チャイム音源を読み込めません');
      advanceChimeBuffer = await displayAudioContext.decodeAudioData(await response.arrayBuffer());
    }
    return advanceChimeBuffer;
  }
  async function playAdvanceChime() {
    const context = displayAudioContext;
    if (!context || context.state !== 'running') { audioUnlocked=false; showAudioRetry(); return false; }
    try {
      const buffer = await loadAdvanceChime();
      return await new Promise(resolve => {
        const source=context.createBufferSource();
        source.buffer=buffer; source.connect(context.destination);
        source.onended=()=>resolve(true); source.start();
      });
    } catch (error) { console.warn(error); showAudioRetry(); return false; }
  }
  let advanceAnnouncementPending = 0;
  async function announceAdvance(currentData, terminalData) {
    advanceAnnouncementPending++;
    try {
      const generation=++announcementGeneration;
      const name=currentData[1] || currentData[0] || '';
      const route=rosenList[selectedValue] || [], index=mawashi, routeName=selectedValue;
      if (!currentData[19]) await ttsReadingsReady;
      const text=makeStopAnnouncement(name,route,index,routeName);
      while(doorAnnouncementPending && generation===announcementGeneration) await new Promise(resolve=>setTimeout(resolve,100));
      if(generation!==announcementGeneration) return;
      if (currentData[14] && terminalData[14]) {
        await playRecordedAnnouncement(`sound_file/${terminalData[14]}/${currentData[14]}`, generation, name, text);
      } else {
        const played = await playAdvanceChime();
        if (!played || generation !== announcementGeneration) return;
        speakStopAnnouncement(name, text);
      }
    } finally { advanceAnnouncementPending--; }
  }
  document.getElementById('audio-retry').addEventListener('click', event => {
    event.stopPropagation();
    const button = document.getElementById('audio-retry');
    button.textContent = '音声確認中…';
    try {
      if (!('speechSynthesis' in window)) throw new Error('このブラウザは読み上げに対応していません');
      if (currentSpeechUtterance) {
        currentSpeechUtterance.onend = null;
        currentSpeechUtterance.onerror = null;
      }
      currentSpeechUtterance = null;
      speechUnlocked = false;
      speechSynthesis.cancel();
      unlockDisplayAudio();
    } catch (error) {
      button.textContent = '音声確認エラー: ' + error.message;
      showAudioRetry();
    }
  });
  document.addEventListener('pointerdown', () => {
    if (pageMode === 'display' && (!displayAudioContext || displayAudioContext.state !== 'running')) unlockDisplayAudio();
  });

  function roleLink(mode) {
    const targetPage = mode === 'display' ? 'ipad.html' : 'iphone.html';
    const url = new URL(targetPage, location.href);
    return url.href;
  }
  document.getElementById('login-button').addEventListener('click', async () => {
    if (!window.firebaseBus) { document.getElementById('connection-status').textContent = 'firebase-config.js の設定が必要です'; return; }
    if (pageMode === 'display') unlockDisplayAudio();
    try {
      await window.firebaseBus.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
      document.getElementById('connection-status').textContent = 'ログインしました。同期中です';
    } catch (error) { document.getElementById('connection-status').textContent = `ログイン失敗: ${error.message}`; }
  });
  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.firebaseBus?.logout();
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
  ttsVoiceSelect.addEventListener('change', () => localStorage.setItem('bus-display-tts-voice', ttsVoiceSelect.value));

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

  let currentSpeechUtterance = null;
  function speakStopAnnouncement(stopName, text = makeStopAnnouncement(stopName)) {
    if (!audioUnlocked || !('speechSynthesis' in window) || !stopName) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.92;
    utterance.volume = 1;
    selectDisplayVoice(utterance);
    speechSynthesis.cancel();
    currentSpeechUtterance = utterance;
    utterance.onend = () => { if(currentSpeechUtterance === utterance) currentSpeechUtterance = null; };
    utterance.onerror = event => {
      if(currentSpeechUtterance === utterance) currentSpeechUtterance=null;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      const button=document.getElementById('audio-retry');
      button.textContent='読み上げエラー: '+event.error+' · 音声確認';
      showAudioRetry();
      console.error('Speech synthesis failed:',event.error);
    };
    watchSpeechStart(utterance);
    speechSynthesis.resume();
    speechSynthesis.speak(utterance);
  }
  function publishState(eventName = '') {
    if (!window.firebaseBus || !selectedValue || !rosenList[selectedValue]) return;
    const state = {
      routeName: selectedValue,
      routeData: rosenList[selectedValue],
      dataFormat: 'renderer-v2',
      mawashi,
      stopRequested: document.getElementById('btn-stop').classList.contains('pushed'),
      doorsOpen: document.getElementById('btn-close').disabled,
      ttsVoice: localStorage.getItem('bus-display-tts-voice') || '',
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
    for (const [name, value] of [['push_sound',state.audioSettings?.push],['door_buzzer',state.audioSettings?.door]]) {
      if (value && /^[1-4]$/.test(String(value))) { const input=document.querySelector(`input[name="${name}"][value="${value}"]`); if(input) input.checked=true; }
    }
    if (typeof state.ttsVoice === 'string') {
      localStorage.setItem('bus-display-tts-voice', state.ttsVoice);
      if ([...ttsVoiceSelect.options].some(option => option.value === state.ttsVoice)) ttsVoiceSelect.value = state.ttsVoice;
    }
    rosenList[state.routeName] = state.routeData;
    selectedValue = state.routeName;
    mawashi = Number(state.mawashi) || 0;
    const select = document.getElementById('rosen-select');
    if (![...select.options].some(option => option.value === selectedValue)) {
      const option = document.createElement('option');
      option.value = selectedValue; option.textContent = selectedValue;
      select.appendChild(option);
    }
    select.value = selectedValue;
    updateDisplay();
    if (routeChanged || previousMawashi !== mawashi) {
      forceSwitchToScreen1();
    }
    document.getElementById('btn-next').disabled = false;
    document.getElementById('btn-back').disabled = false;
    document.getElementById('btn-stop').classList.toggle('pushed', Boolean(state.stopRequested));
    document.body.classList.toggle('stop-active', Boolean(state.stopRequested));
    document.getElementById('btn-open').disabled = Boolean(state.doorsOpen);
    document.getElementById('btn-close').disabled = !state.doorsOpen;
    const eventIsNew = state.eventId && state.eventId !== lastRemoteEventId;
    const isRemoteWriter = writerClientId !== window.firebaseBus?.clientId;
    if (hasInitialSnapshot && eventIsNew && isRemoteWriter) {
      if (state.eventName === 'nextStop') {
        triggerNextStopScreen();
        const sound=document.querySelector('input[name="push_sound"]:checked').value;
        if(audioUnlocked && sound!=='4') playSound('data/getoffpush'+sound+'.wav');
        if(audioUnlocked) setTimeout(()=>playNextStopAnnounce(state.routeData[state.routeData.length-1]?.[1] || ''),1500);
      }
      if (state.eventName === 'depart') {
        triggerDepartScreen();
        playDoorClosingAnnouncement();
      }
      if (state.eventName === 'open') {
        cancelDoorAnnouncement();
        forceSwitchToScreen1();
        const sound=document.querySelector('input[name="door_buzzer"]:checked').value;
        if(audioUnlocked) playSound(sound==='1'?'data/taihei_door_open.wav':'data/buzzer'+sound+'.wav');
      }
      if (state.eventName === 'next') {
        cancelDoorAnnouncement();
        stopBroadcast();
        const currentData = state.routeData[mawashi + 1] || [];
        const terminalData = state.routeData[state.routeData.length - 1] || [];
        announceAdvance(currentData, terminalData);
      }
      if (state.eventName === 'back') { cancelDoorAnnouncement(); stopBroadcast(); playAdvanceChime(); }
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
    if (pageMode === 'display') document.body.classList.add('authenticated');
    if (!displayAudioContext || displayAudioContext.state !== 'running') showAudioRetry();
    connectRealtimeRoom();
  });

  document.addEventListener('click', event => {
    if (pageMode !== 'display' || !document.body.classList.contains('authenticated')) return;
    if (event.target.closest('#dp-screen, #audio-retry')) return;
    const stopButton = document.getElementById('btn-stop');
    if (!selectedValue || !rosenList[selectedValue] || stopButton.classList.contains('pushed')) return;
    document.body.classList.add('stop-active');
    stopButton.click();
  });

  // 音声のチャンネル管理（Pythonの Pygame mixer に相当）
  let doorAnnouncementGeneration=0;
  let doorAnnouncementPending=false;
  let doorAudioSource=null;
  let doorSpeechUtterance=null;
  const doorAudioBuffers=new Map();
  function departureWarningClip() {
    const route=rosenList[selectedValue] || [];
    const depot=String(route[route.length-1]?.[1] || '').trim();
    // Python car/display versions share the Ishikari voice for Kita depot.
    return ({
      '石狩営業所':'data/door_close_石狩営業所.wav',
      '北営業所':'data/door_close_石狩営業所.wav',
      '東営業所':'data/door_close_東営業所.wav',
      '新川営業所':'data/door_close_新川営業所.wav',
      '白石営業所':'data/door_close_白石営業所.wav'
    })[depot] || null;
  }
  function cancelDoorAnnouncement() {
    doorAnnouncementGeneration++;
    doorAnnouncementPending=false;
    if (doorSpeechUtterance) {
      if (currentSpeechUtterance === doorSpeechUtterance) speechSynthesis.cancel();
      doorSpeechUtterance = null;
    }
    if(doorAudioSource) { try{doorAudioSource.stop();}catch{} doorAudioSource=null; }
  }
  async function playDoorClip(path,generation) {
    if(!displayAudioContext || displayAudioContext.state!=='running') throw new Error('音声を有効にしてください');
    let buffer=doorAudioBuffers.get(path);
    if(!buffer) {
      const response=await fetch(path);
      if(!response.ok) throw new Error('ドア音声を読み込めません: '+path);
      buffer=await displayAudioContext.decodeAudioData(await response.arrayBuffer());
      doorAudioBuffers.set(path,buffer);
    }
    if(generation!==doorAnnouncementGeneration) return;
    await new Promise(resolve=>{
      const source=displayAudioContext.createBufferSource();source.buffer=buffer;connectAnnouncementAudio(source,/door_close_/.test(path)?2:1);doorAudioSource=source;
      source.onended=()=>{if(doorAudioSource===source)doorAudioSource=null;resolve();};source.start();
    });
  }
  async function speakDepartureWarning(generation) {
    while (currentSpeechUtterance && generation === doorAnnouncementGeneration) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (generation !== doorAnnouncementGeneration) return;
    if (!('speechSynthesis' in window)) throw new Error('読み上げに対応していません');
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance('はっしゃします。ごちゅういください。');
      utterance.lang = 'ja-JP'; utterance.rate = .92; utterance.volume = 1;
      selectDisplayVoice(utterance);
      currentSpeechUtterance = doorSpeechUtterance = utterance;
      const clear = () => {
        if (currentSpeechUtterance === utterance) currentSpeechUtterance = null;
        if (doorSpeechUtterance === utterance) doorSpeechUtterance = null;
      };
      utterance.onend = () => { clear(); resolve(); };
      utterance.onerror = event => {
        clear();
        if (generation !== doorAnnouncementGeneration || ['canceled','interrupted'].includes(event.error)) resolve();
        else reject(new Error('発車案内の読み上げエラー: ' + event.error));
      };
      watchSpeechStart(utterance, () => { clear(); resolve(); });
      speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    });
  }
  async function playDoorClosingAnnouncement() {
    cancelDoorAnnouncement();
    const generation=doorAnnouncementGeneration;
    const sound=document.querySelector('input[name="door_buzzer"]:checked').value;
    const warning=departureWarningClip();
    doorAnnouncementPending=true;
    try {
      await playDoorClip(sound==='1'?'data/taihei_door_close.wav':'data/buzzer'+sound+'.wav',generation);
      if(generation===doorAnnouncementGeneration) {
        if (warning) await playDoorClip(warning,generation);
        else await speakDepartureWarning(generation);
      }
    } catch(error) {console.error(error);showAudioRetry();}
    finally {if(generation===doorAnnouncementGeneration)doorAnnouncementPending=false;}
  }

  let currentAnnounceAudio = null; // 車内放送（music）専用チャンネル

  // 効果音やチャイム（Sound）は独立して鳴らす
  function connectAnnouncementAudio(source, volume=2) {
    const gain=displayAudioContext.createGain();gain.gain.value=volume;
    const limiter=displayAudioContext.createDynamicsCompressor();
    limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;
    source.connect(gain);gain.connect(limiter);limiter.connect(displayAudioContext.destination);
  }
  const recordedAnnouncementBuffers = new Map();
  async function playRecordedAnnouncement(path, generation, name, text) {
    const context = displayAudioContext;
    if (!context || context.state !== 'running') { showAudioRetry(); return; }
    let source = null;
    // Retain the playback state used by the stop-request queue and cancel controls.
    const playback = {
      paused: false, ended: false, currentTime: 0,
      pause() { this.paused = true; if (source) { try { source.stop(); } catch {} } }
    };
    currentAnnounceAudio = playback;
    try {
      let buffer = recordedAnnouncementBuffers.get(path);
      if (!buffer) {
        const response = await fetch(path);
        if (!response.ok) throw new Error('録音ファイルを取得できません: ' + response.status);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        // Bound memory usage: recordings can be several megabytes each.
        if (recordedAnnouncementBuffers.size >= 3) recordedAnnouncementBuffers.delete(recordedAnnouncementBuffers.keys().next().value);
        recordedAnnouncementBuffers.set(path, buffer);
      }
      if (generation !== announcementGeneration || playback.paused) return;
      await new Promise(resolve => {
        source = context.createBufferSource(); source.buffer = buffer;
        connectAnnouncementAudio(source);
        source.onended = () => { playback.ended = true; resolve(); };
        source.start();
      });
    } catch (error) {
      playback.ended = true;
      if (generation !== announcementGeneration || playback.paused) return;
      const button = document.getElementById('audio-retry');
      button.textContent = '録音放送エラー: ' + error.message;
      showAudioRetry();
      console.error(path, error);
      const played = await playAdvanceChime();
      if (played && generation === announcementGeneration && !playback.paused) speakStopAnnouncement(name, text);
    }
  }
  function playSound(path) {
    const audio = new Audio(path);
    if(displayAudioContext?.state==='running' && (path.startsWith('sound_file/') || /door_close_|tugitomarimasu_/.test(path))) {
      connectAnnouncementAudio(displayAudioContext.createMediaElementSource(audio));
    }
    audio.play().catch(e => console.log("音声未検出(スキップ): " + path));
    return audio;
  }

  // ★放送のみを強制停止する処理
  function stopBroadcast() {
    announcementGeneration++;
    currentSpeechUtterance=null;
    stopRequestGeneration++;
    stopRequestQueued=false;
    if(stopRequestSource) { try { stopRequestSource.stop(); } catch {} stopRequestSource=null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
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

  function loadCsvFiles(files) {
    for (let file of files) {
      if (!file.name.toLowerCase().endsWith('.csv')) continue;
      const reader = new FileReader();
      reader.readAsText(file, 'utf-8');
      reader.onload = (event) => {
        const text = event.target.result;
        const data = parseCsvText(text);
        const fileName = file.name.replace(/\.csv$/i, '');
        const folderName = (file.webkitRelativePath || '').split('/').slice(0, -1).filter(Boolean).join(' / ');
        const routeKey = folderName ? `${folderName} / ${fileName}` : fileName;
        rosenList[routeKey] = data; 
        
        const option = document.createElement('option');
        option.value = routeKey; option.textContent = routeKey;
        document.getElementById('rosen-select').appendChild(option);
        
        if (document.getElementById('rosen-select').options.length === 2) {
          document.getElementById('rosen-select').value = routeKey;
          selectedValue = routeKey;
          mawashi = 0;
          updateDisplay(); 
          document.getElementById('btn-next').disabled = false;
          document.getElementById('btn-back').disabled = false;
        }
        if (selectedValue === routeKey) publishState();
      };
    }
  }
  document.getElementById('csv-input').addEventListener('change', e => loadCsvFiles(e.target.files));
  document.getElementById('csv-folder-input').addEventListener('change', e => loadCsvFiles(e.target.files));

  const bundledRoutePaths = new Map();
  async function loadBundledRoute(routeName) {
    if (rosenList[routeName]) return rosenList[routeName];
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
      for (const entry of manifest.routes || []) {
        bundledRoutePaths.set(entry.name, entry.path);
        if (![...select.options].some(option => option.value === entry.name)) {
          const option = document.createElement('option');
          option.value = entry.name; option.textContent = entry.name;
          select.appendChild(option);
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
  let stopRequestQueued=false;
  let stopRequestGeneration=0;
  let stopRequestSource=null;
  const stopClipBuffers=new Map();
  async function playStopClip(path,generation) {
    if (!displayAudioContext || displayAudioContext.state!=='running') throw new Error('音声を有効にしてください');
    let buffer=stopClipBuffers.get(path);
    if(!buffer) {
      const response=await fetch(path);
      if(!response.ok) throw new Error('停車案内音声を読み込めません: '+path);
      buffer=await displayAudioContext.decodeAudioData(await response.arrayBuffer());
      stopClipBuffers.set(path,buffer);
    }
    if(generation!==stopRequestGeneration) return;
    await new Promise(resolve=>{
      const source=displayAudioContext.createBufferSource();
      stopRequestSource=source; source.buffer=buffer; connectAnnouncementAudio(source);
      source.onended=()=>{if(stopRequestSource===source) stopRequestSource=null;resolve();};
      source.start();
    });
  }
  function speakStopRequest(generation) {
    if(!('speechSynthesis' in window)) return Promise.reject(new Error('読み上げに対応していません'));
    if(generation!==stopRequestGeneration) return Promise.resolve(false);
    return new Promise((resolve,reject)=>{
      const utterance=new SpeechSynthesisUtterance('つぎ、とまります。');
      utterance.lang='ja-JP'; utterance.rate=.92; utterance.volume=1;
      selectDisplayVoice(utterance);
      currentSpeechUtterance=utterance;
      utterance.onend=()=>{if(currentSpeechUtterance===utterance)currentSpeechUtterance=null;resolve(generation===stopRequestGeneration);};
      utterance.onerror=event=>{
        if(currentSpeechUtterance===utterance)currentSpeechUtterance=null;
        if(generation!==stopRequestGeneration || event.error==='canceled' || event.error==='interrupted') resolve(false);
        else reject(new Error('停車案内の読み上げエラー: '+event.error));
      };
      watchSpeechStart(utterance, () => resolve(false));
      speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    });
  }
  function depotStopRequestClip() {
    const route=rosenList[selectedValue] || [];
    const depot=String(route[route.length-1]?.[1] || '').trim();
    // Legacy CSV: final row, column 2 is the audio depot, not the destination.
    return ({
      '石狩営業所':'data/stop-request.wav',
      '新川営業所':'data/tugitomarimasu_新川営業所.wav',
      '東営業所':'data/tugitomarimasu_東営業所.wav',
      '白石営業所':'data/tugitomarimasu_白石営業所.wav'
    })[depot] || null;
  }
  function playNextStopAnnounce() {
    if(stopRequestQueued) return;
    stopRequestQueued=true;
    const generation=++stopRequestGeneration;
    const requestClip=depotStopRequestClip();
    async function waitForAnnouncement() {
      if(generation!==stopRequestGeneration) return;
      if(!document.getElementById('btn-stop').classList.contains('pushed')) { stopRequestQueued=false;return; }
      const recordedBusy=currentAnnounceAudio && !currentAnnounceAudio.paused && !currentAnnounceAudio.ended;
      const speechBusy=currentSpeechUtterance || ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending));
      if(advanceAnnouncementPending || doorAnnouncementPending || recordedBusy || speechBusy) { setTimeout(waitForAnnouncement,100);return; }
      try {
        let spoken;
        if(requestClip) { await playStopClip(requestClip,generation);spoken=generation===stopRequestGeneration; }
        else spoken=await speakStopRequest(generation);
        if(spoken && generation===stopRequestGeneration) await playStopClip('data/stop-safety.wav',generation);
      } catch(error) { console.error(error);showAudioRetry(); }
      finally { if(generation===stopRequestGeneration) stopRequestQueued=false; }
    }
    waitForAnnouncement();
  }

  // ==========================================
  // ボタン操作
  // ==========================================
  document.getElementById('btn-next').addEventListener('click', () => {
    const data = rosenList[selectedValue];
    if (data && mawashi < data.length - 2) { 
      cancelDoorAnnouncement();
      stopBroadcast(); // ★前の放送を強制停止
      mawashi++;
      updateDisplay();
      forceSwitchToScreen1(); 
      document.getElementById('btn-stop').classList.remove('pushed');
      
      const currentData = data[mawashi + 1];
      publishState('next');
    }
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    if (mawashi > 0) {
      cancelDoorAnnouncement();
      stopBroadcast(); // ★前の放送を強制停止
      mawashi--;
      updateDisplay();
      forceSwitchToScreen1(); 
      document.getElementById('btn-stop').classList.remove('pushed');
      currentAnnounceAudio = playSound(`data/nextpush.wav`);
      publishState('back');
    }
  });

  const btnStop = document.getElementById('btn-stop');
  btnStop.addEventListener('click', () => {
    if (!btnStop.classList.contains('pushed')) {
      btnStop.classList.add('pushed');
      
      const pushSoundVal = document.querySelector('input[name="push_sound"]:checked').value;
      if (pushSoundVal !== "4") playSound(`data/getoffpush${pushSoundVal}.wav`);
      
      triggerNextStopScreen(); 
      
      // ボタンを押した1.5秒後からキュー監視を開始
      setTimeout(() => {
        const destName = rosenList[selectedValue][rosenList[selectedValue].length - 1][1];
        playNextStopAnnounce(destName);
      }, 1500);
      publishState('nextStop');
    }
  });

  const btnOpen = document.getElementById('btn-open');
  const btnClose = document.getElementById('btn-close');
  
  btnOpen.addEventListener('click', () => {
    cancelDoorAnnouncement();
    btnOpen.disabled = true; btnClose.disabled = false;
    btnStop.classList.remove('pushed');
    forceSwitchToScreen1(); 
    clearTimeout(screenTimer); 
    
    const doorBuzzerVal = document.querySelector('input[name="door_buzzer"]:checked').value;
    if (doorBuzzerVal === "1") playSound(`data/taihei_door_open.wav`);
    else playSound(`data/buzzer${doorBuzzerVal}.wav`);
    publishState('open');
  });

  btnClose.addEventListener('click', () => {
    btnClose.disabled=true;btnOpen.disabled=false;
    playDoorClosingAnnouncement();
    triggerDepartScreen();publishState('depart');
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    btnStop.classList.remove('pushed');
    publishState('reset');
  });

  document.getElementById('size-slider').addEventListener('input', (e) => {
    document.getElementById('dp-screen').style.maxWidth = `${e.target.value}px`;
  });

  let gpsWatchId = null;
  let gpsLastAdvanceAt = 0;
  let gpsLastAdvancedIndex = -1;
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const rad = degrees => degrees * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  document.getElementById('gps-start').addEventListener('click', () => {
    const status = document.getElementById('gps-status');
    if (!navigator.geolocation) { status.textContent = 'このブラウザーは位置情報に対応していません'; return; }
    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    status.textContent = 'GPS位置を取得中です…';
    gpsWatchId = navigator.geolocation.watchPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      status.textContent = `現在地 ${latitude.toFixed(5)}, ${longitude.toFixed(5)} · 精度 約${Math.round(accuracy)}m`;
      const route = rosenList[selectedValue];
      const targetIndex = mawashi + 2;
      const target = route && route[targetIndex];
      const doorsClosed = document.getElementById('btn-close').disabled;
      if (!document.getElementById('gps-auto').checked || !target || !target[16] || !target[17] || !doorsClosed) return;
      if (gpsLastAdvancedIndex === mawashi || Date.now() - gpsLastAdvanceAt < 15000) return;
      const distance = distanceMeters(latitude, longitude, Number(target[16]), Number(target[17]));
      const radius = Math.max(10, Number(document.getElementById('gps-radius').value) || 45);
      if (distance <= radius) {
        gpsLastAdvancedIndex = mawashi;
        gpsLastAdvanceAt = Date.now();
        status.textContent = `停留所検知: ${target[0]} (${Math.round(distance)}m) · 自動進行`;
        document.getElementById('btn-next').click();
      }
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
