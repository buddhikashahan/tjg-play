import { GoogleGenAI } from "@google/genai";
import { AICommandResponse } from "./types";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Configurable Gemini model (default: gemini-3.5-flash-lite)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export interface ExistingAuthorInfo {
  name: string;
  imageUrl?: string | null;
  bio?: string | null;
}

export interface ExistingCategoryInfo {
  name: string;
  description?: string | null;
}

export interface ClassificationResult {
  author: string;
  authorImageUrl?: string | null;
  isExistingAuthor: boolean;
  subject: string;
  isExistingCategory: boolean;
  tags: string[];
  explanation?: string;
}

function heuristicClassification(
  title: string,
  rawAuthor: string,
  existingAuthors: ExistingAuthorInfo[] = [],
  existingCategories: ExistingCategoryInfo[] = []
): ClassificationResult {
  const text = `${title} ${rawAuthor}`.toLowerCase();
  const tags: Set<string> = new Set(["video"]);

  // 1. Check if matching existing author
  let matchedAuthor = rawAuthor || "Unknown Author";
  let matchedAuthorImage: string | null = null;
  let isExistingAuthor = false;

  for (const ea of existingAuthors) {
    if (!ea.name) continue;
    const nameLower = ea.name.toLowerCase();
    if (text.includes(nameLower) || rawAuthor.toLowerCase().includes(nameLower)) {
      matchedAuthor = ea.name;
      matchedAuthorImage = ea.imageUrl || null;
      isExistingAuthor = true;
      break;
    }
  }

  // 2. Check if matching existing category
  let matchedCategory = "";
  let isExistingCategory = false;

  for (const ec of existingCategories) {
    if (!ec.name) continue;
    const catLower = ec.name.toLowerCase();
    if (text.includes(catLower)) {
      matchedCategory = ec.name;
      isExistingCategory = true;
      break;
    }
  }

  // Fallback category if no existing category matched
  if (!matchedCategory) {
    if (text.includes("dhamma") || text.includes("buddha") || text.includes("sutta") || text.includes("දේශනා") || text.includes("බණ")) {
      matchedCategory = "Dhamma & Philosophy";
      tags.add("dhamma");
      tags.add("buddhism");
    } else if (text.includes("meditation") || text.includes("භාවනා") || text.includes("mindfulness")) {
      matchedCategory = "Meditation & Mindfulness";
      tags.add("meditation");
    } else if (text.includes("nature") || text.includes("wildlife") || text.includes("animal")) {
      matchedCategory = "Nature & Wildlife";
      tags.add("nature");
    } else if (text.includes("space") || text.includes("science") || text.includes("physics")) {
      matchedCategory = "Science & Space";
      tags.add("science");
    } else if (text.includes("music") || text.includes("song") || text.includes("relaxation")) {
      matchedCategory = "Music & Relaxation";
      tags.add("music");
    } else if (text.includes("ai") || text.includes("tech") || text.includes("code")) {
      matchedCategory = "Artificial Intelligence";
      tags.add("ai");
    } else {
      matchedCategory = existingCategories.length > 0 ? existingCategories[0].name : "General";
      if (existingCategories.length > 0) isExistingCategory = true;
    }
  }

  return {
    author: matchedAuthor,
    authorImageUrl: matchedAuthorImage,
    isExistingAuthor,
    subject: matchedCategory,
    isExistingCategory,
    tags: Array.from(tags),
    explanation: isExistingAuthor || isExistingCategory
      ? "Selected based on existing database taxonomy match."
      : "Generated from video metadata.",
  };
}

