import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";

type FloatingStatus = "idle" | "recording" | "transcribing" | "formatting" | "done" | "error";

const STATUS_ICON: Record<FloatingStatus, string> = {
    idle: "🎙️",
    recording: "",
    transcribing: "⏳",
    formatting: "✨",
    done: "✅",
    error: "❌",
};

const COLOR_PRESETS: Record<string, [string, string]> = {
    ocean: ["#0ea5e9", "#6366f1"],
    sunset: ["#f97316", "#ec4899"],
    forest: ["#10b981", "#06b6d4"],
    lavender: ["#8b5cf6", "#ec4899"],
    neon: ["#22d3ee", "#a855f7"],
};

export default function FloatingWindow() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<FloatingStatus>("idle");
    const [colors, setColors] = useState<[string, string]>(COLOR_PRESETS.ocean);
    const audioLevelRef = useRef(0);
    const barsRef = useRef<number[]>(new Array(24).fill(0));
    const animIdRef = useRef(0);
    const isDraggingRef = useRef(false);

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
            listen("transcription-error", () => {
                setStatus("error");
                setTimeout(() => setStatus("idle"), 3000);
            }),
        ]);
        return () => { unlisteners.then(fns => fns.forEach(fn => fn())); };
    }, []);

    // Canvas animation loop
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
        const barCount = 24;
        const innerRadius = 28;
        const maxBarHeight = 28;

        const draw = () => {
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;

            // Update bar heights with smooth interpolation
            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : 2;
                bars[i] += (target - bars[i]) * 0.25;
            }

            // Background circle with glassmorphism
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
            if (isRecording) {
                bgGrad.addColorStop(0, hexToRgba(colors[0], 0.25));
                bgGrad.addColorStop(1, hexToRgba(colors[1], 0.15));
            } else {
                bgGrad.addColorStop(0, "rgba(255,255,255,0.2)");
                bgGrad.addColorStop(1, "rgba(255,255,255,0.08)");
            }

            ctx.beginPath();
            ctx.arc(centerX, centerY, size / 2 - 2, 0, Math.PI * 2);
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(centerX, centerY, size / 2 - 2, 0, Math.PI * 2);
            ctx.strokeStyle = isRecording
                ? hexToRgba(colors[0], 0.5 + level * 0.3)
                : "rgba(255,255,255,0.15)";
            ctx.lineWidth = isRecording ? 2 + level * 2 : 1.5;
            ctx.stroke();

            // Pulsing inner glow when recording
            if (isRecording) {
                const pulse = Math.sin(Date.now() / 400) * 0.15 + 0.35;
                ctx.beginPath();
                ctx.arc(centerX, centerY, innerRadius - 2, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(colors[0], pulse);
                ctx.fill();
            }

            // Draw radial bars
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 2);
                const x1 = centerX + Math.cos(angle) * innerRadius;
                const y1 = centerY + Math.sin(angle) * innerRadius;
                const x2 = centerX + Math.cos(angle) * (innerRadius + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + barH);

                const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                grad.addColorStop(0, hexToRgba(colors[0], isRecording ? 0.9 : 0.2));
                grad.addColorStop(1, hexToRgba(colors[1], isRecording ? 0.7 : 0.1));

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Center icon/text
            ctx.fillStyle = isRecording ? "#fff" : "rgba(255,255,255,0.7)";
            ctx.font = isRecording ? "bold 18px sans-serif" : "22px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (isRecording) {
                // Animated recording dot
                const dotAlpha = Math.sin(Date.now() / 300) * 0.4 + 0.6;
                ctx.fillStyle = `rgba(239,68,68,${dotAlpha})`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillText(STATUS_ICON[status], centerX, centerY);
            }

            animIdRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animIdRef.current);
    }, [status, colors]);

    // Click handler
    const handleClick = useCallback(async () => {
        if (isDraggingRef.current) return;
        try {
            await invoke("toggle_recording_command");
        } catch (e) {
            console.error("toggle failed:", e);
        }
    }, []);

    // Drag handler
    const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
        // SVGやボタンクリック時はドラッグを開始しない
        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).tagName.toLowerCase() === "svg") {
            return;
        }

        isDraggingRef.current = false;
        const startX = e.screenX;
        const startY = e.screenY;

        const onMouseMove = (ev: MouseEvent) => {
            if (Math.abs(ev.screenX - startX) > 3 || Math.abs(ev.screenY - startY) > 3) {
                isDraggingRef.current = true;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            setTimeout(() => { isDraggingRef.current = false; }, 50);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);

        // Tauri v2 の startDragging を呼び出す
        try {
            await getCurrentWindow().startDragging();
        } catch (err) {
            console.error("Drag error:", err);
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
        <div style={{ position: "relative", width: 140, height: 140 }}>
            {/* 閉じる（メイン画面へ戻る）ボタン */}
            <button
                onClick={handleClose}
                style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.5)",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    transition: "background 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.8)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.5)"; }}
                title="メイン画面に戻る"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div
                style={{
                    width: 140,
                    height: 140,
                    borderRadius: "50%",
                    overflow: "hidden",
                    cursor: isDraggingRef.current ? "grabbing" : "grab",
                } as React.CSSProperties}
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                data-tauri-drag-region
            >
                <canvas
                    ref={canvasRef}
                    style={{ width: 140, height: 140, display: "block", pointerEvents: "none" }}
                />
            </div>
        </div>
    );
}

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
