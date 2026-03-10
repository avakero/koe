import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getApiKey,
  saveApiKey,
  getShortcut,
  saveShortcut,
  getModel,
  saveModel,
} from "../lib/gemini";

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl+Shift+K");
  const [model, setModel] = useState<"small" | "medium" | "large">("small");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [binDownloading, setBinDownloading] = useState(false);
  const [binProgress, setBinProgress] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [isMsgError, setIsMsgError] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => { if (k) setApiKey(k); });
    getShortcut().then((k) => setShortcut(k));
    getModel().then((m) => setModel(m));

    const ul1 = listen<number>("model-download-progress", ({ payload }) => {
      setDownloadProgress(payload);
      if (payload >= 100) setDownloading(false);
    });
    const ul2 = listen<number>("bin-download-progress", ({ payload }) => {
      setBinProgress(payload);
      if (payload >= 100) setBinDownloading(false);
    });
    return () => { ul1.then((fn) => fn()); ul2.then((fn) => fn()); };
  }, []);

  const handleShortcutSave = async () => {
    try {
      await saveShortcut(shortcut);
      await invoke("update_shortcut", { shortcut });
      flash("ショートカットを更新しました");
    } catch (e) {
      flash(`ショートカット更新エラー: ${e}`, true);
    }
  };

  const handleModelDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      await saveModel(model);
      await invoke("download_model", { model });
    } catch (e) {
      flash(`モデルダウンロードエラー: ${e}`, true);
      setDownloading(false);
    }
  };

  const handleApiKeySave = async () => {
    await saveApiKey(apiKey);
    flash("APIキーを保存しました");
  };

  const handleBinDownload = async () => {
    setBinDownloading(true);
    setBinProgress(0);
    try {
      await invoke("download_whisper_bin");
      flash("whisper-cli のダウンロード完了");
    } catch (e) {
      flash(`whisper-cli ダウンロードエラー: ${e}`, true);
      setBinDownloading(false);
    }
  };

  const flash = (msg: string, isError = false) => {
    setSaveMsg(msg);
    setIsMsgError(isError);
    setTimeout(() => { setSaveMsg(""); setIsMsgError(false); }, isError ? 10000 : 3000);
  };

  const sectionStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#718096",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ padding: "4px 10px" }}>
          ← 戻る
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>設定</h2>
      </div>

      {saveMsg && (
        <div
          style={{
            background: isMsgError ? "#fff5f5" : "#ebf8ff",
            border: `1px solid ${isMsgError ? "#feb2b2" : "#bee3f8"}`,
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 16,
            fontSize: 13,
            color: isMsgError ? "#c53030" : "#2b6cb0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {saveMsg}
        </div>
      )}

      {/* ショートカット設定 */}
      <div style={sectionStyle}>
        <span style={labelStyle}>グローバルショートカット</span>
        <p style={{ fontSize: 12, color: "#718096", marginBottom: 10 }}>
          録音開始/停止のショートカットキー。
          例: <code>Ctrl+Shift+K</code>, <code>Ctrl+Shift+Space</code>, <code>F8</code>
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="Ctrl+Shift+K"
            style={{ flex: 1 }}
          />
          <button onClick={handleShortcutSave}>更新</button>
        </div>
      </div>

      {/* モデル選択 */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Whisper モデル</span>
        <p style={{ fontSize: 12, color: "#718096", marginBottom: 10 }}>
          初回のみダウンロードが必要です。モデルは App データフォルダに保存されます。
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as "small" | "medium" | "large")}
            style={{ flex: 1 }}
          >
            <option value="small">small — 466 MB</option>
            <option value="medium">medium — 1.5 GB</option>
            <option value="large">large — 2.9 GB</option>
          </select>
          <button onClick={handleModelDownload} disabled={downloading}>
            {downloading ? "DL中..." : "ダウンロード"}
          </button>
        </div>
        {downloadProgress !== null && (
          <div>
            <div
              style={{
                height: 6,
                background: "#e2e8f0",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${downloadProgress}%`,
                  background: "#4299e1",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: "#718096", marginTop: 4 }}>
              {downloadProgress < 100
                ? `${downloadProgress.toFixed(1)}% ダウンロード中...`
                : "ダウンロード完了"}
            </p>
          </div>
        )}
        <table style={{ width: "100%", fontSize: 11, color: "#718096", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>モデル</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>精度</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>速度</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>推奨RAM</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f7fafc" }}>
              <td style={{ padding: "4px 6px", fontWeight: 600 }}>small</td>
              <td style={{ padding: "4px 6px" }}>日常会話に十分</td>
              <td style={{ padding: "4px 6px" }}>速い</td>
              <td style={{ padding: "4px 6px" }}>~1 GB</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f7fafc" }}>
              <td style={{ padding: "4px 6px", fontWeight: 600 }}>medium</td>
              <td style={{ padding: "4px 6px" }}>専門用語に強い</td>
              <td style={{ padding: "4px 6px" }}>普通</td>
              <td style={{ padding: "4px 6px" }}>~2.5 GB</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 6px", fontWeight: 600 }}>large</td>
              <td style={{ padding: "4px 6px" }}>最高精度</td>
              <td style={{ padding: "4px 6px" }}>遅い</td>
              <td style={{ padding: "4px 6px" }}>~5 GB</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* whisper-cli バイナリ */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Whisper CLI バイナリ（初回のみ）</span>
        <p style={{ fontSize: 12, color: "#718096", marginBottom: 10 }}>
          音声認識エンジン本体です。モデルより先にダウンロードしてください。
          約 10〜30 MB。
        </p>
        <button onClick={handleBinDownload} disabled={binDownloading}>
          {binDownloading ? "DL中..." : "whisper-cli をダウンロード"}
        </button>
        {binProgress !== null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${binProgress}%`, background: "#68d391", transition: "width 0.3s" }} />
            </div>
            <p style={{ fontSize: 12, color: "#718096", marginTop: 4 }}>
              {binProgress < 100 ? `${binProgress.toFixed(1)}%...` : "完了"}
            </p>
          </div>
        )}
      </div>

      {/* Gemini API キー */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Gemini API キー（任意）</span>
        <p style={{ fontSize: 12, color: "#718096", marginBottom: 10 }}>
          未入力の場合、Whisper の認識テキストをそのままペーストします。
          <br />
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4299e1" }}
          >
            Google AI Studio でキーを取得 →
          </a>
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza... （省略可）"
          style={{ marginBottom: 8 }}
        />
        <button onClick={handleApiKeySave}>保存</button>
      </div>
    </div>
  );
}
