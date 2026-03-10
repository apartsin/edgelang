# EdgeLang - Test Plan

**Version:** 1.0  
**Date:** 2026-03-10  
**Project:** EdgeLang - AI Chrome Extension for Vocabulary-at-the-Edge Language Learning

---

## 1. Introduction

### 1.1 Purpose

This document defines the comprehensive test plan for EdgeLang, including test objectives, scope, strategy, resources, and detailed test cases. The test plan ensures all functional and non-functional requirements are validated before release.

### 1.2 Scope

This test plan covers:

- Unit tests for individual functions
- Integration tests for component interaction
- System tests for end-to-end workflows
- UI/UX tests for user interfaces
- Performance tests for timing requirements
- Security tests for data protection
- Compatibility tests across platforms

### 1.3 Test Objectives

1. Verify all functional requirements are implemented correctly
2. Validate non-functional requirements (performance, security, reliability)
3. Ensure proper error handling and graceful degradation
4. Confirm user experience meets usability standards
5. Identify and document defects before release

---

## 2. Test Strategy

### 2.1 Testing Levels

| Level | Description | Tools |
|-------|-------------|-------|
| Unit | Individual functions and methods | Jest, Mocha |
| Integration | Component interaction | Puppeteer, Playwright |
| System | End-to-end workflows | Puppeteer, Selenium |
| Manual | UI validation, exploratory | N/A |

### 2.2 Test Types

| Type | Purpose | Coverage |
|------|---------|----------|
| Functional | Verify feature behavior | All FRs |
| Regression | Ensure no breakage | All features |
| Performance | Timing, load | NFRs |
| Security | Data protection | NFRs |
| Usability | User experience | UI components |

### 2.3 Test Environment

- **Browser:** Chrome (latest, latest-1, latest-2)
- **Platforms:** Windows 10/11, macOS 12+, Ubuntu 22.04+
- **Extensions:** Developer mode, unpacked loading

---

## 3. Test Resources

### 3.1 Human Resources

| Role | Responsibility |
|------|----------------|
| Test Lead | Test planning, coordination |
| QA Engineer | Test case creation, execution |
| Developer | Unit tests, fix verification |
| UX Designer | Usability validation |

### 3.2 Test Data

| Category | Source |
|----------|--------|
| Web pages | Alexa top 100 (multiple languages) |
| Vocabulary | Common word lists per language |
| Calibration questions | Generated from word banks |
| User profiles | Simulated learning histories |

---

## 4. Test Cases

### 4.1 Installation Tests

#### TC-001: Clean Installation
**Objective:** Verify extension installs without errors

**Steps:**
1. Open Chrome with clean profile
2. Navigate to chrome://extensions
3. Enable Developer mode
4. Click "Load unpacked"
5. Select extension directory

**Expected Result:** Extension icon appears in toolbar, no errors in console

**Pass Criteria:** Icon visible, no console errors

---

#### TC-002: First-Run Behavior
**Objective:** Verify options page opens on first install

**Steps:**
1. Load extension with fresh profile
2. Observe automatic behavior

**Expected Result:** Options page opens automatically

**Pass Criteria:** Options page displayed within 3 seconds

---

#### TC-003: Re-installation
**Objective:** Verify settings persist after reinstall

**Steps:**
1. Configure settings (language, API keys)
2. Uninstall extension
3. Re-install extension

**Expected Result:** Settings retained (if using chrome.storage.sync)

**Pass Criteria:** Settings preserved

---

### 4.2 Core Functionality Tests

#### TC-010: Page Text Extraction
**Objective:** Verify text extraction from various page types

**Test Data:**
| Page Type | Example |
|-----------|---------|
| Static HTML | News article |
| SPA | Gmail, Twitter |
| Iframe | Embedded YouTube |
| Dynamic | Infinite scroll |

**Steps:**
1. Load each page type
2. Extract text via content script
3. Verify text captured

**Expected Result:** Text extracted from visible content

**Pass Criteria:** >90% visible text captured

---

#### TC-011: Sensitive Content Exclusion
**Objective:** Verify sensitive fields are ignored

