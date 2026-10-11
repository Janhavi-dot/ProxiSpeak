import assert from "node:assert/strict";

const API_BASE = "http://localhost:5000";

async function run() {
  console.log("=== Running End-to-End Spatial Audio Broadcast & Listener Verification ===");

  // 1. Admin Login Verification
  console.log("1. Verifying Admin account login (admin@proxispeak.com)...");
  const adminRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@proxispeak.com", password: "admin123" }),
  });
  const adminData = await adminRes.json();
  assert.equal(adminRes.status, 200, "Admin login must succeed");
  assert.ok(adminData.token, "Admin must receive JWT token");
  const adminToken = adminData.token;
  console.log(`✓ Admin authenticated: ${adminData.user.name} (${adminData.user.email})`);

  // 2. New Account Registration Verification
  console.log("2. Verifying New Account registration (employee@proxispeak.com)...");
  const testEmail = `employee_${Date.now()}@proxispeak.com`;
  const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Dev Employee",
      email: testEmail,
      password: "password123",
      department: "Engineering",
      role: "developer",
    }),
  });
  const registerData = await registerRes.json();
  assert.equal(registerRes.status, 201, "New user registration must succeed");
  assert.ok(registerData.token, "New user must receive JWT token");
  const userToken = registerData.token;
  const userId = registerData.user.id;
  console.log(`✓ New account created & authenticated: ${registerData.user.name} (${registerData.user.email})`);

  // 3. Admin Adding Audio Broadcast (anchored at Modern Reception Lobby: x=220, y=190)
  console.log("3. Admin broadcasting spatial audio at Modern Reception Lobby (X: 220, Y: 190)...");
  const dummyWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
  
  const fdAdmin = new FormData();
  fdAdmin.append("title", "All-Hands Townhall Audio Memo");
  fdAdmin.append("description", "Company-wide townhall recording anchored at main lobby");
  fdAdmin.append("category", "announcement");
  fdAdmin.append("x", "220");
  fdAdmin.append("y", "190");
  fdAdmin.append("zone", "Modern Reception Lobby");
  fdAdmin.append("radius", "120");
  fdAdmin.append("duration", "18");
  fdAdmin.append("audio", new Blob([dummyWebm], { type: "audio/webm" }), "admin_broadcast.webm");

  const adminBroadcastRes = await fetch(`${API_BASE}/api/audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: fdAdmin,
  });
  const adminBroadcastData = await adminBroadcastRes.json();
  assert.equal(adminBroadcastRes.status, 201, "Admin broadcast upload must succeed");
  const adminBeaconId = adminBroadcastData.audio.id;
  assert.ok(adminBroadcastData.audio.audioUrl, "Must generate valid audio stream URL");
  console.log(`✓ Admin audio broadcast created! ID: ${adminBeaconId}, URL: ${adminBroadcastData.audio.audioUrl}`);

  // 4. New Account Adding Audio Broadcast (anchored at Dev Pod Alpha: x=480, y=180)
  console.log("4. New Account broadcasting spatial audio at Dev Pod Alpha (X: 480, Y: 180)...");
  const fdUser = new FormData();
  fdUser.append("title", "Sprint Retrospective Voice Notes");
  fdUser.append("description", "Sprint 4 retrospective highlights from dev pod");
  fdUser.append("category", "memo");
  fdUser.append("x", "480");
  fdUser.append("y", "180");
  fdUser.append("zone", "Dev Pod Alpha");
  fdUser.append("radius", "100");
  fdUser.append("duration", "25");
  fdUser.append("audio", new Blob([dummyWebm], { type: "audio/webm" }), "sprint_notes.webm");

  const userBroadcastRes = await fetch(`${API_BASE}/api/audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: fdUser,
  });
  const userBroadcastData = await userBroadcastRes.json();
  assert.equal(userBroadcastRes.status, 201, "New user broadcast upload must succeed");
  const userBeaconId = userBroadcastData.audio.id;
  console.log(`✓ New user audio broadcast created! ID: ${userBeaconId}, URL: ${userBroadcastData.audio.audioUrl}`);

  // 5. Listener Walking to Reception Lobby (X: 224, Y: 192) - within 100px
  console.log("5. Listener Avatar walking to Modern Reception Lobby (X: 224, Y: 192)...");
  const lobbyNearbyRes = await fetch(`${API_BASE}/api/audio/nearby?x=224&y=192&radius=100`);
  const lobbyNearbyData = await lobbyNearbyRes.json();
  assert.equal(lobbyNearbyRes.status, 200);

  const lobbyAudioIds = lobbyNearbyData.audios.map((a) => a.id);
  assert.ok(lobbyAudioIds.includes(adminBeaconId), "Admin's Lobby broadcast MUST be heard by avatar in Lobby");
  assert.ok(!lobbyAudioIds.includes(userBeaconId), "Dev Pod broadcast (260px away) MUST NOT be heard in Lobby");
  console.log(`✓ Spatial hearing verified: Only Admin broadcast heard in Lobby. Distance: ${lobbyNearbyData.audios[0].distance}px (${lobbyNearbyData.audios[0].distanceText})`);

  // 6. Listener Walking to Dev Pod Alpha (X: 482, Y: 182) - within 100px
  console.log("6. Listener Avatar walking to Dev Pod Alpha (X: 482, Y: 182)...");
  const podNearbyRes = await fetch(`${API_BASE}/api/audio/nearby?x=482&y=182&radius=100`);
  const podNearbyData = await podNearbyRes.json();
  assert.equal(podNearbyRes.status, 200);

  const podAudioIds = podNearbyData.audios.map((a) => a.id);
  assert.ok(podAudioIds.includes(userBeaconId), "New user's Dev Pod broadcast MUST be heard by avatar in Pod");
  assert.ok(!podAudioIds.includes(adminBeaconId), "Lobby broadcast (262px away) MUST NOT be heard in Pod");
  console.log(`✓ Spatial hearing verified: Only Dev Pod broadcast heard in Pod. Distance: ${podNearbyData.audios[0].distance}px (${podNearbyData.audios[0].distanceText})`);

  // 7. Full Floor Scan (Sidebar Radar Directory)
  console.log("7. Scanning all active audio stations across entire virtual office floor (radius=800)...");
  const floorRes = await fetch(`${API_BASE}/api/audio/nearby?x=220&y=190&radius=800`);
  const floorData = await floorRes.json();
  const floorAudioIds = floorData.audios.map((a) => a.id);
  assert.ok(floorAudioIds.includes(adminBeaconId), "Lobby broadcast present in floor radar");
  assert.ok(floorAudioIds.includes(userBeaconId), "Dev Pod broadcast present in floor radar");
  console.log(`✓ Full floor radar returned ${floorData.count} active desk stations.`);

  // 8. Clean up created broadcasts & test user
  console.log("8. Cleaning up test broadcasts...");
  const delAdmin = await fetch(`${API_BASE}/api/audio/${adminBeaconId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(delAdmin.status, 200);

  const delUser = await fetch(`${API_BASE}/api/audio/${userBeaconId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(delUser.status, 200);
  console.log("✓ Test broadcasts deleted successfully.");

  console.log("🎉 ALL BROADCAST ADDITION & SPATIAL LISTENING TESTS PASSED 100%!");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
