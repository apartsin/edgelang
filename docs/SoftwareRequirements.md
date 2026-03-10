# EdgeLang - Software Requirements Specification

**Version:** 1.0  
**Date:** 2026-03-10  
**Project:** EdgeLang - AI Chrome Extension for Vocabulary-at-the-Edge Language Learning

---

## 1. Introduction

### 1.1 Purpose

This document specifies the complete software requirements for EdgeLang, an AI-powered Chrome extension that transforms web browsing into a contextual language learning experience. The system identifies vocabulary and phrases at the learner's competence boundary and presents them as interactive micro-learning opportunities directly within web content.

### 1.2 Scope

EdgeLang is a Chrome browser extension built on Manifest V3 that:

- Extracts text content from web pages
- Uses LLM-based AI to identify learnable vocabulary items
- Presents translation practice through interactive popups
- Tracks learner progress and adapts to proficiency level
- Routes all AI requests (LLM and TTS) through ModelMesh for resilience

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|------------|
| EdgeLang | The Chrome extension application |
| ModelMesh | TypeScript routing library for AI provider management |
| LLM | Large Language Model |
| TTS | Text-to-Speech |
| Passive Mode | Learning mode for foreign language reading |
| Active Mode | Learning mode for native-to-foreign translation |
| Visual Cue | Visual indicator on learnable words/phrases |
| Calibration | Initial proficiency assessment process |
| chrome.storage | Browser local storage API |

### 1.4 References

- SystemConcepts.md - Feature specification document
- ModelMesh Library - https://github.com/ApartsinProjects/ModelMesh
- Chrome Extension Manifest V3 Documentation

---

## 2. Overall Description

### 2.1 Product Perspective

EdgeLang is a client-side Chrome extension that operates entirely within the browser. It communicates with external AI services (LLM and TTS) through the ModelMesh TypeScript library, which runs directly in the extension's JavaScript environment.

### 2.2 Product Features

#### Core Features

1. **Edge-of-Ability Detection** - Identifies vocabulary at learner's competence boundary
2. **Phrase-Aware Learning** - Handles single words, idioms, collocations, phrases
3. **Passive Recognition Mode** - Foreign language reading with translation practice
4. **Active Recall Mode** - Native language to foreign language translation
5. **Pedagogically Meaningful Distractors** - Educational wrong answer options
6. **Explanation-Rich Feedback** - Detailed explanations for correct/incorrect answers
7. **Gamified Feedback** - Motivational feedback elements (toggleable)
8. **Personalized Adaptation** - Remembers learner history and hesitations
9. **Audio Pronunciation** - TTS playback via ModelMesh
10. **Proficiency Calibration Wizard** - Initial and ongoing level assessment

#### Configuration Features

11. **Configurable Options Page** - Language, API keys, models, preferences
12. **Visual Cue Styles** - Multiple highlighting options
13. **Question Intensity** - Percentage-based cue density
14. **Recall Intensity** - Probability of reviewing resolved items
15. **Blacklist/Whitelist** - Site-specific control
16. **Auto-detect Language** - Automatic page language detection
17. **Toolbar Popup** - Quick access to features
18. **Keyboard Shortcuts** - Power user navigation

#### System Features

19. **Browser-Local Storage** - All data stored in chrome.storage
20. **Offline Mode** - Graceful handling of no connectivity
21. **Sensitive Content Handling** - Ignores password fields, forms
22. **Error Handling** - Retry logic and graceful degradation
23. **Learning Statistics** - Progress tracking dashboard
24. **Break Mode** - Pause learning temporarily

### 2.3 User Classes and Characteristics

| User Class | Characteristics |
|------------|-----------------|
| New Learner | First-time user, needs onboarding, calibration |
| Returning Learner | Has history, uses refinement calibration |
| Advanced Learner | High proficiency, needs harder content |
| Privacy-Conscious User | Wants data export/clear options |
| Power User | Wants keyboard shortcuts, customization |

### 2.4 Operating Environment