**Test Data:**
```html
<input type="password" id="pwd" value="secret123">
<input type="text" id="cc" value="4111111111111111">
<input type="text" name="cvv" value="123">
<textarea name="notes">Sensitive data</textarea>
```

**Steps:**
1. Load page with sensitive fields
2. Run text extraction
3. Verify sensitive values not included

**Expected Result:** No sensitive content in extracted text

**Pass Criteria:** Passwords, credit cards, CVVs not extracted

---

#### TC-012: Visual Cue Rendering
**Objective:** Verify visual cues appear on correct elements

**Steps:**
1. Navigate to foreign language page
2. Wait for cues to load
3. Inspect DOM for cue elements

**Expected Result:** Visual cues rendered on target words

**Pass Criteria:** Cues visible on configured percentage of words

---

#### TC-013: Visual Cue Styles
**Objective:** Verify all visual cue styles render correctly

**Test Cases:**
| Style | Verification |
|-------|--------------|
| Subtle underline | CSS dotted border |
| Background tint | Background color applied |
| Corner dot | Pseudo-element visible |
| Cursor change | CSS cursor property |
| Border highlight | Border visible on phrases |

**Steps:**
1. Change cue style in options
2. Navigate to test page
3. Verify style applied

**Expected Result:** Each style renders correctly

**Pass Criteria:** All 5 styles functional

---

#### TC-014: Popup Display on Hover
**Objective:** Verify popup appears on hover

**Steps:**
1. Hover over cued item
2. Measure time to popup
3. Verify popup content

**Expected Result:** Popup appears within 200ms with options

**Pass Criteria:** Popup visible, contains translation options

---

#### TC-015: Multiple Choice Options Count
**Objective:** Verify configurable option count

**Test Values:** 3, 4, 5, 6 options

**Steps:**
1. Set option count in options
2. Hover over cued item
3. Count displayed options

**Expected Result:** Number of options matches setting

**Pass Criteria:** All values (3-6) work correctly

---

#### TC-016: Answer Selection and Feedback
**Objective:** Verify answer selection and feedback display

**Steps:**
1. Hover over cued item
2. Click correct answer
3. Observe feedback
4. Click incorrect answer
5. Observe feedback

**Expected Result:** Correct/incorrect feedback displayed

**Pass Criteria:** Feedback shows for both correct and incorrect

---

#### TC-017: Explanation Display
**Objective:** Verify explanation appears for incorrect answers

**Steps:**
1. Select incorrect answer
2. Verify explanation shown
3. Check explanation content

**Expected Result:** Explanation includes:
- Why selected is wrong
- Why correct is right
- Usage nuance

**Pass Criteria:** All explanation components visible

---

#### TC-018: Passive Mode Functionality
**Objective:** Verify passive mode on foreign language pages

**Steps:**
1. Set target language to Spanish
2. Navigate to Spanish news site
3. Verify cues appear
4. Verify popup shows translation options

**Expected Result:** Passive mode active on foreign page

**Pass Criteria:** Translation options in popup

---

#### TC-019: Active Mode Functionality
**Objective:** Verify active mode on native language pages

**Steps:**
1. Set native language to English
2. Navigate to English site
3. Verify cues appear
4. Verify popup shows target language options

**Expected Result:** Active mode active on native page

**Pass Criteria:** Target language options in popup

---

#### TC-020: Language Auto-Detection
**Objective:** Verify automatic language detection

**Steps:**
1. Navigate to Spanish page
2. Verify passive mode (auto)
3. Navigate to English page
4. Verify active mode (auto)

**Expected Result:** Mode switches based on page language

**Pass Criteria:** Correct mode for each language

---

#### TC-021: Manual Mode Override
**Objective:** Verify manual mode toggle works

**Steps:**
1. On foreign page, switch to active mode manually
2. Verify active mode active
3. Refresh page
4. Verify override persists (if session-based)

**Expected Result:** Manual override changes mode

**Pass Criteria:** Mode changes as toggled

---

