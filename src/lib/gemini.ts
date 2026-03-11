import { Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;
async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load("config.json");
  }
  return _store;
}

export async function getApiKey(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("gemini_api_key")) ?? null;
}

export async function saveApiKey(key: string): Promise<void> {
  const store = await getStore();
  await store.set("gemini_api_key", key);
  await store.save();
}

export async function getShortcut(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("shortcut")) ?? "Ctrl+Shift+K";
}

export async function saveShortcut(shortcut: string): Promise<void> {
  const store = await getStore();
  await store.set("shortcut", shortcut);
  await store.save();
}

export async function getModel(): Promise<"small" | "medium" | "large"> {
  const store = await getStore();
  return ((await store.get<string>("model")) ?? "small") as "small" | "medium" | "large";
}

export async function saveModel(model: "small" | "medium" | "large"): Promise<void> {
  const store = await getStore();
  await store.set("model", model);
  await store.save();
}

export async function getAccentColor(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("accentColor")) ?? "ocean";
}

export async function saveAccentColor(color: string): Promise<void> {
  const store = await getStore();
  await store.set("accentColor", color);
  await store.save();
}

/**
 * Gemini API を呼び出して日本語テキストを整形する。
 * APIキーが未設定の場合は Error をスローする（呼び出し元でスキップ処理を行う）。
 */
export async function formatWithGemini(rawText: string): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Gemini APIキーが設定されていません");
  }

  const prompt =
    `以下の音声認識テキストから不要なフィラーワード（「えー」「あの」「まあ」「えっと」など）を取り除き、` +
    `適切な句読点を付けた自然な日本語にしてください。テキストのみを返してください。\n\n${rawText}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.candidates[0].content.parts[0].text as string).trim();
}
