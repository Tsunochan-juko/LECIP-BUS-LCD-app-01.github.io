# Firebase と GitHub Pages の設定

このアプリは静的ページを GitHub Pages で配信し、Firebase Authentication と Realtime Database で iPad・iPhone 間を同期します。部屋IDは使わず、両端末で同じ Firebase アカウントにログインします。

## Firebase の準備

1. Firebase Console でプロジェクトを作成し、Web アプリを追加します。
2. Authentication の Sign-in method で Email/Password を有効にし、Authentication の Users から自分用のアカウントを作成します。Webページには登録機能がないため、アカウントは Console で作成します。
3. Realtime Database を作成し、Console の Web app 設定値を `firebase-config.js` にコピーします。`databaseURL` は Realtime Database の URL です。
4. Authentication の Users に表示される自分の UID をコピーし、`database.rules.json` の `REPLACE_WITH_YOUR_FIREBASE_UID` を置き換えます。
5. `database.rules.json` の内容を Realtime Database の Rules に貼り付けて Publish します。未ログインのアクセスと、指定UID以外の読み書きを拒否します。
6. `firebase-config.js`、`database.rules.json`、`index.html` と `data/` を GitHub リポジトリに追加し、GitHub Pages を有効にします。

Firebase Web API key はブラウザー向け識別子で、秘密情報ではありません。パスワードはソースに保存しません。Realtime Database のルールに UID を設定する前に公開すると、想定したユーザー制限になりません。

## 端末での使い方

1. iPhone で `iphone.html` を開き、専用アカウントにログインします。
2. 路線一覧から路線を選択します。CSVはGitHub Pagesから読み込まれ、操作した状態は `privateBus/state` に保存されます。
3. iPad で `ipad.html` を開き、同じアカウントにログインします。表示画面が同期します。
4. iPadで音声を出す場合は、最初に「表示音声を有効化」をタップします。

`iphone.html` と `ipad.html` はそれぞれ独立した画面です。どちらの端末も同じ GitHub Pages サイト内の別URLを使います。


## 自作路線の保存

編集画面 `route-editor.html?v=25` も同じFirebase Authenticationを使います。
自作路線は `privateBus/state/customRoutes/{routeId}` に保存されます。運行データと同じUID制限を継承し、未ログインでは読み書きしません。
現在の同期に使用しているルールが `privateBus/state` に対して自分のUIDを許可し、`state` と `writerClientId` の存在を検証する形式なら、同じ許可内で動作します。
保存はトランザクションを使用し、同階層の運行状態を保持します。通常の運行状態送信も部分更新に変更しています。
接続・保存が拒否された場合は編集画面のエラーに表示します。現行のログイン・同期が成立しているUIDのルールを使用してください。
