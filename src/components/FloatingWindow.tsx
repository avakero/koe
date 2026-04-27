import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { useTheme } from "../lib/ThemeContext";
import { ThemeId } from "../lib/themes";

type FloatingStatus = "idle" | "recording" | "transcribing" | "formatting" | "done" | "error";
type ViewMode = "circle" | "waveform";

const COLOR_PRESETS: Record<string, [string, string]> = {
    ocean: ["#00f0ff", "#a855f7"],
    sunset: ["#ff6b35", "#ff00aa"],
    forest: ["#00ff88", "#00f0ff"],
    lavender: ["#a855f7", "#ff00aa"],
    neon: ["#00f0ff", "#ff00aa"],
};

// テーマごとのwaveform用カラー
const WAVEFORM_COLORS: Record<ThemeId, { bg: string; bar: string; barActive: string; dot: string }> = {
    cyberpunk: { bg: "#0d0d1a", bar: "#00f0ff", barActive: "#a855f7", dot: "#ff3366" },
    simple: { bg: "#e8ecf0", bar: "#2563eb", barActive: "#3b82f6", dot: "#dc2626" },
    pop: { bg: "#fce7f3", bar: "#ec4899", barActive: "#f472b6", dot: "#f43f5e" },
    natural: { bg: "#4a8c7e", bar: "#ffffff", barActive: "#e8ddd0", dot: "#c67a4a" },
    midnight: { bg: "#1e1e30", bar: "#d4a853", barActive: "#e8c06a", dot: "#ef4444" },
    retro: { bg: "#0a1a0a", bar: "#33ff33", barActive: "#ff8c00", dot: "#ff3333" },
};

