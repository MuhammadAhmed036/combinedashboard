// Display model for one LUNA event card (collapsed lines + expanded details).
// Pure and import-free at runtime so tests/luna-card-model.test.mjs can load it
// directly. Field paths: AUDIT_PIPELINE_INTEGRATION.md §13, docs/luna-samples/.
import type { LunaEvent } from './types';

/** Display names resolved server-side by /api/luna/lookups (never credentials). */
export interface LunaLookups {
  handlers: Record<string, { name: string | null; labels: Record<string, string> }>;
  lists: Record<string, string>;
  streams: Record<string, string>;
}

export const EMPTY_LUNA_LOOKUPS: LunaLookups = { handlers: {}, lists: {}, streams: {} };

export interface LunaCandidateView {
  name: string;
  faceId: string | null;
  externalId: string | null;
  /** 0..1 as reported by LUNA */
  similarity: number;
  /** Whole percent, same rounding as the existing badge */
  percent: number;
  label: string | null;
  listId: string | null;
  /** Resolved list name, else list id, else match label */
  list: string | null;
}

export interface LunaDetail {
  label: string;
  value: string;
}

export interface LunaCardModel {
  matched: boolean;
  top: LunaCandidateView | null;
  /** Other candidates (best first, one per face), excluding `top` */
  others: LunaCandidateView[];
  /** Resolved camera: LUNA Streams name, else `source`, else `stream_id`; null when the event has none */
  camera: string | null;
  handlerId: string | null;
  handler: string | null;
  eventId: string | null;
  faceId: string | null;
  trackId: string | null;
  externalId: string | null;
  createTime: string | null;
  endTime: string | null;
  /** "Male, ~35y • white top • black trousers" for unmatched cards */
  attributesSummary: string;
  /** Person attributes, only those present in the payload */
  attributes: LunaDetail[];
  location: string | null;
}

// Enum labels, identical to the panel's filter options (LunaEventsRail.tsx).
const EMOTIONS: Record<number, string> = { 1: 'Anger', 2: 'Disgust', 3: 'Fear', 4: 'Happiness', 5: 'Neutral', 6: 'Sadness', 7: 'Surprise' };
const MASKS: Record<number, string> = { 1: 'No mask', 2: 'Medical mask', 3: 'Face occluded' };
const LIVENESS: Record<number, string> = { 0: 'Spoof / Fake', 1: 'Real person', 2: 'Unknown' };
const ETHNIC: Record<number, string> = { 1: 'Asian', 2: 'Caucasian', 3: 'African', 4: 'East Indian' };
const DEEPFAKE: Record<number, string> = { 0: 'Real', 1: 'Deepfake' };
// Body states: 0 no, 1 yes, 2 unknown (real data: headwear state 2 never has a
// colour, state 1 almost always does), so 2 is hidden.
const BACKPACK: Record<number, string> = { 0: 'No backpack', 1: 'Wearing backpack' };

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== 'undefined' ? trimmed : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function colors(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const list = value.map(text).filter((c): c is string => Boolean(c));
  return list.length ? list.join('/') : null;
}

function toPercent(similarity: number): number {
  return similarity > 0 ? Math.round(similarity > 1 ? similarity : similarity * 100) : 0;
}

// 0 female, 1 male; LUNA reports 2 (body) when the gender is unknown.
function genderLabel(value: number | null): string | null {
  return value === 1 ? 'Male' : value === 0 ? 'Female' : null;
}

function resolveList(label: string | null, handlerId: string | null, lookups: LunaLookups) {
  const listId = label && handlerId ? lookups.handlers[handlerId]?.labels[label] ?? null : null;
  const listName = listId ? lookups.lists[listId] ?? null : null;
  return { listId, list: listName || listId || label };
}

/**
 * Every candidate across all `match_result` / `matches` entries, best first.
 * Ties keep LUNA's own pick (`top_match.face_id`) first, then payload order.
 */
export function rankCandidates(event: LunaEvent, lookups: LunaLookups = EMPTY_LUNA_LOOKUPS): LunaCandidateView[] {
  const evt = rec(event.event ?? event) as Rec;
  const handlerId = text(evt.handler_id) ?? text(evt.handlerId);
  const topFaceId = text(rec(evt.top_match).face_id) ?? text(rec(rec(evt.top_match).face).face_id);
  const groups = Array.isArray(evt.match_result) ? evt.match_result : Array.isArray(evt.matches) ? evt.matches : [];
  const ranked: LunaCandidateView[] = [];
  for (const group of groups) {
    const g = rec(group);
    const candidates = Array.isArray(g.candidates) ? g.candidates : [];
    for (const candidate of candidates) {
      const c = rec(candidate);
      const face = rec(c.face);
      const similarity = num(c.similarity) ?? num(c.score);
      if (similarity === null) continue;
      const faceId = text(face.face_id) ?? text(c.face_id);
      const externalId = text(face.external_id) ?? text(c.external_id);
      const label = text(c.label) ?? text(g.label);
      const name = externalId ?? text(face.user_data) ?? (faceId ? `Face ${faceId.slice(0, 8)}` : 'Unnamed');
      ranked.push({ name, faceId, externalId, similarity, percent: toPercent(similarity), label, ...resolveList(label, handlerId, lookups) });
    }
  }
  const isTop = (c: LunaCandidateView) => Number(Boolean(topFaceId) && c.faceId === topFaceId);
  return ranked
    .map((view, index) => ({ view, index }))
    .sort((a, b) => b.view.similarity - a.view.similarity || isTop(b.view) - isTop(a.view) || a.index - b.index)
    .map(({ view }) => view);
}

