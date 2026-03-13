import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { useTheme } from "../lib/ThemeContext";
import { ThemeId } from "../lib/themes";

type FloatingStatus = "idle" | "recording" | "transcribing" | "formatting" | "done" | "error";

const STATUS_ICON: Record<FloatingStatus, string> = {
    idle: "◈",
    recording: "",
    transcribing: "⟳",
    formatting: "⚡",
    done: "✓",
    error: "✗",
};

const STATUS_ICON_SIMPLE: Record<FloatingStatus, string> = {
    idle: "●",
    recording: "",
    transcribing: "…",
    formatting: "⚙",
    done: "✓",
    error: "✗",
};

const STATUS_ICON_POP: Record<FloatingStatus, string> = {
    idle: "♪",
    recording: "",
    transcribing: "💭",
    formatting: "✨",
    done: "💖",
    error: "😢",
};

const COLOR_PRESETS: Record<string, [string, string]> = {
    ocean: ["#00f0ff", "#a855f7"],
    sunset: ["#ff6b35", "#ff00aa"],
    forest: ["#00ff88", "#00f0ff"],
    lavender: ["#a855f7", "#ff00aa"],
    neon: ["#00f0ff", "#ff00aa"],
};

export default function FloatingWindow() {
    const { theme } = useTheme();
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
        const barCount = 32;
        const innerRadius = 26;
        const maxBarHeight = 28;

        const drawCyberpunk = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError
                        ? Math.random() * 8 + 2
                        : 2 + Math.sin(t * 0.03 + i * 0.5) * 1.5;
                bars[i] += (target - bars[i]) * 0.2;
            }

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

            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
            bgGrad.addColorStop(0, isRecording ? hexToRgba(c0, 0.15) : "rgba(10, 10, 25, 0.85)");
            bgGrad.addColorStop(0.7, isRecording ? hexToRgba(c1, 0.08) : "rgba(5, 5, 15, 0.9)");
            bgGrad.addColorStop(1, "rgba(0, 0, 0, 0.95)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

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

            // Radial bars
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

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(c0, 0.5);
                ctx.font = "bold 7px 'Orbitron', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "REC" : status === "transcribing" ? "PROC" : status === "done" ? "OK" : status === "error" ? "ERR" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(drawCyberpunk);
        };

        const drawSimple = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError ? Math.random() * 5 + 1 : 1.5 + Math.sin(t * 0.02 + i * 0.4) * 1;
                bars[i] += (target - bars[i]) * 0.15;
            }

            const primary = isError ? "#dc2626" : "#2563eb";
            const secondary = isError ? "#ef4444" : "#1e40af";
            const circleRadius = size / 2 - 6;

            // Clean circle border
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius);
            bgGrad.addColorStop(0, "rgba(255,255,255,0.95)");
            bgGrad.addColorStop(1, "rgba(240,242,245,0.9)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

            const borderAlpha = isRecording ? 0.6 + level * 0.3 : 0.15;
            ctx.strokeStyle = hexToRgba(primary, borderAlpha);
            ctx.lineWidth = isRecording ? 2.5 : 1.5;
            ctx.stroke();

            // Radial bars — thin clean lines
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 1);
                const x1 = centerX + Math.cos(angle) * (innerRadius + 3);
                const y1 = centerY + Math.sin(angle) * (innerRadius + 3);
                const x2 = centerX + Math.cos(angle) * (innerRadius + 3 + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + 3 + barH);

                const barAlpha = isRecording ? 0.4 + (barH / maxBarHeight) * 0.5 : 0.1;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = hexToRgba(primary, barAlpha);
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Center icon
            if (isRecording) {
                const dotAlpha = Math.sin(t * 0.08) * 0.2 + 0.8;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(220, 38, 38, ${dotAlpha})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#dc2626" : hexToRgba(secondary, 0.7);
                ctx.font = "bold 18px 'Inter', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(STATUS_ICON_SIMPLE[status], centerX, centerY);
            }

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(primary, 0.45);
                ctx.font = "600 8px 'Inter', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "REC" : status === "transcribing" ? "処理中" : status === "done" ? "完了" : status === "error" ? "エラー" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(drawSimple);
        };

        const drawPop = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError ? Math.random() * 6 + 1 : 2 + Math.sin(t * 0.025 + i * 0.5) * 2;
                bars[i] += (target - bars[i]) * 0.18;
            }

            const primary = isError ? "#f43f5e" : "#ec4899";
            const secondary = isError ? "#fb7185" : "#a855f7";
            const circleRadius = size / 2 - 5;

            // Soft circle background
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius);
            bgGrad.addColorStop(0, "rgba(253,242,248,0.95)");
            bgGrad.addColorStop(0.7, "rgba(252,231,243,0.9)");
            bgGrad.addColorStop(1, "rgba(245,208,230,0.85)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Bouncy border
            const borderScale = isRecording ? 1 + Math.sin(t * 0.08) * 0.01 * level : 1;
            const borderAlpha = isRecording ? 0.6 + level * 0.3 : 0.25 + Math.sin(t * 0.03) * 0.1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius * borderScale, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(primary, borderAlpha);
            ctx.lineWidth = isRecording ? 3 : 2;
            ctx.stroke();

            // Radial bars — rounded and cute
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 1.5);
                const x1 = centerX + Math.cos(angle) * (innerRadius + 3);
                const y1 = centerY + Math.sin(angle) * (innerRadius + 3);
                const x2 = centerX + Math.cos(angle) * (innerRadius + 3 + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + 3 + barH);

                const hue = (i / barCount) * 60 + 320; // Pink to purple range
                const barAlpha = isRecording ? 0.5 + (barH / maxBarHeight) * 0.5 : 0.15;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${barAlpha})`;
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Center icon
            if (isRecording) {
                const dotScale = 1 + Math.sin(t * 0.1) * 0.15;
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.scale(dotScale, dotScale);
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(244, 63, 94, 0.85)`;
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = isError ? "#f43f5e" : hexToRgba(primary, 0.75);
                ctx.font = "bold 18px 'Nunito', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(STATUS_ICON_POP[status], centerX, centerY);
            }

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(secondary, 0.5);
                ctx.font = "700 8px 'Nunito', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "♪ REC" : status === "transcribing" ? "処理中" : status === "done" ? "✨" : status === "error" ? "😢" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(drawPop);
        };

        // Natural: Organic leaf-vein ring
        const drawNatural = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError ? Math.random() * 5 + 1 : 2 + Math.sin(t * 0.015 + i * 0.6) * 1.5;
                bars[i] += (target - bars[i]) * 0.12;
            }

            const green = isError ? "#c05746" : "#5a7247";
            const terra = isError ? "#a04030" : "#c67a4a";
            const circleRadius = size / 2 - 5;

            // Warm paper-like background
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius);
            bgGrad.addColorStop(0, "rgba(255,252,245,0.95)");
            bgGrad.addColorStop(0.6, "rgba(245,240,232,0.9)");
            bgGrad.addColorStop(1, "rgba(232,223,211,0.85)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Organic border — wavy line
            ctx.save();
            ctx.beginPath();
            const segments = 120;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const wobble = isRecording
                    ? Math.sin(t * 0.05 + i * 0.3) * 2 * level + Math.sin(i * 0.8) * 1
                    : Math.sin(t * 0.01 + i * 0.5) * 0.8;
                const r = circleRadius + wobble;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            const borderAlpha = isRecording ? 0.5 + level * 0.3 : 0.25;
            ctx.strokeStyle = hexToRgba(green, borderAlpha);
            ctx.lineWidth = isRecording ? 2 : 1.5;
            ctx.stroke();
            ctx.restore();

            // Leaf-vein radial bars
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 1.5);
                const x1 = centerX + Math.cos(angle) * (innerRadius + 3);
                const y1 = centerY + Math.sin(angle) * (innerRadius + 3);
                const x2 = centerX + Math.cos(angle) * (innerRadius + 3 + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + 3 + barH);

                const barAlpha = isRecording ? 0.3 + (barH / maxBarHeight) * 0.5 : 0.1;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = hexToRgba(i % 2 === 0 ? green : terra, barAlpha);
                ctx.lineWidth = 2;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Center
            if (isRecording) {
                const dotAlpha = Math.sin(t * 0.06) * 0.2 + 0.7;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(192, 87, 70, ${dotAlpha})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#c05746" : hexToRgba(green, 0.7);
                ctx.font = "500 16px 'Noto Serif JP', serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "声", centerX, centerY);
            }

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(green, 0.4);
                ctx.font = "500 8px 'Noto Serif JP', serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "録音" : status === "transcribing" ? "変換" : status === "done" ? "完了" : status === "error" ? "失敗" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(drawNatural);
        };

        // Midnight: Minimal circle + gold particles
        const drawMidnight = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.3 + 0.7 * Math.random()) * maxBarHeight
                    : isError ? Math.random() * 4 + 1 : 1 + Math.sin(t * 0.02 + i * 0.4) * 1;
                bars[i] += (target - bars[i]) * 0.14;
            }

            const gold = isError ? "#ef4444" : "#d4a853";
            const amber = isError ? "#dc2626" : "#e8c06a";
            const circleRadius = size / 2 - 5;

            // Dark elegant background
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius);
            bgGrad.addColorStop(0, "rgba(30,30,50,0.92)");
            bgGrad.addColorStop(0.7, "rgba(26,26,46,0.95)");
            bgGrad.addColorStop(1, "rgba(20,20,35,0.98)");
            ctx.fillStyle = bgGrad;
            ctx.fill();

            // Elegant thin border
            const borderAlpha = isRecording ? 0.5 + level * 0.3 : 0.2 + Math.sin(t * 0.015) * 0.05;
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(gold, borderAlpha);
            ctx.lineWidth = isRecording ? 2 : 1;
            ctx.stroke();

            // Inner thin ring
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(gold, 0.1);
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Radial bars — thin, elegant
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i], 1);
                const x1 = centerX + Math.cos(angle) * (innerRadius + 4);
                const y1 = centerY + Math.sin(angle) * (innerRadius + 4);
                const x2 = centerX + Math.cos(angle) * (innerRadius + 4 + barH);
                const y2 = centerY + Math.sin(angle) * (innerRadius + 4 + barH);

                const barAlpha = isRecording ? 0.4 + (barH / maxBarHeight) * 0.5 : 0.08;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = hexToRgba(gold, barAlpha);
                ctx.lineWidth = 1.5;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // Floating particles (gold specks)
            if (isRecording) {
                for (let i = 0; i < 6; i++) {
                    const angle = (t * 0.01 + i * 1.05) % (Math.PI * 2);
                    const dist = innerRadius + 8 + Math.sin(t * 0.03 + i * 2) * 12;
                    const px = centerX + Math.cos(angle) * dist;
                    const py = centerY + Math.sin(angle) * dist;
                    const pAlpha = 0.3 + Math.sin(t * 0.05 + i) * 0.2;
                    ctx.beginPath();
                    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = hexToRgba(amber, pAlpha);
                    ctx.fill();
                }
            } else {
                // Subtle idle particles
                for (let i = 0; i < 3; i++) {
                    const angle = (t * 0.003 + i * 2.1) % (Math.PI * 2);
                    const dist = circleRadius - 8 + Math.sin(t * 0.01 + i) * 4;
                    const px = centerX + Math.cos(angle) * dist;
                    const py = centerY + Math.sin(angle) * dist;
                    ctx.beginPath();
                    ctx.arc(px, py, 1, 0, Math.PI * 2);
                    ctx.fillStyle = hexToRgba(gold, 0.15);
                    ctx.fill();
                }
            }

            // Center
            if (isRecording) {
                const dotAlpha = Math.sin(t * 0.08) * 0.2 + 0.7;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(239, 68, 68, ${dotAlpha})`;
                ctx.fill();
            } else {
                ctx.fillStyle = isError ? "#ef4444" : hexToRgba(gold, 0.75);
                ctx.font = "500 16px 'Outfit', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "✗" : "✦", centerX, centerY);
            }

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(gold, 0.4);
                ctx.font = "500 8px 'Outfit', 'Segoe UI', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "REC" : status === "transcribing" ? "処理中" : status === "done" ? "完了" : status === "error" ? "ERR" : "";
                ctx.fillText(label, centerX, centerY + 18);
            }

            animIdRef.current = requestAnimationFrame(drawMidnight);
        };

        // Retro: Pixelated square bars
        const drawRetro = () => {
            timeRef.current += 1;
            ctx.clearRect(0, 0, size, size);

            const isRecording = status === "recording";
            const isError = status === "error";
            const level = isRecording ? Math.min(audioLevelRef.current * 8, 1) : 0;
            const t = timeRef.current;

            const bars = barsRef.current;
            for (let i = 0; i < barCount; i++) {
                const target = isRecording
                    ? level * (0.4 + 0.6 * Math.random()) * maxBarHeight
                    : isError ? Math.random() * 8 + 2 : 2 + Math.sin(t * 0.03 + i * 0.5) * 1.5;
                bars[i] += (target - bars[i]) * 0.25;
            }

            const green = isError ? "#ff3333" : "#33ff33";
            const orange = isError ? "#ff0000" : "#ff8c00";

            // Dark screen background (square)
            ctx.fillStyle = "rgba(10, 26, 10, 0.95)";
            ctx.fillRect(2, 2, size - 4, size - 4);

            // Pixel border
            ctx.strokeStyle = hexToRgba(green, isRecording ? 0.6 : 0.25);
            ctx.lineWidth = 2;
            ctx.strokeRect(2, 2, size - 4, size - 4);

            // Inner border
            ctx.strokeStyle = hexToRgba(green, 0.08);
            ctx.lineWidth = 1;
            ctx.strokeRect(6, 6, size - 12, size - 12);

            // Square radial bars — pixelated look
            const retroBarCount = 16;
            for (let i = 0; i < retroBarCount; i++) {
                const angle = (i / retroBarCount) * Math.PI * 2 - Math.PI / 2;
                const barH = Math.max(bars[i * 2] || bars[i], 2);
                const pixelSize = 4;
                const steps = Math.floor(barH / pixelSize);

                for (let s = 0; s < steps; s++) {
                    const dist = innerRadius + 4 + s * pixelSize;
                    const px = centerX + Math.cos(angle) * dist - pixelSize / 2;
                    const py = centerY + Math.sin(angle) * dist - pixelSize / 2;

                    const barAlpha = isRecording ? 0.6 + (s / steps) * 0.3 : 0.15;
                    ctx.fillStyle = s > steps * 0.7
                        ? hexToRgba(orange, barAlpha)
                        : hexToRgba(green, barAlpha);
                    ctx.fillRect(Math.round(px), Math.round(py), pixelSize - 1, pixelSize - 1);
                }
            }

            // CRT scanline effect
            for (let y = 0; y < size; y += 3) {
                ctx.fillStyle = "rgba(0,0,0,0.06)";
                ctx.fillRect(0, y, size, 1);
            }

            // Center
            if (isRecording) {
                const blink = Math.floor(t / 15) % 2 === 0;
                if (blink) {
                    ctx.fillStyle = "#ff3333";
                    ctx.fillRect(centerX - 5, centerY - 5, 10, 10);
                }
            } else {
                ctx.fillStyle = isError ? "#ff3333" : green;
                ctx.font = "bold 14px 'Press Start 2P', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(isError ? "X" : ">", centerX, centerY);
            }

            if (status !== "idle") {
                ctx.fillStyle = hexToRgba(green, 0.5);
                ctx.font = "6px 'Press Start 2P', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const label = isRecording ? "REC" : status === "transcribing" ? "PROC" : status === "done" ? "OK" : status === "error" ? "ERR" : "";
                ctx.fillText(label, centerX, centerY + 20);
            }

            animIdRef.current = requestAnimationFrame(drawRetro);
        };

        const drawFns: Record<ThemeId, () => void> = {
            cyberpunk: drawCyberpunk,
            simple: drawSimple,
            pop: drawPop,
            natural: drawNatural,
            midnight: drawMidnight,
            retro: drawRetro,
        };

        const draw = drawFns[theme] || drawCyberpunk;
        draw();
        return () => cancelAnimationFrame(animIdRef.current);
    }, [status, colors, theme]);

    // Click handler
    const handleClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.blur();
        try {
            await invoke("toggle_recording_command");
        } catch (e) {
            console.error("toggle failed:", e);
        }
    }, []);

    // mainに戻るボタンのハンドラ
    const handleClose = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        try {
            await invoke("switch_to_main");
        } catch (err) {
            console.error("Close failed:", err);
        }
    }, []);

    const closeButtonStyle: React.CSSProperties = theme === "cyberpunk" ? {
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
    } : theme === "pop" ? {
        position: "absolute",
        top: 0,
        right: 0,
        width: 24,
        height: 24,
        borderRadius: 12,
        background: "rgba(244, 63, 94, 0.15)",
        border: "1px solid rgba(244, 63, 94, 0.3)",
        color: "#f43f5e",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        transition: "all 0.2s",
        padding: 0,
        fontSize: 10,
        fontFamily: "'Nunito', sans-serif",
    } : {
        position: "absolute",
        top: 0,
        right: 0,
        width: 22,
        height: 22,
        borderRadius: 6,
        background: "rgba(220, 38, 38, 0.08)",
        border: "1px solid rgba(220, 38, 38, 0.2)",
        color: "#dc2626",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        transition: "all 0.2s",
        padding: 0,
        fontSize: 10,
        fontFamily: "'Inter', sans-serif",
    };

    return (
        <div style={{ position: "relative", width: 140, height: 160 }}>
            {/* 閉じる（メイン画面へ戻る）ボタン */}
            <button
                onClick={handleClose}
                style={closeButtonStyle}
                onMouseEnter={e => {
                    const hoverBg = theme === "cyberpunk" ? "rgba(255, 51, 102, 0.5)" : theme === "pop" ? "rgba(244, 63, 94, 0.3)" : "rgba(220, 38, 38, 0.15)";
                    e.currentTarget.style.background = hoverBg;
                }}
                onMouseLeave={e => {
                    const normalBg = theme === "cyberpunk" ? "rgba(255, 51, 102, 0.2)" : theme === "pop" ? "rgba(244, 63, 94, 0.15)" : "rgba(220, 38, 38, 0.08)";
                    e.currentTarget.style.background = normalBg;
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

            {/* エラーメッセージ表示 */}
            {status === "error" && errorMsg && (
                <div
                    style={{
                        position: "absolute",
                        bottom: -2,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: theme === "cyberpunk" ? "rgba(255, 51, 102, 0.9)" : theme === "pop" ? "rgba(244, 63, 94, 0.9)" : "rgba(220, 38, 38, 0.9)",
                        color: "#fff",
                        fontSize: 9,
                        fontFamily: "var(--t-font-display)",
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: "var(--t-radius)",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        zIndex: 20,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        animation: "fadeIn 0.2s ease-out",
                        letterSpacing: 0.5,
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
