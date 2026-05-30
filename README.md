# memory.ai

> A voice-first AI journaling app that captures your thoughts and routes them into your Obsidian vault as structured, Dataview-queryable Zettelkasten notes.

Built for Android as a native APK using React Native + Expo bare workflow.

---

## Table of Contents

- [Install](#install-no-build-required)
- [Features](#features)
- [LLM Providers](#llm-providers)
- [AI Tools](#ai-tools)
- [STT Modes](#stt-modes)
- [Architecture](#architecture)
- [Vault Structure](#vault-structure)
- [Tech Stack](#tech-stack)
- [Getting API Keys](#getting-api-keys)
- [Setup & Build](#setup--build)
- [Note Schema Reference](#note-schema-reference)
- [Releasing a New APK](#releasing-a-new-apk)
- [License](#license)

---

## Install (No Build Required)

> **Quickest path** — no Android Studio or build tools needed.

1. Go to the [**Releases page**](https://github.com/oneplusiota/memory-ai/releases) and download the latest `memory-ai-vX.X.X.apk`
2. On your Android phone: **Settings → Apps → Special app access → Install unknown apps** → allow your browser or Files app
3. Open the downloaded APK and tap **Install**
4. Launch **memory.ai** → **Settings (⚙️)** → enter your API key → pick your Obsidian vault folder

> **Note on Google Sign-In**: The pre-built APK uses a CI-generated keystore, so Google Sign-In won't work. Sign-In is identity-only and **not required** — all AI features and vault sync work without it.

---

## Features

- 🎙️ **Tap-to-record** — live, editable transcript with continuous Android STT; auto-restarts on silence
- 🧠 **AI conversation** — chat with an assistant that knows your notes (answers questions, acknowledges captures)
- 🤖 **Agentic tool calling** — AI can search your vault, read/create/update notes, and search the web during a conversation
- 📝 **Smart routing** — AI decides whether to log to the daily note, update an existing atom, or create a new one
- 📂 **Obsidian-native structure** — `daily/`, `atoms/`, `conversations/` with Dataview-compatible frontmatter
- 🔍 **Local hybrid search** — on-device TF-IDF + wikilink graph, no API calls for indexing
- 📚 **Conversation history** — every session saved to your vault, viewable in-app
- 🔄 **Multi-provider LLM** — Gemini, Groq, or Claude; free and paid models; factory-pattern architecture for easy extensibility
- 🛠️ **Custom tools** — define your own tools as `.tool.md` files in your vault
- ✏️ **Edit while speaking** — fix words in real-time before sending

---

## LLM Providers

memory.ai uses a **factory pattern** — providers are registered adapters, making it trivial to add new ones. Three providers are built in:

### Gemini (Google AI Studio)

| Model | Tier | Notes |
|---|---|---|
| Gemini 2.0 Flash | Free · 1,500/day | Recommended default |
| Gemini 2.5 Flash | Free · 500/day | Most capable free model |
| Gemini 1.5 Flash | Free · 1,500/day | Legacy |
| Gemini 2.5 Pro ★ | Paid | Best reasoning & coding |
| Gemini 1.5 Pro ★ | Paid | 1M context window |
| Gemini 2.0 Flash Thinking ★ | Paid | Extended thinking |

### Groq

| Model | Tier | Notes |
|---|---|---|
| Llama 3.3 70B Versatile | Free | Recommended default |
| Llama 3.1 8B Instant | Free | Fastest / lowest latency |
| Llama 3 70B / 8B | Free | 8k context |
| Mixtral 8x7B | Free | 32k context |
| Gemma 2 9B | Free | Google instruction-tuned |
| Llama 3.3 70B SpecDec ★ | Paid | Speculative decoding |
| Llama 3.2 90B Vision ★ | Paid | Multimodal |
| DeepSeek R1 70B ★ | Paid | Chain-of-thought reasoning |
| Qwen QwQ 32B ★ | Paid | Strong reasoning |
| Kimi K2 ★ | Paid | Agentic & tool use |

### Claude (Anthropic)

| Model | Tier | Notes |
|---|---|---|
| Claude Haiku 4.5 | Paid | Cheapest & fastest |
| Claude Sonnet 4.6 | Paid | Balanced · recommended |
| Claude Opus 4.8 ★ | Paid | Most capable · highest cost |

★ = paid / gated model. If your API key doesn't have access, the app shows a clear error message and prompts you to switch models.

---

## AI Tools

When a vault is connected, the AI runs in **agentic mode** and can call tools during a conversation:

| Tool | Description |
|---|---|
| `search_vault` | Hybrid TF-IDF + graph search across your notes |
| `read_note` | Read a specific note by path |
| `create_note` | Create a new atom note |
| `update_note` | Update an existing note |
| `list_notes` | List notes filtered by type/area/status |
| `get_date_time` | Current date and time |
| `web_search` | Search the web (Tavily or Serper/Google) |
| `get_calendar_events` | Read upcoming Google Calendar events |
| `create_calendar_event` | Create a calendar event (requires confirmation) |
| Custom `.tool.md` | User-defined tools stored in `vault/tools/` |

**Agent modes** (configurable in Settings):
- **Agentic loop** — AI calls tools in sequence until the task is complete
- **Single call** — one round of tool calls, then stops

Write operations (create/update note, create event) always ask for confirmation before executing.

---

## STT Modes

| Mode | Speed | Accuracy | Notes |
|---|---|---|---|
| Native Android STT | Fast | Good | Default; continuous, auto-restarts on silence |
| Gemini Audio | ~1–2 s | Best | Sends audio file to Gemini for transcription |
| Native + AI Correction | ~1 s overhead | Better | Native speed + Gemini cleanup pass |

Switch in **Settings → Voice**.

---

## Architecture

```
Voice Input (Android STT / Gemini Audio)
        ↓
Live Editable Transcript
        ↓
Send Message
        ↓
AgentClient — agentic tool-calling loop
  ├── search_vault  → HybridSearch (TF-IDF + wikilink graph)
  ├── read_note     → VaultScanner + MarkdownParser
  ├── create/update → VaultWriter (confirm before write)
  ├── web_search    → Tavily / Serper (Google) API
  └── calendar      → Google Calendar API
        ↓
LLMClient (provider-agnostic façade)
  └── LLMAdapterFactory
        ├── GeminiAdapter   (generativelanguage.googleapis.com)
        ├── GroqAdapter     (api.groq.com — OpenAI-compatible)
        └── ClaudeAdapter   (api.anthropic.com)
        ↓
AI Response displayed in chat
        ↓
[Optional] Save to Vault
        ↓
RoutingDecision JSON → appendToDailyNote() + createAtom/updateAtom()
        ↓
Re-index changed files in-memory
```

---

## Vault Structure

```
vault/
├── daily/
│   └── 2026-05-28.md          # One per day, ISO week in frontmatter
├── atoms/
│   ├── James-Smith.md          # type: person, area: work, status: active
│   └── Q3-Roadmap.md           # type: project, status: active
├── conversations/
│   └── 2026-05-28-had-a-meeting.md
└── tools/                      # Optional custom tool definitions
    └── MyTool.tool.md
```

**Dataview queries this enables:**
```dataview
TABLE type, area, status FROM "atoms" WHERE status = "active"
```
```dataview
LIST FROM "conversations" WHERE saved_to_vault = true
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React Native + Expo bare workflow |
| Platform | Android (APK) |
| File access | `expo-file-system` Storage Access Framework |
| Voice STT | `expo-speech-recognition` (Android native, continuous) |
| Audio STT | `expo-audio` (for Gemini Audio mode) |
| LLM | `LLMAdapterFactory` — Gemini, Groq, Claude adapters |
| Agent loop | Custom `AgentClient` with tool-calling |
| Local search | In-memory TF-IDF + BFS wikilink graph |
| UI | React Native Paper + React Native Reanimated |
| Navigation | React Navigation stack |
| Storage | `expo-secure-store` for API keys & settings |

---

## Getting API Keys

### Gemini — Free tier (1,500 req/day)
1. Go to [aistudio.google.com](https://aistudio.google.com) → **Get API key** → **Create API key**
2. No credit card required for the free tier

### Groq — Free tier (~14,400 req/day)
1. Go to [console.groq.com](https://console.groq.com) → Sign up → **API Keys** → **Create API key**
2. No credit card required for the free tier

### Claude (Anthropic) — Pay-per-use
1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → **Create Key**
2. Requires a funded account; see [Anthropic pricing](https://www.anthropic.com/pricing)

### Tavily (web search) — Free tier (1,000 searches/month)
1. Go to [app.tavily.com](https://app.tavily.com) → Sign up → copy your API key

### Serper (web search alternative — real Google results) — Free tier (2,500 queries/month)
1. Go to [serper.dev](https://serper.dev) → Sign up → **API Keys** → copy your key
2. Enter it in Settings → Web Search → Serper (Google)

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

### 3. Firebase / Google Sign-In setup (one-time, optional)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add Android app → package name `com.memoryai.app`
3. Add your debug SHA-1: `keytool -keystore ~/.android/debug.keystore -list -v -storepass android`
4. Download `google-services.json` → place at `android/app/google-services.json`

### 4. Build and run

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

### 5. First launch

1. Open **Settings** (⚙️ icon)
2. Choose your **LLM Provider** (Gemini, Groq, or Claude) and enter your API key
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

### Conversation file (`conversations/YYYY-MM-DD-slug.md`)
```yaml
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

The workflow (`.github/workflows/build.yml`) requires one GitHub secret:

| Secret | How to get it |
|---|---|
| `GOOGLE_SERVICES_JSON` | `base64 -i android/app/google-services.json \| pbcopy` → paste in GitHub → Settings → Secrets → Actions |
