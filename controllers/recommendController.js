const Studio = require('../models/studio');
const Venue = require('../models/Venue');
const Cuisine = require('../models/Cuisine');

exports.getWeddingPackageRecommendation = async (req, res) => {
    try {
        const { 
            totalBudget, 
            venueBudget, 
            studioBudget, 
            foodBudget,
            location, 
            guestCount,
            preferredServices 
        } = req.query;

        if (!totalBudget || isNaN(totalBudget) || totalBudget <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid total budget amount"
            });
        }

        const userTotalBudget = parseFloat(totalBudget);

        // Default budget distribution if not specified
        const budgetDistribution = {
            venue: venueBudget ? parseFloat(venueBudget) : userTotalBudget * 0.4, // 40%
            studio: studioBudget ? parseFloat(studioBudget) : userTotalBudget * 0.25, // 25%
            food: foodBudget ? parseFloat(foodBudget) : userTotalBudget * 0.35 // 35%
        };

        console.log("Budget Distribution:", budgetDistribution);

        // **1. GET RECOMMENDED VENUES**
        let venueFilter = {
            price: { $lte: budgetDistribution.venue * 1.1 }
        };

        if (location) {
            venueFilter.location = { $regex: location, $options: 'i' };
        }

        if (guestCount) {
            venueFilter.capacity = { $regex: guestCount, $options: 'i' };
        }

        const venues = await Venue.find(venueFilter).lean();
        const recommendedVenue = await calculateVenueScore(venues, budgetDistribution.venue);

        // **2. GET RECOMMENDED STUDIOS**
        let studioFilter = {
            price: { $lte: budgetDistribution.studio * 1.1 }
        };

        if (location) {
            studioFilter.location = { $regex: location, $options: 'i' };
        }

        if (preferredServices) {
            const serviceArray = preferredServices.split(',').map(s => s.trim());
            studioFilter.services = { $in: serviceArray };
        }

        const studios = await Studio.find(studioFilter).lean();
        const recommendedStudio = await calculateStudioScore(studios, budgetDistribution.studio);

        // **3. GET RECOMMENDED DISHES FROM ALL CATEGORIES**
        const cuisines = await Cuisine.find().lean();
        const recommendedDishes = await selectBestDishesFromCategories(cuisines, budgetDistribution.food);

        // **4. CALCULATE PACKAGE TOTALS**
        const venuePrice = recommendedVenue ? recommendedVenue.price : 0;
        const studioPrice = recommendedStudio ? recommendedStudio.price : 0;
        const dishesTotalPrice = recommendedDishes.reduce((sum, dish) => sum + dish.price, 0);
        const packageTotal = venuePrice + studioPrice + dishesTotalPrice;

        // **5. PACKAGE INSIGHTS**
        const insights = {
            budgetUtilization: Math.round((packageTotal / userTotalBudget) * 100),
            savings: userTotalBudget - packageTotal,
            budgetBreakdown: {
                venue: {
                    allocated: budgetDistribution.venue,
                    used: venuePrice,
                    remaining: budgetDistribution.venue - venuePrice
                },
                studio: {
                    allocated: budgetDistribution.studio,
                    used: studioPrice,
                    remaining: budgetDistribution.studio - studioPrice
                },
                food: {
                    allocated: budgetDistribution.food,
                    used: dishesTotalPrice,
                    remaining: budgetDistribution.food - dishesTotalPrice
                }
            },
            packageBenefits: [],
            recommendations: []
        };

        // Add package benefits
        if (packageTotal <= userTotalBudget) {
            insights.packageBenefits.push("Complete package within budget");
        }
        if (insights.savings > 0) {
            insights.packageBenefits.push(`Save ${insights.savings.toLocaleString()} for additional services`);
        }
        if (recommendedVenue && recommendedVenue.rating >= 4.0) {
            insights.packageBenefits.push("High-rated venue included");
        }
        if (recommendedStudio && recommendedStudio.rating >= 4.0) {
            insights.packageBenefits.push("Professional photography service");
        }

        // Add recommendations
        if (insights.budgetUtilization < 90) {
            insights.recommendations.push("Consider upgrading venue or adding more food options");
        }
        if (!recommendedVenue) {
            insights.recommendations.push("Increase venue budget or consider different location");
        }
        if (!recommendedStudio) {
            insights.recommendations.push("Increase photography budget or reduce service requirements");
        }

        return res.status(200).json({
            success: true,
            message: "Complete wedding package recommendation generated successfully",
            data: {
                package: {
                    venue: recommendedVenue || null,
                    studio: recommendedStudio || null,
                    dishes: recommendedDishes,
                    totalPrice: packageTotal,
                    dishesCount: recommendedDishes.length,
                    categoriesIncluded: [...new Set(recommendedDishes.map(d => d.category))]
                },
                budgetAnalysis: {
                    totalBudget: userTotalBudget,
                    packageTotal: packageTotal,
                    budgetUtilization: insights.budgetUtilization,
                    savings: insights.savings,
                    breakdown: insights.budgetBreakdown
                },
                insights: {
                    benefits: insights.packageBenefits,
                    recommendations: insights.recommendations,
                    packageScore: calculateOverallPackageScore(recommendedVenue, recommendedStudio, recommendedDishes)
                },
                searchCriteria: {
                    totalBudget: userTotalBudget,
                    budgetDistribution,
                    location: location || 'Any',
                    guestCount: guestCount || 'Not specified',
                    preferredServices: preferredServices || 'All services'
                }
            }
        });

    } catch (error) {
        console.error("Error generating wedding package recommendation:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

// **HELPER FUNCTIONS**

async function calculateVenueScore(venues, budget) {
    if (!venues || venues.length === 0) return null;

    const scoredVenues = venues.map(venue => {
        let score = 0;

        // Budget Score (30%)
        const budgetScore = venue.price <= budget ? 100 - ((venue.price / budget) * 30) : 50;
        score += budgetScore * 0.3;

        // Rating Score (50%)
        const ratingScore = (venue.rating / 5) * 100;
        score += ratingScore * 0.5;

        // Popularity Score (20%)
        const popularityScore = Math.min((venue.orderedCount || 0) * 2, 100);
        score += popularityScore * 0.2;

        return { ...venue, score };
    });

    return scoredVenues.sort((a, b) => b.score - a.score)[0];
}

async function calculateStudioScore(studios, budget) {
    if (!studios || studios.length === 0) return null;

    const scoredStudios = studios.map(studio => {
        let score = 0;

        // Budget Score (30%)
        const budgetScore = studio.price <= budget ? 100 - ((studio.price / budget) * 30) : 50;
        score += budgetScore * 0.3;

        // Rating Score (50%)
        const ratingScore = (studio.rating / 5) * 100;
        score += ratingScore * 0.5;

        // Popularity Score (20%)
        const popularityScore = Math.min((studio.orderedCount || 0) * 2, 100);
        score += popularityScore * 0.2;

        return { ...studio, score };
    });

    return scoredStudios.sort((a, b) => b.score - a.score)[0];
}

async function selectBestDishesFromCategories(cuisines, foodBudget) {
    if (!cuisines || cuisines.length === 0) return [];

    const recommendedDishes = [];
    const budgetPerCategory = foodBudget / cuisines.length;

    for (const cuisine of cuisines) {
        if (!cuisine.dishes || cuisine.dishes.length === 0) continue;

        // Score dishes within budget for this category
        const affordableDishes = cuisine.dishes.filter(dish => dish.price <= budgetPerCategory * 1.5);
        
        if (affordableDishes.length === 0) {
            // If no dishes within 1.5x budget, get cheapest dish
            const cheapestDish = cuisine.dishes.reduce((min, dish) => 
                dish.price < min.price ? dish : min, cuisine.dishes[0]);
            
            if (cheapestDish.price <= foodBudget * 0.3) { // Don't exceed 30% of total food budget
                recommendedDishes.push({
                    ...cheapestDish,
                    category: cuisine.category,
                    score: (cheapestDish.rating / 5) * 100
                });
            }
            continue;
        }

        // Score affordable dishes
        const scoredDishes = affordableDishes.map(dish => {
            let score = 0;

            // Rating Score (60%)
            const ratingScore = (dish.rating / 5) * 100;
            score += ratingScore * 0.6;

            // Popularity Score (25%)
            const popularityScore = Math.min((dish.orderedCount || 0) * 5, 100);
            score += popularityScore * 0.25;

            // Budget Score (15%) - Cheaper gets higher score
            const budgetScore = 100 - ((dish.price / budgetPerCategory) * 50);
            score += budgetScore * 0.15;

            return {
                ...dish,
                category: cuisine.category,
                score
            };
        });

        // Get best dish from this category
        const bestDish = scoredDishes.sort((a, b) => b.score - a.score)[0];
        recommendedDishes.push(bestDish);
    }

    // Sort all dishes by score and ensure total stays within food budget
    recommendedDishes.sort((a, b) => b.score - a.score);
    
    // Remove dishes if total exceeds budget
    let totalPrice = 0;
    const finalDishes = [];
    
    for (const dish of recommendedDishes) {
        if (totalPrice + dish.price <= foodBudget) {
            finalDishes.push(dish);
            totalPrice += dish.price;
        }
    }

    return finalDishes;
}

function calculateOverallPackageScore(venue, studio, dishes) {
    let totalScore = 0;
    let components = 0;

    if (venue) {
        totalScore += (venue.rating / 5) * 100 * 0.4; // 40% weight
        components++;
    }

    if (studio) {
        totalScore += (studio.rating / 5) * 100 * 0.3; // 30% weight
        components++;
    }

    if (dishes && dishes.length > 0) {
        const avgDishRating = dishes.reduce((sum, dish) => sum + dish.rating, 0) / dishes.length;
        totalScore += (avgDishRating / 5) * 100 * 0.3; // 30% weight
        components++;
    }

    return components > 0 ? Math.round(totalScore) : 0;
}
