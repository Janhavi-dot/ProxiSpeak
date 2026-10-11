import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/database.js";

const SALT_ROUNDS = 10;

export const User = {
  /**
   * Create a new user with a hashed password
   */
  async create({ name, email, password, avatar }) {
    const { users } = getCollections();
    const cleanEmail = email.trim().toLowerCase();

    const existing = await users.findOne({ email: cleanEmail });
    if (existing) {
      const error = new Error("An account with this email address already exists.");
      error.statusCode = 409;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userDoc = {
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      avatar:
        avatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
          name.trim()
        )}`,
      createdAt: new Date(),
      lastActive: new Date(),
    };

    const result = await users.insertOne(userDoc);
    userDoc._id = result.insertedId;
    return this.sanitize(userDoc);
  },

  /**
   * Find user by lowercase email
   */
  async findByEmail(email) {
    const { users } = getCollections();
    return users.findOne({ email: email.trim().toLowerCase() });
  },

  /**
   * Find user by MongoDB ObjectId
   */
  async findById(id) {
    const { users } = getCollections();
    const objectId = typeof id === "string" ? new ObjectId(id) : id;
    const user = await users.findOne({ _id: objectId });
    return user ? this.sanitize(user) : null;
  },

  /**
   * Compare plain password against bcrypt hash
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  /**
   * Sanitize user document to exclude sensitive fields
   */
  sanitize(user) {
    if (!user) return null;
    const { password, ...safeUser } = user;
    return {
      ...safeUser,
      id: safeUser._id.toString(),
    };
  },
};
