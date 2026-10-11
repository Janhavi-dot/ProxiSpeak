export const OFFICE_ZONES = [
  { id: "reception", name: "Modern Reception Lobby", x: 220, y: 190, icon: "🏢", desc: "Main entrance & guest greeting lounge" },
  { id: "boardroom", name: "Executive Glass Boardroom", x: 580, y: 200, icon: "📊", desc: "14-person presentation & sync suite" },
  { id: "pod_a", name: "Dev Pod A (Frontend & Mobile)", x: 480, y: 530, icon: "💻", desc: "Client & UI engineering workstations" },
  { id: "pod_b", name: "Dev Pod B (Backend & AI)", x: 640, y: 530, icon: "⚙️", desc: "Platform & services workstations" },
  { id: "pod_c", name: "Dev Pod C (DevOps & QA)", x: 780, y: 530, icon: "🧪", desc: "Infrastructure & test workstations" },
  { id: "lounge", name: "Cozy Coffee Lounge & Pantry", x: 200, y: 640, icon: "☕", desc: "Barista counter & breakout lounge" },
  { id: "focus_cabins", name: "Soundproof Focus Cabins", x: 600, y: 685, icon: "🎧", desc: "Private acoustic call booths" },
  { id: "executive_suites", name: "Executive Focus Suites", x: 910, y: 530, icon: "💼", desc: "Private director offices" },
  { id: "utility", name: "Print & Utility Hub", x: 860, y: 210, icon: "🖨️", desc: "Document center & archives" },
];

export function getOfficeZone(x, y) {
  if (y < 330) {
    if (x < 390) return "Modern Reception Lobby";
    if (x >= 390 && x < 770) return "Executive Glass Boardroom";
    return "Print & Utility Hub";
  }
  if (x < 350) return "Cozy Coffee Lounge & Pantry";
  if (x >= 850) return "Executive Focus Suites";
  if (y >= 640) return "Soundproof Focus Cabins";
  if (x < 560) return "Dev Pod A (Frontend & Mobile)";
  if (x >= 560 && x < 710) return "Dev Pod B (Backend & AI)";
  return "Dev Pod C (DevOps & QA)";
}
