import rateLimit from "express-rate-limit";

// Rate limit for authentication endpoints (prevent brute-force logins)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

// Rate limit for audio uploads (prevent storage spam)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 40, // 40 audio uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Audio upload limit reached. Please wait before publishing more recordings.",
  },
});

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 600 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please slow down.",
  },
});