export async function suggestClassificationWithGemini(
  title: string,
  rawAuthor: string,
  existingAuthors: ExistingAuthorInfo[] = [],
  existingCategories: ExistingCategoryInfo[] = []
): Promise<ClassificationResult> {
  if (!ai || !apiKey) {
    return heuristicClassification(title, rawAuthor, existingAuthors, existingCategories);
  }

  const existingCategoryNames = existingCategories.map((c) => c.name);
  const existingAuthorNames = existingAuthors.map((a) => a.name);

  try {
    const prompt = `You are an AI Video Cataloging Expert for a specialized TV Video Library.
Analyze this YouTube video metadata to classify it accurately and match it against existing library taxonomies:

YOUTUBE VIDEO INFORMATION:
- Video Title: "${title}"
- YouTube Channel / Uploader Name: "${rawAuthor}"

EXISTING CATEGORIES IN DATABASE:
${existingCategoryNames.length > 0 ? JSON.stringify(existingCategoryNames, null, 2) : "[] (No categories exist yet)"}

EXISTING AUTHORS / SPEAKERS IN DATABASE:
${existingAuthorNames.length > 0 ? JSON.stringify(existingAuthorNames, null, 2) : "[] (No authors exist yet)"}

CLASSIFICATION RULES:
1. CATEGORY / SUBJECT:
   - Priority 1: Check if this video's topic fits any of the EXISTING CATEGORIES listed above.
     If an existing category is an accurate match or fits well (e.g. Dhamma sermons, meditation, discussions, science, etc.), YOU MUST PICK THAT EXACT EXISTING CATEGORY NAME from the list above.
   - Priority 2: ONLY if NONE of the existing categories fit or if the category list is empty, create a new, concise category name (Title Case, 2-4 words, e.g. "Dhamma Discourse", "Guided Meditation", "Science & Astronomy").

2. AUTHOR / SPEAKER:
   - YouTube channel names often differ from the actual speaker (e.g. the channel might be "Shraddha TV", "The Buddhist TV", or "Dharmavahini", but the video title mentions the actual revered speaker or monk).
   - Priority 1: Check if the video title or channel name corresponds to one of the EXISTING AUTHORS in the database (matching known spellings or honorifics, e.g. "Ven. Kiribathgoda Gnanananda Thero", "Ven. Nauyane Ariyadhamma Maha Thero", etc.). If there is a match, YOU MUST SELECT THAT EXACT EXISTING AUTHOR NAME.
   - Priority 2: If no existing author matches, determine the actual speaker or primary creator from the title and channel name. Extract a clean, respectful author name (e.g., "Ven. K. Rathanasara Thero", "Dr. Carl Sagan") instead of generic channel noise.

3. TAGS:
   - Provide 3 to 6 relevant lowercase keyword tags (e.g., ["dhamma", "sinhala", "sutta", "meditation"]).

Respond strictly with a valid JSON object matching this schema:
{
  "subject": "exact existing category name OR new category name",
  "isExistingCategory": true or false,
  "author": "exact existing author name OR clean extracted author name",
  "isExistingAuthor": true or false,
  "tags": ["tag1", "tag2", "tag3"],
  "explanation": "Short 1-sentence note explaining the selection"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim() || "";
    const parsed = JSON.parse(text);

    let finalAuthor = (parsed.author || rawAuthor || "Unknown Author").trim();
    let finalSubject = (parsed.subject || "General").trim();
    let isExistingAuthor = Boolean(parsed.isExistingAuthor);
    let isExistingCategory = Boolean(parsed.isExistingCategory);

    // Validate if finalAuthor matches any existing author case-insensitively
    let authorImageUrl: string | null = null;
    const matchedAuthorObj = existingAuthors.find(
      (a) => a.name.toLowerCase() === finalAuthor.toLowerCase()
    );
    if (matchedAuthorObj) {
      finalAuthor = matchedAuthorObj.name; // Use exact canonical casing
      isExistingAuthor = true;
      authorImageUrl = matchedAuthorObj.imageUrl || null;
    }

    // Validate if finalSubject matches any existing category case-insensitively
    const matchedCatObj = existingCategories.find(
      (c) => c.name.toLowerCase() === finalSubject.toLowerCase()
    );
    if (matchedCatObj) {
      finalSubject = matchedCatObj.name; // Use exact canonical casing
      isExistingCategory = true;
    }

    return {
      author: finalAuthor,
      authorImageUrl,
      isExistingAuthor,
      subject: finalSubject,
      isExistingCategory,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: string) => String(t).toLowerCase().trim())
        : ["video"],
      explanation: parsed.explanation || "",
    };
  } catch (err) {
    console.warn("Gemini classification failed or timed out, falling back to heuristics:", err);
    return heuristicClassification(title, rawAuthor, existingAuthors, existingCategories);
  }
}

const STAR_PHRASES: Array<[number, string[]]> = [
  [5, ["5 star", "five star", "rate 5", "rate five", "තරු 5", "තරු පහ", "විශිෂ්ටයි", "සුපිරි"]],
  [4, ["4 star", "four star", "rate 4", "rate four", "තරු 4", "තරු හතර", "හොඳයි"]],
  [3, ["3 star", "three star", "rate 3", "rate three", "තරු 3", "තරු තුන", "සාමාන්‍යයි"]],
  [2, ["2 star", "two star", "rate 2", "rate two", "තරු 2", "තරු දෙක"]],
  [1, ["1 star", "one star", "rate 1", "rate one", "තරු 1", "තරු එක"]],
];

function detectStarRating(lower: string): number | null {
  for (const [stars, phrases] of STAR_PHRASES) {
    if (phrases.some((p) => lower.includes(p))) return stars;
  }
  return null;
}

/**
 * Robust rule-based fallback parser for English and Sinhala commands
 */
function heuristicVoiceParser(
  transcript: string,
  context: {
    availableSubjects?: string[];
    availableAuthors?: string[];
    availableTags?: string[];
    currentVideoTitle?: string;
  }
): AICommandResponse {
  const lower = transcript.toLowerCase().trim();

  // 1. ADD NOTE
  // English: "take note...", "add note...", "note that...", "write note..."
  // Sinhala: "සටහනක් ලියන්න", "සටහනක් දාන්න", "ලියාගන්න", "සටහන"
  if (
    lower.startsWith("take note") ||
    lower.startsWith("add note") ||
    lower.startsWith("note that") ||
    lower.startsWith("write note") ||
    lower.startsWith("make note") ||
    lower.startsWith("note:") ||
    lower.includes("සටහනක්") ||
    lower.includes("ලියාගන්න")
  ) {
    const cleanNote = transcript
      .replace(/^(take note|add note|note that|write note|make note|note|සටහනක් ලියන්න|සටහනක් දාන්න|සටහනක්|ලියාගන්න)[:\s]*/i, "")
      .trim();
    return {
      action: "ADD_NOTE",
      payload: { noteText: cleanNote || transcript },
      feedbackMessage: "Note saved to this video.",
    };
  }

  // "Show 5 star videos" / "show saved videos" are filters, not actions on the current video.
  const isShowIntent = /^(show|filter|list|display|open)\b/.test(lower) || lower.includes("පෙන්වන්න");
  const mentionsSavedList =
    lower.includes("archived") ||
    lower.includes("saved") ||
    lower.includes("ආකයිව් කළ ඒවා") ||
    lower.includes("සුරකින ලද");
  const stars = detectStarRating(lower);

  // 2. 5-STAR RATING (1 to 5 stars)
  if (!isShowIntent && stars !== null) {
    return {
      action: "RATE_CURRENT_VIDEO",
      payload: { ratingVal: stars },
      feedbackMessage: `Rated ${stars} star${stars > 1 ? "s" : ""}.`,
    };
  }

  if (
    lower.includes("remove rating") ||
    lower.includes("clear rating") ||
    lower.includes("unrate") ||
    lower.includes("රේටින්ග් ඉවත්")
  ) {
    return {
      action: "RATE_CURRENT_VIDEO",
      payload: { ratingVal: 0 },
      feedbackMessage: "Rating removed.",
    };
  }

  // 3. ARCHIVING / SAVING
  if (
    lower.includes("unarchive") ||
    lower.includes("remove from archive") ||
    lower.includes("remove from saved") ||
    lower.includes("unsave") ||
    lower.includes("ආකයිව් ඉවත් කරන්න")
  ) {
    return {
      action: "ARCHIVE_CURRENT_VIDEO",
      payload: { archive: false },
      feedbackMessage: "Removed from saved videos.",
    };
  }

  if (
    !isShowIntent &&
    !mentionsSavedList &&
    (lower.includes("archive") ||
      lower.includes("save video") ||
      lower.includes("save this") ||
      lower === "save" ||
      lower.includes("save to library") ||
      lower.includes("bookmark") ||
      lower.includes("ආකයිව්") ||
      lower.includes("සුරකින්න") ||
      lower.includes("සේව් කරන්න"))
  ) {
    return {
      action: "ARCHIVE_CURRENT_VIDEO",
      payload: { archive: true },
      feedbackMessage: "Saved to your library.",
    };
  }

  // 4. PLAYER CONTROLS
  if (
    lower.includes("go home") ||
    lower.includes("home page") ||
    lower.includes("back to list") ||
    lower.includes("close video") ||
    lower.includes("back to grid") ||
    lower === "back" ||
    lower === "go back" ||
    lower.includes("ආපසු") ||
    lower.includes("මුල් පිටුවට")
  ) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "go_home" },
      feedbackMessage: "Going home.",
    };
  }

  if (
    lower === "pause" ||
    lower.includes("pause video") ||
    lower === "stop" ||
    lower.includes("hold on") ||
    lower.includes("නවත්වන්න") ||
    lower.includes("නවතන්න")
  ) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "pause" },
      feedbackMessage: "Video paused.",
    };
  }

  if (
    lower === "play" ||
    lower === "resume" ||
    lower === "continue" ||
    lower.includes("resume video") ||
    lower.includes("නැවත දමන්න") ||
    lower.includes("ප්ලේ කරන්න")
  ) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "play" },
      feedbackMessage: "Resuming playback.",
    };
  }

  if (
    lower.includes("forward") ||
    lower.includes("skip") ||
    lower.includes("fast forward") ||
    lower.includes("ඉදිරියට")
  ) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "forward" },
      feedbackMessage: "Skipping forward 15 seconds.",
    };
  }

  if (
    lower.includes("rewind") ||
    lower.includes("back 10") ||
    lower.includes("back 15") ||
    lower.includes("පස්සට")
  ) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "rewind" },
      feedbackMessage: "Rewinding 15 seconds.",
    };
  }

  if (lower.includes("unmute") || lower.includes("sound on")) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "unmute" },
      feedbackMessage: "Sound unmuted.",
    };
  }

  if (lower.includes("mute") || lower.includes("silence") || lower.includes("sound off") || lower.includes("නිශ්ශබ්ද")) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "mute" },
      feedbackMessage: "Audio muted.",
    };
  }

  if (lower.includes("fullscreen") || lower.includes("full screen") || lower.includes("විශාල තිරය")) {
    return {
      action: "PLAYER_CONTROL",
      payload: { action: "fullscreen" },
      feedbackMessage: "Toggling fullscreen mode.",
    };
  }

  // 5. PLAY SPECIFIC VIDEO
  const numberMatch = lower.match(/(?:video|number|අංක)\s*(\d+)/i);
  if (numberMatch && numberMatch[1]) {
    const idx = parseInt(numberMatch[1], 10) - 1;
    return {
      action: "PLAY_VIDEO",
      payload: { index: Math.max(0, idx) },
      feedbackMessage: `Playing video #${idx + 1}.`,
    };
  }
  if (lower.includes("first video") || lower.includes("පළමු වීඩියෝව") || lower.includes("පළවෙනි එක")) {
    return {
      action: "PLAY_VIDEO",
      payload: { index: 0 },
      feedbackMessage: "Playing first video.",
    };
  }
  if (lower.includes("second video") || lower.includes("දෙවන වීඩියෝව") || lower.includes("දෙවෙනි එක")) {
    return {
      action: "PLAY_VIDEO",
      payload: { index: 1 },
      feedbackMessage: "Playing second video.",
    };
  }
  if (lower.startsWith("play ") || lower.startsWith("watch ") || lower.includes("දමන්න")) {
    const query = transcript.replace(/^(play|watch|දමන්න)[:\s]*/i, "").trim();
    return {
      action: "PLAY_VIDEO",
      payload: { query },
      feedbackMessage: `Playing "${query}".`,
    };
  }

  // 6. FILTERING / SEARCH
  if (lower.includes("all videos") || lower.includes("reset filter") || lower.includes("සියල්ල පෙන්වන්න")) {
    return {
      action: "FILTER_VIDEOS",
      payload: {},
      feedbackMessage: "Showing all videos.",
    };
  }
  if (mentionsSavedList || (isShowIntent && lower.includes("save"))) {
    return {
      action: "FILTER_VIDEOS",
      payload: { isArchived: true },
      feedbackMessage: "Showing saved videos.",
    };
  }
  if (lower.includes("history") || lower.includes("recently watched") || lower.includes("ඉතිහාසය")) {
    return {
      action: "FILTER_VIDEOS",
      payload: { history: true },
      feedbackMessage: "Showing watch history.",
    };
  }
  const filterStars = stars ?? (lower.includes("top rated") || lower.includes("best rated") ? 5 : null);
  if (filterStars !== null) {
    return {
      action: "FILTER_VIDEOS",
      payload: { rating: filterStars },
      feedbackMessage: `Showing ${filterStars}-star videos.`,
    };
  }

  if (lower.startsWith("search ") || lower.startsWith("find ") || lower.includes("සොයන්න")) {
    const q = transcript.replace(/^(search|find|සොයන්න)[:\s]*/i, "").trim();
    return {
      action: "FILTER_VIDEOS",
      payload: { search: q },
      feedbackMessage: `Searching for "${q}".`,
    };
  }

  if (context.availableSubjects && context.availableSubjects.length > 0) {
    for (const sub of context.availableSubjects) {
      if (lower.includes(sub.toLowerCase()) || sub.toLowerCase().includes(lower)) {
        return {
          action: "FILTER_VIDEOS",
          payload: { subject: sub },
          feedbackMessage: `Showing ${sub} videos.`,
        };
      }
    }
  }

  if (context.availableAuthors && context.availableAuthors.length > 0) {
    for (const auth of context.availableAuthors) {
      if (lower.includes(auth.toLowerCase()) || auth.toLowerCase().includes(lower)) {
        return {
          action: "FILTER_VIDEOS",
          payload: { author: auth },
          feedbackMessage: `Showing videos by ${auth}.`,
        };
      }
    }
  }

  return {
    action: "UNKNOWN",
    feedbackMessage: `I heard: "${transcript}"`,
  };
}

