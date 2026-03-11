function stripCodeFences(text) {
  return String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

export function extractFirstJSONArray(text) {
  const source = stripCodeFences(text);
  const start = source.indexOf('[');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return source.slice(start);
}

function removeTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function tryParseArrayCandidate(candidate) {
  if (!candidate) return null;
  const normalized = removeTrailingCommas(candidate.trim());
  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractCompleteTopLevelObjects(arrayCandidate) {
  const objects = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < arrayCandidate.length; index += 1) {
    const char = arrayCandidate[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        objects.push(arrayCandidate.slice(objectStart, index + 1));
        objectStart = -1;
      }
    }
  }

  return objects;
}

function salvageObjectsFromArrayCandidate(candidate) {
  const objectCandidates = extractCompleteTopLevelObjects(candidate);
  const parsedObjects = objectCandidates
    .map((objectText) => {
      try {
        return JSON.parse(removeTrailingCommas(objectText));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return parsedObjects.length ? parsedObjects : null;
}

export function parseJSONArrayWithRepair(text) {
  const candidate = extractFirstJSONArray(text);
  if (!candidate) {
    return null;
  }

  const direct = tryParseArrayCandidate(candidate);
  if (direct) {
    return direct;
  }

  const repairedClosed = tryParseArrayCandidate(candidate.endsWith(']') ? candidate : `${candidate}]`);
  if (repairedClosed) {
    return repairedClosed;
  }

  return salvageObjectsFromArrayCandidate(candidate);
}
