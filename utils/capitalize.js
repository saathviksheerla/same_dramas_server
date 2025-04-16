function capitalize(string) {
  if (!string || typeof string !== 'string') {
    return '';
  }
  
  // Split by spaces and colons to handle movie titles with multiple words
  return string.split(/[\s:]+/).map(word => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

module.exports = { capitalize };
  