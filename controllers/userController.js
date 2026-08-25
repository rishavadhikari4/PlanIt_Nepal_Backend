const mongoose = require('mongoose');
const User = require("../models/User");
const { uploadToCloudinary, deleteFromCloudinary } = require("../config/cloudinaryConfig");
const bcrypt = require("bcryptjs");
const { escapeRegex } = require('../middleware/sanitize');

exports.getProfile = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findById(userId)
            .lean()
            .select('-password -refreshToken -resetPasswordToken -resetPasswordExpire -failedLoginAttempts -OTP -OTPexpiry -profileImageId');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, message: 'User fetched successfully', user });
    } catch (error) {
        console.error('Error getting profile:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.updateProfile = async (req, res) => {
    const { name, email, number } = req.body;
    const userId = req.user.id;
    
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Trim and normalize email
        const normalizedEmail = email?.trim().toLowerCase();
        const currentEmail = user.email?.trim().toLowerCase();
        
        if (email && normalizedEmail !== currentEmail) {
            const emailExists = await User.findOne({ 
                email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i'), 
                _id: { $ne: userId } 
            });
            
            if (emailExists) {
                return res.status(400).json({ success: false, message: 'Email already in use by another account' });
            }
            
            user.email = normalizedEmail;
        }

        if (number && number !== user.number) {
            const numberExists = await User.findOne({ number, _id: { $ne: userId } });
            if (numberExists) {
                return res.status(400).json({ success: false, message: 'Number already in use by another account' });
            }
            
            user.number = number;
        }

        if (name && name.trim() !== user.name) {
            user.name = name.trim();
        }

        await user.save();
        console.log('Profile updated successfully for user:', userId);

        const { password, refreshToken, resetPasswordToken, resetPasswordExpire, ...safeUser } = user.toObject();
        
        res.status(200).json({ 
            success: true, 
            message: 'Profile updated successfully', 
            user: safeUser 
        });
        
    } catch (error) {
        console.error('Error updating profile:', error);
        if (error.code === 11000) {
            console.error('Duplicate key error:', error.keyPattern);
        }
        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error: ' + error.message 
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } })
            .select('-password -refreshToken -resetPasswordToken -resetPasswordExpire')
            .lean();
        res.status(200).json({ success: true, message: 'Users fetched successfully', users });
    } catch (error) {
        console.error('Error getting all users:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.deleteUserAccount = async (req, res) => {
    const userId = req.params.userId;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (user.role === "admin") {
            return res.status(401).json({ success: false, message: "You cannot perform this route" });
        }
        if (user.profileImageId) {
            try { await deleteFromCloudinary(user.profileImageId); } catch {}
        }
        await User.findByIdAndDelete(userId);
        console.log('User account deleted by admin:', userId);
        return res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user account:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.uploadProfilePic = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Please upload an image" });
        }
        if (user.profileImageId) {
            try { await deleteFromCloudinary(user.profileImageId); } catch {}
        }
        let result;
        try {
            result = await uploadToCloudinary(req.file.buffer);
        } catch (error) {
            console.error('Error uploading to Cloudinary:', error);
            return res.status(500).json({ success: false, message: "Failed to upload image. Please try again." });
        }
        user.profileImage = result.secure_url;
        user.profileImageId = result.public_id;
        await user.save();
        console.log('Profile picture updated for user:', userId);
        return res.status(200).json({ success: true, message: "Profile picture updated successfully", image: result.secure_url });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

exports.deleteOwnAccount = async (req, res) => {
    const { password } = req.body;
    const userId = req.user.id;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }
        if (user.profileImageId) {
            try { await deleteFromCloudinary(user.profileImageId); } catch {}
        }
        await User.findByIdAndDelete(userId);
        console.log('User deleted their own account:', userId);
        return res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting own account:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.getUserForAdminInspection = async (req, res) => {
    const { userId } = req.params;
    const adminId = req.user.id;
    try {
        const admin = await User.findById(adminId);
        if (!admin || admin.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const userInspectionData = {
            basicInfo: {
                id: user._id,
                name: user.name,
                email: user.email,
                number: user.number,
                role: user.role,
                verified: user.verified,
                profileImage: user.profileImage
            },
            accountStatus: {
                isVerified: user.verified,
                failedLoginAttempts: user.failedLoginAttempts || 0,
                isLocked: user.lockUntil ? user.lockUntil > Date.now() : false,
                lockUntil: user.lockUntil || null,
                hasRefreshToken: !!user.refreshToken,
                hasResetToken: !!user.resetPasswordToken,
                resetTokenExpiry: user.resetPasswordExpire || null
            },
            otpInfo: {
                hasActiveOTP: !!user.OTP,
                otpExpiry: user.OTPexpiry || null,
                isOTPExpired: user.OTPexpiry ? user.OTPexpiry < Date.now() : null
            },
            timestamps: {
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            securityInfo: {
                hasPassword: !!user.password,
                profileImageId: user.profileImageId || null,
                lastPasswordReset: user.resetPasswordExpire || null
            }
        };
        res.status(200).json({
            success: true,
            message: `User inspection data retrieved successfully for ${user.name}`,
            data: {
                user: userInspectionData,
                inspectedBy: {
                    adminId: adminId,
                    adminName: admin.name,
                    inspectionTime: new Date()
                }
            }
        });
    } catch (error) {
        console.error('Error in admin user inspection:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
/* ------------------------------------------------------------------ *
 * Shortlist
 *
 * The heart on every listing used to be local component state — it lit up,
 * and nothing anywhere recorded it. These three handlers are the whole of it:
 * read the list, toggle one item, and that is all the UI needs.
 * ------------------------------------------------------------------ */

const Venue = require('../models/Venue');
const Studio = require('../models/studio');
const Cuisine = require('../models/Cuisine');

const FAVORITE_TYPES = ['venue', 'studio', 'dish'];

/**
 * Reads the shortlist and resolves each entry to the thing it points at, in
 * one query per type rather than one per entry. Entries whose item has since
 * been deleted are dropped from the response — and from the stored list, so
 * the shortlist heals itself instead of accumulating dead references.
 */
exports.getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const favorites = user.favorites || [];
    const idsByType = FAVORITE_TYPES.reduce((acc, type) => {
      acc[type] = favorites.filter((f) => f.itemType === type).map((f) => f.itemId);
      return acc;
    }, {});

    const [venues, studios, dishCategories] = await Promise.all([
      idsByType.venue.length
        ? Venue.find({ _id: { $in: idsByType.venue } })
            .select('name location price capacity rating venueImage')
            .lean()
        : [],
      idsByType.studio.length
        ? Studio.find({ _id: { $in: idsByType.studio } })
            .select('name location price rating studioImage services')
            .lean()
        : [],
      // Dishes are subdocuments, so they are reached through their category.
      idsByType.dish.length
        ? Cuisine.find({ 'dishes._id': { $in: idsByType.dish } })
            .select('category dishes')
            .lean()
        : [],
    ]);

    const dishes = [];
    for (const category of dishCategories) {
      for (const dish of category.dishes || []) {
        if (idsByType.dish.some((id) => String(id) === String(dish._id))) {
          dishes.push({ ...dish, category: category.category });
        }
      }
    }

    const found = new Map();
    venues.forEach((v) => found.set(`venue:${v._id}`, { ...v, itemType: 'venue' }));
    studios.forEach((s) => found.set(`studio:${s._id}`, { ...s, itemType: 'studio' }));
    dishes.forEach((d) => found.set(`dish:${d._id}`, { ...d, itemType: 'dish' }));

    const items = [];
    const live = [];
    for (const favorite of favorites) {
      const hit = found.get(`${favorite.itemType}:${favorite.itemId}`);
      if (!hit) continue;
      items.push({ ...hit, addedAt: favorite.addedAt });
      live.push(favorite);
    }

    // Prune references to deleted items, but only when something actually went.
    if (live.length !== favorites.length) {
      await User.updateOne({ _id: req.user.id }, { $set: { favorites: live } });
    }

    return res.status(200).json({
      success: true,
      message: 'Shortlist fetched successfully',
      data: { favorites: items },
    });
  } catch (error) {
    console.error('Error fetching shortlist:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Toggles one item and reports which way it went, so the button can settle on
 * the server's answer rather than assuming its own optimistic flip was right.
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;

    if (!FAVORITE_TYPES.includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: `itemType must be one of: ${FAVORITE_TYPES.join(', ')}`,
      });
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'A valid itemId is required' });
    }

    const user = await User.findById(req.user.id).select('favorites');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const index = (user.favorites || []).findIndex(
      (f) => f.itemType === itemType && String(f.itemId) === String(itemId),
    );

    let favorited;
    if (index === -1) {
      // Cap the list so a script cannot grow one user document without bound.
      if (user.favorites.length >= 200) {
        return res.status(400).json({
          success: false,
          message: 'Your shortlist is full. Remove something before adding more.',
        });
      }
      user.favorites.push({ itemType, itemId });
      favorited = true;
    } else {
      user.favorites.splice(index, 1);
      favorited = false;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: favorited ? 'Added to your shortlist' : 'Removed from your shortlist',
      data: { favorited, count: user.favorites.length },
    });
  } catch (error) {
    console.error('Error updating shortlist:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** Just the ids, for painting hearts across a listing page in one request. */
exports.getFavoriteIds = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites').lean();
    return res.status(200).json({
      success: true,
      message: 'Shortlist ids fetched successfully',
      data: {
        ids: (user?.favorites || []).map((f) => `${f.itemType}:${f.itemId}`),
      },
    });
  } catch (error) {
    console.error('Error fetching shortlist ids:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ------------------------------------------------------------------ *
 * Cart
 *
 * The cart lived in sessionStorage: close the tab and a half-built plan worth
 * several lakh was gone, and it was invisible on the phone the customer built
 * half of it on.
 *
 * Held as a draft, not an order. Prices and names are re-read from the
 * catalogue when the order is placed, so nothing here can pin an old price.
 * ------------------------------------------------------------------ */

const MAX_CART_ITEMS = 60;

/* Only the fields the cart actually needs. Whatever else the client sends is
   dropped rather than stored — the cart is not a place to park arbitrary
   documents on a user record. */
const cleanCartItem = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (!item._id || !item.type) return null;

  const out = {
    _id: String(item._id).slice(0, 64),
    type: String(item.type).slice(0, 16),
    name: String(item.name || '').slice(0, 200),
    price: Number(item.price) || 0,
    quantity: Math.max(1, Math.min(100000, parseInt(item.quantity, 10) || 1)),
  };
  if (item.image) out.image = String(item.image).slice(0, 500);
  if (item.category) out.category = String(item.category).slice(0, 120);
  if (item.capacity) out.capacity = Number(item.capacity) || undefined;
  if (item.bookingDates?.from && item.bookingDates?.till) {
    out.bookingDates = {
      from: new Date(item.bookingDates.from).toISOString(),
      till: new Date(item.bookingDates.till).toISOString(),
    };
  }
  return out;
};

exports.getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('cart').lean();
    return res.status(200).json({
      success: true,
      message: 'Cart fetched successfully',
      data: {
        cart: user?.cart || { items: [], guestCount: null, updatedAt: null },
      },
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Replaces the stored cart wholesale.
 *
 * The client owns cart state — it is edited far too often to round-trip every
 * change — so this is a save, not a merge. The client decides what the cart
 * is; this remembers it.
 */
exports.saveCart = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.items) ? req.body.items : [];
    if (incoming.length > MAX_CART_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `A cart can hold at most ${MAX_CART_ITEMS} items.`,
      });
    }

    const items = incoming.map(cleanCartItem).filter(Boolean);

    let guestCount = null;
    if (req.body.guestCount) {
      const n = parseInt(req.body.guestCount, 10);
      if (Number.isInteger(n) && n > 0 && n <= 100000) guestCount = n;
    }

    await User.updateOne(
      { _id: req.user.id },
      { $set: { cart: { items, guestCount, updatedAt: new Date() } } },
    );

    return res.status(200).json({
      success: true,
      message: 'Cart saved',
      data: { count: items.length },
    });
  } catch (error) {
    console.error('Error saving cart:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
