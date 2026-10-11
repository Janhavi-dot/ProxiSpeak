import assert from "node:assert/strict";

const API_BASE = "http://localhost:5000";

async function run() {
  console.log("=== Running Corporate Office Planar Proximity Tests ===");

  // 1. Log in as admin
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@proxispeak.com", password: "admin123" }),
  });
  const loginData = await loginRes.json();
  assert.equal(loginRes.status, 200, "Admin login should succeed");
  const token = loginData.token;
  console.log("✓ Logged in as admin.");

  // 2. Upload test voice memos anchored to specific office zones
  console.log("1. Anchoring voice memos to specific office zones...");

  // Dummy webm audio
  const dummyAudio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

  // Memo A in Main Boardroom (120, 280)
  const fdA = new FormData();
  fdA.append("title", "Q4 Strategy Sync Minutes");
  fdA.append("description", "Action items from quarterly executive board meeting");
  fdA.append("category", "meeting");
  fdA.append("x", "120");
  fdA.append("y", "280");
  fdA.append("zone", "Main Boardroom");
  fdA.append("radius", "140");
  fdA.append("audio", new Blob([dummyAudio], { type: "audio/webm" }), "boardroom.webm");

  const resA = await fetch(`${API_BASE}/api/audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fdA,
  });
  const dataA = await resA.json();
  assert.equal(resA.status, 201);
  const idA = dataA.audio.id;
  console.log(`✓ Boardroom memo uploaded (${idA}) at (120, 280)`);

  // Memo B in Pantry & Kitchen (120, 100)
  const fdB = new FormData();
  fdB.append("title", "Fresh Coffee Beans Arrived");
  fdB.append("description", "Ethiopian roast now available in the kitchen");
  fdB.append("category", "watercooler");
  fdB.append("x", "120");
  fdB.append("y", "100");
  fdB.append("zone", "Pantry & Kitchen");
  fdB.append("radius", "100");
  fdB.append("audio", new Blob([dummyAudio], { type: "audio/webm" }), "pantry.webm");

  const resB = await fetch(`${API_BASE}/api/audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fdB,
  });
  const dataB = await resB.json();
  assert.equal(resB.status, 201);
  const idB = dataB.audio.id;
  console.log(`✓ Pantry memo uploaded (${idB}) at (120, 100)`);

  // 3. Query proximity standing in Main Boardroom (125, 285) with radius 80
  console.log("2. Testing acoustic hearing from Main Boardroom (125, 285) with radius 80...");
  const nearbyRes1 = await fetch(`${API_BASE}/api/audio/nearby?x=125&y=285&radius=80`);
  const nearbyData1 = await nearbyRes1.json();
  const ids1 = nearbyData1.audios.map((a) => a.id);
  assert.ok(ids1.includes(idA), "Boardroom memo should be heard");
  assert.ok(!ids1.includes(idB), "Pantry memo (180px away) should NOT be heard within 80px radius");
  console.log(`✓ Correctly heard Boardroom memo only! Distance text: "${nearbyData1.audios[0].distanceText}"`);

  // 4. Query proximity standing in Reception & Lobby (275, 810) with radius 100
  console.log("3. Testing acoustic hearing from Reception (275, 810) with radius 100...");
  const nearbyRes2 = await fetch(`${API_BASE}/api/audio/nearby?x=275&y=810&radius=100`);
  const nearbyData2 = await nearbyRes2.json();
  const ids2 = nearbyData2.audios.map((a) => a.id);
  assert.ok(!ids2.includes(idA), "Boardroom should not be audible from Reception");
  assert.ok(!ids2.includes(idB), "Pantry should not be audible from Reception");
  console.log("✓ Zero leakage: far voice memos are properly out of hearing range.");

  // 5. Expand hearing radius to whole floor (600px)
  console.log("4. Testing acoustic hearing across entire floor (radius 800)...");
  const nearbyRes3 = await fetch(`${API_BASE}/api/audio/nearby?x=275&y=810&radius=800`);
  const nearbyData3 = await nearbyRes3.json();
  const ids3 = nearbyData3.audios.map((a) => a.id);
  assert.ok(ids3.includes(idA), "Boardroom memo heard across floor");
  assert.ok(ids3.includes(idB), "Pantry memo heard across floor");
  console.log("✓ Whole floor scan successfully heard both memos.");

  // Clean up test memos
  console.log("5. Cleaning up test office voice memos...");
  await fetch(`${API_BASE}/api/audio/${idA}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  await fetch(`${API_BASE}/api/audio/${idB}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  console.log("✓ Cleanup finished.");

  console.log("🎉 ALL CORPORATE OFFICE PROXIMITY TESTS PASSED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
