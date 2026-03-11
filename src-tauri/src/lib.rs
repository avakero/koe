use std::sync::{Arc, Mutex};
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_store::StoreExt;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+K";

mod audio;
mod paste;
mod transcribe;

// ---------------------------------------------------------------------------
// アプリケーション共有状態
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct AppState {
    pub recording: bool,
    pub audio_samples: Vec<f32>,
    pub audio_level: f32,
}

pub type SharedState = Arc<Mutex<AppState>>;

// ---------------------------------------------------------------------------
// Tauri コマンド
// ---------------------------------------------------------------------------

/// 整形済みテキストをクリップボード経由で前面ウィンドウにペーストする。
#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    // macOS クラッシュ回避のため別スレッドで実行
    // エラー型を Send+Sync にするため文字列に変換してから thread::spawn する
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || {
        let result = paste::paste_text_to_foreground(text)
            .map_err(|e| e.to_string());
        let _ = tx.send(result);
    });
    rx.recv().map_err(|e| e.to_string())?
}

/// Whisper モデルを app_data_dir/models/ へダウンロードする。
/// model: "small" | "medium"
#[tauri::command]
async fn download_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    transcribe::download_model(&app, &model)
        .await
        .map_err(|e| e.to_string())
}

/// whisper-cli バイナリを app_data_dir/bin/ へダウンロード・展開する。
#[tauri::command]
async fn download_whisper_bin(app: tauri::AppHandle) -> Result<(), String> {
    transcribe::download_whisper_bin(&app)
        .await
        .map_err(|e| e.to_string())
}

/// フローティングウィンドウからの録音トグル
#[tauri::command]
async fn toggle_recording_command(app: tauri::AppHandle) -> Result<(), String> {
    let state: SharedState = app.state::<SharedState>().inner().clone();
    toggle_recording(app, state).await;
    Ok(())
}

/// グローバルショートカットを再登録する。
/// shortcut: "Ctrl+Shift+K", "Ctrl+Shift+Space" など
#[tauri::command]
fn update_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let state: SharedState = app.state::<SharedState>().inner().clone();
    register_shortcut(&app, &shortcut, state)
}

/// ショートカットを登録（既存のショートカットはすべて解除）
fn register_shortcut(
    app: &tauri::AppHandle,
    shortcut: &str,
    state: SharedState,
) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let app = app.clone();
                let state = state.clone();
                tauri::async_runtime::spawn(async move {
                    toggle_recording(app, state).await;
                });
            }
        })
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// 録音トグルロジック
// ---------------------------------------------------------------------------

async fn toggle_recording(app: tauri::AppHandle, state: SharedState) {
    let is_recording = {
        let s = state.lock().unwrap();
        s.recording
    };

    if !is_recording {
        // 録音開始
        {
            let mut s = state.lock().unwrap();
            s.recording = true;
            s.audio_samples.clear();
        }
        let _ = app.emit("recording-started", ());
        audio::start_recording(state.clone());
    } else {
        // 録音停止
        {
            let mut s = state.lock().unwrap();
            s.recording = false;
        }
        let _ = app.emit("recording-stopped", ());

        let samples = {
            let s = state.lock().unwrap();
            s.audio_samples.clone()
        };

        // WAV 書き出し
        let wav_path = match audio::save_wav(&samples) {
            Ok(p) => p,
            Err(e) => {
                let _ = app.emit("transcription-error", e.to_string());
                return;
            }
        };

        let _ = app.emit("transcribing", ());

        // Whisper 推論（blocking スレッド）
        match transcribe::run_whisper(&wav_path, &app).await {
            Ok(text) => {
                let _ = app.emit("transcription-complete", text);
            }
            Err(e) => {
                let _ = app.emit("transcription-error", e.to_string());
            }
        }
    }
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

pub fn run() {
    let state: SharedState = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state.clone())
        .setup(move |app| {
            // ストアから保存済みショートカットを読み込み、なければデフォルトを使用
            let shortcut = app
                .handle()
                .store("config.json")
                .ok()
                .and_then(|s| s.get("shortcut"))
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string());

            if let Err(e) = register_shortcut(app.handle(), &shortcut, state.clone()) {
                eprintln!("ショートカット登録失敗 ({}): {} — デフォルトで再試行", shortcut, e);
                let _ = register_shortcut(app.handle(), DEFAULT_SHORTCUT, state.clone());
            }

            // システムトレイ
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Koe — 日本語音声入力")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // ウィンドウを閉じてもトレイに残す（Windows/macOS）
            let win = app.get_webview_window("main").unwrap();
            let win_clone = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                }
            });

            // 音声レベルをフローティングウィンドウに50ms間隔で送信
            let app_handle = app.handle().clone();
            let level_state = state.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    let level = {
                        let s = level_state.lock().unwrap();
                        if s.recording { s.audio_level } else { 0.0 }
                    };
                    let _ = app_handle.emit("audio-level", level);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            paste_text,
            download_model,
            download_whisper_bin,
            update_shortcut,
            toggle_recording_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