export async function parseVoiceCommandWithGemini(
  transcript: string,
  context: {
    availableSubjects?: string[];
    availableAuthors?: string[];
    availableTags?: string[];
    currentVideoTitle?: string;
    isPlaying?: boolean;
  }
): Promise<AICommandResponse> {
  const cleanTranscript = transcript
    .replace(/^(hey assistant|ok assistant|assistant|හායි|හෙලෝ|කොහොමද)[:,\s]*/i, "")
    .trim();

  if (!cleanTranscript) {
    return {
      action: "UNKNOWN",
      feedbackMessage: "Voice input was empty.",
    };
  }

  // 1. FAST ZERO-LATENCY EDGE MATCH (Runs in < 1ms!)
  // For immediate commands (play, pause, stop, rate, archive, take note, filter, video index),
  // return immediately without waiting for a cloud API call!
  const instantMatch = heuristicVoiceParser(cleanTranscript, context);
  if (instantMatch.action !== "UNKNOWN") {
    return instantMatch;
  }

  // 2. If ambiguous or complex natural language query, consult Gemini with a 2.5s fast timeout
  if (!ai || !apiKey) {
    return instantMatch;
  }

  const prompt = `You are the AI Voice Controller for a 10-foot YouTube TV Kiosk.
The user speaks commands in English or Sinhala (or Singlish) using a remote control microphone.

VOICE INPUT: "${cleanTranscript}"

CURRENT SYSTEM STATE:
- Currently Playing Video: ${context.currentVideoTitle ? `"${context.currentVideoTitle}"` : "None (Home Grid)"}
- Is Video Playing Now: ${context.isPlaying ? "Yes" : "No"}
- Available Categories / Subjects: ${JSON.stringify(context.availableSubjects || [])}
- Available Authors / Channels: ${JSON.stringify(context.availableAuthors || [])}
- Available Tags: ${JSON.stringify(context.availableTags || [])}

SUPPORTED ACTIONS & 5-STAR RATING SYSTEM:
1. FILTER_VIDEOS:
   When user asks to filter or search videos.
   payload: { "author": string, "subject": string, "tag": string, "rating": number (1 to 5), "isArchived": boolean, "search": string }

2. PLAY_VIDEO:
   When user asks to play, watch, or open a video.
   payload: { "query": string, "index": number (0-based integer, e.g. first=0, second=1) }

3. PLAYER_CONTROL:
   Playback controls for current video.
   payload: { "action": "play" | "pause" | "stop" | "forward" | "rewind" | "mute" | "unmute" | "fullscreen" | "go_home" }

4. RATE_CURRENT_VIDEO:
   5-Star Rating (1 to 5 Stars, 0 to clear):
   - 5 Stars: "rate 5 stars", "five stars", "give 5 stars", "masterpiece" (Sinhala: "තරු 5", "තරු පහක්", "විශිෂ්ටයි")
   - 4 Stars: "rate 4 stars", "four stars", "great video" (Sinhala: "තරු 4", "තරු හතරක්", "හොඳයි")
   - 3 Stars: "rate 3 stars", "three stars", "average" (Sinhala: "තරු 3", "තරු තුනක්", "සාමාන්‍යයි")
   - 2 Stars: "rate 2 stars", "two stars" (Sinhala: "තරු 2", "තරු දෙකක්")
   - 1 Star: "rate 1 star", "one star" (Sinhala: "තරු 1", "තරු එකක්")
   - 0: "remove rating", "unrate"
   payload: { "ratingVal": number (0 to 5) }

5. ARCHIVE_CURRENT_VIDEO:
   Save or unarchive video.
   payload: { "archive": true or false }

6. ADD_NOTE:
   When user wants to dictate or save a note/comment on the current video.
   payload: { "noteText": "exact text of note without command prefix" }
   Sinhala: "සටහනක් ලියන්න", "ලියාගන්න"

7. UNKNOWN:
   If incomprehensible or unrelated.

Respond strictly with valid JSON:
{
  "action": "FILTER_VIDEOS" | "PLAY_VIDEO" | "PLAYER_CONTROL" | "RATE_CURRENT_VIDEO" | "ARCHIVE_CURRENT_VIDEO" | "ADD_NOTE" | "UNKNOWN",
  "payload": { ... },
  "feedbackMessage": "Short spoken response under 8 words in English for TTS feedback",
  "confidence": number between 0.0 and 1.0
}`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), 2500)
    );

    const apiPromise = ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const response: any = await Promise.race([apiPromise, timeoutPromise]);

    const text = response.text?.trim() || "";
    const parsed = JSON.parse(text) as AICommandResponse;
    if (parsed && parsed.action) {
      return parsed;
    }
    return instantMatch;
  } catch (err) {
    return instantMatch;
  }
}
