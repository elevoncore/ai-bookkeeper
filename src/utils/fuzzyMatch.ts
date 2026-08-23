/**
 * Calculates Levenshtein Distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const str1 = a.toLowerCase().trim();
  const str2 = b.toLowerCase().trim();

  if (str1 === str2) return 0;
  if (str1.length === 0) return str2.length;
  if (str2.length === 0) return str1.length;

  const len1 = str1.length;
  const len2 = str2.length;

  let prevRow = new Int32Array(len2 + 1);
  let currRow = new Int32Array(len2 + 1);

  for (let j = 0; j <= len2; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const char1 = str1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const char2 = str2.charCodeAt(j - 1);
      const cost = char1 === char2 ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,
        prevRow[j] + 1,
        prevRow[j - 1] + cost
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[len2];
}

/**
 * Calculates similarity score (0 to 1) based on Levenshtein distance.
 */
export function stringSimilarity(a: string, b: string): number {
 const maxLength = Math.max(a.length, b.length);
 if (maxLength === 0) return 1.0;
 const distance = levenshteinDistance(a, b);
 return (maxLength - distance) / maxLength;
}

/**
 * Finds best fuzzy match among candidate accounts.
 * Includes word token matching & Levenshtein distance similarity.
 */
export function findBestAccountMatch<T extends { id: string; name: string }>(
 searchName: string,
 candidates: T[],
 threshold = 0.45
): { account: T; score: number } | null {
 if (!searchName || !candidates || candidates.length === 0) return null;
 const cleanSearch = searchName.trim().toLowerCase();
 const searchWords = cleanSearch.split(/\s+/).filter(w => w.length > 2);

 let bestMatch: { account: T; score: number } | null = null;
 let highestScore = 0;

 for (const candidate of candidates) {
 const cleanCand = candidate.name.trim().toLowerCase();

 // 1. Direct exact match
 if (cleanCand === cleanSearch) {
 return { account: candidate, score: 1.0 };
 }

 // 2. Substring / Word inclusion match
 if (cleanCand.includes(cleanSearch) || cleanSearch.includes(cleanCand)) {
 const subScore = 0.95;
 if (subScore > highestScore) {
 highestScore = subScore;
 bestMatch = { account: candidate, score: subScore };
 }
 continue;
 }

 // 3. Word token intersection (e.g., "softwares" vs "Software & Hosting")
 const candWords = cleanCand.split(/\s+/).filter(w => w.length > 2);
 let wordMatchCount = 0;

 for (const sWord of searchWords) {
 for (const cWord of candWords) {
 if (sWord.includes(cWord) || cWord.includes(sWord) || stringSimilarity(sWord, cWord) >= 0.70) {
 wordMatchCount++;
 break;
 }
 }
 }

 if (wordMatchCount > 0 && searchWords.length > 0) {
 const wordScore = 0.85 * (wordMatchCount / Math.max(searchWords.length, candWords.length));
 if (wordScore > highestScore && wordScore >= threshold) {
 highestScore = wordScore;
 bestMatch = { account: candidate, score: wordScore };
 }
 }

 // 4. Levenshtein fuzzy similarity
 const score = stringSimilarity(cleanSearch, cleanCand);
 if (score > highestScore && score >= threshold) {
 highestScore = score;
 bestMatch = { account: candidate, score };
 }
 }

 return bestMatch;
}
