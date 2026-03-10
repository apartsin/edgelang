# EdgeLang: AI Chrome Extension for Vocabulary-at-the-Edge Language Learning

## Project Description

**EdgeLang** is an AI-driven Chrome extension (built on Manifest V3) for foreign-language learning that turns everyday web browsing into a continuous, personalized vocabulary and phrase acquisition experience. Instead of forcing the learner into isolated exercises, EdgeLang works directly on real web pages and identifies words, idiomatic expressions, and common word sequences that are likely to be **just at the edge of the learner’s current ability**.

The extension operates in two complementary modes:

- **Passive mode**: the page is shown in the foreign language, and the extension adds visual cues to words and multi-word expressions that the learner is likely close to understanding but has not yet fully mastered. When the learner hovers over a highlighted item, a popup appears with multiple choice translation options. Selecting an answer provides instant feedback.
- **Active mode**: the page is shown in the learner’s native language, and the extension adds visual cues to native-language words or phrases that correspond to useful foreign-language expressions the learner is learning. When the learner hovers over a highlighted item, a popup appears with multiple choice options for the foreign-language translation. This trains active recall and production ability—the skill of translating from native to target language.

For each selected item, the extension presents a small set of carefully chosen translation options designed not only to test correctness, but also to promote learning through **contrast**. Distractors are intentionally close enough to the correct meaning to be educational rather than arbitrary. When the learner answers incorrectly, the system explains:

- why the selected answer is wrong,
- why the correct answer is right,
- what nuance or usage pattern distinguishes them,
- and optionally shows additional examples in context.

All pedagogical logic is driven by an LLM-based backend. The system continuously tracks the learner’s choices and interaction history in order to estimate what vocabulary and phrase patterns are:

- already mastered,
- too easy to be worth interrupting for,
- too difficult to be productive,
- and most importantly, **on the learner’s current learning edge**.

This allows the extension to maintain a dynamic and personalized zone of desirable difficulty while browsing authentic content.

A key architectural choice is the use of **ModelMesh** for routing across multiple AI providers. ModelMesh is an OpenAI-compatible capability-driven routing library available in both Python and TypeScript. The TypeScript implementation runs directly in the Chrome extension's JavaScript environment, providing automatic failover, free-tier aggregation, and capability-based routing without requiring a separate backend server. As a result, EdgeLang can improve resilience, manage cost and quota constraints, reduce dependence on a single provider, and support future experimentation with model-specific prompting strategies for different pedagogical tasks such as phrase selection, distractor generation, explanation generation, and learner-level estimation.

---

## Motivation

Traditional language learning tools often separate learning from real reading and real use. Learners study vocabulary lists, flashcards, or simplified exercises, but struggle when they return to authentic web content. At the same time, ordinary browser-based translation tools make reading easier, but often remove the productive friction needed for durable learning.

EdgeLang is motivated by the need for a **middle layer between effortless translation and overwhelming immersion**.

The central idea is that language acquisition improves when the learner repeatedly encounters content that is:

- meaningful in context,
- slightly challenging but still accessible,
- repeated across varied real-world situations,
- and supported by feedback that explains distinctions rather than merely giving answers.

Vocabulary knowledge is also not limited to isolated words. Real fluency depends heavily on:

- idiomatic expressions,
- collocations,
- typical word sequences,
- usage constraints,
- and subtle meaning contrasts.

For this reason, EdgeLang focuses not only on single-word translation, but also on **multi-word units and typical phrase patterns**, which are often the hardest part of becoming natural in a foreign language.

The project is also motivated by a practical observation: people already spend large amounts of time reading online. If browsing itself becomes a personalized language-learning environment, language practice can become continuous, contextual, and far more scalable than separate study sessions alone.

From a systems perspective, the use of ModelMesh adds an additional motivation: modern AI-powered educational products must remain robust under changing model availability, pricing, latency, and quota conditions. A provider-rotation layer makes the extension more deployable in real-world settings and better suited for iterative product evolution.

---

## Core Idea

EdgeLang transforms arbitrary web pages into adaptive language-learning surfaces.

Instead of asking:

> “What content should the learner study next?”

the system asks:

> “Given what the learner is reading right now, which words or phrases are most worth turning into a micro-learning opportunity?”

The extension identifies promising lexical targets, creates pedagogically useful choices, collects learner responses, and continuously refines its estimate of the learner’s competence boundary.

