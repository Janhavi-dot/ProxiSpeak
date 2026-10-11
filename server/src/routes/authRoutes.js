import { Router } from "express";
import { authController } from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.get("/me", authenticate, authController.getMe);

export default router;
