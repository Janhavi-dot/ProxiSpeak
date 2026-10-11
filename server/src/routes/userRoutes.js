import { Router } from "express";
import { userController } from "../controllers/userController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.get("/me", authenticate, userController.getProfile);
router.patch("/me", authenticate, userController.updateProfile);

export default router;
