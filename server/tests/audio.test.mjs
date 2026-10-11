import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const API_URL = "http://localhost:5000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runAudioTests() {
  console.log("=== Running Audio Upload & Management Tests ===");

  // 1. Log in with Admin Credentials (admin@proxispeak.com)
  const adminLoginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@proxispeak.com",
      password: "admin123",
    }),
  });
  const adminData = await adminLoginRes.json();
  const tokenA = adminData.token;

  // 2. Create User B (Guest / Other User for testing authorization checks)
  const guestEmail = "guest@proxispeak.com";
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db("proxispeak");
  await db.collection("users").deleteOne({ email: guestEmail });

  const userBRes = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Guest Listener",
      email: guestEmail,
      password: "Password123!",
    }),
  });
  const userBData = await userBRes.json();
  const tokenB = userBData.token;

  // 3. Test Audio Upload (multipart/form-data)
  console.log("1. Testing Audio Upload...");
  const fakeAudioContent = Buffer.from(
    "ID3\x04\x00\x00\x00\x00\x00#TSSE\x00\x00\x00\x0f\x00\x00\x01\xff\xfeLavf60.16.100"
  );

  const formData = new FormData();
  formData.append("title", "Campus Central Fountain Voice Note");
  formData.append("description", "Acoustics near the library water fountain.");
  formData.append("category", "ambient");
  formData.append("latitude", "16.5062");
  formData.append("longitude", "80.6480");
  formData.append("radius", "300");
  formData.append("duration", "42");
  formData.append(
    "audio",
    new Blob([fakeAudioContent], { type: "audio/webm" }),
    "sample_voice.webm"
  );

  const uploadRes = await fetch(`${API_URL}/api/audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
    },
    body: formData,
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.audio || !uploadData.audio.id) {
    throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
  }
  const audioId = uploadData.audio.id;
  const fileName = uploadData.audio.fileName;
  console.log(`✓ Audio uploaded by admin! ID: ${audioId}, File: ${fileName}`);

  // Check file on disk
  const filePath = path.resolve(__dirname, "../uploads/audio", fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Uploaded file was not found on disk at: ${filePath}`);
  }
  console.log("✓ Uploaded audio verified on disk in server/uploads/audio/.");

  // 4. Test Fetch Audio by ID
  console.log("2. Testing Audio Retrieval by ID...");
  const getRes = await fetch(`${API_URL}/api/audio/${audioId}`);
  const getData = await getRes.json();
  if (!getRes.ok || getData.audio.title !== "Campus Central Fountain Voice Note") {
    throw new Error(`Failed to fetch audio: ${JSON.stringify(getData)}`);
  }
  console.log("✓ Audio retrieved with full details & stream URL.");

  // 5. Test Update Metadata
  console.log("3. Testing Metadata Update (PATCH)...");
  const updateRes = await fetch(`${API_URL}/api/audio/${audioId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      title: "Updated Fountain Note",
      description: "Updated description with more details.",
    }),
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok || updateData.audio.title !== "Updated Fountain Note") {
    throw new Error(`Failed to update audio: ${JSON.stringify(updateData)}`);
  }
  console.log("✓ Metadata updated successfully.");

  // 6. Test Unauthorized Delete by User B
  console.log("4. Testing Unauthorized Deletion Prevention...");
  const unauthorizedDeleteRes = await fetch(`${API_URL}/api/audio/${audioId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (unauthorizedDeleteRes.status !== 403) {
    throw new Error(
      `Expected 403 Forbidden for non-owner delete, got: ${unauthorizedDeleteRes.status}`
    );
  }
  console.log("✓ Unauthorized delete prevented (HTTP 403 Forbidden).");

  // 7. Test Authorized Delete by Owner (Admin)
  console.log("5. Testing Authorized Deletion by Owner...");
  const authorizedDeleteRes = await fetch(`${API_URL}/api/audio/${audioId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const deleteData = await authorizedDeleteRes.json();
  if (!authorizedDeleteRes.ok || !deleteData.success) {
    throw new Error(`Failed to delete audio: ${JSON.stringify(deleteData)}`);
  }

  // Verify file removed from disk
  if (fs.existsSync(filePath)) {
    throw new Error(`File was NOT removed from disk after deletion: ${filePath}`);
  }
  console.log("✓ Audio deleted from database and file unlinked from disk.");

  // Cleanup guest user
  await db.collection("users").deleteOne({ email: guestEmail });
  await mongoClient.close();
  console.log("✓ Cleaned up temporary guest user.");

  console.log("🎉 ALL AUDIO TESTS PASSED!\n");
}

runAudioTests().catch((err) => {
  console.error("Audio tests failed:", err);
  process.exit(1);
});
