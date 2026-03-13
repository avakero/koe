import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useTheme } from "../lib/ThemeContext";

type UpdateState = "idle" | "checking" | "available" | "downloading" | "done";

export default function UpdateChecker() {
  const { theme } = useTheme();
  const [state, setState] = useState<UpdateState>("idle");
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");

  const isCyberpunk = theme === "cyberpunk";

  useEffect(() => {
    const timer = setTimeout(() => checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, []);

  const checkForUpdate = async () => {
    try {
      setState("checking");
      const update = await check();
      if (update) {
        setVersion(update.version);
        setState("available");

        let totalBytes = 0;
        let downloadedBytes = 0;

        await update.downloadAndInstall((event) => {
          if (event.event === "Started" && event.data.contentLength) {
            totalBytes = event.data.contentLength;
            setState("downloading");
          } else if (event.event === "Progress") {
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              setProgress(Math.round((downloadedBytes / totalBytes) * 100));
            }
          } else if (event.event === "Finished") {
            setState("done");
          }
        });

        await relaunch();
      } else {
        setState("idle");
      }
    } catch (err) {
      console.warn("更新チェック失敗:", err);
      setError(String(err));
      setState("idle");
    }
  };

  if (state === "idle") return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        left: 16,
        padding: "12px 18px",
        borderRadius: "var(--t-radius-lg)",
        background: "var(--t-bg-card)",
        border: "1px solid var(--t-border)",
        backdropFilter: "var(--t-section-backdrop)",
        fontSize: 12,
        fontFamily: "var(--t-font-body)",
        fontWeight: 600,
        color: "var(--t-primary)",
        zIndex: 1000,
        animation: "fadeIn 0.3s ease-out",
        boxShadow: "var(--t-glow)",
      }}
    >
      {state === "checking" && (
        <span style={{ letterSpacing: isCyberpunk ? 1 : 0 }}>
          {isCyberpunk && <span style={{ fontFamily: "var(--t-font-display)", fontSize: 9, marginRight: 8, opacity: 0.7 }}>SYS</span>}
          更新を確認中...
        </span>
      )}
      {state === "available" && (
        <span style={{ letterSpacing: isCyberpunk ? 0.5 : 0 }}>
          {isCyberpunk && <span style={{ fontFamily: "var(--t-font-display)", fontSize: 9, marginRight: 8, color: "var(--t-accent)" }}>NEW</span>}
          v{version} をダウンロード中...
        </span>
      )}
      {state === "downloading" && (
        <div>
          <div style={{ marginBottom: 6 }}>
            {isCyberpunk && <span style={{ fontFamily: "var(--t-font-display)", fontSize: 9, marginRight: 8, color: "var(--t-warning)" }}>DL</span>}
            ダウンロード中... <span style={{ fontFamily: "var(--t-font-display)" }}>{progress}%</span>
          </div>
          <div
            style={{
              height: 3,
              borderRadius: "var(--t-radius)",
              background: "var(--t-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "var(--t-gradient-button)",
                transition: "width 0.3s",
                boxShadow: isCyberpunk ? "0 0 8px rgba(0,240,255,0.5)" : "none",
              }}
            />
          </div>
        </div>
      )}
      {state === "done" && (
        <span style={{ color: "var(--t-success)" }}>
          {isCyberpunk && <span style={{ fontFamily: "var(--t-font-display)", fontSize: 9, marginRight: 8 }}>OK</span>}
          更新完了 — 再起動します...
        </span>
      )}
      {error && (
        <div style={{ fontSize: 10, color: "var(--t-danger)", marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
