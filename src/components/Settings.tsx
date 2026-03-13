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
import { useTheme } from "../lib/ThemeContext";
import { THEMES, ThemeId } from "../lib/themes";

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const { theme, setTheme } = useTheme();
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

  const isCyberpunk = theme === "cyberpunk";
  const isPop = theme === "pop";
  const isRetro = theme === "retro";
  const isNatural = theme === "natural";
  const isMidnight = theme === "midnight";
  const hasScanline = isCyberpunk || isRetro;

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
    background: "var(--t-bg-card)",
    border: "1px solid var(--t-border)",
    borderRadius: "var(--t-radius-lg)",
    padding: 16,
    marginBottom: 16,
    backdropFilter: "var(--t-section-backdrop)",
    position: "relative",
    overflow: "hidden",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--t-label-size)",
    fontFamily: "var(--t-font-display)",
    fontWeight: 600,
    color: "var(--t-primary)",
    textTransform: (isCyberpunk || isRetro) ? "uppercase" as const : "none" as const,
    letterSpacing: "var(--t-label-spacing)",
    marginBottom: 8,
    display: "block",
  };

  // Theme preview styles
  const themePreviewColors: Record<ThemeId, { bg: string; accent: string; text: string; border: string }> = {
    cyberpunk: { bg: "#0d0d1a", accent: "#00f0ff", text: "#e0e6ff", border: "rgba(0,240,255,0.4)" },
    simple: { bg: "#f7f8fa", accent: "#2563eb", text: "#1e293b", border: "rgba(37,99,235,0.4)" },
    pop: { bg: "#fdf2f8", accent: "#ec4899", text: "#4a1d4e", border: "rgba(236,72,153,0.4)" },
    natural: { bg: "#f5f0e8", accent: "#5a7247", text: "#3e3428", border: "rgba(90,114,71,0.4)" },
    midnight: { bg: "#1e1e30", accent: "#d4a853", text: "#e8e4df", border: "rgba(212,168,83,0.4)" },
    retro: { bg: "#0f1f0f", accent: "#33ff33", text: "#33ff33", border: "rgba(51,255,51,0.4)" },
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* Scanline overlay — cyberpunk & retro */}
      {hasScanline && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            zIndex: 100,
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, var(--t-scanline) 2px, var(--t-scanline) 4px)",
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            border: "1px solid var(--t-border)",
            color: "var(--t-primary)",
            borderRadius: "var(--t-radius)",
          }}
        >
          {isCyberpunk ? "← BACK" : isRetro ? "> BACK" : "← 戻る"}
        </button>
        <h2 style={{
          fontFamily: "var(--t-font-display)",
          fontSize: isRetro ? 14 : 18,
          fontWeight: 700,
          background: "var(--t-gradient)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: isCyberpunk ? 3 : isRetro ? 4 : 1,
        }}>{isCyberpunk ? "CONFIG" : isRetro ? "> CONFIG" : isPop ? "⚙ せってい" : isNatural ? "設定" : isMidnight ? "設定" : "設定"}</h2>
      </div>

      {/* Flash message */}
      {saveMsg && (
        <div
          style={{
            background: isMsgError ? `rgba(255,51,102,0.1)` : `rgba(0,240,255,0.1)`,
            border: `1px solid ${isMsgError ? "var(--t-danger)" : "var(--t-primary)"}`,
            borderRadius: "var(--t-radius)",
            padding: "8px 14px",
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 600,
            color: isMsgError ? "var(--t-danger)" : "var(--t-primary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            animation: "fadeIn 0.2s ease-out",
            fontFamily: "var(--t-font-body)",
          }}
        >
          {isMsgError ? "⚠ " : "✓ "}{saveMsg}
        </div>
      )}

      {/* Theme selector */}
      <div style={sectionStyle}>
        <span style={labelStyle}>{isCyberpunk ? "UI THEME" : isRetro ? "> THEME" : isPop ? "🎨 テーマ" : isNatural ? "テーマ" : "テーマ"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 12 }}>
          アプリ全体の見た目を切り替えられます。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const t = THEMES[id];
            const colors = themePreviewColors[id];
            const isActive = theme === id;
            return (
              <div
                key={id}
                onClick={async () => {
                  await setTheme(id);
                  await emit("theme-changed", id);
                  flash(`テーマを「${t.label}」に変更しました`);
                }}
                style={{
                  flex: "1 1 0",
                  minWidth: 120,
                  padding: 12,
                  borderRadius: "var(--t-radius-lg)",
                  background: colors.bg,
                  border: isActive ? `2px solid ${colors.border}` : "2px solid transparent",
                  boxShadow: isActive ? `0 0 12px ${colors.accent}40` : "0 1px 4px rgba(0,0,0,0.1)",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  textAlign: "center",
                }}
              >
                {/* Mini preview bar */}
                <div style={{
                  height: 4,
                  borderRadius: 2,
                  background: `linear-gradient(90deg, ${colors.accent}, ${colors.accent}88)`,
                  marginBottom: 8,
                }} />
                <div style={{
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: colors.text,
                  fontFamily: "var(--t-font-body)",
                }}>
                  {t.label}
                </div>
                <div style={{
                  fontSize: 9,
                  color: colors.text,
                  opacity: 0.6,
                  marginTop: 2,
                }}>
                  {t.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shortcut */}
      <div style={sectionStyle}>
        <span style={labelStyle}>{isCyberpunk ? "Global Shortcut" : isRetro ? "> SHORTCUT" : isPop ? "⌨ ショートカット" : "ショートカットキー"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 10 }}>
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
              borderRadius: "var(--t-radius)",
              border: capturing ? "1px solid var(--t-primary)" : "1px solid var(--t-border)",
              background: capturing ? (isCyberpunk ? "rgba(0,240,255,0.08)" : isPop ? "rgba(236,72,153,0.06)" : "rgba(37,99,235,0.04)") : "var(--t-input-bg)",
              fontSize: 14,
              fontFamily: "var(--t-font-display)",
              fontWeight: 600,
              textAlign: "center",
              cursor: "pointer",
              outline: "none",
              color: capturing ? "var(--t-primary)" : "var(--t-text)",
              transition: "all 0.2s",
              userSelect: "none",
              boxShadow: capturing ? "var(--t-glow)" : "none",
              letterSpacing: isCyberpunk ? 1 : 0,
            }}
          >
            {capturing ? "⌨ キーを入力..." : shortcut}
          </div>
          <button onClick={handleShortcutSave}>{isCyberpunk ? "SET" : "保存"}</button>
        </div>
      </div>

      {/* Model */}
      <div style={sectionStyle}>
        <span style={labelStyle}>{isCyberpunk ? "Whisper Model" : isPop ? "🤖 AIモデル" : "Whisper モデル"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 10 }}>
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
            {downloading ? "DL..." : (isCyberpunk ? "DOWNLOAD" : "ダウンロード")}
          </button>
        </div>
        {downloadProgress !== null && (
          <div>
            <div style={{ height: 4, background: "var(--t-border)", borderRadius: "var(--t-radius)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${downloadProgress}%`,
                  background: "var(--t-gradient-button)",
                  transition: "width 0.3s",
                  boxShadow: isCyberpunk ? "0 0 10px rgba(0,240,255,0.5)" : "none",
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: "var(--t-text-dim)", marginTop: 4, fontFamily: "var(--t-font-display)" }}>
              {downloadProgress < 100 ? `${downloadProgress.toFixed(1)}%` : (isCyberpunk ? "COMPLETE" : "完了")}
            </p>
          </div>
        )}
        <table style={{ width: "100%", fontSize: 11, color: "var(--t-text-dim)", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--t-border)", textAlign: "left" }}>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "var(--t-primary)", fontFamily: "var(--t-font-display)", fontSize: "var(--t-label-size)", letterSpacing: "var(--t-label-spacing)" }}>
                {isCyberpunk ? "MODEL" : "モデル"}
              </th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "var(--t-primary)", fontFamily: "var(--t-font-display)", fontSize: "var(--t-label-size)", letterSpacing: "var(--t-label-spacing)" }}>
                {isCyberpunk ? "ACCURACY" : "精度"}
              </th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "var(--t-primary)", fontFamily: "var(--t-font-display)", fontSize: "var(--t-label-size)", letterSpacing: "var(--t-label-spacing)" }}>
                {isCyberpunk ? "SPEED" : "速度"}
              </th>
              <th style={{ padding: "6px 8px", fontWeight: 700, color: "var(--t-primary)", fontFamily: "var(--t-font-display)", fontSize: "var(--t-label-size)", letterSpacing: "var(--t-label-spacing)" }}>RAM</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--t-border)" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--t-text)" }}>small</td>
              <td style={{ padding: "6px 8px" }}>日常会話に十分</td>
              <td style={{ padding: "6px 8px", color: "var(--t-success)" }}>▲ 高速</td>
              <td style={{ padding: "6px 8px" }}>~1 GB</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--t-border)" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--t-text)" }}>medium</td>
              <td style={{ padding: "6px 8px" }}>専門用語に強い</td>
              <td style={{ padding: "6px 8px", color: "var(--t-warning)" }}>◆ 普通</td>
              <td style={{ padding: "6px 8px" }}>~2.5 GB</td>
            </tr>
            <tr>
              <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--t-text)" }}>large</td>
              <td style={{ padding: "6px 8px" }}>最高精度</td>
              <td style={{ padding: "6px 8px", color: "var(--t-danger)" }}>▼ 低速</td>
              <td style={{ padding: "6px 8px" }}>~5 GB</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Whisper CLI binary */}
      <div style={sectionStyle}>
        <span style={labelStyle}>{isCyberpunk ? "Whisper CLI Binary" : isPop ? "📦 音声エンジン" : "Whisper CLI バイナリ"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 10 }}>
          音声認識エンジン本体。モデルより先にダウンロードしてください。約 10〜30 MB。
        </p>
        <button onClick={handleBinDownload} disabled={binDownloading}>
          {binDownloading ? "DL..." : (isCyberpunk ? "⬇ DOWNLOAD WHISPER-CLI" : "⬇ ダウンロード")}
        </button>
        {binProgress !== null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: "var(--t-border)", borderRadius: "var(--t-radius)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${binProgress}%`,
                background: "var(--t-gradient-button)",
                transition: "width 0.3s",
                boxShadow: isCyberpunk ? "0 0 10px rgba(0,255,136,0.5)" : "none",
              }} />
            </div>
            <p style={{ fontSize: 11, color: "var(--t-text-dim)", marginTop: 4, fontFamily: "var(--t-font-display)" }}>
              {binProgress < 100 ? `${binProgress.toFixed(1)}%` : (isCyberpunk ? "COMPLETE" : "完了")}
            </p>
          </div>
        )}
      </div>

      {/* Accent color */}
      <div style={sectionStyle}>
        <span style={labelStyle}>{isCyberpunk ? "Accent Color" : isPop ? "🌈 アクセントカラー" : "アクセントカラー"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 12 }}>
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
                  borderRadius: isPop ? 18 : "var(--t-radius)",
                  background: `linear-gradient(135deg, ${c1}, ${c2})`,
                  border: accentColor === key ? `2px solid ${c1}` : "1px solid rgba(255,255,255,0.1)",
                  boxShadow: accentColor === key ? `0 0 12px ${c1}60` : "none",
                  transition: "all 0.2s",
                }}
              />
              <span style={{
                fontSize: 9,
                fontFamily: "var(--t-font-display)",
                color: accentColor === key ? "var(--t-text)" : "var(--t-text-dim)",
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
        <span style={labelStyle}>{isCyberpunk ? "Gemini API Key" : "Gemini APIキー"}</span>
        <p style={{ fontSize: 12, color: "var(--t-text-dim)", marginBottom: 10 }}>
          未入力の場合、Whisper の認識テキストをそのままペーストします。
          <br />
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--t-primary)" }}
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
        <button onClick={handleApiKeySave}>{isCyberpunk ? "SAVE" : "保存"}</button>
      </div>
    </div>
  );
}
