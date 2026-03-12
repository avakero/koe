import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import {
  getApiKey,
  saveApiKey,
  getShortcut,
  saveShortcut,
  getModel,
  saveModel,
  getAccentColor,
  saveAccentColor,
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
  const [capturing, setCapturing] = useState(false);
  const [accentColor, setAccentColor] = useState("ocean");

  const colorPresets: Record<string, { label: string; colors: [string, string] }> = {
    ocean: { label: "オーシャン", colors: ["#00f0ff", "#a855f7"] },
    sunset: { label: "サンセット", colors: ["#ff6b35", "#ff00aa"] },
    forest: { label: "フォレスト", colors: ["#00ff88", "#00f0ff"] },
    lavender: { label: "ラベンダー", colors: ["#a855f7", "#ff00aa"] },
    neon: { label: "ネオン", colors: ["#00f0ff", "#ff00aa"] },
  };

  useEffect(() => {
    getApiKey().then((k) => { if (k) setApiKey(k); });
    getShortcut().then((k) => setShortcut(k));
    getModel().then((m) => setModel(m));
    getAccentColor().then((c) => setAccentColor(c));

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

  const handleKeyCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");

    const keyMap: Record<string, string> = {
      " ": "Space", "ArrowUp": "Up", "ArrowDown": "Down",
      "ArrowLeft": "Left", "ArrowRight": "Right",
      "Escape": "Escape", "Enter": "Enter",
      "Backspace": "Backspace", "Delete": "Delete", "Tab": "Tab",
    };

    let keyName = keyMap[e.key] || e.key;
    if (keyName.length === 1 && /[a-zA-Z]/.test(keyName)) {
      keyName = keyName.toUpperCase();
    }

    parts.push(keyName);
    const newShortcut = parts.join("+");
    setShortcut(newShortcut);
    setCapturing(false);
  };

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
    background: "rgba(15, 15, 35, 0.7)",
    border: "1px solid rgba(0, 240, 255, 0.12)",
    borderRadius: 2,
    padding: 16,
    marginBottom: 16,
    backdropFilter: "blur(10px)",
    position: "relative",
    overflow: "hidden",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 600,
    color: "#00f0ff",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* Scanline overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 100,
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            border: "1px solid rgba(0,240,255,0.2)",
            color: "#00f0ff",
          }}
        >
          ← BACK
        </button>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          background: "linear-gradient(135deg, #00f0ff, #a855f7)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: 3,
        }}>CONFIG</h2>
      </div>

      {/* Flash message */}
      {saveMsg && (
        <div
          style={{
            background: isMsgError ? "rgba(255,51,102,0.1)" : "rgba(0,240,255,0.1)",
            border: `1px solid ${isMsgError ? "rgba(255,51,102,0.4)" : "rgba(0,240,255,0.3)"}`,
            borderRadius: 2,
            padding: "8px 14px",
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 600,
            color: isMsgError ? "#ff6b8a" : "#00f0ff",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            animation: "fadeIn 0.2s ease-out",
            fontFamily: "'Rajdhani', sans-serif",
          }}
        >
          {isMsgError ? "⚠ " : "✓ "}{saveMsg}
        </div>
      )}

      {/* Shortcut */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Global Shortcut</span>
        <p style={{ fontSize: 12, color: "#6b7ea6", marginBottom: 10 }}>
          録音開始/停止のショートカットキー。下のボタンを押してからキーを入力してください。
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            tabIndex={0}
            onKeyDown={capturing ? handleKeyCapture : undefined}
            onBlur={() => setCapturing(false)}
            onClick={() => setCapturing(true)}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 2,
              border: capturing ? "1px solid #00f0ff" : "1px solid rgba(0,240,255,0.15)",
              background: capturing ? "rgba(0,240,255,0.08)" : "rgba(10,10,20,0.6)",
              fontSize: 14,
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 600,
              textAlign: "center",
              cursor: "pointer",
              outline: "none",
              color: capturing ? "#00f0ff" : "#e0e6ff",
              transition: "all 0.2s",
              userSelect: "none",
              boxShadow: capturing ? "0 0 15px rgba(0,240,255,0.2)" : "none",
              letterSpacing: 1,
            }}
          >
            {capturing ? "⌨ キーを入力..." : shortcut}
          </div>
          <button onClick={handleShortcutSave}>SET</button>
        </div>
      </div>

      {/* Model */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Whisper Model</span>
        <p style={{ fontSize: 12, color: "#6b7ea6", marginBottom: 10 }}>
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
            {downloading ? "DL..." : "DOWNLOAD"}
          </button>
        </div>
        {downloadProgress !== null && (
          <div>
            <div style={{ height: 4, background: "rgba(0,240,255,0.1)", borderRadius: 1, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${downloadProgress}%`,
                  background: "linear-gradient(90deg, #00f0ff, #a855f7)",
                  transition: "width 0.3s",
                  boxShadow: "0 0 10px rgba(0,240,255,0.5)",
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: "#6b7ea6", marginTop: 4, fontFamily: "'Orbitron', sans-serif" }}>
              {downloadProgress < 100 ? `${downloadProgress.toFixed(1)}%` : "COMPLETE"}
            </p>
          </div>
        )}
        <table style={{ width: "100%", fontSize: 11, color: "#6b7ea6", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(0,240,255,0.1)", textAlign: "left" }}>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "#00f0ff", fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 1 }}>MODEL</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "#00f0ff", fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 1 }}>ACCURACY</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "#00f0ff", fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 1 }}>SPEED</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "#00f0ff", fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 1 }}>RAM</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid rgba(0,240,255,0.05)" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "#e0e6ff" }}>small</td>
              <td style={{ padding: "6px 8px" }}>日常会話に十分</td>
              <td style={{ padding: "6px 8px", color: "#00ff88" }}>▲ 高速</td>
              <td style={{ padding: "6px 8px" }}>~1 GB</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(0,240,255,0.05)" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "#e0e6ff" }}>medium</td>
              <td style={{ padding: "6px 8px" }}>専門用語に強い</td>
              <td style={{ padding: "6px 8px", color: "#ffe600" }}>◆ 普通</td>
              <td style={{ padding: "6px 8px" }}>~2.5 GB</td>
            </tr>
            <tr>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "#e0e6ff" }}>large</td>
              <td style={{ padding: "6px 8px" }}>最高精度</td>
              <td style={{ padding: "6px 8px", color: "#ff6b8a" }}>▼ 低速</td>
              <td style={{ padding: "6px 8px" }}>~5 GB</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Whisper CLI binary */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Whisper CLI Binary</span>
        <p style={{ fontSize: 12, color: "#6b7ea6", marginBottom: 10 }}>
          音声認識エンジン本体。モデルより先にダウンロードしてください。約 10〜30 MB。
        </p>
        <button onClick={handleBinDownload} disabled={binDownloading}>
          {binDownloading ? "DL..." : "⬇ DOWNLOAD WHISPER-CLI"}
        </button>
        {binProgress !== null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: "rgba(0,255,136,0.1)", borderRadius: 1, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${binProgress}%`,
                background: "linear-gradient(90deg, #00ff88, #00f0ff)",
                transition: "width 0.3s",
                boxShadow: "0 0 10px rgba(0,255,136,0.5)",
              }} />
            </div>
            <p style={{ fontSize: 11, color: "#6b7ea6", marginTop: 4, fontFamily: "'Orbitron', sans-serif" }}>
              {binProgress < 100 ? `${binProgress.toFixed(1)}%` : "COMPLETE"}
            </p>
          </div>
        )}
      </div>

      {/* Accent color */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Accent Color</span>
        <p style={{ fontSize: 12, color: "#6b7ea6", marginBottom: 12 }}>
          フローティングモードのビジュアライザーの色を変更できます。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(colorPresets).map(([key, { label, colors: [c1, c2] }]) => (
            <div
              key={key}
              onClick={async () => {
                setAccentColor(key);
                await saveAccentColor(key);
                await emit("accent-color-changed", key);
                flash(`カラーを「${label}」に変更しました`);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${c1}, ${c2})`,
                  border: accentColor === key ? `2px solid ${c1}` : "1px solid rgba(255,255,255,0.1)",
                  boxShadow: accentColor === key ? `0 0 12px ${c1}60` : "none",
                  transition: "all 0.2s",
                }}
              />
              <span style={{
                fontSize: 9,
                fontFamily: "'Orbitron', sans-serif",
                color: accentColor === key ? "#e0e6ff" : "#6b7ea6",
                fontWeight: accentColor === key ? 700 : 400,
                letterSpacing: 0.5,
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gemini API Key */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Gemini API Key</span>
        <p style={{ fontSize: 12, color: "#6b7ea6", marginBottom: 10 }}>
          未入力の場合、Whisper の認識テキストをそのままペーストします。
          <br />
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#00f0ff" }}
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
        <button onClick={handleApiKeySave}>SAVE</button>
      </div>
    </div>
  );
}
