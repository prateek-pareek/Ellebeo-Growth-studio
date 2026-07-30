const fs = require('fs');

const layouts = {
  "single_hero": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "single_hero",
    "base": "universal_dynamic_base",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 0 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 70 }
    ]
  },
  "carousel_hero": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "carousel_hero",
    "base": "split_before_after",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 5, "anchor": "middle_right" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 40 }
    ]
  },
  "wax_seal_emblem": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "wax_seal_emblem",
    "base": "universal_dynamic_base",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 0 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_center", "offsetPercent": 15, "role": "tagline", "alignment": "center", "maxWidthPercent": 80 },
      { "id": "deco", "type": "decoration", "zIndex": 40, "component": "wax_seal", "anchor": "top_center", "offsetPercent": 10 }
    ]
  },
  "die_cut_reveal": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "die_cut_reveal",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "arch", "paddingPercent": 15, "anchor": "top_center", "offsetPercent": 5 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_center", "offsetPercent": 10, "role": "body", "alignment": "center", "maxWidthPercent": 80 }
    ]
  },
  "sunlit_negative_field": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "sunlit_negative_field",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 25, "anchor": "middle_right", "offsetPercent": 5 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 35 }
    ]
  },
  "desktop_course_hero": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "desktop_course_hero",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 5, "anchor": "middle_right", "offsetPercent": 5, "component": "desktop_monitor_mockup" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 8, "role": "body", "alignment": "left", "maxWidthPercent": 38 }
    ]
  },
  "course_learnings_split": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "course_learnings_split",
    "base": "split_before_after",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 0, "anchor": "middle_right" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 40 }
    ]
  },
  "banner_card_editorial": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "banner_card_editorial",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 10, "anchor": "top_center", "offsetPercent": 5 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_center", "offsetPercent": 10, "role": "body", "alignment": "center", "maxWidthPercent": 80 }
    ]
  },
  "tablet_workbook_cover": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "tablet_workbook_cover",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 10, "anchor": "middle_right", "offsetPercent": 5, "component": "tablet_device_mockup" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 35 }
    ]
  },
  "unboxing_manifest": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "unboxing_manifest",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 20, "anchor": "middle_center" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 80 }
    ]
  },
  "typographic_module_system": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "typographic_module_system",
    "base": "solid_canvas_full",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 40, "anchor": "bottom_right", "offsetPercent": 5 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "top_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 80 }
    ]
  },
  "look_number_plate": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "look_number_plate",
    "base": "universal_dynamic_base",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 0 },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "bottom_left", "offsetPercent": 10, "role": "body", "alignment": "left", "maxWidthPercent": 50 },
      { "id": "deco", "type": "decoration", "zIndex": 40, "component": "number_plate", "anchor": "top_left", "offsetPercent": 5 }
    ]
  },
  "skin_layers": {
    "schemaVersion": "1.0",
    "layoutVersion": "1.0",
    "id": "skin_layers",
    "base": "split_before_after",
    "layers": [
      { "id": "img", "type": "image", "zIndex": 10, "mask": "rectangle", "paddingPercent": 0, "anchor": "middle_right" },
      { "id": "txt", "type": "text", "zIndex": 30, "anchor": "middle_left", "offsetPercent": 15, "role": "body", "alignment": "left", "maxWidthPercent": 35 }
    ]
  }
};

fs.writeFileSync('./src/ai/config/compiled-layouts.v1.json', JSON.stringify(layouts, null, 2));
console.log("Successfully generated the 13 premium templates in compiled-layouts.v1.json");
