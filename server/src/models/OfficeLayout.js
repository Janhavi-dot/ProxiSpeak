import { getDb } from "../config/database.js";

// Standard Floor 4 Virtual Office Layout (Normalized 1000 x 750 space)
export const DEFAULT_OFFICE_LAYOUT = {
  floorId: "floor-4",
  floorName: "Virtual HQ • Floor 4 (Engineering & Collaboration)",
  width: 1000,
  height: 750,
  rooms: [
    {
      id: "reception",
      name: "Modern Reception Lobby",
      icon: "🏢",
      bounds: { x: 40, y: 40, width: 340, height: 280 },
      spawn: { x: 220, y: 190 },
      desc: "Main office entrance & guest greeting lounge",
    },
    {
      id: "boardroom",
      name: "Executive Glass Boardroom",
      icon: "📊",
      bounds: { x: 390, y: 40, width: 380, height: 280 },
      spawn: { x: 580, y: 200 },
      desc: "14-person presentation & quarterly sync suite",
    },
    {
      id: "utility",
      name: "Print & Utility Hub",
      icon: "🖨️",
      bounds: { x: 780, y: 40, width: 180, height: 280 },
      spawn: { x: 860, y: 210 },
      desc: "Document center & archives",
    },
    {
      id: "lounge",
      name: "Cozy Coffee Lounge & Pantry",
      icon: "☕",
      bounds: { x: 40, y: 330, width: 300, height: 380 },
      spawn: { x: 200, y: 640 },
      desc: "Barista counter & breakout lounge",
    },
    {
      id: "dev_pods",
      name: "Main Open-Plan Dev Area",
      icon: "💻",
      bounds: { x: 350, y: 330, width: 490, height: 310 },
      spawn: { x: 630, y: 530 },
      desc: "Collaborative engineering pods (Frontend, Backend, QA)",
    },
    {
      id: "focus_cabins",
      name: "Soundproof Focus Cabins",
      icon: "🎧",
      bounds: { x: 350, y: 645, width: 490, height: 75 },
      spawn: { x: 600, y: 685 },
      desc: "Individual sound-insulated phone and call booths",
    },
    {
      id: "executive_suites",
      name: "Executive Focus Suites",
      icon: "💼",
      bounds: { x: 850, y: 330, width: 110, height: 390 },
      spawn: { x: 910, y: 530 },
      desc: "Private director offices & 1-on-1 interview cabins",
    },
  ],
  // Sound-blocking architectural obstacles (walls & glass partitions)
  obstacles: [
    // Outer boundary walls
    { id: "wall-top", x1: 40, y1: 40, x2: 960, y2: 40, type: "wall", occlusion: 1.0 },
    { id: "wall-bottom", x1: 40, y1: 720, x2: 960, y2: 720, type: "wall", occlusion: 1.0 },
    { id: "wall-left", x1: 40, y1: 40, x2: 40, y2: 720, type: "wall", occlusion: 1.0 },
    { id: "wall-right", x1: 960, y1: 40, x2: 960, y2: 720, type: "wall", occlusion: 1.0 },

    // Boardroom glass wall partitions (damps sound, allows visibility)
    { id: "boardroom-left-glass", x1: 390, y1: 40, x2: 390, y2: 320, type: "glass", occlusion: 0.55 },
    { id: "boardroom-bottom-glass", x1: 390, y1: 320, x2: 770, y2: 320, type: "glass", occlusion: 0.55 },
    { id: "boardroom-right-wall", x1: 770, y1: 40, x2: 770, y2: 320, type: "wall", occlusion: 0.8 },

    // Coffee Lounge separation wall
    { id: "lounge-top-wall", x1: 40, y1: 320, x2: 340, y2: 320, type: "wall", occlusion: 0.75 },
    { id: "lounge-right-wall", x1: 340, y1: 320, x2: 340, y2: 720, type: "wall", occlusion: 0.75 },

    // Focus cabins separation barrier
    { id: "focus-cabins-divider", x1: 350, y1: 645, x2: 840, y2: 645, type: "soundproof", occlusion: 0.85 },

    // Executive suites separation wall
    { id: "exec-suites-divider", x1: 850, y1: 320, x2: 850, y2: 720, type: "glass", occlusion: 0.6 },
  ],
  // Physical furniture obstacles (collidable tables, desks)
  furniture: [
    // Boardroom conference table
    { id: "boardroom-table", x: 470, y: 150, width: 220, height: 90, label: "Conference Table" },
    // Dev Pod A Workstation
    { id: "pod-a-desks", x: 440, y: 440, width: 70, height: 180, label: "Dev Pod A Desks" },
    // Dev Pod B Workstation
    { id: "pod-b-desks", x: 590, y: 440, width: 70, height: 180, label: "Dev Pod B Desks" },
    // Dev Pod C Workstation
    { id: "pod-c-desks", x: 740, y: 440, width: 70, height: 180, label: "Dev Pod C Desks" },
    // Kitchen counter
    { id: "kitchen-counter", x: 70, y: 460, width: 220, height: 40, label: "Barista Counter" },
    // Reception desk
    { id: "reception-desk", x: 100, y: 140, width: 110, height: 50, label: "Reception Desk" },
  ],
};

/**
 * Line-segment intersection test helper
 */
function lineIntersects(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y) {
  const s1_x = p1_x - p0_x;
  const s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x;
  const s2_y = p3_y - p2_y;

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

export const OfficeLayout = {
  /**
   * Fetch current layout from MongoDB or return default
   */
  async getLayout(floorId = "floor-4") {
    try {
      const db = getDb();
      const collection = db.collection("office_layouts");
      const found = await collection.findOne({ floorId });
      if (found) return found;
    } catch {
      // Fallback to default if DB is not initialized yet
    }
    return DEFAULT_OFFICE_LAYOUT;
  },

  /**
   * Calculate acoustic sound occlusion factor between two points
   * Returns a value between 0.0 (unobstructed open air) and 1.0 (completely blocked)
   */
  calculateOcclusion(x1, y1, x2, y2, obstacles = DEFAULT_OFFICE_LAYOUT.obstacles) {
    let totalOcclusion = 0;

    for (const obs of obstacles) {
      if (lineIntersects(x1, y1, x2, y2, obs.x1, obs.y1, obs.x2, obs.y2)) {
        // Accumulate occlusion (capped at 0.95 so some sound can still seep through)
        totalOcclusion = Math.min(0.95, totalOcclusion + (obs.occlusion || 0.5));
      }
    }

    return Math.round(totalOcclusion * 100) / 100;
  },

  /**
   * Seed office layout into MongoDB
   */
  async seedLayout() {
    try {
      const db = getDb();
      const collection = db.collection("office_layouts");
      await collection.updateOne(
        { floorId: DEFAULT_OFFICE_LAYOUT.floorId },
        { $set: DEFAULT_OFFICE_LAYOUT },
        { upsert: true }
      );
      console.log("Seeded Floor 4 virtual office layout and architectural obstacles.");
    } catch (err) {
      console.warn("Office layout seeding notice:", err.message);
    }
  },
};
