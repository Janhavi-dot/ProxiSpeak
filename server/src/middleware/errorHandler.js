import multer from "multer";

export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, next) {
  // Log error for server observability without leaking secrets
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

  // Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "File size exceeds the 15 MB limit. Please record a shorter audio note.",
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: "A record with this unique field already exists.",
    });
  }

  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);

  res.status(statusCode).json({
    success: false,
    error: err.message || "An unexpected internal server error occurred.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}
