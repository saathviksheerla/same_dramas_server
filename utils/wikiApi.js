// utils/wikiApi.js

const axios = require('axios');

/**
 * Gets detailed movie information from Wikipedia
 * @param {string} movieName - The name of the movie to search for
 * @returns {Promise<Object|null>} - Movie information or null if not found
 */
async function getMovieInfo(movieName) {
  try {
    // First, search for the movie
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(movieName)}%20film&utf8=1&origin=*`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.query.search.length) {
      console.log(`No Wikipedia results found for "${movieName}"`);
      return null;
    }

    const pageId = searchResponse.data.query.search[0].pageid;

    // Get detailed information including images and content
    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages|revisions&pageids=${pageId}&exintro=1&explaintext=1&piprop=original&rvprop=content&utf8=1&origin=*`;
    const detailResponse = await axios.get(detailUrl);
    
    const page = detailResponse.data.query.pages[pageId];
    const content = page.revisions?.[0]?.['*'] || '';

    // Extract information from the content
    const yearMatch = content.match(/\|\s*release_date\s*=\s*{{.*?(\d{4})/);
    
    // Extract genres - improved regex to catch multiple genres
    let genres = [];
    const genreLine = content.match(/\|\s*genre\s*=\s*([^\n]+)/i);
    
    if (genreLine) {
      // Look for genres in various formats
      const genreText = genreLine[1];
      
      // Match genres in [[Genre]] format
      const bracketGenres = genreText.match(/\[\[([^\]]+)\]\]/g);
      if (bracketGenres) {
        bracketGenres.forEach(g => {
          genres.push(g.replace(/\[\[|\]\]/g, '').trim());
        });
      }
      
      // Match genres in plain text format
      if (genres.length === 0) {
        const plainGenres = genreText.split(/,|{{|}}|\|/).filter(Boolean);
        genres = plainGenres.map(g => g.trim()).filter(g => g.length > 2 && !g.includes('='));
      }
    }
    
    // If no genres found in structured format, try to extract from description
    if (genres.length === 0 && page.extract) {
      const commonGenres = [
        "Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", 
        "Documentary", "Drama", "Family", "Fantasy", "Film-Noir", "History", 
        "Horror", "Musical", "Mystery", "Romance", "Sci-Fi", "Sport", 
        "Thriller", "War", "Western"
      ];
      
      const genreRegex = new RegExp(`\\b(${commonGenres.join('|')})\\b`, 'gi');
      const extractedGenres = [...page.extract.matchAll(genreRegex)].map(match => match[0]);
      
      if (extractedGenres.length > 0) {
        genres = [...new Set(extractedGenres)]; // Remove duplicates
      }
    }
    
    // Extract director information - improved regex
    const directorLine = content.match(/\|\s*director\s*=\s*([^\n]+)/i);
    let directors = [];
    
    if (directorLine) {
      const directorText = directorLine[1];
      
      // Match directors in [[Name]] format
      const bracketDirectors = directorText.match(/\[\[([^\]]+)\]\]/g);
      if (bracketDirectors) {
        bracketDirectors.forEach(d => {
          directors.push(d.replace(/\[\[|\]\]/g, '').split('|')[0].trim());
        });
      }
      
      // Match directors in other formats if none found
      if (directors.length === 0) {
        directors = directorText
          .split(/,|{{|}}|\|/)
          .filter(Boolean)
          .map(d => d.trim())
          .filter(d => d.length > 2 && !d.includes('='));
      }
    }
    
    // Extract starring actors - improved regex
    const starringLine = content.match(/\|\s*starring\s*=\s*([^\n]+)/i);
    let actors = [];
    
    if (starringLine) {
      const starringText = starringLine[1];
      
      // Match actors in [[Name]] format
      const bracketActors = starringText.match(/\[\[([^\]]+)\]\]/g);
      if (bracketActors) {
        bracketActors.forEach(a => {
          actors.push(a.replace(/\[\[|\]\]/g, '').split('|')[0].trim());
        });
      }
      
      // Match actors in other formats if none found
      if (actors.length === 0) {
        actors = starringText
          .split(/,|{{|}}|\|/)
          .filter(Boolean)
          .map(a => a.trim())
          .filter(a => a.length > 2 && !a.includes('='));
      }
    }

    // Get a better quality image if available
    let imageUrl = null;
    if (page.original && page.original.source) {
      imageUrl = page.original.source;
    }

    // Try to get a better image from the page content if not found
    if (!imageUrl) {
      const imageMatch = content.match(/\|\s*image\s*=\s*([^|\n]+)/);
      if (imageMatch) {
        const imageName = imageMatch[1].trim();
        const imageApiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&titles=File:${encodeURIComponent(imageName)}&iiprop=url&origin=*`;
        try {
          const imageResponse = await axios.get(imageApiUrl);
          const pages = imageResponse.data.query.pages;
          const imageInfo = pages[Object.keys(pages)[0]];
          if (imageInfo.imageinfo && imageInfo.imageinfo[0]) {
            imageUrl = imageInfo.imageinfo[0].url;
          }
        } catch (error) {
          console.error('Error fetching image:', error);
        }
      }
    }

    // Create a description if not available
    let description = page.extract || "";
    if (description.length > 300) {
      description = description.substring(0, 297) + "...";
    }

    return {
      title: page.title.replace(/ \(film\)$/, ''),
      description: description,
      extract: page.extract,
      originalimage: { source: imageUrl },
      year: yearMatch ? yearMatch[1] : null,
      genre: genres,
      director: directors[0] || '',
      directors: directors,
      actors: actors,
      pageId: pageId,
      wikiUrl: `https://en.wikipedia.org/?curid=${pageId}`
    };
  } catch (error) {
    console.error('Error fetching movie info from Wikipedia:', error);
    return null;
  }
}

