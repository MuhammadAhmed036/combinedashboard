import { LunaEvent, LunaCandidate, ParsedLunaPersonInfo } from './types';

export function resolveLunaSampleUrl(rawUrlOrId?: string | null): string | null {
  if (!rawUrlOrId) return null;
  if (rawUrlOrId.startsWith('http://') || rawUrlOrId.startsWith('https://')) {
    return rawUrlOrId;
  }
  // Check if it's like /6/images/<hash>
  const imageMatch = rawUrlOrId.match(/(?:images)\/([a-zA-Z0-9_-]+)/);
  if (imageMatch && imageMatch[1]) {
    return `/api/luna/images/${imageMatch[1]}`;
  }
  // Check if it's like /6/samples/<hash>
  const sampleMatch = rawUrlOrId.match(/(?:samples|faces)\/([a-zA-Z0-9_-]+)/);
  if (sampleMatch && sampleMatch[1]) {
    return `/api/luna/samples/${sampleMatch[1]}`;
  }
  // If it's a UUID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(rawUrlOrId)) {
    return `/api/luna/samples/${rawUrlOrId}`;
  }
  return rawUrlOrId;
}

export function findBestCandidate(event: LunaEvent): LunaCandidate | null {
  const matches = event.matches || event.match_result;
  if (!matches || !Array.isArray(matches)) return null;

  let best: LunaCandidate | null = null;
  let highestSim = -1;

  for (const match of matches) {
    if (!match.candidates || !Array.isArray(match.candidates)) continue;
    for (const cand of match.candidates) {
      const sim = cand.similarity || 0;
      if (sim > highestSim) {
        highestSim = sim;
        best = {
          ...cand,
          label: cand.label || match.label,
          similarity: sim,
        };
      }
    }
  }

  return best;
}

export function parseLunaEvent(event: LunaEvent): ParsedLunaPersonInfo {
  const evt = event.event || event;
  let name = '';
  let rawSim = 0;
  let faceId: string | null = null;
  let listName = '';
  const listId: string | null = null;
  let avatarUrl: string | null = null;
  let sampleUrl: string | null = null;
  let attributesSummary = '';

  // 1. Try top_match
  if (evt.top_match) {
    faceId = evt.top_match.face_id || evt.top_match.face?.face_id || null;
    name = evt.top_match.face?.user_data || evt.top_match.label || 'Identified Person';
    rawSim = evt.top_match.similarity ?? evt.top_match.score ?? 0;
    listName = evt.top_match.label || 'Watchlist Match';
    if (evt.top_match.face?.avatar) {
      avatarUrl = resolveLunaSampleUrl(evt.top_match.face.avatar);
    }
  }

  // 2. Best candidate fallback
  if (!faceId) {
    const candidate = findBestCandidate(evt);
    if (candidate) {
      faceId = candidate.face?.face_id || null;
      name = candidate.face?.user_data || candidate.label || 'Identified Person';
      rawSim = candidate.similarity || 0;
      listName = candidate.label || 'Watchlist Match';
      if (candidate.face?.avatar) {
        avatarUrl = resolveLunaSampleUrl(candidate.face.avatar);
      }
    }
  }

  // 3. Body Detections / Attribute Extraction (as seen in Luna events)
  const bodyDet = evt.body_detections?.[0];
  if (bodyDet?.image_origin) {
    sampleUrl = resolveLunaSampleUrl(bodyDet.image_origin);
  }

  if (!sampleUrl) {
    const sampleId =
      evt.face_detections?.[0]?.sample_id ||
      evt.detections?.[0]?.sample_id ||
      evt.face_detections?.[0]?.samples?.face?.url ||
      evt.detections?.[0]?.samples?.face?.url;

    if (sampleId) {
      sampleUrl = resolveLunaSampleUrl(sampleId);
    }
  }

  // Build descriptive name & attributes if no matched face identity
  if (evt.body_basic_attributes) {
    const gender = evt.body_basic_attributes.apparent_gender === 1 ? 'Male' : 'Female';
    const age = evt.body_basic_attributes.apparent_age;
    if (!name) {
      name = `${gender}, ~${age}y`;
    }
  }

  // Build clothes / appearance description
  const clothingParts: string[] = [];
  if (evt.upper_body?.upper_clothing?.colors?.length) {
    clothingParts.push(`${evt.upper_body.upper_clothing.colors.join('/')} top`);
  }
  if (evt.lower_body?.lower_garment?.colors?.length && evt.lower_body.lower_garment.colors[0] !== 'undefined') {
    clothingParts.push(`${evt.lower_body.lower_garment.colors.join('/')} ${evt.lower_body.lower_garment.type || 'bottom'}`);
  }
  if (clothingParts.length > 0) {
    attributesSummary = clothingParts.join(' • ');
  }

  if (!listName) {
    listName = attributesSummary || 'Body Detection';
  }

  if (!name) {
    name = evt.user_data || 'Detected Person';
  }

  // Camera source / handler
  const cameraName = evt.source || (evt.handler_id ? `Handler ${evt.handler_id.slice(0, 8)}` : 'Surveillance Cam');

  // If there's an explicit match, use its score; if it's an unmatched detection, similarity is 0
  const similarity = rawSim > 0 ? Math.round(rawSim > 1 ? rawSim : rawSim * 100) : 0;

  // Timestamp & Date/Time formatting
  const timestamp = evt.create_time || new Date().toISOString();
  let timeFormatted = '';
  let dateFormatted = '';
  let dateTimeFormatted = '';
  try {
    const d = new Date(timestamp);
    timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateFormatted = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    dateTimeFormatted = `${dateFormatted} ${timeFormatted}`;
  } catch {
    timeFormatted = timestamp;
    dateFormatted = '';
    dateTimeFormatted = timestamp;
  }

  return {
    name,
    similarity,
    rawSimilarity: rawSim > 0 ? rawSim : 1.0,
    faceId,
    cameraName,
    listName,
    listId,
    sampleUrl,
    avatarUrl,
    timestamp,
    timeFormatted,
    dateFormatted,
    dateTimeFormatted,
    attributesSummary,
  };
}
