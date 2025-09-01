const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const movieRoutes = require("./routes/movie.routes");
const trailerRoutes = require("./routes/trailer.routes");
const { getHome } = require("./controllers/home.controller");
require('dotenv').config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.get("/api", getHome);
app.use("/api/movies", movieRoutes);
app.use("/api/trailers", trailerRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "success",
    message: "Movie Recommendation API running...",
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: "error",
    message: "Something went wrong!",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('GEMINI_API_KEY status:', process.env.GEMINI_API_KEY ? 'Found' : 'Not Found');
});
