# EdgeLang

AI Chrome Extension for Vocabulary-at-the-Edge Language Learning

## Overview

EdgeLang transforms web browsing into a contextual language learning experience by identifying vocabulary and phrases at the learner's competence boundary and presenting them as interactive micro-learning opportunities.

## Features

- **Edge-of-Ability Detection** - AI-powered identification of learnable vocabulary
- **Dual Learning Modes** - Passive (reading) and Active (translation) practice
- **Phrase-Aware Learning** - Multi-word expressions, idioms, collocations
- **Adaptive Personalization** - Learns from learner responses and progress
- **Gamification** - Streaks, progress tracking, motivational feedback
- **Multi-Provider AI** - Routes through ModelMesh for resilience
- **Audio Pronunciation** - TTS support via Azure/Google

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `src` directory

## Configuration

1. Click the EdgeLang icon in the toolbar
2. Click "Settings"
3. Configure your native and target languages
4. Enter API keys for at least one AI provider:
   - OpenAI (GPT-3.5/GPT-4)
   - Anthropic (Claude)
   - Google (Gemini)
5. Run the calibration wizard to set your level
6. Start browsing!

## Development

### Project Structure

```
src/
├── manifest.json        # Extension manifest (MV3)
├── background.js       # Background service worker
├── content.js          # Content script (injected into pages)
├── popup.html/js       # Toolbar popup
├── options.html/js     # Settings page
├── styles/
│   └── cue.css        # Visual cue styles
tests/
├── test-runner.html   # Browser-based test runner
└── test-suite.js      # Test cases
```

### Running Tests

Open `tests/test-runner.html` in a browser to run the test suite.

## Tech Stack

- Chrome Extension API (Manifest V3)
- JavaScript (ES6+)
- ModelMesh TypeScript Library
- Chrome Storage API

## Requirements

- Chrome Browser (latest 2 versions)
- At least one AI provider API key

## License

MIT
