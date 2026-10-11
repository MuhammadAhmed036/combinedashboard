// {className: count} for the matched boxes of one side of a region rule, e.g.
// {car: 3, person: 1}. Stored in alert_events.detections_json as
// {inside: {...}, outside: {...}} — the shape the dashboard reads. No dependencies.
function countByClass(boxes) {
  const counts = {};
  for (const box of boxes) {
    const name = box && box.className ? String(box.className) : "";
    if (name) counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

module.exports = { countByClass };
