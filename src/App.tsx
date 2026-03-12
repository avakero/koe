import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { formatWithGemini, getApiKey } from "./lib/gemini";
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
  idle: "STANDBY — ショートカットで起動",
  recording: "● REC...",
  transcribing: "TRANSCRIBING...",
  formatting: "AI PROCESSING...",
  done: "COMPLETE",
  error: "ERROR DETECTED",
};

const STATUS_CONFIG: Record<AppStatus, { color: string; glow: string; border: string }> = {
  idle: {
    color: "#6b7ea6",
    glow: "none",
    border: "rgba(0, 240, 255, 0.15)",
  },
  recording: {
    color: "#ff3366",
    glow: "0 0 15px rgba(255, 51, 102, 0.4), 0 0 30px rgba(255, 51, 102, 0.1)",
    border: "rgba(255, 51, 102, 0.6)",
  },
  transcribing: {
    color: "#ffe600",
    glow: "0 0 15px rgba(255, 230, 0, 0.3), 0 0 30px rgba(255, 230, 0, 0.1)",
    border: "rgba(255, 230, 0, 0.5)",
  },
  formatting: {
    color: "#a855f7",
    glow: "0 0 15px rgba(168, 85, 247, 0.3), 0 0 30px rgba(168, 85, 247, 0.1)",
    border: "rgba(168, 85, 247, 0.5)",
  },
  done: {
    color: "#00ff88",
    glow: "0 0 15px rgba(0, 255, 136, 0.3), 0 0 30px rgba(0, 255, 136, 0.1)",
    border: "rgba(0, 255, 136, 0.5)",
  },
  error: {
    color: "#ff3366",
    glow: "0 0 15px rgba(255, 51, 102, 0.4), 0 0 30px rgba(255, 51, 102, 0.1)",
    border: "rgba(255, 51, 102, 0.6)",
  },
};

export default function App() {
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

  const cfg = STATUS_CONFIG[status];

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

      {/* Corner decorations */}
      <div style={{ position: "fixed", top: 12, left: 12, width: 20, height: 20, borderLeft: "2px solid rgba(0,240,255,0.3)", borderTop: "2px solid rgba(0,240,255,0.3)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 12, right: 12, width: 20, height: 20, borderRight: "2px solid rgba(0,240,255,0.3)", borderTop: "2px solid rgba(0,240,255,0.3)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 12, left: 12, width: 20, height: 20, borderLeft: "2px solid rgba(0,240,255,0.3)", borderBottom: "2px solid rgba(0,240,255,0.3)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 12, right: 12, width: 20, height: 20, borderRight: "2px solid rgba(0,240,255,0.3)", borderBottom: "2px solid rgba(0,240,255,0.3)", pointerEvents: "none" }} />

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 32,
            fontWeight: 900,
            background: "linear-gradient(135deg, #00f0ff, #ff00aa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: 4,
            animation: "glitch 3s infinite",
          }}
        >
          KOE
        </h1>
        <div style={{ fontSize: 10, color: "#6b7ea6", letterSpacing: 3, fontWeight: 500, marginTop: 2, textTransform: "uppercase" }}>
          Voice Recognition System v1.1
        </div>
      </div>

      {/* Status display */}
      <div
        style={{
          padding: "14px 28px",
          borderRadius: 2,
          background: "rgba(10, 10, 20, 0.8)",
          border: `1px solid ${cfg.border}`,
          color: cfg.color,
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 600,
          fontSize: 13,
          minWidth: 300,
          textAlign: "center",
          boxShadow: cfg.glow,
          animation: status === "recording" ? "borderPulse 1.5s infinite" : status === "idle" ? "none" : "statusGlow 2s infinite",
          transition: "all 0.3s ease",
          position: "relative",
          letterSpacing: 1,
        }}
      >
        {/* Status indicator dot */}
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cfg.color,
            marginRight: 10,
            boxShadow: `0 0 6px ${cfg.color}`,
            animation: status !== "idle" ? "neonPulse 1s infinite" : "none",
          }}
        />
        {STATUS_LABEL[status]}
      </div>

      {/* Error display */}
      {status === "error" && errorMsg && (
        <div
          style={{
            background: "rgba(255, 51, 102, 0.1)",
            border: "1px solid rgba(255, 51, 102, 0.4)",
            borderRadius: 2,
            padding: "12px 16px",
            maxWidth: 380,
            fontSize: 12,
            color: "#ff6b8a",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            animation: "fadeIn 0.3s ease-out",
            fontFamily: "'Rajdhani', sans-serif",
          }}
        >
          <div style={{ fontSize: 10, color: "#ff3366", marginBottom: 6, fontWeight: 700, letterSpacing: 1, fontFamily: "'Orbitron', sans-serif" }}>
            ⚠ ERROR LOG
          </div>
          <div style={{ borderLeft: "2px solid rgba(255,51,102,0.4)", paddingLeft: 10 }}>
            {errorMsg}
          </div>
        </div>
      )}

      {/* Raw text display */}
      {rawText && status !== "idle" && (
        <div
          style={{
            background: "rgba(0, 240, 255, 0.05)",
            border: "1px solid rgba(0, 240, 255, 0.2)",
            borderRadius: 2,
            padding: "12px 16px",
            maxWidth: 380,
            fontSize: 13,
            color: "#c0ccf0",
            wordBreak: "break-all",
            animation: "fadeIn 0.3s ease-out",
            fontFamily: "'Rajdhani', sans-serif",
          }}
        >
          <div style={{ fontSize: 10, color: "#00f0ff", marginBottom: 6, fontWeight: 700, letterSpacing: 1, fontFamily: "'Orbitron', sans-serif" }}>
            OUTPUT
          </div>
          <div style={{ borderLeft: "2px solid rgba(0,240,255,0.3)", paddingLeft: 10 }}>
            {rawText}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          onClick={() => setPage("settings")}
          style={{
            fontSize: 13,
            color: "#6b7ea6",
            border: "1px solid rgba(0,240,255,0.15)",
            padding: "8px 16px",
          }}
        >
          ⚙ CONFIG
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
            fontSize: 13,
            color: "#0a0a0f",
            background: "linear-gradient(135deg, #00f0ff, #a855f7)",
            border: "none",
            borderRadius: 2,
            padding: "8px 20px",
            fontWeight: 700,
            letterSpacing: 1,
            boxShadow: "0 0 15px rgba(0, 240, 255, 0.3), 0 0 30px rgba(0, 240, 255, 0.1)",
          }}
        >
          ◈ FLOAT MODE
        </button>
      </div>

      <UpdateChecker />
    </div>
  );
}