export default function FloatingWindow() {
    const { theme } = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<FloatingStatus>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [colors, setColors] = useState<[string, string]>(COLOR_PRESETS.ocean);
    const [viewMode, setViewMode] = useState<ViewMode>("circle");
    const [winW, setWinW] = useState(() => window.innerWidth);
    const [winH, setWinH] = useState(() => window.innerHeight);
    const audioLevelRef = useRef(0);
    const barsRef = useRef<number[]>(new Array(64).fill(0));
    const animIdRef = useRef(0);
    const timeRef = useRef(0);
    const smoothLevelRef = useRef(0);

    // ウィンドウリサイズを検知
    useEffect(() => {
        const onResize = () => {
            setWinW(window.innerWidth);
            setWinH(window.innerHeight);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // ビューモード変更時にウィンドウサイズを切り替え
    useEffect(() => {
        (async () => {
            try {
                const win = getCurrentWindow();
                if (viewMode === "waveform") {
                    await win.setSize(new LogicalSize(280, 60));
                } else {
                    await win.setSize(new LogicalSize(80, 80));
                }
            } catch (e) {
                console.error("resize failed:", e);
            }
        })();
    }, [viewMode]);

    // ビューモードをStoreに保存/読み込み
    useEffect(() => {
        (async () => {
            try {
                const store = await Store.load("config.json");
                const preset = await store.get<string>("accentColor");
                if (preset && COLOR_PRESETS[preset]) setColors(COLOR_PRESETS[preset]);
                const savedMode = await store.get<ViewMode>("floatingViewMode");
                if (savedMode === "circle" || savedMode === "waveform") setViewMode(savedMode);
            } catch { }
        })();
    }, []);

    const saveViewMode = useCallback(async (mode: ViewMode) => {
        try {
            const store = await Store.load("config.json");
            await store.set("floatingViewMode", mode);
            await store.save();
        } catch { }
    }, []);

    // Listen for color changes
    useEffect(() => {
        const unlisten = listen<string>("accent-color-changed", ({ payload }) => {
            if (COLOR_PRESETS[payload]) setColors(COLOR_PRESETS[payload]);
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

    // ---------------------------------------------------------------------------
    // Canvas animation loop
    // ---------------------------------------------------------------------------
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        const cW = winW;
        const cH = winH;
        canvas.width = cW * dpr;
        canvas.height = cH * dpr;
        ctx.scale(dpr, dpr);

        const S = Math.min(cW, cH);
        const CX = cW / 2;
        const CY = cH / 2;
        const barCount = Math.max(12, Math.round(S / 3.5));
        const innerR = S * 0.175;
        const maxBarH = S * 0.225;

        const updateBars = (isRecording: boolean, isError: boolean, level: number, _t: number, count: number, maxH: number) => {
            const bars = barsRef.current;
            while (bars.length < count) bars.push(0);
            for (let i = 0; i < count; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxH
                    : isError
                        ? Math.random() * (maxH * 0.08) + 1
                        : 1.0; // idle時は完全に静止
                bars[i] += (target - bars[i]) * 0.22;
            }
        };

        const drawRadialBars = (colorFn: (i: number, barH: number) => string, lineW: number) => {
            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 1.2);
                const offset = innerR + S * 0.04;
                const x1 = CX + Math.cos(angle) * offset;
                const y1 = CY + Math.sin(angle) * offset;
                const x2 = CX + Math.cos(angle) * (offset + barH);
                const y2 = CY + Math.sin(angle) * (offset + barH);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = colorFn(i, barH);
                ctx.lineWidth = lineW;
                ctx.lineCap = "round";
                ctx.stroke();
            }
        };

        const getState = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, cW, cH);
            const isRecording = status === "recording";
            const isError = status === "error";
            // RMSを大幅に増幅し、パワーカーブで小さな音でもしっかり反応させる
            const amplified = Math.min(audioLevelRef.current * 25, 1);
            const rawLevel = isRecording ? Math.pow(amplified, 0.6) : 0;
            smoothLevelRef.current += (rawLevel - smoothLevelRef.current) * 0.35;
            return { isRecording, isError, level: smoothLevelRef.current, t: timeRef.current };
        };

        // ===================================================================
        // Waveform — 横長波形ビジュアル（全テーマ共通、テーマ色で描画）
        // ===================================================================
        const drawWaveform = () => {
            const { isRecording, isError, level, t } = getState();
            const wc = WAVEFORM_COLORS[theme] || WAVEFORM_COLORS.natural;

            // 背景
            ctx.fillStyle = isError ? "#3a1f1f" : wc.bg;
            ctx.fillRect(0, 0, cW, cH);

            // 波形バー
            const waveBarCount = Math.max(20, Math.round(cW / 5));
            updateBars(isRecording, isError, level, t, waveBarCount, cH * 0.7);
            const bars = barsRef.current;
            const maxH = cH * 0.7;
            const gap = 2;
            const barW = Math.max(2, (cW - gap * (waveBarCount + 1)) / waveBarCount);
            const totalW = waveBarCount * barW + (waveBarCount - 1) * gap;
            const startX = (cW - totalW) / 2;

            for (let i = 0; i < waveBarCount; i++) {
                const centerFactor = 1 - Math.abs(i - waveBarCount / 2) / (waveBarCount / 2);
                const target = isRecording
                    ? level * (0.2 + 0.8 * Math.random()) * maxH * (0.3 + 0.7 * centerFactor)
                    : isError
                        ? Math.random() * maxH * 0.15 + 4
                        : 3; // idle時は小さな固定バーのみ
                bars[i] += (target - bars[i]) * 0.2;

                const barH = Math.max(bars[i], 3);
                const x = startX + i * (barW + gap);
                const y = (cH - barH) / 2;

                ctx.beginPath();
                ctx.roundRect(x, y, barW, barH, barW / 2);
                const alpha = isRecording
                    ? 0.7 + (barH / maxH) * 0.3
                    : isError ? 0.5 : 0.6 + Math.sin(t * 0.02 + i * 0.3) * 0.15;
                ctx.fillStyle = hexToRgba(
                    isError ? "#ff8888" : (barH / maxH > 0.5 ? wc.barActive : wc.bar),
                    alpha
                );
                ctx.fill();
            }

            // 右下ドット
            const dotR = Math.max(3, cH * 0.08);
            ctx.beginPath();
            ctx.arc(cW - dotR * 2, cH - dotR * 2, dotR, 0, Math.PI * 2);
            if (isRecording) {
                const pulse = Math.sin(t * 0.1) * 0.2 + 0.8;
                ctx.fillStyle = hexToRgba(wc.dot, pulse);
            } else {
                ctx.fillStyle = hexToRgba(isError ? wc.dot : wc.bar, 0.5);
            }
            ctx.fill();

            animIdRef.current = requestAnimationFrame(drawWaveform);
        };

        // ===================================================================
        // Circle themes (existing)
        // ===================================================================
        const drawCyberpunk = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const c0 = isError ? "#ff3366" : colors[0];
            const c1 = isError ? "#ff0044" : colors[1];

            ctx.save();
            ctx.beginPath();
            const hexR = S / 2 - 2;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                if (i === 0) ctx.moveTo(CX + Math.cos(a) * hexR, CY + Math.sin(a) * hexR);
                else ctx.lineTo(CX + Math.cos(a) * hexR, CY + Math.sin(a) * hexR);
            }
            ctx.closePath();
            const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, S / 2);
            bg.addColorStop(0, isRecording ? hexToRgba(c0, 0.15) : "rgba(10,10,25,0.88)");
            bg.addColorStop(1, "rgba(0,0,0,0.95)");
            ctx.fillStyle = bg;
            ctx.fill();
            const glowA = isRecording ? 0.5 + level * 0.4 : 0.15 + Math.sin(t * 0.02) * 0.1;
            ctx.strokeStyle = hexToRgba(c0, glowA);
            ctx.lineWidth = isRecording ? 1.5 + level : 1;
            ctx.shadowColor = c0;
            ctx.shadowBlur = isRecording ? 8 + level * 12 : 3;
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.translate(CX, CY);
            ctx.rotate(t * (isRecording ? 0.03 : 0.005));
            ctx.beginPath();
            ctx.arc(0, 0, innerR + 1, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(c1, 0.2);
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();

            if (isRecording) {
                const pulse = Math.sin(t * 0.08) * 0.15 + 0.3;
                ctx.beginPath();
                ctx.arc(CX, CY, innerR - 3, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(c0, pulse * level);
                ctx.shadowColor = c0;
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            drawRadialBars((i, barH) => {
                const alpha = isRecording ? 0.5 + (barH / maxBarH) * 0.5 : 0.12;
                return hexToRgba(i % 2 === 0 ? c0 : c1, alpha);
            }, Math.max(1.5, S * 0.02));

            if (isRecording) {
                const dotA = Math.sin(t * 0.1) * 0.3 + 0.7;
                ctx.save();
                ctx.translate(CX, CY);
                ctx.beginPath();
                const r = S * 0.05;
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
                ctx.fillStyle = `rgba(255,51,102,${dotA})`;
                ctx.shadowColor = "#ff3366";
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = isError ? "#ff3366" : hexToRgba(c0, 0.8);
                ctx.font = `bold ${Math.round(S * 0.15)}px 'Orbitron','Segoe UI',sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "◈", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawCyberpunk);
        };

        const drawSimple = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const primary = isError ? "#dc2626" : "#2563eb";
            const circleR = S / 2 - 4;
            ctx.beginPath();
            ctx.arc(CX, CY, circleR, 0, Math.PI * 2);
            const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, circleR);
            bg.addColorStop(0, "rgba(255,255,255,0.95)");
            bg.addColorStop(1, "rgba(240,242,245,0.9)");
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = hexToRgba(primary, isRecording ? 0.5 + level * 0.4 : 0.15);
            ctx.lineWidth = isRecording ? 2 : 1;
            ctx.stroke();
            drawRadialBars((_i, barH) => hexToRgba(primary, isRecording ? 0.4 + (barH / maxBarH) * 0.5 : 0.08), Math.max(1, S * 0.018));
            if (isRecording) {
                const dotA = Math.sin(t * 0.08) * 0.2 + 0.8;
                ctx.beginPath();
                ctx.arc(CX, CY, S * 0.06, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(220,38,38,${dotA})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#dc2626" : hexToRgba(primary, 0.7);
                ctx.font = `bold ${Math.round(S * 0.15)}px 'Inter','Segoe UI',sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "●", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawSimple);
        };

        const drawPop = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const primary = isError ? "#f43f5e" : "#ec4899";
            const circleR = S / 2 - 3;
            ctx.beginPath();
            ctx.arc(CX, CY, circleR, 0, Math.PI * 2);
            const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, circleR);
            bg.addColorStop(0, "rgba(253,242,248,0.95)");
            bg.addColorStop(1, "rgba(245,208,230,0.85)");
            ctx.fillStyle = bg;
            ctx.fill();
            const borderScale = isRecording ? 1 + Math.sin(t * 0.08) * 0.01 * level : 1;
            ctx.beginPath();
            ctx.arc(CX, CY, circleR * borderScale, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(primary, isRecording ? 0.6 + level * 0.3 : 0.25);
            ctx.lineWidth = isRecording ? 2.5 : 1.5;
            ctx.stroke();
            drawRadialBars((i, barH) => {
                const hue = (i / barCount) * 60 + 320;
                const alpha = isRecording ? 0.5 + (barH / maxBarH) * 0.5 : 0.12;
                return `hsla(${hue},80%,65%,${alpha})`;
            }, Math.max(1.5, S * 0.022));
            if (isRecording) {
                const sc = 1 + Math.sin(t * 0.1) * 0.15;
                ctx.save();
                ctx.translate(CX, CY);
                ctx.scale(sc, sc);
                ctx.beginPath();
                ctx.arc(0, 0, S * 0.06, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(244,63,94,0.85)";
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = isError ? "#f43f5e" : hexToRgba(primary, 0.75);
                ctx.font = `bold ${Math.round(S * 0.15)}px 'Nunito','Segoe UI',sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "😢" : "♪", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawPop);
        };

        const drawNatural = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const green = isError ? "#c05746" : "#5a7247";
            const terra = isError ? "#a04030" : "#c67a4a";
            const circleR = S / 2 - 3;
            ctx.beginPath();
            ctx.arc(CX, CY, circleR, 0, Math.PI * 2);
            const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, circleR);
            bg.addColorStop(0, "rgba(255,252,245,0.95)");
            bg.addColorStop(1, "rgba(232,223,211,0.85)");
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            const segs = 80;
            for (let i = 0; i <= segs; i++) {
                const a = (i / segs) * Math.PI * 2;
                const wobble = isRecording
                    ? Math.sin(t * 0.05 + i * 0.3) * 1.5 * level + Math.sin(i * 0.8) * 0.5
                    : Math.sin(t * 0.01 + i * 0.5) * 0.5;
                const r = circleR + wobble;
                const x = CX + Math.cos(a) * r;
                const y = CY + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = hexToRgba(green, isRecording ? 0.5 + level * 0.3 : 0.25);
            ctx.lineWidth = isRecording ? 1.5 : 1;
            ctx.stroke();
            ctx.restore();
            drawRadialBars((i, barH) => hexToRgba(i % 2 === 0 ? green : terra, isRecording ? 0.3 + (barH / maxBarH) * 0.5 : 0.08), Math.max(1, S * 0.018));
            if (isRecording) {
                const dotA = Math.sin(t * 0.06) * 0.2 + 0.7;
                ctx.beginPath();
                ctx.arc(CX, CY, S * 0.055, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(192,87,70,${dotA})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#c05746" : hexToRgba(green, 0.7);
                ctx.font = `500 ${Math.round(S * 0.14)}px 'Noto Serif JP',serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "❦", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawNatural);
        };

        const drawMidnight = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const gold = isError ? "#ef4444" : "#d4a853";
            const amber = isError ? "#dc2626" : "#e8c06a";
            const circleR = S / 2 - 3;
            ctx.beginPath();
            ctx.arc(CX, CY, circleR, 0, Math.PI * 2);
            const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, circleR);
            bg.addColorStop(0, "rgba(30,30,50,0.92)");
            bg.addColorStop(1, "rgba(20,20,35,0.98)");
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(CX, CY, circleR, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(gold, isRecording ? 0.5 + level * 0.3 : 0.2);
            ctx.lineWidth = isRecording ? 1.5 : 0.8;
            ctx.stroke();
            drawRadialBars((_i, barH) => hexToRgba(gold, isRecording ? 0.4 + (barH / maxBarH) * 0.5 : 0.06), Math.max(1, S * 0.015));
            if (isRecording) {
                for (let i = 0; i < 5; i++) {
                    const a = (t * 0.01 + i * 1.25) % (Math.PI * 2);
                    const dist = innerR + 5 + Math.sin(t * 0.03 + i * 2) * (S * 0.1);
                    ctx.beginPath();
                    ctx.arc(CX + Math.cos(a) * dist, CY + Math.sin(a) * dist, 1, 0, Math.PI * 2);
                    ctx.fillStyle = hexToRgba(amber, 0.3 + Math.sin(t * 0.05 + i) * 0.2);
                    ctx.fill();
                }
                const dotA = Math.sin(t * 0.08) * 0.2 + 0.7;
                ctx.beginPath();
                ctx.arc(CX, CY, S * 0.05, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(239,68,68,${dotA})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#ef4444" : hexToRgba(gold, 0.75);
                ctx.font = `500 ${Math.round(S * 0.14)}px 'Outfit','Segoe UI',sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "✦", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawMidnight);
        };

        const drawRetro = () => {
            const { isRecording, isError, level, t } = getState();
            updateBars(isRecording, isError, level, t, barCount, maxBarH);
            const green = isError ? "#ff3333" : "#33ff33";
            const orange = isError ? "#ff0000" : "#ff8c00";
            ctx.fillStyle = "rgba(10,26,10,0.95)";
            ctx.fillRect(0, 0, S, S);
            ctx.strokeStyle = hexToRgba(green, isRecording ? 0.6 : 0.25);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(0, 0, S, S);
            const retroBarCount = Math.max(8, Math.round(S / 10));
            for (let i = 0; i < retroBarCount; i++) {
                const angle = (i / retroBarCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(barsRef.current[i * 2] || barsRef.current[i] || 0, 1.5);
                const pixSize = Math.max(2, Math.round(S * 0.035));
                const steps = Math.floor(barH / pixSize);
                for (let s = 0; s < steps; s++) {
                    const dist = innerR + 3 + s * pixSize;
                    const px = CX + Math.cos(angle) * dist - pixSize / 2;
                    const py = CY + Math.sin(angle) * dist - pixSize / 2;
                    const bA = isRecording ? 0.5 + (s / Math.max(steps, 1)) * 0.4 : 0.12;
                    ctx.fillStyle = s > steps * 0.7 ? hexToRgba(orange, bA) : hexToRgba(green, bA);
                    ctx.fillRect(Math.round(px), Math.round(py), pixSize - 1, pixSize - 1);
                }
            }
            for (let y = 0; y < S; y += 3) {
                ctx.fillStyle = "rgba(0,0,0,0.06)";
                ctx.fillRect(0, y, S, 1);
            }
            if (isRecording) {
                const blink = Math.floor(t / 15) % 2 === 0;
                if (blink) {
                    const ps = Math.max(4, Math.round(S * 0.05));
                    ctx.fillStyle = "#ff3333";
                    ctx.fillRect(CX - ps / 2, CY - ps / 2, ps, ps);
                }
            } else {
                ctx.fillStyle = isError ? "#ff3333" : green;
                ctx.font = `bold ${Math.round(S * 0.12)}px 'Press Start 2P',monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "X" : ">", CX, CY);
            }
            animIdRef.current = requestAnimationFrame(drawRetro);
        };

        // テーマ選択
        if (viewMode === "waveform") {
            drawWaveform();
        } else {
            const drawFns: Record<ThemeId, () => void> = {
                cyberpunk: drawCyberpunk,
                simple: drawSimple,
                pop: drawPop,
                natural: drawNatural,
                midnight: drawMidnight,
                retro: drawRetro,
            };
            (drawFns[theme] || drawCyberpunk)();
        }
        return () => cancelAnimationFrame(animIdRef.current);
    }, [status, colors, theme, viewMode, winW, winH]);

    // Click handler
    const handleClick = useCallback(async () => {
        try { await invoke("toggle_recording_command"); } catch (e) { console.error("toggle failed:", e); }
    }, []);

    const preventFocus = useCallback((e: React.MouseEvent) => { e.preventDefault(); }, []);

    const handleClose = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        try { await invoke("switch_to_main"); } catch (err) { console.error("Close failed:", err); }
    }, []);




    // 設定メニュー
    const [menuOpen, setMenuOpen] = useState(false);

    const toggleMenu = useCallback(() => {
        setMenuOpen(prev => !prev);
    }, []);

    // テーマ変更
    const { setTheme } = useTheme();
    const handleThemeChange = useCallback(async (id: ThemeId) => {
        await setTheme(id);
        const { emit } = await import("@tauri-apps/api/event");
        await emit("theme-changed", id);
    }, [setTheme]);

    // メニュー開閉時にウィンドウサイズを調整
    useEffect(() => {
        (async () => {
            try {
                const win = getCurrentWindow();
                if (menuOpen) {
                    await win.setSize(new LogicalSize(220, 160));
                } else if (viewMode === "waveform") {
                    await win.setSize(new LogicalSize(280, 60));
                } else {
                    await win.setSize(new LogicalSize(80, 80));
                }
            } catch { }
        })();
    }, [menuOpen, viewMode]);

    const isWaveform = viewMode === "waveform";
    const btnSize = menuOpen ? 18 : Math.max(14, Math.round(Math.min(winW, winH) * 0.22));

    const THEME_LIST: { id: ThemeId; label: string; color: string }[] = [
        { id: "cyberpunk", label: "Cyber", color: "#00f0ff" },
        { id: "simple", label: "Simple", color: "#2563eb" },
        { id: "pop", label: "Pop", color: "#ec4899" },
        { id: "natural", label: "Natural", color: "#5a7247" },
        { id: "midnight", label: "Night", color: "#d4a853" },
        { id: "retro", label: "Retro", color: "#33ff33" },
    ];

    const btnStyle: React.CSSProperties = {
        borderRadius: 3,
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "rgba(255,255,255,0.8)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        lineHeight: 1,
    };

    return (
        <div ref={containerRef} style={{
            position: "relative",
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            borderRadius: (isWaveform && !menuOpen) ? 14 : 0,
        }}>
            {/* 右上: 歯車 + ✕ */}
            <div style={{ position: "absolute", top: 2, right: 2, display: "flex", gap: 2, zIndex: 20 }}>
                <button
                    onClick={toggleMenu}
                    onMouseDown={preventFocus}
                    tabIndex={-1}
                    style={{ ...btnStyle, width: btnSize, height: btnSize, fontSize: Math.max(7, btnSize * 0.5) }}
                    title="設定"
                >⚙</button>
                <button
                    onClick={handleClose}
                    onMouseDown={preventFocus}
                    tabIndex={-1}
                    style={{ ...btnStyle, width: btnSize, height: btnSize, fontSize: Math.max(7, btnSize * 0.5) }}
                    title="メイン画面に戻る"
                >✕</button>
            </div>

            {/* ポップアップメニュー */}
            {menuOpen && (
                <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "rgba(20,20,30,0.95)",
                    zIndex: 15,
                    display: "flex",
                    flexDirection: "column",
                    padding: "26px 10px 8px",
                    gap: 8,
                    fontFamily: "'Inter','Segoe UI',sans-serif",
                    boxSizing: "border-box",
                }}>
                    {/* ビューモード */}
                    <div>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginBottom: 4, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                            ビューモード
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                            {(["circle", "waveform"] as ViewMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => { setViewMode(mode); saveViewMode(mode); }}
                                    onMouseDown={preventFocus}
                                    tabIndex={-1}
                                    style={{
                                        flex: 1,
                                        padding: "4px 0",
                                        fontSize: 9,
                                        fontWeight: viewMode === mode ? 700 : 400,
                                        background: viewMode === mode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                                        border: viewMode === mode ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: 4,
                                        color: viewMode === mode ? "#fff" : "rgba(255,255,255,0.6)",
                                        cursor: "pointer",
                                    }}
                                >{mode === "circle" ? "◉ サークル" : "≋ ウェーブ"}</button>
                            ))}
                        </div>
                    </div>

                    {/* テーマ選択 */}
                    <div>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginBottom: 4, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                            テーマ
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
                            {THEME_LIST.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleThemeChange(t.id)}
                                    onMouseDown={preventFocus}
                                    tabIndex={-1}
                                    style={{
                                        padding: "3px 0",
                                        fontSize: 8,
                                        fontWeight: theme === t.id ? 700 : 400,
                                        background: theme === t.id ? "rgba(255,255,255,0.12)" : "transparent",
                                        border: theme === t.id ? `1px solid ${t.color}60` : "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: 3,
                                        color: theme === t.id ? t.color : "rgba(255,255,255,0.55)",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 3,
                                    }}
                                >
                                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: t.color }} />
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* メインコンテンツ（メニュー閉じている時のみ表示） */}
            {!menuOpen && (
                <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
                    <canvas
                        ref={canvasRef}
                        style={{ width: winW, height: winH, display: "block", pointerEvents: "none" }}
                    />
                    <div data-tauri-drag-region style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
                    <button
                        onClick={handleClick}
                        onMouseDown={preventFocus}
                        tabIndex={-1}
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%,-50%)",
                            width: isWaveform ? "60%" : "60%",
                            height: isWaveform ? "80%" : "60%",
                            borderRadius: isWaveform ? 8 : "50%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            zIndex: 5,
                            padding: 0,
                        }}
                        title="録音開始/停止"
                    />
                </div>
            )}

            {status === "error" && errorMsg && !menuOpen && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 2,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(220,38,38,0.9)",
                        color: "#fff",
                        fontSize: 7,
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: 4,
                        whiteSpace: "nowrap",
                        maxWidth: winW * 0.9,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        zIndex: 20,
                    }}
                    title={errorMsg}
                >⚠ {errorMsg.length > 25 ? errorMsg.slice(0, 25) + "…" : errorMsg}</div>
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
