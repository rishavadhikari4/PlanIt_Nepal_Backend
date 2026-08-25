const Studio = require('../models/studio');
const Venue = require('../models/Venue');
const Cuisine = require('../models/Cuisine');
const { containsFilter } = require('../middleware/sanitize');

exports.getWeddingPackageRecommendation = async (req, res) => {
  try {
    const { venueBudget, studioBudget, foodBudget, location, guestCount, preferredServices } = req.query;
    if (!venueBudget || isNaN(venueBudget) || venueBudget <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid venue budget amount" });
    }
    if (!studioBudget || isNaN(studioBudget) || studioBudget <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid studio budget amount" });
    }
    if (!foodBudget || isNaN(foodBudget) || foodBudget <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid food budget amount" });
    }
    const budgetDistribution = {
      venue: parseFloat(venueBudget),
      studio: parseFloat(studioBudget),
      food: parseFloat(foodBudget)
    };
    let venueFilter = { price: { $lte: budgetDistribution.venue * 1.1 } };
    if (location) venueFilter.location = containsFilter(location);
    if (guestCount) {
      const guestCountNum = parseInt(guestCount);
      if (!isNaN(guestCountNum)) {
        venueFilter.$or = [
          { $expr: { $gte: [{ $toInt: "$capacity" }, guestCountNum] } },
          { capacity: { $regex: `^[0-9]*[${guestCountNum}-9][0-9]*-`, $options: 'i' } },
          { capacity: { $regex: `^[${Math.floor(guestCountNum/100) + 1}-9][0-9]{2,}`, $options: 'i' } }
        ];
      } else {
        venueFilter.capacity = containsFilter(guestCount);
      }
    }
    const venues = await Venue.find(venueFilter).lean();
    const recommendedVenue = await calculateVenueScore(venues, budgetDistribution.venue, guestCount);

    let studioFilter = { price: { $lte: budgetDistribution.studio * 1.1 } };
    if (location) studioFilter.location = containsFilter(location);
    if (preferredServices) {
      const serviceArray = preferredServices.split(',').map(s => s.trim());
      studioFilter.services = { $in: serviceArray };
    }
    const studios = await Studio.find(studioFilter).lean();
    const recommendedStudio = await calculateStudioScore(studios, budgetDistribution.studio, location);

    const cuisines = await Cuisine.find().lean();
    const recommendedDishes = await selectBestDishesFromCategories(cuisines, budgetDistribution.food);

    const venuePrice = recommendedVenue ? recommendedVenue.price : 0;
    const studioPrice = recommendedStudio ? recommendedStudio.price : 0;
    const dishesTotalPrice = recommendedDishes.reduce((sum, dish) => sum + dish.price, 0);
    const packageTotal = venuePrice + studioPrice + dishesTotalPrice;
    const totalBudgetAllocated = budgetDistribution.venue + budgetDistribution.studio + budgetDistribution.food;

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

    if (venuePrice <= budgetDistribution.venue) insights.packageBenefits.push("Venue within allocated budget");
    if (studioPrice <= budgetDistribution.studio) insights.packageBenefits.push("Studio within allocated budget");
    if (dishesTotalPrice <= budgetDistribution.food) insights.packageBenefits.push("Food selection within allocated budget");
    if (insights.totalSavings > 0) insights.packageBenefits.push(`Total savings: Rs ${insights.totalSavings.toLocaleString('en-IN')}`);
    if (recommendedVenue && recommendedVenue.rating >= 4.0) insights.packageBenefits.push("High-rated venue selected");
    if (recommendedStudio && recommendedStudio.rating >= 4.0) insights.packageBenefits.push("Professional photography service");
    if (recommendedVenue && location && recommendedVenue.location.toLowerCase().includes(location.toLowerCase())) insights.packageBenefits.push(`Venue matches your preferred location: ${location}`);
    if (recommendedStudio && location && recommendedStudio.location.toLowerCase().includes(location.toLowerCase())) insights.packageBenefits.push(`Studio matches your preferred location: ${location}`);
    if (recommendedVenue && guestCount) insights.packageBenefits.push(`Venue can accommodate ${guestCount} guests`);

    if (!recommendedVenue) {
      const suggestions = [];
      if (guestCount) suggestions.push(`guest count: ${guestCount}`);
      if (location) suggestions.push(`location: ${location}`);
      const criteriaText = suggestions.length > 0 ? ` matching ${suggestions.join(' and ')}` : '';
      insights.recommendations.push(`No venue found within Rs ${budgetDistribution.venue.toLocaleString()} budget${criteriaText}. Consider increasing venue budget or adjusting criteria.`);
    } else if (insights.budgetBreakdown.venue.remaining > budgetDistribution.venue * 0.2) {
      insights.recommendations.push("Consider upgrading to a premium venue option");
    }
    if (!recommendedStudio) {
      const suggestions = [];
      if (location) suggestions.push(`location: ${location}`);
      if (preferredServices) suggestions.push(`services: ${preferredServices}`);
      const criteriaText = suggestions.length > 0 ? ` matching ${suggestions.join(' and ')}` : '';
      insights.recommendations.push(`No studio found within Rs ${budgetDistribution.studio.toLocaleString()} budget${criteriaText}. Consider increasing studio budget or adjusting criteria.`);
    } else if (insights.budgetBreakdown.studio.remaining > budgetDistribution.studio * 0.2) {
      insights.recommendations.push("Consider adding more photography services");
    }
    if (recommendedDishes.length === 0) {
      insights.recommendations.push(`No dishes found within Rs ${budgetDistribution.food.toLocaleString()} budget. Consider increasing food budget.`);
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
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

async function calculateVenueScore(venues, budget, guestCount) {
  if (!venues || venues.length === 0) return null;
  const scoredVenues = venues.map(venue => {
    let score = 0;
    const budgetScore = venue.price <= budget ? 100 - ((venue.price / budget) * 30) : 50;
    score += budgetScore * 0.25;
    const ratingScore = (venue.rating / 5) * 100;
    score += ratingScore * 0.4;
    const popularityScore = Math.min((venue.orderedCount || 0) * 2, 100);
    score += popularityScore * 0.15;
    let capacityScore = 50;
    if (guestCount) {
      const guestCountNum = parseInt(guestCount);
      if (!isNaN(guestCountNum)) {
        const capacityMatch = venue.capacity?.match(/(\d+)/);
        if (capacityMatch) {
          const venueCapacity = parseInt(capacityMatch[1]);
          if (venueCapacity >= guestCountNum) {
            capacityScore = 100 - Math.abs(venueCapacity - guestCountNum) / guestCountNum * 20;
            capacityScore = Math.max(capacityScore, 80);
          } else {
            capacityScore = 20;
          }
        }
      }
    }
    score += capacityScore * 0.2;
    return { ...venue, score };
  });
  return scoredVenues.sort((a, b) => b.score - a.score)[0];
}

async function calculateStudioScore(studios, budget, location) {
  if (!studios || studios.length === 0) return null;
  const scoredStudios = studios.map(studio => {
    let score = 0;
    const budgetScore = studio.price <= budget ? 100 - ((studio.price / budget) * 30) : 50;
    score += budgetScore * 0.25;
    const ratingScore = (studio.rating / 5) * 100;
    score += ratingScore * 0.4;
    const popularityScore = Math.min((studio.orderedCount || 0) * 2, 100);
    score += popularityScore * 0.15;
    let locationScore = 50;
    if (location && studio.location) {
      const locationMatch = studio.location.toLowerCase().includes(location.toLowerCase());
      locationScore = locationMatch ? 100 : 30;
    }
    score += locationScore * 0.2;
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
    const affordableDishes = cuisine.dishes.filter(dish => dish.price <= budgetPerCategory * 1.5);
    if (affordableDishes.length === 0) {
      const cheapestDish = cuisine.dishes.reduce((min, dish) =>
        dish.price < min.price ? dish : min, cuisine.dishes[0]);
      if (cheapestDish.price <= foodBudget * 0.3) {
        recommendedDishes.push({
          ...cheapestDish,
          category: cuisine.category
        });
      }
      continue;
    }
    const scoredDishes = affordableDishes.map(dish => {
      let score = 0;
      const ratingScore = (dish.rating / 5) * 100;
      score += ratingScore * 0.6;
      const popularityScore = Math.min((dish.orderedCount || 0) * 5, 100);
      score += popularityScore * 0.25;
      const budgetScore = 100 - ((dish.price / budgetPerCategory) * 50);
      score += budgetScore * 0.15;
      return { ...dish, category: cuisine.category, score };
    });
    const bestDish = scoredDishes.sort((a, b) => b.score - a.score)[0];
    recommendedDishes.push(bestDish);
  }
  recommendedDishes.sort((a, b) => b.score - a.score);
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
    totalScore += (venue.rating / 5) * 100 * 0.4;
    components++;
  }
  if (studio) {
    totalScore += (studio.rating / 5) * 100 * 0.3;
    components++;
  }
  if (dishes && dishes.length > 0) {
    const avgDishRating = dishes.reduce((sum, dish) => sum + dish.rating, 0) / dishes.length;
    totalScore += (avgDishRating / 5) * 100 * 0.3;
    components++;
  }
  return components > 0 ? Math.round(totalScore) : 0;
}

/* ------------------------------------------------------------------ *
 * Occasions
 *
 * The recommender knew one event: a wedding. The site sells six, and the
 * other five fell through — a pasni is eighty people and no photographer,
 * a corporate dinner has no mehendi menu, and neither wants a wedding's
 * budget split.
 *
 * What actually differs between them is here as data. The scoring functions
 * below are shared, because how you pick a good venue does not change with
 * the occasion; only what you are looking for does.
 * ------------------------------------------------------------------ */

const OCCASIONS = {
  wedding: {
    label: 'Wedding',
    // Where the money goes. Catering dominates because it scales with the
    // guest list and everything else does not.
    split: { venue: 0.35, food: 0.5, studio: 0.15 },
    typicalGuests: 300,
    studio: 'expected',
    dishCategories: null, // everything is fair game
    note: 'The full day — bibaha, reception, and the bhoj.',
  },
  bratabandha: {
    label: 'Bratabandha',
    split: { venue: 0.3, food: 0.55, studio: 0.15 },
    typicalGuests: 150,
    studio: 'expected',
    dishCategories: null,
    note: 'The ceremony in the morning, the bhoj after it.',
  },
  pasni: {
    label: 'Pasni',
    split: { venue: 0.3, food: 0.6, studio: 0.1 },
    typicalGuests: 80,
    studio: 'optional',
    dishCategories: null,
    note: 'Rice-feeding, kept small and kept warm.',
  },
  mehendi: {
    label: 'Mehendi & Sangeet',
    // An evening event: less food per head, more room and more camera.
    split: { venue: 0.4, food: 0.4, studio: 0.2 },
    typicalGuests: 120,
    studio: 'expected',
    dishCategories: null,
    note: 'The loud night before the quiet morning.',
  },
  corporate: {
    label: 'Corporate',
    split: { venue: 0.45, food: 0.45, studio: 0.1 },
    typicalGuests: 200,
    studio: 'optional',
    dishCategories: null,
    note: 'Conferences, launches and annual dinners.',
  },
  anniversary: {
    label: 'Anniversary',
    split: { venue: 0.35, food: 0.5, studio: 0.15 },
    typicalGuests: 60,
    studio: 'optional',
    dishCategories: null,
    note: 'Milestones that deserve the good room.',
  },
};

exports.listOccasions = (_req, res) =>
  res.status(200).json({
    success: true,
    message: 'Occasions fetched successfully',
    data: {
      occasions: Object.entries(OCCASIONS).map(([id, o]) => ({
        id,
        label: o.label,
        note: o.note,
        typicalGuests: o.typicalGuests,
        studio: o.studio,
      })),
    },
  });

/**
 * GET /api/recommend/package?occasion=pasni&budget=250000&guests=80
 *
 * One total budget and a headcount, rather than three budgets the customer
 * has to invent. The split comes from the occasion, and because catering is
 * priced per plate, the food budget is checked against the headcount rather
 * than a flat number — the mistake the wedding endpoint makes.
 */
exports.getOccasionPackage = async (req, res) => {
  try {
    const occasionId = String(req.query.occasion || 'wedding').toLowerCase();
    const occasion = OCCASIONS[occasionId];
    if (!occasion) {
      return res.status(400).json({
        success: false,
        message: `Unknown occasion. Choose one of: ${Object.keys(OCCASIONS).join(', ')}`,
      });
    }

    const budget = Number(req.query.budget);
    if (!Number.isFinite(budget) || budget < 10000) {
      return res.status(400).json({
        success: false,
        message: 'Give a total budget of at least Rs 10,000.',
      });
    }

    const guests = Number(req.query.guests) || occasion.typicalGuests;
    if (!Number.isInteger(guests) || guests < 1 || guests > 100000) {
      return res.status(400).json({ success: false, message: 'Guest count must be a whole number.' });
    }

    const { location, skipStudio } = req.query;
    const wantsStudio = occasion.studio !== 'none' && String(skipStudio) !== 'true';

    /* When the studio is dropped, its share is not lost — it goes back to the
       two things that are still happening, in their existing proportion. */
    let split = { ...occasion.split };
    if (!wantsStudio) {
      const freed = split.studio;
      const rest = split.venue + split.food;
      split = {
        venue: split.venue + (freed * split.venue) / rest,
        food: split.food + (freed * split.food) / rest,
        studio: 0,
      };
    }

    const budgets = {
      venue: Math.round(budget * split.venue),
      food: Math.round(budget * split.food),
      studio: Math.round(budget * split.studio),
    };

    // Per plate, which is how catering is actually sold.
    const perPlate = Math.floor(budgets.food / guests);

    const venueFilter = { price: { $lte: budgets.venue * 1.1 } };
    if (location) venueFilter.location = containsFilter(location);
    // The room has to hold the party. This is a number on the schema, so it
    // is a comparison and not the regex guesswork the wedding endpoint does.
    venueFilter.capacity = { $gte: guests };

    const studioFilter = { price: { $lte: budgets.studio * 1.1 } };
    if (location) studioFilter.location = containsFilter(location);

    const [venues, studios, cuisines] = await Promise.all([
      Venue.find(venueFilter).lean(),
      wantsStudio ? Studio.find(studioFilter).lean() : [],
      Cuisine.find().lean(),
    ]);

    const venue = await calculateVenueScore(venues, budgets.venue, guests);
    const studio = wantsStudio ? await calculateStudioScore(studios, budgets.studio, location) : null;

    /* Dishes are chosen against the per-plate figure, then costed for the
       whole party — the number the customer actually pays. */
    const dishes = await selectBestDishesFromCategories(cuisines, perPlate);
    const platePrice = dishes.reduce((sum, d) => sum + d.price, 0);
    const cateringTotal = platePrice * guests;

    const venuePrice = venue?.price || 0;
    const studioPrice = studio?.price || 0;
    const total = venuePrice + studioPrice + cateringTotal;

    const notes = [];
    if (!venue) {
      notes.push(
        `Nothing holds ${guests} guests within Rs ${budgets.venue.toLocaleString('en-IN')}. Raise the budget or trim the guest list.`,
      );
    }
    if (wantsStudio && !studio) {
      notes.push(`No studio fits Rs ${budgets.studio.toLocaleString('en-IN')}. You can book the day without one.`);
    }
    if (!dishes.length) {
      notes.push(`Rs ${perPlate.toLocaleString('en-IN')} a plate is below our cheapest set. Raise the food budget.`);
    }
    if (total > budget) {
      notes.push(
        `This comes to Rs ${(total - budget).toLocaleString('en-IN')} over your budget — mostly because catering is Rs ${platePrice.toLocaleString('en-IN')} a plate for ${guests} people.`,
      );
    }

    return res.status(200).json({
      success: true,
      message: `${occasion.label} package generated successfully`,
      data: {
        occasion: { id: occasionId, ...occasion },
        guests,
        budget,
        split: budgets,
        perPlate,
        package: {
          venue: venue || null,
          studio: studio || null,
          dishes,
          platePrice,
          cateringTotal,
          totalPrice: total,
        },
        insights: {
          withinBudget: total <= budget,
          difference: budget - total,
          utilization: budget ? Math.round((total / budget) * 100) : 0,
          notes,
        },
      },
    });
  } catch (error) {
    console.error('Error building occasion package:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports.OCCASIONS = OCCASIONS;
