const Order = require('../models/order');
const Venue = require('../models/Venue');
const Cuisine = require('../models/Cuisine');
const Studio = require('../models/studio');

exports.addOrder = async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.id;

    /* Catering is priced per plate, so the headcount is the multiplier for
       every dish on the order. It is asked once and applied here rather than
       typed into each line, which is what made the old totals wrong whenever
       someone changed the guest list. */
    let guestCount = null;
    if (req.body.guestCount !== undefined && req.body.guestCount !== null && req.body.guestCount !== '') {
      guestCount = Number(req.body.guestCount);
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100000) {
        return res.status(400).json({
          success: false,
          message: "Guest count must be a whole number of at least 1."
        });
      }
    }

    if (req.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Admins are not allowed to place orders"
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide items to order"
      });
    }

    const venueItems = items.filter(item => item.itemType === 'venue');
    if (venueItems.length > 1) {
      return res.status(400).json({
        success: false,
        message: "You can only order one venue per order"
      });
    }

    const studioItems = items.filter(item => item.itemType === 'studio');
    if (studioItems.length > 1) {
      return res.status(400).json({
        success: false,
        message: "You can only order one studio per order"
      });
    }

    const dishItems = items.filter(item => item.itemType === 'dish');
    const dishIds = dishItems.map(item => item.itemId);
    const uniqueDishIds = [...new Set(dishIds)];
    if (dishIds.length !== uniqueDishIds.length) {
      return res.status(400).json({
        success: false,
        message: "Cannot add duplicate dishes to the same order"
      });
    }

    const orderItems = [];
    let totalAmount = 0;
    const studiosToUpdate = [];
    const venuesToUpdate = [];
    const dishesToUpdate = [];

    for (const requestItem of items) {
      const { itemId, itemType, quantity, bookedFrom, bookedTill } = requestItem;
      if (!itemId || !itemType || !quantity) {
        return res.status(400).json({
          success: false,
          message: "Each item must have itemId, itemType, and quantity"
        });
      }

      if (itemType === 'venue' || itemType === 'studio') {
        if (bookedFrom && bookedTill) {
          const fromDate = new Date(bookedFrom);
          const tillDate = new Date(bookedTill);
          const currentDate = new Date();
          fromDate.setHours(0,0,0,0);
          tillDate.setHours(0,0,0,0);
          currentDate.setHours(0,0,0,0);
          if (isNaN(fromDate.getTime()) || isNaN(tillDate.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Invalid date format"
            });
          }
          if (fromDate < currentDate) {
            return res.status(400).json({
              success: false,
              message: "Booking start date cannot be in the past"
            });
          }
          if (tillDate < fromDate) {
            return res.status(400).json({
              success: false,
              message: "Booking end date cannot be before start date"
            });
          }
          const conflictingOrders = await Order.find({
            'items.itemId': itemId,
            'items.itemType': itemType,
            'items.bookingStatus': 'confirmed',
            'items.bookedFrom': { $ne: null },
            'items.bookedTill': { $ne: null },
            status: { $ne: 'draft' },
            $or: [
              { 'items.bookedFrom': { $lte: fromDate }, 'items.bookedTill': { $gt: fromDate } },
              { 'items.bookedFrom': { $lt: tillDate }, 'items.bookedTill': { $gte: tillDate } },
              { 'items.bookedFrom': { $gte: fromDate }, 'items.bookedTill': { $lte: tillDate } }
            ]
          });
          if (conflictingOrders.length > 0) {
            return res.status(400).json({
              success: false,
              message: `${itemType} is not available for the selected dates`
            });
          }
        } else if ((bookedFrom && !bookedTill) || (!bookedFrom && bookedTill)) {
          return res.status(400).json({
            success: false,
            message: "Both bookedFrom and bookedTill dates must be provided together, or both can be omitted"
          });
        }
      }

      let item;
      if (itemType === 'venue') {
        item = await Venue.findById(itemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: "Venue not found"
          });
        }
        if (guestCount && item.capacity && guestCount > item.capacity) {
          return res.status(400).json({
            success: false,
            message: `${item.name} holds ${item.capacity} guests. Lower the headcount or pick a larger room.`
          });
        }
        venuesToUpdate.push(itemId);
      } else if (itemType === 'studio') {
        item = await Studio.findById(itemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: "Studio not found"
          });
        }
        studiosToUpdate.push(itemId);
      } else if (itemType === 'dish') {
        const cuisine = await Cuisine.findOne({ 'dishes._id': itemId }, { 'dishes.$': 1 });
        item = cuisine ? cuisine.dishes[0] : null;
        if (!item) {
          return res.status(404).json({
            success: false,
            message: "Dish not found"
          });
        }
        dishesToUpdate.push({ dishId: itemId, quantity: guestCount || quantity });
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid itemType (must be 'venue', 'studio', or 'dish')"
        });
      }

      if (!item.price && item.price !== 0) {
        return res.status(400).json({
          success: false,
          message: `${itemType} is missing price information`
        });
      }
      const itemPrice = parseFloat(item.price);
      if (isNaN(itemPrice)) {
        return res.status(400).json({
          success: false,
          message: `${itemType} has invalid price format`
        });
      }
      // One plate per guest. Without a headcount the cart's own count stands,
      // so orders placed before this existed still price the same way.
      const lineQuantity = itemType === 'dish' && guestCount ? guestCount : quantity;

      const orderItem = {
        itemId: item._id,
        itemType: itemType,
        name: item.name,
        price: itemPrice,
        image: item.venueImage || item.studioImage || item.image,
        quantity: lineQuantity
      };
      if (itemType === 'venue' || itemType === 'studio') {
        orderItem.bookedFrom = bookedFrom ? new Date(bookedFrom) : null;
        orderItem.bookedTill = bookedTill ? new Date(bookedTill) : null;
        orderItem.bookingStatus = 'pending';
      }
      orderItems.push(orderItem);
      totalAmount += itemPrice * lineQuantity;
    }

    if (isNaN(totalAmount)) {
      return res.status(400).json({
        success: false,
        message: "Error calculating total amount"
      });
    }

    const orderData = {
      userId: userId,
      status: "draft",
      items: orderItems,
      totalAmount,
      guestCount,
      paymentType: null,
      paymentStatus: 'pending',
      paidAmount: 0,
      remainingAmount: totalAmount,
      stripePaymentIntentId: null
    };

    const newOrder = new Order(orderData);
    await newOrder.save();

    if (venuesToUpdate.length > 0) {
      await Venue.updateMany(
        { _id: { $in: venuesToUpdate } },
        { $inc: { orderedCount: 1 } }
      );
    }
    if (studiosToUpdate.length > 0) {
      await Studio.updateMany(
        { _id: { $in: studiosToUpdate } },
        { $inc: { orderedCount: 1 } }
      );
    }
    if (dishesToUpdate.length > 0) {
      for (const dishUpdate of dishesToUpdate) {
        await Cuisine.updateOne(
          { 'dishes._id': dishUpdate.dishId },
          { $inc: { 'dishes.$.orderedCount': dishUpdate.quantity } }
        );
      }
    }

    const populatedOrder = await Order.findById(newOrder._id)
      .populate({
        path: 'userId',
        select: 'name email number'
      })
      .lean();

    return res.status(201).json({
      success: true,
      message: "Order draft created successfully. Please select payment method to confirm.",
      order: populatedOrder,
      nextStep: "Select payment method to confirm your order"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.userOrder = async (req, res) => {
  const userId = req.user.id;
  try {
    const orders = await Order.find({ 
        userId})
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();
    
    if (!orders || orders.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No orders found",
            data: {
                orders: []
            }
        });
    }
    
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: {
          orders,
          totalOrders: orders.length
      }
    });
  } catch (error) {
    console.error("Error fetching orders:", error.message);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
}