/**
 * Searches for movies related to a specific person (actor or director)
 * @param {string} personName - Name of the person to search for
 * @param {string} role - 'actor' or 'director'
 * @returns {Promise<Array>} - List of movie titles
 */
async function getPersonFilmography(personName, role = 'actor') {
  try {
    // First, search for the person
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(personName)}&utf8=1&origin=*`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.query.search.length) {
      return [];
    }

    const pageId = searchResponse.data.query.search[0].pageid;

    // Get detailed information
    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&pageids=${pageId}&rvprop=content&rvslots=main&utf8=1&origin=*`;
    const detailResponse = await axios.get(detailUrl);
    
    const content = detailResponse.data.query.pages[pageId].revisions[0].slots.main['*'];
    
    // Extract filmography section
    const filmographyRegex = new RegExp(`==+\\s*(Film(ography|s)|Movies|${role === 'director' ? 'Director|Directing' : role === 'actor' ? 'Acting|Actor|Actress' : 'Works'})[^=]*==+([\\s\\S]*?)(?:==|$)`, 'i');
    const filmographyMatch = content.match(filmographyRegex);
    
    if (!filmographyMatch) {
      return [];
    }
    
    const filmographyContent = filmographyMatch[3];
    
    // Extract movie titles
    const movieTitles = [];
    
    // Method 1: Find movies in tables
    const tableRowRegex = /\|\s*'''\[\[([^\]]+)\]\]'''\s*\|/g;
    let tableMatch;
    
    while ((tableMatch = tableRowRegex.exec(filmographyContent)) !== null) {
      const title = tableMatch[1].split('|')[0].trim();
      if (title && !title.includes('#') && !movieTitles.includes(title)) {
        movieTitles.push(title);
      }
    }
    
    // Method 2: Find movies in list items
    const listItemRegex = /[*#]\s*'''\[\[([^\]]+)\]\]'''/g;
    let listMatch;
    
    while ((listMatch = listItemRegex.exec(filmographyContent)) !== null) {
      const title = listMatch[1].split('|')[0].trim();
      if (title && !title.includes('#') && !movieTitles.includes(title)) {
        movieTitles.push(title);
      }
    }

    // Method 3: Find any movie in brackets with year
    const bracketYearRegex = /\[\[([^\]]+)\]\][^(]*\((\d{4})\)/g;
    let bracketMatch;
    
    while ((bracketMatch = bracketYearRegex.exec(filmographyContent)) !== null) {
      const title = bracketMatch[1].split('|')[0].trim();
      if (title && !title.includes('#') && !movieTitles.includes(title)) {
        movieTitles.push(title);
      }
    }
    
    return movieTitles.slice(0, 10); // Limit to 10 movies
  } catch (error) {
    console.error(`Error fetching filmography for ${personName}:`, error);
    return [];
  }
}

