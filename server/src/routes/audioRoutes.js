import { Router } from "express";
import { audioController } from "../controllers/audioController.js";
import { authenticate } from "../middleware/authenticate.js";
import { uploadAudioMiddleware } from "../config/storage.js";
import { uploadLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Public discovery endpoints
router.get("/nearby", audioController.getNearbyAudio);
router.get("/:id", audioController.getAudioById);

// Protected authenticated routes
router.post(
  "/",
  authenticate,
  uploadLimiter,
  uploadAudioMiddleware.single("audio"),
  audioController.uploadAudio
);
router.get("/mine/all", authenticate, audioController.getMyAudio);
router.patch("/:id", authenticate, audioController.updateAudio);
router.delete("/:id", authenticate, audioController.deleteAudio);

export default router;