- **Browser:** Google Chrome (latest 2 versions)
- **Platform:** Chrome OS, Windows, macOS, Linux
- **Manifest Version:** V3
- **Storage:** chrome.storage.local and chrome.storage.sync

### 2.5 Design and Implementation Constraints

1. All AI requests must go through ModelMesh TypeScript library
2. No external backend server required - all processing in browser
3. Chrome extensions can make cross-origin API calls without CORS proxy
4. Extension must not interfere with page functionality
5. All user data must remain in browser (chrome.storage)
6. API keys stored securely, never transmitted except to AI providers

---

## 3. Functional Requirements

### 3.1 Core Functionality

#### 3.1.1 Page Text Extraction

**FR-001:** The extension shall extract visible text content from web pages using Chrome content scripts.

**FR-002:** The extension shall ignore sensitive content including:
- Password fields
- Credit card number fields
- Form inputs
- Editable content
- Private browsing contexts

**FR-003:** The extension shall handle single-page applications (SPAs) with dynamic content loading.

**FR-004:** The extension shall optionally process content within iframes when enabled.

#### 3.1.2 Edge Detection and Item Selection

**FR-005:** The LLM shall analyze page text and estimate which items are at the learner's competence boundary.

**FR-006:** The system shall consider:
- Items previously answered correctly (reduce frequency)
- Items previously answered incorrectly (increase frequency)
- Items never encountered (include in rotation)
- Learner proficiency level from calibration

**FR-007:** The system shall select items based on configured question intensity (percentage of words per page length).

**FR-008:** The system shall optionally include previously-correct items based on recall intensity probability.

#### 3.1.3 Visual Cue Rendering

**FR-009:** The extension shall render visual cues on selected lexical items.

**FR-010:** Visual cue styles shall be configurable:
- Subtle underline (dotted)
- Faint background tint
- Corner dot
- Cursor change on hover
- Border highlight (for phrases)

**FR-011:** Default style shall be subtle underline with cursor change on hover.

**FR-012:** Visual cue visibility shall be adjustable (prominence slider).

#### 3.1.4 Interaction Flow

**FR-013:** Hovering over an item with visual cues shall trigger a popup with multiple choice options.

**FR-014:** The popup shall display configurable number of options (default 5, range 3-6).

**FR-015:** Selecting an answer shall provide instant feedback.

**FR-016:** Incorrect answers shall trigger explanation of:
- Why selected answer is wrong
- Why correct answer is right
- Nuance or usage distinction

**FR-017:** Learners shall be able to request additional examples.

#### 3.1.5 Passive Mode

**FR-018:** In passive mode, foreign language pages shall show visual cues on items near learner's level.

**FR-019:** Popup shall show foreign language translation options.

**FR-020:** Mode shall be auto-detected based on page language or manually toggled.

#### 3.1.6 Active Mode

**FR-021:** In active mode, native language pages shall show visual cues on useful target-language expressions.

**FR-022:** Popup shall show target language translation options for selection.

**FR-023:** Active mode shall train translation production skills.

#### 3.1.7 Gamification

**FR-024:** Positive feedback shall include:
- Micro-animations (subtle pulse, checkmark)
- Streak counters
- Motivational messages

**FR-025:** Constructive feedback shall include encouraging messages alongside explanations.

**FR-026:** Progress indicators shall show items mastered, streaks, level progression.

**FR-027:** All gamification features shall be independently toggleable.

#### 3.1.8 Item Resolution

**FR-028:** Items answered correctly once shall be marked as resolved.

**FR-029:** Resolved items shall be hidden from visual cues.

**FR-030:** Users shall be able to manually reset resolved items for review.

### 3.2 Calibration

#### 3.2.1 Initial Calibration

**FR-031:** First-time users shall be prompted to complete calibration after configuration.

**FR-032:** Calibration shall present 10 questions per round.

**FR-033:** Questions shall mix passive and active formats.

**FR-034:** Questions shall span varied difficulty bands.

**FR-035:** LLM shall generate questions from common target language vocabulary.

**FR-036:** System shall show provisional level after each round.

