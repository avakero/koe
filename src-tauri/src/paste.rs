use arboard::Clipboard;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use std::time::Duration;

/// テキストをクリップボードにセットし、前面ウィンドウへ Ctrl+V (macOS: Cmd+V) を送信する。
///
/// # macOS 注意
/// enigo の macOS 実装は Tauri と同一スレッドで呼ぶとクラッシュする場合がある。
/// lib.rs 側で `std::thread::spawn` でラップしてこの関数を呼ぶこと。
pub fn paste_text_to_foreground(text: String) -> Result<(), Box<dyn std::error::Error>> {
    // 1. クリップボードにセット
    let mut clipboard = Clipboard::new()?;
    clipboard.set_text(text)?;

    // 2. フォーカス切り替えが完了するまで少し待つ
    std::thread::sleep(Duration::from_millis(200));

    // 3. Paste キーシミュレーション (enigo 0.2 API)
    let mut enigo = Enigo::new(&Settings::default())?;

    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Press)?;
        enigo.key(Key::Unicode('v'), Click)?;
        enigo.key(Key::Meta, Release)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo.key(Key::Control, Press)?;
        enigo.key(Key::Unicode('v'), Click)?;
        enigo.key(Key::Control, Release)?;
    }

    Ok(())
}
