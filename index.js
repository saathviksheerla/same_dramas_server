require('dotenv').config();
const express = require('express');
const cors = require('cors');
const movieRoutes = require('./routes/movieRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', movieRoutes);

const PORT = process.env.PORT || 5500;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('GEMINI_API_KEY status:', process.env.GEMINI_API_KEY ? 'Found' : 'Not Found');
}); 