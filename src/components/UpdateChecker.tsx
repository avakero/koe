import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateState = "idle" | "checking" | "available" | "downloading" | "done";

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>("idle");
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");

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
        borderRadius: 2,
        background: "rgba(0, 240, 255, 0.08)",
        border: "1px solid rgba(0, 240, 255, 0.3)",
        backdropFilter: "blur(10px)",
        fontSize: 12,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 600,
        color: "#00f0ff",
        zIndex: 1000,
        animation: "fadeIn 0.3s ease-out",
        boxShadow: "0 0 20px rgba(0, 240, 255, 0.1), 0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {state === "checking" && (
        <span style={{ letterSpacing: 1 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, marginRight: 8, opacity: 0.7 }}>SYS</span>
          更新を確認中...
        </span>
      )}
      {state === "available" && (
        <span style={{ letterSpacing: 0.5 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, marginRight: 8, color: "#a855f7" }}>NEW</span>
          v{version} をダウンロード中...
        </span>
      )}
      {state === "downloading" && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, marginRight: 8, color: "#ffe600" }}>DL</span>
            ダウンロード中... <span style={{ fontFamily: "'Orbitron', sans-serif" }}>{progress}%</span>
          </div>
          <div
            style={{
              height: 3,
              borderRadius: 1,
              background: "rgba(0, 240, 255, 0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #00f0ff, #a855f7)",
                transition: "width 0.3s",
                boxShadow: "0 0 8px rgba(0,240,255,0.5)",
              }}
            />
          </div>
        </div>
      )}
      {state === "done" && (
        <span style={{ color: "#00ff88" }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, marginRight: 8 }}>OK</span>
          更新完了 — 再起動します...
        </span>
      )}
      {error && (
        <div style={{ fontSize: 10, color: "#ff6b8a", marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
