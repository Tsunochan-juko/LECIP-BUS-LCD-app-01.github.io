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



## 自作路線エディター（ログイン必須）

入口の「架空路線をつくる」、または `route-editor.html?v=25` から開き、運転画面と同じID・パスワードでログインします。

- CSVを作成、または「CSVを開く」で読み込み、「自作路線に保存」を押すとFirebaseへ登録されます。
- iPhoneの「自作路線」へ自動表示されます。通常の路線と同じように選択するとiPadへ同期します。
- 「登録済みの自作路線」で路線を選び「選択した路線を編集」から再編集できます。保存すると同じ路線を更新します。
- 「別の路線として保存」は新しい路線IDで複製します。
- GitHubに配置済みの自作CSVも編集一覧に表示します。その原本を開いてFirebaseへ保存することもできます。
- CSVの書き出し・読み込みは引き続き使用できます。端末の下書き保存だけでは自作路線一覧へ反映しません。

この機能を最初にpushした後、iPhone・iPad・編集画面をv25で開き直してください。以降の自作路線の追加・編集ではpushは不要です。

Firebaseの保存先は `privateBus/state/customRoutes` です。既存の `privateBus/state` のUID付きアクセス制限を継承します。
運行状態の送信は必要なフィールドだけを更新し、登録済み路線を保持します。
路線ごとにCSV・名前・所有UID・更新番号を保存し、他画面で更新済みの古い下書きによる上書きを防止します。

編集画面はログイン状態を復元します。パスワードをCSVやソースコードへ保存しません。
地図はOpenStreetMapのタイルを使用します。地図が出ない場合も座標の直接入力で編集できます。
