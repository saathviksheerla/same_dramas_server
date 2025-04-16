// utils/geminiApi.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { 
  getMovieInfo, 
  getPersonFilmography, 
  getMoviesByGenre
} = require('./wikiApi');

// Initialize with the API key from environment variables
const API_KEY = process.env.GEMINI_API_KEY;

// Initialize the API
const genAI = new GoogleGenerativeAI(API_KEY);

// Get the model
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
  },
});

/**
 * Get similar movies using Gemini API for recommendations and Wikipedia for details
 * @param {string} movieName - Name of the movie
 * @param {Object} movieInfo - Movie info if already fetched
 * @returns {Promise<Object>} - Object with movie recommendations by category
 */
const getSimilarMovies = async (movieName, movieInfo = null) => {
  try {
    console.log(`Finding similar movies for: ${movieName}`);
    
    // Fetch movie info if not provided
    if (!movieInfo) {
      console.log("Fetching movie information from Wikipedia...");
      movieInfo = await getMovieInfo(movieName);
      
      if (!movieInfo) {
        console.log(`Could not find information for movie: ${movieName}`);
        return { directorMovies: [], actorMovies: [], genreMovies: [] };
      }
    }
    
    console.log(`Found movie info for ${movieInfo.title}`);
    console.log(`- Year: ${movieInfo.year || 'Unknown'}`);
    console.log(`- Director: ${movieInfo.director || 'Unknown'}`);
    console.log(`- Genres: ${(movieInfo.genre || []).join(', ') || 'Unknown'}`);
    console.log(`- Actors: ${(movieInfo.actors || []).slice(0, 3).join(', ') || 'Unknown'}`);
    
    // Get recommendations from Gemini
    const geminiRecommendations = await getRecommendationsFromGemini(movieInfo);
    
    // If Gemini recommendations failed or are empty, fall back to Wikipedia
    if (!geminiRecommendations || 
        (!geminiRecommendations.directorMovies?.length && 
         !geminiRecommendations.actorMovies?.length && 
         !geminiRecommendations.genreMovies?.length)) {
      
      console.log("Gemini recommendations failed or empty, using Wikipedia as fallback");
      return await getRecommendationsFromWikipedia(movieInfo);
    }
    
    // Process Gemini recommendations and fetch detailed info from Wikipedia
    return await enhanceGeminiRecommendationsWithWikipedia(geminiRecommendations);
  } catch (error) {
    console.error("Error getting similar movies:", error);
    
    // Fallback to Wikipedia recommendations if Gemini fails
    console.log("Error with Gemini, falling back to Wikipedia for recommendations");
    try {
      return await getRecommendationsFromWikipedia(movieInfo);
    } catch (fallbackError) {
      console.error("Wikipedia fallback also failed:", fallbackError);
      return {
        directorMovies: [],
        actorMovies: [],
        genreMovies: []
      };
    }
  }
};

/**
 * Get movie recommendations from Gemini AI
 * @param {Object} movieInfo - Movie information
 * @returns {Promise<Object>} - Object with recommendations by category
 */
