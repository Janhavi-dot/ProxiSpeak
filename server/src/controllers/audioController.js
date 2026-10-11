import { Audio } from "../models/Audio.js";
import { deleteAudioFile, getAudioUrl } from "../config/storage.js";
import { formatDistance, isValidCoordinate } from "../utils/distance.js";

export const audioController = {
  /**
   * Upload and publish an audio experience
   * POST /api/audio (multipart/form-data)
   */
  async uploadAudio(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No audio file provided. Please record or upload an audio file.",
        });
      }

      const {
        title,
        description,
        category,
        x,
        y,
        zone,
        floor,
        latitude,
        longitude,
        radius,
        duration,
        visibility,
      } = req.body;

      if (!title || title.trim().length === 0) {
        await deleteAudioFile(req.file.filename);
        return res.status(400).json({
          success: false,
          error: "Voice note title is required.",
        });
      }

      // Check if office coordinates (x, y) or GPS coordinates are present
      const hasOfficeCoords = Number.isFinite(Number(x)) && Number.isFinite(Number(y));
      const hasGpsCoords = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

      if (!hasOfficeCoords && !hasGpsCoords) {
        await deleteAudioFile(req.file.filename);
        return res.status(400).json({
          success: false,
          error: "Location coordinates (office x/y or latitude/longitude) are required.",
        });
      }

      const audio = await Audio.create({
        title,
        description,
        category,
        fileName: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        duration: parseFloat(duration) || 0,
        x: hasOfficeCoords ? Number(x) : 250,
        y: hasOfficeCoords ? Number(y) : 350,
        zone: zone || "Open Office",
        floor: floor || "Floor 4",
        lat: hasGpsCoords ? parseFloat(latitude) : 16.5062,
        lng: hasGpsCoords ? parseFloat(longitude) : 80.6480,
        radius: parseInt(radius) || 200,
        visibility: visibility || "public",
        userId: req.user.id,
        userName: req.user.name,
        userAvatar: req.user.avatar,
      });

      const audioWithUrl = {
        ...audio,
        audioUrl: getAudioUrl(audio.fileName, req),
        distanceText: `Here (${audio.zone || "Desk"})`,
      };

      if (req.app.get("io")) {
        const io = req.app.get("io");
        io.emit("audio:created", audioWithUrl);
      }

      res.status(201).json({
        success: true,
        message: "Office voice note published successfully.",
        audio: audioWithUrl,
      });
    } catch (error) {
      if (req.file) {
        await deleteAudioFile(req.file.filename);
      }
      next(error);
    }
  },

  /**
   * Discover audio experiences nearby (supports office x/y and GPS lat/lng)
   * GET /api/audio/nearby
   */
  async getNearbyAudio(req, res, next) {
    try {
      const { x, y, zone, lat, lng, radius, category, search, sort } = req.query;

      const hasOffice = x !== undefined && y !== undefined && Number.isFinite(Number(x)) && Number.isFinite(Number(y));
      const hasGps = lat !== undefined && lng !== undefined;

      if (!hasOffice && !hasGps) {
        return res.status(400).json({
          success: false,
          error: "Either office coordinates (x and y) or GPS coordinates (lat and lng) are required.",
        });
      }

      const nRadius = parseInt(radius) || (hasOffice ? 250 : 1000);

      const audios = await Audio.findNearby({
        x: hasOffice ? Number(x) : undefined,
        y: hasOffice ? Number(y) : undefined,
        zone,
        lat: hasGps ? parseFloat(lat) : undefined,
        lng: hasGps ? parseFloat(lng) : undefined,
        radius: nRadius,
        category,
        search,
        sort,
      });

      const audiosWithUrls = audios.map((a) => {
        let distanceText = "Nearby";
        if (a.distance !== undefined) {
          if (hasOffice) {
            distanceText = a.distance <= 20 ? `Here in ${a.zone || "Room"}` : `${a.distance} ft away`;
          } else {
            distanceText = formatDistance(a.distance);
          }
        }

        return {
          ...a,
          audioUrl: getAudioUrl(a.fileName, req),
          distanceText,
        };
      });

      res.json({
        success: true,
        count: audiosWithUrls.length,
        radius: nRadius,
        coordinates: hasOffice ? { x: Number(x), y: Number(y) } : { lat: parseFloat(lat), lng: parseFloat(lng) },
        audios: audiosWithUrls,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get recordings uploaded by current user
   * GET /api/audio/mine
   */
  async getMyAudio(req, res, next) {
    try {
      const audios = await Audio.findByUserId(req.user.id);
      const audiosWithUrls = audios.map((a) => ({
        ...a,
        audioUrl: getAudioUrl(a.fileName, req),
        distanceText: "Your recording",
      }));

      res.json({
        success: true,
        count: audiosWithUrls.length,
        audios: audiosWithUrls,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get specific audio details
   * GET /api/audio/:id
   */
  async getAudioById(req, res, next) {
    try {
      const audio = await Audio.findById(req.params.id);
      if (!audio) {
        return res.status(404).json({
          success: false,
          error: "Audio experience not found.",
        });
      }

      // Track playback count
      await Audio.incrementPlays(req.params.id);

      res.json({
        success: true,
        audio: {
          ...audio,
          audioUrl: getAudioUrl(audio.fileName, req),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update audio metadata
   * PATCH /api/audio/:id
   */
  async updateAudio(req, res, next) {
    try {
      const updated = await Audio.update(req.params.id, req.user.id, req.body);
      res.json({
        success: true,
        message: "Audio updated successfully.",
        audio: {
          ...updated,
          audioUrl: getAudioUrl(updated.fileName, req),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete audio experience and its file from storage
   * DELETE /api/audio/:id
   */
  async deleteAudio(req, res, next) {
    try {
      const deletedDoc = await Audio.delete(req.params.id, req.user.id);
      if (deletedDoc && deletedDoc.fileName) {
        await deleteAudioFile(deletedDoc.fileName);
      }

      // Notify real-time socket subscribers of deletion
      if (req.app.get("io")) {
        const io = req.app.get("io");
        io.emit("audio:deleted", { id: req.params.id });
      }

      res.json({
        success: true,
        message: "Audio experience deleted successfully.",
        id: req.params.id,
      });
    } catch (error) {
      next(error);
    }
  },
};
