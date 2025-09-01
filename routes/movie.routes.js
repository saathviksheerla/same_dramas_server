const express = require("express");
const router = express.Router();
const {
  getMoreMovies,
  postMovie,
} = require("../controllers/movie.controller");

router.post("/more", getMoreMovies);
router.post("/", postMovie);

module.exports = router;