async function getRecommendationsFromGemini(movieInfo) {
  try {
    console.log("Getting recommendations from Gemini AI...");
    
    // Create a prompt for Gemini
    const prompt = `
      I'm looking for movie recommendations similar to the following movie:
      Title: ${movieInfo.title || "Unknown"}
      Genre: ${Array.isArray(movieInfo.genre) ? movieInfo.genre.join(', ') : (movieInfo.genre || "Unknown")}
      Director: ${movieInfo.director || "Unknown"}
      Year: ${movieInfo.year || "Unknown"}
      Actors: ${Array.isArray(movieInfo.actors) ? movieInfo.actors.slice(0, 3).join(', ') : (movieInfo.actors || "Unknown")}
      
      Please provide a JSON response with three categories of similar movies:
      1. Movies with similar genres and themes
      2. Movies by the same director (if available)
      3. Movies with the same actors (if available)
      
      Format your response as valid JSON with this structure:
      {
        "genreMovies": [{"title": "Movie Title", "year": "Year", "description": "Brief description of why this movie is similar"}],
        "directorMovies": [{"title": "Movie Title", "year": "Year", "description": "Brief description of why this movie is similar"}],
        "actorMovies": [{"title": "Movie Title", "year": "Year", "description": "Brief description of why this movie is similar"}]
      }
      
      Limit each category to 3-5 movies. Use accurate movie titles and years.
      Don't include the original movie in the recommendations.
    `;
    
    // Call Gemini API
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    // Parse JSON response
    try {
      const text = response.text();
      // Clean up the response in case there's any markdown or extra text
      const jsonString = text.match(/\{[\s\S]*\}/)?.[0] || text;
      const jsonResponse = JSON.parse(jsonString);
      
      console.log(`Gemini recommendations:
        - Genre movies: ${jsonResponse.genreMovies?.length || 0}
        - Director movies: ${jsonResponse.directorMovies?.length || 0}
        - Actor movies: ${jsonResponse.actorMovies?.length || 0}`);
      
      return jsonResponse;
    } catch (error) {
      console.error("Error parsing Gemini API JSON response:", error);
      console.log("Raw response:", response.text());
      return null;
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}

/**
 * Get detailed movie information from Wikipedia for Gemini recommendations
 * @param {Object} recommendations - Recommendations from Gemini
 * @returns {Promise<Object>} - Enhanced recommendations with Wikipedia details
 */
async function enhanceGeminiRecommendationsWithWikipedia(recommendations) {
  try {
    const enhancedRecommendations = {
      directorMovies: [],
      actorMovies: [],
      genreMovies: []
    };
    
    // Helper function to get detailed movie info and format it
    const getAndFormatMovieInfo = async (movieTitle, year) => {
      try {
        const info = await getMovieInfo(movieTitle);
        
        if (info) {
          return {
            title: info.title || movieTitle,
            description: info.description || info.extract || "A noteworthy film in this category.",
            img: info.originalimage?.source || "https://via.placeholder.com/300x450?text=Movie+Poster",
            year: info.year || year || "",
            genre: Array.isArray(info.genre) ? info.genre.join(', ') : (info.genre || "")
          };
        }
        return null;
      } catch (error) {
        console.error(`Error getting info for ${movieTitle}:`, error);
        return null;
      }
    };
    
    // Process genre movies
    if (recommendations.genreMovies && recommendations.genreMovies.length > 0) {
      console.log("Processing genre movie recommendations...");
      for (const movie of recommendations.genreMovies.slice(0, 5)) {
        const info = await getAndFormatMovieInfo(movie.title, movie.year);
        if (info) enhancedRecommendations.genreMovies.push(info);
      }
    }
    
    // Process director movies
    if (recommendations.directorMovies && recommendations.directorMovies.length > 0) {
      console.log("Processing director movie recommendations...");
      for (const movie of recommendations.directorMovies.slice(0, 5)) {
        const info = await getAndFormatMovieInfo(movie.title, movie.year);
        if (info) enhancedRecommendations.directorMovies.push(info);
      }
    }
    
    // Process actor movies
    if (recommendations.actorMovies && recommendations.actorMovies.length > 0) {
      console.log("Processing actor movie recommendations...");
      for (const movie of recommendations.actorMovies.slice(0, 5)) {
        const info = await getAndFormatMovieInfo(movie.title, movie.year);
        if (info) enhancedRecommendations.actorMovies.push(info);
      }
    }
    
    console.log(`Enhanced Wikipedia details for recommendations:
      - Genre movies: ${enhancedRecommendations.genreMovies.length}
      - Director movies: ${enhancedRecommendations.directorMovies.length}
      - Actor movies: ${enhancedRecommendations.actorMovies.length}`);
    
    return enhancedRecommendations;
  } catch (error) {
    console.error("Error enhancing recommendations with Wikipedia:", error);
    return recommendations; // Return original recommendations if enhancement fails
  }
}

/**
 * Get movie recommendations from Wikipedia as a fallback
 * @param {Object} movieInfo - Movie information
 * @returns {Promise<Object>} - Object with recommendations by category
 */
async function getRecommendationsFromWikipedia(movieInfo) {
  try {
    console.log("Getting recommendations from Wikipedia...");
    
    // Arrays to store recommendations
    let directorRecommendations = [];
    let actorRecommendations = [];
    let genreRecommendations = [];
    
    // Track processed titles to avoid duplicates
    const processedTitles = new Set([movieInfo.title.toLowerCase()]);
    
    // Step 1: Get director's filmography
    if (movieInfo.director) {
      console.log(`Looking for other movies by director: ${movieInfo.director}`);
      const directorMovies = await getPersonFilmography(movieInfo.director, 'director');
      
      if (directorMovies.length > 0) {
        console.log(`Found ${directorMovies.length} movies directed by ${movieInfo.director}`);
        
        for (const title of directorMovies) {
          if (!processedTitles.has(title.toLowerCase())) {
            directorRecommendations.push(title);
            processedTitles.add(title.toLowerCase());
          }
        }
      }
    }
    
    // Step 2: Get actor filmographies (max 2 actors)
    const actorsToCheck = (movieInfo.actors || []).slice(0, 2);
    
    for (const actor of actorsToCheck) {
      console.log(`Looking for other movies with actor: ${actor}`);
      const actorMovies = await getPersonFilmography(actor, 'actor');
      
      if (actorMovies.length > 0) {
        console.log(`Found ${actorMovies.length} movies with ${actor}`);
        
        for (const title of actorMovies) {
          if (!processedTitles.has(title.toLowerCase())) {
            actorRecommendations.push(title);
            processedTitles.add(title.toLowerCase());
          }
        }
      }
    }
    
    // Step 3: Get genre-based recommendations
    if (movieInfo.genre && movieInfo.genre.length > 0) {
      const primaryGenre = Array.isArray(movieInfo.genre) ? movieInfo.genre[0] : movieInfo.genre;
      console.log(`Looking for movies in genre: ${primaryGenre}`);
      
      const genreMovies = await getMoviesByGenre(primaryGenre);
      
      if (genreMovies.length > 0) {
        console.log(`Found ${genreMovies.length} ${primaryGenre} movies`);
        
        for (const title of genreMovies) {
          if (!processedTitles.has(title.toLowerCase())) {
            genreRecommendations.push(title);
            processedTitles.add(title.toLowerCase());
            
            // Limit to 10 genre recommendations
            if (genreRecommendations.length >= 10) {
              break;
            }
          }
        }
      }
    }

    // Helper function to get detailed movie info for a list of movie titles
    const getDetailedMovieList = async (movieTitles, limit = 5) => {
      const detailedMovies = [];
      
      for (const title of movieTitles.slice(0, Math.min(10, movieTitles.length))) {
        try {
          const info = await getMovieInfo(title);
          
          if (info) {
            detailedMovies.push({
              title: info.title || title,
              description: info.description || info.extract || "A noteworthy film in this category.",
              img: info.originalimage?.source || "https://via.placeholder.com/300x450?text=Movie+Poster",
              year: info.year || "",
              genre: Array.isArray(info.genre) ? info.genre.join(', ') : (info.genre || "")
            });
          }
          
          // Limit to specified number of movies per category
          if (detailedMovies.length >= limit) {
            break;
          }
        } catch (error) {
          console.error(`Error getting detailed info for ${title}:`, error);
        }
      }
      
      return detailedMovies;
    };

    // Get detailed movie information for each category
    const detailedDirectorMovies = await getDetailedMovieList(directorRecommendations);
    const detailedActorMovies = await getDetailedMovieList(actorRecommendations);
    const detailedGenreMovies = await getDetailedMovieList(genreRecommendations);
    
    console.log(`Wikipedia recommendations gathered:
      - Director movies: ${detailedDirectorMovies.length}
      - Actor movies: ${detailedActorMovies.length}
      - Genre movies: ${detailedGenreMovies.length}`);

    return {
      directorMovies: detailedDirectorMovies,
      actorMovies: detailedActorMovies,
      genreMovies: detailedGenreMovies
    };
  } catch (error) {
    console.error("Error getting Wikipedia recommendations:", error);
    return {
      directorMovies: [],
      actorMovies: [],
      genreMovies: []
    };
  }
}

module.exports = {
  getSimilarMovies
};