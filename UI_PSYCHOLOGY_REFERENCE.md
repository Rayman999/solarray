# Solarray UI Psychology Reference

This file is the behavioral-design companion to `DESIGN.md`. Use both together before changing Solarray's home page, reminders, habits, notifications, or mobile flows.

The purpose is healthy daily engagement: helping users capture, remember, and complete life tasks with less mental load. Do not use these principles to pressure, shame, trap, or manipulate users.

## Source Summary

- BJ Fogg's Behavior Model states that behavior happens when motivation, ability, and a prompt converge at the same moment. For Solarray, the most reliable lever is ability: make the action easier instead of trying to increase motivation. Sources: [Fogg Behavior Model](https://www.behaviormodel.org/home), [Tiny Habits](https://www.bjfogg.com/tiny-habits).
- Tiny Habits recommends shrinking behaviors to their smallest useful version. For Solarray, "capture one thing" is better than "fill out a complete task form."
- Microinteractions should provide narrow, immediate feedback after an action. They should confirm "the app heard me" without stealing attention. Source: [NN/g UX metrics flashcards](https://media.nngroup.com/media/articles/attachments/UX_Metrics_Flashcards_-_NNG_-_Print-Ready.pdf) and interaction-design literature.
- Mobile one-handed use needs reachable controls, large-enough touch targets, and fewer top-corner dependencies. Research on one-handed thumb input shows target size and location affect success rate. Source: [One-handed thumb interaction of mobile devices](https://www.sciencedirect.com/science/article/pii/S0169814110000806), [thumb posture research](https://www.sciencedirect.com/science/article/pii/S002192901200406X).
- Small progress matters. Amabile and Kramer describe progress on meaningful work as a powerful driver of motivation; even small wins can improve motivation and emotional momentum. Source: [Harvard Business School: The Power of Small Wins](https://www.hbs.edu/faculty/Pages/item.aspx?num=40244).
- The endowed progress effect shows that people persist more when they feel they already have momentum toward a goal. Source: [Nunes and Dreze, The Endowed Progress Effect](https://www.xdreze.org/Publications/PSC.pdf).
- The Zeigarnik Effect describes how unfinished tasks can remain cognitively active. Use this ethically by helping users externalize open loops into the app, then making one next action clear. Sources: [Psychology Today: Zeigarnik Effect](https://www.psychologytoday.com/us/basics/zeigarnik-effect), [Nature meta-analysis](https://www.nature.com/articles/s41599-025-05000-w).
- Variable rewards can build interest, but they are risky. Use them only as gentle delight after useful actions, never as gambling-like uncertainty or endless checking. Source: [Nir Eyal Hooked workbook](https://www.nirandfar.com/download/hooked-workbook.pdf).
- Loss aversion is powerful but easy to misuse. Use it only as streak protection, recovery, or reassurance, not as guilt. Source: [Prospect theory overview](https://en.wikipedia.org/wiki/Prospect_theory).

## Core Design Principles for Solarray

### 1. Friction Reduction Comes First

Every interaction should ask: "Can this be done with fewer taps, less reading, or less thinking?"

Implementation rules:
- Put the most common action in the thumb zone.
- Prefer one input plus one action button over a full form.
- Hide optional fields until needed.
- Avoid asking the user to classify an item before capture.
- Let defaults do the work: default type `Task`, default time one hour ahead, default radius.

Home-page implication:
- The home page should start with quick capture, not a dashboard of options.
- Details should be progressive disclosure, not a permanent form.

### 2. Tiny Habits: Shrink the Action

The smallest useful behavior in Solarray is:

1. Type one thing.
2. Tap plus.
3. See it appear as the next or later item.

Everything else is optional enhancement. Time, place, notes, habit type, and radius should never block capture.

### 3. Prompt at the Moment of Intent

Prompts work best when paired with context. Solarray prompts should be:
- Visible when the user opens the app.
- Clear enough to answer without thinking.
- Calm, not nagging.

Good prompt:
- "Type it, tap plus, move on"

Poor prompt:
- "Configure a new reminder"

### 4. Cognitive Load Reduction

The user should not have to build a mental map of the page. Use a simple visual hierarchy:

1. Start here: quick capture.
2. Next up: one item that matters now.
3. Later: a short secondary list.
4. Signals: location, notifications, progress.

Rules:
- Do not show more than one primary card at a time.
- Do not show stats as equal competitors to the main action.
- Keep labels short and concrete.
- Prefer recognition over recall: icon + short label beats long explanatory text.

### 5. Zeigarnik Effect: Externalize Open Loops

Unfinished tasks can create mental tension. The app should relieve that tension by turning thoughts into visible reminders.

Use:
- Quick capture as a mental offload.
- "Next up" as the single open loop to focus on.
- "Later" as a quiet holding area.

Avoid:
- Showing a huge backlog immediately.
- Making the user feel behind.

### 6. Progress Visibility and Micro-Wins

Progress should be small, visible, and kind.

Use:
- Completion percentage as a quiet signal, not a scoreboard.
- Check buttons that respond immediately.
- A future streak or routine indicator only when it can be framed positively.

Avoid:
- Red failure states for normal incompletion.
- "You missed X" copy.
- Competitive or shame-based progress.

### 7. Endowed Progress

Give users a sense that they are already moving.

Use:
- Default ready state: a task can be captured immediately.
- Pre-filled sensible defaults.
- Later, when routines exist, show "1 step started" only when it is true or clearly earned.

Avoid:
- Fake progress.
- Inflated completion percentages.

### 8. Variable Rewards, Used Ethically

Variable reward should be a small moment of delight after completion, not a reason to compulsively check the app.

Good:
- A subtly different completion phrase or glow.
- Occasionally surfacing a positive reflection like "Clear skies."

Bad:
- Random badges that create compulsion.
- Hidden rewards that encourage repeated opening.

### 9. Loss Aversion, Used as Protection

Loss aversion should protect the user's wellbeing.

Good:
- "Keep your streak safe by doing one tiny version."
- "Paused today" instead of "failed."

Bad:
- "You lost your streak."
- Red warning badges for ordinary life.

### 10. Identity-Based Motivation

Help the user see themselves as someone who calmly handles life.

Copy direction:
- "Future you"
- "Next up"
- "Clear skies"
- "One thing"

Avoid:
- Productivity hustle language.
- Guilt, urgency, or pressure.

### 11. Color Psychology in This Design System

`DESIGN.md` defines the palette. Stay inside it:

- `--bg` creates calm and depth.
- `--surface` and `--line` reduce visual noise.
- `--ink` is for important readable content.
- `--muted` is for supporting text.
- `--accent` is the one motivational signal: primary action, focus, success, reward.
- `--rose` and `--green` are semantic only.

Rule:
- If everything is accented, nothing is guiding the user.

### 12. Microinteractions

Microinteractions should answer one of three questions:

1. Did the app hear me?
2. What changed?
3. What should I do next?

Use:
- Tap press on buttons.
- Subtle focus glow on input.
- Short panel reveal for optional details.
- Calm check feedback.

Avoid:
- Long animations that delay action.
- Constant moving UI around primary text.
- Desktop magnetic effects on home actions.

### 13. Mobile-First Thumb-Zone Rules

Primary actions should be easy to reach one-handed.

Rules:
- Keep quick capture and add button near the upper-middle to middle area, not hidden in top corners.
- Avoid critical controls only in the top-right.
- Touch targets should feel comfortably tappable.
- Dense destructive controls must be small but not primary.
- On mobile, hover effects should not be relied upon.

### 14. Solarray Home Page Checklist

Before shipping a home-page change, verify:

- Can the user capture a task in one thought and one tap?
- Is there only one obvious starting point?
- Is the next item obvious without reading the whole screen?
- Are optional details hidden until requested?
- Are stats quieter than actions?
- Are controls reachable and not cramped?
- Does completion produce immediate feedback?
- Are all animations subtle and calm?
- Are colors, typography, spacing, and surfaces still aligned with `DESIGN.md`?
- Does the UI encourage healthy return, not anxious checking?

## Practical Audit Pattern

For every component, ask:

1. What behavior do we want?
2. What is the smallest possible version of that behavior?
3. What prompt makes it obvious?
4. What feedback confirms success?
5. Can we remove a decision, label, field, or card?
6. Is this ethical and wellbeing-centered?

If the answer is unclear, simplify.

## Applied Home Page Audit - Current Implementation

This audit reflects the home page in `src/app/pages/dashboard`.

### Opportunity 1: Too many equal-weight choices

Principle: cognitive load reduction.

Finding: Earlier versions presented capture, type selection, details, stats, today list, nearby status, and routines at similar visual weight. The user had to scan and decide where to start.

Implementation:
- `dashboard.html` starts with one `home-card`.
- The first marker says `Start here`.
- Type, time, notes, and place are hidden behind `Time, place, or type`.
- `dashboard.css` comments mark the capture zone as the primary attention path.

### Opportunity 2: Capture required too much intent

Principle: friction reduction and Tiny Habits.

Finding: A full form asks the user to classify and configure a thought before saving it. This is too much effort for mobile use on the go.

Implementation:
- The primary path is one input plus one plus button.
- The input uses `enterkeyhint="done"` so mobile keyboards reinforce the quick-complete intent.
- Defaults handle type, time, and radius until the user chooses otherwise.

### Opportunity 3: Backlog could create overwhelm

Principle: Zeigarnik Effect, used ethically.

Finding: Showing too many unfinished tasks can increase mental load. The app should externalize open loops, not throw them back at the user.

Implementation:
- `nextReminder` surfaces one dominant open loop.
- `laterReminders` caps the secondary queue.
- The `Next up` section uses `aria-live="polite"` so changes are announced without interrupting.

### Opportunity 4: System status competed with action

Principle: recognition over recall.

Finding: Location, notification, and completion status are useful, but not important enough to compete with capture and next action.

Implementation:
- Status is compressed into `signal-card`.
- Each signal uses icon + short label.
- The completion percentage is quiet and non-judgmental.

### Opportunity 5: The page felt physically too large on mobile

Principle: thumb-zone comfort and one-handed use.

Finding: The first simplified version had the right hierarchy, but oversized controls and spacing made it feel heavy.

Implementation:
- `dashboard.css` reduces card padding, gaps, button size, card radius, and shadow weight.
- The primary add button remains large enough to tap comfortably, but no longer dominates the screen.

### Opportunity 6: Home interactions should not reuse auth magnetism

Principle: interaction language separation.

Finding: Magnetic attraction is memorable and expressive, but daily-use home controls should feel quieter and more utilitarian.

Implementation:
- Home buttons do not use `appMagnetic`.
- Home controls use tap press, hover lift, focus glow, and subtle border/background changes only.
