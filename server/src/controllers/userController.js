import { ObjectId } from "mongodb";
import { getCollections } from "../config/database.js";
import { User } from "../models/User.js";

export const userController = {
  /**
   * Get authenticated user profile with statistics
   * GET /api/users/me
   */
  async getProfile(req, res, next) {
    try {
      const { audios } = getCollections();
      const userId = new ObjectId(req.user.id);

      const [recordingCount, totalPlaysAgg] = await Promise.all([
        audios.countDocuments({ userId }),
        audios
          .aggregate([
            { $match: { userId } },
            { $group: { _id: null, totalPlays: { $sum: "$playsCount" } } },
          ])
          .toArray(),
      ]);

      const totalPlays = totalPlaysAgg[0]?.totalPlays || 0;

      res.json({
        success: true,
        user: {
          ...req.user,
          stats: {
            recordingsCount: recordingCount,
            totalPlays,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update profile information
   * PATCH /api/users/me
   */
  async updateProfile(req, res, next) {
    try {
      const { name, avatar } = req.body;
      const { users } = getCollections();
      const userId = new ObjectId(req.user.id);

      const updates = { lastActive: new Date() };
      if (name && name.trim().length >= 2) updates.name = name.trim();
      if (avatar && avatar.trim()) updates.avatar = avatar.trim();

      await users.updateOne({ _id: userId }, { $set: updates });
      const updatedUser = await User.findById(req.user.id);

      res.json({
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  },
};
