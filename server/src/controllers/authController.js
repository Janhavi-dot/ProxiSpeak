import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const JWT_EXPIRES_IN = "7d";

function generateToken(user) {
  const secret = process.env.JWT_SECRET || "default_jwt_secret_proxispeak";
  return jwt.sign(
    {
      id: user.id || user._id.toString(),
      email: user.email,
      name: user.name,
    },
    secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export const authController = {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      const { name, email, password, avatar } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: "Full name must be at least 2 characters.",
        });
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Please provide a valid email address.",
        });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          error: "Password must be at least 6 characters long.",
        });
      }

      const user = await User.create({ name, email, password, avatar });
      const token = generateToken(user);

      res.status(201).json({
        success: true,
        message: "Account created successfully.",
        token,
        user,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Log in an existing user
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: "Email and password are required.",
        });
      }

      const rawUser = await User.findByEmail(email);
      if (!rawUser) {
        return res.status(401).json({
          success: false,
          error: "Invalid email or password credentials.",
        });
      }

      const isMatch = await User.verifyPassword(password, rawUser.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: "Invalid email or password credentials.",
        });
      }

      const user = User.sanitize(rawUser);
      const token = generateToken(user);

      res.json({
        success: true,
        message: "Logged in successfully.",
        token,
        user,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current authenticated user profile
   * GET /api/users/me
   */
  async getMe(req, res) {
    res.json({
      success: true,
      user: req.user,
    });
  },
};
