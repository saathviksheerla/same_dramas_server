const wiki = require("wikipedia");
const { capitalize } = require("../utils/capitalize");
const { recMoviesData } = require('../utils/movies');
const { getMovieInfo } = require('../utils/wikiApi');
const { getSimilarMovies } = require('../utils/geminiApi');

let searchedMovie = null;

// Fallback image for when Wikipedia doesn't provide one
const FALLBACK_IMAGE = "https://via.placeholder.com/300x450?text=Movie+Poster";

exports.getMoreMovies = async (req, res) => {
  try {
    if (!movies || movies.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Insufficient movies data"
      });
    }

    searchedMovie = capitalize(movies[1].title);
    const response = await getMovieInfo(searchedMovie);
    
    if (!response || !response.title) {
      return res.status(404).json({
        status: "error",
        message: "Movie information not found"
      });
    }

    // Format the movie data to match movies.js structure
    const newMovie = {
      title: response.title,
      img: response.originalimage ? response.originalimage.source : FALLBACK_IMAGE,
      description: response.extract || `Information about ${response.title}`
    };

    // Get similar movies recommendations using Gemini API
    const similarMovies = await getSimilarMovies(searchedMovie, response);
    console.log("similar movies: ", similarMovies);
    
    // Add recommended movies to the list
    if (similarMovies && similarMovies.genreMovies) {
      for (const movie of similarMovies.genreMovies) {
        const movieInfo = await getMovieInfo(movie.title);
        if (movieInfo && movieInfo.title) {
          movies.unshift({
            title: movieInfo.title,
            img: movieInfo.originalimage ? movieInfo.originalimage.source : FALLBACK_IMAGE,
            description: movieInfo.extract || `Information about ${movieInfo.title}`
          });
        }
      }
    }
    
    searchedMovie = newMovie;
    res.json({
      status: "success",
      message: "Movies updated successfully",
      data: { movies }
    });
  } catch (error) {
    console.error("Error in getMoreMovies:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch more movies"
    });
  }
};

exports.postMovie = async (req, res) => {
  try {
    const { moviename } = req.body;
    
    if (!moviename) {
      return res.status(400).json({
        status: "error",
        message: "Movie name is required"
      });
    }
    
    console.log(`Searching for movie: ${moviename}`);
    
    // Get movie info from Wikipedia
    const movieInfo = await getMovieInfo(moviename);
    
    if (!movieInfo) {
      return res.status(404).json({
        status: "error",
        message: `Movie "${moviename}" not found. Please try a different title.`
      });
    }

    // Format the searched movie data
    const searchedMovieData = {
      title: movieInfo.title,
      img: movieInfo.originalimage ? movieInfo.originalimage.source : FALLBACK_IMAGE,
      description: movieInfo.extract || `Information about ${movieInfo.title}`,
      genre: Array.isArray(movieInfo.genre) ? movieInfo.genre.join(', ') : movieInfo.genre,
      director: movieInfo.director,
      actors: Array.isArray(movieInfo.actors) ? movieInfo.actors.join(', ') : movieInfo.actors,
      year: movieInfo.year
    };
    
    // Get similar movies recommendations using Gemini API
    const similarMovies = await getSimilarMovies(moviename, movieInfo);
    console.log("Similar movies found:", 
      similarMovies.directorMovies?.length || 0,
      similarMovies.actorMovies?.length || 0,
      similarMovies.genreMovies?.length || 0);
    
    // Check if we got any recommendations
    const hasRecommendations = 
      (similarMovies.directorMovies && similarMovies.directorMovies.length > 0) || 
      (similarMovies.actorMovies && similarMovies.actorMovies.length > 0) || 
      (similarMovies.genreMovies && similarMovies.genreMovies.length > 0);
    
    if (hasRecommendations) {
      return res.json({
        status: "success",
        message: "Success",
        data: {
          searchedMovie: searchedMovieData,
          similarMovies
        }
      });
    } else {
      // Partial success - found the movie but couldn't get recommendations
      return res.json({
        status: "partial_success",
        message: "Found the movie, but couldn't find recommendations.",
        data: {
          searchedMovie: searchedMovieData,
          similarMovies: {
            directorMovies: [],
            actorMovies: [],
            genreMovies: []
          }
        }
      });
    }
  } catch (error) {
    console.error("Error in postMovie:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to process movie request",
      error: error.message
    });
  }
};