This makes the web itself function as a personalized, dynamic corpus for vocabulary and phrase acquisition.

---

## High-Level Architecture

EdgeLang consists of the following main layers:

### 1. Chrome extension layer

Responsible for:

- page text extraction using Chrome content scripts,
- segmentation into candidate words and multi-word expressions,
- visual highlighting and cue rendering,
- hover and interaction popups,
- response collection,
- local state and user preference handling via chrome.storage,
- options page for language and API configuration.

### 2. Learner data storage layer

Responsible for:

- storing user interaction history in chrome.storage,
- persisting learned vocabulary and phrase lists,
- caching proficiency calibration results,
- retrieving data for LLM requests,
- **all reasoning and analysis is performed by the LLM layer** (Layer 3).

### 3. LLM pedagogical reasoning layer

Responsible for:

- selecting candidate lexical targets,
- generating close-but-instructive distractors,
- producing explanations,
- identifying idiomatic and collocational meaning,
- generating additional examples,
- estimating pedagogical fit for current learner level.

### 4. AI provider routing layer

Implemented using **ModelMesh TypeScript library** (running directly in the Chrome extension), responsible for:

- rotating across multiple AI providers (OpenAI, Anthropic, Gemini, Groq, etc.) from the browser,
- providing OpenAI-compatible interface,
- handling automatic failover with retry and backoff,
- managing quotas and rate limits across providers,
- enabling capability-based routing strategies,
- supporting A/B testing across providers and models.

This architecture allows EdgeLang to treat AI backends as interchangeable reasoning engines behind a stable product experience.

---

## Why ModelMesh Matters Here

EdgeLang depends on frequent, small, interaction-driven AI calls. These may include:

- phrase difficulty estimation,
- distractor generation,
- explanation generation,
- active-mode prompt creation,
- example generation,
- adaptive learner-boundary estimation.

This interaction pattern creates practical deployment risks if the product depends on a single model provider. By using ModelMesh as a front-end provider-rotation layer, the system can:

- reduce downtime risk,
- handle quota exhaustion more gracefully,
- optimize for latency-sensitive UI interactions,
- direct expensive requests only to higher-end models when needed,
- route simpler requests to cheaper models,
- compare pedagogical quality across providers,
- remain adaptable as the LLM ecosystem evolves.

In this product, provider flexibility is not only an infrastructure convenience. It is part of the learning experience design, because different tasks may benefit from different models:

- one model may be better at concise distractor generation,
- another at nuanced explanation,
- another at fast lightweight classification.

---

## Key Capabilities

### 1. Edge-of-ability detection

The system identifies lexical items that are neither trivial nor impossibly hard, but are close to the learner’s likely competence boundary.

### 2. Phrase-aware learning

The extension handles:

- single words,
- idiomatic expressions,
- collocations,
- common word sequences,
- fixed and semi-fixed phrases.

### 3. Passive recognition mode

The learner reads foreign-language content and is gently prompted on selected foreign items.

### 4. Active recall mode

The learner reads native-language content and is asked to retrieve the foreign-language equivalent of selected expressions.

### 5. Pedagogically meaningful distractors

Wrong answer options are selected to be plausible and instructionally useful, helping the learner notice semantic boundaries and usage distinctions.

### 6. Explanation-rich feedback

Incorrect answers trigger explanations of:

- semantic mismatch,
- register mismatch,
- collocation error,
- idiomatic misuse,
- near-synonym confusion,
- or literal-vs-natural translation differences.

### 7. Personalized adaptation

The system remembers prior success, repeated errors, and resolved items to avoid wasting attention on content that is clearly too easy or too hard. **Hesitation detection**: the LLM analyzes response time patterns from interaction history to identify items where the learner hesitated before answering, indicating partial knowledge that needs reinforcement.

### 8. Example-driven reinforcement

The learner can request extra examples and short usage notes to support durable understanding.

### 9. Multi-provider AI execution

The extension uses ModelMesh TypeScript library to route pedagogical requests across multiple AI providers directly from the browser, with automatic failover and quota management.

### 10. Cost- and reliability-aware inference

The product can assign different subtasks to different models depending on speed, cost, availability, and output quality requirements.

### 11. Proficiency calibration wizard

