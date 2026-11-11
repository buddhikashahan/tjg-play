export type VideoRating = number; // 0 = unrated, 1 to 5 stars

export interface NoteItem {
  id: string;
  videoId: string;
  content: string;
  videoTimestamp?: number | null;
  createdAt: string | Date;
}

export interface VideoItem {
  id: string;
  youtubeUrl: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  author: string;
  authorImageUrl?: string | null;
  subject: string;
  tags: string[]; // parsed from JSON string
  rating: VideoRating;
  isArchived: boolean;
  watchProgress?: number | null; // 0 to 100 percentage
  lastPosition?: number | null; // seconds
  duration?: number | null; // total duration in seconds
  lastWatchedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  notes?: NoteItem[];
}

export interface AuthorItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  bio?: string | null;
  videoCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CategoryItem {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  videoCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type PlayerControlAction =
  | "play"
  | "pause"
  | "toggle"
  | "stop"
  | "forward"
  | "rewind"
  | "mute"
  | "unmute"
  | "fullscreen"
  | "exit_fullscreen"
  | "go_home";

/** A one-shot command sent to the player. `id` changes on every send so repeats still fire. */
export interface PlayerCommand {
  action: PlayerControlAction;
  id: number;
}

export type AICommandResponse = {
  action:
    | "FILTER_VIDEOS"
    | "PLAY_VIDEO"
    | "PLAYER_CONTROL"
    | "RATE_CURRENT_VIDEO"
    | "ARCHIVE_CURRENT_VIDEO"
    | "ADD_NOTE"
    | "UNKNOWN";
  payload?: {
    // For FILTER_VIDEOS
    author?: string;
    subject?: string;
    tag?: string;
    rating?: VideoRating;
    isArchived?: boolean;
    search?: string;
    history?: boolean; // For Watch History filter

    // For PLAY_VIDEO
    query?: string;
    index?: number;

    // For PLAYER_CONTROL
    action?: PlayerControlAction;

    // For RATE_CURRENT_VIDEO
    ratingVal?: VideoRating;

    // For ARCHIVE_CURRENT_VIDEO
    archive?: boolean;

    // For ADD_NOTE
    noteText?: string;
  };
  feedbackMessage: string;
  confidence?: number;
};
