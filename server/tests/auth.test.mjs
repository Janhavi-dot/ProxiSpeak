import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const API_URL = "http://localhost:5000";

async function runAuthTests() {
  console.log("=== Running Auth Integration Tests ===");

  // Test 1: Verify Seeded Admin Login
  console.log("1. Testing Login with Admin Credentials (admin@proxispeak.com)...");
  const adminLoginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@proxispeak.com",
      password: "admin123",
    }),
  });

  const adminData = await adminLoginRes.json();
  if (!adminLoginRes.ok || !adminData.token || adminData.user.email !== "admin@proxispeak.com") {
    throw new Error(`Admin login failed: ${JSON.stringify(adminData)}`);
  }
  console.log("✓ Admin login passed! Authenticated as ProxiSpeak Admin.");

  // Test 2: Access Protected Route with Admin Token
  console.log("2. Testing Access to Protected Route (/api/auth/me)...");
  const meRes = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminData.token}` },
  });
  const meData = await meRes.json();
  if (!meRes.ok || meData.user.email !== "admin@proxispeak.com") {
    throw new Error(`Protected route access failed: ${JSON.stringify(meData)}`);
  }
  console.log("✓ Protected route verified admin token.");

  // Test 3: Register a User
  const userEmail = "jane@proxispeak.com";
  console.log("3. Testing Registration (jane@proxispeak.com)...");

  // Ensure clean state for jane@proxispeak.com
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db("proxispeak");
  await db.collection("users").deleteOne({ email: userEmail });

  const regRes = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Jane Explorer",
      email: userEmail,
      password: "Password123!",
    }),
  });

  const regData = await regRes.json();
  if (!regRes.ok || !regData.token || regData.user.email !== userEmail) {
    throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  }
  console.log("✓ Registration passed! Received JWT token for jane@proxispeak.com.");

  // Test 4: Prevent Duplicate Email Registration
  console.log("4. Testing Duplicate Email Rejection...");
  const dupRes = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Duplicate Jane",
      email: userEmail,
      password: "somepassword",
    }),
  });
  if (dupRes.status !== 409) {
    throw new Error(`Expected 409 for duplicate registration, got ${dupRes.status}`);
  }
  console.log("✓ Duplicate email prevented (HTTP 409).");

  // Test 5: Reject Invalid Password
  console.log("5. Testing Login with Invalid Password...");
  const wrongLoginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: userEmail,
      password: "WrongPassword999",
    }),
  });
  if (wrongLoginRes.status !== 401) {
    throw new Error(`Expected 401 for wrong password, got ${wrongLoginRes.status}`);
  }
  console.log("✓ Invalid password rejected (HTTP 401).");

  // Cleanup jane test user so DB stays pristine
  await db.collection("users").deleteOne({ email: userEmail });
  await mongoClient.close();
  console.log("✓ Cleaned up temporary test user.");

  console.log("🎉 ALL AUTH TESTS PASSED!\n");
}

runAuthTests().catch((err) => {
  console.error("Auth tests failed:", err.message);
  process.exit(1);
});
