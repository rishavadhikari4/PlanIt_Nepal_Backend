const Order = require('../models/order');
const Venue = require('../models/Venue');
const Cuisine = require('../models/Cuisine');
const Studio = require('../models/studio');

exports.addOrder = async (req, res) => {
    try {
        const { items } = req.body;
        const userId = req.user.id;
        console.log("Order is being created");

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

        for (const requestItem of items) {
            const { itemId, itemType, quantity, bookedFrom, bookedTill } = requestItem;

            if (!itemId || !itemType || !quantity) {
                return res.status(400).json({
                    success: false,
                    message: "Each item must have itemId, itemType, and quantity"
                });
            }

            if (itemType === 'venue' || itemType === 'studio') {
                if (!bookedFrom || !bookedTill) {
                    return res.status(400).json({
                        success: false,
                        message: `${itemType} booking requires bookedFrom and bookedTill dates`
                    });
                }

                const fromDate = new Date(bookedFrom);
                const tillDate = new Date(bookedTill);
                const currentDate = new Date();

                // Normalize all dates (ignore time part)
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
                    status: { $ne: 'draft' },
                    $or: [
                        {
                            'items.bookedFrom': { $lte: fromDate },
                            'items.bookedTill': { $gt: fromDate }
                        },
                        {
                            'items.bookedFrom': { $lt: tillDate },
                            'items.bookedTill': { $gte: tillDate }
                        },
                        {
                            'items.bookedFrom': { $gte: fromDate },
                            'items.bookedTill': { $lte: tillDate }
                        }
                    ]
                });

                if (conflictingOrders.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `${itemType} is not available for the selected dates`
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
            } else if (itemType === 'studio') {
                item = await Studio.findById(itemId);
                if (!item) {
                    return res.status(404).json({
                        success: false,
                        message: "Studio not found"
                    });
                }
            } else if (itemType === 'dish') {
                const cuisine = await Cuisine.findOne({ 'dishes._id': itemId }, { 'dishes.$': 1 });
                item = cuisine ? cuisine.dishes[0] : null;

                if (!item) {
                    return res.status(404).json({
                        success: false,
                        message: "Dish not found"
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid itemType (must be 'venue', 'studio', or 'dish')"
                });
            }

            if (!item.price && item.price !== 0) {
                console.error(`Item missing price:`, {
                    itemId,
                    itemType,
                    item: item
                });
                return res.status(400).json({
                    success: false,
                    message: `${itemType} is missing price information`
                });
            }

            const itemPrice = parseFloat(item.price);
            if (isNaN(itemPrice)) {
                console.error(`Invalid price for item:`, {
                    itemId,
                    itemType,
                    originalPrice: item.price,
                    parsedPrice: itemPrice
                });
                return res.status(400).json({
                    success: false,
                    message: `${itemType} has invalid price format`
                });
            }

            const orderItem = {
                itemId: item._id,
                itemType: itemType,
                name: item.name,
                price: itemPrice,
                image: item.image || item.studioImage,
                quantity: quantity
            };

            if (itemType === 'venue' || itemType === 'studio') {
                orderItem.bookedFrom = new Date(bookedFrom);
                orderItem.bookedTill = new Date(bookedTill);
                orderItem.bookingStatus = 'pending';
            }

            orderItems.push(orderItem);
            totalAmount += itemPrice * quantity;
        }

        if (isNaN(totalAmount)) {
            console.error('Total amount is NaN:', { orderItems, totalAmount });
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
            paymentType: null,
            paymentStatus: 'pending',
            paidAmount: 0,
            remainingAmount: totalAmount,
            stripePaymentIntentId: null
        };

        const newOrder = new Order(orderData);
        await newOrder.save();

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
        console.error("Error creating order draft:", error.message);
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
    const order = await Order.findByIdAndDelete(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

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

exports.updateStatus = async (req,res) => {
  const orderId = req.params.orderId;
  const { status } = req.body;
    try {

    if (!status || !["pending", "processing", "completed", "cancelled", "confirmed"].includes(status)) {
      return res.status(400).json({ 
        success:false,
        message: "Invalid or missing status" 
      });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ 
        success:false,
        message: "Order not found" 
      });
    }

    return res.status(200).json({
      success:true,
      message: "Order status updated successfully",
      order: updatedOrder
    });

  } catch (error) {
    console.error("Error updating order status:", error.message);
    return res.status(500).json({ 
      success:false,
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

    const deleteResult = await Order.deleteMany({ userId: userId });

    return res.status(200).json({
      success: true,
      message: `All orders deleted successfully for user`,
      deletedCount: deleteResult.deletedCount
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
