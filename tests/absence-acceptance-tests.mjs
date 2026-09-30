/**
 * Acceptance Test Suite for Absence Module
 * Tests 1 through 10 verifying Camera, WebRTC, and YOLO Verification Pipeline
 */

import assert from "node:assert";

// Environment variables loaded via node --env-file

// Color helpers for console
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

async function runTests() {
  console.log(bold(cyan("\n========================================================")));
  console.log(bold(cyan("     ABSENCE MODULE: COMPLETE VERIFICATION TEST SUITE   ")));
  console.log(bold(cyan("========================================================\n")));

  // Dynamically import compiled or source engine
  // Since Next.js uses TS and server-only, we can test via module or via the direct evaluator functions
  const {
    evaluateAbsenceLogic,
    checkPersonInRoi,
    formatAbsenceLog,
    resetAbsenceTimer,
    fetchCameraStatuses,
    getCameraFfmpegStatus,
    checkWebRtcHealth,
  } = await import("../frontend/src/lib/server/absenceEngine.ts");

  let passedCount = 0;
  let totalCount = 10;

  // ----------------------------------------------------
  // Test 1: Camera offline -> CAMERA_OFFLINE. No timer, no absence event.
  // ----------------------------------------------------
  console.log(bold("Test 1: Camera offline -> CAMERA_OFFLINE"));
  {
    resetAbsenceTimer("TestPerson_1");
    const res = await evaluateAbsenceLogic({
      personId: "TestPerson_1",
      cameraName: "AXI222",
      mockCameraStatus: "stopped",
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "CAMERA_OFFLINE", "Expected CAMERA_OFFLINE");
    assert.strictEqual(res.timerSeconds, 0, "Timer must be 0s");
    assert.strictEqual(res.personInRoi, "NO");
    assert.ok(res.log.includes("Result: CAMERA_OFFLINE"));
    console.log(green("✔ Test 1 PASSED: Camera offline returned CAMERA_OFFLINE without starting timer.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 2: Camera running + person inside ROI -> PRESENT. Timer 0s.
  // ----------------------------------------------------
  console.log(bold("Test 2: Camera running + person inside ROI -> PRESENT. Timer 0s."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockDetections: [
        { class_name: "person", bbox_xyxy: [430, 190, 600, 510] }
      ],
      mockSecondsAgo: 1,
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "PRESENT", "Expected PRESENT");
    assert.strictEqual(res.personInRoi, "YES", "Expected person in ROI: YES");
    assert.strictEqual(res.timerSeconds, 0, "Expected timer 0s");
    assert.ok(res.log.includes("Result: PRESENT"));
    assert.ok(res.log.includes("Person in ROI: YES"));
    console.log(green("✔ Test 2 PASSED: Person inside ROI marked PRESENT with Timer 0s.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 3: Camera running + person outside ROI -> ABSENT after 10s.
  // ----------------------------------------------------
  console.log(bold("Test 3: Camera running + person outside ROI -> ABSENT after 10s."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      // Detection is far outside ROI (at [50, 50, 150, 200])
      mockDetections: [
        { class_name: "person", bbox_xyxy: [50, 50, 150, 200] }
      ],
      mockSecondsAgo: 1,
      simulatedTimerSeconds: 10,
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "ABSENT", "Expected ABSENT");
    assert.strictEqual(res.personInRoi, "NO", "Expected person in ROI: NO");
    assert.strictEqual(res.detections, 1, "Expected 1 detection outside ROI");
    assert.strictEqual(res.timerSeconds, 10, "Expected timer >= 10s");
    assert.ok(res.log.includes("Result: ABSENT"));
    assert.ok(res.log.includes("Person in ROI: NO"));
    console.log(green("✔ Test 3 PASSED: Person outside ROI marked ABSENT after 10s grace period.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 4: Camera running + empty room (no YOLO frames in DB) + WebRTC active -> ABSENT after 10s.
  // ----------------------------------------------------
  console.log(bold("Test 4: Camera running + empty room (no YOLO frames in DB) + WebRTC active -> ABSENT after 10s."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockDetections: [], // empty room
      simulatedTimerSeconds: 10,
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "ABSENT", "Expected ABSENT");
    assert.strictEqual(res.personInRoi, "NO", "Expected person in ROI: NO");
    assert.strictEqual(res.detections, 0, "Expected 0 detections");
    assert.ok(res.log.includes("Result: ABSENT"));
    console.log(green("✔ Test 4 PASSED: Empty room with active WebRTC accurately detected and marked ABSENT after 10s.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 5: Person leaves ROI for 4s then returns -> stays PRESENT (timer resets).
  // ----------------------------------------------------
  console.log(bold("Test 5: Person leaves ROI for 4s then returns -> stays PRESENT (timer resets)."));
  {
    resetAbsenceTimer("Officer_A");
    // Step 5a: Leaves for 4s (within 10s grace period)
    const stepA = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockDetections: [],
      simulatedTimerSeconds: 4,
      thresholdSeconds: 10,
    });
    assert.strictEqual(stepA.result, "PRESENT", "At 4s within grace period, status must remain PRESENT");
    assert.strictEqual(stepA.timerSeconds, 4, "Timer must reflect 4s");

    // Step 5b: Person returns at 5s
    const stepB = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockDetections: [
        { class_name: "person", bbox_xyxy: [430, 190, 600, 510] }
      ],
      mockSecondsAgo: 1,
      thresholdSeconds: 10,
    });

    console.log(stepB.log);
    assert.strictEqual(stepB.result, "PRESENT", "Upon return, status must be PRESENT");
    assert.strictEqual(stepB.personInRoi, "YES", "Person in ROI must be YES");
    assert.strictEqual(stepB.timerSeconds, 0, "Timer must be reset to 0s");
    console.log(green("✔ Test 5 PASSED: Leaving for 4s stayed PRESENT, returning reset timer to 0s.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 6: Person leaves ROI for 12s -> ABSENT.
  // ----------------------------------------------------
  console.log(bold("Test 6: Person leaves ROI for 12s -> ABSENT."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockDetections: [],
      simulatedTimerSeconds: 12,
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "ABSENT", "Expected ABSENT after 12s (>10s)");
    assert.strictEqual(res.timerSeconds, 12, "Timer must be 12s");
    assert.ok(res.log.includes("Timer: 12s / 10s"));
    assert.ok(res.log.includes("Result: ABSENT"));
    console.log(green("✔ Test 6 PASSED: Leaving for 12s crossed 10s threshold and triggered ABSENT.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 7: WebRTC stream completely fails while camera reported running -> STREAM_ERROR.
  // ----------------------------------------------------
  console.log(bold("Test 7: WebRTC stream completely fails while camera reported running -> STREAM_ERROR."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ERROR",
      roi: [420, 180, 610, 520],
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "STREAM_ERROR", "Expected STREAM_ERROR");
    assert.strictEqual(res.timerSeconds, 0, "Timer must be 0s");
    assert.ok(res.log.includes("Result: STREAM_ERROR"));
    assert.ok(res.log.includes("WebRTC Status: ERROR"));
    console.log(green("✔ Test 7 PASSED: Broken WebRTC stream returned STREAM_ERROR and avoided false alarms.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 8: YOLO detector service unavailable and cannot verify frame -> UNKNOWN.
  // ----------------------------------------------------
  console.log(bold("Test 8: YOLO detector service unavailable and cannot verify frame -> UNKNOWN."));
  {
    resetAbsenceTimer("Officer_A");
    const res = await evaluateAbsenceLogic({
      personId: "Officer_A",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: [420, 180, 610, 520],
      mockYoloDown: true,
      thresholdSeconds: 10,
    });

    console.log(res.log);
    assert.strictEqual(res.result, "UNKNOWN", "Expected UNKNOWN");
    assert.ok(res.log.includes("Result: UNKNOWN"));
    assert.ok(res.log.includes("YOLO Last Frame: UNAVAILABLE"));
    console.log(green("✔ Test 8 PASSED: YOLO detector failure safely returned UNKNOWN.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 9: Multiple persons on same camera with different ROIs evaluated independently.
  // ----------------------------------------------------
  console.log(bold("Test 9: Multiple persons on same camera with different ROIs evaluated independently."));
  {
    resetAbsenceTimer("Desk_Officer_1");
    resetAbsenceTimer("Desk_Officer_2");

    const roi1 = [100, 100, 300, 300];
    const roi2 = [600, 600, 800, 800];

    // Frame contains 1 person located inside ROI 1, but NOT ROI 2
    const detections = [
      { class_name: "person", bbox_xyxy: [120, 120, 280, 280] }
    ];

    // Evaluate Officer 1
    const res1 = await evaluateAbsenceLogic({
      personId: "Desk_Officer_1",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: roi1,
      mockDetections: detections,
      mockSecondsAgo: 1,
      thresholdSeconds: 10,
    });

    // Evaluate Officer 2 (absent for 15s)
    const res2 = await evaluateAbsenceLogic({
      personId: "Desk_Officer_2",
      cameraName: "AXI",
      mockCameraStatus: "running",
      mockWebRtcStatus: "ACTIVE",
      roi: roi2,
      mockDetections: detections,
      mockSecondsAgo: 1,
      simulatedTimerSeconds: 15,
      thresholdSeconds: 10,
    });

    console.log("--- Officer 1 Evaluation ---");
    console.log(res1.log);
    console.log("--- Officer 2 Evaluation ---");
    console.log(res2.log);

    assert.strictEqual(res1.result, "PRESENT", "Officer 1 must be PRESENT");
    assert.strictEqual(res1.personInRoi, "YES");
    assert.strictEqual(res2.result, "ABSENT", "Officer 2 must be ABSENT");
    assert.strictEqual(res2.personInRoi, "NO");

    console.log(green("✔ Test 9 PASSED: Multiple persons evaluated independently on same camera.\n"));
    passedCount++;
  }

  // ----------------------------------------------------
  // Test 10: Timer accurately tracks elapsed absence time.
  // ----------------------------------------------------
  console.log(bold("Test 10: Timer accurately tracks elapsed absence time."));
  {
    resetAbsenceTimer("Officer_Timeline");
    const intervals = [0, 3, 7, 10, 15];
    const expectedResults = ["PRESENT", "PRESENT", "PRESENT", "ABSENT", "ABSENT"];

    for (let i = 0; i < intervals.length; i++) {
      const elapsed = intervals[i];
      const res = await evaluateAbsenceLogic({
        personId: "Officer_Timeline",
        cameraName: "AXI",
        mockCameraStatus: "running",
        mockWebRtcStatus: "ACTIVE",
        roi: [420, 180, 610, 520],
        mockDetections: elapsed === 0 ? [{ class_name: "person", bbox_xyxy: [430, 190, 600, 510] }] : [],
        simulatedTimerSeconds: elapsed,
        thresholdSeconds: 10,
      });

      assert.strictEqual(res.timerSeconds, elapsed, `Timer must be exactly ${elapsed}s`);
      assert.strictEqual(res.result, expectedResults[i], `Result at ${elapsed}s must be ${expectedResults[i]}`);
      assert.ok(res.log.includes(`Timer: ${elapsed}s / 10s`));
    }

    console.log(green("✔ Test 10 PASSED: Timer verified accurately tracking [0s, 3s, 7s, 10s, 15s].\n"));
    passedCount++;
  }

  console.log(bold(cyan("========================================================")));
  console.log(bold(green(` ALL ${passedCount} / ${totalCount} ACCEPTANCE TESTS PASSED SUCCESSFULLY! `)));
  console.log(bold(cyan("========================================================\n")));

  process.exit(0);
}

runTests().catch((err) => {
  console.error(red("\n❌ TEST SUITE FAILED:"), err);
  process.exit(1);
});
