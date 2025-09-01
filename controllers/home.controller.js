const { recMoviesData } = require('../utils/movies');

// Initialize movies with the data from movies.js
let movies = [...recMoviesData];

// Log initial movies for debugging
console.log("Initial movies loaded:", movies.length);
console.log("First movie:", movies.length > 0 ? movies[0].title : "No movies");

exports.getHome = (req, res) => {
  try {
    console.log("GET /api called");
    res.json({
      status: "success",
      data: {
        movies: movies.slice(0, 10), // Send first 10 movies for initial load
      }
    });
  } catch (error) {
    console.error("Error in getHome:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get home data",
      error: error.message
    });
  }
};