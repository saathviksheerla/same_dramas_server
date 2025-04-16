const express = require("express");
const router = express.Router();
const {
  getHome,
  getMoreMovies,
  postMovie,
} = require("../controllers/movieController");

router.get("/home", getHome);
router.post("/moremovies", getMoreMovies);
router.post("/movie", postMovie);

module.exports = router;
