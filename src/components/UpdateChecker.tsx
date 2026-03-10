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
        padding: "10px 16px",
        borderRadius: 10,
        background: "#ebf8ff",
        border: "1px solid #90cdf4",
        fontSize: 13,
        color: "#2b6cb0",
        zIndex: 1000,
      }}
    >
      {state === "checking" && "🔍 更新を確認中..."}
      {state === "available" && `✨ 新しいバージョン ${version} をダウンロード中...`}
      {state === "downloading" && (
        <div>
          <div>⬇️ ダウンロード中... {progress}%</div>
          <div
            style={{
              marginTop: 6,
              height: 4,
              borderRadius: 2,
              background: "#bee3f8",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "#3182ce",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}
      {state === "done" && "✅ 更新完了 — 再起動します..."}
      {error && (
        <div style={{ fontSize: 11, color: "#c53030", marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
