import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { formatWithGemini, getApiKey } from "./lib/gemini";
import { useTheme } from "./lib/ThemeContext";
import Settings from "./components/Settings";
import UpdateChecker from "./components/UpdateChecker";

type AppStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "formatting"
  | "done"
  | "error";

const STATUS_LABEL: Record<AppStatus, string> = {
  idle: "ショートカットで起動",
  recording: "● REC...",
  transcribing: "文字起こし中...",
  formatting: "AI整形中...",
  done: "完了",
  error: "エラー",
};

export default function App() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<AppStatus>("idle");
  const [rawText, setRawText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState<"main" | "settings">("main");

  useEffect(() => {
    const unlisteners = Promise.all([
      listen("recording-started", () => {
        setStatus("recording");
        setRawText("");
      }),
      listen("recording-stopped", () => setStatus("transcribing")),
      listen("transcribing", () => setStatus("transcribing")),
      listen<string>("transcription-complete", async ({ payload }) => {
        setRawText(payload);
        const apiKey = await getApiKey();

        let finalText = payload;
        if (apiKey) {
          setStatus("formatting");
          try {
            finalText = await formatWithGemini(payload);
          } catch (err) {
            console.warn("Gemini整形失敗、生テキストを使用:", err);
          }
        }

        try {
          await invoke("paste_text", { text: finalText });
          setStatus("done");
          setTimeout(() => setStatus("idle"), 3000);
        } catch (err) {
          console.error("ペースト失敗:", err);
          setStatus("error");
          setTimeout(() => setStatus("idle"), 5000);
        }
      }),
      listen<string>("transcription-error", ({ payload }) => {
        console.error("文字起こしエラー:", payload);
        setErrorMsg(payload);
        setStatus("error");
        setTimeout(() => { setStatus("idle"); setErrorMsg(""); }, 8000);
      }),
    ]);

    return () => {
      unlisteners.then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  if (page === "settings") {
    return <Settings onBack={() => setPage("main")} />;
  }

  const isCyberpunk = theme === "cyberpunk";
  const isPop = theme === "pop";
  const isRetro = theme === "retro";
  const isNatural = theme === "natural";
  const isMidnight = theme === "midnight";
  const hasScanline = isCyberpunk || isRetro;
  const hasCorners = isCyberpunk || isRetro;

  // Recording glow by theme
  const recGlow = isCyberpunk ? "0 0 15px rgba(255, 51, 102, 0.4)"
    : isPop ? "0 2px 12px rgba(244, 63, 94, 0.3)"
    : isRetro ? "0 0 10px rgba(255, 51, 51, 0.3)"
    : isMidnight ? "0 1px 8px rgba(239, 68, 68, 0.2)"
    : "0 1px 4px rgba(220, 38, 38, 0.2)";

  const statusColors: Record<AppStatus, { color: string; glow: string; border: string }> = {
    idle: { color: "var(--t-text-dim)", glow: "none", border: "var(--t-border)" },
    recording: { color: "var(--t-danger)", glow: recGlow, border: "var(--t-danger)" },
    transcribing: { color: "var(--t-warning)", glow: isCyberpunk ? "0 0 15px rgba(255, 230, 0, 0.3)" : "none", border: "var(--t-warning)" },
    formatting: { color: "var(--t-accent)", glow: isCyberpunk ? "0 0 15px rgba(168, 85, 247, 0.3)" : "none", border: "var(--t-accent)" },
    done: { color: "var(--t-success)", glow: isCyberpunk ? "0 0 15px rgba(0, 255, 136, 0.3)" : "none", border: "var(--t-success)" },
    error: { color: "var(--t-danger)", glow: isCyberpunk ? "0 0 15px rgba(255, 51, 102, 0.4)" : "none", border: "var(--t-danger)" },
  };

  const cfg = statusColors[status];

  // Theme-specific label map
  const themeLabels = {
    title: isRetro ? "KOE" : "KOE",
    subtitle: isCyberpunk ? "Voice Recognition System v1.1"
      : isRetro ? "> VOICE_REC v1.1"
      : isPop ? "✨ 音声認識ツール v1.1"
      : isNatural ? "声 — 音声認識ツール v1.1"
      : "音声認識ツール v1.1",
    config: isCyberpunk ? "⚙ CONFIG" : isRetro ? "> CONFIG" : isPop ? "⚙ せってい" : isNatural ? "⚙ 設定" : "⚙ 設定",
    float: isCyberpunk ? "◈ FLOAT MODE" : isRetro ? "> FLOAT" : isPop ? "🫧 フロート" : isNatural ? "🍃 フロート" : isMidnight ? "✦ フロート" : "フロートモード",
    errorLabel: isCyberpunk ? "ERROR LOG" : isRetro ? "> ERR_LOG" : "エラー",
    outputLabel: isCyberpunk ? "OUTPUT" : isRetro ? "> OUTPUT" : isPop ? "✨ 出力" : "出力",
  };

  const recAnim = isCyberpunk ? "borderPulse 1.5s infinite"
    : isPop ? "popBounce 1.5s infinite"
    : isRetro ? "crtFlicker 3s infinite"
    : "simplePulse 2s infinite";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 32,
        gap: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
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

      {/* Corner decorations — cyberpunk & retro */}
      {hasCorners && (
        <>
          <div style={{ position: "fixed", top: 12, left: 12, width: 20, height: 20, borderLeft: "2px solid var(--t-corner-border)", borderTop: "2px solid var(--t-corner-border)", pointerEvents: "none" }} />
          <div style={{ position: "fixed", top: 12, right: 12, width: 20, height: 20, borderRight: "2px solid var(--t-corner-border)", borderTop: "2px solid var(--t-corner-border)", pointerEvents: "none" }} />
          <div style={{ position: "fixed", bottom: 12, left: 12, width: 20, height: 20, borderLeft: "2px solid var(--t-corner-border)", borderBottom: "2px solid var(--t-corner-border)", pointerEvents: "none" }} />
          <div style={{ position: "fixed", bottom: 12, right: 12, width: 20, height: 20, borderRight: "2px solid var(--t-corner-border)", borderBottom: "2px solid var(--t-corner-border)", pointerEvents: "none" }} />
        </>
      )}

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--t-font-display)",
            fontSize: isRetro ? 24 : isPop ? 36 : 32,
            fontWeight: isPop ? 800 : isNatural ? 700 : 900,
            background: "var(--t-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: isCyberpunk ? 4 : isRetro ? 6 : isPop ? 1 : 2,
            animation: isCyberpunk ? "glitch 3s infinite" : "none",
          }}
        >
          {themeLabels.title}
        </h1>
        <div style={{
          fontSize: isRetro ? 8 : isCyberpunk ? 10 : 11,
          color: "var(--t-text-dim)",
          letterSpacing: isCyberpunk ? 3 : isRetro ? 2 : 1,
          fontWeight: 500,
          marginTop: isRetro ? 8 : 2,
          textTransform: isCyberpunk ? "uppercase" as const : "none" as const,
          fontFamily: "var(--t-font-body)",
        }}>
          {themeLabels.subtitle}
        </div>
      </div>

      {/* Status display */}
      <div
        style={{
          padding: isPop ? "16px 28px" : "14px 28px",
          borderRadius: "var(--t-radius-lg)",
          background: "var(--t-bg-card)",
          border: `1px solid ${cfg.border}`,
          color: cfg.color,
          fontFamily: "var(--t-font-display)",
          fontWeight: 600,
          fontSize: isRetro ? 10 : 13,
          minWidth: 300,
          textAlign: "center",
          boxShadow: cfg.glow,
          animation: status === "recording" ? recAnim : "none",
          transition: "all 0.3s ease",
          position: "relative",
          letterSpacing: isCyberpunk ? 1 : isRetro ? 2 : 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: isPop ? 8 : 6,
            height: isPop ? 8 : isRetro ? 6 : 6,
            borderRadius: isRetro ? 0 : "50%",
            background: cfg.color,
            marginRight: 10,
            boxShadow: (isCyberpunk || isRetro) ? `0 0 6px ${cfg.color}` : "none",
            animation: status !== "idle" && (isCyberpunk || isRetro) ? "neonPulse 1s infinite" : "none",
          }}
        />
        {isRetro ? `> ${STATUS_LABEL[status]}` : STATUS_LABEL[status]}
      </div>

      {/* Error display */}
      {status === "error" && errorMsg && (
        <div
          style={{
            background: isCyberpunk ? "rgba(255, 51, 102, 0.1)" : isRetro ? "rgba(255, 51, 51, 0.1)" : isPop ? "rgba(244, 63, 94, 0.08)" : "rgba(220, 38, 38, 0.06)",
            border: "1px solid var(--t-danger)",
            borderRadius: "var(--t-radius)",
            padding: "12px 16px",
            maxWidth: 380,
            fontSize: isRetro ? 9 : 12,
            color: "var(--t-danger)",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            animation: "fadeIn 0.3s ease-out",
            fontFamily: "var(--t-font-body)",
          }}
        >
          <div style={{ fontSize: "var(--t-label-size)", color: "var(--t-danger)", marginBottom: 6, fontWeight: 700, letterSpacing: "var(--t-label-spacing)", fontFamily: "var(--t-font-display)" }}>
            ⚠ {themeLabels.errorLabel}
          </div>
          <div style={{ borderLeft: "2px solid var(--t-danger)", paddingLeft: 10, opacity: 0.85 }}>
            {errorMsg}
          </div>
        </div>
      )}

      {/* Raw text display */}
      {rawText && status !== "idle" && (
        <div
          style={{
            background: isCyberpunk ? "rgba(0, 240, 255, 0.05)" : isRetro ? "rgba(51, 255, 51, 0.05)" : isPop ? "rgba(236, 72, 153, 0.05)" : isNatural ? "rgba(90, 114, 71, 0.05)" : isMidnight ? "rgba(212, 168, 83, 0.05)" : "rgba(37, 99, 235, 0.04)",
            border: "1px solid var(--t-border)",
            borderRadius: "var(--t-radius)",
            padding: "12px 16px",
            maxWidth: 380,
            fontSize: isRetro ? 10 : 13,
            color: "var(--t-text)",
            wordBreak: "break-all",
            animation: "fadeIn 0.3s ease-out",
            fontFamily: "var(--t-font-body)",
          }}
        >
          <div style={{ fontSize: "var(--t-label-size)", color: "var(--t-primary)", marginBottom: 6, fontWeight: 700, letterSpacing: "var(--t-label-spacing)", fontFamily: "var(--t-font-display)" }}>
            {themeLabels.outputLabel}
          </div>
          <div style={{ borderLeft: "2px solid var(--t-primary)", paddingLeft: 10, opacity: 0.85 }}>
            {rawText}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          onClick={() => setPage("settings")}
          style={{
            fontSize: isRetro ? 10 : 13,
            color: "var(--t-text-dim)",
            border: "1px solid var(--t-border)",
            padding: "8px 16px",
            borderRadius: "var(--t-radius)",
          }}
        >
          {themeLabels.config}
        </button>

        <button
          onClick={async () => {
            try {
              await invoke("switch_to_floating");
            } catch (e) {
              console.error("フローティングモード切替失敗:", e);
            }
          }}
          style={{
            fontSize: isRetro ? 10 : 13,
            color: "var(--t-button-text-on-gradient)",
            background: "var(--t-gradient-button)",
            border: "none",
            borderRadius: "var(--t-radius)",
            padding: "8px 20px",
            fontWeight: 700,
            letterSpacing: isCyberpunk ? 1 : isRetro ? 2 : 0,
            boxShadow: "var(--t-glow)",
          }}
        >
          {themeLabels.float}
        </button>
      </div>

      <UpdateChecker />
    </div>
  );
}
