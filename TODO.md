# Koe — 公開・配布タスク

## 未対応（外部リソース・手動作業が必要）

### 1. コード署名
- Windows: EV証明書で SmartScreen 警告を回避
- macOS: Apple Developer Program ($99/年) で Gatekeeper 対応
- 署名なしの場合、ユーザーに手動許可手順の案内が必要

### ~~2. GitHub Actions CI/CD~~ ✅
- [x] `tauri-action` で Windows/macOS バイナリを自動ビルド
- [x] タグプッシュ時に GitHub Releases へ自動アップロード
- [x] ワークフローファイル: `.github/workflows/release.yml`

### ~~3. 自動更新機能~~ ✅
- [x] `tauri-plugin-updater` を導入
- [x] GitHub Releases を更新サーバーとして利用
- [x] `tauri.conf.json` に updater 設定を追加
- [x] 更新チェック UI (UpdateChecker コンポーネント) を追加

### ~~4. README にインストール手順追加~~ ✅
- [x] エンドユーザー向けのダウンロード・インストール手順
- [x] 初回セットアップ（whisper-cli DL → モデル DL → 録音テスト）
- [x] 開発者向けリリース手順・署名キー設定手順

### ~~5. GitHub リポジトリ作成・初回プッシュ~~ ✅
- [x] リポジトリ作成 (https://github.com/avakero/koe)
- [x] `.gitignore` 作成（node_modules, target, dist 等）
- [x] 初回コミット・プッシュ

## 完了済み

- [x] MIT LICENSE ファイル追加
- [x] package.json / Cargo.toml にライセンス記載
- [x] CSP 設定（Gemini API ドメイン許可）
- [x] バンドルメタデータ（publisher, copyright, category 等）
- [x] プライバシーポリシー（PRIVACY.md）
- [x] サードパーティライセンス（THIRD_PARTY_LICENSES.md）
- [x] README 更新（ショートカット、ライセンス、プライバシーセクション）
- [x] 一時 WAV ファイル自動削除
- [x] エラーメッセージ詳細化（UI + バックエンド）
- [x] whisper-cli DLL 同梱展開
- [x] large モデル対応 + モデル比較テーブル表示
