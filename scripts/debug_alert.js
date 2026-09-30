const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://dashboard:admin@db:5432/dashboard' });

function boxesOverlap(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function personBoxesFromRow(row) {
  let detections = row.detections_json;
  if (typeof detections === 'string') {
    try { detections = JSON.parse(detections); } catch { detections = []; }
  }
  if (!Array.isArray(detections)) detections = [];
  const imgW = Number(row.image_width) || 1920;
  const imgH = Number(row.image_height) || 1080;
  const boxes = [];
  for (const d of detections) {
    if (String(d.class_name || '').toLowerCase() !== 'person') continue;
    if (Array.isArray(d.bbox_norm_xyxy) && d.bbox_norm_xyxy.length === 4) {
      boxes.push({ x1: d.bbox_norm_xyxy[0], y1: d.bbox_norm_xyxy[1], x2: d.bbox_norm_xyxy[2], y2: d.bbox_norm_xyxy[3] });
    } else if (Array.isArray(d.bbox_xyxy) && d.bbox_xyxy.length === 4) {
      boxes.push({
        x1: d.bbox_xyxy[0] / imgW,
        y1: d.bbox_xyxy[1] / imgH,
        x2: d.bbox_xyxy[2] / imgW,
        y2: d.bbox_xyxy[3] / imgH,
      });
    }
  }
  return boxes;
}

function absenceRuleRegion(rule) {
  let bbox = rule.bounding_box;
  if (typeof bbox === 'string') {
    try { bbox = JSON.parse(bbox); } catch { bbox = null; }
  }
  let meta = rule.metadata || {};
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = {}; }
  }
  const refW = Number(meta.ref_image_width);
  const refH = Number(meta.ref_image_height);
  if (!bbox || !refW || !refH) return null;
  if (![bbox.x1, bbox.y1, bbox.x2, bbox.y2].every((v) => typeof v === 'number')) return null;
  return {
    x1: Math.min(bbox.x1, bbox.x2) / refW,
    y1: Math.min(bbox.y1, bbox.y2) / refH,
    x2: Math.max(bbox.x1, bbox.x2) / refW,
    y2: Math.max(bbox.y1, bbox.y2) / refH,
  };
}

function framePersonPresent(row, region) {
  if (region) {
    return personBoxesFromRow(row).some((box) => boxesOverlap(box, region));
  }
  return Number(row.detection_count) > 0;
}

async function run() {
  const { rows: [rule] } = await pool.query('SELECT alert_id, camera_id, name, bounding_box, conditions, metadata, created_at FROM alerts WHERE alert_id = $1', ['71608dfe-4eb1-4c2c-8860-8d00bf730dc5']);
  const region = absenceRuleRegion(rule);
  console.log('Region:', region);
  const { rows: recent } = await pool.query(
    'SELECT event_id, detection_ts, created_at, detection_count, detections_json, image_width, image_height, raw_image_path, raw_image_status FROM detection_events WHERE LOWER(TRIM(camera_id)) = LOWER(TRIM($1)) ORDER BY id DESC LIMIT 50',
    [rule.camera_id]
  );
  const now = Date.now();
  console.log('recent count:', recent.length);
  const latest = recent[0];
  const latestMs = new Date(latest.created_at || latest.detection_ts).getTime();
  const secondsAgo = (now - latestMs) / 1000;
  console.log('now:', now, 'latestMs:', latestMs, 'secondsAgo:', secondsAgo);
  const framePresent = framePersonPresent(latest, region);
  console.log('framePersonPresent(latest, region):', framePresent);
  
  let personCurrentlyPresent = false;
  if (secondsAgo <= 5) {
    personCurrentlyPresent = framePresent;
  }
  console.log('personCurrentlyPresent:', personCurrentlyPresent);

  const lastPresent = recent.find((r) => framePersonPresent(r, region));
  console.log('lastPresent id:', lastPresent?.event_id);
  const lastPresentMs = lastPresent ? new Date(lastPresent.created_at || lastPresent.detection_ts).getTime() : null;
  console.log('lastPresentMs:', lastPresentMs);
  const elapsedSec = (now - lastPresentMs) / 1000;
  console.log('elapsedSec:', elapsedSec);
  await pool.end();
}

run().catch(console.error);