export function buildLunaCardModel(event: LunaEvent, lookups: LunaLookups = EMPTY_LUNA_LOOKUPS): LunaCardModel {
  const evt = rec(event.event ?? event) as Rec;
  const ranked = rankCandidates(event, lookups);
  const top = ranked[0] ?? null;
  // One row per person: the same face can appear in several lists, and the
  // same person can be enrolled as several faces (same name, same list).
  const personKey = (c: LunaCandidateView) => `${c.name.toLowerCase()}|${c.list ?? ''}`;
  const seen = new Set<string>(top ? [personKey(top), ...(top.faceId ? [top.faceId] : [])] : []);
  const others: LunaCandidateView[] = [];
  for (const candidate of ranked.slice(1)) {
    const keys = [personKey(candidate), ...(candidate.faceId ? [candidate.faceId] : [])];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    others.push(candidate);
    if (others.length === 5) break;
  }

  const handlerId = text(evt.handler_id) ?? text(evt.handlerId);
  const streamId = text(evt.stream_id);
  const camera = (streamId ? lookups.streams[streamId] : null) || text(evt.source) || streamId;

  const body = rec(evt.body_basic_attributes);
  const upper = rec(evt.upper_body);
  const lower = rec(evt.lower_body);
  const faceGender = genderLabel(num(evt.gender));
  const bodyGender = genderLabel(num(body.apparent_gender));
  const age = num(evt.age) ?? num(body.apparent_age);
  const upperColors = colors(rec(upper.upper_clothing).colors);
  const garment = rec(lower.lower_garment);
  const bottom = colors(garment.colors);

  const summaryParts: string[] = [];
  const who = faceGender ?? bodyGender;
  if (who || age !== null) summaryParts.push([who, age !== null ? `~${age}y` : null].filter(Boolean).join(', '));
  if (upperColors) summaryParts.push(`${upperColors} top`);
  if (bottom) summaryParts.push(`${bottom} ${text(garment.type) ?? 'bottom'}`);

  const attributes: LunaDetail[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) attributes.push({ label, value });
  };
  add('Gender', faceGender ?? bodyGender);
  add('Age', num(evt.age) !== null ? `${num(evt.age)}` : num(body.apparent_age) !== null ? `~${num(body.apparent_age)} (body)` : null);
  add('Emotion', EMOTIONS[num(evt.emotion) ?? -1]);
  add('Mask', MASKS[num(evt.mask) ?? -1]);
  add('Liveness', LIVENESS[num(evt.liveness) ?? -1]);
  add('Ethnicity', ETHNIC[num(evt.ethnic_group) ?? -1]);
  add('Deepfake', DEEPFAKE[num(evt.deepfake) ?? -1]);
  const headwear = rec(upper.headwear);
  const headwearState = num(headwear.state);
  add('Headwear', headwearState === 1 ? text(headwear.apparent_color) ?? 'Yes' : headwearState === 0 ? 'None' : null);
  add('Upper clothing', upperColors);
  add('Sleeves', text(rec(upper.sleeve).length));
  add('Lower garment', [bottom, text(garment.type)].filter(Boolean).join(' ') || null);
  add('Shoes', text(rec(lower.shoes).apparent_color));
  add('Backpack', BACKPACK[num(rec(rec(evt.accessories).backpack).state) ?? -1]);

  const loc = rec(evt.location);
  const location = ['street', 'house_number', 'area', 'district', 'city']
    .map((k) => text(loc[k]))
    .filter(Boolean)
    .join(', ');

  return {
    matched: Boolean(top),
    top,
    others,
    camera,
    handlerId,
    handler: (handlerId ? lookups.handlers[handlerId]?.name : null) ?? null,
    eventId: text(evt.event_id) ?? text(evt.id),
    faceId: text(evt.face_id),
    trackId: text(evt.track_id),
    externalId: text(evt.external_id),
    createTime: text(evt.create_time),
    endTime: text(evt.end_time),
    attributesSummary: summaryParts.join(' • '),
    attributes,
    location: location || null,
  };
}
