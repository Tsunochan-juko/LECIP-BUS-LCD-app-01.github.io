import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
  import { getDatabase, ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
  import { firebaseConfig } from './firebase-config.js?v=24';

  const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_')
    && firebaseConfig.databaseURL && !firebaseConfig.databaseURL.startsWith('PASTE_');
  if (configured) {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      document.getElementById('login-button').disabled = true;
      try { await setPersistence(auth, browserLocalPersistence); }
      finally { document.getElementById('login-button').disabled = false; }
      const db = getDatabase(app);
      const clientId = crypto.randomUUID();

      let unsubscribe = null;
      window.firebaseBus = {
        clientId,
        async login(userId, password) {
          const identifier = String(userId || '').trim();
          if (!identifier) throw new Error('ユーザーIDを入力してください');
          const email = identifier.includes('@') ? identifier : `${identifier.toLowerCase()}@bus-display.invalid`;
          try {
            await signInWithEmailAndPassword(auth, email, password);
          } catch (error) {
            if (!identifier.includes('@') && ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code)) {
              throw new Error(`Firebase Authenticationの登録メールを「${email}」に設定し、入力IDと同じパスワードで登録してください。`);
            }
            throw error;
          }

        },
        async logout() {
          if (unsubscribe) unsubscribe();
          await signOut(auth);
        },
        connect(callback) {
          if (unsubscribe) unsubscribe();
          const stateRef = ref(db, 'privateBus/state');
          unsubscribe = onValue(stateRef, snapshot => {
            const value = snapshot.val();
            if (value) callback(value.state, value.writerClientId);
          });
          window.firebaseBus.send = state => set(stateRef, { state, writerClientId: clientId });
          return Promise.resolve();
        },
        send: () => Promise.reject(new Error('ログインして同期を開始してください'))
      };
      onAuthStateChanged(auth, user => {
        if (user) {
          document.getElementById('login-password').value = '';
          window.dispatchEvent(new Event('firebase-authenticated'));
        } else {
          if (unsubscribe) { unsubscribe(); unsubscribe = null; }
          window.firebaseBus.send = () => Promise.reject(new Error('ログインしてください'));
          document.body.classList.remove('authenticated', 'stop-active');
          document.body.classList.add('auth-required');
          document.getElementById('login-button').style.display = 'inline-block';
          document.getElementById('logout-button').style.display = 'none';
          const close = document.getElementById('login-close');
          if (close) close.hidden = true;
          document.getElementById('connection-status').textContent = 'ユーザーIDとパスワードでログインしてください';
        }
      }, error => { document.getElementById('connection-status').textContent = 'ログイン状態の復元に失敗しました: ' + error.message; });
    } catch (error) {
      document.getElementById('connection-status').textContent = `Firebase初期化エラー: ${error.message}`;
    }
  } else {
    document.getElementById('connection-status').textContent = 'firebase-config.js にFirebaseのWeb設定を入力してください';
  }
