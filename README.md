# TSJ Play

A 10-foot TV video library for YouTube content, built to be used from the couch with an **air mouse remote** (gyro pointer + D-pad + mic). Videos are added and classified from an admin page; the TV page plays them, tracks progress, and takes ratings, saves and notes, all from the remote or by voice in English or Sinhala.

- **TV interface:** `http://localhost:3000/tv`
- **Admin:** `http://localhost:3000/admin`

---

## Using the remote

Both remote styles work, and you can switch at any time. Moving the air-mouse pointer highlights whatever it hovers. Pressing a D-pad key continues from that same spot and hides the cursor.

| Remote button | Action |
| --- | --- |
| D-pad ← ↑ → ↓ | Move the highlight |
| OK / Enter / left-click | Select |
| Back (right-click, Esc, Backspace, browser Back) | Go back one step: note → full screen → player → filters → home |
| Home | Close everything and return to Home |
| Menu | Toggle Explore |
| Page ↑ / ↓ (Channel ↑ / ↓) | Scroll a page |
| Mic key (Search key) or `V` | Push-to-talk voice command |

**While a video is playing:**

| Key | Action |
| --- | --- |
| `K`, Play/Pause media key | Play / pause |
| `J` / `L`, ⏪ / ⏩ media keys | Back / forward 10 seconds |
| `F` (or double-click the video) | Full screen |
| `M` | Mute |
| `1`–`5`, `0` | Rate 1–5 stars / clear rating |
| `S` or `A` | Save to library |
| `N` | Add a note at the current time |

Clicking the video toggles play/pause. YouTube's own controls and links are blocked, so the remote never gets stuck inside the YouTube frame.

## Voice commands

Press the mic (or turn on **Hands-free** for always-listening). Use the **EN / සිං** button to switch the recognition language.

| Say | Effect |
| --- | --- |
| "Play video 3", "Play *meditation*" | Open a video (numbers match the #1, #2 badges) |
| "Pause", "Resume", "Forward", "Rewind", "Mute", "Full screen" | Player controls |
| "Rate 5 stars", "තරු 4", "විශිෂ්ටයි" | Rate the open video |
| "Save this video", "Unsave" | Save / remove from library |
| "Take note *great explanation here*", "සටහනක් ලියන්න ..." | Save a timestamped note |
| "Show 5 star videos", "Show saved videos", "Show history", "Search *dhamma*" | Filter the library |
| "Go home", "Go back", "ආපසු" | Return to Home |

Common commands are matched instantly on the server. Anything else goes to Gemini if `GEMINI_API_KEY` is set. Voice recognition needs **Chrome or Edge** and an internet connection.

---

## Setup

Requirements: Node.js 20+, and Chrome or Edge.

```bash
npm install
cp .env.example .env         # then fill in GEMINI_API_KEY (optional)
npx prisma db push           # create / update the SQLite database
npm run db:seed              # optional: sample videos (only runs on an empty library)
npm run dev                  # http://localhost:3000/tv
```

`npm run db:seed -- --force` replaces **all** videos and notes with the samples.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file, default `file:./dev.db` |
| `GEMINI_API_KEY` | Optional. Enables AI classification and free-form voice commands; rule-based fallback otherwise |
| `GEMINI_MODEL` | Optional model override |
| `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*` | Optional. Store author images in Firebase Storage instead of `public/uploads` |

---

## TV kiosk (Windows)

```bash
npm run build                # once, and again after updating the code
```

Then run `launch-tv-kiosk.bat`. It:

1. Starts the production server (or the dev server if no build exists) and waits until it responds.
2. Opens Chrome/Edge full screen in kiosk mode at `/tv`, with a persistent profile, autoplay with sound, and the microphone pre-approved (no permission popup on the TV).

**Start automatically at boot:** press `Win + R`, type `shell:startup`, and put a shortcut to `launch-tv-kiosk.bat` in that folder. Set the TV as the primary display in Windows display settings. Exit kiosk mode with `Alt + F4`.

---

## Project structure

```
app/tv/page.tsx                 TV home: feed, filters, search, explore, voice command handling
app/admin/                      Library management (desktop)
app/api/                        REST routes (videos, notes, authors, categories, AI command, sync)
components/TVPlayerModal.tsx    Player with TV controls, rating, saving and notes
components/VoiceAssistant.tsx   Speech recognition, hands-free mode, spoken feedback
components/tv/                  Nav rail, video cards, explore view, shared UI
hooks/useTVRemoteNavigation.ts  D-pad spatial navigation, Back stack, pointer/D-pad switching
lib/gemini.ts                   Voice command parser + video classification
prisma/schema.prisma            Database schema
```

Scripts: `dev`, `build`, `start`, `db:push`, `db:seed`, `prisma:studio`.
