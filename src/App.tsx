import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { formatWithGemini, getApiKey } from "./lib/gemini";
import Settings from "./components/Settings";
import UpdateChecker from "./components/UpdateChecker";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

type AppStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "formatting"
  | "done"
  | "error";

const STATUS_LABEL: Record<AppStatus, string> = {
  idle: "待機中 — ショートカットで録音開始",
  recording: "● 録音中...",
  transcribing: "文字起こし中...",
  formatting: "AI整形中...",
  done: "完了",
  error: "エラーが発生しました",
};

const STATUS_COLOR: Record<AppStatus, string> = {
  idle: "#666",
  recording: "#e53e3e",
  transcribing: "#d69e2e",
  formatting: "#3182ce",
  done: "#38a169",
  error: "#e53e3e",
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
            // Gemini失敗時は生テキストをそのまま使う
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 32,
        gap: 20,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>🎙️ Koe</h1>

      <div
        style={{
          padding: "12px 24px",
          borderRadius: 12,
          background: "#fff",
          border: `2px solid ${STATUS_COLOR[status]}`,
          color: STATUS_COLOR[status],
          fontWeight: 600,
          fontSize: 15,
          minWidth: 280,
          textAlign: "center",
        }}
      >
        {STATUS_LABEL[status]}
      </div>

      {status === "error" && errorMsg && (
        <div
          style={{
            background: "#fff5f5",
            border: "1px solid #feb2b2",
            borderRadius: 8,
            padding: "12px 16px",
            maxWidth: 400,
            fontSize: 13,
            color: "#c53030",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ fontSize: 11, color: "#e53e3e", marginBottom: 4, fontWeight: 600 }}>
            エラー詳細
          </div>
          {errorMsg}
        </div>
      )}

      {rawText && status !== "idle" && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "12px 16px",
            maxWidth: 400,
            fontSize: 13,
            color: "#4a5568",
            wordBreak: "break-all",
          }}
        >
          <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 4 }}>
            認識テキスト
          </div>
          {rawText}
        </div>
      )}

      <button
        onClick={() => setPage("settings")}
        style={{ marginTop: 12, fontSize: 13, color: "#666" }}
      >
        ⚙️ 設定
      </button>

      <button
        onClick={async () => {
          try {
            const floating = await WebviewWindow.getByLabel("floating");
            if (floating) {
              await floating.show();
              await floating.setFocus();
            }
            await getCurrentWindow().hide();
          } catch (e) {
            console.error("フローティングモード切替失敗:", e);
          }
        }}
        style={{
          marginTop: 8,
          fontSize: 13,
          color: "#fff",
          background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
          border: "none",
          borderRadius: 8,
          padding: "8px 18px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        🎙️ フローティングモード
      </button>

      <UpdateChecker />
    </div>
  );
}
