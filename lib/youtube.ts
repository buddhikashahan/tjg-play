export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // Match standard, short (youtu.be), embed, shorts, and live URLs
  const regExp =
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;
  const match = url.match(regExp);
  if (match && match[1]) {
    return match[1];
  }
  // If it's already an 11-char ID
  if (/^[\w-]{11}$/.test(url.trim())) {
    return url.trim();
  }
  return null;
}

export interface YouTubeMetadata {
  youtubeId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  duration?: number; // duration in seconds
}

export function formatVideoDuration(totalSec?: number | null): string {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return "--:--";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/** Formats a playback position (0 is valid), e.g. 0:00, 4:05, 1:02:03. */
export function formatTimestamp(totalSec?: number | null): string {
  if (totalSec === undefined || totalSec === null || isNaN(totalSec) || totalSec < 0) return "--:--";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export async function fetchYouTubeMetadata(urlOrId: string): Promise<YouTubeMetadata> {
  const id = extractYouTubeId(urlOrId);
  if (!id) {
    throw new Error("Invalid YouTube URL or ID");
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;

  let scrapedDuration = 0;
  try {
    const watchRes = await fetch(cleanUrl, {
      next: { revalidate: 3600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
      if (lengthMatch && lengthMatch[1]) {
        scrapedDuration = parseInt(lengthMatch[1], 10);
      } else {
        const approxMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
        if (approxMatch && approxMatch[1]) {
          scrapedDuration = Math.round(parseInt(approxMatch[1], 10) / 1000);
        }
      }
    }
  } catch (err) {
    // Non-blocking duration scrape
  }

  try {
    const res = await fetch(oembedUrl, {
      next: { revalidate: 3600 },
      headers: {
        "User-Agent": "Smart-TV-Kiosk/1.0",
      },
    });

    if (!res.ok) {
      // Fallback if oEmbed fails or is restricted
      return {
        youtubeId: id,
        title: `YouTube Video (${id})`,
        author: "YouTube Channel",
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        youtubeUrl: cleanUrl,
        duration: scrapedDuration || undefined,
      };
    }

    const data = await res.json();
    return {
      youtubeId: id,
      title: data.title || `Video ${id}`,
      author: data.author_name || "Unknown Author",
      // High-resolution fallback or oEmbed thumbnail
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      youtubeUrl: cleanUrl,
      duration: scrapedDuration || undefined,
    };
  } catch (error) {
    console.warn("oEmbed fetch failed, using fallback:", error);
    return {
      youtubeId: id,
      title: `YouTube Video (${id})`,
      author: "YouTube Channel",
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      youtubeUrl: cleanUrl,
      duration: scrapedDuration || undefined,
    };
  }
}