#### TC-022: Item Resolution
**Objective:** Verify resolved items stop appearing

**Steps:**
1. Answer item correctly
2. Navigate away
3. Return to same page
4. Verify item no longer has visual cue

**Expected Result:** Resolved item hidden

**Pass Criteria:** Correct answer = item resolved

---

#### TC-023: Manual Reset of Resolved Items
**Objective:** Verify user can reset resolved items

**Steps:**
1. Find resolved item in options
2. Click reset for item
3. Navigate to page with item
4. Verify cue reappears

**Expected Result:** Reset item becomes active again

**Pass Criteria:** Item visible after reset

---

### 4.3 Calibration Tests

#### TC-030: Initial Calibration Flow
**Objective:** Verify calibration wizard completes

**Steps:**
1. Complete first-run setup
2. Observe calibration start
3. Answer 10 questions
4. Verify results shown
5. Choose to continue (or not)

**Expected Result:** Calibration completes with level estimate

**Pass Criteria:** Level estimate displayed

---

#### TC-031: Calibration Question Mix
**Objective:** Verify both passive and active questions

**Steps:**
1. Run calibration
2. Answer questions
3. Observe question types

**Expected Result:** Mix of passive and active formats

**Pass Criteria:** Both types present

---

#### TC-032: Calibration Rounds
**Objective:** Verify 10 questions per round

**Steps:**
1. Start calibration
2. Count questions in first round

**Expected Result:** Exactly 10 questions

**Pass Criteria:** 10 questions shown

---

#### TC-033: Continue/Stop After Round
**Objective:** Verify user choice after round

**Steps:**
1. Complete first 10
2. Verify prompt to continue
3. Choose continue
4. Verify more questions
5. Return, choose stop
6. Verify calibration ends

**Expected Result:** User controls continuation

**Pass Criteria:** Both continue and stop work

---

#### TC-034: Calibration Resume
**Objective:** Verify calibration can be paused and resumed

**Steps:**
1. Start calibration
2. Answer 5 questions
3. Close browser
4. Reopen, return to calibration
5. Verify resume prompt

**Expected Result:** Calibration resumes from checkpoint

**Pass Criteria:** Progress retained

---

### 4.4 Configuration Tests

#### TC-040: Language Selection
**Objective:** Verify language configuration saves

**Steps:**
1. Open options
2. Set native language
3. Set target language
4. Save and reload
5. Verify settings persist

**Expected Result:** Languages saved correctly

**Pass Criteria:** Settings persist after reload

---

#### TC-041: API Key Configuration
**Objective:** Verify API keys save and mask

**Steps:**
1. Enter API key
2. Verify masked in UI
3. Reload options
4. Verify key persists (masked)

**Expected Result:** Key saved, masked display

**Pass Criteria:** Key works, not visible in plain text

---

#### TC-042: Model Selection
**Objective:** Verify model per-task selection

**Steps:**
1. Configure different models for:
   - Classification (fast)
   - Explanation (smart)
2. Use extension
3. Verify correct model used per task

**Expected Result:** Task-specific models used

**Pass Criteria:** Models apply to correct tasks

---

#### TC-043: Question Intensity Configuration
**Objective:** Verify intensity slider works

**Test Values:** 1%, 5%, 10%, 20%

**Steps:**
1. Set intensity to value
2. Navigate to test page
3. Count visual cues
4. Compare to expected percentage

**Expected Result:** Cues match configured intensity

**Pass Criteria:** Within 20% of configured value

---

#### TC-044: Recall Intensity Configuration
**Objective:** Verify recall probability works

**Test Values:** 0%, 25%, 50%, 75%, 100%

**Steps:**
1. Set recall intensity
2. Visit pages with resolved items
3. Count reappearance rate

**Expected Result:** Resolved items reappear at configured rate

**Pass Criteria:** Within 30% of configured probability

---

#### TC-045: Gamification Toggles
**Objective:** Verify gamification can be disabled

**Steps:**
1. Enable all gamification
2. Answer correctly, observe feedback
3. Disable positive feedback
4. Answer correctly, verify no positive feedback
5. Disable negative feedback
6. Answer incorrectly, verify no feedback

