# memory.ai

> A quick-capture, voice-first note-taking app for Android. Tap the mic, talk, and the AI files your thoughts into your Obsidian vault as structured, Dataview-queryable notes. Tuned for the OnePlus 15.

Built for Android as a native APK using React Native + Expo bare workflow.

---

## Table of Contents

- [Install](#install-no-build-required)
- [Features](#features)
- [LLM Providers](#llm-providers)
- [AI Tools](#ai-tools)
- [Voice input](#voice-input)
- [Architecture](#architecture)
- [Vault Structure](#vault-structure)
- [Tech Stack](#tech-stack)
- [Getting API Keys](#getting-api-keys)
- [Setup & Build](#setup--build)
- [Note Schema Reference](#note-schema-reference)
- [Releasing a New APK](#releasing-a-new-apk)

---

## Install (No Build Required)

> **Quickest path** — no Android Studio or build tools needed.

1. Go to the [**Releases page**](https://github.com/oneplusiota/memory-ai/releases) and download the latest `memory-ai-vX.X.X.apk`
2. On your Android phone: **Settings → Apps → Special app access → Install unknown apps** → allow your browser or Files app
3. Open the downloaded APK and tap **Install**
4. Launch **memory.ai** → **Settings (⚙️)** → enter your API key (OpenRouter's free models need no card) → pick your Obsidian vault folder

---

## Features

- 🎙️ **Tap-to-record** — big thumb-reach mic button, live editable transcript, continuous Android STT that restarts on silence and falls back to on-device recognition offline
- 🧠 **AI assistant** — chat with an assistant that can search your notes and answer from them
- 🤖 **Tool calling** — the AI can search your vault, read, create and update notes (writes ask for confirmation)
- 📂 **Obsidian-compatible vault** — `daily/` and `atoms/` notes with Dataview-friendly frontmatter
- 🔍 **Local search** — on-device keyword search over your index, no API calls for indexing
- 🔄 **Multi-provider LLM** — OpenRouter (free models), Gemini, Groq, or Claude
- ✏️ **Edit while speaking** — fix words in real-time before sending

---

## LLM Providers

Providers are adapters behind one factory (`LLMAdapterFactory`). Four are built in:

### OpenRouter (default) — free models

One key gives access to the free model pool. Pick **Free Models Router** (`openrouter/free`, auto-selects an available free model), one of the listed `:free` models, or choose **Custom model…** and paste any model id from [openrouter.ai/models](https://openrouter.ai/models?max_price=0). The free catalogue rotates often, so a model id that stops working just needs swapping. Agentic vault tools need a model with tool-calling support; the listed models have it.

### Gemini (Google AI Studio)

Gemini 2.5 Flash / Flash-Lite (free tier), Gemini 3 Flash (preview), Gemini 2.5 Pro (paid).

### Groq

Llama 3.3 70B, GPT-OSS 120B / 20B, Llama 4 Scout, Qwen3 32B, Llama 3.1 8B (free tier); Kimi K2 (paid).

### Claude (Anthropic)

Haiku 4.5, Sonnet 4.6, Opus 4.8 — pay-per-use.

★ = paid / gated model. If your key lacks access, the app shows a clear error and prompts you to switch.

---

## AI Tools

When a vault is connected, the AI can call tools during a conversation:

| Tool | Description |
|---|---|
| `search_vault` | Keyword search across your notes |
| `read_note` | Read a specific note by path |
| `create_note` | Create a new note (asks for confirmation) |
| `update_note` | Append to an existing note (asks for confirmation) |
| `append_daily_note` | Add a log entry to today's daily note |
| `list_notes` | List notes filtered by type or tag |
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
Voice Input (Android STT)
        ↓
Live Editable Transcript
        ↓
Send Message
        ↓
AgentClient — tool-calling loop
  ├── search_vault  → keyword search over the local index
  ├── read_note     → VaultScanner + MarkdownParser
  └── create/update → VaultWriter (confirm before write)
        ↓
LLMClient (provider-agnostic façade)
  └── LLMAdapterFactory
        ├── GeminiAdapter      (generativelanguage.googleapis.com)
        ├── OpenAICompat       (Groq + OpenRouter)
        └── ClaudeAdapter      (api.anthropic.com)
        ↓
AI Response displayed in chat
```

---

## Vault Structure

```
vault/
├── daily/
│   └── 2026-05-28.md          # One per day, ISO week in frontmatter
└── atoms/
    ├── James-Smith.md          # type: person, area: work, status: active
    └── Q3-Roadmap.md           # type: project, status: active
```

**Dataview queries this enables:**
```dataview
TABLE type, area, status FROM "atoms" WHERE status = "active"
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
| Local search | SQLite index + keyword scoring |
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

1. Open **Settings** (⚙️ icon)
2. Choose your **LLM Provider** (OpenRouter is the default) and enter your API key
3. Select a **model** (free models are listed first)
4. Tap **Pick Vault Folder** → select your Obsidian vault
5. Wait for indexing to complete
6. Start talking 🎙️

---

## Note Schema Reference

### Atom note (`atoms/Note-Name.md`)
```yaml
---
title: James Smith
type: person          # person | project | concept | decision | area | tool
area: work            # work | personal | health | finance | learning | other
status: active        # active | dormant | archived
tags: [engineering]
date: 2026-05-28
updated: 2026-05-28
aliases: [James]
---
```

### Daily note (`daily/YYYY-MM-DD.md`)
```yaml
---
title: 2026-05-28
type: daily
date: 2026-05-28
week: "2026-W22"
tags: [daily]
---

## 09:30
Had 1:1 with [[James Smith]]. Updated [[Q3-Roadmap]].
- [ ] Follow up on deadline
```

---
title: "Had a 1:1 with James"
type: conversation
date: 2026-05-28
time: 09:30
topics: ["[[James Smith]]", "[[Q3-Roadmap]]"]
saved_to_vault: true
tags: [conversation]
---
```

---

## Releasing a New APK

Tag the commit and push — GitHub Actions builds and attaches the APK automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow is in `.github/workflows/build.yml` and needs no secrets.
