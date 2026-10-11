import { Router } from "express";
import { OfficeLayout, DEFAULT_OFFICE_LAYOUT } from "../models/OfficeLayout.js";

const router = Router();

// GET /api/office/layout - Retrieve office floor plan layout, rooms, and acoustic obstacles
router.get("/layout", async (req, res) => {
  try {
    const layout = await OfficeLayout.getLayout(req.query.floorId || "floor-4");
    res.json({ success: true, layout });
  } catch (error) {
    res.json({ success: true, layout: DEFAULT_OFFICE_LAYOUT });
  }
});

// GET /api/office/occlusion - Compute acoustic occlusion factor between two avatars
router.get("/occlusion", (req, res) => {
  const { x1, y1, x2, y2 } = req.query;
  const p1x = parseFloat(x1);
  const p1y = parseFloat(y1);
  const p2x = parseFloat(x2);
  const p2y = parseFloat(y2);

  if (isNaN(p1x) || isNaN(p1y) || isNaN(p2x) || isNaN(p2y)) {
    return res.status(400).json({ success: false, error: "Valid x1, y1, x2, y2 coordinates required." });
  }

  const occlusion = OfficeLayout.calculateOcclusion(p1x, p1y, p2x, p2y);
  res.json({ success: true, occlusion, isObstructed: occlusion > 0.3 });
});

export default router;