**FR-037:** Users shall choose to continue or stop after each round.

#### 3.2.2 Calibration Modes

**FR-038:** Users shall be able to assess from scratch.

**FR-039:** Users shall be able to refine existing profile.

**FR-040:** Users shall be able to re-calibrate from scratch.

**FR-041:** Users shall be able to self-assess level before calibration.

**FR-042:** Calibration shall be resumable across sessions.

### 3.3 Configuration

#### 3.3.1 Options Page

**FR-043:** Options page shall allow configuration of:
- Native language
- Target language
- API keys for AI providers
- Model selection per task type
- Visual cue style
- Question intensity (% per word count)
- Recall intensity (0-100%)
- Multiple choice option count
- Gamification toggles (positive/negative)
- Auto-start preferences
- Site blacklist/whitelist
- Auto-detect language toggle

#### 3.3.2 First-Run Onboarding

**FR-044:** On first install, options page shall open automatically.

**FR-045:** After configuration, calibration wizard shall launch automatically.

#### 3.3.3 Toolbar Popup

**FR-046:** Toolbar icon shall show status:
- Active
- Offline
- Not configured (warning)
- Paused

**FR-047:** Popup shall provide:
- Global enable/disable toggle
- Mode switch (passive/active)
- Language detection status with manual override
- Quick add/remove site from list
- Link to statistics

#### 3.3.4 Site Management

**FR-048:** Blacklist mode shall exclude specified sites.

**FR-049:** Whitelist mode shall include only specified sites.

**FR-050:** Default mode shall be blacklist.

**FR-051:** Sites shall be addable/removable from toolbar popup.

### 3.4 Data Management

#### 3.4.1 Storage

**FR-052:** All data shall be stored in chrome.storage.

**FR-053:** Stored data shall include:
- Interaction history (correct/incorrect, timestamps)
- Learned vocabulary list
- Calibration results
- User preferences
- Confusion patterns

**FR-054:** No data shall be sent to external servers.

#### 3.4.2 Export/Clear

**FR-055:** Users shall be able to export all learning data.

**FR-056:** Users shall be able to export vocabulary list separately.

**FR-057:** Users shall be able to clear all data.

### 3.5 Statistics

**FR-058:** Statistics dashboard shall display:
- Items mastered (resolved count)
- Current streak
- Accuracy rate
- Words vs phrases breakdown
- Time spent learning

### 3.6 Audio

**FR-059:** Audio pronunciation shall be available on demand.

**FR-060:** TTS requests shall route through ModelMesh.

**FR-061:** Audio shall be configurable (enable/disable).

**FR-062:** Pronunciations shall be cached locally.

### 3.7 System Behavior

#### 3.7.1 Connectivity

**FR-063:** Extension shall require internet for AI functionality.

**FR-064:** When offline, extension shall disable visual cues and show status indicator.

**FR-065:** When connectivity returns, extension shall resume automatically.

#### 3.7.2 Quotas

**FR-066:** When all provider quotas exhausted, extension shall disable until next session.

**FR-067:** Toolbar shall show quota exhausted indicator.

**FR-068:** Clear message shall inform user of quota limit.

#### 3.7.3 Errors

**FR-069:** Failed requests shall retry up to 3 times with backoff.

**FR-070:** All retries failing shall show page without cues (graceful fallback).

**FR-071:** Errors shall not interrupt user browsing.

### 3.8 Accessibility

**FR-072:** Extension shall support keyboard shortcuts:
- Toggle extension
- Navigate to next cue
- Select answer (number keys 1-6)
- Show/hide popup

**FR-073:** Shortcuts shall be customizable in options.

---

## 4. Interface Requirements

### 4.1 User Interfaces

#### 4.1.1 Options Page

- Language selection dropdowns
- API key input fields (masked)
- Model selection per task
- Visual cue style radio buttons
- Intensity sliders
- Toggle switches for features
- Text areas for site lists
- Export/Clear buttons

#### 4.1.2 Toolbar Popup

