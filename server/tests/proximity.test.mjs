const API_URL = "http://localhost:5000";

async function runProximityTests() {
  console.log("=== Running Geospatial Proximity & 2dsphere Tests ===");

  // 1. Authenticate with Admin Credentials (admin@proxispeak.com)
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@proxispeak.com",
      password: "admin123",
    }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    throw new Error(`Admin login failed in proximity test: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;

  // Helper to upload audio at specific coordinates
  async function uploadTestAudio(title, category, lat, lng) {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("category", category);
    formData.append("latitude", lat.toString());
    formData.append("longitude", lng.toString());
    formData.append("radius", "500");
    formData.append(
      "audio",
      new Blob([Buffer.from("dummy-audio-data")], { type: "audio/webm" }),
      "test.webm"
    );

    const res = await fetch(`${API_URL}/api/audio`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Upload failed for ${title}: ${JSON.stringify(data)}`);
    return data.audio;
  }

  console.log("1. Uploading test audios at real geographic locations...");
  // Reference point: Campus Library (16.5062, 80.6480)
  const a1 = await uploadTestAudio("Campus Library Guide", "story", 16.5062, 80.6480);
  // ~190m away: Student Cafeteria
  const a2 = await uploadTestAudio("Cafeteria Lunch Special", "event", 16.5075, 80.6492);
  // ~1.8km away: City Center Plaza
  const a3 = await uploadTestAudio("City Center Concert", "music", 16.5180, 80.6600);

  console.log(`Uploaded 3 items: Library (${a1.id}), Cafeteria (${a2.id}), City Center (${a3.id})`);

  try {
    // Test 2: Search with 300m radius from Library
    console.log("\n2. Testing nearby discovery with 300m radius from Library...");
    const near300Res = await fetch(
      `${API_URL}/api/audio/nearby?lat=16.5062&lng=80.6480&radius=300`
    );
    const near300Data = await near300Res.json();

    if (!near300Res.ok) {
      throw new Error(`Nearby query failed: ${JSON.stringify(near300Data)}`);
    }

    const foundIds300 = near300Data.audios.map((a) => a.id);
    console.log(`Found ${foundIds300.length} items within 300m:`, foundIds300);

    const hasLibrary = foundIds300.includes(a1.id);
    const hasCafeteria = foundIds300.includes(a2.id);
    const hasCityCenter = foundIds300.includes(a3.id);

    if (!hasLibrary || !hasCafeteria || hasCityCenter) {
      throw new Error(
        `Proximity radius 300m failed: Expected Library and Cafeteria, but NOT City Center. Got: ${JSON.stringify(
          foundIds300
        )}`
      );
    }
    console.log("✓ Correctly returned only audios within 300m hearing radius!");

    // Test 3: Search with 2500m radius (should include all 3)
    console.log("\n3. Testing nearby discovery with 2500m radius...");
    const near2500Res = await fetch(
      `${API_URL}/api/audio/nearby?lat=16.5062&lng=80.6480&radius=2500`
    );
    const near2500Data = await near2500Res.json();
    const foundIds2500 = near2500Data.audios.map((a) => a.id);

    if (
      !foundIds2500.includes(a1.id) ||
      !foundIds2500.includes(a2.id) ||
      !foundIds2500.includes(a3.id)
    ) {
      throw new Error(`Expected all 3 audios within 2500m radius.`);
    }

    // Verify distance sorting
    const distances = near2500Data.audios.map((a) => a.distance);
    console.log("Calculated distances (meters):", distances);
    for (let i = 1; i < distances.length; i++) {
      if (distances[i] < distances[i - 1]) {
        throw new Error("Results are not properly sorted by distance ascending.");
      }
    }
    console.log("✓ Correctly returned all 3 audios sorted by ascending distance!");

    // Test 4: Category filter
    console.log("\n4. Testing category filtering (category=event)...");
    const eventRes = await fetch(
      `${API_URL}/api/audio/nearby?lat=16.5062&lng=80.6480&radius=2500&category=event`
    );
    const eventData = await eventRes.json();
    const eventIds = eventData.audios.map((a) => a.id);
    if (!eventIds.includes(a2.id) || eventIds.includes(a1.id) || eventIds.includes(a3.id)) {
      throw new Error(
        `Category filter failed: Expected only Cafeteria event, got: ${JSON.stringify(
          eventIds
        )}`
      );
    }
    console.log("✓ Category filter correctly matched only 'event' items!");

    console.log("\n🎉 ALL GEOSPATIAL PROXIMITY TESTS PASSED!");
  } finally {
    // Cleanup
    console.log("\nCleaning up test audio recordings...");
    for (const audio of [a1, a2, a3]) {
      await fetch(`${API_URL}/api/audio/${audio.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    console.log("Cleanup complete.");
  }
}

runProximityTests().catch((err) => {
  console.error("Proximity tests failed:", err);
  process.exit(1);
});