**Expected Result:** Gamification toggles work independently

**Pass Criteria:** Each toggle affects only its feedback type

---

### 4.5 Site Management Tests

#### TC-050: Blacklist Mode
**Objective:** Verify blacklist excludes sites

**Steps:**
1. Visit site A (add to blacklist)
2. Navigate to site A
3. Verify no cues
4. Navigate to site B
5. Verify cues appear

**Expected Result:** Blacklisted site has no cues

**Pass Criteria:** Blacklist overrides normal operation

---

#### TC-051: Whitelist Mode
**Objective:** Verify whitelist includes only specified sites

**Steps:**
1. Switch to whitelist mode
2. Add site A to whitelist
3. Visit site A (verify cues)
4. Visit site B (verify no cues)

**Expected Result:** Only whitelisted sites have cues

**Pass Criteria:** Whitelist mode restricts to specified sites

---

#### TC-052: Quick Add/Remove from Popup
**Objective:** Verify toolbar popup site management

**Steps:**
1. Visit site
2. Open toolbar popup
3. Click "Add to blacklist"
4. Verify added message
5. Refresh, verify no cues
6. Click "Remove from blacklist"
7. Verify cues return

**Expected Result:** Quick add/remove works

**Pass Criteria:** Both add and remove function correctly

---

### 4.6 Data Management Tests

#### TC-060: Data Persistence
**Objective:** Verify data survives browser restart

**Steps:**
1. Answer several questions
2. Close browser completely
3. Reopen browser
4. Verify history persists

**Expected Result:** All history retained

**Pass Criteria:** Full history available after restart

---

#### TC-061: Data Export
**Objective:** Verify export produces valid data

**Steps:**
1. Generate learning data
2. Click Export
3. Save file
4. Validate JSON format

**Expected Result:** Valid JSON with all data

**Pass Criteria:** File readable, contains expected fields

---

#### TC-062: Vocabulary List Export
**Objective:** Verify vocabulary export separately

**Steps:**
1. Learn several items
2. Export vocabulary list
3. Verify format

**Expected Result:** Vocabulary in usable format (CSV/JSON)

**Pass Criteria:** File contains learned items

---

#### TC-063: Data Clear
**Objective:** Verify data can be cleared

**Steps:**
1. Generate data
2. Click Clear All Data
3. Confirm
4. Verify no data remains

**Expected Result:** All data cleared

**Pass Criteria:** History, vocabulary, settings reset

---

### 4.7 System Behavior Tests

#### TC-070: Offline Mode
**Objective:** Verify graceful offline handling

**Steps:**
1. Enable extension
2. Disconnect network
3. Navigate to page
4. Observe behavior

**Expected Result:** Visual cues disabled, status shows offline

**Pass Criteria:** No errors, clear offline indicator

---

#### TC-071: Online Recovery
**Objective:** Verify extension resumes when online

**Steps:**
1. With extension disabled (offline)
2. Reconnect network
3. Verify automatic recovery

**Expected Result:** Cues re-enable automatically

**Pass Criteria:** Normal function resumes

---

#### TC-072: Quota Exhaustion Handling
**Objective:** Verify quota exhaustion handled gracefully

**Steps:**
1. Configure provider with low quota
2. Exhaust quota
3. Observe behavior

**Expected Result:** Clear message, disable until next session

**Pass Criteria:** User informed, no errors shown

---

#### TC-073: API Error Handling
**Objective:** Verify API errors don't crash extension

**Steps:**
1. Configure invalid API key
2. Use extension
3. Observe error handling

**Expected Result:** Graceful fallback, no crash

**Pass Criteria:** Page readable, error logged

---

### 4.8 Audio Tests

#### TC-080: Pronunciation Playback
**Objective:** Verify TTS plays correctly

**Steps:**
1. Enable pronunciation
2. Hover over item
3. Click play button
4. Verify audio plays

**Expected Result:** Audio pronunciation audible

**Pass Criteria:** Sound plays for correct word

---