/**
 * Gets a list of movies in a specific genre
 * @param {string} genre - The genre to search for
 * @returns {Promise<Array>} - List of movie titles
 */
async function getMoviesByGenre(genre) {
  try {
    // Search for list of genre films
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(`List of ${genre} films`)}&utf8=1&origin=*`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.query.search.length) {
      return [];
    }

    const pageId = searchResponse.data.query.search[0].pageid;

    // Get page content
    const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&pageids=${pageId}&rvprop=content&rvslots=main&utf8=1&origin=*`;
    const contentResponse = await axios.get(contentUrl);
    
    const content = contentResponse.data.query.pages[pageId].revisions[0].slots.main['*'];
    
    // Extract movie titles from lists and sections
    const movieTitles = [];
    
    // Look for movies in list format: * ''[[Movie Title]]'' (Year)
    const listRegex = /[*#]\s*'*\[\[([^\]]+?)(?:\|[^\]]+)?\]\]'*[^(]*(?:\((\d{4})\))?/g;
    let listMatch;
    
    while ((listMatch = listRegex.exec(content)) !== null) {
      const title = listMatch[1].split('|')[0].trim();
      if (title && !title.includes('#') && !movieTitles.includes(title)) {
        movieTitles.push(title);
      }
      
      // Limit to 30 results
      if (movieTitles.length >= 30) {
        break;
      }
    }
    
    // If we didn't find enough movies, look in tables
    if (movieTitles.length < 20) {
      const tableRegex = /\|\s*'*\[\[([^\]]+?)(?:\|[^\]]+)?\]\]'*/g;
      let tableMatch;
      
      while ((tableMatch = tableRegex.exec(content)) !== null) {
        const title = tableMatch[1].split('|')[0].trim();
        if (title && !title.includes('#') && !movieTitles.includes(title)) {
          movieTitles.push(title);
        }
        
        // Limit to 30 results
        if (movieTitles.length >= 30) {
          break;
        }
      }
    }
    
    // Randomize and return a smaller subset
    return shuffleArray(movieTitles).slice(0, 10);
  } catch (error) {
    console.error(`Error fetching movies for genre ${genre}:`, error);
    return [];
  }
}

/**
 * Gets a list of similar movies based on a given movie
 * @param {string} movieTitle - The title of the movie
 * @returns {Promise<Array>} - List of similar movie titles
 */
async function getSimilarMoviesFromWiki(movieTitle) {
  try {
    // First, search for the movie
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(movieTitle)}%20film&utf8=1&origin=*`;
    const searchResponse = await axios.get(searchUrl);
    
    if (!searchResponse.data.query.search.length) {
      return [];
    }

    const pageId = searchResponse.data.query.search[0].pageid;

    // Get the full text of the page
    const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&pageids=${pageId}&rvprop=content&rvslots=main&utf8=1&origin=*`;
    const contentResponse = await axios.get(contentUrl);
    
    const content = contentResponse.data.query.pages[pageId].revisions[0].slots.main['*'];
    
    // Look for sections that might contain similar films
    const similarSectionRegex = /==+\s*(Similar|Related|See also|Comparable|Influence|Legacy|In popular culture)[^=]*==+([^=]+)/i;
    const similarMatch = content.match(similarSectionRegex);
    
    const similarMovies = [];
    
    if (similarMatch) {
      const similarSection = similarMatch[2];
      
      // Extract movie titles
      const movieLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let linkMatch;
      
      while ((linkMatch = movieLinkRegex.exec(similarSection)) !== null) {
        const title = linkMatch[1].trim();
        if (title && !title.includes(':') && !title.includes('#') && !similarMovies.includes(title)) {
          similarMovies.push(title);
        }
      }
    }
    
    return similarMovies;
  } catch (error) {
    console.error(`Error fetching similar movies for ${movieTitle}:`, error);
    return [];
  }
}

// Helper function to shuffle an array
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

module.exports = {
  getMovieInfo,
  getPersonFilmography,
  getMoviesByGenre,
  getSimilarMoviesFromWiki
};