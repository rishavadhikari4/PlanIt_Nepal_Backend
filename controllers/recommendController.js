const Studio = require('../models/studio');
const Venue = require('../models/Venue');
const Cuisine = require('../models/Cuisine');

exports.getWeddingPackageRecommendation = async (req, res) => {
    try {
        const { 
            venueBudget, 
            studioBudget, 
            foodBudget,
            location, 
            guestCount,
            preferredServices 
        } = req.query;

        // **VALIDATE INDIVIDUAL BUDGETS**
        if (!venueBudget || isNaN(venueBudget) || venueBudget <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid venue budget amount"
            });
        }

        if (!studioBudget || isNaN(studioBudget) || studioBudget <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid studio budget amount"
            });
        }

        if (!foodBudget || isNaN(foodBudget) || foodBudget <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid food budget amount"
            });
        }

        // **INDIVIDUAL BUDGET ALLOCATION**
        const budgetDistribution = {
            venue: parseFloat(venueBudget),
            studio: parseFloat(studioBudget),
            food: parseFloat(foodBudget)
        };

        console.log("Budget Distribution:", budgetDistribution);
        console.log("Search Criteria:", { location, guestCount, preferredServices });

        // **1. GET RECOMMENDED VENUES**
        let venueFilter = {
            price: { $lte: budgetDistribution.venue * 1.1 }
        };

        // **MATCH LOCATION FOR VENUES**
        if (location) {
            venueFilter.location = { $regex: location, $options: 'i' };
        }

        // **MATCH GUEST COUNT WITH VENUE CAPACITY**
        if (guestCount) {
            const guestCountNum = parseInt(guestCount);
            if (!isNaN(guestCountNum)) {
                // Find venues that can accommodate the guest count
                // Assuming capacity is stored as string like "100-200" or just "150"
                venueFilter.$or = [
                    // If capacity is a number string, convert and compare
                    { $expr: { $gte: [{ $toInt: "$capacity" }, guestCountNum] } },
                    // If capacity contains a range like "100-200", check if guest count falls within
                    { capacity: { $regex: `^[0-9]*[${guestCountNum}-9][0-9]*-`, $options: 'i' } },
                    // If capacity is greater than guest count (simple string comparison for larger numbers)
                    { capacity: { $regex: `^[${Math.floor(guestCountNum/100) + 1}-9][0-9]{2,}`, $options: 'i' } }
                ];
            } else {
                // If guestCount is not a number, treat it as string search
                venueFilter.capacity = { $regex: guestCount, $options: 'i' };
            }
        }

        console.log("Venue Filter:", JSON.stringify(venueFilter, null, 2));

        const venues = await Venue.find(venueFilter).lean();
        const recommendedVenue = await calculateVenueScore(venues, budgetDistribution.venue, guestCount);

        // **2. GET RECOMMENDED STUDIOS**
        let studioFilter = {
            price: { $lte: budgetDistribution.studio * 1.1 }
        };

        // **MATCH LOCATION FOR STUDIOS**
        if (location) {
            studioFilter.location = { $regex: location, $options: 'i' };
        }

        // **MATCH PREFERRED SERVICES FOR STUDIOS**
        if (preferredServices) {
            const serviceArray = preferredServices.split(',').map(s => s.trim());
            studioFilter.services = { $in: serviceArray };
        }

        console.log("Studio Filter:", JSON.stringify(studioFilter, null, 2));

        const studios = await Studio.find(studioFilter).lean();
        const recommendedStudio = await calculateStudioScore(studios, budgetDistribution.studio, location);

        // **3. GET RECOMMENDED DISHES FROM ALL CATEGORIES**
        const cuisines = await Cuisine.find().lean();
        const recommendedDishes = await selectBestDishesFromCategories(cuisines, budgetDistribution.food);

        // **4. CALCULATE PACKAGE TOTALS**
        const venuePrice = recommendedVenue ? recommendedVenue.price : 0;
        const studioPrice = recommendedStudio ? recommendedStudio.price : 0;
        const dishesTotalPrice = recommendedDishes.reduce((sum, dish) => sum + dish.price, 0);
        const packageTotal = venuePrice + studioPrice + dishesTotalPrice;
        const totalBudgetAllocated = budgetDistribution.venue + budgetDistribution.studio + budgetDistribution.food;

        // **5. PACKAGE INSIGHTS**
        const insights = {
            budgetUtilization: Math.round((packageTotal / totalBudgetAllocated) * 100),
            totalSavings: totalBudgetAllocated - packageTotal,
            budgetBreakdown: {
                venue: {
                    allocated: budgetDistribution.venue,
                    used: venuePrice,
                    remaining: budgetDistribution.venue - venuePrice,
                    utilization: venuePrice > 0 ? Math.round((venuePrice / budgetDistribution.venue) * 100) : 0
                },
                studio: {
                    allocated: budgetDistribution.studio,
                    used: studioPrice,
                    remaining: budgetDistribution.studio - studioPrice,
                    utilization: studioPrice > 0 ? Math.round((studioPrice / budgetDistribution.studio) * 100) : 0
                },
                food: {
                    allocated: budgetDistribution.food,
                    used: dishesTotalPrice,
                    remaining: budgetDistribution.food - dishesTotalPrice,
                    utilization: dishesTotalPrice > 0 ? Math.round((dishesTotalPrice / budgetDistribution.food) * 100) : 0
                }
            },
            packageBenefits: [],
            recommendations: []
        };

        // **Add package benefits based on individual budgets**
        if (venuePrice <= budgetDistribution.venue) {
            insights.packageBenefits.push("Venue within allocated budget");
        }
        if (studioPrice <= budgetDistribution.studio) {
            insights.packageBenefits.push("Studio within allocated budget");
        }
        if (dishesTotalPrice <= budgetDistribution.food) {
            insights.packageBenefits.push("Food selection within allocated budget");
        }
        if (insights.totalSavings > 0) {
            insights.packageBenefits.push(`Total savings: ₹${insights.totalSavings.toLocaleString()}`);
        }
        if (recommendedVenue && recommendedVenue.rating >= 4.0) {
            insights.packageBenefits.push("High-rated venue selected");
        }
        if (recommendedStudio && recommendedStudio.rating >= 4.0) {
            insights.packageBenefits.push("Professional photography service");
        }

        // **Add location and capacity-specific benefits**
        if (recommendedVenue && location && recommendedVenue.location.toLowerCase().includes(location.toLowerCase())) {
            insights.packageBenefits.push(`Venue matches your preferred location: ${location}`);
        }
        if (recommendedStudio && location && recommendedStudio.location.toLowerCase().includes(location.toLowerCase())) {
            insights.packageBenefits.push(`Studio matches your preferred location: ${location}`);
        }
        if (recommendedVenue && guestCount) {
            insights.packageBenefits.push(`Venue can accommodate ${guestCount} guests`);
        }

        // **Add specific recommendations**
        if (!recommendedVenue) {
            const suggestions = [];
            if (guestCount) suggestions.push(`guest count: ${guestCount}`);
            if (location) suggestions.push(`location: ${location}`);
            const criteriaText = suggestions.length > 0 ? ` matching ${suggestions.join(' and ')}` : '';
            insights.recommendations.push(`No venue found within ₹${budgetDistribution.venue.toLocaleString()} budget${criteriaText}. Consider increasing venue budget or adjusting criteria.`);
        } else if (insights.budgetBreakdown.venue.remaining > budgetDistribution.venue * 0.2) {
            insights.recommendations.push("Consider upgrading to a premium venue option");
        }

        if (!recommendedStudio) {
            const suggestions = [];
            if (location) suggestions.push(`location: ${location}`);
            if (preferredServices) suggestions.push(`services: ${preferredServices}`);
            const criteriaText = suggestions.length > 0 ? ` matching ${suggestions.join(' and ')}` : '';
            insights.recommendations.push(`No studio found within ₹${budgetDistribution.studio.toLocaleString()} budget${criteriaText}. Consider increasing studio budget or adjusting criteria.`);
        } else if (insights.budgetBreakdown.studio.remaining > budgetDistribution.studio * 0.2) {
            insights.recommendations.push("Consider adding more photography services");
        }

        if (recommendedDishes.length === 0) {
            insights.recommendations.push(`No dishes found within ₹${budgetDistribution.food.toLocaleString()} budget. Consider increasing food budget.`);
        } else if (insights.budgetBreakdown.food.remaining > budgetDistribution.food * 0.2) {
            insights.recommendations.push("Consider adding more food variety or premium dishes");
        }

        return res.status(200).json({
            success: true,
            message: "Wedding package recommendation generated successfully",
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
                    totalAllocated: totalBudgetAllocated,
                    packageTotal: packageTotal,
                    budgetUtilization: insights.budgetUtilization,
                    totalSavings: insights.totalSavings,
                    breakdown: insights.budgetBreakdown
                },
                insights: {
                    benefits: insights.packageBenefits,
                    recommendations: insights.recommendations,
                    packageScore: calculateOverallPackageScore(recommendedVenue, recommendedStudio, recommendedDishes)
                },
                searchCriteria: {
                    venueBudget: budgetDistribution.venue,
                    studioBudget: budgetDistribution.studio,
                    foodBudget: budgetDistribution.food,
                    location: location || 'Any',
                    guestCount: guestCount || 'Not specified',
                    preferredServices: preferredServices || 'All services'
                },
                matchingResults: {
                    venuesFound: venues.length,
                    studiosFound: studios.length,
                    dishCategoriesFound: recommendedDishes.length
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

// **UPDATED HELPER FUNCTIONS**

async function calculateVenueScore(venues, budget, guestCount) {
    if (!venues || venues.length === 0) return null;

    const scoredVenues = venues.map(venue => {
        let score = 0;

        // Budget Score (25%)
        const budgetScore = venue.price <= budget ? 100 - ((venue.price / budget) * 30) : 50;
        score += budgetScore * 0.25;

        // Rating Score (40%)
        const ratingScore = (venue.rating / 5) * 100;
        score += ratingScore * 0.4;

        // Popularity Score (15%)
        const popularityScore = Math.min((venue.orderedCount || 0) * 2, 100);
        score += popularityScore * 0.15;

        // **NEW: Capacity Match Score (20%)**
        let capacityScore = 50; // Default score
        if (guestCount) {
            const guestCountNum = parseInt(guestCount);
            if (!isNaN(guestCountNum)) {
                // Try to extract capacity number from venue.capacity string
                const capacityMatch = venue.capacity?.match(/(\d+)/);
                if (capacityMatch) {
                    const venueCapacity = parseInt(capacityMatch[1]);
                    if (venueCapacity >= guestCountNum) {
                        // Perfect match or higher capacity
                        capacityScore = 100 - Math.abs(venueCapacity - guestCountNum) / guestCountNum * 20;
                        capacityScore = Math.max(capacityScore, 80); // Minimum 80 for adequate capacity
                    } else {
                        // Venue too small
                        capacityScore = 20;
                    }
                }
            }
        }
        score += capacityScore * 0.2;

        return { ...venue, score, capacityScore, budgetScore, ratingScore, popularityScore };
    });

    return scoredVenues.sort((a, b) => b.score - a.score)[0];
}

async function calculateStudioScore(studios, budget, location) {
    if (!studios || studios.length === 0) return null;

    const scoredStudios = studios.map(studio => {
        let score = 0;

        // Budget Score (25%)
        const budgetScore = studio.price <= budget ? 100 - ((studio.price / budget) * 30) : 50;
        score += budgetScore * 0.25;

        // Rating Score (40%)
        const ratingScore = (studio.rating / 5) * 100;
        score += ratingScore * 0.4;

        // Popularity Score (15%)
        const popularityScore = Math.min((studio.orderedCount || 0) * 2, 100);
        score += popularityScore * 0.15;

        // **NEW: Location Match Score (20%)**
        let locationScore = 50; // Default score
        if (location && studio.location) {
            const locationMatch = studio.location.toLowerCase().includes(location.toLowerCase());
            locationScore = locationMatch ? 100 : 30;
        }
        score += locationScore * 0.2;

        return { ...studio, score, budgetScore, ratingScore, popularityScore, locationScore };
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
