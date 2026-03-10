# Koe 🎙️ — 完全無料 日本語音声入力アプリ

Whisper.cpp (ローカル推論) + Gemini BYOK で動く、開発者コスト $0 の日本語音声入力ツール。

## 機能

- **グローバルショートカット** (デフォルト: Ctrl+Shift+K) で録音開始/停止
- **Whisper.cpp** でオフライン日本語文字起こし
- **Gemini API** (任意) でフィラーワード除去・句読点整形
- 整形後テキストを **アクティブウィンドウに自動ペースト**
- システムトレイ常駐

## 必要なもの

### ビルド時
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- **CMake 3.14+** (whisper-rs のビルドに必要)
  - Windows: `winget install cmake` または Visual Studio Installer
  - macOS: `brew install cmake`
- Windows: Visual Studio Build Tools (MSVC)
- macOS: Xcode Command Line Tools (`xcode-select --install`)

### 実行時
- Whisper モデル (設定画面からダウンロード)
  - `small`: 466 MB — 日本語で十分な精度
  - `medium`: 1.5 GB — より高精度

## セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run tauri dev
```

## ビルド

```bash
npm run tauri build
```

## macOS 未署名バイナリの実行

```bash
xattr -dr com.apple.quarantine /Applications/Koe.app
```

## 初回セットアップ手順

1. アプリを起動
2. 設定画面 → Whisper モデルをダウンロード
3. (任意) [Google AI Studio](https://aistudio.google.com/app/apikey) で Gemini API キーを取得し設定
4. Ctrl+Shift+K で録音開始 → もう一度押して停止 → 自動ペースト

## コスト

| 項目 | コスト |
|------|-------|
| 音声認識 (Whisper.cpp) | $0 — ローカル処理 |
| AI 整形 (Gemini) | $0 — ユーザー自身の API キー |
| 配布 (GitHub Releases) | $0 — 無料枠 |

## アーキテクチャ

```
Ctrl+Shift+K 押下
  └─ Rust: cpal で録音開始
Ctrl+Shift+K 再押下
  └─ Rust: 録音停止 → WAV 保存 → whisper-rs で推論
     └─ Tauri Event: transcription-complete (生テキスト)
        └─ フロントエンド:
           ├─ Gemini API キーあり → 整形 → paste_text コマンド
           └─ Gemini API キーなし → そのまま → paste_text コマンド
              └─ Rust: arboard でクリップボード → enigo で Ctrl+V
```

## プライバシー

音声データはすべてローカルで処理され、外部に送信されることはありません。Gemini API（オプション）を有効にした場合のみ、文字起こしテキストが Google に送信されます。

詳細は [PRIVACY.md](PRIVACY.md) をご覧ください。

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) をご覧ください。

サードパーティライブラリのライセンスは [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) をご覧ください。