Before or alongside regular browsing, the system offers a structured assessment flow that quickly narrows down the learner's competence boundary. The wizard presents a sequence of 10 multiple-choice questions drawn from the target language, mixing passive (recognition) and active (recall) formats. Each question targets vocabulary and phrases at different difficulty bands. The LLM generates questions on-the-fly based on the learner's previous answer history (if available) to efficiently narrow down the competence boundary. After completing a round of 10, the system displays a provisional level estimate and asks the learner whether they want to continue for greater precision. This iterative refinement continues until the learner is satisfied or the system reaches high confidence. The wizard can also resume from a partial profile if the learner has prior history, allowing for quick updates rather than starting over.

### 12. Configurable options page

The extension provides an options page where users configure:

- **Native language**: the learner's first language
- **Target language**: the foreign language to learn
- **AI providers**: API keys for OpenAI, Anthropic, Gemini, Groq, or other ModelMesh-supported providers
- **Model selection**: which models to use for different tasks (e.g., faster models for classification, smarter models for explanation generation)
- **Visual cues**: preferred highlighting style (see capability #13)
- **Intensity slider**: how many items to highlight per page
- **Auto-start preferences**: whether to launch calibration on first use

### 13. Configurable visual cues

The extension provides non-intrusive but clear visual indicators for learnable items. Users can choose from multiple options:

- **Subtle underline**: light dotted line beneath target words
- **Faint background tint**: low-opacity colored background on target spans
- **Corner dot**: small dot indicator in the corner of the word
- **Cursor change**: cursor changes when hovering over learnable items
- **Border highlight**: thin border around multi-word expressions

All cues are designed to be visible enough to notice but not distracting from reading flow. The default is subtle underline with cursor change on hover.

### 14. All intelligence from LLM

Every pedagogical decision is driven by the LLM layer with appropriate prompting:

- **Edge detection**: LLM analyzes page text and estimates which items are at the learner's boundary
- **Distractor generation**: LLM creates plausible wrong answers that teach meaningful distinctions
- **Explanation generation**: LLM produces nuanced explanations for why answers are right or wrong
- **Calibration question selection**: LLM generates or selects appropriate questions based on estimated level
- **Confusion pattern detection**: LLM identifies repeated mistake types from interaction history
- **Learner boundary estimation**: LLM continuously updates the competence profile from responses

The Chrome extension serves primarily as the presentation and interaction layer, while all reasoning, selection, and adaptation logic resides in the LLM backend.

### 15. Browser-local storage

All user data is stored locally in the browser using chrome.storage. This includes:

- interaction history (correct/incorrect answers, timestamps)
- learned vocabulary and phrase list
- proficiency calibration results
- user preferences and settings
- confusion pattern records

No data is sent to external servers. Users can export or clear their data at any time through the options page.

### 16. Offline mode

The extension requires an internet connection to function, as all pedagogical intelligence relies on LLM API calls. When offline:

- The extension automatically disables all highlighting and interaction
- A status indicator shows that the extension is offline
- Previously cached data (profile, settings, resolved items) remains stored locally
- When connectivity returns, the extension resumes normal operation automatically

This ensures users are not confused by non-functional cues and prevents frustration from failed API calls.

### 17. Toolbar icon and popup

The extension appears as an icon in the Chrome toolbar with a popup that provides:

- **Status indicator**: shows whether extension is active, offline, or needs configuration
- **Quick toggle**: enable/disable extension for current page
- **Mode switch**: toggle between passive and active mode
- **Language detection**: shows detected page language, with manual override option
- **Quick actions**: fast access to add/remove current site from blacklist/whitelist

The toolbar icon also shows visual cues when API keys are not configured (e.g., grayed out or warning icon).

### 18. Site blacklist and whitelist

Users can control which sites the extension operates on:

- **Blacklist mode** (default): extension works on all sites except those explicitly blacklisted
- **Whitelist mode**: extension works only on explicitly whitelisted sites
- **Fast toggle**: right-click toolbar icon or use popup to instantly add/remove current site
- **Bulk management**: edit lists in options page

This gives users granular control over where learning opportunities appear.

### 19. First-run onboarding and calibration wizard

On first installation:

1. Options page opens automatically to configure native language, target language, and API keys
2. After configuration, the proficiency calibration wizard launches automatically to establish initial competence estimate
3. The wizard presents 10 questions at a time, allowing users to continue or stop after each round
4. Once calibrated, the extension begins highlighting learnable items on web pages

Users can re-run calibration anytime from the options page or toolbar popup.

### 20. Non-blocking, fast-loading design

The extension is designed to never interfere with normal browser usage:

- **Zero blocking**: content scripts run asynchronously, never blocking page render or interaction
- **Fast initialization**: extension activates within 100ms of page load
- **Lightweight footprint**: minimal JavaScript bundle, lazy-loaded features
- **Efficient API calls**: requests are batched where possible, with intelligent caching
- **Graceful degradation**: if LLM is slow, page remains readable without cues until response arrives

This ensures the extension enhances browsing rather than hindering it.

---

## Why This Matters

Most language-learning software treats vocabulary as a list of isolated items detached from real-world use. But in actual reading, learners encounter meaning through context, phrase patterns, and usage conventions. A learner may know the dictionary meaning of each word in a phrase and still fail to understand the phrase as used.

EdgeLang addresses this gap by embedding vocabulary learning into real reading, while using AI to personalize both selection and feedback. The result is a learning environment that is:

- contextual,
- adaptive,
- low-friction,
- and focused on the most pedagogically valuable moments.

This is especially important for intermediate learners, where the main bottleneck is often no longer basic grammar, but rather:

- lexical coverage,
- phrase familiarity,
- collocational fluency,
- and sensitivity to natural expression.

The use of ModelMesh also makes the product more realistic as a scalable Chrome extension rather than a prototype tied to a single vendor. This matters for long-term maintainability, service continuity, and product economics.

---

## Target Users

EdgeLang is intended for:

- learners who already browse content in either their native or target language,
- intermediate and advanced beginners who need contextual vocabulary growth,
- learners who want lightweight but continuous practice,
- users who benefit from adaptive micro-interactions rather than long formal lessons.

It is especially suitable for users who want to improve:

- reading comprehension,
- vocabulary depth,
- idiomatic understanding,
- and active recall of natural phrases.

---

## User Stories

## Passive Mode: Reading in Foreign Language

### US-01 — Detect relevant learning opportunities

As a learner reading a foreign-language webpage, I want the extension to highlight only words and expressions that are near my current level, so that I am challenged without being overwhelmed.

### US-02 — Avoid trivial interruptions

As a learner, I want the system to avoid highlighting items I clearly already know, so that the experience remains efficient and not distracting.

### US-03 — Avoid impossible items

As a learner, I want the system to avoid testing me on items that are too difficult for my current level, so that I do not become frustrated.

### US-04 — Support phrase-level understanding

As a learner, I want the extension to highlight multi-word expressions and typical word sequences, not just isolated words, so that I can learn natural language patterns.

### US-05 — Learn through contextual multiple choice

As a learner, I want to see a small set of translation options when I hover over a highlighted item, so that I can actively test my understanding without leaving the page.

### US-06 — Learn from plausible mistakes

As a learner, I want the wrong answer choices to be realistic and close in meaning, so that selecting among them teaches me useful distinctions.

### US-07 — Resolve known items

As a learner, I want correctly answered items to be marked as resolved after answering correctly once, so that I can see progress and reduce repeated interruptions for already learned content.

### US-08 — Receive explanation after mistakes

As a learner, when I choose the wrong translation, I want the system to explain why it is wrong and why the correct answer is better, so that I learn the distinction instead of merely seeing the answer.

### US-09 — See additional examples

As a learner, I want an option to view more examples of a word or phrase in context, so that I can better understand how it is used naturally.

### US-10 — Preserve flow while reading

As a learner, I want the interaction to be lightweight and non-intrusive, so that I can keep reading while still learning.

---

## Active Mode: Producing Foreign Language from Native Language

### US-11 — Practice active recall during browsing

As a learner reading a page in my native language, I want selected native-language words and phrases to trigger foreign-language translation challenges, so that I can practice production and recall.

### US-12 — Focus on useful production targets

As a learner, I want the system to choose native-language prompts that correspond to useful and learnable foreign-language expressions, so that I practice language I am likely to encounter and use.

### US-13 — Learn natural phrasing, not literal translation

As a learner, I want feedback when my answer reflects a literal but unnatural translation, so that I can internalize the more idiomatic foreign-language expression.

### US-14 — Compare close alternatives

As a learner, I want to see why one foreign-language option is more natural, precise, or context-appropriate than another, so that I can improve expressive accuracy.

### US-15 — Reinforce partially known items

As a learner, I want the system to revisit items I frequently confuse, so that weak knowledge becomes stable.

---

## Personalization and Memory

### US-16 — Build a personal learning profile

As a learner, I want the system to remember what I answered correctly, incorrectly, or with hesitation (detected via response time), so that future prompts reflect my actual learning history.

### US-17 — Estimate my current boundary

As a learner, I want the extension to infer what is at the edge of my ability, so that learning opportunities stay appropriately challenging over time.

### US-18 — Track words and phrases separately

As a learner, I want the system to distinguish between knowing a word in isolation and knowing it in a phrase, so that my progress model is more accurate.

### US-19 — Recognize repeated confusion patterns

As a learner, I want the extension to detect the kinds of mistakes I repeatedly make, such as near-synonym confusion or collocation errors, so that feedback becomes more targeted.

### US-20 — Adapt to growth

As a learner, I want the system to gradually stop testing items I have consistently mastered and move to slightly harder material, so that the challenge evolves with me.

---

## Proficiency Calibration

### US-21 — Assess my level from scratch

As a new learner, I want to answer a structured set of questions upfront so that the system can establish an initial competence estimate without relying on browsing history.

### US-22 — Refine an existing profile

As a returning learner, I want the option to run a quick calibration that builds on my existing profile rather than starting over, so that I can update my level without redundant questions.

### US-23 — Complete a round of 10 questions

As a learner, I want each calibration session to consist of exactly 10 questions, so that the assessment is quick and does not feel like a lengthy test.

### US-24 — See provisional results after each round

As a learner, I want the system to show me a level estimate after every 10 questions, so that I can see how my performance informs the assessment.

### US-25 — Choose to continue or stop

As a learner, I want to be asked whether I want to answer another round of 10 questions after seeing my provisional results, so that I control how long the calibration takes.

### US-26 — Experience mixed question types

As a learner, I want the calibration to include both passive recognition and active recall questions, so that the resulting profile reflects both comprehension and production ability.

### US-27 — Answer questions at varied difficulty bands

As a learner, I want the calibration to include items spanning easy, moderate, and challenging difficulty, so that the system can precisely locate my competence boundary.

### US-28 — Resume calibration later

As a learner, I want the option to pause and resume a calibration session, so that I can complete it across multiple sittings if needed.

## Explanation and Pedagogical Support

### US-29 — Explain nuance

As a learner, I want explanations to include subtle differences in meaning, register, or usage, so that I develop deeper lexical understanding.

### US-30 — Explain idioms and non-literal meaning

As a learner, I want the system to explain idiomatic expressions beyond literal translation, so that I can understand authentic language use.

### US-31 — Explain collocations

As a learner, I want to be told when a translation is grammatically possible but not the usual word combination, so that I learn natural phrase patterns.

### US-32 — Link feedback to context

As a learner, I want explanations to refer to the sentence context on the page, so that I understand why the correct answer fits this specific usage.

### US-33 — Request deeper help

As a learner, I want to optionally expand explanations and examples, so that I can choose between fast interaction and deeper study.

---

## Experience and Product Behavior

### US-34 — Work on arbitrary webpages

As a learner, I want the extension to work across ordinary websites, so that language learning is embedded into my normal browsing habits.

### US-35 — Keep the interface minimal

As a learner, I want visual cues to be clear but unobtrusive, so that the page remains readable.

### US-36 — Control intensity

As a learner, I want to control how many items are highlighted on a page, so that the learning density matches my focus and available time.

### US-37 — Switch between passive and active modes

As a learner, I want to switch between recognition-oriented and production-oriented practice, so that I can train both comprehension and recall.

### US-38 — Feel progress over time

As a learner, I want to see that fewer easy items are highlighted and more relevant edge items are selected over time, so that the system feels personalized and effective.

### US-39 — Handle dynamic page content

As a learner, I want the extension to work on single-page applications that dynamically load content, so that I can learn while using modern web apps.

### US-40 — Handle embedded content

As a learner, I want the extension to optionally process content within iframes (such as embedded articles or comments), so that learning opportunities are not limited to main page content.

### US-41 — Configure visual cue style

As a learner, I want to choose how learnable items are visually indicated (underline, background tint, corner dot, or cursor change), so that the highlighting matches my reading preferences.

### US-42 — Adjust cue visibility

As a learner, I want to control how prominent the visual cues are, so that I can balance visibility against distraction.

### US-43 — Work offline gracefully

As a learner, I want the extension to detect when I am offline and show a clear status, so that I understand why highlighting is disabled and know when to resume learning.

---

## Configuration and Settings

### US-44 — Set native and target languages

As a new user, I want to specify my native language and the foreign language I want to learn, so that the extension knows which language pair to work with.

### US-45 — Configure API keys

As a user, I want to enter API keys for one or more AI providers (OpenAI, Anthropic, Gemini, Groq), so that the extension can make LLM requests.

### US-46 — Select models for different tasks

As a user, I want to choose which models to use for different operations (fast models for classification, smart models for explanations), so that I can balance speed, cost, and quality.

### US-47 — Control highlighting intensity

As a learner, I want to adjust how many items are highlighted on each page via a slider, so that the learning density matches my available time and focus.

### US-48 — Export or clear my data

As a privacy-conscious user, I want to export my learning data or clear it entirely, so that I have control over my personal information.

### US-49 — Use toolbar popup for quick actions

As a user, I want to click the extension icon in the toolbar to see status, toggle on/off, switch modes, and quickly manage the current site, so that I don't need to open the full options page for common actions.

### US-50 — See toolbar indicator when not configured

As a new user, I want the toolbar icon to show a clear visual indicator when API keys are missing, so that I know the extension needs configuration before use.

### US-51 — Blacklist sites I don't want

As a user, I want to blacklist specific websites so that the extension ignores them, so that learning opportunities only appear where I want them.

### US-52 — Whitelist only specific sites

As a user, I want to switch to whitelist mode so the extension only works on sites I explicitly allow, giving me precise control over where learning happens.

### US-53 — Quickly add/remove site from list

As a user, I want to add or remove the current site from my blacklist or whitelist with one click from the toolbar popup, so that I can manage site lists without opening options.

### US-54 — Run calibration wizard on first use

As a new user, I want the calibration wizard to launch automatically after configuration, so that the extension starts with a personalized level estimate.

---

## AI and System User Stories

### US-56 — Route across providers transparently

As a product developer, I want AI requests to be routed through ModelMesh, so that the extension is not tightly coupled to a single provider.

### US-57 — Fall back automatically

As a user, I want the extension to keep working even if one AI provider is slow or unavailable, so that the experience remains smooth.

### US-58 — Optimize cost by task type

As a product owner, I want different pedagogical subtasks to be sent to different models depending on complexity, so that quality is preserved while controlling cost.

### US-59 — Compare model quality

As a product developer, I want to compare outputs from different providers for tasks like distractor generation and explanation quality, so that the system can improve over time.

### US-60 — Handle quotas gracefully

As a user, I want the extension to continue functioning when one provider hits rate or quota limits, so that my learning session is not interrupted.

### US-61 — All decisions driven by LLM

As a system architect, I want all pedagogical reasoning (item selection, distractor generation, explanation, level estimation) to be handled by the LLM layer through appropriate prompting, so that the extension focuses on presentation and interaction while intelligence resides in the AI backend.

---

## Product Vision

EdgeLang aims to become an intelligent reading companion that turns the open web into a personalized environment for foreign-language growth. Its long-term value lies not in replacing reading with exercises, but in **embedding exercises inside meaningful reading**.

By combining:

- authentic web content,
- adaptive lexical targeting,
- phrase-aware instruction,
- explanation-rich feedback,
- persistent learner modeling,
- and ModelMesh-based multi-provider AI routing,

the extension supports a more natural path to vocabulary depth, idiomatic competence, and fluent recognition of common word sequences.

The project’s broader vision is to make language learning less dependent on isolated study sessions and more integrated into the flow of daily life online, while remaining technically robust under changing AI-provider conditions.

---

## Summary

EdgeLang is an AI-powered Chrome extension (Manifest V3) for contextual language learning that identifies words, idiomatic expressions, and typical word sequences near the learner's competence boundary and turns them into lightweight, interactive learning opportunities directly on the page.

Its key innovation is not merely translation assistance, but **adaptive edge-of-ability targeting**: selecting the right lexical challenges at the right time, explaining errors meaningfully, and using browsing history and user performance to keep the learner in a productive zone between boredom and overload.

A central architectural enabler is the integration of **ModelMesh** as the AI provider-routing layer, allowing the product to remain resilient, cost-aware, and flexible as it orchestrates multiple AI backends (OpenAI, Anthropic, Gemini, Groq) behind a unified OpenAI-compatible interface. All pedagogical intelligence resides in the LLM layer with appropriate prompting.
