use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use hound::{SampleFormat as HoundFmt, WavSpec, WavWriter};
use std::path::PathBuf;

use crate::SharedState;

/// デフォルト入力デバイスからの録音を開始する。
/// SharedState.recording が false になると録音を停止してスレッドを終了する。
/// サンプルは SharedState.audio_samples に逐次追記される（f32, 16kHz, mono に正規化）。
pub fn start_recording(state: SharedState) {
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("[audio] 入力デバイスが見つかりません");
                return;
            }
        };

        // デバイスがサポートする設定を優先使用し、16kHz mono に合わせる
        let supported = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[audio] デフォルト設定取得失敗: {e}");
                return;
            }
        };

        let sample_rate = supported.sample_rate();
        let channels = supported.channels();
        let sample_format = supported.sample_format();

        let config: StreamConfig = StreamConfig {
            channels,
            sample_rate,
            buffer_size: cpal::BufferSize::Default,
        };

        let state_clone = state.clone();
        let target_rate = 16000u32;

        // サンプルフォーマットに応じてストリームを構築
        // cpal が報告するフォーマットと実際のデータ型を一致させることが重要
        let stream_result = match sample_format {
            SampleFormat::F32 => {
                build_stream_f32(&device, &config, state_clone, channels, sample_rate.0, target_rate)
            }
            SampleFormat::I16 => {
                build_stream_i16(&device, &config, state_clone, channels, sample_rate.0, target_rate)
            }
            SampleFormat::U16 => {
                build_stream_u16(&device, &config, state_clone, channels, sample_rate.0, target_rate)
            }
            // cpal 0.15 では F64 / I8 / I32 等も存在するが、主要プラットフォームは上記3種
            _ => {
                eprintln!("[audio] 未対応のサンプルフォーマット: {:?}", sample_format);
                return;
            }
        };

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[audio] ストリーム作成失敗: {e}");
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[audio] ストリーム再生失敗: {e}");
            return;
        }

        // recording フラグが false になるまでスピン
        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if !state.lock().unwrap().recording {
                break;
            }
        }
        drop(stream);
    });
}

// ─── サンプルフォーマット別ストリームビルダー ────────────────────────────

fn build_stream_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    state: SharedState,
    channels: u16,
    input_rate: u32,
    target_rate: u32,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let mono = to_mono_f32(data, channels as usize);
            let resampled = resample(&mono, input_rate, target_rate);
            let rms = compute_rms(&mono);
            let mut s = state.lock().unwrap();
            if s.recording {
                s.audio_samples.extend_from_slice(&resampled);
                s.audio_level = rms;
            }
        },
        |err| eprintln!("[audio] f32 ストリームエラー: {err}"),
        None,
    )
}

fn build_stream_i16(
    device: &cpal::Device,
    config: &StreamConfig,
    state: SharedState,
    channels: u16,
    input_rate: u32,
    target_rate: u32,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    device.build_input_stream(
        config,
        move |data: &[i16], _| {
            let floats: Vec<f32> = data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
            let mono = to_mono_f32(&floats, channels as usize);
            let resampled = resample(&mono, input_rate, target_rate);
            let rms = compute_rms(&mono);
            let mut s = state.lock().unwrap();
            if s.recording {
                s.audio_samples.extend_from_slice(&resampled);
                s.audio_level = rms;
            }
        },
        |err| eprintln!("[audio] i16 ストリームエラー: {err}"),
        None,
    )
}

fn build_stream_u16(
    device: &cpal::Device,
    config: &StreamConfig,
    state: SharedState,
    channels: u16,
    input_rate: u32,
    target_rate: u32,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    device.build_input_stream(
        config,
        move |data: &[u16], _| {
            let floats: Vec<f32> = data
                .iter()
                .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                .collect();
            let mono = to_mono_f32(&floats, channels as usize);
            let resampled = resample(&mono, input_rate, target_rate);
            let rms = compute_rms(&mono);
            let mut s = state.lock().unwrap();
            if s.recording {
                s.audio_samples.extend_from_slice(&resampled);
                s.audio_level = rms;
            }
        },
        |err| eprintln!("[audio] u16 ストリームエラー: {err}"),
        None,
    )
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────────────────

/// モノラルf32サンプルから RMS（音量レベル）を計算する。
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

/// インターリーブされたマルチチャンネルサンプルを mono (平均) に変換する。
fn to_mono_f32(data: &[f32], channels: usize) -> Vec<f32> {
    if channels == 1 {
        return data.to_vec();
    }
    data.chunks(channels)
        .map(|ch| ch.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// 線形補間によるシンプルなリサンプリング。
/// Whisper が要求する 16kHz に変換するために使用する。
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let new_len = (samples.len() as f64 / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let pos = i as f64 * ratio;
        let idx = pos as usize;
        let frac = pos - idx as f64;

        let a = samples.get(idx).copied().unwrap_or(0.0);
        let b = samples.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac as f32);
    }

    out
}

/// f32 サンプル列を 16kHz mono i16 WAV として一時ファイルに書き出す。
pub fn save_wav(samples: &[f32]) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let path = std::env::temp_dir().join("koe_recording.wav");

    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: HoundFmt::Int,
    };

    let mut writer = WavWriter::create(&path, spec)?;
    for &s in samples {
        let sample = (s * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        writer.write_sample(sample)?;
    }
    writer.finalize()?;

    Ok(path)
}
