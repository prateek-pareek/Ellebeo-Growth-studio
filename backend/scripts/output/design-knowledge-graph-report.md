# Design Knowledge Graph Report

This report was procedurally generated locally (no AI calls) by aggregating the GPT-4o-mini vision extraction already run on 1000 unique purchased Instagram/PPT template designs.

Layout family, visual style, typography-system, reading-flow and negative-space labels are derived by rule-based classification over the extracted `concept` / `visual_structure` / `typography` / `elements[].bbox` fields — reading-flow and negative-space are computed directly from real extracted bounding-box geometry, not re-guessed.

## 1. Procedural Layout Families
These are the dominant layout architectures discovered across the dataset. The future compiler will only need to know how to build these specific families.

### 
split: 20.6% (206)
text_only: 18.5% (185)
countdown_promo: 13.5% (135)
clinical_hero: 13.2% (132)
product_showcase: 11.6% (116)
editorial: 7.0% (70)
minimalist_quote: 5.2% (52)
before_after: 4.5% (45)
testimonial: 2.4% (24)
transformation: 1.6% (16)
announcement: 1.0% (10)
scrapbook: 0.5% (5)
quadrant: 0.3% (3)
polaroid: 0.1% (1)

## 2. Visual Style Systems
The overarching stylistic themes that dictate the mood of the templates.

### 
minimalist: 30.2% (302)
modern: 26.4% (264)
minimal: 25.8% (258)
organic: 17.4% (174)
editorial: 0.1% (1)
clinical: 0.1% (1)

## 3. Composition & Psychology

### Reading Flow Strategies
How the layout's text elements are arranged for the eye to move across the canvas (computed from actual element x/y positions).

### 
center-down: 62.0% (620)
undetermined: 20.0% (200)
circular: 7.3% (73)
center-outward: 5.7% (57)
diagonal: 2.6% (26)
asymmetric: 1.3% (13)
z-pattern: 1.1% (11)

### Negative Space Allocation
How much of the canvas is covered by elements vs. left open (computed from actual bounding-box area coverage).

### 
tight: 78.0% (780)
moderate: 11.3% (113)
large: 10.7% (107)

## 4. Typography Systems
The dominant font pairing choices for headlines, parsed from the extracted `typography` description.

### 
bold_sans: 71.2% (712)
mixed: 21.3% (213)
script: 4.2% (42)
modern_sans: 1.6% (16)
italic_sans: 0.6% (6)
fashion_serif: 0.6% (6)
serif: 0.5% (5)

## 5. Decoration Components
The most common geometric/decorative primitives mentioned in the extracted `decorative_elements` field (multi-label — a template can contribute more than one tag; percentages are of total tag occurrences, not template count).

### 
textured_background: 24.5% (307)
shadow: 16.8% (211)
frame_border: 11.3% (142)
gradient: 7.6% (95)
illustration: 7.5% (94)
divider: 7.2% (90)
geometric_badge: 4.5% (57)
circle: 4.4% (55)
rounded_corners: 3.5% (44)
arrow: 2.3% (29)
star_rating: 1.8% (23)
outline: 1.4% (17)
floral: 1.3% (16)
heart: 1.0% (12)
polaroid: 0.7% (9)
speech_bubble: 0.7% (9)
ribbon: 0.6% (7)
dotted_border: 0.5% (6)
paper_clip: 0.3% (4)
color_block: 0.3% (4)
striped_background: 0.3% (4)
paper_tape: 0.2% (3)
numbered_list: 0.2% (3)
quotation_marks: 0.2% (3)
underline: 0.2% (2)
doodle: 0.1% (1)
seal: 0.1% (1)
pushpin: 0.1% (1)
camera: 0.1% (1)
grid_lines: 0.1% (1)
gold_accents: 0.1% (1)
arch_frame: 0.1% (1)

---
**TIP — What this means for development:** We do not need to build a rigid compiler that tries to handle infinite edge cases. Based on this dataset, the top layout families are: **split, text_only, countdown_promo, clinical_hero, product_showcase**. A deterministic compiler targeting just these, applying the dominant reading-flow (center-down) and negative-space (tight) rules, would cover the large majority of this template library.

*Caveats:*
*- These labels come from a local rule-based classifier over AI-extracted text/geometry, not a second AI pass — treat family boundaries as approximate, not ground truth.*
*- Negative-space skews toward "tight" here (vs. typically-spacious professional templates) likely because the vision model's bounding boxes tend to run larger than the element's actual visible extent — treat the tight/moderate/large split as directionally useful, not a precise area measurement.*