- Status indicator icon
- Enable/disable toggle switch
- Mode toggle (passive/active)
- Language detection display
- Quick site list buttons
- Statistics summary link

#### 4.1.3 Learning Popup

- Word/phrase display
- Multiple choice options (numbered)
- Correct/incorrect indicator
- Explanation text
- Additional examples toggle
- Audio play button (if enabled)
- Close button

#### 4.1.4 Calibration Wizard

- Progress indicator (question X of 10)
- Question display
- Answer options
- Provisional results display
- Continue/stop buttons

### 4.2 API Interfaces

#### 4.2.1 ModelMesh Interface

- OpenAI-compatible chat completion
- Capability-based routing
- Provider fallback
- Quota management

---

## 5. Non-Functional Requirements

### 5.1 Performance

**NFR-001:** Extension shall activate within 100ms of page load.

**NFR-002:** Content scripts shall run asynchronously without blocking page render.

**NFR-003:** API requests shall be batched where possible.

**NFR-004:** Visual cues shall not interfere with page interactions.

### 5.2 Security

**NFR-005:** API keys shall be stored in chrome.storage (not localStorage).

**NFR-006:** API keys shall never be transmitted except directly to AI providers.

**NFR-007:** Sensitive content (passwords, credit cards) shall never be processed.

**NFR-008:** Private browsing mode shall be respected.

### 5.3 Reliability

**NFR-009:** Extension shall handle AI provider failures gracefully.

**NFR-010:** Extension shall handle network failures gracefully.

**NFR-011:** Data shall persist across browser sessions.

### 5.4 Usability

**NFR-012:** Visual cues shall be noticeable but not distracting.

**NFR-013:** Popup shall appear quickly on hover.

**NFR-014:** Extension shall enhance browsing rather than hinder it.

---

## 6. Acceptance Criteria

### 6.1 Core Functionality

| ID | Criterion | Test Method |
|----|-----------|--------------|
| AC-001 | Extension installs without errors | Install from .crx, verify icon appears |
| AC-002 | Visual cues appear on foreign language pages | Browse target language site, verify cues |
| AC-003 | Popup appears on hover with translation options | Hover over cued item, verify popup |
| AC-004 | Correct/incorrect feedback displays | Answer questions, verify feedback |
| AC-005 | Active mode works on native language pages | Browse native site, verify active mode |
| AC-006 | Resolved items stop appearing | Answer item correctly, verify no recurrence |

### 6.2 Configuration

| ID | Criterion | Test Method |
|----|-----------|--------------|
| AC-007 | Options page saves all settings | Change settings, reload, verify persistence |
| AC-008 | Blacklist excludes sites | Add site to blacklist, verify no cues |
| AC-009 | Whitelist includes only specified sites | Switch to whitelist, verify only whitelisted work |
| AC-010 | Calibration estimates level | Complete calibration, verify estimate shows |

### 6.3 System

| ID | Criterion | Test Method |
|----|-----------|--------------|
| AC-011 | Offline mode disables cues | Disconnect network, verify disabled state |
| AC-012 | Data persists after restart | Answer questions, restart browser, verify history |
| AC-013 | Export produces valid data | Export data, verify readable format |

---

## 7. Appendix

### 7.1 Supported Languages

Initial language pairs supported through configuration:
- English (native and target)
- Spanish (native and target)
- French (native and target)
- German (native and target)
- Italian (native and target)
- Portuguese (native and target)
- Chinese (native and target)
- Japanese (native and target)
- Korean (native and target)

Additional languages can be added via configuration.

### 7.2 Supported AI Providers

**LLM Providers:**
- OpenAI (GPT-4, GPT-3.5 Turbo)
- Anthropic (Claude)
- Google (Gemini)
- Groq

**TTS Providers:**
- Microsoft Azure Speech
- Google Translate TTS

### 7.3 File Structure

```
edgelang/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── modelmesh/ (TypeScript library)
├── styles/
│   ├── cue.css
│   └── popup.css
├── _locales/
└── icons/
```

---

**Document Version History**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-10 | Initial requirements specification |
