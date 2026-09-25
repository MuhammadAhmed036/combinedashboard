export interface LunaCandidate {
  face?: {
    face_id: string;
    user_data?: string;
    avatar?: string;
  };
  similarity: number;
  label?: string;
}

export interface LunaMatch {
  candidates?: LunaCandidate[];
  label?: string;
}

export interface LunaTopMatch {
  face_id?: string;
  similarity?: number;
  score?: number;
  face?: {
    face_id?: string;
    user_data?: string;
    avatar?: string;
  };
  label?: string;
}

export interface LunaEvent {
  event_id: string;
  id?: string;
  create_time: string;
  event?: LunaEvent;
  source?: string;
  handler_id?: string;
  stream_id?: string;
  top_match?: LunaTopMatch;
  matches?: LunaMatch[];
  match_result?: LunaMatch[];
  face_detections?: Array<{
    sample_id?: string;
    samples?: {
      face?: { url?: string };
      body?: { url?: string };
    };
  }>;
  detections?: Array<{
    sample_id?: string;
    samples?: {
      face?: { url?: string };
      body?: { url?: string };
    };
  }>;
  body_detections?: Array<{
    sample_id?: string | null;
    image_origin?: string;
    detection?: {
      rect?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  }>;
  body_basic_attributes?: {
    apparent_age?: number;
    apparent_gender?: number; // 0 = female, 1 = male
  };
  upper_body?: {
    headwear?: { state?: number; apparent_color?: string };
    sleeve?: { length?: string };
    upper_clothing?: { colors?: string[] };
  };
  lower_body?: {
    lower_garment?: { type?: string; colors?: string[] };
    shoes?: { apparent_color?: string };
  };
  accessories?: {
    backpack?: { state?: number };
  };
  location?: {
    area?: string;
    city?: string;
    geo_position?: {
      latitude?: number;
      longitude?: number;
    };
  };
  user_data?: string;
}

export interface LunaList {
  list_id: string;
  user_data?: string;
  count?: number;
}

export interface LunaHandler {
  handler_id: string;
  description?: string;
}

export interface MovementTracePoint {
  id: string;
  timestamp: string;
  camera: string;
  area: string;
  similarity: number;
  sampleUrl: string | null;
  avatarUrl: string | null;
  faceId: string | null;
  latitude?: number;
  longitude?: number;
}

export interface ParsedLunaPersonInfo {
  name: string;
  similarity: number;
  rawSimilarity: number;
  faceId: string | null;
  cameraName: string;
  listName: string;
  listId: string | null;
  sampleUrl: string | null;
  avatarUrl: string | null;
  timestamp: string;
  timeFormatted: string;
  dateFormatted: string;
  dateTimeFormatted: string;
  attributesSummary?: string;
}
