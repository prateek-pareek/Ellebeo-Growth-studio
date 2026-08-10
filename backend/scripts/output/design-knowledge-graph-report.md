# Design Knowledge Graph Report

This report was procedurally generated locally (no AI calls) by aggregating the GPT-4o-mini vision extraction already run on 2040 unique purchased Instagram/PPT template designs.

Layout family, visual style, typography-system, reading-flow and negative-space labels are derived by rule-based classification over the extracted `concept` / `visual_structure` / `typography` / `elements[].bbox` fields — reading-flow and negative-space are computed directly from real extracted bounding-box geometry, not re-guessed.

## 1. Procedural Layout Families
These are the dominant layout architectures discovered across the dataset. The future compiler will only need to know how to build these specific families.

### 
countdown_promo: 17.1% (348)
product_showcase: 12.9% (264)
split: 12.8% (262)
text_only: 12.8% (261)
clinical_hero: 11.2% (228)
minimalist_quote: 9.1% (186)
before_after: 7.7% (157)
editorial: 7.1% (145)
testimonial: 2.9% (59)
quadrant: 2.2% (45)
transformation: 2.0% (40)
scrapbook: 0.9% (19)
announcement: 0.7% (15)
polaroid: 0.5% (10)
notification_card: 0.0% (1)

## 2. Visual Style Systems
The overarching stylistic themes that dictate the mood of the templates.

### 
organic: 28.8% (588)
minimal: 26.3% (536)
minimalist: 25.1% (513)
modern: 19.6% (399)
editorial: 0.1% (3)
clinical: 0.0% (1)

## 3. Composition & Psychology

### Reading Flow Strategies
How the layout's text elements are arranged for the eye to move across the canvas (computed from actual element x/y positions).

### 
center-down: 62.2% (1269)
circular: 10.6% (217)
undetermined: 10.1% (207)
center-outward: 8.3% (169)
diagonal: 4.8% (97)
asymmetric: 2.2% (45)
z-pattern: 1.8% (36)

### Negative Space Allocation
How much of the canvas is covered by elements vs. left open (computed from actual bounding-box area coverage).

### 
tight: 72.9% (1488)
moderate: 17.2% (350)
large: 9.9% (202)

## 4. Typography Systems
The dominant font pairing choices for headlines, parsed from the extracted `typography` description.

### 
bold_sans: 73.3% (1495)
mixed: 11.5% (234)
script: 6.0% (122)
italic_sans: 5.4% (110)
modern_sans: 3.1% (64)
fashion_serif: 0.5% (10)
serif: 0.2% (5)

## 5. Decoration Components
The most common geometric/decorative primitives mentioned in the extracted `decorative_elements` field (multi-label — a template can contribute more than one tag; percentages are of total tag occurrences, not template count).

### 
textured_background: 17.8% (471)
frame_border: 16.4% (435)
shadow: 13.0% (344)
divider: 7.8% (208)
geometric_badge: 6.4% (170)
illustration: 5.8% (154)
rounded_corners: 5.0% (133)
gradient: 4.7% (124)
outline: 3.9% (104)
circle: 3.8% (101)
arrow: 2.5% (65)
star_rating: 2.1% (56)
striped_background: 1.9% (50)
polaroid: 1.4% (37)
floral: 1.2% (31)
heart: 1.1% (30)
underline: 0.8% (22)
color_block: 0.7% (18)
speech_bubble: 0.6% (17)
dotted_border: 0.6% (15)
film_strip: 0.5% (13)
quotation_marks: 0.5% (12)
ribbon: 0.3% (7)
numbered_list: 0.2% (6)
collage: 0.2% (6)
perforation: 0.2% (5)
paper_clip: 0.2% (4)
paper_tape: 0.1% (3)
grid_lines: 0.1% (3)
arch_frame: 0.1% (3)
gold_accents: 0.1% (2)
doodle: 0.0% (1)
seal: 0.0% (1)
pushpin: 0.0% (1)
camera: 0.0% (1)

---
**TIP — What this means for development:** We do not need to build a rigid compiler that tries to handle infinite edge cases. Based on this dataset, the top layout families are: **countdown_promo, product_showcase, split, text_only, clinical_hero**. A deterministic compiler targeting just these, applying the dominant reading-flow (center-down) and negative-space (tight) rules, would cover the large majority of this template library.

*Caveats:*
*- These labels come from a local rule-based classifier over AI-extracted text/geometry, not a second AI pass — treat family boundaries as approximate, not ground truth.*
*- Negative-space skews toward "tight" here (vs. typically-spacious professional templates) likely because the vision model's bounding boxes tend to run larger than the element's actual visible extent — treat the tight/moderate/large split as directionally useful, not a precise area measurement.*
