import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

type FloatingStatus = "idle" | "recording" | "transcribing" | "formatting" | "done" | "error";

const STATUS_ICON: Record<FloatingStatus, string> = {
    idle: "◈",
    recording: "",
    transcribing: "⟳",
    formatting: "⚡",
    done: "✓",
    error: "✗",
};

const COLOR_PRESETS: Record<string, [string, string]> = {
    ocean: ["#00f0ff", "#a855f7"],
    sunset: ["#ff6b35", "#ff00aa"],
    forest: ["#00ff88", "#00f0ff"],
    lavender: ["#a855f7", "#ff00aa"],
    neon: ["#00f0ff", "#ff00aa"],
};

export default function FloatingWindow() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<FloatingStatus>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [colors, setColors] = useState<[string, string]>(COLOR_PRESETS.ocean);
    const audioLevelRef = useRef(0);
    const barsRef = useRef<number[]>(new Array(32).fill(0));
    const animIdRef = useRef(0);
    const timeRef = useRef(0);

    // Load accent color from store
    useEffect(() => {
        (async () => {
            try {
                const store = await Store.load("config.json");
                const preset = await store.get<string>("accentColor");
                if (preset && COLOR_PRESETS[preset]) {
                    setColors(COLOR_PRESETS[preset]);
                }
            } catch { }
        })();
    }, []);

    // Listen for color changes
    useEffect(() => {
        const unlisten = listen<string>("accent-color-changed", ({ payload }) => {
            if (COLOR_PRESETS[payload]) {
                setColors(COLOR_PRESETS[payload]);
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    // Listen for audio level
    useEffect(() => {
        const unlisten = listen<number>("audio-level", ({ payload }) => {
            audioLevelRef.current = payload;
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    // Listen for status events
    useEffect(() => {
        const unlisteners = Promise.all([
            listen("recording-started", () => setStatus("recording")),
            listen("recording-stopped", () => setStatus("transcribing")),
            listen("transcribing", () => setStatus("transcribing")),
            listen("transcription-complete", () => {
                setStatus("done");
                setTimeout(() => setStatus("idle"), 2000);
            }),
            listen<string>("transcription-error", ({ payload }) => {
                setErrorMsg(payload);
                setStatus("error");
                setTimeout(() => { setStatus("idle"); setErrorMsg(""); }, 8000);
            }),
        ]);
        return () => { unlisteners.then(fns => fns.forEach(fn => fn())); };
    }, []);

    // Canvas animation loop — Cyberpunk style
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d")!;
        const size = 140;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        const centerX = size / 2;
        const centerY = size / 2;
        const barCount = 32;
        const innerRadius = 26;
        const maxBarHeight = 28;

        const draw = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            // Update bar heights with smooth interpolation
            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError
                        ? Math.random() * 8 + 2
                        : 2 + Math.sin(t * 0.03 + i * 0.5) * 1.5;
                bars[i] += (target - bars[i]) * 0.2;
            }

            // Active colors
            const c0 = isError ? "#ff3366" : colors[0];
            const c1 = isError ? "#ff0044" : colors[1];

            // Outer hexagonal glow ring
            ctx.save();
            ctx.beginPath();
            const hexRadius = size / 2 - 3;
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
                const x = centerX + Math.cos(angle) * hexRadius;
                const y = centerY + Math.sin(angle) * hexRadius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();

            // Fill with dark bg
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
            bgGrad.addColorStop(0, isRecording ? hexToRgba(c0, 0.15) : "rgba(10, 10, 25, 0.85)");
            bgGrad.addColorStop(0.7, isRecording ? hexToRgba(c1, 0.08) : "rgba(5, 5, 15, 0.9)");
            bgGrad.addColorStop(1, "rgba(0, 0, 0, 0.95)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Hex border with glow
            const glowAlpha = isRecording
                ? 0.5 + level * 0.4
                : isError
                    ? 0.3 + Math.sin(t * 0.1) * 0.3
                    : 0.15 + Math.sin(t * 0.02) * 0.1;
            ctx.strokeStyle = hexToRgba(c0, glowAlpha);
            ctx.lineWidth = isRecording ? 2 + level * 1.5 : 1.5;
            ctx.shadowColor = c0;
            ctx.shadowBlur = isRecording ? 10 + level * 15 : 4;
            ctx.stroke();
            ctx.restore();

            // Inner rotating ring
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(t * (isRecording ? 0.03 : 0.005));
            ctx.beginPath();
            ctx.arc(0, 0, innerRadius + 1, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(c1, 0.2);
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Rotating dash marks
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const r1 = innerRadius - 2;
                const r2 = innerRadius + 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
                ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
                ctx.strokeStyle = hexToRgba(c0, i % 3 === 0 ? 0.4 : 0.15);
                ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.5;
                ctx.stroke();
            }
            ctx.restore();

            // Pulsing inner glow when recording
            if (isRecording) {
                const pulse = Math.sin(t * 0.08) * 0.15 + 0.3;
                ctx.beginPath();
                ctx.arc(centerX, centerY, innerRadius - 4, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(c0, pulse);
                ctx.shadowColor = c0;
                ctx.shadowBlur = 20;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Draw radial bars with cyberpunk styling
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 2);
                const x1 = centerX + Math.cos(angle) * (innerRadius + 4);
                const y1 = centerY + Math.sin(angle) * (innerRadius + 4);
                const x2 = centerX + Math.cos(angle) * (innerRadius + 4 + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + 4 + barH);

                const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                const barAlpha = isRecording ? 0.6 + (barH / maxBarHeight) * 0.4 : 0.15;
                grad.addColorStop(0, hexToRgba(c0, barAlpha));
                grad.addColorStop(1, hexToRgba(c1, barAlpha * 0.6));

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 2.5;
                ctx.lineCap = "round";

                if (isRecording && barH > maxBarHeight * 0.6) {
                    ctx.shadowColor = c0;
                    ctx.shadowBlur = 6;
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Center content
            if (isRecording) {
                // Animated recording indicator — pulsing red hexagon
                const dotAlpha = Math.sin(t * 0.1) * 0.3 + 0.7;
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    const r = 7;
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fillStyle = `rgba(255, 51, 102, ${dotAlpha})`;
                ctx.shadowColor = "#ff3366";
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.restore();
            } else {
                // Status icon
                ctx.fillStyle = isError ? "#ff3366" : hexToRgba(c0, 0.8);
                ctx.font = "bold 18px 'Orbitron', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                if (isError) {
                    ctx.shadowColor = "#ff3366";
                    ctx.shadowBlur = 8;
                }
                ctx.fillText(STATUS_ICON[status], centerX, centerY);
                ctx.shadowBlur = 0;
            }

            // Data readout text at bottom of circle
            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(c0, 0.5);
                ctx.font = "bold 7px 'Orbitron', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "REC" : status === "transcribing" ? "PROC" : status === "done" ? "OK" : status === "error" ? "ERR" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animIdRef.current);
    }, [status, colors]);

    // Click handler
    const handleClick = useCallback(async () => {
        try {
            await invoke("toggle_recording_command");
        } catch (e) {
            console.error("toggle failed:", e);
        }
    }, []);

    // mainに戻るボタンのハンドラ
    const handleClose = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await invoke("switch_to_main");
        } catch (err) {
            console.error("Close failed:", err);
        }
    }, []);

    return (
        <div style={{ position: "relative", width: 140, height: 160 }}>
            {/* 閉じる（メイン画面へ戻る）ボタン */}
            <button
                onClick={handleClose}
                style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 2,
                    background: "rgba(255, 51, 102, 0.2)",
                    border: "1px solid rgba(255, 51, 102, 0.4)",
                    color: "#ff3366",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    transition: "all 0.2s",
                    padding: 0,
                    fontSize: 10,
                    fontFamily: "'Orbitron', sans-serif",
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(255, 51, 102, 0.5)";
                    e.currentTarget.style.boxShadow = "0 0 10px rgba(255, 51, 102, 0.4)";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(255, 51, 102, 0.2)";
                    e.currentTarget.style.boxShadow = "none";
                }}
                title="メイン画面に戻る"
            >
                ✕
            </button>

            <div
                style={{
                    width: 140,
                    height: 140,
                    overflow: "hidden",
                    position: "relative",
                } as React.CSSProperties}
            >
                <canvas
                    ref={canvasRef}
                    style={{ width: 140, height: 140, display: "block", pointerEvents: "none" }}
                />
                {/* ドラッグ領域: 全体をカバー */}
                <div
                    data-tauri-drag-region
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: 140,
                        height: 140,
                    }}
                />
                {/* クリック領域: 中央の円 */}
                <button
                    onClick={handleClick}
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 80,
                        height: 80,
                        borderRadius: "50%",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 5,
                        padding: 0,
                    }}
                    title="録音開始/停止"
                />
            </div>

            {/* エラーメッセージ表示 — Cyberpunk tooltip */}
            {status === "error" && errorMsg && (
                <div
                    style={{
                        position: "absolute",
                        bottom: -2,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(255, 51, 102, 0.9)",
                        color: "#fff",
                        fontSize: 9,
                        fontFamily: "'Orbitron', sans-serif",
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 1,
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        zIndex: 20,
                        boxShadow: "0 0 15px rgba(255, 51, 102, 0.5), 0 2px 8px rgba(0,0,0,0.5)",
                        animation: "fadeIn 0.2s ease-out",
                        letterSpacing: 0.5,
                        border: "1px solid rgba(255, 100, 130, 0.6)",
                    }}
                    title={errorMsg}
                >
                    ⚠ {errorMsg.length > 30 ? errorMsg.slice(0, 30) + "…" : errorMsg}
                </div>
            )}
        </div>
    );
}

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