exports.getAllOrder = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortField = req.query.sortField || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; 

    const statusFilter = req.query.status;
    const filter = { status: { $ne: 'draft' } }; 
    if (statusFilter) {
      filter.status = statusFilter;
    }

    const orders = await Order.find(filter)
      .populate('userId', 'email name')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: {
        orders,
        pagination: {
          totalOrders,
          currentPage: page,
          totalPages: Math.ceil(totalOrders / limit),
          limit
        }
      }
    });
  } catch (err) {
    console.error("Error fetching all orders:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.deleteOrder = async (req, res) => {
    const orderId = req.params.orderId;
    try {
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.status !== 'cancelled') {
            const venueItems = order.items.filter(item => item.itemType === 'venue');
            const studioItems = order.items.filter(item => item.itemType === 'studio');
            const dishItems = order.items.filter(item => item.itemType === 'dish');
            
            const venueIds = venueItems.map(item => item.itemId);
            const studioIds = studioItems.map(item => item.itemId);

            // Decrease venue order counts
            if (venueIds.length > 0) {
                try {
                    await Venue.updateMany(
                        { _id: { $in: venueIds } },
                        { $inc: { orderedCount: -1 } }
                    );
                    console.log(`Decreased order count for ${venueIds.length} venue(s) due to order deletion`);
                } catch (updateError) {
                    console.error("Error decreasing venue order counts:", updateError.message);
                }
            }

            // Decrease studio order counts
            if (studioIds.length > 0) {
                try {
                    await Studio.updateMany(
                        { _id: { $in: studioIds } },
                        { $inc: { orderedCount: -1 } }
                    );
                    console.log(`Decreased order count for ${studioIds.length} studio(s) due to order deletion`);
                } catch (updateError) {
                    console.error("Error decreasing studio order counts:", updateError.message);
                }
            }

            // Decrease dish order counts
            if (dishItems.length > 0) {
                try {
                    for (const dishItem of dishItems) {
                        await Cuisine.updateOne(
                            { 'dishes._id': dishItem.itemId },
                            { $inc: { 'dishes.$.orderedCount': -dishItem.quantity } }
                        );
                    }
                    console.log(`Decreased order count for ${dishItems.length} dish(es) due to order deletion`);
                } catch (updateError) {
                    console.error("Error decreasing dish order counts:", updateError.message);
                }
            }
        }

        await Order.findByIdAndDelete(orderId);

        return res.status(200).json({
            success: true,
            message: "Order deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting order:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.updateStatus = async (req, res) => {
    const orderId = req.params.orderId;
    const { status } = req.body;
    try {
        if (!status || !["pending", "processing", "completed", "cancelled", "confirmed"].includes(status)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid or missing status" 
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false,
                message: "Order not found" 
            });
        }

        const previousStatus = order.status;

        // Prepare update object
        let updateData = { status };

        // **AUTOMATIC PAYMENT COMPLETION WHEN ORDER IS COMPLETED**
        if (status === 'completed') {
            updateData.paymentStatus = 'completed';
            updateData.paidAmount = order.totalAmount;
            updateData.remainingAmount = 0;
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            updateData,
            { new: true }
        );

        // Handle venue, studio, and dish order count changes when status changes to/from cancelled
        if (previousStatus !== 'cancelled' && status === 'cancelled') {
            // Order was cancelled - decrease counts
            const venueItems = order.items.filter(item => item.itemType === 'venue');
            const studioItems = order.items.filter(item => item.itemType === 'studio');
            const dishItems = order.items.filter(item => item.itemType === 'dish');
            
            const venueIds = venueItems.map(item => item.itemId);
            const studioIds = studioItems.map(item => item.itemId);
            
            if (venueIds.length > 0) {
                try {
                    await Venue.updateMany(
                        { _id: { $in: venueIds } },
                        { $inc: { orderedCount: -1 } }
                    );
                    console.log(`Decreased order count for ${venueIds.length} venue(s) due to cancellation`);
                } catch (updateError) {
                    console.error("Error decreasing venue order counts:", updateError.message);
                }
            }

            if (studioIds.length > 0) {
                try {
                    await Studio.updateMany(
                        { _id: { $in: studioIds } },
                        { $inc: { orderedCount: -1 } }
                    );
                    console.log(`Decreased order count for ${studioIds.length} studio(s) due to cancellation`);
                } catch (updateError) {
                    console.error("Error decreasing studio order counts:", updateError.message);
                }
            }

            // Decrease dish order counts
            if (dishItems.length > 0) {
                try {
                    for (const dishItem of dishItems) {
                        await Cuisine.updateOne(
                            { 'dishes._id': dishItem.itemId },
                            { $inc: { 'dishes.$.orderedCount': -dishItem.quantity } }
                        );
                    }
                    console.log(`Decreased order count for ${dishItems.length} dish(es) due to cancellation`);
                } catch (updateError) {
                    console.error("Error decreasing dish order counts:", updateError.message);
                }
            }
        } else if (previousStatus === 'cancelled' && status !== 'cancelled') {
            // Order was un-cancelled - increase counts
            const venueItems = order.items.filter(item => item.itemType === 'venue');
            const studioItems = order.items.filter(item => item.itemType === 'studio');
            const dishItems = order.items.filter(item => item.itemType === 'dish');
            
            const venueIds = venueItems.map(item => item.itemId);
            const studioIds = studioItems.map(item => item.itemId);
            
            if (venueIds.length > 0) {
                try {
                    await Venue.updateMany(
                        { _id: { $in: venueIds } },
                        { $inc: { orderedCount: 1 } }
                    );
                    console.log(`Increased order count for ${venueIds.length} venue(s) due to un-cancellation`);
                } catch (updateError) {
                    console.error("Error increasing venue order counts:", updateError.message);
                }
            }

            if (studioIds.length > 0) {
                try {
                    await Studio.updateMany(
                        { _id: { $in: studioIds } },
                        { $inc: { orderedCount: 1 } }
                    );
                    console.log(`Increased order count for ${studioIds.length} studio(s) due to un-cancellation`);
                } catch (updateError) {
                    console.error("Error increasing studio order counts:", updateError.message);
                }
            }

            // Increase dish order counts
            if (dishItems.length > 0) {
                try {
                    for (const dishItem of dishItems) {
                        await Cuisine.updateOne(
                            { 'dishes._id': dishItem.itemId },
                            { $inc: { 'dishes.$.orderedCount': dishItem.quantity } }
                        );
                    }
                    console.log(`Increased order count for ${dishItems.length} dish(es) due to un-cancellation`);
                } catch (updateError) {
                    console.error("Error increasing dish order counts:", updateError.message);
                }
            }
        }

        // Enhanced response with payment info when status is completed
        let responseMessage = "Order status updated successfully";
        if (status === 'completed') {
            responseMessage = "Order completed successfully. Payment marked as completed.";
        }

        return res.status(200).json({
            success: true,
            message: responseMessage,
            order: updatedOrder,
            paymentUpdate: status === 'completed' ? {
                paymentStatus: 'completed',
                paidAmount: updatedOrder.paidAmount,
                remainingAmount: updatedOrder.remainingAmount,
                totalAmount: updatedOrder.totalAmount
            } : null
        });

    } catch (error) {
        console.error("Error updating order status:", error.message);
        return res.status(500).json({ 
            success: false,
            message: "Internal server error" 
        });
    }
}

exports.deleteAllUserOrders = async (req, res) => {
    const userId = req.params.userId;
    try {
        const userOrders = await Order.find({ userId: userId });

        if (!userOrders || userOrders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No orders found for this user"
            });
        }

        const venueUpdates = {};
        const studioUpdates = {};
        const dishUpdates = {};
        
        userOrders.forEach(order => {
            if (order.status !== 'cancelled') {
                order.items.forEach(item => {
                    if (item.itemType === 'venue') {
                        if (venueUpdates[item.itemId]) {
                            venueUpdates[item.itemId]++;
                        } else {
                            venueUpdates[item.itemId] = 1;
                        }
                    } else if (item.itemType === 'studio') {
                        if (studioUpdates[item.itemId]) {
                            studioUpdates[item.itemId]++;
                        } else {
                            studioUpdates[item.itemId] = 1;
                        }
                    } else if (item.itemType === 'dish') {
                        if (dishUpdates[item.itemId]) {
                            dishUpdates[item.itemId] += item.quantity;
                        } else {
                            dishUpdates[item.itemId] = item.quantity;
                        }
                    }
                });
            }
        });

        // Decrease venue order counts
        for (const [venueId, count] of Object.entries(venueUpdates)) {
            try {
                await Venue.findByIdAndUpdate(venueId, {
                    $inc: { orderedCount: -count }
                });
                console.log(`Decreased order count by ${count} for venue ${venueId}`);
            } catch (updateError) {
                console.error(`Error decreasing order count for venue ${venueId}:`, updateError.message);
            }
        }

        // Decrease studio order counts
        for (const [studioId, count] of Object.entries(studioUpdates)) {
            try {
                await Studio.findByIdAndUpdate(studioId, {
                    $inc: { orderedCount: -count }
                });
                console.log(`Decreased order count by ${count} for studio ${studioId}`);
            } catch (updateError) {
                console.error(`Error decreasing order count for studio ${studioId}:`, updateError.message);
            }
        }

        // Decrease dish order counts
        for (const [dishId, count] of Object.entries(dishUpdates)) {
            try {
                await Cuisine.updateOne(
                    { 'dishes._id': dishId },
                    { $inc: { 'dishes.$.orderedCount': -count } }
                );
                console.log(`Decreased order count by ${count} for dish ${dishId}`);
            } catch (updateError) {
                console.error(`Error decreasing order count for dish ${dishId}:`, updateError.message);
            }
        }

        const deleteResult = await Order.deleteMany({ userId: userId });

        return res.status(200).json({
            success: true,
            message: `All orders deleted successfully for user`,
            deletedCount: deleteResult.deletedCount,
            venueUpdates: Object.keys(venueUpdates).length,
            studioUpdates: Object.keys(studioUpdates).length,
            dishUpdates: Object.keys(dishUpdates).length
        });
    } catch (error) {
        console.error("Error deleting all user orders:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "Order ID is required"
            });
        }

        let query = { _id: orderId };

        // If user is not admin, they can only see their own orders
        if (userRole !== 'admin') {
            query.userId = userId;
        }

        const order = await Order.findOne(query)
            .populate({
                path: 'userId',
                select: 'name email number'
            })
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: userRole === 'admin' ? "Order not found" : "Order not found or you don't have permission to access it"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Order fetched successfully",
            data: {
                order
            }
        });

    } catch (error) {
        console.error("Error fetching order by ID:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

/* ------------------------------------------------------------------ *
 * Cancellation, refunds and per-item status
 *
 * `order.status` and `items.bookingStatus` both carried a 'cancelled' value
 * from the start, and nothing could ever set them from the customer's side.
 * A booking could be taken and paid for with no way back out.
 * ------------------------------------------------------------------ */

/* How much of a payment comes back, by how much notice we get. Stated here as
   data rather than buried in a branch, because this is the company's policy
   and it is the thing most likely to change. */
const REFUND_TIERS = [
  { minDaysBefore: 30, fraction: 1, label: 'Full refund — cancelled 30 days or more before the event' },
  { minDaysBefore: 14, fraction: 0.5, label: 'Half refund — cancelled 14 to 29 days before' },
  { minDaysBefore: 0, fraction: 0, label: 'No refund — cancelled within 14 days of the event' },
];

const DAY = 24 * 60 * 60 * 1000;

/** The soonest date anything on this order is booked for, or null. */
const earliestBooking = (order) => {
  const dates = (order.items || [])
    .filter((i) => i.bookedFrom && i.bookingStatus !== 'cancelled')
    .map((i) => new Date(i.bookedFrom).getTime());
  return dates.length ? new Date(Math.min(...dates)) : null;
};

/**
 * What a cancellation would return, without cancelling anything. The checkout
 * and the profile both show this before the customer commits, so nobody
 * discovers the policy only after pressing the button.
 */
const quoteRefund = (order) => {
  const paid = Number(order.paidAmount) || 0;
  const eventDate = earliestBooking(order);

  // Nothing dated means nothing to be late for.
  const daysBefore = eventDate ? Math.floor((eventDate.getTime() - Date.now()) / DAY) : Infinity;
  const tier = REFUND_TIERS.find((t) => daysBefore >= t.minDaysBefore) || REFUND_TIERS[REFUND_TIERS.length - 1];

  const amount = Math.round(paid * tier.fraction);
  return {
    paidAmount: paid,
    refundAmount: amount,
    forfeitAmount: paid - amount,
    fraction: tier.fraction,
    policy: tier.label,
    eventDate: eventDate ? eventDate.toISOString() : null,
    daysBefore: Number.isFinite(daysBefore) ? daysBefore : null,
  };
};

exports.quoteCancellation = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (req.user.role !== 'admin' && String(order.userId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'This is not your order' });
    }

    return res.status(200).json({
      success: true,
      message: 'Cancellation quote fetched successfully',
      data: {
        cancellable: !['cancelled', 'completed'].includes(order.status),
        ...quoteRefund(order),
      },
    });
  } catch (error) {
    console.error('Error quoting cancellation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Cancels a whole order. The customer can cancel their own; an admin can
 * cancel anyone's. The money is *marked* for refund rather than pushed back
 * through the gateway — neither Khalti nor Fonepay refunds over their public
 * API, so this records what is owed and the admin settles it and marks it
 * done. Recording it is the part that was missing.
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const reason = String(req.body.reason || '').trim().slice(0, 500);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && String(order.userId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'This is not your order' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This order is already cancelled' });
    }
    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This event has already happened. Contact us if something went wrong.',
      });
    }
    if (!isAdmin && !reason) {
      return res.status(400).json({
        success: false,
        message: 'Tell us briefly why you are cancelling.',
      });
    }

    const quote = quoteRefund(order);

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelledBy = isAdmin ? 'admin' : 'customer';
    order.cancellationReason = reason || null;
    order.items.forEach((item) => {
      if (item.bookingStatus && item.bookingStatus !== 'cancelled') {
        item.bookingStatus = 'cancelled';
        item.statusChangedAt = new Date();
      }
    });

    if (quote.refundAmount > 0) {
      order.refundStatus = 'due';
      order.refundedAmount = 0;
    }

    await order.save();

    /* The dates are free again, so give the popularity counters back what the
       order took. Failing here must not fail the cancellation. */
    try {
      const venueIds = order.items.filter((i) => i.itemType === 'venue').map((i) => i.itemId);
      const studioIds = order.items.filter((i) => i.itemType === 'studio').map((i) => i.itemId);
      if (venueIds.length) await Venue.updateMany({ _id: { $in: venueIds } }, { $inc: { orderedCount: -1 } });
      if (studioIds.length) await Studio.updateMany({ _id: { $in: studioIds } }, { $inc: { orderedCount: -1 } });
      for (const dish of order.items.filter((i) => i.itemType === 'dish')) {
        await Cuisine.updateOne(
          { 'dishes._id': dish.itemId },
          { $inc: { 'dishes.$.orderedCount': -dish.quantity } },
        );
      }
    } catch (countError) {
      console.error('Could not roll back order counts:', countError.message);
    }

    return res.status(200).json({
      success: true,
      message:
        quote.refundAmount > 0
          ? `Order cancelled. Rs ${quote.refundAmount.toLocaleString('en-IN')} will be returned to you within five working days.`
          : 'Order cancelled.',
      data: { order, refund: quote },
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Admin records that a refund has actually been paid out. Separate from
 * cancelling, because the money leaves by bank transfer on a different day
 * from the decision.
 */
exports.settleRefund = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.refundStatus === 'none') {
      return res.status(400).json({ success: false, message: 'No refund is due on this order' });
    }
    if (order.refundStatus === 'refunded') {
      return res.status(400).json({ success: false, message: 'This refund is already settled' });
    }

    const requested = Number(req.body.amount);
    const quoted = quoteRefund(order).refundAmount;
    const amount = Number.isFinite(requested) && requested >= 0 ? Math.round(requested) : quoted;

    // A refund can never exceed what was actually taken.
    if (amount > (order.paidAmount || 0)) {
      return res.status(400).json({
        success: false,
        message: `A refund cannot exceed the Rs ${(order.paidAmount || 0).toLocaleString('en-IN')} paid.`,
      });
    }

    order.refundedAmount = amount;
    order.refundStatus = 'refunded';
    order.refundedAt = new Date();
    order.refundReference = String(req.body.reference || '').trim().slice(0, 120) || null;
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Refund recorded',
      data: { order },
    });
  } catch (error) {
    console.error('Error settling refund:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Moves one line of an order. A venue can fall through without taking the
 * studio with it, which the single order-wide status could never express.
 */
exports.updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { bookingStatus } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(bookingStatus)) {
      return res.status(400).json({
        success: false,
        message: "bookingStatus must be 'pending', 'confirmed' or 'cancelled'",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'That line is not on this order' });
    }
    if (item.itemType === 'dish') {
      return res.status(400).json({
        success: false,
        message: 'Dishes are not booked against a date and carry no booking status.',
      });
    }

    item.bookingStatus = bookingStatus;
    item.statusNote = String(req.body.note || '').trim().slice(0, 300) || null;
    item.statusChangedAt = new Date();

    /* When every dated line is cancelled the order is cancelled too — leaving
       it "confirmed" with nothing confirmed on it is how a status stops
       meaning anything. */
    const dated = order.items.filter((i) => i.itemType !== 'dish');
    if (dated.length && dated.every((i) => i.bookingStatus === 'cancelled') && order.status !== 'cancelled') {
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancelledBy = 'admin';
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Marked ${item.name} as ${bookingStatus}`,
      data: { order },
    });
  } catch (error) {
    console.error('Error updating item status:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports.REFUND_TIERS = REFUND_TIERS;
module.exports.quoteRefund = quoteRefund;
