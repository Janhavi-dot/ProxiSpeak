import assert from "node:assert/strict";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:5000";

function createSocket() {
  return io(SERVER_URL, {
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitForEvent(socket, eventName, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event '${eventName}'`));
    }, timeout);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function run() {
  console.log("=== Running WebRTC Signaling & Spatial Proximity Tests ===");

  const socketA = createSocket();
  const socketB = createSocket();

  await Promise.all([
    new Promise((resolve) => socketA.on("connect", resolve)),
    new Promise((resolve) => socketB.on("connect", resolve)),
  ]);

  console.log(`✓ Connected Socket A (${socketA.id}) and Socket B (${socketB.id})`);

  // 1. Identify users
  socketA.emit("user:identify", { name: "Alice Engineer", avatar: "https://example.com/alice.png" });
  socketB.emit("user:identify", { name: "Bob Designer", avatar: "https://example.com/bob.png" });

  // 2. Initial placement: Socket A at (220, 190) and Socket B far away at (800, 600)
  socketA.emit("user:move", { x: 220, y: 190, zone: "Modern Reception Lobby", radius: 150 });
  socketB.emit("user:move", { x: 800, y: 600, zone: "Dev Pod C (DevOps & QA)", radius: 150 });

  await new Promise((r) => setTimeout(r, 100));

  // 3. Move Socket B into earshot of Socket A: (260, 200) -> distance ~41px (< 150px)
  console.log("1. Moving Socket B into earshot of Socket A (distance ~41px)...");
  const inRangePromiseA = waitForEvent(socketA, "webrtc:peer-in-range");
  const auditPromiseB = waitForEvent(socketB, "proximity:audit");

  socketB.emit("user:move", { x: 260, y: 200, zone: "Modern Reception Lobby", radius: 150 });

  const inRangeDataA = await inRangePromiseA;
  const auditDataB = await auditPromiseB;

  assert.equal(inRangeDataA.peerId, socketB.id, "Socket A should receive peer-in-range for Socket B");
  assert.ok(inRangeDataA.distance <= 150, "Distance should be within earshot");
  console.log(`✓ Earshot trigger verified! Peer entered at ${inRangeDataA.distance}px distance.`);

  // 4. Spatial Clustering Audit Benchmark (< 20ms)
  console.log(`2. Verifying spatial clustering performance (< 20ms benchmark)...`);
  assert.ok(auditDataB.under20msBenchmark, `Clustering must execute under 20ms (took ${auditDataB.executionMs}ms)`);
  console.log(`✓ Spatial clustering benchmark PASSED: ${auditDataB.executionMs}ms (< 20ms threshold).`);

  // 5. Test WebRTC Signaling Relay (Offer & Answer)
  console.log("3. Testing WebRTC offer/answer relay through signaling server...");
  const dummyOffer = { type: "offer", sdp: "v=0\r\no=alice 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n" };
  const dummyAnswer = { type: "answer", sdp: "v=0\r\no=bob 67890 2 IN IP4 127.0.0.1\r\ns=-\r\n" };

  const offerReceivedPromise = waitForEvent(socketB, "webrtc:offer");
  socketA.emit("webrtc:offer", { to: socketB.id, offer: dummyOffer });
  const offerReceived = await offerReceivedPromise;

  assert.equal(offerReceived.from, socketA.id, "Offer should be from Socket A");
  assert.equal(offerReceived.offer.type, "offer", "SDP offer received correctly");
  console.log("✓ WebRTC Offer successfully relayed from Alice to Bob.");

  const answerReceivedPromise = waitForEvent(socketA, "webrtc:answer");
  socketB.emit("webrtc:answer", { to: socketA.id, answer: dummyAnswer });
  const answerReceived = await answerReceivedPromise;

  assert.equal(answerReceived.from, socketB.id, "Answer should be from Socket B");
  assert.equal(answerReceived.answer.type, "answer", "SDP answer received correctly");
  console.log("✓ WebRTC Answer successfully relayed from Bob to Alice.");

  // 6. Test WebRTC ICE Candidate Relay
  const dummyCandidate = { candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 };
  const icePromise = waitForEvent(socketB, "webrtc:ice-candidate");
  socketA.emit("webrtc:ice-candidate", { to: socketB.id, candidate: dummyCandidate });
  const iceReceived = await icePromise;

  assert.equal(iceReceived.from, socketA.id);
  assert.equal(iceReceived.candidate.candidate, dummyCandidate.candidate);
  console.log("✓ WebRTC ICE candidate successfully relayed.");

  // 7. Move Socket B out of earshot (distance > 150px)
  console.log("4. Moving Socket B out of earshot (> 150px)...");
  const outOfRangePromiseA = waitForEvent(socketA, "webrtc:peer-out-of-range");
  socketB.emit("user:move", { x: 750, y: 550, zone: "Dev Pod C", radius: 150 });
  const outOfRangeData = await outOfRangePromiseA;

  assert.equal(outOfRangeData.peerId, socketB.id, "Socket A should receive peer-out-of-range for Socket B");
  console.log("✓ Peer out-of-range event fired! P2P audio connection successfully terminated.");

  // 8. Clean up
  socketA.disconnect();
  socketB.disconnect();
  console.log("🎉 ALL WEBRTC SIGNALING & SPATIAL CLUSTERING TESTS PASSED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
