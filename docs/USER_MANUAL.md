# EdgeLang User Manual

EdgeLang is a Chrome extension for contextual language learning while browsing real websites. This manual covers setup, daily use, configuration, and troubleshooting.

## What EdgeLang Does

EdgeLang reads visible page text, sends a compact analysis request to an AI provider, and highlights words or phrases that match your current learning edge. Hovering or clicking a cue opens a small quiz-style popup for translation practice.

The project uses [ModelMesh](https://modelmesh.tech/) concepts for provider routing and failover so the extension can work across multiple AI backends.

## Installation

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the project [src](../src) folder.

If Chrome says there is no manifest, you selected the repository root instead of `src`.

## Initial Setup

1. Click the EdgeLang toolbar icon.
2. Open `Settings`.
3. Choose:
   - your native language
   - your target language
4. Enter one or more API keys.
5. Click `Validate Keys`.
6. Pick provider models if needed.
7. Run calibration.

## Main Modes

### Auto

EdgeLang chooses passive or active mode based on the page language.

### Passive

Use this when reading content in your target language. Highlighted items test comprehension from target language to native language.

### Active

Use this when reading content in your native language. Highlighted items test recall from native language to target language.

## Toolbar and Popup

The toolbar popup gives you fast access to:

- current extension status
- on or off toggle
- auto, passive, and active mode selection
- pause toggle
- current site add or remove
- statistics
- calibration shortcut
- settings shortcut

### Processing indicator

If the extension is still analyzing a page, the toolbar status shows `Processing...` and the toolbar button flashes a badge dot.

### Blocker reason

If nothing appears on the page, open the popup and check the status line. Common reasons include:

- `api_keys_not_configured`
- `site_disabled`
- `paused`
- `offline`
- `insufficient_text`
- `no_cues_after_filtering`
- `no_dom_matches_for_cues`

## Visual Cue Settings

You can configure:

- cue style
  - underline
  - background
  - corner dot
  - border
- highlight color
  - default is light red
- question intensity
- recall intensity
- number of multiple-choice options

## Language Settings

Both native and target language selectors include a broad list of supported languages, including:

- English
- Russian
- Hebrew
- Spanish
- French
- German
- Italian
- Portuguese
- Arabic
- Chinese
- Japanese
- Korean
- Hindi
- Ukrainian
- Thai
- and more

## Calibration

Calibration estimates your level with a short question round.

- choose a self-assessed starting level
- answer the questions
- EdgeLang stores the result locally
- if you stop midway, progress can be resumed later

## Statistics and Data

The options page includes:

- mastered items
- streak
- accuracy
- attempts
- vocabulary count
- last active date

You can also:

- export all extension data
- export vocabulary only
- clear all stored data

## Provider Configuration

EdgeLang supports multiple provider keys and model selection. The options page can validate keys before you save.

Typical providers in the current project:

- OpenAI
- Anthropic
- Google Gemini
- Groq
- OpenRouter

## Troubleshooting

### The extension loads but nothing happens

Check the popup status first. If the extension is working, it may still be processing the page.

If it still does nothing:

1. Make sure at least one API key is configured.
2. Confirm the current site is not blocked.
3. Make sure the extension is not paused.
4. Check whether the page has enough visible text.
5. Wait for late-loading sites such as news pages to finish hydrating.

### Chrome cannot load the extension

Make sure you loaded the [src](../src) directory and not the repository root.

### API keys fail validation

Check:

- the provider key format
- that the provider account is active
- that the selected model is available for that provider

### A cue is highlighted but awkwardly styled

Change:

- cue style
- highlight color

in the settings page.

## Related Documents

- [Project README](../README.md)
- [System Concepts](SystemConcepts.md)
- [Software Requirements](SoftwareRequirements.md)
- [Test Plan](TestPlan.md)
