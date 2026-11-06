# バス運賃表示器シミュレーター (GitHub Pages)

## 公開前に必要な設定

1. `firebase-config.js` にFirebase Webアプリの設定値を入れます。
2. `database.rules.json` の `REPLACE_WITH_YOUR_FIREBASE_UID` を自分のFirebase UIDに置き換え、Realtime Database Rulesに反映します。
3. Firebase Authenticationで Email/Password を有効にし、自分用ユーザーを作成します。
4. GitHub Pagesをこのフォルダのブランチルートから公開します。

パスワードはソースに保存しません。GitHub Pagesのソースと静的ファイルは公開されます。同期データはFirebase Database RulesでUID制限してください。詳しい手順は `FIREBASE_SETUP.md` を参照してください。

## 画面

- `iphone.html`: iPhone操作画面
- `ipad.html`: iPad表示画面
- `index.html`: 端末別画面の選択ページ

両方で同じFirebaseアカウントにログインします。`routes/index.json` と `routes/` のCSVを自動で読み込みます。

## 路線データ更新

`GTFSをCSVに変換.bat` にGTFS ZIPかZIPを入れたフォルダをドラッグ＆ドロップします。変換済みCSVと一覧を `routes/` に生成します。出力名にはCSV末尾行の系統名を含めます。GTFSの出典、ライセンス、利用目的フォームは `GTFS_TO_CSV.md` に記載しています。


現在のGTFS生成CSVは緯度経度列を含みます。車内放送音声フォルダ `sound_file/` も含めています。GTFSデータ自体に音声パスがない路線は、Web Speech APIで停留所名を読み上げます。表示端末で日本語音声を選択できます。



## 架空路線エディター

入口の「架空路線をつくる」、または `route-editor.html?v=24` から開きます。
地図クリックで停留所を追加し、マーカーをドラッグして位置を調整できます。
停留所順・読み仮名・英語名・整理券1～6の運賃・録音ファイル・営業所を編集できます。
既存CSVの読み込み、停留所の複製・上下移動、下書きの自動保存にも対応しています。

1. 「CSVを保存」で保存したCSVを `routes/fictional/` に置きます。
2. 「一覧JSONを保存」で取得したファイルを `routes/index.json` に置きます。
3. まとめてpushすると、iPhoneの「架空路線」から選択できます。

一覧JSONは公開済みの一覧を基にします。未公開の変更がある場合は「手元の一覧JSONを開く」で最新のローカルファイルを選んでから保存してください。
編集画面はブラウザ内で動作し、GitHubやFirebaseへ直接書き込みません。
地図はOpenStreetMapのタイルを使用するため通信が必要です。地図が出ない場合も座標の直接入力で編集できます。