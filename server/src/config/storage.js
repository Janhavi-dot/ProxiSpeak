import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure audio upload directory exists
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads/audio");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || getExtensionFromMime(file.mimetype);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `audio-${uniqueSuffix}${ext}`);
  },
});

function getExtensionFromMime(mime) {
  switch (mime) {
    case "audio/webm":
      return ".webm";
    case "audio/mp4":
    case "audio/m4a":
      return ".m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    default:
      return ".audio";
  }
}

// File filter: accept only audio formats
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "audio/webm",
    "audio/mp4",
    "audio/m4a",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/aac",
    "video/webm", // MediaRecorder in Chrome sometimes emits video/webm container for audio-only
  ];

  if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported audio format (${file.mimetype}). Please upload an audio file (mp3, webm, wav, ogg, m4a).`
      ),
      false
    );
  }
};

// Max 15 MB audio file limit
export const uploadAudioMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

/**
 * Remove an audio file from local disk
 */
export async function deleteAudioFile(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(filename));
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete audio file (${filename}):`, error.message);
  }
}

/**
 * Resolve full publicly accessible URL for an audio file
 */
export function getAudioUrl(filename, req) {
  if (!filename) return "";
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/uploads/audio/${path.basename(filename)}`;
}

export { UPLOAD_DIR };
