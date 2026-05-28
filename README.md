# memory.ai

> A voice-first AI journaling app that captures your thoughts and routes them into your Obsidian vault as structured, Dataview-queryable Zettelkasten notes.

Built for Android as a native APK using React Native + Expo bare workflow.

---

## Install (No Build Required)

> **Quickest path** — no Android Studio or build tools needed.

1. Go to the [**Releases page**](https://github.com/oneplusiota/memory-ai/releases) and download the latest `memory-ai-vX.X.X.apk`
2. On your Android phone: **Settings → Apps → Special app access → Install unknown apps** → allow your browser or Files app to install APKs
3. Open the downloaded APK and tap **Install**
4. Launch **memory.ai** → **Settings (⚙️)** → enter your API key → pick your Obsidian vault folder

> **Note on Google Sign-In**: The pre-built APK uses a CI-generated keystore, so Google Sign-In won't work via the pre-built APK. This is fine — Sign-In is identity-only and **not required**. All AI features and vault sync work without it.

---

## Features

- 🎙️ **Tap-to-record** — live, editable transcript with continuous Android STT
- 🧠 **AI conversation** — chat with an assistant that knows your notes (answers questions, acknowledges captures)
- 📝 **Smart routing** — AI decides whether to log, update an atom, or create a new note
- 📂 **Obsidian-native structure** — `daily/`, `atoms/`, `conversations/` folders with Dataview-compatible frontmatter
- 🔍 **Local search** — on-device TF-IDF + wikilink graph, no API calls for indexing
- 📚 **Conversation history** — every session saved to your vault, viewable in-app
- 🔄 **Dual LLM provider** — Gemini (1,500 req/day free) or Groq/Llama 3.3 70B (14,400 req/day free)
- ✏️ **Edit while speaking** — fix words in real-time before sending

---

## Architecture

```
Voice Input (Android STT)
        ↓
Live Editable Transcript
        ↓
Send Message → Hybrid Search (TF-IDF + wikilink graph)
        ↓
LLM Chat (Gemini / Groq) + Vault Context
        ↓
AI Response displayed in chat
        ↓
[Optional] Save to Vault
        ↓
RoutingDecision JSON → appendToDailyNote() + createAtom/updateAtom()
        ↓
Re-index changed files in-memory
```

### Vault Structure

```
vault/
├── daily/
│   └── 2026-05-28.md          # One per day, ISO week in frontmatter
├── atoms/
│   ├── James-Smith.md          # type: person, area: work, status: active
│   └── Q3-Roadmap.md           # type: project, status: active
└── conversations/
    └── 2026-05-28-had-a-meeting.md
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
| Platform | Android only (APK) |
| File access | `expo-file-system` Storage Access Framework |
| Voice STT | `expo-speech-recognition` (Android native, continuous) |
| Audio STT | `expo-audio` (for Gemini Audio mode) |
| AI — Gemini | `generativelanguage.googleapis.com` REST |
| AI — Groq | `api.groq.com/openai/v1` (OpenAI-compatible) |
| Local search | In-memory TF-IDF + BFS wikilink graph |
| UI | React Native Paper + React Native Reanimated |
| Navigation | React Navigation stack |
| Storage | `expo-secure-store` for keys/settings |

---

## Getting API Keys

### Gemini (Google AI Studio) — Free, 1,500 req/day
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key** → **Create API key**
3. Copy the key — no credit card required

### Groq — Free, ~14,400 req/day (Llama 3.3 70B)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up → **API Keys** → **Create API key**
3. Copy the key — no credit card required

---

## Setup & Build

### Prerequisites

- macOS (for Android build toolchain)
- [Android Studio](https://developer.android.com/studio) with Android SDK 36
- Java 17 (via `jenv` or Android Studio's bundled JDK)
- Node.js 20+
- An Android device or emulator with API 24+

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

### 3. Firebase / Google Sign-In setup (one-time)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add Android app → package name `com.memoryai.app`
3. Add your debug SHA-1 (from `keytool -keystore ~/.android/debug.keystore -list -v -storepass android`)
4. Download `google-services.json` → place at `android/app/google-services.json`

### 4. Build and install

```bash
# Create debug keystore (first time only)
mkdir -p ~/.android
keytool -genkey -v -keystore ~/.android/debug.keystore \
  -storepass android -alias androiddebugkey -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"

# Copy to android/app/
cp ~/.android/debug.keystore android/app/debug.keystore

# Create local.properties
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

# Build and install
npx expo run:android --device
```

### 5. First launch

1. Open **Settings** (⚙️ icon)
2. Enter your **Gemini** or **Groq** API key → Save
3. Tap **Pick Vault Folder** → select your Obsidian vault
4. Wait for indexing to complete
5. Start talking 🎙️

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

## STT Modes

| Mode | Description | Speed | Accuracy |
|---|---|---|---|
| Native Android STT | Uses Android's built-in recognizer | Fast | Good |
| Gemini Audio | Sends audio to Gemini for transcription | ~1-2s | Best |
| Native + AI Correction | Native speed, Gemini cleans up errors | ~1s overhead | Better |

Switch in **Settings → Voice Transcription**.

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
| `GOOGLE_SERVICES_JSON` | `base64 -i android/app/google-services.json \| pbcopy` then paste in GitHub → Settings → Secrets → Actions |

---

## License

MIT — see [LICENSE](LICENSE)
