const Venue = require('../models/Venue');
const Order = require('../models/order');

const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');

exports.uploadVenue = async (req,res) => {
    const {name,location,description,capacity,price} =req.body;
    try{
        if(!name || !location || !description || !capacity || !req.file || !price){
            return res.status(400).json({
                success:false,
                message:"Please Fill All Fileds"
            });
        }
        const result = await uploadToCloudinary(req.file.buffer);
        const newVenue = new Venue({
            name,
            location,
            description,
            capacity,
            price,
            image : result.secure_url,
            imageId : result.public_id,
        });
        await newVenue.save();
        return res.status(201).json({
            success:true,
            message : "Venue Created Successfully",
            venue : newVenue

        });
    }catch(error){
        console.error('Error in uploadVenue:', error);
        res.status(500).json({
            success:false,
            message:"Internal Server Error",
        });
    }
    
}

exports.getAllVenues = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const sortField = req.query.sortField || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const filter = {};

        if (req.query.minPrice || req.query.maxPrice) {
            filter.price = {};
            if (req.query.minPrice) {
                filter.price.$gte = parseFloat(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                filter.price.$lte = parseFloat(req.query.maxPrice);
            }
        }

        if (req.query.location) {
            filter.location = { $regex: req.query.location, $options: 'i' };
        }

        if (req.query.minCapacity || req.query.maxCapacity) {
            filter.capacity = {};
            if (req.query.minCapacity) {
                filter.capacity.$gte = parseInt(req.query.minCapacity);
            }
            if (req.query.maxCapacity) {
                filter.capacity.$lte = parseInt(req.query.maxCapacity);
            }
        }

        if (req.query.name) {
            filter.name = { $regex: req.query.name, $options: 'i' };
        }

        const venues = await Venue.find(filter)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalVenues = await Venue.countDocuments(filter);

        if (!venues || venues.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No venues found",
                data: {
                    venues: [],
                    pagination: {
                        totalVenues: 0,
                        currentPage: page,
                        totalPages: 0,
                        limit
                    }
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: "Venues fetched successfully",
            data: {
                venues,
                pagination: {
                    totalVenues,
                    currentPage: page,
                    totalPages: Math.ceil(totalVenues / limit),
                    limit,
                    hasNextPage: page < Math.ceil(totalVenues / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Error fetching venues:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.getVenuesById = async (req,res) => {
    const venueId = req.params.venueId;
    try {
        // Find the venue
        const venue = await Venue.findById(venueId).lean();
        if (!venue) {
            return res.status(404).json({ 
                success: false,
                message: 'Venue not found' 
            });
        }

        // Find all confirmed bookings for this venue
        const orders = await Order.find({
            'items.itemId': venueId,
            'items.itemType': 'venue',
            'items.bookingStatus': 'confirmed',
            status: { $in: ['confirmed', 'processing', 'completed'] } // Only active orders
        }).select('items status');

        // Extract booked date ranges
        const bookedDates = [];
        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.itemId.toString() === venueId && 
                    item.itemType === 'venue' && 
                    item.bookingStatus === 'confirmed') {
                    bookedDates.push({
                        bookedFrom: item.bookedFrom,
                        bookedTill: item.bookedTill,
                        orderId: order._id
                    });
                }
            });
        });

        // Return venue with booked dates
        return res.status(200).json({ 
            success: true,
            message: 'Venue fetched successfully',
            data: {
                venue: venue,
                bookedDates: bookedDates,
                totalBookings: bookedDates.length
            }
        });

    } catch (error) {
        console.error('Error fetching venue with booking dates:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Internal server error' 
        });
    }
}

exports.updateVenue = async (req,res) => {
    const { name, location, description, price } = req.body;
    const venueId = req.params.venueId;
    try {
        const venue = await Venue.findById(venueId);
        if(!venue){
            return res.status(404).json({
                success:false,
                message:"Venue not found"
            });
        }
        
        let imageUrl = venue.image;
        let imageId = venue.imageId;

        if (req.file) {
            if(venue.imageId){
                await deleteFromCloudinary(venue.imageId);
            }
            const result = await uploadToCloudinary(req.file.buffer);
            imageUrl = result.secure_url;
            imageId = result.public_id;
        }
        
        const updatedVenue = await Venue.findByIdAndUpdate(
            venueId,
            { 
                $set: { 
                    name,
                    location,
                    description,
                    price,
                    image: imageUrl,
                    imageId: imageId 
                } 
            },
            { new: true }
        );
        
        return res.status(200).json({ 
            success:true,
            message: 'Venue updated successfully', 
            venue: updatedVenue 
        });
    } catch (err) {
        console.error('Error updating venue:', err);
        res.status(500).json({ 
            success:false,
            message: 'Internal server error' 
        });
    }
    
}

exports.deleteVenue = async (req,res) => {
    const venueId = req.params.venueId;
     try {
        const venue = await Venue.findById(venueId);
        if(!venue){
            return res.status(404).json({
                success:false,
                message:"Venue not found"
            });
        }

        if(venue.imageId){
            await deleteFromCloudinary(venue.imageId);
        }

        await Venue.findByIdAndDelete(venueId);

        return res.status(200).json({ 
            success:true,
            message: 'Venue deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting venue:', error);
        res.status(500).json({ 
            success:false,
            message: 'Internal server error' 
        });
    }

    
}

exports.searchVenues = async (req, res) => {
    try {
        const { q, minPrice, maxPrice, location, minCapacity, maxCapacity } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let filter = {};

        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { location: { $regex: q, $options: 'i' } }
            ];
        }

        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) {
                filter.price.$gte = parseFloat(minPrice);
            }
            if (maxPrice) {
                filter.price.$lte = parseFloat(maxPrice);
            }
        }

        if (minCapacity || maxCapacity) {
            filter.capacity = {};
            if (minCapacity) {
                filter.capacity.$gte = parseInt(minCapacity);
            }
            if (maxCapacity) {
                filter.capacity.$lte = parseInt(maxCapacity);
            }
        }

        if (location) {
            filter.location = { $regex: location, $options: 'i' };
        }

        const sortField = req.query.sortField || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const venues = await Venue.find(filter)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalVenues = await Venue.countDocuments(filter);

        if (!venues || venues.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No venues found matching your search criteria",
                data: {
                    venues: [],
                    pagination: {
                        totalVenues: 0,
                        currentPage: page,
                        totalPages: 0,
                        limit
                    },
                    searchQuery: { q, minPrice, maxPrice, location, minCapacity, maxCapacity }
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: "Venue search completed successfully",
            data: {
                venues,
                pagination: {
                    totalVenues,
                    currentPage: page,
                    totalPages: Math.ceil(totalVenues / limit),
                    limit,
                    hasNextPage: page < Math.ceil(totalVenues / limit),
                    hasPrevPage: page > 1
                },
                searchQuery: { q, minPrice, maxPrice, location, minCapacity, maxCapacity }
            }
        });

    } catch (error) {
        console.error("Error searching venues:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
}