#### TC-081: Audio Caching
**Objective:** Verify audio is cached

**Steps:**
1. Play pronunciation for word
2. Note first load time
3. Play same word again
4. Note second load time

**Expected Result:** Second load faster (cached)

**Pass Criteria:** Second load <50% of first

---

### 4.9 Performance Tests

#### TC-090: Extension Activation Time
**Objective:** Verify fast activation

**Steps:**
1. Navigate to page
2. Measure time until cues appear
3. Repeat 10 times

**Expected Result:** Activation <100ms average

**Pass Criteria:** Mean <100ms

---

#### TC-091: Popup Response Time
**Objective:** Verify popup appears quickly

**Steps:**
1. Hover over cued item
2. Measure time to popup visible

**Expected Result:** <200ms

**Pass Criteria:** Mean <200ms

---

#### TC-092: Page Load Impact
**Objective:** Verify extension doesn't block page

**Steps:**
1. Measure page load time without extension
2. Measure with extension enabled
3. Compare times

**Expected Result:** <5% increase

**Pass Criteria:** No significant blocking

---

### 4.10 Security Tests

#### TC-100: API Key Storage
**Objective:** Verify keys not in localStorage

**Steps:**
1. Enter API key
2. Check chrome.localStorage
3. Check window.localStorage

**Expected Result:** Keys only in chrome.storage

**Pass Criteria:** No keys in localStorage

---

#### TC-101: Sensitive Data Handling
**Objective:** Verify sensitive inputs never processed

**Steps:**
1. Create page with password field
2. Ensure password text exists nearby
3. Run extension
4. Verify password not in any output

**Expected Result:** Passwords never processed

**Pass Criteria:** Sensitive data excluded

---

## 5. Regression Testing

### 5.1 Regression Schedule

| Trigger | Scope |
|---------|-------|
| Every commit | Unit tests |
| Daily build | Integration tests |
| Weekly | Full system suite |
| Pre-release | Complete test suite |

### 5.2 Regression Test Cases

A subset of critical tests run on every build:

| Test ID | Description | Priority |
|---------|-------------|----------|
| TC-001 | Installation | Critical |
| TC-012 | Visual cues appear | Critical |
| TC-014 | Popup display | Critical |
| TC-016 | Answer feedback | Critical |
| TC-070 | Offline mode | High |
| TC-060 | Data persistence | High |

---

## 6. Defect Management

### 6.1 Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| Critical | Extension doesn't load, crashes | 24 hours |
| High | Core feature broken | 48 hours |
| Medium | Feature works but has issues | 1 week |
| Low | Cosmetic, minor issue | 2 weeks |

### 6.2 Defect Report Fields

- Defect ID
- Summary
- Steps to Reproduce
- Expected Result
- Actual Result
- Severity
- Priority
- Environment
- Screenshots/Logs

---

## 7. Test Deliverables

| Deliverable | Description |
|-------------|-------------|
| Test Plan | This document |
| Test Cases | Detailed test case specifications |
| Test Data | Required test data sets |
| Test Reports | Execution results |
| Defect Reports | Found issues documentation |

---

## 8. Test Completion Criteria

### 8.1 Exit Criteria

- All critical tests pass (100%)
- All high priority tests pass (>95%)
- No critical or high severity open defects
- Performance benchmarks met
- Security scan passed

### 8.2 Release Approval

Release requires:
1. Test lead sign-off
2. All critical defects resolved
3. Performance metrics within thresholds
4. Security review passed

---

## 9. Appendix

### 9.1 Test Data Sources

**Language Learning corpora:**
- OpenSubtitles
- Wikipedia dumps
- Common Voice

**Vocabulary lists:**
- CEFR word lists (A1-C2)
- Frequency dictionaries
- Idiom collections

### 9.2 Test Accounts

| Provider | Test Account | Notes |
|----------|--------------|-------|
| OpenAI | Test API key | Rate limited |
| Anthropic | Test API key | Rate limited |
| Azure | Test subscription | Limited credits |

---

**Document Version History**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-10 | Initial test plan |
