const Studio = require("../models/studio");
const Order = require('../models/order');
const {uploadToCloudinary,deleteFromCloudinary} = require("../config/cloudinaryConfig");

exports.addStudio = async (req,res) => {
    const {name,location,description,price,services} = req.body;
    try{
        if(!name || !location || !description || !price){
            return res.status(400).json({
                success:false,
                message:"Fill all the fields"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please provide a studio image"
            });
        }

        if (price <= 0) {
            return res.status(400).json({
                success: false,
                message: "Price must be a positive number"
            });
        }

        let parsedServices = [];
        if (services) {
            if (typeof services === 'string') {
                try {
                    parsedServices = JSON.parse(services);
                } catch (error) {
                    parsedServices = [services];
                }
            } else if (Array.isArray(services)) {
                parsedServices = services;
            }
        }
        
        const validServices = ['Wedding Photography', 'Pre-wedding Shoot', 'Video Recording', 'Album Design', 'Digital Copies', 'Drone Photography'];
        if (parsedServices && Array.isArray(parsedServices)) {
            const invalidServices = parsedServices.filter(service => !validServices.includes(service));
            if (invalidServices.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid services: ${invalidServices.join(', ')}. Valid services are: ${validServices.join(', ')}`
                });
            }
        }

        const result = await uploadToCloudinary(req.file.buffer);

        const newStudio = new Studio({
            name,
            location,
            description,
            price,
            services: parsedServices || [],
            studioImage: result.secure_url,
            studioImageId: result.public_id,
            photos: [] 
        });

        await newStudio.save();

        return res.status(201).json({
            success:true,
            message:"Studio Added Successfully",
            studio: newStudio
        });

    }catch(error){
        console.error("Error Occurred",error.message);
        res.status(500).json({
            success:false,
            message:"Internal Server Error",
        });
    }
}

exports.addStudioPhotos = async (req, res) => {
    try {
        const studioId = req.params.studioId;
        const files = req.files; 

        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least one photo"
            });
        }
        const studio = await Studio.findById(studioId);
        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found"
            });
        }

        const uploadedPhotos = [];
        for (const file of files) {
            try {
                const result = await uploadToCloudinary(file.buffer);
                uploadedPhotos.push({
                    image: result.secure_url,
                    imageId: result.public_id
                });
            } catch (uploadError) {
                console.error("Error uploading photo:", uploadError);
            }
        }

        if (uploadedPhotos.length === 0) {
            return res.status(500).json({
                success: false,
                message: "Failed to upload any photos"
            });
        }

        studio.photos.push(...uploadedPhotos);
        await studio.save();

        return res.status(200).json({
            success: true,
            message: `${uploadedPhotos.length} photos added successfully`,
            studio: studio,
            addedPhotos: uploadedPhotos
        });

    } catch (error) {
        console.error("Error adding studio photos:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.getAllStudios = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const sortField = req.query.sortField || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const serviceFilter = req.query.service;
        const filter = {};
        if (serviceFilter) {
            filter.services = { $in: [serviceFilter] };
        }

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

        const studios = await Studio.find(filter)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalStudios = await Studio.countDocuments(filter);

        if (!studios || studios.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No studios found",
                data: {
                    studios: [],
                    pagination: {
                        totalStudios: 0,
                        currentPage: page,
                        totalPages: 0,
                        limit
                    }
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: "Studios fetched successfully",
            data: {
                studios,
                pagination: {
                    totalStudios,
                    currentPage: page,
                    totalPages: Math.ceil(totalStudios / limit),
                    limit,
                    hasNextPage: page < Math.ceil(totalStudios / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error("Error fetching studios:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


exports.getStudioById = async (req, res) => {
    try {
        const { studioId } = req.params;

        if (!studioId) {
            return res.status(400).json({
                success: false,
                message: "Studio ID is required"
            });
        }

        // Find the studio
        const studio = await Studio.findById(studioId).lean();

        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found"
            });
        }

        // Find all confirmed bookings for this studio
        const orders = await Order.find({
            'items.itemId': studioId,
            'items.itemType': 'studio',
            'items.bookingStatus': 'confirmed',
            status: { $in: ['confirmed', 'processing', 'completed'] } // Only active orders
        }).select('items status');

        // Extract booked date ranges
        const bookedDates = [];
        orders.forEach(order => {
            order.items.forEach(item => {
                if (item.itemId.toString() === studioId && 
                    item.itemType === 'studio' && 
                    item.bookingStatus === 'confirmed') {
                    bookedDates.push({
                        bookedFrom: item.bookedFrom,
                        bookedTill: item.bookedTill,
                        orderId: order._id
                    });
                }
            });
        });

        // Return studio with booked dates
        return res.status(200).json({
            success: true,
            message: "Studio fetched successfully",
            data: {
                studio: studio,
                bookedDates: bookedDates,
                totalBookings: bookedDates.length
            }
        });

    } catch (error) {
        console.error("Error fetching studio with booking dates:", error.message);

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID format"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.deleteStudio = async (req, res) => {
    try {
        const { studioId } = req.params;

        if (!studioId) {
            return res.status(400).json({
                success: false,
                message: "Studio ID is required"
            });
        }

        const studio = await Studio.findById(studioId);

        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found"
            });
        }

        if (studio.studioImageId) {
            try {
                await deleteFromCloudinary(studio.studioImageId);
            } catch (cloudinaryError) {
                console.error("Error deleting main studio image from Cloudinary:", cloudinaryError);
            }
        }

        if (studio.photos && studio.photos.length > 0) {
            for (const photo of studio.photos) {
                if (photo.imageId) {
                    try {
                        await deleteFromCloudinary(photo.imageId);
                    } catch (cloudinaryError) {
                        console.error("Error deleting photo from Cloudinary:", cloudinaryError);
                    }
                }
            }
        }

        await Studio.findByIdAndDelete(studioId);

        return res.status(200).json({
            success: true,
            message: "Studio and all associated images deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting studio:", error.message);

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: "Invalid studio ID format"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.updateStudio = async (req, res) => {
    try {
        const { studioId } = req.params;
        const { name, location, description, price, services } = req.body;

        const studio = await Studio.findById(studioId);
        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found"
            });
        }

        let parsedServices = studio.services;
        if (services) {
            if (typeof services === 'string') {
                try {
                    parsedServices = JSON.parse(services);
                } catch (error) {
                    parsedServices = [services];
                }
            } else if (Array.isArray(services)) {
                parsedServices = services;
            }
        }

        const validServices = ['Wedding Photography', 'Pre-wedding Shoot', 'Video Recording', 'Album Design', 'Digital Copies', 'Drone Photography'];
        if (parsedServices && Array.isArray(parsedServices)) {
            const invalidServices = parsedServices.filter(service => !validServices.includes(service));
            if (invalidServices.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid services: ${invalidServices.join(', ')}`
                });
            }
        }

        let imageUrl = studio.studioImage;
        let imageId = studio.studioImageId;

        if (req.file) {
            if (studio.studioImageId) {
                await deleteFromCloudinary(studio.studioImageId);
            }
            const result = await uploadToCloudinary(req.file.buffer);
            imageUrl = result.secure_url;
            imageId = result.public_id;
        }

        const updatedStudio = await Studio.findByIdAndUpdate(
            studioId,
            {
                name: name || studio.name,
                location: location || studio.location,
                description: description || studio.description,
                price: price || studio.price,
                services: parsedServices,
                studioImage: imageUrl,
                studioImageId: imageId
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Studio updated successfully",
            studio: updatedStudio
        });

    } catch (error) {
        console.error("Error updating studio:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.deleteStudioPhoto = async (req, res) => {
    try {
        const { studioId, photoId } = req.params;

        const studio = await Studio.findById(studioId);
        if (!studio) {
            return res.status(404).json({
                success: false,
                message: "Studio not found"
            });
        }

        const photoIndex = studio.photos.findIndex(photo => photo._id.toString() === photoId);
        if (photoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Photo not found"
            });
        }

        const photo = studio.photos[photoIndex];

        if (photo.imageId) {
            await deleteFromCloudinary(photo.imageId);
        }

        studio.photos.splice(photoIndex, 1);
        await studio.save();

        return res.status(200).json({
            success: true,
            message: "Photo deleted successfully",
            studio: studio
        });

    } catch (error) {
        console.error("Error deleting studio photo:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

exports.searchStudios = async (req, res) => {
    try {
        const { q, services, minPrice, maxPrice, location } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let filter = {};

        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } }
            ];
        }

        if (services) {
            const serviceArray = services.split(',');
            filter.services = { $in: serviceArray };
        }

        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }

        if (location) {
            filter.location = { $regex: location, $options: 'i' };
        }

        const studios = await Studio.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalStudios = await Studio.countDocuments(filter);

        return res.status(200).json({
            success: true,
            message: "Search completed successfully",
            data: {
                studios,
                pagination: {
                    totalStudios,
                    currentPage: page,
                    totalPages: Math.ceil(totalStudios / limit),
                    limit
                },
                searchQuery: { q, services, minPrice, maxPrice, location }
            }
        });

    } catch (error) {
        console.error("Error searching studios:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};