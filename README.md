# memory.ai

> A quick-capture, voice-first notes app for Android. Tap the mic, talk, tap again — it's saved and instantly searchable, entirely on your phone. Tuned for the OnePlus 15.

Built for Android as a native APK using React Native + Expo bare workflow.

---

## Table of Contents

- [Install](#install-no-build-required)
- [Features](#features)
- [LLM Providers](#llm-providers)
- [Assistant tools](#assistant-tools)
- [Voice input](#voice-input)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting API Keys](#getting-api-keys)
- [Setup & Build](#setup--build)
- [Releasing a New APK](#releasing-a-new-apk)

---

## Install (No Build Required)

> **Quickest path** — no Android Studio or build tools needed.

1. Go to the [**Releases page**](https://github.com/oneplusiota/memory-ai/releases) and download the latest `memory-ai-vX.X.X.apk`
2. On your Android phone: **Settings → Apps → Special app access → Install unknown apps** → allow your browser or Files app
3. Open the downloaded APK and tap **Install**
4. Launch **memory.ai**. Capture works immediately. For the Ask chat, open **Settings (⚙️)** and enter an API key (OpenRouter's free models need no card)

---

## Features

- 🎙️ **One-tap capture** — tap the mic, talk, tap again: the entry is saved. Continuous Android speech recognition that restarts on silence and falls back to on-device recognition offline
- 🔍 **Instant full-text search** — SQLite FTS5 over every entry: stemming, prefix matching and BM25 ranking, fully on-device
- 💬 **Ask your entries** — chat with an assistant that searches your entries to answer (works with free OpenRouter models)
- 📥 **Import from Obsidian** — one-time import of an existing vault, one entry per note
- 🔒 **Local-first** — everything lives in a SQLite database on the phone

---

## LLM Providers

Providers are adapters behind one factory (`LLMAdapterFactory`). Four are built in:

### OpenRouter (default) — free models

One key gives access to the free model pool. Pick **Free Models Router** (`openrouter/free`, auto-selects an available free model), one of the listed `:free` models, or choose **Custom model…** and paste any model id from [openrouter.ai/models](https://openrouter.ai/models?max_price=0). The free catalogue rotates often, so a model id that stops working just needs swapping. The Ask chat needs a model with tool-calling support; the listed models have it.

### Gemini (Google AI Studio)

Gemini 2.5 Flash / Flash-Lite (free tier), Gemini 3 Flash (preview), Gemini 2.5 Pro (paid).

### Groq

Llama 3.3 70B, GPT-OSS 120B / 20B, Llama 4 Scout, Qwen3 32B, Llama 3.1 8B (free tier); Kimi K2 (paid).

### Claude (Anthropic)

Haiku 4.5, Sonnet 4.6, Opus 4.8 — pay-per-use.

★ = paid / gated model. If your key lacks access, the app shows a clear error and prompts you to switch.

---

## Assistant tools

The assistant is read-only; entries are only created by capturing.

| Tool | Description |
|---|---|
| `search_entries` | Full-text search over your entries |
| `recent_entries` | Most recent entries, newest first |
| `get_date_time` | Current date and time |

---

## Voice input

Uses Android's built-in speech recognizer (Google voice typing on the OnePlus 15) in continuous mode:

- Restarts itself after silence, so the mic stays open while you think
- Falls back to on-device recognition when you're offline
- Stopping waits for the recognizer's last words before sending, so the final sentence is never dropped
- Releases the mic when you leave the app

If voice does nothing, make sure **Google** ("Speech Recognition & Synthesis Services by Google") is enabled as the voice input service in Android settings.

---

## Architecture

```
Mic (Android STT) or keyboard
        ↓
EntryDB (SQLite: entries + FTS5 index, triggers keep it in sync)
        ↓
Home: list · search · edit · delete
        ↓
Ask: AgentClient tool loop → search_entries / recent_entries
        ↓
LLMClient → OpenRouter · Gemini · Groq · Claude adapters
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React Native + Expo bare workflow |
| Platform | Android (APK) |
| File access | `expo-file-system` Storage Access Framework |
| Voice STT | `expo-speech-recognition` (Android native, continuous) |
| LLM | `LLMAdapterFactory` — OpenRouter, Gemini, Groq, Claude adapters |
| Agent loop | Custom `AgentClient` with tool-calling |
| Storage & search | `expo-sqlite` with FTS5 (porter stemming, BM25) |
| UI | React Native Paper + React Native Reanimated |
| Navigation | React Navigation stack |
| Storage | `expo-secure-store` for API keys & settings |

---

## Getting API Keys

### OpenRouter — free models
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) → **Create key**
2. Pick a `:free` model (or `openrouter/free`) in Settings. Free models are rate-limited, with a daily cap unless your account has credit.

### Gemini — Free tier (1,500 req/day)
1. Go to [aistudio.google.com](https://aistudio.google.com) → **Get API key** → **Create API key**
2. No credit card required for the free tier

### Groq — Free tier (~14,400 req/day)
1. Go to [console.groq.com](https://console.groq.com) → Sign up → **API Keys** → **Create API key**
2. No credit card required for the free tier

### Claude (Anthropic) — Pay-per-use
1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → **Create Key**
2. Requires a funded account; see [Anthropic pricing](https://www.anthropic.com/pricing)

---

## Setup & Build

### Prerequisites

- macOS
- [Android Studio](https://developer.android.com/studio) with Android SDK 36
- Java 17 (via Android Studio's bundled JDK or `jenv`)
- Node.js 20+
- An Android device or emulator (API 24+)

### 1. Clone and install

```bash
git clone https://github.com/oneplusiota/memory-ai.git
cd memory-ai
npm install
```

### 2. Android SDK environment

Add to `~/.config/fish/config.fish` (or your shell rc):
```fish
set -x ANDROID_HOME "$HOME/Library/Android/sdk"
set -x PATH $PATH $ANDROID_HOME/platform-tools $ANDROID_HOME/emulator
set -x JAVA_HOME "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

### 3. Build and run

```bash
# Create debug keystore (first time only)
mkdir -p ~/.android
keytool -genkey -v -keystore ~/.android/debug.keystore \
  -storepass android -alias androiddebugkey -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"

cp ~/.android/debug.keystore android/app/debug.keystore
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

npx expo run:android --device
```

### 4. First launch

1. Tap the mic and say something, then tap again — it's saved. No setup needed
2. To use **Ask** (💬), open **Settings** (⚙️), pick an **LLM Provider** (OpenRouter is the default) and enter an API key
3. Optional: **Settings → Import from Obsidian vault** brings in existing notes, one entry per note

---

## Releasing a New APK

Tag the commit and push — GitHub Actions builds and attaches the APK automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow is in `.github/workflows/build.yml` and needs no secrets.
