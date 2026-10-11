import { ObjectId } from "mongodb";
import { getCollections } from "../config/database.js";
import { createGeoJsonPoint, isValidCoordinate } from "../utils/distance.js";

export const Audio = {
  /**
   * Create and index a new Audio experience (supports both Office x,y and GPS lat,lng)
   */
  async create({
    title,
    description = "",
    category = "general",
    fileName,
    fileSize,
    mimeType,
    duration = 0,
    x,
    y,
    zone = "Main Workspace",
    floor = "Floor 4",
    lat,
    lng,
    radius = 200,
    visibility = "public",
    userId,
    userName,
    userAvatar,
  }) {
    const { audios } = getCollections();

    // Determine planar office coordinates or geographic coordinates
    const hasOfficeCoords = Number.isFinite(Number(x)) && Number.isFinite(Number(y));
    const posX = hasOfficeCoords ? Number(x) : 250;
    const posY = hasOfficeCoords ? Number(y) : 350;

    const nLat = Number.isFinite(Number(lat)) ? Number(lat) : 16.5062;
    const nLng = Number.isFinite(Number(lng)) ? Number(lng) : 80.6480;

    const audioDoc = {
      title: title.trim(),
      description: (description || "").trim(),
      category: (category || "desk_note").toLowerCase().trim(),
      fileName,
      fileSize: Number(fileSize) || 0,
      mimeType: mimeType || "audio/webm",
      duration: Number(duration) || 0,
      x: posX,
      y: posY,
      zone: zone || "Main Workspace",
      floor: floor || "Floor 4",
      location: createGeoJsonPoint(nLat, nLng),
      radius: Math.max(20, Math.min(20000, Number(radius) || 200)),
      visibility: ["public", "unlisted", "private"].includes(visibility)
        ? visibility
        : "public",
      userId: typeof userId === "string" ? new ObjectId(userId) : userId,
      userName: userName || "Colleague",
      userAvatar: userAvatar || "",
      playsCount: 0,
      reported: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await audios.insertOne(audioDoc);
    audioDoc._id = result.insertedId;
    return this.format(audioDoc);
  },

  /**
   * Discover audio experiences nearby (supports both office floor plan x,y and GPS lat,lng)
   */
  async findNearby({
    x,
    y,
    zone,
    lat,
    lng,
    radius = 250,
    category,
    search,
    sort = "distance",
  }) {
    const { audios } = getCollections();

    // 1. Office Floor Plan Proximity (x, y Euclidean distance)
    if (x !== undefined && y !== undefined && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
      const posX = Number(x);
      const posY = Number(y);
      const maxDistance = Number(radius) || 250;

      const query = {
        visibility: "public",
        reported: { $ne: true },
      };

      if (category && category !== "all") {
        query.category = category.toLowerCase();
      }

      if (zone && zone !== "all") {
        query.zone = zone;
      }

      if (search && search.trim()) {
        query.$or = [
          { title: { $regex: search.trim(), $options: "i" } },
          { description: { $regex: search.trim(), $options: "i" } },
          { zone: { $regex: search.trim(), $options: "i" } },
        ];
      }

      const allAudios = await audios.find(query).toArray();

      const mappedWithDistance = allAudios
        .map((doc) => {
          const docX = doc.x !== undefined ? doc.x : 250;
          const docY = doc.y !== undefined ? doc.y : 350;
          const distance = Math.round(Math.hypot(posX - docX, posY - docY));
          return {
            ...doc,
            distance,
          };
        })
        .filter((item) => item.distance <= maxDistance);

      if (sort === "newest") {
        mappedWithDistance.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else {
        mappedWithDistance.sort((a, b) => a.distance - b.distance);
      }

      return mappedWithDistance.slice(0, 100).map((doc) => this.format(doc));
    }

    // 2. Geospatial GPS Fallback (using $geoNear)
    if (!isValidCoordinate(lat, lng)) {
      const error = new Error("Valid coordinates (x,y for office or lat,lng for GPS) are required.");
      error.statusCode = 400;
      throw error;
    }

    const nLat = Number(lat);
    const nLng = Number(lng);
    const maxMeters = Math.max(50, Math.min(50000, Number(radius) || 1000));

    const matchFilter = {
      visibility: "public",
      reported: { $ne: true },
    };

    if (category && category !== "all") {
      matchFilter.category = category.toLowerCase();
    }

    if (search && search.trim()) {
      matchFilter.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [nLng, nLat],
          },
          distanceField: "distance",
          maxDistance: maxMeters,
          spherical: true,
          query: matchFilter,
        },
      },
    ];

    if (sort === "newest") {
      pipeline.push({ $sort: { createdAt: -1 } });
    } else {
      pipeline.push({ $sort: { distance: 1 } });
    }

    pipeline.push({ $limit: 100 });
    const results = await audios.aggregate(pipeline).toArray();
    return results.map((doc) => this.format(doc));
  },

  /**
   * Find audio by ID
   */
  async findById(id) {
    const { audios } = getCollections();
    const objectId = typeof id === "string" ? new ObjectId(id) : id;
    const audio = await audios.findOne({ _id: objectId });
    return audio ? this.format(audio) : null;
  },

  /**
   * Find all recordings by a specific user
   */
  async findByUserId(userId) {
    const { audios } = getCollections();
    const objectId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const results = await audios
      .find({ userId: objectId })
      .sort({ createdAt: -1 })
      .toArray();
    return results.map((doc) => this.format(doc));
  },

  /**
   * Update audio metadata (ownership enforced)
   */
  async update(id, userId, updates) {
    const { audios } = getCollections();
    const objectId = typeof id === "string" ? new ObjectId(id) : id;
    const userObjectId = typeof userId === "string" ? new ObjectId(userId) : userId;

    const existing = await audios.findOne({ _id: objectId });
    if (!existing) {
      const error = new Error("Audio not found.");
      error.statusCode = 404;
      throw error;
    }

    if (existing.userId.toString() !== userObjectId.toString()) {
      const error = new Error("Unauthorized: You can only edit your own recordings.");
      error.statusCode = 403;
      throw error;
    }

    const safeUpdates = {
      updatedAt: new Date(),
    };

    if (updates.title) safeUpdates.title = updates.title.trim();
    if (updates.description !== undefined)
      safeUpdates.description = updates.description.trim();
    if (updates.category) safeUpdates.category = updates.category.toLowerCase().trim();
    if (updates.zone) safeUpdates.zone = updates.zone;
    if (updates.visibility) safeUpdates.visibility = updates.visibility;
    if (updates.radius) safeUpdates.radius = Number(updates.radius);

    await audios.updateOne({ _id: objectId }, { $set: safeUpdates });
    const updated = await audios.findOne({ _id: objectId });
    return this.format(updated);
  },

  /**
   * Delete audio record (ownership enforced)
   */
  async delete(id, userId) {
    const { audios } = getCollections();
    const objectId = typeof id === "string" ? new ObjectId(id) : id;
    const userObjectId = typeof userId === "string" ? new ObjectId(userId) : userId;

    const existing = await audios.findOne({ _id: objectId });
    if (!existing) {
      const error = new Error("Audio not found.");
      error.statusCode = 404;
      throw error;
    }

    if (existing.userId.toString() !== userObjectId.toString()) {
      const error = new Error("Unauthorized: You can only delete your own recordings.");
      error.statusCode = 403;
      throw error;
    }

    await audios.deleteOne({ _id: objectId });
    return existing;
  },

  /**
   * Increment plays counter
   */
  async incrementPlays(id) {
    const { audios } = getCollections();
    const objectId = typeof id === "string" ? new ObjectId(id) : id;
    await audios.updateOne({ _id: objectId }, { $inc: { playsCount: 1 } });
  },

  /**
   * Format audio document for API responses
   */
  format(doc) {
    if (!doc) return null;
    const coordinates = doc.location?.coordinates || [0, 0];
    return {
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description || "",
      category: doc.category || "desk_note",
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      duration: doc.duration || 0,
      x: doc.x !== undefined ? doc.x : 250,
      y: doc.y !== undefined ? doc.y : 350,
      zone: doc.zone || "Main Workspace",
      floor: doc.floor || "Floor 4",
      longitude: coordinates[0],
      latitude: coordinates[1],
      radius: doc.radius || 200,
      visibility: doc.visibility || "public",
      userId: doc.userId?.toString(),
      userName: doc.userName,
      userAvatar: doc.userAvatar,
      playsCount: doc.playsCount || 0,
      distance: doc.distance !== undefined ? Math.round(doc.distance) : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  },
};
