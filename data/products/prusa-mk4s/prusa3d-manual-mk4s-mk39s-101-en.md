---
type: Reference
title: Prusa3d Manual Mk4s Mk39s 101 En
description: 66 sections
timestamp: 2026-07-06T16:18:17.880Z
source: pdfs/prusa3d_manual_mk4s_mk39s_101_en.pdf
---

## Page 1

![Page 1](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/1.png)

# PAGE TRANSCRIPTION

## Logo/Brand Area (top-left)
"PRUSA RESEARCH" (stacked wordmark, "PRUSA" in white bold on black background, "RESEARCH" in black bold on white background)
Below logo: "by JOSEF PRUSA"

## Top-right corner markings
- UK flag icon (Union Jack)
- "ENG" (large text next to flag)
- Vertical text along right margin: "ORIGINAL INSTRUCTIONS"

## Main Photo/Diagram Description
A photograph of an assembled 3D printer (Original Prusa MK4S) shown at an angle, centered on the page. Key visible components:

- **Filament spools (top of unit):** Two spools mounted side-by-side on a spool holder bar at the very top of the printer frame.
  - Left spool: orange/red filament
  - Right spool: black filament
  - Filament strand shown feeding down (orange strand visible) from the left spool toward the extruder/toolhead.

- **Frame:** Black powder-coated metal frame (gantry-style), with "PRUSA" embossed/printed on the top crossbar.

- **Toolhead / Extruder (center of frame):** Black box-shaped print head labeled "ORIGINAL PRUSA MK4S" in white/red text, mounted on a horizontal X-axis gantry with smooth rods.

- **Orange components:** Two bright orange plastic parts flank the toolhead on the left and right sides, mounted on the X-axis rods — these appear to be the X-axis motor/idler mounts or carriage components.

- **Z-axis rods:** Two vertical smooth/threaded rods on left and right sides of the frame, guiding the X-axis gantry up and down.

- **Right frame side sticker/label block:** A small vertical stack of icons/labels on the right upright of the frame, including:
  - A blue EU-flag-style square icon (likely "Made in..." or CE marking area)
  - A yellow icon (partially obscured, likely a warning/certification sticker) with text "MADE IN" visible beneath it
  - A warning triangle icon (⚠) below that
  - Additional small icon below the warning triangle (not legible in image)

- **Heatbed / Print bed (lower-middle of frame):** A flat, light gray/beige textured steel sheet sitting on the bed carriage — this is the removable spring-steel print sheet.

- **Bed carriage (below print sheet):** Black mechanical assembly holding the print sheet, with a black coiled/looped cable visible hanging beside it (likely the heatbed cable or bed-leveling wiring).

- **Front control unit (bottom of printer, foreground):** A black control panel/LCD unit with:
  - A color touchscreen display on the left side showing a home-screen style interface with 4 rounded icon buttons arranged in a 2x2 or row grid (icons not legible in detail but appear as colored square icons — orange, blue/gray tones)
  - "PRUSA MK4S" label printed above/near the screen
  - A joystick/knob control button to the right of the screen (round black dial)
  - A USB port slot visible on the right end of the control unit
  - Blue LED glow visible along the underside/bottom edge of the control unit (light strip effect)

## Title Text (bottom portion of page)
Large bold white heading, two lines:
**"3D PRINTING"**
**"HANDBOOK"**

## Subtitle (below title)
"FOR THE ORIGINAL PRUSA MK4S 3D PRINTER"

## Background
Dark gray gradient background with faint, barely-visible ghosted graphic elements/watermark patterns (abstract circular and geometric shapes) behind the printer photo — decorative only, no readable text or data within them.

---

**Notes for technician use:** This page is a cover/title page only. It contains no numeric specifications, wiring diagrams, tables, amperage/voltage data, or step-by-step instructions. It identifies the manual as the "3D Printing Handbook" for the **Original Prusa MK4S** printer, published by **Prusa Research (by Josef Prusa)**, in the **English (ENG)** language, and marked as **"Original Instructions."** The photo shows the assembled printer's major visible parts (dual filament spool holder, gantry frame, MK4S toolhead, orange carriage components, Z-axis rods, removable steel print sheet, bed carriage, and the front-mounted color touchscreen/control panel with knob and USB port), plus certification/warning stickers on the right upright of the frame, but no legible part numbers or callout labels beyond what is listed above.

## Page 2

![Page 2](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/2.png)

# Original Prusa MK4S: Official Instructions

**Handbook version 1.01 - September 26th, 2024**

## Header/Introductory Text (verbatim)

If you need to download this handbook in other languages, such as **Deutsch, Français, Italiano, Español, Čeština and Polski**, visit https://prusa.io/mk4s or scan the QR code on the right. This link will also take you to a hub containing the latest downloads (firmware, handbook, drivers, PrusaSlicer) and help articles.

In this handbook, you will learn everything you need to set up your printer, use it, perform routine maintenance, and more. Assembly instructions, along with other useful information, can be found at prusa.io/mk4s.

**The handbook primarily references the Original Prusa MK4S, as it is virtually identical to the MK3.9S from the user's perspective. Therefore, the instructions provided are equally applicable to the MK3.9S.**

## Diagram/Image Description: Flags and QR Code

- To the right of the introductory text, there are three small flag icons in a row: Czech flag, French flag, and German flag (representing available translated languages).
- Below the flags is a black-and-white QR code square graphic.
- **Purpose/Question answered:** Scanning this QR code, or visiting the URL https://prusa.io/mk4s, takes the user to a hub for downloading the handbook in other languages (German, French, Italian, Spanish, Czech, Polish), as well as firmware, drivers, PrusaSlicer, and help articles.

---

## Boxed Section: "Quick Guide to the First Print"

This is a bordered box containing a numbered list:

1. Read the Safety Instructions carefully **(page 8).**
2. Place the printer on a flat and stable surface and plug it in. **(page 15)**
3. If you bought the assembled printer, remove the test print from the print sheet (remove the sheet, bend it, remove the print), then place the print sheet back. **(page 17)**
4. Calibrate the printer using the Selftest Wizard. **(page 18)**
5. Insert the USB drive that came with your printer and print your first object. **(page 23)**

---

## Callout/Legend Boxes (Icon Key for Rest of Manual)

These four colored boxes define the meaning of icons/formatting used throughout the rest of the handbook. Each has a distinct icon and color:

### 1. Info Callout (Orange box, black circular icon with white "i")
**Icon:** Black circle with white lowercase "i" (information symbol)
**Color:** Orange background
**Text:** "Tips, advice or important information that will help you when working with the printer."

### 2. Warning Callout (Red box, black circular icon with white "!")
**Icon:** Black circle with white exclamation mark "!"
**Color:** Red background
**Text:** "This part of the text is very important, please read it carefully! It is directly related to the correct operation of the printer and its safe operation."

### 3. Assembly Kit Callout (Green box, black icon resembling a wrench/tool or pencil)
**Icon:** Black square/diamond shape icon (appears to be a stylized tool or pencil icon)
**Color:** Green background
**Text:** "This information applies to the Original Prusa MK4S 3D printer assembly kit."

---

## Boxed Section: "How to contact Prusa Research technical support:"

Bordered box containing:

"First, check the last sections of this manual that deal with common problems, or go to prusa.io/mk4s (you can also scan the QR code at the top of the page) for a complete list of the most common problems and solutions. If your problem is not listed here, or the solution does not work, please send an email to info@prusa3d.com and/or use our chat at prusa3d.com. Try to describe your problem as accurately as possible and include pictures or videos."

**Contact information extracted:**
- Website: prusa.io/mk4s
- Support email: info@prusa3d.com
- Chat: prusa3d.com

---

## Footer/Legal Text (small print, verbatim)

*JOSEF PRUSA®, PRUSA RESEARCH®, PRUSA POLYMERS®, PRUSA ORANGE®, ORIGINAL PRUSA®, PRUSA 3D®, and PRUSAMENT® are registered trademarks of Prusa Development a.s. used by Prusa Research a.s. under license from Prusa Development a.s. ( JOSEF PRUSA, ORIGINAL PRUSA, and PRUSAMENT are registered trademarks (or trademark applications) of Prusa Development a.s. and are used by Prusa Research a.s. under license from Prusa Development a.s. in the following countries: Australia, New Zealand, Israel, Mexico, South Korea, Turkey, Ukraine, Russia, Kazakhstan, Switzerland, China, Colombia, Uzbekistan, Philippines and Norway. ) All other company names and product names mentioned in this publication are trademarks and registered trademarks of their respective companies.*

---

## Page Reference Index (extracted from Quick Guide list above)

| Step | Task | Page Reference |
|------|------|-----------------|
| 1 | Read the Safety Instructions carefully | page 8 |
| 2 | Place the printer on a flat and stable surface and plug it in | page 15 |
| 3 | Remove test print from print sheet (if assembled printer purchased); remove sheet, bend it, remove print, place sheet back | page 17 |
| 4 | Calibrate the printer using the Selftest Wizard | page 18 |
| 5 | Insert the USB drive that came with the printer and print first object | page 23 |

---

**Note:** No tables, wiring diagrams, amperage/voltage specifications, wire-speed values, polarity information, or part numbers appear on this page. This page is the cover/introduction page of the manual, containing only introductory text, a legend for callout icons used throughout the manual, and a quick-start guide with page references to later sections.

## Page 3

![Page 3](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/3.png)

# Page Transcription

## Heading
**About the Author**
(Heading is styled in orange/red bold text, larger font, top of page)

## Body Text (verbatim)

**Paragraph 1:**
Josef Průša (*23. 2. 1990) became interested in 3D printing when he began studying at the University of Economics in 2009 - it started off as a hobby, a new technology open to modifications and improvements. The hobby quickly became his passion, and Josef became one of the main developers of the international open-source (all works are freely available for any use) RepRap project by Adrian Bowyer. Today, Prusa's design in various versions can be seen all over the world; it is one of the most used printer designs. The goal is to increase public awareness of 3D printing technology.

**Paragraph 2:**
All of Josef Průša's 3D printers are open-source. In the spirit of the RepRap project, you can use your printer to produce parts for other 3D printers. The Original Prusa product range is constantly being expanded with new models and improvements.

**Paragraph 3:**
His main goal is to make 3D printing technology more understandable and easier for ordinary users. Josef Průša also holds workshops for the public, participates in professional conferences, and promotes 3D printing. He has lectured at TEDx conferences in Prague and Vienna, at the World Maker Faire in New York, at the Maker Faire in Rome, and at the Open Hardware Summit at MIT. He has also taught the Arduino course at Charles University and was a lecturer at the Academy of Arts, Architecture and Design in Prague.

**Paragraph 4:**
In his own words, he envisions a not-so-distant future where 3D printers will be available in every household. If anything is needed, you can easily print it out. The boundaries in this field are being pushed every day… We are glad you are part of it!

## Photograph Description

The image below the text shows a color photograph of a man (identified as Josef Průša) standing in the center of an aisle inside what appears to be a large-scale 3D printer production/printing facility (a "print farm").

**Details of the photo:**
- **Subject:** A man with glasses, short brown hair, and a full beard, wearing a black crew-neck t-shirt. He is standing with his arms crossed, smiling at the camera. He has a visible tattoo on his right forearm (appears to be a geometric/diamond-shaped illustrated design).
- **Setting:** The man stands in a long corridor/aisle flanked on both sides by multiple rows of enclosed 3D printers stacked in shelving units. The printers appear to be housed in orange and black enclosures, consistent with Original Prusa branded 3D printers (orange and black color scheme matches Prusa Research branding).
- **Environment:** The ceiling shows exposed wiring/cabling running along the tops of the printer enclosures. The lighting appears industrial/warehouse style. Numerous printers are visible in soft focus down both sides of the aisle, suggesting a large-scale automated print farm with dozens or more printers in operation.
- **Purpose of image:** Serves as a biographical/promotional photo of the author (Josef Průša) within his own printer manufacturing facility, reinforcing his role as founder/developer of the Original Prusa 3D printer line.

## Notes
- No tables, schematics, wiring diagrams, control panels, or numeric technical specifications (amperage, voltage, wire-speed, polarity, part numbers) appear on this page.
- This page is a biographical "About the Author" section, not a technical/operational instruction page.

## Page 4

![Page 4](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/4.png)

# Table of contents

**1. Introduction** ................................................................................................................. 10

**2. Unpacking and Package Contents** ......................................................................... 11
- 2.1. How to Move the Printer ................................................................................. 11
- 2.2. Contents of the Package and Accessories .................................................. 12

**3. Original Prusa MK4S Overview and Glossary** ..................................................... 13
- 3.1. Connecting and Disconnecting the Power Cable ......................................... 15
- 3.2. Error Screens ..................................................................................................... 15

**4. Your First Print** .......................................................................................................... 16
- 4.1. Basic controls .................................................................................................... 16
- 4.2. Preparing Flexible Print Sheets ...................................................................... 17
- 4.3. Selftest (Calibration Wizard) ........................................................................... 18
- 4.4. Running the Selftest ......................................................................................... 19
- 4.5. Inserting (Loading) filament ............................................................................ 20
- 4.6. Unloading (Removing) Filament ..................................................................... 22
- 4.7. Starting the First Print ..................................................................................... 23
- 4.8. Removing a Printed Object from the Print Sheet .......................................... 25
- 4.9. Selftest Troubleshooting .................................................................................. 26
- 4.10. First Print Troubleshooting ............................................................................ 26
  - 4.10.1. LoadCell calibration fails ......................................................................... 26
  - 4.10.2. First layer peeling off from the bed ......................................................... 26
  - 4.10.3. Nozzle moves too high/low, or extrudes plastic outside the print area ... 27
  - 4.10.4. The nozzle does not start extruding, even after multiple attempts ....... 27
  - 4.10.5. After a few hours of printing, the nozzle stops extruding filament ......... 28
- 4.11. Updating the Firmware .................................................................................. 29
- 4.12. Sample Models ............................................................................................... 30
- 4.13. Factory Reset ................................................................................................. 30

**5. Advanced User Guide** .............................................................................................. 31
- 5.1. Prusa Academy Courses .................................................................................. 31
- 5.2. Network Connection .......................................................................................... 32
- 5.3. Touch Control ..................................................................................................... 34
- 5.4. Cancel Object ...................................................................................................... 34
- 5.5. Stealth Mode ........................................................................................................ 34
- 5.6. Input Shaper and Pressure Advance .............................................................. 34
- 5.7. Using Nozzles with Various Diameters .......................................................... 35
- 5.8. Multi-Material Upgrade 3 .................................................................................. 36
- 5.9. Original Prusa Enclosure .................................................................................. 36
- 5.10. Flashing an Unofficial (Unsigned) Firmware: ............................................... 37

**6. Printing Your Own Models** ....................................................................................... 38
- 6.1. Obtaining Printable Models .............................................................................. 39
- 6.2. Create Your Own Model .................................................................................... 40
- 6.3. What is a G-code File? ....................................................................................... 40
- 6.4. PrusaSlicer .......................................................................................................... 41
- 6.5. PrusaSlicer Interface Explained ....................................................................... 42
  - 6.5.1. Initial Setup and General Workflow ......................................................... 43
  - 6.5.2. Using Supports ........................................................................................... 44
  - 6.5.3. Speed vs Print Quality .............................................................................. 45
  - 6.5.4. Infill .............................................................................................................. 46
  - 6.5.5. Brim ............................................................................................................. 46
  - 6.5.6. Printing Objects Larger than the Print Volume ....................................... 47

---
**Page description:** This page is a table of contents (no diagrams, tables, schematics, or control panel images) for what appears to be the Original Prusa MK4S 3D printer manual. It lists chapter and section titles alongside corresponding page numbers, connected by dotted leader lines. The content spans introductory material, unpacking instructions, printer overview, first print walkthrough, troubleshooting sections, advanced user guide topics (network connection, touch control, input shaper, multi-material upgrade, enclosure, firmware flashing), and printing/model preparation guidance including PrusaSlicer usage. No numeric specifications, wiring diagrams, amperage/voltage values, or part numbers appear on this page — it is purely a navigational index for the manual.

## Page 5

![Page 5](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/5.png)

# Page Transcription

This page is a **Table of Contents** page (continuation) from a 3D printer product owner's manual. It contains no diagrams, schematics, photos, or control panels — only hierarchical text listing sections, subsections, and their corresponding page numbers, connected by dotted leader lines.

## Full Verbatim Content (Table of Contents Entries)

**Continuation from prior section (section 6):**
- 6.5.7. Printing Multicolored Objects (without MMU3) ..................... 48
- 6.5.8. Slicing and Exporting ..................... 49

**7. Material Guide** ..................... 50
- 7.1. PLA ..................... 50
- 7.2. PETG ..................... 51
- 7.3. ASA (ABS) ..................... 52
- 7.4. PC (polycarbonate) and PC Blend ..................... 53
- 7.5. PVB ..................... 54
- 7.6. Flexible Materials ..................... 55
- 7.7. PA (Polyamide) / PA11CF ..................... 56

**8. Regular Maintenance** ..................... 57
- 8.1. Flexible Print Sheets ..................... 57
  - 8.1.1. Double-Sided TEXTURED Print Sheet ..................... 59
  - 8.1.2. Double-Sided SMOOTH Print Sheet ..................... 59
  - 8.1.3. Double-Sided SATIN Print Sheet ..................... 60
  - 8.1.4. Improving the Adhesion ..................... 60
- 8.2. Keeping the Printer Clean ..................... 60
- 8.3. Bearings ..................... 60
- 8.4. Fans ..................... 61
- 8.5. Extruder Feeding Gear ..................... 61
- 8.6. Electronics ..................... 61
- 8.7. Extruder is Clogged or Jammed ..................... 61
- 8.8. Cleaning the Nozzle ..................... 62
  - 8.8.1. The filament does not come out of the nozzle. ..................... 62
  - 8.8.2. The filament does not come out of the nozzle or only a small amount comes out ..................... 62
- 8.9. Troubleshooting Faulty Sensor Readings and Removing Errors ..................... 62
- 8.10. Filament Sensor ..................... 62

**9. FAQ - Frequently Asked Questions and Basic Troubleshooting** ..................... 63
- 9.1. Mesh Bed Leveling Fails ..................... 63
- 9.2. Printer Does Not Recognize the Inserted USB Drive ..................... 63
- 9.3. Loose Belts ..................... 64
- 9.4. Homing Failed ..................... 64
- 9.5. Heating Error ..................... 64
- 9.6. Fan Error ..................... 64
- 9.7. Reverting to an Older Firmware ..................... 64
- 9.8. Nozzle Hitting the Sheet / Other Z-axis Issues ..................... 64

**10. Advanced Hardware Troubleshooting** ..................... 65

**11. Troubleshooting Print Quality Issues** ..................... 65

---

## Notes for Searchability

- This page lists Sections 6 (partial, end only), 7, 8, 9, 10, and 11 of the manual's table of contents.
- Section 7 ("Material Guide") covers material types: PLA, PETG, ASA (ABS), PC (polycarbonate) and PC Blend, PVB, Flexible Materials, and PA (Polyamide)/PA11CF — each with its own page reference (pages 50–56).
- Section 8 ("Regular Maintenance") covers print sheet types (Textured, Smooth, Satin double-sided sheets), adhesion improvement, cleaning, bearings, fans, extruder feeding gear, electronics, clogged/jammed extruder, nozzle cleaning (including two distinct filament-not-extruding symptoms), sensor troubleshooting, and the filament sensor (pages 57–62).
- Section 9 ("FAQ") addresses common troubleshooting topics: mesh bed leveling failure, USB drive not recognized, loose belts, homing failure, heating error, fan error, firmware reversion, and nozzle/Z-axis issues (pages 63–64).
- Sections 10 and 11 are titled "Advanced Hardware Troubleshooting" and "Troubleshooting Print Quality Issues," respectively, both starting on page 65 — no subsections are listed under either on this page.
- No tables, images, diagrams, part numbers, amperage/voltage values, wire-speed values, or polarity information appear on this page — it is purely a textual index/table of contents.

## Page 6

![Page 6](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/6.png)

# Product Information

## Heading
**Product Information**

## Main Table

| Field | Value (Original Prusa MK4S) | Value (Original Prusa MK3.9S) |
|---|---|---|
| Name: | Original Prusa MK4S | Original Prusa MK3.9S |
| Manufacturer: | Prusa Research a.s., Partyzánská 188/7a, Holešovice, 170 00 Praha 7, Česká republika | (same, spans both columns) |
| Contacts: | Phone: +420 222 263 718, e-mail: info@prusa3d.com | (same, spans both columns) |
| EEE Category: | 3 (IT / Telecommunications Equipment) | (same, spans both columns) |
| Power Supply: | 100-240 VAC, 2.8 A max., 50-60 Hz | (same, spans both columns) |
| Frequency Bands: | WLAN: 2400,0-2483,5 MHz | (same, spans both columns) |
| Frequency Bands: | NFC: 13,553-13,567 MHz | (same, spans both columns) |
| Maximum Radiated Radio Frequency Performance (WLAN): | < 100 mW e.i.r.p. | (same, spans both columns) |
| Maximum Magnetic Field Strength (NFC): | < 60 dBuA/m at a distance of 10 m | (same, spans both columns) |
| WLAN standard: | IEEE 802.11 b/g/n | (same, spans both columns) |
| Operating Temperature Range: | 18 °C - 38 °C | (same, spans both columns) |
| Maximum Air Humidity: | 85%, non-condensing | (same, spans both columns) |
| Printer Dimensions: — Width: | 460 mm | (same, spans both columns) |
| Printer Dimensions: — Depth (with bed centered): | 420 mm | (same, spans both columns) |
| Printer Dimensions: — Height (without spool and spoolholder): | 385 mm | (same, spans both columns) |
| Build Volume (Width × Depth × Height): | 250×210×220 mm | (same, spans both columns) |
| Installed Nozzle Diameter: | 0.4 mm | (same, spans both columns) |
| Supported Filament Diameter: | 1.75 mm | (same, spans both columns) |
| Weight (With Packaging / Without Packaging): | 12.4 kg / 7.6 kg | (same, spans both columns) |

Note: The table as printed has a single merged column for values from "Manufacturer:" row downward (the two product names only differ in the first row "Name:"; all other rows apply to both products identically, shown as a single cell spanning both product columns in the original layout).

## Body Text (verbatim, below table)

"The serial number of the Original Prusa MK4S product is printed on the nameplate located on the printer frame and also on the packaging. The serial number of the Original Prusa MK3.9S product is located on the nameplate included in the upgrade kit, which must be attached to the printer frame. The Original Prusa MK4S and Original Prusa MK3.9S are devices intended for use only in indoor environments, where they are protected from external influences."

"Operating conditions in accordance with the General Authorization of the Czech Telecommunication Office No. VO-R/10 and No. VO-R/12."

### Subheading
**Simplified Declaration of Conformity**

"The manufacturer, Prusa Research a.s., hereby declares that the products Original Prusa MK4S and Original Prusa MK3.9S are in conformity with Directive 2014/53/EU applicable in the European Union and with Statutory Instruments 2017 No. 1206 applicable in the United Kingdom."

"The full texts of the Declaration of Conformity are available at the website: prusa3d.com."

## Page Footer
Page number: **6**

## Notes on Content (no diagrams/images present)
This page contains no diagrams, schematics, photos, or control panel illustrations — only a data table and body text describing regulatory, dimensional, and technical specifications for the Original Prusa MK4S and Original Prusa MK3.9S 3D printers.

Key specification callouts a technician may need:
- **Power Supply:** 100-240 VAC, 2.8 A max., 50-60 Hz (auto-switching universal input, single spec covers both models)
- **WLAN Frequency:** 2400.0–2483.5 MHz; **NFC Frequency:** 13.553–13.567 MHz
- **Radiated RF Power (WLAN):** < 100 mW e.i.r.p.
- **NFC Magnetic Field Strength:** < 60 dBuA/m at 10 m distance
- **WLAN Standard:** IEEE 802.11 b/g/n
- **Operating Temp:** 18 °C to 38 °C; **Max Humidity:** 85% non-condensing (indoor use only)
- **Footprint:** 460 mm (W) × 420 mm (D, bed centered) × 385 mm (H, without spool/spoolholder)
- **Build Volume:** 250 mm × 210 mm × 220 mm (W×D×H)
- **Nozzle Diameter (installed):** 0.4 mm
- **Filament Diameter (supported):** 1.75 mm
- **Weight:** 12.4 kg packaged / 7.6 kg unpackaged
- **Serial number location:** MK4S — nameplate on printer frame and packaging; MK3.9S — nameplate on upgrade kit (must be affixed to printer frame)
- **Regulatory basis:** Czech Telecommunication Office General Authorization No. VO-R/10 and VO-R/12; Directive 2014/53/EU (EU); Statutory Instruments 2017 No. 1206 (UK)
- **Conformity documentation:** Full Declaration of Conformity texts at prusa3d.com

## Page 7

![Page 7](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/7.png)

# Page Transcription

**Page number:** 7 (bottom right corner)

---

## Heading: Original Prusa MK4S / Original Prusa MK3.9S Warranty Information

**Body text (paragraph 1):**
"The parts for the Original Prusa MK4S 3D printer are covered by a 24-month warranty for end customers in the EU, and a 12-month warranty for business customers and end customers in the rest of the world. Consumables and parts subject to wear and tear are excluded from this warranty. The warranty period starts on the day the customer receives the goods."

**Body text (paragraph 2):**
"The seller is not liable for any damage caused by improper handling of the purchased product, or damage caused by handling in violation of the information and recommendations given in the official manuals and instructions. The warranty also expires in the event of unskilled interventions and the use of unofficial hardware and software modifications."

---

## Heading: Safety Symbols and Their Meanings

This section is a list of safety icons/pictograms, each paired with an explanatory text. Below is each icon described, followed by its verbatim caption text.

| Icon (visual description) | Meaning / Caption Text (verbatim) |
|---|---|
| Yellow triangle with magnet symbol (horseshoe magnet with field lines) | "Caution: strong magnetic fields. Do not place objects sensitive to magnetic fields on the marked areas, as they could be irreversibly damaged." |
| Yellow triangle with hand being pinched/caught symbol | "Attention: moving mechanical parts. Be careful not to injure your hands when you are in close proximity to equipment with mechanical parts." |
| Open book icon (black and white) | "Information on function, operation and service can be found in this manual or online at help.prusa3d.com." (URL appears in orange text, likely a hyperlink) |
| Blue circle icon with unplugged power cord/plug symbol | "Before any servicing, read the instructions and disconnect the product from the power supply." |
| White triangle with black exclamation mark | "Take extra care when handling or touching parts marked with this symbol and avoid other hazards listed for specific symbols, such as hot surface hazards - burns may occur." |
| Yellow triangle with heat/steam lines rising from a surface | "Warning: hot surface! The marked object may be hot and extra care must be taken when touching it to avoid burns." |
| Yellow triangle with gear/cog symbol | "Attention: moving parts. Unprotected moving mechanical parts can cause injury, so take extra care." |
| Black circle with printer/nozzle icon and a diagonal "no" slash through it | "Do not print directly on this surface!" |
| Black outlined icon of a trash bin with an X or strike-through, sitting on a black bar/base | "This product is made up of components that must be disposed of in accordance with the Waste Electrical and Equipment Directive, so take it to an e-waste collection point." |

---

## Notes on Layout
- All headings ("Original Prusa MK4S / Original Prusa MK3.9S Warranty Information" and "Safety Symbols and Their Meanings") are in orange bold text.
- Each safety symbol is displayed as a square icon on the left side of the page, with its corresponding explanatory text to the right.
- The hyperlink "help.prusa3d.com" is displayed in orange text, distinguishing it as a clickable/reference link.
- No tables, schematics, wiring diagrams, or numeric technical specifications (voltage, amperage, wire speed, etc.) appear on this page — content is limited to warranty text and safety symbol definitions.
- No part numbers are listed on this page.

## Page 8

![Page 8](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/8.png)

# Safety Instructions and Disclaimer

Non-compliance with the information in this manual or assembly instructions can result in injuries, poor print results, or damage to the 3D printer. Ensure that anyone working with the printer understands and comprehends the contents of this manual. Since we cannot control the conditions in which you assemble the Original Prusa MK4S printer, we do not accept responsibility for any losses, injuries, damages, or expenses arising from or associated with the assembly, handling, storage, use, or disposal of the product. Information in this manual is provided without any express or implied warranty.

## Handling the 3D Printer

Exercise caution when handling the 3D printer. It is an electrical device with moving and heated parts.

## Placement and Basic Use

- Ensure the printer is placed and operated in a suitable location to avoid potential risks.
- This device is intended for indoor use only. Do not expose it to water or snow. Contact with water and other liquids can damage electronics, cause short circuits, and other types of damage. Always operate the printer in a dry environment.
- Place the printer in a secure, dry location. The surface must be level and stable—ideally, a workbench. Ensure there is at least 30 cm of space around the printer. Obstructions near the printer can affect its operation or cause excessive wear on cable sheaths or the cables themselves. Worn cables can pose a risk (electric shock, fire).
- Ensure that no vents/fans are blocked. The printer has built-in fan speed monitoring, but in some cases (incorrect assembly, component damage, unofficial firmware), the monitoring may not work correctly. Insufficient cooling can lead to overheating and severe printer damage (risk of electronic damage, fire).
- Ensure the printer is placed to prevent tipping or falling. If the printer has suffered physical damage, do not use it—damaged parts can pose a safety risk.
- Power adapters and cords must be placed to avoid tripping, stepping on, or otherwise damaging them. Make sure the cables are not damaged. If they are, stop using the device immediately and replace the cables. Damaged cables are a safety risk - risk of electric shock.
- Do not leave the printer unattended while it is on! The printer is equipped with temperature control and several smart safety features, but misuse or unexpected component failure can pose a fire hazard.
- Never interfere with the print area when the printer is in operation. Also, prevent foreign objects from entering the print area and the area around the printer to avoid collisions.

## Electrical Safety

- The printer can only be powered through a standard 230 VAC, 50 Hz or 110 VAC, 60 Hz power outlet. Never use alternative sources, they may cause problems or even damage the printer.
- Do not use the printer if the power cable is damaged—damaged cables can lead to electric shock.
- Never disassemble the printer's power supply as it contains no user-serviceable parts. Always have the printer serviced by a qualified technician. Improper handling of the power supply can lead to printer damage and increased risk of electric shock.
- You can disconnect the device from the electrical grid by pulling out the plug. The electrical outlet must be easily accessible.
- When disconnecting the power cord from the outlet, pull the plug, not the cord. This will reduce the risk of damage to the plug or the power outlet.
- Never, under no circumstances, disconnect electrical parts while the Original Prusa MK4S printer is on — this includes disconnecting the Nextruder from the motherboard, disconnecting the heated bed, disconnecting the LCD, and others. Always turn off the printer before disconnecting electrical parts.

The printer is equipped with a replaceable fuse located in the fuse holder near the connecting connector of the power source and it protects the entire printer. Before replacing the fuse, switch off the printer and disconnect the power supply by pulling out the power cord from the outlet. Push the fuse holder out using a flat screwdriver, remove the fuse and insert a new one. Push the fuse holder back in place. Always make sure the new fuse has the same value as stated on the label. If the fuse blows repeatedly, contact the tech support.

## Mechanical Risk

Moving mechanical parts of the printer can cause injury.

- Never interfere with the internal components of the printer when it is connected to power or in operation—risk of injury from mechanical parts or electric shock.
- Prevent unauthorized persons, including children, from handling the printer, even when it is not printing.

---
Page number: 8

**Note:** This page contains no tables, diagrams, schematics, photos, or control panel illustrations—only body text organized under headings and bulleted lists as transcribed above. Power specifications stated: 230 VAC, 50 Hz or 110 VAC, 60 Hz. Fuse is located in a fuse holder near the power source connector; replacement fuse must match the value stated on the printer's label.

## Page 9

![Page 9](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/9.png)

# Page Transcription (Page 9)

## Heading: Burn Risk

- Do not touch heated parts of the printer – heatbed, print plate, and parts of the printhead.
  There is a risk of burns.
- Warning! During printing, parts of the print head and the print bed can heat to very high temperatures! Do not touch them until the print has finished and the printer has cooled down—risk of burns.

## Heading: Proper Use of Double-Sided Print Sheets

Body text: Each type of print sheet requires slightly different maintenance. Improper handling and use can damage the print sheet, heated bed, or other parts of the printer. Print sheets are consumables and subject to wear.

### Warning Callout Box (red background, hexagonal "!" icon to the left of the box)
Icon description: Black hexagon containing a white exclamation mark ("!"), used as a warning/caution symbol.

Callout text (white text on red banner):
"The surface of the textured and satin print sheet must not be cleaned with acetone!"

### Bulleted list (following the warning box):
- Please refer to the Flexible Print Sheets chapter for maintenance instructions.
- Use highly concentrated isopropyl alcohol (90% or more) to degrease the sheet surface.
- Do not use products that contain IPA as one of the components (e.g. hand sanitizers) - these products usually contain other additives that may negatively affect the properties of the printing plate.
- Do not wash under running water, as the sheet may corrode.
- Do not remove the PEI film from the plate surface.
- Before printing, clean the print sheet surface with a cloth moistened with isopropyl alcohol.
- Printing sheets are held in place on the heated bed with strong magnets - be careful when placing the sheet on the heatbed to avoid injury.
- Do not move the sheet when it is magnetically attached to the heated bed—friction can damage the heated bed.

## Heading: Working with Filaments

Body text: When handled correctly, working with filaments is simple and safe. Please read the following recommendations.

### Bulleted list:
- Always use the recommended temperatures for the selected material.
- Beware of molten plastic—it can cause burns! If molten plastic hangs from the nozzle, do not remove it by hand—use pliers or another tool.
- Some materials may emit a strong odor when printing - regularly ventilate the room.
- Handle the filament according to the instructions on the following pages of the handbook.
- Always ensure the end of the filament is properly secured—either inserted into the extruder or threaded through the spool hole. If you accidentally release the end of the filament, it can easily tangle and knot.

---

**Page number (bottom right corner):** 9

---

### Notes on Page Layout/Design Elements (for context, no additional info implied):
- No tables, diagrams, schematics, photos, charts, or control panels appear on this page.
- The only graphical element is the black hexagon with a white "!" symbol, marking a safety warning, paired with a solid red horizontal banner containing white warning text.
- All other content is plain black text on a white background, organized under three bold headings with bulleted lists beneath each.

## Page 10

![Page 10](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/10.png)

# Page Transcription

## Heading
**1. Introduction**

## Body Text

Thank you for purchasing the Original Prusa MK4S 3D printer from Prusa Research! Your support allows us to invest in further development of 3D printers and other 3D printing products, such as **PrusaSlicer,** our amazing slicing software. We also have our own in-house line of resins and filaments (Prusament), operate Printables.com and partake in many other awesome activities - check it out on our Blog at blog.prusa3d.com!

The MK4S is an upgraded version of our previous model, the Original Prusa MK4. It features several important improvements that make printing faster, easier and even more reliable. The MK4S continues to excel in print quality, delivering objects that are solid, durable, dimensionally accurate, and with a beautiful surface finish. It is the result of the ongoing work of many talented developers and we hope you will enjoy working with it.

## Hyperlinks (shown in orange text in original)
- Printables.com
- blog.prusa3d.com

## Photo/Image Description

A full-color photograph of the assembled **Original Prusa MK4S 3D printer** sitting on a wooden workbench/table, photographed against a pegboard wall background.

**Background elements:**
- A pegboard wall (white, perforated) hung with various tools: multiple wrenches/spanners of different sizes (silver and worn/used-looking), a red-handled tool, and several long thin silver rods/files hanging on hooks.
- Bottom right of background shows what appears to be dark speaker/audio equipment sitting on the table.

**Printer details visible in the photo:**
- The printer has a black frame/gantry structure with the **"PRUSA"** logo printed on the top horizontal bar.
- Two filament spools are mounted on a spool holder at the top of the printer: one **orange** filament spool (left) and one **black** filament spool (right), each mounted on spool holder arms extending from a central mount.
- Filament tubes (PTFE tubes) run from the spools down into the extruder/toolhead.
- The **extruder/toolhead assembly** is black, mounted on the X-axis gantry, with a label reading **"PRUSA MK4S"** on its front face.
- A small warning/safety label (yellow/black striped, appears to be a caution symbol) is affixed to the right vertical frame extrusion near the top.
- The X-axis carriage moves along smooth rods/linear rails, with orange-colored belt tensioner/idler components visible on both the left and right sides of the X-axis.
- Wiring/cable bundles are visible running from the toolhead down toward the base, wrapped in black cable management sleeving, with some cabling forming a loop/harness above the print bed.
- The **print bed** is dark gray/black, appears to be a smooth PEI-type sheet, currently empty (no visible print in progress) — a black flexible object (possibly a spatula or bed-scraper tool, or a finished print) sits loosely in the middle-front area of the bed.
- Below the print bed is the **front control panel/enclosure**, black, containing a small color LCD touchscreen display (showing a blue-toned interface, icons visible but not legible at this resolution), with the label **"PRUSA MK4S"** printed in red/orange text next to the screen.
- A flat gray/silver tool (possibly a metal scraper or steel sheet) rests on the wooden table in front of the printer, on the left side.
- The base/frame of the printer is black with orange accent components at the corners (visible on left and right sides at the X-axis carriage height).

**What this image answers:** This is an overview/orientation photo showing the general appearance and layout of the assembled MK4S printer — useful for identifying major visible components (dual filament spool holder, extruder/toolhead with nameplate, control panel with touchscreen, print bed, frame construction) but does not provide labeled callouts, part numbers, dimensions, or technical specifications.

## Page Footer
Page number: **10**

## Page 11

![Page 11](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/11.png)

# Page Transcription (Page 11)

## Heading: 2. Unpacking and Package Contents

**Body text:**

If you purchased the printer as a fully assembled model, simply remove the top foam inlay from the box. Find a good place for the MK4S. **You need at least 520×520mm of space for the printer to operate.** Keep in mind that the heatbed moves back and forth during printing and **the cables must not hit a wall** when the heatbed is in the rearmost position. Grab the top part of the metal frame and lift the printer from the box - **see the chapter below: How to Move the Printer.**

**Callout box (green background, with a hexagonal icon containing a stylized "N" or pen/tool icon on the left):**

> If you purchased the assembly kit, head on over to **help.prusa3d.com** (underlined, hyperlink style) to learn how to assemble it!

---

## Heading: 2.1. How to Move the Printer

**Body text:**

If you want to move the Original Prusa MK4S printer, use the recommended method - **grab the top of the printer frame and lift the printer.** Never lift the printer by the cables, filament holders or X-axis.

---

## Diagram/Photo Description

The image shows a photograph of the Original Prusa MK4S 3D printer viewed from the front, with a person's right hand/fist gripping the top horizontal bar of the black metal printer frame, demonstrating the correct lifting technique.

**Labeled/visible components in the photo:**
- **Top frame bar**: Black metal horizontal bar at the top of the printer, labeled "PRU..." (partially visible, presumably "PRUSA"), where the hand is gripping to lift the printer.
- **Hand/fist**: A human hand shown gripping the top frame bar, illustrating the correct lift point.
- **Extruder/Toolhead**: Black print head assembly in the upper-middle of the printer labeled "ORIGINAL PRUSA MK4S".
- **X-axis rods**: Horizontal smooth metal rods running left-to-right below the extruder, along which the toolhead moves.
- **Left and right Z-axis/gantry supports**: Orange-colored vertical mounting blocks/brackets on left and right sides of the frame, holding the X-axis rods (visible as bright orange plastic parts).
- **Cables**: Black cable bundle visible looping from the extruder down toward the frame - explicitly called out as something NOT to lift the printer by.
- **Heatbed**: Visible at the bottom-center of the printer, a flat metallic/textured print surface partially inserted.
- **Front panel/LCD display**: Small screen with a control knob (rotary dial) at the bottom front of the printer, labeled "PRUSA MK4S", used for printer control/navigation (buttons/knob visible but not individually labeled in text).
- **Regulatory/safety label**: Small sticker on the upper right side of the frame near the top, containing:
  - A blue rectangular symbol (partially visible, likely "MADE IN..." text, possibly "MADE IN EU" or CE-related origin marking)
  - Yellow warning triangle icons (appears to be multiple warning/caution symbols, icons not individually legible/described further)
  - CE marking icon (circular "C E" style logo typical of European compliance marking)

**Purpose of diagram:** This image visually answers the question "Where and how should I grip the Original Prusa MK4S to safely lift or move it?" — demonstrating that the correct lift point is the top of the black metal frame, not the cables, filament holders, or X-axis rods.

---

## Page footer:
Page number: **11**

## Page 12

![Page 12](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/12.png)

# Page Transcription

**Page number:** 12

## Heading
**2.2. Contents of the Package and Accessories**

## Body Text

**Your Original Prusa MK4S printer package includes:**

- Documentation
- USB drive with sample prints (G-codes)
- MK4S Toolset
  - Uni-wrench
  - 13-16 wrench
  - Philips screwdriver
  - Nose pliers
  - Allen and torx keys
- Alcohol-saturated wipe (for initial calibration), acupuncture needle
- Double-sided Smooth PEI Print Sheet
- 1kg spool of Prusament (only with an assembled printer)
- Spoolholder
- Spare parts
- Prusa lubricant for bearings
- A pack of Haribo gummy bears

These are the basic tools and accessories necessary for assembly and basic maintenance. **We recommend purchasing a few extra accessories,** such as:

- **Cutting pliers** for cutting the end of filaments or removing supports from printed objects
- **Isopropyl alcohol** (90% or more) for cleaning the print sheet
- **Paper wipes** for cleaning the print sheet
- **Plastic spatula** for removing plastic from the print sheet - you can actually print one!

## Notes on Page Content
- No tables, diagrams, schematics, photos, charts, or control panels appear on this page.
- No part numbers, amperage/voltage values, wire-speed values, or polarity information are present on this page.
- The page is purely a text-based list describing package contents and recommended additional accessories for the Original Prusa MK4S 3D printer.
- This page would answer questions such as: "What tools come with the MK4S printer?", "Does the MK4S include a print sheet?", "What additional cleaning supplies should I buy for my Prusa MK4S?", "Is a spool of filament included?" (Only with an assembled printer), and "What is in the MK4S Toolset?"

## Page 13

![Page 13](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/13.png)

# 3. Original Prusa MK4S Overview and Glossary

## Page Heading
**3. Original Prusa MK4S Overview and Glossary**

## Diagram Description

The page contains a labeled line-art diagram of the Original Prusa MK4S 3D printer, shown from the front. The printer includes an orange filament spool (with orange filament) mounted on top, a second (black) spool visible behind/beside it, a black frame construction with vertical Z-axis rods, a print head assembly (labeled "PRUSA MK4S" on the extruder body), an LCD/control panel at the front-bottom with buttons and rotary knob, and a heatbed/print sheet at the bottom.

Callout numbers 1–15 point via leader lines to specific components on the printer image. Numbers 1–8 are arranged down the left side (pointing rightward into the machine), and numbers 9–15 are arranged down the right side (pointing leftward into the machine). Each numbered circle corresponds to a labeled component described in the numbered list below the diagram.

### Callout Positions (approximate, based on layout):
- **1** – top left, pointing to the front (orange) filament spool
- **2** – upper left, pointing to the frame (top horizontal bar area)
- **3** – below 2, pointing to the Z-axis (vertical rod area)
- **4** – below 3, pointing to the Nextruder (print head)
- **5** – below 4, pointing to the X-axis stepper motor (left side, orange bracket)
- **6** – below 5, pointing to the electronics box area (front, black box with cable)
- **7** – below 6, pointing to the Z-axis stepper motor (bottom left)
- **8** – bottom left, pointing to the LCD control panel
- **9** – top right, pointing to the rear (black) spoolholder
- **10** – upper right, pointing to the X-axis (horizontal smooth rod assembly)
- **11** – right side, pointing to the Power Supply Unit (right frame area)
- **12** – lower right, pointing to the print sheet (bed surface)
- **13** – lower right, pointing to the heatbed
- **14** – lower right, pointing to the USB port/USB drive (front panel)
- **15** – bottom right, pointing to the rotary knob (front panel, control area)

This diagram answers questions such as "where is the X-axis stepper motor located on the MK4S" or "which component is the Nextruder" or "where do I insert a USB drive on this printer."

## Numbered Component List (Glossary)

1. **Filament spool** - The Original Prusa MK4S is compatible with 1.75mm filaments.
2. **Frame**
3. **Z-Axis** - vertical, consists of threaded and smooth rods, moves the Nextruder up and down.
4. **Nextruder** - Our new next-generation extruder with a planetary gearbox and LoadCell sensor.
5. **X-axis stepper motor** - moves the Nextruder left and right.
6. **Electronics box** - housing for the xBuddy board. Ethernet and Wi-Fi ports are accessible from the rear.
7. **Z-axis stepper motor** - one of two total. Z-axis motors move the Nextruder up and down.
8. **LCD** - used for control and configuration of the printer.
9. **Spoolholder**
10. **X-axis** - a general name for the entire horizontal assembly consisting of two smooth rods, an X-axis motor, a belt and plastic parts. The Nextruder moves along the X-axis from left to right.
11. **Power Supply Unit**
12. **Print sheet** - easy to maintain, held in place with strong magnets embedded in the heatbed.
13. **Heatbed** - proven Prusa MK52 heatbed.
14. **USB port and USB drive** - use the USB drive to print G-Codes (print files) and flash firmware.
15. **Rotary knob** - main control device with the Reset button directly below it.

## Page Footer
Page number: **13**

## Additional Notes
- No tables are present on this page.
- No numeric settings (amperage/voltage/wire-speed) are present on this page; content is limited to physical component identification and brief functional descriptions.
- Filament compatibility explicitly stated: **1.75mm filaments**.
- Heatbed model explicitly stated: **Prusa MK52 heatbed**.
- Electronics board explicitly stated: **xBuddy board**, with **Ethernet and Wi-Fi ports accessible from the rear**.

## Page 14

![Page 14](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/14.png)

# Page 14 — Original Prusa MK4S Extruder/Toolhead Diagram

## Diagram Description

The page shows a labeled photograph of the **Original Prusa MK4S** print head/extruder assembly, viewed from the front. The toolhead body is black plastic with a front label reading "ORIGINAL PRUSA MK4S" (MK4S in orange text). The assembly is mounted on smooth rods with a visible timing belt (red/dark) running vertically behind it, and gray cable/tubing bundles are visible on the left and right sides.

Eleven numbered callouts (in circles, 1–11) point to specific parts via leader lines:

- **Callout 8** and **9** point to the top area of the extruder (top plate/electronics cover region and a spring-loaded mechanism).
- **Callouts 1, 2, 3, 4** point to the upper-left/front area (filament entry, idler swivel lock, idler, and gearbox/motor area).
- **Callout 10** points to the right side, upper-middle of the fan housing (heatsink fan area).
- **Callout 5** points via a dashed line to the left side of the fan housing (thumbscrew cover, partially hidden).
- **Callout 6** points to the center of the large circular fan (print fan).
- **Callout 7** and **11** point to the bottom of the assembly (fan shroud and nozzle tip, respectively).

## Numbered Parts List (Verbatim)

1. **Filament insertion point (from the top)** - the MK4S is compatible with 1.75mm filaments.
2. **Idler lock (swivel)** - flip upwards to unlock the idler door.
3. **Idler** - maintains pressure on the filament strand which is moved further into the extruder by the extruder gear.
4. **Planetary gearbox and extruder motor.**
5. **Thumbscrew cover** - flip the cover open to access the thumbscrews - you can detach the nozzle by unscrewing them.
6. **Print fan** - high-performance turbine for cooling the printed object
7. **Fan shroud** - directs the air from the print fan towards the printed object.
8. **Electronics cover** - covers the break-out board.
9. **Idler screws** - these screws are used to adjust the pressure of the idler.
10. **Heatsink fan** - cools the aluminum heatsink behind it.
11. **Nozzle** - by default, a 0.4mm nozzle is installed.

## Warning Callout (Red Box with "!" icon)

**DO NOT remove the cover of the gearbox unless you have a gearbox alignment tool that comes with the assembly kit. If you have a factory-assembled machine, the gearbox is precisely aligned and calibrated. There is no need to access it. You could misalign the gearbox by removing the cover.**

## Key Facts/Specs Extracted

| Item | Value/Note |
|---|---|
| Filament diameter compatibility | 1.75mm |
| Default nozzle size | 0.4mm |
| Nozzle removal method | Unscrew via thumbscrews (accessed by flipping open thumbscrew cover, item 5) |
| Gearbox type | Planetary gearbox |
| Fan count | 2 (Print fan - item 6; Heatsink fan - item 10) |
| Idler adjustment | Via idler screws (item 9), which adjust pressure of the idler (item 3) |
| Idler unlock mechanism | Swivel lock (item 2), flip upwards to open idler door |
| Electronics cover purpose | Covers the break-out board (item 8) |
| Gearbox cover removal | Prohibited without factory gearbox alignment tool; factory-assembled units are pre-calibrated and should not be opened |

Page number: **14**

## Page 15

![Page 15](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/15.png)

# Page Transcription

**Page number:** 15

---

## 3.1. Connecting and Disconnecting the Power Cable

**Warning callout (red box with exclamation-point icon in black hexagon):**
> Always pull the connector, do not pull on the cable itself! Incorrect handling can lead to damage to the connector or cable.

**Body text:**
The power supply port is located on the rear side of the printer. Before you plug or unplug the cable, turn the printer off using the physical switch on the power supply unit next to the power supply port. See the picture below to learn how to correctly disconnect the power plug from the power supply.

**Photo description:**
Shows the rear/underside area of a 3D printer (orange and gray/black housing) with a power supply unit visible. A red rocker power switch (marked "O" for off position, switch appears set to off/lower position) is visible on the power supply unit. Below and to the right of the switch is the power supply port/connector. A human hand (thumb and fingers) is shown gripping the black power connector/plug itself (not the cable) and pulling it out of the port, demonstrating the correct disconnection technique described in the warning above. Small text/labeling visible on the unit includes what appears to be a barcode/serial sticker but is not legible in detail. The printer's build plate (with grid pattern) is visible in the upper right of the image.

---

## 3.2. Error Screens

**Body text:**
If the printer encounters a critical error, **an error screen will be displayed with a description of the error.** The information on the screen is intended to facilitate easy identification, diagnosis and resolution of the error. **Pay special attention to the text on the screen.** Most error messages are supplemented with a QR code - scanning it (e.g. using a camera on a mobile phone) will take you to a relevant online article with instructions on how to proceed.

**Diagram/Screenshot description — Sample Error Screen (red/orange background):**

This is a mock-up of the printer's LCD touchscreen display showing an example error message. Elements shown on screen, top to bottom, left to right:

- Top status bar:
  - Left: "① ERROR" (error icon and label)
  - Right: Wi-Fi icon and time "10:56"
- Error title: **"Bed Preheat Error"**
- Error description text:
  - "The printer encountered an error while heating up the heatbed."
  - "Bed wiring might be damaged."
  - "More information at help.prusa3d.com/12201"
- Right side of screen: An icon depicting a heatbed/printer illustration, next to a QR code (square black-and-white matrix code) for scanning to reach the online help article.
- Bottom status bar (printer status icons):
  - Nozzle temperature icon: "210/215°C" (current/target)
  - Bed temperature icon: "100/110°C" (current/target)
  - Fan/percentage icon: "100%"
  - Filament type icon: "PET-G"

**Caption below image (italic):**
"This is a sample QR error code serving as an example of an error message."

---

## Key Facts / Values Captured on This Page

| Item | Value |
|---|---|
| Help URL referenced in sample error | help.prusa3d.com/12201 |
| Sample error type | Bed Preheat Error |
| Sample nozzle temp (current/target) | 210°C / 215°C |
| Sample bed temp (current/target) | 100°C / 110°C |
| Sample fan speed | 100% |
| Sample filament type | PET-G |
| Time shown on sample screen | 10:56 |
| Power switch location | On power supply unit, next to power supply port, rear side of printer |
| Correct disconnection method | Pull the connector/plug itself, NOT the cable |

## Page 16

![Page 16](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/16.png)

# Page Transcription

## 4. Your First Print

To get your printer up and running, please pay attention to the information in the following chapters. We will go through the basics together - you'll be printing in no time!

### Box: "In this chapter you will learn how to:"
- Control the printer
- Prepare the print sheet for the first print
- Perform initial calibration
- Insert filament
- Start the first print
- Remove the print
- Troubleshoot basic issues
- Update the firmware

---

## 4.1. Basic controls

You can control your printer using both the **touchscreen and the rotary knob** next to it. Rotate the knob to select items on the screen and press it to confirm your selection. The reset button is located under the rotary knob. Pressing the reset button is the same as quickly turning the printer off and on again. It is useful in cases where it is necessary to immediately stop an action that the printer is currently performing.

---

## Diagram Description: Printer Control Panel Photo

The image shows a close-up photo of the Original Prusa MK4S printer's front control area, mounted below the heatbed.

**Visible elements:**

- **Heatbed (top portion of image):** Black textured surface labeled "ORIGINAL PRUSA HEAT..." (text cut off, likely "HEATBED by Josef Prusa"). The bed has printed ruler/scale markings: 50, 100, 150, 200 (millimeter position markers) with dashed alignment lines and screw/bolt mounting points visible along the edges. A "no heart/pacemaker" warning icon (heart with a slash through it, warning symbol for pacemaker users due to magnets) is shown on the top-left of the heatbed.

- **Left side vertical label:** "ORIGINAL PRUSA MK4S" printed vertically in orange/white on the black control unit housing.

- **LCD Touchscreen (center):** A color touchscreen display showing the printer's home menu interface with the following elements:
  - Top status bar: Home icon with "HOME" label, WiFi/network icon, USB/connection icon, time display "01:54 PM"
  - Six menu icons arranged in a 2-row x 3-column grid:
    - Row 1: **Print** (play/triangle icon), **Preheat** (droplet/temperature icon), **Filament** (circular icon)
    - Row 2: **Control** (crosshair/target icon), **Settings** (gear icon), **Info** (circled "i" icon)
  - Bottom status bar: Nozzle temperature icon showing "26°C", heatbed temperature icon showing "27°C", and material indicator "PLA"

- **Right side of touchscreen:** A rotary knob (silver/metallic dial) for navigation, with a **RESET** button (black button labeled "RESET" in white text with orange outline) positioned below/beside the knob.

- **USB port:** Visible USB symbol icon near a port opening on the right side of the control unit.

- **USB flash drive:** A black USB drive is shown inserted into the port, labeled "PRUSA RESEARCH by JOSEF PRUSA" with the Prusa logo.

**What this diagram answers:**
- Shows the physical layout and location of the touchscreen, rotary knob, and reset button relative to each other.
- Identifies the six main menu options accessible from the Home screen: Print, Preheat, Filament, Control, Settings, Info.
- Shows where the USB port is located for inserting a USB drive (used for print files/firmware).
- Displays example status readings: nozzle temp 26°C, bed temp 27°C, currently loaded material PLA, time 01:54 PM.
- Warns (via pacemaker icon) that the heatbed area contains magnets that may affect pacemakers/medical implants.

---

**Page number:** 16

## Page 17

![Page 17](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/17.png)

# Page 17 — Transcription

## Heading
**4.2. Preparing Flexible Print Sheets**

## Warning Box (red background, hexagonal "!" icon at top-left)
"If you have ordered a pre-assembled printer, a print sheet with a test print will already be installed on the printer. The test print must be removed before proceeding to the next step! Remove the print sheet and carefully bend it on both sides. Then turn it by 90° and repeat the bending until the print separates from the print sheet. Then place the sheet back on the printer."

## Body Text (paragraph 1)
Make sure there is no debris on the heatbed before you install the print sheet. It could either throw off the first layer calibration or possibly even damage your printer. Do not drag the print sheet while it's attached with magnets, you could scratch and damage the heatbed. If you need to readjust the print sheet, always lift it up by grabbing the front two corners, adjust its position and then place it back down.

## Body Text (paragraph 2)
The Original Prusa MK4S comes standard with a double-sided smooth PEI print sheet. If you have a different type, we recommend that you **carefully study how to properly treat the surface in the Regular Maintenance chapter.**

## Body Text (paragraph 3)
There are high-temperature magnets embedded into the heatbed that hold the removable flexible print sheets in place. On the back of the heatbed, you will find two pins that fit exactly into the cutout of the print sheet. **Before installing the sheet onto the heatbed, make sure that it is perfectly clean. Never print directly on the heated bed!**

## Photo/Diagram Description
The image shows a close-up view of the 3D printer's X-axis assembly and heatbed area, taken from above/front angle.
- Visible components: a stepper motor (black, with wiring visible in blue/red/black), a toothed drive belt with pulley/gear mechanism, and metal linear rail/rods.
- The heatbed surface is visible, printed with the text: **"SMOOTH PEI SHEET by Prusa3D.com"**
- Two small metal alignment pins are visible on the bed surface, each circled/highlighted with an **orange marking** — one on the left side and one on the right side of the bed, near the rear edge. These are the locking pins referenced in the text that align with the cutout in the print sheet.
- Faint dashed grid lines are visible on the bed surface (print area guide markings).
- The image illustrates where the print sheet's rear cutout should align when installing the sheet onto the heatbed.

## Body Text (paragraph 4, below image)
**Attach the sheet by first aligning the rear cutout with the locking pins on the back of the heated bed** (marked in orange in the picture above). Hold the sheet by the front two corners and slowly lay it down onto the heated bed - **watch your fingers!**

## Body Text (paragraph 5)
For your first print, it is enough to **wipe the bed using the supplied cleaning wipes** soaked with isopropyl alcohol. You can do it now, but make sure **not to touch** the surface of the sheet afterward.

## Page Number
17

---

### Key Facts for Technician Reference
- Printer model referenced: **Original Prusa MK4S**
- Standard print sheet type: **double-sided smooth PEI print sheet**
- Sheet retention mechanism: **high-temperature embedded magnets** in heatbed + **two locking pins** on back of heatbed matching cutout in sheet
- Sheet alignment: rear cutout of sheet aligns with two pins (shown highlighted in orange in photo) at rear of heatbed
- Handling instructions: lift/place sheet only by **front two corners**; do not drag while magnetically attached (risk of scratching heatbed)
- Cleaning: use **supplied cleaning wipes soaked with isopropyl alcohol**; avoid touching sheet surface after cleaning
- Safety note: **Never print directly on the heated bed** without the sheet installed
- Test print removal method (for pre-assembled units): bend print sheet on both sides, rotate 90°, repeat bending until print separates

## Page 18

![Page 18](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/18.png)

# Page 18 — Transcription

## Heading
**4.3. Selftest (Calibration Wizard)**

## Warning Callout (Red banner, black "!" hexagon icon)
**The print sheet must be installed onto the printer before the calibration!!!**

## Body Text

When you first power on the Original Prusa MK4S, the Selftest (Calibration wizard) will start. **The wizard will walk you through the initial calibration and all necessary tests to start printing.** Completing the entire checklist is mandatory. But don't worry, it's gonna be super easy, barely an inconvenience!

The first thing the wizard will perform is the internet setup configuration. This is completely optional and you may choose to completely skip this step. The printer will be fully functional even in fully offline mode. Follow the simple steps on the screen to connect the printer to the network. More information can be found in the Advanced User Guide.

**The Wizard will provide you with text descriptions and illustrations of the individual steps.** It is designed to make the process as automated and understandable as possible. For clarity, some actions are further described in the following chapters. You can also start the Selftest manually using the *LCD menu - Control - Run Full Selftest.*

## Diagram: LCD Screen Illustration

Description: A rectangular illustration representing the printer's LCD touchscreen display during the Selftest Wizard startup.

- **Top-right corner status indicator:** battery/display icon followed by time reading "08:43"
- **Center graphic:** A cartoon illustration of a man's face/avatar (bald or short-haired, wearing glasses, dark shirt/collar) — represents the "guide" character for the wizard.
- **On-screen text (white, centered, monospaced font):**
  ```
  Hi, this is your
  Original Prusa printer.
  I would like to guide you
  through the setup process.
  ```
- **Button (orange rectangle, bottom of screen):** **OK**

What this answers: This shows the exact first screen/prompt a technician will see when powering on the MK4S for the first time — confirming the Selftest Wizard has started and prompting the user to press OK to proceed.

## Info Callout (Orange banner, white "i" hexagon icon)

The purpose of the calibration is to check whether your printer is in good shape. If you built the printer as a kit, the Selftest checks for basic assembly issues. If you ordered a pre-assembled printer, the Selftest can help identify issues that could be caused, e.g., by rough handling during shipping. It's a one-time process that doesn't need to be repeated before every print. Rerun it if you encounter issues with your printer (more on that in the advanced sections of this handbook).

## Page Footer
Page number: **18**

## Page 19

![Page 19](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/19.png)

# Page 19 — Section 4.4. Running the Selftest

## Heading
**4.4. Running the Selftest**

## Warning Box (red, with "!" icon in black octagon)
> During the Printer Selftest, do not manipulate or touch the printer unless the calibration asks you to. If the printer is placed on an unstable surface or if there is another running 3D printer next to it, it may affect the accuracy of the calibration negatively. The printer should be placed on a stable surface.

## Body Text

For the Selftest and the filament sensor calibration, **you will need at least 5 cm (2 in.) of filament.**

The Selftest is a set of **various tests that serve as a diagnostic tool.** With their help, you can detect the most common problems, such as **incorrect wiring of cables.** The progress and results of each test will be displayed on the LCD. If the Selftest detects an error, the testing will be interrupted and the cause of the error will be displayed on the screen.

**The following tasks will be performed:**
- Test of heatsink fan and print fan
- Test of the X, Y, and Z axis
- Gearbox alignment
- Heater tests
- LoadCell test
- Network connection (optional, explained in the Advanced User Guide)
- Setting up the filament sensor - more info below:

At one point, the Selftest will ask you to **calibrate the filament sensor** by inserting a piece of filament into the slot on the top of the extruder. A minimum of 5 centimeters (2 in.) is required, however, **we suggest simply preparing an entire spool of PLA filament,** so you can start printing once the Selftest finishes.

**Continue to the next chapter (Inserting filament) to learn how to properly attach a filament spool and prepare the material.**

## Screenshots / LCD Panel Diagrams

Two LCD screen captures are shown side by side, both depicting the printer's touch/display interface during the Filament sensor test portion of the Selftest.

### Left Screenshot
- Top bar: checkbox icon + "SELFTEST" label, battery/status icon, time display "10:44"
- Screen Heading: **Filament sensor test** (underlined in orange)
- Icon: circular graphic (represents extruder/filament sensor gear icon, orange and gray segmented circle)
- Message text: "You need at least 5 cm of filament to calibrate the Filament sensor. Do you have filament?"
- Two buttons at bottom:
  - **YES** (orange button, left)
  - **NO** (gray button, right)
- Bottom status row: small icon + "N/A" text

### Right Screenshot
- Top bar: checkbox icon + "SELFTEST" label, battery/status icon, time display "10:45"
- Screen Heading: **Filament sensor test** (underlined in orange)
- Icon: same circular graphic (extruder/filament sensor icon)
- Message text: "Great! We need to start without the filament in the extruder. Please make sure there is no filament in the filament sensor."
- Two buttons at bottom:
  - **UNLOAD** (orange button, left)
  - **CONTINUE** (gray button, right)
- Bottom status row: small icon + "N/A" text

**What this answers:** These screenshots show the exact sequence and wording of prompts a technician will see on the LCD during filament sensor calibration as part of the Selftest routine — specifically confirming filament availability (YES/NO) and then instructing to ensure the extruder is empty before proceeding (UNLOAD/CONTINUE).

## Page Footer
Page number: **19**

## Page 20

![Page 20](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/20.png)

# Page 20 — Transcription

## Heading
**4.5. Inserting (Loading) filament**

## Body Text

First, prepare a spool of filament - **we strongly recommend using PLA** because it's easy to work with. Take the spool, make sure the end of the filament is properly secured and place the spool onto the spoolholder on top of the printer's frame.

**Carefully unhook the end of the filament strand** and make sure not to let go, otherwise, the tension in the strand would cause the filament to quickly tangle up.

## Numbered Procedure

1. **Cut the end of the filament into a sharp point.** Push the filament through the hole in the filament guide and insert the plastic strand into the opening at the top of the Nextruder. If the filament sensor is on, the filament will be automatically fed. If the filament sensor is off, proceed to step 2, otherwise skip to step 3.
2. Select *LCD Menu - Filament - Load Filament* and confirm with the button.
3. The Preheat menu will automatically appear. Select the **material of the filament you want to insert** and confirm the selection.
4. Wait until the nozzle reaches the desired temperature.
5. Select Continue to start feeding the filament. Push the filament into the Nextruder lightly until you feel that the extruder gear grabbed the filament and is pulling it in.
6. The feed wheel will then push the filament further into the extruder. Once it heats up fully, it will push out a bit of material from the nozzle. **The printer will ask if the color of the extruded filament is okay.** The message on the screen will say: Yes / Purge More / Retry. Check if there is filament extruded from the nozzle, then select:

   - If the filament is extruded and the color is correct, select YES
   - If the filament is not extruded or is contaminated with another color, select: PURGE MORE (you can repeat this step)
   - If the filament is not extruded and PURGE MORE doesn't help, repeat the loading procedure by choosing RETRY

## Images (2 photos, side by side at bottom of page)

**Left photo:**
Shows a close-up of two hands: one holding a length of red filament, the other holding a pair of diagonal wire cutters (flush cutters) positioned to snip the end of the filament at an angle. A circular inset/callout magnifies the cut tip of the filament, showing it has been trimmed to a sharp, pointed end (angled cut, not blunt/square). This illustrates step 1's instruction to "cut the end of the filament into a sharp point."

**Right photo:**
Shows a close-up of the Nextruder assembly on the printer (labeled "PRUSA MK4S" on the black extruder body/cover), mounted on the X-axis gantry with visible smooth rods and orange trim pieces. A hand is feeding a strand of red filament downward into the opening at the top of the Nextruder, illustrating the filament insertion point referenced in step 1 ("insert the plastic strand into the opening at the top of the Nextruder").

## Page Footer
Page number: **20**

## Page 21

![Page 21](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/21.png)

# Page Transcription and Description

**Page number:** 21

---

## Screenshot 1 — LCD Menu: "Preheating for load"

A black-background LCD screen interface showing a filament preheat selection menu.

**Header row:** "Preheating for load" | battery icon | "16:33" (time)

**Menu items:**
- ↑ **Return** (navigation option, top of list)

| Filament | Temp (nozzle/bed) |
|---|---|
| PLA | 215/60 |
| PETG | 230/85 |
| ASA | 260/100 |
| PC | 275/100 |
| PVB | 215/75 |
| ABS | 255/100 |

Note: "PLA" row is highlighted (selected, white background with black text), indicating it is the currently selected filament type. Values appear to represent nozzle temperature / bed temperature in °C (e.g., PLA = 215°C nozzle / 60°C bed).

---

## Screenshot 2 — LCD Menu: "FILAMENT — Loading filament"

A black-background LCD screen showing the active filament loading process.

**Header row:** ⊙ "FILAMENT" | battery icon | "16:34" (time)

**Body:**
- Title: **"Loading filament"**
- Progress bar (appears empty/at start)
- Percentage indicator: **"0%"**
- Instruction text: **"Press CONTINUE and push filament into the extruder."**

**Buttons (bottom of screen):**
- **CONTINUE** (orange/highlighted button, active)
- **STOP** (gray button)

**Status bar (bottom row, below buttons):**
- Nozzle icon: **29/215°C** (current/target nozzle temperature, shown in orange/red text)
- Bed icon (grid symbol): **24/0°C** (current/target bed temperature)
- Fan icon: **ON**

---

## Info Callout Box (orange background with "i" icon in hexagon)

> "The printer remembers which filament is inserted into it even when you turn it off. The type of filament is displayed in the lower section of the LCD menu."

---

## Body Text (below callout, bold)

> "For the next step (Starting the First Print), leave the filament inserted in the printer. If for any reason you need to change the filament, the procedure is described on the next page."

---

## Summary — What This Page Answers

- **Which filament types are supported and their preheat temperatures:** PLA (215/60), PETG (230/85), ASA (260/100), PC (275/100), PVB (215/75), ABS (255/100) — nozzle/bed temperature pairs in °C.
- **How the filament loading screen looks and what buttons are available:** CONTINUE (proceed with loading) vs STOP (cancel).
- **What live status is shown during loading:** current/target nozzle temp (29/215°C example), current/target bed temp (24/0°C example), and fan status (ON).
- **Printer memory behavior:** the printer retains the last-selected filament type setting even after power-off, and displays it in the lower LCD section.
- **Workflow guidance:** confirms filament should remain loaded before starting the first print, with a reference that filament-change instructions appear on the following page.

## Page 22

![Page 22](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/22.png)

# 4.6. Unloading (Removing) Filament

**Body Text (verbatim):**

1. Select *LCD Menu - Filament - Unload Filament*
2. The printer will preheat automatically. As soon as it reaches the right temperature, the filament will be unloaded from the extruder in a few seconds.
3. Once the extruder stops unloading the filament, remove it from the extruder by hand. The filament needs to be wound up on the spool and secured carefully so that it does not tangle up.

---

## LCD Screen Diagram

The image shows a printer LCD display screen during the filament unloading process. This screen answers the question "what does the display look like while filament is unloading, and what information is shown?"

**Screen layout and labeled elements (top to bottom, left to right):**

- Top-left icon: circular icon (settings/gear-like symbol) followed by text label **"FILAMENT"** (indicates current menu/screen name)
- Top-right: battery/status icon followed by time display **"16:34"**
- Center heading (bold): **"Unloading filament"**
- Progress bar: orange filled bar (small portion filled, indicating early progress) on a gray background track
- Progress percentage (bold, centered): **"2%"**
- Status text (centered): **"Waiting for temperature"**
- Large orange button (bottom-center, bold black text): **"STOP"** — allows user to cancel/stop the unloading process
- Bottom status bar (left to right):
  - Nozzle/extruder temperature icon with value: **"65/215°C"** (current/target temperature)
  - Bed/heatbed icon (grid pattern) with value: **"24/0°C"** (current/target bed temperature)
  - Fan icon with status: **"ON"**

This screen indicates the printer is in a preheating phase (waiting for temperature) before the actual unload/retraction of filament begins. Current nozzle temp is 65°C heating toward target of 215°C. Bed is at 24°C with target of 0°C (bed heating not required for this operation). Cooling fan status is ON.

---

## Info/Warning Callout Box (orange box with "i" info icon)

**Heading:** "Tangled filament? Let's fix it!"

**Body text (verbatim):**
"If you accidentally manage to let go of the end of the filament and the strand quickly retracts onto the spool, it's possible that the filament became tangled. This poses a risk during printing - a knot can form on the strand of filament, which will inevitably lead to a failed print. Simply remove the spool from the spoolholder and start unwinding the filament strand from the spool until you find the crossed section. Fix it and wind the filament back onto the spool."

---

**Page number:** 22

## Page 23

![Page 23](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/23.png)

# Page Transcription

## Heading
**4.7. Starting the First Print**

## Body Text

**If you haven't done it already, clean the print sheet with the enclosed wipe saturated with isopropyl alcohol** or spray a bit of isopropyl alcohol onto the sheet and wipe it clean with a paper towel. Please note that the enclosed wipe has limited use as IPA evaporates quickly.

[Photo — see description below]

Then select **one of the test objects from the Print menu** (only appears if a USB drive is inserted). Confirm the selection by pressing the rotary knob.

Watch the printer closely during the first print. We recommend **selecting the Keychain.** It gives you a good quick overview of whether everything is properly set up. The nozzle will first preheat to 170 °C independently of the selected filament - the temperature is lower to prevent the filament from dripping from the nozzle.

Then, the printer performs **Mesh Bed Leveling** - the nozzle will check the distance to the print sheet in several places to **create a virtual height map of the surface.** This allows the printer to lay down a perfect first layer every time. Subsequently, the printing of the object or objects will take place.

Optionally, **if you have more than one color of PLA filament,** you can also select **the Dual-Color Keychain.** It's a great demonstration of multi-colored print using only one extruder. During the print, the machine will ask you to change the filament. Simply **follow the instructions on the screen** to achieve the effect visible in the photo below.

---

## Diagram/Photo Description

**Image:** A photograph showing a human hand (right hand, using a white paper towel/tissue) wiping the surface of a 3D printer's print bed/sheet.

**Details visible in the photo:**
- The print sheet is a dark gray/black textured surface with a grid pattern of dashed lines (used for print alignment/reference).
- Text printed on the sheet reads: "SMOOTH PEI SHEET by Prusa3D.com" (near top edge).
- Bottom right corner of the sheet reads: "ORIGINAL PRUSA by Josef Prusa" in white text.
- Bottom left area shows three small warning/icon symbols (triangle with exclamation mark, triangle with unspecified symbol, and a circular icon) - likely safety/handling icons, and a small QR code sticker.
- The print sheet is mounted on an orange and black printer frame/heatbed assembly, with orange-colored corner clips/brackets visible at the top left, top right, and partially at bottom left of the frame holding the sheet in place.
- Metal threaded rod (leadscrew) visible at top right of image, part of the printer's Z-axis mechanism.
- Black printer body/frame components visible at top edges of the image (left and right sides).

**Purpose of image:** Illustrates the process of cleaning the PEI print sheet with an isopropyl-alcohol-saturated wipe prior to starting the first print, ensuring proper first-layer adhesion.

---

## Page Footer
Page number: **23**

## Page 24

![Page 24](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/24.png)

# Page Transcription (Page 24)

## Photo / Image Description
A close-up color photograph showing the extruder/hotend assembly (toolhead) of a 3D printer positioned above the print bed, actively printing (or having just printed) a flat plastic nameplate/tag on the print bed. The printed object is white plastic with raised orange-colored (or orange-illuminated) text reading "ORIGINAL PRUSA" (partially visible/cut off in frame as "RIGINAL" / "USA" across two lines). 

Visible hardware details in the image:
- Black plastic toolhead housing with a cooling fan (visible fan blades/hub in upper left of housing)
- Metal screws/bolts visible on the housing (silver, hex/Phillips heads)
- A round white/light-colored label or sticker on the side of the toolhead housing (text not legible)
- A smooth metal rod (linear rail/guide shaft) running diagonally in upper right of frame
- A textured black belt (timing belt with fabric-like ribbed texture) running parallel to the metal rod
- The print bed surface is dark gray/black with a grid pattern of white dashed lines (bed calibration/alignment grid) visible beneath and around the printed part

This image illustrates the toolhead hovering just above a first-layer print on the textured/smooth bed surface, used to demonstrate first-layer quality inspection.

## Body Text (verbatim)

Carefully observe the quality of the first layer. The Original Prusa MK4S is equipped with very accurate LoadCell technology, which measures the distance between the nozzle and the bed with perfect accuracy. However, it may happen that **due to, e.g., traces of grease, the print may not hold well.**

## Callout Boxes

### Warning Box (Red, marked with "!" icon in black hexagon)
"If you find that the plastic is peeling off the bed, **stop the print by selecting the Stop print icon on the screen.** Clean the bed and try again."

### Info Box (Orange, marked with "i" icon in black hexagon)
"If the first print fails repeatedly, go to the **First Print Troubleshooting chapter,** where you will find useful tips and tricks."

## Page Number
24

## Notes for Technician Reference
- **Printer model referenced:** Original Prusa MK4S
- **Key technology mentioned:** LoadCell technology — measures nozzle-to-bed distance with high accuracy
- **Common first-layer failure cause cited:** traces of grease on the bed surface
- **Corrective action for peeling plastic:** Use the "Stop print" icon on the printer's screen/display to halt the print, then clean the bed before retrying
- **Escalation path:** If first print fails repeatedly despite cleaning, consult the "First Print Troubleshooting chapter" (referenced but not contained on this page)
- No numeric values (temperatures, speeds, distances, part numbers) are given on this page.
- No tables, schematics, or control panel diagrams appear on this page — only the single explanatory photo and text/callout boxes described above.

## Page 25

![Page 25](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/25.png)

# Page 25 — Manual Section 4.8

## Heading
**4.8. Removing a Printed Object from the Print Sheet**

## Body Text (verbatim)

**Once the print job is finished, wait until the print sheet cools down.** The print plate and heated bed may exceed 100 °C, depending on the settings - contact with unprotected skin can cause burns, so check the heatbed temperature in the footer of the LCD screen!

Depending on the type of material, it may happen that the print will separate from the print sheet automatically by itself after cooling. If not, remove the print plate and carefully bend it on both sides. Then turn it by 90° and repeat the bending. **Be sure to remove all pieces of plastic** - don't forget the priming line next to the print.

## Diagram / Photo Description

The main image shows a photograph demonstrating the object-removal technique:
- Two human hands (forearms visible, no gloves shown) are gripping the flexible spring-steel print sheet from either side.
- The sheet is being flexed/bent in a U-shape (bowed downward in the middle) to pop the print loose.
- A 3D-printed object resembling a rocket engine (labeled with "PRUSA RESEARCH" and "3D64" or similar text on its body, along with cables/tubes molded into the design) stands upright in the center of the sheet, still attached to the print surface.
- The bottom edge of the print sheet shows printed icons/text: warning triangle icons, a "no" circle icon, and the text "ORIGINAL PRUSA M..." (partially visible, sheet branding), along with additional small text ("...nt area") near the bottom left corner of the sheet.
- The image illustrates the correct hand position and bending technique (bend on both sides, then rotate 90° and repeat) referenced in the body text.

This photo answers the question: "How do I physically remove a finished print from the flexible steel sheet?" — by flexing the sheet with both hands to break the print free.

## Callout Boxes

**Warning box (red background, black hexagon "!" icon):**
"If there are plastic remnants on the plate, do not remove them with your nails, you could get injured. Use a plastic spatula to remove the remaining plastic."

**Info box (orange background, black circle "i" icon):**
"Try not to touch the print surface with your fingers - fingerprints are greasy and can reduce adhesion."

## Page Footer
Page number: **25**

## Key Facts / Data Points for Search
- Heatbed/print plate temperature can exceed **100 °C** after a print job — risk of burns.
- Check heatbed temperature via the **footer of the LCD screen**.
- Removal technique: bend the print sheet on both sides, then rotate the sheet **90°** and repeat bending.
- Tool recommended for removing plastic remnants: **plastic spatula** (not fingernails — injury risk).
- Avoid touching the print surface with bare fingers due to **fingerprints reducing adhesion**.
- No specific part numbers, wattages, amperages, or wire-speed values appear on this page.

## Page 26

![Page 26](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/26.png)

# Page 26 — Transcription

## 4.9. Selftest Troubleshooting

**[Note/Info box - green background with icon]**
If you built the printer using the assembly kit, it's possible you missed a step in the walkthrough or you forgot to connect something. No worries, fixing an issue is actually pretty straightforward. Just follow the instructions on the screen.

Body text:

The Selftest identifies all common and even less common issues with your printer with great accuracy. The firmware can recognize whether the fans, heating elements, sensors and other components of the printer do not respond as they should and raises an error when it happens.

If you see a heating-related error during the Selftest, make sure that the print sheet is placed on the heatbed as described in the previous chapters.

If you need to check the connection or disassemble any part of the printer, please follow the link on the error screen or simply visit help.prusa3d.com (hyperlink, shown in orange text) and look for a relevant help article.

---

## 4.10. First Print Troubleshooting

The calibration and pre-print setup of the Original Prusa MK4S are fully automated - the filament is automatically inserted, axes checked and the first layer precisely measured. If a printing issue does occur, it usually falls into one of the following scenarios:

### 4.10.1. LoadCell calibration fails

Solution: This usually happens when you tap the nozzle too briefly or with not enough force. Repeat the calibration and push the nozzle a bit harder.

### 4.10.2. First layer peeling off from the bed

**Solution: The most common cause is grease on the bed or an unsuitable combination of material and print surface (e.g. PLA and textured sheet).**

Make sure that the sheet is sufficiently **degreased using isopropyl alcohol** - more information can be found in the **Regular Maintenance chapter.** In the **Materials chapter,** you can find information on how to properly print specific filament types. Water with a bit of dish soap is also an option if you don't have access to IPA - **make sure to clean and dry the sheet thoroughly to prevent rusting.**

---

**Page number:** 26

---

## Notes on page elements:
- No tables, diagrams, schematics, photos, charts, or control panels are present on this page.
- The only graphical element is a small icon (stylized geometric/diamond shape) at the top of the green info box preceding section 4.9's note.
- Section dividers are represented as horizontal lines above each major heading (4.9, 4.10, 4.10.1, 4.10.2).
- Bold text emphasis is used in section 4.10.2 to highlight key troubleshooting steps and chapter references (Regular Maintenance chapter, Materials chapter, degreased using isopropyl alcohol, and the rust-prevention warning).
- The hyperlink "help.prusa3d.com" is styled in orange/tan colored text, indicating a clickable link in the original digital document.

This page contains no numerical specifications (amperage, voltage, wire-speed, polarity, dimensions) — it is purely troubleshooting guidance text for print quality and self-test/calibration issues on the Original Prusa MK4S 3D printer.

## Page 27

![Page 27](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/27.png)

# Page Transcription (Page 27)

## Section 4.10.3. Nozzle moves too high/low, or extrudes plastic outside the print area

**Solution:** Make sure that the print sheet is properly installed and that nothing is blocking the X/Y/Z axes.

Body text:

If the print sheet is not installed properly (e.g., it's not aligned with the heatbed), it may cause various printing issues. **Make sure that nothing is obstructing the movement of the axes** and that all packaging material and transport fixations have been removed from the printer. Run the Auto Home calibration from the menu to test all three axes.

Another possibility is that the LoadCell sensor is not performing as expected. Make sure the LoadCell sensor cable is properly connected and repeat the LoadCell Test from the Control menu.

### Callout box (green background, pencil/hexagon icon on left):

If you built the printer using the assembly kit, double-check the parts on the X (horizontal) and Z (vertical) axes and compare them with the official assembly manual. It's possible that you might have overlooked a small detail. Make sure the screws securing the motors are tightened correctly.

---

## Section 4.10.4. The nozzle does not start extruding, even after multiple attempts

**Solution:** Make sure that the filament can reach the extruder gear inside the Nextruder and that the nozzle is not clogged.

Body text:

First of all, **load the filament exactly as described in the Loading the Filament chapter.** Once the loading procedure is completed, unlock the idler door on the extruder by lifting the small clamp, then flip the door open and see if the filament strand reached the large extruder gear. If it didn't, it means that something is blocking the movement of the filament. If the filament appears completely loaded (it goes across the extruder gear towards the nozzle), it means the nozzle might be blocked. This won't happen with a new printer, but if you have been using it for a while, it might be a possibility. If you hear the extruder gear clicking during Purging, it may be a sign the nozzle is blocked. Head to the Troubleshooting chapters of this handbook or look for a detailed solution at help.prusa3d.com.

---

## Page Elements Summary

- **Icon:** A small hexagonal icon with a pencil/writing symbol appears to the left of the green callout box, indicating a "note" or "tip" style callout.
- **Hyperlink text:** "help.prusa3d.com" is displayed in orange/underlined style, indicating a clickable web link.
- **Page number:** 27 (bottom right corner, gray text).

### No tables, diagrams, schematics, or control panel images appear on this page — content is entirely textual troubleshooting instructions.

**Key troubleshooting topics covered on this page:**
1. Nozzle height/position problems and plastic extruding outside print area — check print sheet installation, axis obstructions, LoadCell sensor connection/test, and assembly kit build quality (screws on X/Z axis motors).
2. Nozzle failing to extrude — check filament loading procedure, verify filament reaches extruder gear (visible by unlocking idler door/clamp and flipping door open), check for nozzle clogs, and listen for extruder gear clicking during Purging as a clog indicator.

## Page 28

![Page 28](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/28.png)

# Page 28 Transcription

## Photo/Diagram (top of page)

A close-up color photograph of the Original Prusa MK4S extruder assembly, shown mounted on the printer's X-axis carriage. Details visible in the image:

- The extruder body is black plastic, with an orange-colored top component (the extruder motor/gearbox housing) visible in the upper right — labeled with "Original Prusa MK4S" branding printed vertically in orange/white text on the black extruder body.
- A gold/brass-colored heatbreak or heat sink component is visible in the middle of the extruder body.
- Red wiring is visible running from the top orange component down into the extruder body.
- Two black idler/lever parts are circled/highlighted with orange outline ovals — one near the top of the extruder (upper callout) and one near the bottom (lower callout).
- A large white curved double-headed arrow (shaped like an "S" or squiggle) is overlaid on the image between the two circled parts, indicating a rotating or flipping motion — illustrating that these two idler components move/pivot relative to each other (opening/closing motion of the idler door).
- Below/behind the extruder, part of the fan shroud (dark, with a visible round sticker/QR code) and a fan guard grille are visible in the lower right.
- Cables (black, with visible connector, and a striped pink/blue/black wire bundle) are visible near the bottom of the extruder assembly.
- This image visually answers: "Where is the idler mechanism located, and how does it open/close to release tension on the filament?" It corresponds to the note below about loosening the idler.

## Note Box (green background, with hexagonal icon containing a pencil/edit symbol)

"If you built the printer using the assembly kit, it's possible you might have over-tightened the screws on top of the extruder and the idler is so tight, filament won't pass through it. Open the idler on the side of the extruder and double-check that the filament can reach the gear. You can decrease the pressure of the idler by loosening the two screws on top of the Nextruder."

## Section Heading

**4.10.5. After a few hours of printing, the nozzle stops extruding filament**

## Body Text

**Solution:** First, check if the filament isn't tangled. If it's not the case, unload it, wait for the printer to cool down and then remove the hotend from the extruder (see help.prusa3d.com for exact instructions) and check if the steel filament guide isn't deformed. This might happen when you overtighten the thumbscrews. Another possibility is that the nozzle is clogged or blocked. Check the Troubleshooting section of this handbook or look for detailed instructions at help.prusa3d.com.

(Note: "help.prusa3d.com" appears twice as a hyperlink, styled in orange/underlined text.)

## Page Footer

Page number: **28**

## Page 29

![Page 29](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/29.png)

# 4.11. Updating the Firmware

The Original Prusa MK4S is ready to print once assembled and powered on. To make sure you have the most up-to-date version of the firmware with the latest features and settings, we recommend checking prusa3d.com/drivers.

You can perform the firmware update after you complete the initial Selftest.

To check your firmware version, navigate to *LCD Menu - Info - Version info*.

**To update your printer's firmware, follow these instructions:**

1. Download the correct version of the firmware from prusa3d.com/drivers and unzip the file.
2. Copy the .BBF file to a USB drive formatted with FAT32 - you can use the USB drive that comes with your Original Prusa MK4S printer.
3. Insert the USB drive into the printer.
4. Restart the device using the reset button (located under the rotary knob).
5. The update process should begin automatically. Confirm flashing by selecting FLASH and pressing the knob.
6. Wait until the process is completed.

## Diagram / Photo description

The image is split into two side-by-side photos divided by a diagonal orange stripe:

**Left photo:** Close-up of the printer's control panel/LCD unit housing (black plastic enclosure). Visible elements:
- Partial LCD screen at top-left corner showing "...01:54 PM" (partially cut off time display)
- A USB port icon/socket visible on the left side of the panel
- A rotary control knob (large black circular dial) in the center of the panel
- Below the knob, a button labeled "RESET" with a small recessed hole for pressing
- A finger is shown inserting/holding a USB flash drive labeled "PRUSA RESEARCH by JOSEF PRUSA" (orange and black USB stick) into the USB port
- Partial text "...nt" and "...LA" visible on the left edge (cut off labels, likely part of menu text)

**Right photo:** Close-up of the LCD screen display showing a firmware update prompt:
- Screen text: "New firmware version 4.5.0 is available."
- Below that: "Waiting ..." with a horizontal progress/countdown bar (orange/blue segmented bar)
- Timer showing "16 s" (16 seconds countdown)
- Two selectable buttons at bottom of screen: 
  - "FLASH" (highlighted in orange, left button)
  - "SKIP" (blue, right button)
- The printer's front panel is visible around the screen with "PRUSA" branding text running vertically along the side, and "ORIGINAL PRUSA MK4" partially visible

This diagram answers: "Where is the USB port and reset button located on the MK4S control panel for firmware updates?" and "What does the firmware update prompt screen look like, including the FLASH/SKIP options and countdown timer?"

## Info Box (highlighted in orange, with "i" icon)

To force a firmware installation (e.g. if you need to load an older firmware), insert the USB drive containing the desired .BBF file, restart the printer, wait for the logo to show up and press and hold the control button during the system startup until the firmware installation screen appears.

---

Page number: 29

## Page 30

![Page 30](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/30.png)

# Page 30 — Transcription

## 4.12. Sample Models

The USB drive that came with your Original Prusa MK4S 3D printer contains a number of **sample files** (G-codes). We recommend keeping them on the flash drive.

These files have been prepared (sliced) and thoroughly tested by us. **If you encounter issues with print quality at any time, try loading and printing one of the sample files** - especially the Prusa Logo Keychain. These sample files are designed to test the basic functionality of your Original Prusa MK4S.

If your own custom print fails and the sample files are printed correctly, it means there's probably an issue with the way your files are sliced. Try reslicing them again with the default PrusaSlicer settings and check for the basic issues:

- Incorrect printer/nozzle profile (the Original Prusa MK4S is equipped with a 0.4mm nozzle by default)
- Incorrect material settings
- Missing supports
- Incorrectly configured infill
- The model is not in contact with the print sheet

**If the sample files are not printed correctly,** check the Troubleshooting section, our Knowledge Base at help.prusa3d.com or contact our tech support.

---

## 4.13. Factory Reset

If you feel like you changed settings that have negatively affected your 3D printer, you can always revert to factory default values and try again. Factory Reset can be done via *LCD Menu - Settings - System - Factory Reset*. This will reset all the saved values to their default state.

### Diagram: LCD Screen — Factory Reset Confirmation

A photo/screenshot of the printer's LCD touchscreen display showing the "System" menu confirmation dialog for factory reset.

**Labeled elements on screen:**
- **Header bar:** "SYSTEM" (top left), battery/status icon, time display "17:25" (top right)
- **Warning icon:** Orange/red exclamation mark (!) inside a circle, on the left side of the dialog box
- **Warning message text:** "This operation can't be undone, current configuration will be lost! Are you really sure to reset printer to factory defaults?"
- **Buttons at bottom of screen:**
  - **YES** — gray button (left)
  - **NO** — orange button (right)

**What this answers:** This screen shows the exact confirmation prompt a technician will see on the LCD when attempting to perform a Factory Reset via LCD Menu - Settings - System - Factory Reset. It confirms that the action is irreversible and that current configuration values will be lost, requiring the user to select YES to proceed or NO to cancel.

---

Page number: **30**

## Page 31

![Page 31](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/31.png)

# Page Transcription

**Page number:** 31

---

## 5. Advanced User Guide

This part of the handbook covers everything you need to know once you manage to successfully print your first sample object. Network connection, printing your own models, slicing - all this (and more) is covered on the following pages.

---

### 5.1. Prusa Academy Courses

**Become an expert in 3D printing!** Our Prusa Academy offers **comprehensive online courses on various 3D printing-related topics.** Each course features easy-to-read texts with many pictures and short videos, links for inspiration and further study, quizzes for testing your knowledge, a certificate of completion and more! With our online courses, you can quickly learn how to model your own models and master advanced 3D printing techniques. Visit academy.prusa3d.com (shown as a hyperlink) to join!

---

## Diagram / Screenshot Descriptions

### Left panel: Course navigation sidebar screenshot
A screenshot of a course sidebar/table of contents titled:

**"Design Principles for 3D Printed Parts"**

- Progress indicator: **"100% complete"** (orange progress bar, fully filled)
- Numbered/lettered course sections listed with checkmarks (✓) indicating completed items, and a filled orange circle indicating current position:
  1. **Getting started**
  2. **3D printing limitations**
  3. **Applied design** (highlighted orange, appears to be the active/expanded section)
     - 3.1. Vertical holes ✓
     - 3.2. Sacrificial columns ✓
     - 3.3. Sacrificial layers ✓
     - 3.4. Staggered layers ✓
     - 3.5. Fillets and chamfers ✓
     - 3.6. Embedding items mid-print ✓
     - 3.7. Threads ✓
     - 3.8. Print in place mechanisms ✓
     - 3.9. Compliance and living hinges (● orange filled circle — current selected topic, text in orange)
     - 3.10. Splitting model into multiple parts ✓
     - 3.11. Multiple assembled parts ✓
     - 3.12. Integrated part strength ✓
     - 3.13. Quiz: Applied design ✓
  4. **What's next?**
- Below the list: two greyed-out links/icons:
  - "Share your feedback" (speech bubble icon)
  - "Need help?" (question mark icon)

This screenshot illustrates the structure/interface of a Prusa Academy course (specifically the "Design Principles for 3D Printed Parts" course), showing how topics are organized and tracked for completion.

---

### Right panel: "Box with a living hinge" example

**Heading:** Box with a living hinge

**Body text:**
"The design process is extremely easy, simply extrude a rectangular shape connecting your two objects and extrude it to the desired height."

**Screenshot description:** A CAD/slicer software screenshot (appears to be a 3D modeling program, possibly Fusion 360 or similar) showing two rectangular tray/box-like shapes (a base and a lid) connected in the middle by a thin blue rectangular strip representing the living hinge. The software interface shows a toolbar at the top with icons, a tree/hierarchy panel on the left side, and property/parameter panels on the right side (small text, not legible in detail). A small blue circular/gear icon is shown at the hinge connection point in the 3D view. A second smaller toolbar strip is shown directly below the main viewport screenshot.

**Body text continued:**
"Since the square will connect both the base and the lid, you need to make sure you have enough distance to allow the **hinge to flex without breaking or additional bending stress.** The total height of the box once closed, in this case, is **16mm** from base to surface:"

**Photo description:** A close-up photograph of a real 3D-printed box corner, printed in an orange/yellow gradient color filament. The image shows the corner edge of a closed box with visible layer lines, viewed from an angle emphasizing the height and corner seam.

**Caption below photo:** "Closed box with a height of 16 mm"

---

## Key Data Points on This Page
- Course completion indicator: 100%
- Box closed height (hinge example): **16 mm** (base to surface)
- Website reference: **academy.prusa3d.com**

No tables, wiring diagrams, amperage/voltage specifications, or control panel schematics appear on this page — content is instructional/software-guide in nature, focused on the Prusa Academy online course platform and a living hinge design example.

## Page 32

![Page 32](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/32.png)

# Page 32 — Section 5.2 Network Connection

## Heading
**5.2. Network Connection**

## Body Text

Original Prusa MK4S has an onboard Ethernet (RJ45) interface and a Wi-Fi module for connecting to the network. **Please be aware that some of the network functions may not be fully implemented in the shipped firmware version.** Please check our website prusa3d.com and social media for information on the latest firmware versions.

Original Prusa MK4S can be connected to a local network (LAN/Wi-Fi), which allows you to have an overview of various functions of the printer through the web interface called Prusa Connect. The printer has DHCP enabled by default. If you need to check if the printer was assigned an IP address correctly, you can check it in *LCD Menu - Settings - Network*.

## Diagrams / LCD Screens

Two LCD screenshots are shown side by side, both titled "NETWORK SETUP" at the top with a small camera/lock icon on the left and a time readout on the right (left screen shows "11:03", right screen shows "--:--").

**Left screen — "Credentials via NFC" instructions panel:**
- Title: **Credentials via NFC**
- Numbered instructions:
  1. Open Prusa app on your mobile device.
  2. Go to in-app Menu and select "Set up Printer Wi-Fi."
  3. Follow on-screen instructions.
- Single button at bottom, orange, labeled: **CANCEL**

**Right screen — NFC/QR confirmation prompt:**
- Text: "Do you want to connect to the Wi-Fi with the Prusa app on your phone using NFC?"
- A QR code graphic is shown on the right side, with a small NFC/phone icon to its left.
- Below the QR code: **prusa.io/app**
- Two buttons at bottom: orange **YES** button and gray **NO** button.

These screens answer the question: "How do I set up Wi-Fi credentials on the MK4S using NFC and the Prusa mobile app?" — the printer displays a QR code (linking to prusa.io/app) and prompts confirmation before receiving credentials via NFC tap.

## Body Text (continued)

You have four options of how to connect to the wireless network:

### Entering credentials using the touchscreen
You can manually enter the Wi-Fi SSID and password via the touchscreen. Due to the limited space on the screen, the touch keyboard has a layout well-known from phones with hardware keyboards. Each button is assigned a certain number of characters. You select each character by pressing the button a certain number of times.

### Network scan
Similar to entering all your credentials via the touchscreen, except here you can select the Wi-Fi SSID from the list of detected wireless networks and then use the touchscreen to enter just the password.

### NFC & Prusa Connect mobile application
If you have a mobile device with NFC and the Prusa app installed, you can enter your Wi-Fi credentials into the application and share them with the printer by holding your phone up to the NFC sensor.

## Page Footer
Page number: **32**

## Notes
- No table present on this page.
- Fourth connection option (of the "four options" mentioned) is not fully listed within the visible text on this page — only three are described (Entering credentials using the touchscreen, Network scan, NFC & Prusa Connect mobile application); the fourth option may continue on the next page.

## Page 33

![Page 33](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/33.png)

# Page 33 Transcription

## Heading
**Setup file with network credentials**

## Body Text
To connect the printer to a wireless network, via the **credentials file** please navigate to the *Network* menu and select *Wi-Fi* and look for the *Load credentials from a file* menu option.

## Numbered Steps
1. Start PrusaSlicer 2.8.0 or newer.
2. Insert a USB drive into your computer.
3. In PrusaSlicer, navigate to: *Menu - Configuration - Wi-fi configuration file.*
4. Enter login credentials for your Wi-Fi.
5. Select "Write" and save the file to the USB drive.
6. Save the file.
7. Insert the USB drive into your printer and choose Load Credentials from File in the printer's menu.
8. You should be connected to Wi-Fi in a couple of seconds.

## Follow-up Body Text
Subsequently, on a computer or mobile phone connected to the local network, open a web browser and go to connect.prusa3d.com (hyperlinked/orange text) and log in with your Prusa Account. You will be taken to Connect, our web UI for remote printer management.

## Diagrams / Images

**Two QR codes side-by-side, each linked to an app store badge below it:**

- **Left QR code:** Positioned above an "App Store" badge (Apple logo + text "App Store" in rounded rectangle outline). This QR code links to the iOS/Apple App Store listing (presumably for the Prusa Connect or PrusaSlicer companion app).
- **Right QR code:** Positioned above a "Google Play" badge (colorful triangle play button logo + text "Google Play" in rounded rectangle outline). This QR code links to the Google Play Store listing (Android version of the same app).

Both QR codes are distinct pixelated black-and-white square patterns (standard QR code format) — no visible text labels other than the app store badges beneath them. The page does not provide the literal URL encoded in the QR codes beyond directing to the respective app stores.

*Question these answer:* "How do I get the mobile app for Prusa Connect/printer management on iPhone vs Android?" — scan left QR (or visit App Store) for iOS, scan right QR (or visit Google Play) for Android.

## Info Callout Box (orange background, with "i" info icon in black hexagon)
For more information about connecting to Wi-Fi networks and activating Prusa Connect online features, please check our website **help.prusa3d.com** (bold/underlined).

## Page Footer
Page number: **33**

## Page 34

![Page 34](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/34.png)

# Page 34 — Transcription

## 5.3. Touch Control
With the touch option enabled, you can control most items on the screen. You can also swipe up and down through the menus, and swipe left or right (depending on your preference) to go back one step in the menu hierarchy. There are exceptions in which it is necessary to use a knob to control the screen, such as manually setting the target temperature or moving the axes. You can enable touch control in Settings -> User Interface -> Touch.

If you have problems with touch, enable the Touch Sig Workaround option in Settings -> User Interface -> Touch Sig Workaround.

## 5.4. Cancel Object
When printing multiple objects at once, any of them may become detached from the heatbed or fail to print for other reasons. In this case, you can select "Tune menu -> Cancel Object" to skip printing the selected object. The rest of the objects will continue printing unchanged, saving you a lot of potentially wasted filament.

If you are unsure which object to select (for example, you have individual instances-copies instead of names), you can wait for the nozzle to move to the failed object and then select the Cancel Current Object option. If you have selected an incorrect object to skip, you can use the menu actions to resume printing it.

## 5.5. Stealth Mode
With Stealth Mode enabled, the firmware limits the acceleration, feedrate, and jerk values, resulting in reduced printer noise. Due to these limits, the overall printing time is slightly increased. You can switch between Normal and Stealth Mode anytime, even during printing. After enabling, Stealth Mode will be activated once several G-code commands in the buffer (printer memory) are processed. You can enable the Stealth Mode option in Settings -> Stealth Mode.

## 5.6. Input Shaper and Pressure Advance
The Original Prusa MK4S utilizes Input Shaper and Pressure Advance features, allowing it to print faster and with better quality, reducing ringing, overshoots, and issues with inconsistent filament extrusion.

Input Shaper analyzes the printer's movements and applies a filter to the input signals, leading to canceling resonance vibrations and reducing ringing (ghosting). Thanks to faster travel speed and acceleration, it enables faster printing and minimizes stringing.

Pressure Advance aims to improve the quality of printed parts by compensating for the pressure changes in the nozzle during printing.

---

**Page number:** 34

**Notes on page layout:** No tables, diagrams, schematics, photos, charts, or control panel images are present on this page. The page consists solely of four text sections (5.3–5.6), each with a heading and body paragraphs, separated by horizontal divider lines. No numeric settings, amperage/voltage values, part numbers, or wiring/polarity information appear on this page.

## Page 35

![Page 35](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/35.png)

# Page Transcription

**Section Heading:** 5.7. Using Nozzles with Various Diameters

## Body Text

The Original Prusa MK4S comes equipped with a **0.4mm nozzle** by default. This nozzle offers a good quality-speed ratio. However, for some projects, a nozzle of a different diameter might be more suitable.

The Original Prusa MK4S uses **special nozzles with a metal filament guide,** making them easy to swap and highly reliable. We offer a wide range of nozzles of various diameters on our e-shop, ranging from 0.25mm to 0.8mm nozzles. You can set the diameter of your nozzle from 0.25mm to 1.0mm in increments of 0.05mm in Menu -> Settings -> Hardware -> Nozzle Diameter.

To give you even more options for your 3D printing projects, we developed a **Nextruder to V6 nozzle adapter.** When you install it, you can easily use any type of V6-compatible nozzles, including high-flow models. More information on alternative nozzles and their installation can be found at prusa3d.com and help.prusa3d.com.

(Note: "prusa3d.com" and "help.prusa3d.com" are shown as hyperlinks, colored orange/underlined in the original text.)

## Photo/Image Description

The image shows a close-up photograph of two disassembled nozzle assemblies laid on a dark, speckled granite-like surface (appears to be a printer's textured steel sheet/bed with "ORIGINAL P..." text visible in white lettering at the bottom of the photo, partially cut off, likely "ORIGINAL PRUSA" branding, with the Prusa logo icon visible to the left of the text).

**Components visible in the photo:**
- **Left assembly (fully assembled/attached):** A brass heater block/nozzle with visible threading (metal filament guide coil pattern), connected to a silver/steel heatbreak tube that extends upward and to a copper-colored section, leading to a longer steel shaft (likely the heatbreak/throat assembly going up toward the hotend).
- **Right assembly (partially disassembled):** A separate silver steel tube/heatbreak assembly lying to the right, disconnected from its nozzle.
- **Bottom center-left:** A small separate brass nozzle tip (unscrewed), showing the exterior threading and the coiled metal filament guide structure, sitting loose on the surface.
- **Bottom center-right:** Another small copper/brass fitting (possibly a nozzle or coupling nut) lying loose near the disconnected heatbreak tube.

**Purpose of image:** Illustrates the physical appearance of the interchangeable nozzle system with the metal filament guide (coiled brass structure) that is characteristic of the MK4S nozzle design, showing how nozzles can be swapped by unscrewing them from the heatbreak/heater block assembly.

## Page Footer

Page number: **35**

## Page 36

![Page 36](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/36.png)

# Page Transcription (Page 36)

## 5.8. Multi-Material Upgrade 3

The MK4S is fully compatible with the latest generation of our **Multi-Material Upgrade 3 add-on,** or MMU3 for short. The MMU3 vastly expands your 3D printing possibilities by giving you the option to **print with up to 5 colors at the same time.** However, you can also mix different materials, e.g. standard filaments (PLA) with **water-soluble filaments.**

The MMU3 has been reworked from the ground up, offering a high level of reliability, improved controls and expanded firmware capabilities.

You can learn more about the MMU3 at prusa3d.com! *(hyperlink, shown in orange text)*

---

## 5.9. Original Prusa Enclosure

The Enclosure is an optional accessory that encloses your 3D printer and provides a stable printing environment with increased temperatures. This makes printing from advanced materials, such as PCCF, Nylon, PP, ASA, and many others, easier as it eliminates drafts and prevents the warping of printed objects. The Enclosure also lowers printer noise and covers every moving part of your printer, increasing its safety.

The Enclosure can be equipped with various optional add-ons, such as the Advanced Filtration System or a mechanical lock, which prevents unauthorized access to your 3D printer - an ideal solution for schools, hackerspaces, and other public places. You can also install an LED Strip to illuminate the print area and a fire suppression system.

The Original Prusa Enclosure is available in our e-shop.

---

**Page number:** 36

---

## Notes on Page Content

- **No tables** are present on this page.
- **No diagrams, schematics, photos, charts, or control panels** are present on this page — the page consists solely of two body text sections (5.8 and 5.9) with headings.
- **No numerical specifications, amperage/voltage/wire-speed values, polarity, or part numbers** appear on this page.
- The only hyperlink/reference on the page is **prusa3d.com** (styled in orange, indicating a clickable link in the digital document), referenced for more information on the MMU3.
- Materials mentioned as compatible with the Enclosure: **PCCF, Nylon, PP, ASA** (and unspecified "others").
- Optional add-ons mentioned for the Enclosure: **Advanced Filtration System, mechanical lock, LED Strip, fire suppression system.**
- Both section headings (5.8 and 5.9) are set off with a horizontal rule/line above them.

## Page 37

![Page 37](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/37.png)

# Page Transcription

## Heading
**5.10. Flashing an Unofficial (Unsigned) Firmware:**

## Body Text (verbatim)

**We take security seriously.** Before each firmware update, we rigorously test it to ensure that all of its security features are working correctly. **If any of the sensors detect an unexpected reading, the heater will be immediately disconnected to prevent any damage to the printer or its surroundings.** We cannot guarantee the same level of security with unofficial (community) firmware.

**Official firmware is signed with a private key and the printer verifies the key before updating.**

To flash your own (or unofficial) firmware to the printer, **you must first break the seal on the mainboard** and place a jumper in the correct position. **Doing this voids the electronics warranty.** To break the seal, you must open the electronics box and locate a safety fuse. Then, take a small flathead screwdriver or very thin sharp pliers and break off the thin middle part of the fuse. **Before attempting this procedure, carefully review the photo in this chapter!**

Breaking the seal is **irreversible** and is recommended only for very experienced users.

## Warning Box (red, with "!" hexagon icon)
"Breaking the seal on the mainboard of the Prusa MK4S is IRREVERSIBLE and leads to the VOIDING OF THE WARRANTY ON ELECTRONIC PARTS OF THE PRINTER. If you break the seal, we disclaim any responsibility for any damage to the printer and/or its surroundings (e.g. in case of a fire)."

## Photo/Diagram Description

The image shows a close-up photograph of the **Prusa XBuddy mainboard** (labeled "PRUSA XBuddy rev 0.2.7 2021" printed in orange on the PCB, visible along the right edge running vertically), installed inside the printer's electronics box (partially visible black plastic housing on the left side).

**Key labeled/visible elements on the board:**
- Axis labels in orange: **X**, **Y**, **Z** (top area of board, corresponding to stepper driver sections)
- Various SMD components labeled with reference designators (e.g., R220, C44, C58, C50, C127, C120, C123, C116, C113, R221, C30, C27, R05, etc.) — standard resistor/capacitor markings
- Two large cylindrical capacitors near center, each printed with "35V 100µF" (appears twice, silver-topped electrolytic capacitors)
- A third similar cylindrical capacitor to the right, marked "10V" and "100µF" style markings
- Labels near buttons: **"STL INC"** (pin header, right side), **"DFU BOOT"** (small text near two small tactile buttons, right-center of board)
- An IC chip in the lower right marked with **ST** logo, labeled **"ARM"**, part number visible as **STM32F72Zxx** (partially legible), described as the ARM microcontroller
- Connector labeled **"A_TEMP"** (lower left area, small white connector)
- Connector labeled **"USB"** (lower left, black connector)
- Ribbon cable connector (white, flat) visible entering from lower left, connecting to the board
- Red and black wires (power wires) exiting the bottom of the board toward the lower left
- Metal screws (silver, threaded standoffs) visible on the black housing at lower left

**Orange circle callout (large, drawn on photo):** Highlights the critical seal/fuse location at the center of the board, showing a **screwdriver tip inserted into a small component** — this is the **safety fuse** that must be broken to remove the mainboard seal. The circled area shows the screwdriver prying at a small black component between two of the large capacitors, near a white connector and a black circular hole/marking on the PCB (silkscreen circle, likely indicating the seal/fuse location).

**Purpose of this diagram:** This photo answers the question "where exactly on the Prusa MK4S XBuddy mainboard is the safety fuse/seal that must be broken to enable unsigned firmware flashing, and how should the tool (screwdriver/pliers) be positioned to break it." The orange circle explicitly marks the fuse location and demonstrates correct screwdriver placement/angle for breaking the thin middle part of the fuse.

## Page Footer
Page number: **37**

## Page 38

![Page 38](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/38.png)

# Page 38

## 6. Printing Your Own Models

Your Original Prusa MK4S should be now fully calibrated and the first print was a success. And now, you want to print your own model - be it something you already modeled, or something you downloaded from the internet.

Here's a little catch: **it's not possible to print models downloaded from the internet directly.** Before you can print a model, you need to prepare it for the printer - we call this process "slicing". Generally speaking, you need to tell the printer what should be inside the printed object (infill), how detailed the model should be and a couple of other things. Plus, you need to keep in mind several things like the stability or durability of the print.

We'll go through the process with you. We'll introduce our own slicing software PrusaSlicer and tell you the basics about slicing.

---

### Boxed callout: "To summarize:"

- Find a suitable 3D object for printing and download it (usually in .stl or .obj format)
- Import the object into PrusaSlicer - www.prusaslicer.com (hyperlink, shown in orange/underlined text)
- Select the nozzle diameter (default is 0.4mm) and layer height
- Use the built-in tools to scale, move and rotate the object. Find the optimal orientation:
  - Large flat base
  - Minimal overhang angles to reduce the number of supports required for printing
  - If supports are necessary, try to rotate the object so that the supports are not in direct contact with areas that need to have top print quality (e.g., the face of a statue)
- Select the infill type and density
- Slice the object
- Inspect the preview
- Export the G-code and print it

---

**Notes on page layout/design elements:**
- Page has an orange horizontal rule/line at the top above the heading.
- Section heading "6. Printing Your Own Models" is in bold orange text.
- The summary checklist is contained within a bordered rectangular box, with "To summarize:" as a bold italic-style subheading.
- Bullet points use solid circular bullets (●) for main items and hollow circular bullets (○) for sub-items (indented).
- Page number "38" appears at bottom left in gray text.

**No tables, diagrams, schematics, photos, charts, or control panel images appear on this page.** This page is purely textual/instructional content introducing the concept of slicing and the PrusaSlicer software workflow.

## Page 39

![Page 39](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/39.png)

# Page Transcription

**Page number (bottom right):** 39

---

## Heading
**6.1. Obtaining Printable Models**

## Body Text

The easiest way to start with 3D printing is to **download models from the internet** - they are usually in .3mf, .stl or .obj formats. Luckily, there are many enthusiasts in the 3D printing world, so **a large number of 3D models are available for free.** You can download anything from a simple die to detailed figures from your favorite games, movies, and series; mechanical parts, RC accessories, various household items, and even massive complex projects.

---

## Boxed Callout Section

**Sub-heading:** Get the best models at Printables.com!

**Paragraph 1:**
**One of the best places** for free 3D models is [Printables.com] (hyperlink, shown in orange text), a large online library **full of high-quality 3D models** managed by Prusa Research. Its main goal is to bring together a large community of designers, creators, and 3D printing enthusiasts - regardless of the brand of 3D printer they prefer. There are **regular community contests with 3D printers and filaments as main prizes,** and there is also a rewards system with virtual and physical goods - simply by being an active member, you can collect points and exchange them for a spool of Prusament or other cool stuff.

**Paragraph 2:**
Thanks to its focus on high-quality, unique, and useful 3D models, you are only a few clicks away from discovering something new and amazing to print. And before you actually download and print something, you can use the advanced built-in 3D model viewer, which works with STL and 3MF files as well as G-codes. Visit [Printables.com] (hyperlink, shown in orange text) and discover all kinds of activities, contests, events, groups, collections, and more!

---

## Screenshot / Website Diagram Description

The image is a screenshot of the **Printables.com** website homepage, illustrating what the site looks like and what a user would see when visiting it.

**Top Navigation Bar (left to right):**
- Printables (logo, red icon)
- 3D Models
- Community
- Contests
- Brands
- Events
- Groups
- Education
- Prusa Blog
- Prusa Eshop
- (+ Create) button (top right corner)

**Main Banner/Hero Image:**
- Shows a yellow model airplane (appears to be a Piper Cub-style RC/3D printed model) against a black background.
- Text overlay on banner: "Make it fly!"
- Sub-text: "Join our flying contest / Ends Friday, March 31st, 23:59 GMT"
- Orange button: "CONTEST PAGE"
- Small pagination dots below banner indicating multiple carousel slides.

**Featured Models Section:**
Heading: "Featured Models"

Four featured model cards displayed in a row, each with a thumbnail image, creator username/icon, model title, category tags, and engagement icons (likes/heart, comments, downloads, bookmark):

1. **Model:** Rodney McKay
   - Creator: Wekster (with verified/icon badge)
   - Category tags: Toys & Games · Action Figures & Statues
   - Thumbnail: A small figurine model with a helmet and blue accents, shown on a workbench/outdoor background.
   - Icons: heart/like count, comment count, download count, bookmark icon (numbers too small to read precisely)

2. **Model:** Portal Button Keycap
   - Creator: Péter Belsuár (with badge icon)
   - Category tags: Gadgets · Computer
   - Thumbnail: A red circular button/keycap object.
   - Icons: heart/like count, comment count, download count, bookmark icon

3. **Model:** OHC V60 Ultramax Engine
   - Creator: Bootjevaardere (with badge icon)
   - Category tags: Hobby & Makers · Automotive
   - Thumbnail: A detailed blue and gold mechanical engine model.
   - Icons: heart/like count, comment count, download count, bookmark icon

4. **Model:** Project Killswitch - Universal Mount
   - Creator: dbrand (with badge icon)
   - Category tags: Gadgets · Video Games
   - Thumbnail: A gray/white plastic mount/case object with an orange accent piece.
   - Icons: heart/like count, comment count, download count, bookmark icon

**Bottom of screenshot:**
- Orange button: "EXPLORE MODELS"

---

## Notes on Question-Answering Relevance
This page answers questions such as:
- "Where can I download free 3D printable models?" → Answer: Printables.com (managed by Prusa Research)
- "What file formats are supported for 3D models?" → .3mf, .stl, .obj (for download); STL, 3MF, and G-code files supported in the built-in viewer
- "Does Printables.com have a rewards or contest system?" → Yes, community contests with 3D printers/filaments as prizes, and a points-based rewards system redeemable for Prusament filament or other goods
- "What can I do on Printables.com besides download models?" → Participate in contests, events, groups, collections, education content, and browse the Prusa Blog/Eshop.

No specific technical settings, part numbers, amperage/voltage, wire-speed values, or polarity information appear on this page — this page is informational/marketing content about sourcing 3D printable models, not a technical/electrical specification page.

## Page 40

![Page 40](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/40.png)

# Page 40 — Transcription

## Body Text (top section, continuation)

Models are usually available to download either for free under the Creative Commons - Attribution - Non-Commercial License (models cannot be used commercially and must always include the author's name), or for a small fee. We have selected the most interesting websites for you:

- www.printables.com
- www.thingiverse.com
- www.myminifactory.com
- www.gambody.com

## Callout Box (Warning/Alert — red box with exclamation mark icon)

**Icon:** Black hexagon/octagon shape with a white exclamation mark "!" inside, on a red background — indicates a warning/important note callout.

**Text (verbatim):**
"Keep in mind that models in .stl, .obj, etc. formats cannot be printed directly. First, these files need to be "sliced" (prepared for printing), which results in a G-code file. This file contains the actual instructions for the printer. You place the G-code on a USB disk and then insert it into the printer. Then you just start printing. You will find out more in chapters What is a G-code file? and PrusaSlicer."

---

## Section 6.2. Create Your Own Model

**Subheading (bold):** To create your own 3D model, you need a special program - a 3D editor.

**Body text:**

There is a wide range of different programs available, so you can choose the one that best meets your needs. To get started, the best option is Tinkercad (www.tinkercad.com) - an online editor which runs in your browser window, with no installation required. It is free, intuitive and there are a lot of tutorials available online. Tinkercad is mainly focused on the creation of less detailed and larger (mechanical) parts, ideal for FFF/FDM printing. Your MK4S will have no problems printing them.

Another popular tool is Autodesk Fusion 360 (www.autodesk.com/products/fusion-360) for PC, Mac and iPad. On the web, there is a simple guide available along with a lot of detailed video tutorials, making it an ideal choice for both beginners and professionals. Check out our Prusa Academy for some great beginner tutorials at prusa3d.com/category/prusa-academy!

---

## Section 6.3. What is a G-code File?

**Bold intro sentence:** 3D models you have either created or downloaded from the internet need to be converted from their original format (.stl, .obj, .3mf, etc.) into a file containing specific instructions for the printer - the G-code.

**Continuing body text:**

This is the format that 3D printers can understand. This file contains instructions about the movement of the nozzle, the amount of filament to be extruded, temperature settings, fan speeds and more. There are dozens of different slicers available, each with its own advantages and disadvantages. We suggest using our PrusaSlicer.

---

## Page Footer

Page number: **40**

---

## Notes on Links/URLs (all appear as orange/hyperlink-style text in the original)

- www.printables.com
- www.thingiverse.com
- www.myminifactory.com
- www.gambody.com
- www.tinkercad.com
- www.autodesk.com/products/fusion-360
- prusa3d.com/category/prusa-academy

## Layout/Formatting Notes

- Two horizontal divider lines separate the three sections (before 6.2 and before 6.3).
- Section headings "6.2. Create Your Own Model" and "6.3. What is a G-code File?" are styled in a larger, distinct font (heading style).
- Bullet list uses solid round bullet points (●).
- No tables, diagrams, schematics, or photos appear on this page — content is entirely text-based with one colored callout box.

## Page 41

![Page 41](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/41.png)

# Page 41 — Transcription

## 6.4. PrusaSlicer

As the name suggests, PrusaSlicer (prusaslicer.com) is our own in-house developed slicer software based on the open-source project Slic3r. **PrusaSlicer is an open-source, feature-rich, frequently updated tool** that contains everything you need to export the perfect print files for (not only) your Original Prusa MK4S. The standout features of PrusaSlicer are:

- Clean and simple UI
- Fine-tuned print and material profiles with automatic updates
- Precise print time/feature analysis
- Customizable supports and modifiers
- Built-in shape gallery
- Variable layer height
- Color painting
- Various print settings

**Thanks to the strong community and a dedicated team of developers** in Prusa Research, PrusaSlicer is **constantly evolving** with new features and improvements based on community feedback.

From print quality improvements to reducing print time and minimizing filament usage, even small updates can have a significant impact on your 3D printing experience. Best of all, **PrusaSlicer is completely free for everyone** (it even includes profiles for 3rd party printers) and is frequently considered the best slicer on the market by independent reviewers.

PrusaSlicer comes with a G-code Viewer, a lightweight application, which you can use to quickly preview G-codes from all popular slicers. Its behavior is identical to the preview in PrusaSlicer (the same code is used), however, you can load an external G-code file.

We currently parse, and up to some level interpret, G-code from PrusaSlicer, Slic3r, Slic3r PE, CURA, ideaMaker, Simplify3D, Craftware and KISSSlicer. PrusaSlicer G-code Viewer is part of the PrusaSlicer installer package. Simply download the latest PrusaSlicer and the standalone G-code Viewer will install together with it automatically.

---

### Callout Box (orange, with "i" info icon in a black hexagon)

**Download PrusaSlicer now!**

The latest stable version is always available at **prusaslicer.com**. Development alpha/beta versions can be downloaded from **github.com/prusa3d/PrusaSlicer** - these are unstable builds with the latest features.

---

Page number: 41

## Notes on page content
- No tables, diagrams, schematics, photos, or control panel images are present on this page.
- Two hyperlinked/underlined references appear: "prusaslicer.com" (top of page, orange text) and "prusaslicer.com" / "github.com/prusa3d/PrusaSlicer" (bold, underlined, in the orange callout box).
- The only graphical element is a black hexagon containing a white lowercase "i" (info icon) to the left of the orange callout box heading "Download PrusaSlicer now!"
- List of PrusaSlicer software features is presented as a bulleted list (8 items, transcribed verbatim above).
- Slicers with G-code compatibility mentioned by name: PrusaSlicer, Slic3r, Slic3r PE, CURA, ideaMaker, Simplify3D, Craftware, KISSSlicer.

## Page 42

![Page 42](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/42.png)

# Page 42 — Section 6.5. PrusaSlicer Interface Explained

## Heading
**6.5. PrusaSlicer Interface Explained**

## Description of Screenshot / Diagram

The page shows a screenshot of the **PrusaSlicer software interface**, with 14 numbered orange circular callouts (1–14) pointing to different areas of the application window. The main viewport shows a 3D model preview: a green 3D-printed figure/object (appears to be a character/robot-like model with a blue element on top) sitting on a print bed labeled "PRUSA MK3S" (build plate), with a red flag-like object also visible on the plate. A white context menu/dropdown list is open in the middle of the screen (overlapping the model), triggered by right-clicking the model (see callout 11).

Layout of callouts on the screenshot:
- **Callout 1**: Top toolbar, left area — top menu/tab region.
- **Callouts 2 & 3**: Top toolbar, icons next to each other (Add / Delete buttons area).
- **Callout 4**: Top right area — mode switch (Simple/Advanced/Expert tabs).
- **Callout 5**: Right sidebar, upper section — Print settings row.
- **Callout 6**: Right sidebar — Filament/Material settings row.
- **Callout 7**: Right sidebar — Printer settings row.
- **Callout 8**: Right sidebar — quick settings icons (Infill, Supports, Brim).
- **Callout 9**: Right sidebar, lower section — object manipulation panel showing size/coordinate fields and info box (model size / print time / weight, populated after slicing).
- **Callout 10**: Bottom right — large button area (Slice/Export button).
- **Callout 11**: Center of viewport — pointing to the open white context menu (right-click menu) over the model.
- **Callout 12**: Center of viewport — pointing to the 3D model itself (the green figure) on the print bed.
- **Callout 13**: Bottom left of viewport — two icons for switching between 3D editor view and Preview mode.
- **Callout 14**: Left side toolbar (vertical) — icon stack for object manipulation tools (Move, Scale, Rotate, Cut/Place on face, Paint-on Supports, Seam Painting, etc.), shown as a vertical row of icons along the left edge of the 3D viewport.

## Numbered Legend (verbatim)

1. Opens detailed Print, Filament and Printer settings
2. The Add button is used to import a 3D model into the scene
3. The Delete and Delete All buttons remove the model(s) from PrusaSlicer
4. Switching between Simple, Advanced and Expert modes
5. Settings for printing speed and quality
6. Material selection
7. Printer selection
8. Quick settings for Infill density, Supports and Brim
9. Information about model size / printing time (after slicing)
10. Slice / Export button
11. Right-click the model to open a context menu
12. Model preview in 3D
13. Switch between 3D editor and Preview mode
14. Move, Scale, Rotate, Cut, Paint-on Supports, Seam Painting tools

## Footer
Page number: **42**

## What this page answers
- Identifies the function of each major UI region/button in PrusaSlicer's main window.
- Explains where to import (Add) or remove (Delete/Delete All) 3D models.
- Explains where to switch interface complexity (Simple/Advanced/Expert mode).
- Shows where print speed/quality settings, material selection, and printer selection are located.
- Shows where quick settings (Infill, Supports, Brim) are found.
- Explains where model size and estimated printing time info appears (post-slicing).
- Identifies the Slice/Export button location.
- Explains how to bring up a right-click context menu on the model.
- Identifies the toggle between 3D Editor and Preview modes.
- Lists the left-side toolbar tools available for manipulating the model (Move, Scale, Rotate, Cut, Paint-on Supports, Seam Painting).

## Page 43

![Page 43](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/43.png)

# Page 43 Transcription

## Heading
**6.5.1. Initial Setup and General Workflow**

## Body Text

Upon launching PrusaSlicer, select Original Prusa MK4S from the Printer drop-down menu on the right (No. 6 in the PrusaSlicer overview on the previous page). If you don't see the Original Prusa MK4S in the list, **you need to add it either by using Add Printer-Add Presets menu item** (in the same menu), **or by using Configuration - Configuration Wizard** from the top menu bar.

Then select the layer height, infill and the material you intend to use. **If you are not sure about the layer height, stick with 0.15mm profiles as they give generally good results.**

**Recommended infill values are between 5-20 %** but it heavily depends on the model and how durable it needs to be. More infill means a more durable model, however, it will take longer to print and more material will be consumed. For general use, there is no point in going above 40% infill, unless your project really requires it.

## Diagram: Print Settings Dropdown Menu

Description: A screenshot of the PrusaSlicer "Print settings" dropdown control, showing a selection box with a gear/lock icon combo, currently displaying "0.15mm STRUCTURAL" as the selected profile. Below it, an expanded dropdown list appears under the heading "System presets" listing selectable print profiles, each preceded by a gear icon and a lock icon:

- 0.10mm FAST DETAIL
- 0.15mm SPEED
- 0.15mm STRUCTURAL *(highlighted/selected, shown in gray)*
- 0.20mm SPEED
- 0.20mm STRUCTURAL
- 0.25mm SPEED
- 0.25mm STRUCTURAL
- 0.28mm DRAFT

This diagram answers: "Which layer-height/print-profile options are available in PrusaSlicer, and which one is currently selected (0.15mm STRUCTURAL)?"

## Info Callout Box (orange, with "i" icon in black hexagon)

**Please note that the default profiles have a tested specific setting for each type of filament. If you choose a different profile, it may affect the print quality negatively.**

## Body Text (continued)

**PrusaSlicer allows you to import objects in STL, OBJ, AMF, STEP and 3MF formats** - these are the most common types of 3D files you can find on the internet.

You can either drag them directly into the 3D editor window or use the Add... button from the top bar. **To modify the model, use the tools on the left sidebar, i.e. Move, Scale and Rotate.** If an object is blue, it means it does not fit into the print bed and it needs to be moved or scaled down.

There is no universal way to place the model on the bed, it always depends on the specific shape. However, a general rule is that the bigger the flat surface of the model that touches the bed, the better it will hold - so try to **position the largest flat surface of the model downwards.** You can use the Place on Face (F key) function to do it quickly.

## Page Number
43

## Page 44

![Page 44](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/44.png)

# Page 44 — Transcription

## Heading
**6.5.2. Using Supports**

## Info Box (orange, with (i) icon)
"Supports are printed structures resembling scaffolding. They are used for printing complex objects. After printing, they can be easily separated from the output."

## Body Text

You can find a large number of objects that can be printed without supports - just place them in the right orientation on the bed, slice them and you can print. **Not all objects, however, can be printed without supports.**

If you are printing an object with walls that rise at an angle less than 45°, these overhangs will cause issues with print quality. **Also, keep in mind that the printer cannot start printing mid-air.** In such cases, supports are necessary.

## Diagram Description

A screenshot from PrusaSlicer software showing a 3D render of a bust of Nefertiti (the Egyptian queen) placed on a print bed (dark gray grid surface).

- The model is oriented with the neck/base facing down.
- Two vertical green columns are visible beneath the bust — these represent generated **support structures** (support columns) holding up the overhanging neck/chin area of the model.
- The main body of the bust is rendered in **orange/copper color** (representing the actual object/print material).
- The supports are rendered in **green** (distinguishing them from the printed object material).
- A coordinate axis indicator (red/green/blue arrows, representing X/Y/Z axes) is shown at the lower left of the model on the print bed.
- Two small icons are in the bottom-left corner of the viewport (likely view/display toggle icons — a cube icon and a layered/stacked icon).

### Left-side Info Panel (small text, partially legible)
A small data table/legend is shown in the upper-left of the viewport with columns for print statistics, listing categories with colored swatches, likely including (based on typical PrusaSlicer legend items):
- Perimeter (times/percentage/used filament)
- External perimeter
- Overhangs perimeter
- Internal infill
- Solid infill
- Top solid infill
- Bridge infill
- Gap fill
- Skirt
- Support material
- Support material interface
- Custom

Also shown: "Estimated printing times" with "First layer" and "Total" time values, and filament usage values (exact numeric values not clearly legible in the source image).

*Note: This panel is a standard PrusaSlicer print preview legend showing time/material breakdown by feature type; exact numeric values are too small to transcribe precisely from this page.*

## Subheading
**How to tell whether an object needs supports?**

The shortest answer is: it comes with experience. With your first prints, stick to the default PrusaSlicer values ("Supports Everywhere"). Once you feel comfortable with printing complex shapes using default support settings, try playing around with the Overhang threshold option in the settings. We have an extensive list of detailed tutorials available at help.prusa3d.com/category/prusaslicer_204 if you need guidance.

## Support Generation Options

You have three options to choose from when selecting support generation:

- **Support on Build Plate Only** - generates supports only in the space between the object and the print bed.
- **For Support Enforcers Only** - generates supports only where enforced by placed modifiers.
- **Everywhere** - generates supports everywhere.

## Footer
Page number: **44**

## Page 45

![Page 45](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/45.png)

# Page Transcription (Page 45)

## Body Text (top section - continuation, no heading shown)

The default support pattern usually works correctly, but **if you need to modify the places where the supports will be generated,** just go to the **Print Settings** tab and select **Support Material.**

- Check the Generate Support Material box.
- The Overhang Threshold allows you to set the minimum angle for printing the support material. Setting the value to zero will enable an automatic calculation. Try generating supports with different angle settings to see which value works best for your object.
- Enforce Supports is an option mainly used for small models or models with a small base to prevent them from being broken or detached from the print bed during the printing process.
- Wherever the supports touch the model, they are usually associated with a lower surface quality. Try to reduce or even avoid the need for supports by rotating or shifting the model accordingly.

---

## Heading: 6.5.3. Speed vs Print Quality

A small object can be printed in a few minutes but printing bigger models can take a lot of time - sometimes even dozens of hours.

The printing speed is affected by several factors. Primarily, it depends on the layer height. This can be set in PrusaSlicer in the Print Settings drop-down menu in the upper right corner. 0.15mm STRUCTURAL is pre-set, but you can speed up the printing by choosing e.g. 0.20mm SPEED. Models printed like this will have less detail and more visible layers.

If you care more about quality than speed, choose 0.10mm (FAST DETAIL). The appearance of the models will improve, at the cost of a decreased printing speed.

**Some profiles may have two variants.**

- **Structural** - slower perimeter and infill printing, improves the surface quality and structural integrity
- **Speed** - faster perimeter and infill printing, without too much impact on the surface quality, top speed while keeping good quality and accuracy

The speed can be adjusted during printing, via the *LCD Menu - Tune - Speed*. Then use the knob to adjust the speed up or down. Observe the effect of the speed change on the print quality and choose the settings that suit you best. Remember that **this setting does not affect the acceleration of the printer,** so the printing time will not be shortened proportionally to the speed setting change.

---

## Page Footer
Page number: **45**

---

## Notes on Content Type
This page contains **no tables, diagrams, schematics, photos, charts, or control panel images** — it is purely instructional/explanatory body text regarding 3D printing software settings (PrusaSlicer) related to:
1. Support material generation settings (Generate Support Material, Overhang Threshold, Enforce Supports).
2. Layer height presets and their effect on print speed vs. quality (0.10mm FAST DETAIL, 0.15mm STRUCTURAL, 0.20mm SPEED).
3. Print profile variants (Structural vs. Speed).
4. In-print speed adjustment via LCD Menu (Tune - Speed knob).

### Key Numeric/Setting Values Mentioned:
| Setting Name | Layer Height | Notes |
|---|---|---|
| FAST DETAIL | 0.10mm | Highest quality, slowest speed |
| STRUCTURAL | 0.15mm | Pre-set default |
| SPEED | 0.20mm | Faster, less detail, more visible layers |

### Menu Path Referenced:
- **Print Settings tab → Support Material** (for support generation options)
- **Print Settings drop-down menu (upper right corner)** (for layer height/speed profile selection)
- **LCD Menu → Tune → Speed** (for live speed adjustment during printing, via knob)

## Page 46

![Page 46](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/46.png)

# Page 46 — Transcription

## 6.5.4. Infill

Another parameter that affects the properties of the printed object is Infill. It affects the printing speed, strength and appearance of the object. Objects printed with the FFF/FDM method usually do not have 100% density. Instead, they contain a certain geometric structure inside. It can take various forms, from simple square grids or hexagons to more complex patterns. The purpose of the infill is to stiffen the object from the inside. Most models are printed with 10-15% infill, but if you need a really solid structure, you can choose a higher density.

**Diagram (screenshot of PrusaSlicer 3D preview):**
- Shows a 3D-printed model preview in the slicer software's preview/visualization mode.
- On the left side is a small data panel (partially legible) listing print parameters with colored swatches — appears to be a legend table showing print time, percentage, and used filament, with rows for items such as: Perimeter, Perimeter (external), Overhang perimeters, Internal infill, Solid infill, Top solid infill, Bridge infill, Gap fill, Skirt, Support material, Support material interface, Support interface, Custom, plus rows for total estimated print time and filament used. Colors correspond to swatches shown next to each row (yellow, orange, red, purple, green, etc.), but exact numeric values are not legible in the text.
- The 3D object shown is a bust/head-like model (orange/tan colored) sliced open to reveal a cross-section: the interior shows a red/dark-red diagonal cross-hatch (diamond/grid) infill pattern filling the inside of the head.
- Two green vertical cylindrical supports are visible beneath the model, representing support material/support structures printed under overhanging areas (the neck/chin area).
- The model sits on a dark grid-patterned print bed (build plate) with a green horizontal line (front-left edge indicator) and grid squares representing the printer's coordinate/build area.
- Bottom-left corner of the viewport shows two small icon buttons (view/display toggle icons).
- Purpose of image: illustrates what internal infill pattern (cross-hatch/grid) looks like inside a sliced model, and how support material (green) is generated under overhangs.

---

## 6.5.5. Brim

The brim serves to **increase adhesion to the bed,** reducing the risk of warping. A wider first layer is printed around the model. This makes sense especially if the model only touches the bed in a small area. This function can be enabled in PrusaSlicer by checking the "Brim" box in the menu in the right column. After the printing is finished, **the brim can usually be removed easily by hand,** or you can use a knife or scalpel.

**Diagram (screenshot of PrusaSlicer 3D preview):**
- Shows a yellow 3D-printed frog model (frog with textured/bumpy skin, large round eyes, four legs/feet) sitting on a dark grid-patterned print bed.
- Around the base/feet of the frog model is a green-colored flat outline/skirt-like border directly on the bed — this represents the **brim**, a wide flat single-layer extension printed around the model's footprint on the bed to increase surface contact area and adhesion.
- The brim (green) closely follows the frog's contact points with the bed (visible under all four feet and the belly outline).
- Build plate shown with grid lines; a green line marks the front-left edge and a red line marks another axis indicator (right side), typical of slicer preview axis/origin indicators.
- Bottom-left corner shows two small icon buttons (same view/display toggle icons as in the infill image).
- Purpose of image: illustrates what a "brim" looks like when enabled — a wide flat rim printed around the base of the model to prevent warping.

---

**Page number:** 46

## Page 47

![Page 47](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/47.png)

# Page Transcription

## Heading
**6.5.6. Printing Objects Larger than the Print Volume**

## Body Text

The Original Prusa MK4S printer has a print volume of 250 × 210 × 220 mm. If this is not enough for your project, you can use PrusaSlicer's built-in tools to find a solution.

### Info Callout Box (orange background, "i" icon in black circle/hexagon)
Don't let the size of the print bed be a limitation – at **blog.prusa3d.com** you can find tips on how to assemble large models from several smaller parts.

*(Note: "blog.prusa3d.com" is styled as a hyperlink, bold and underlined)*

### Continued Body Text

Of course, you can also resize the imported model to fit the bed. The **Scale tool** is there to help you with that. If you want to print an object which is too large in its original size for the print bed, you can **cut it into several smaller parts.** Use the **Cut tool** from the left menu (or press the letter C). Either place the cutting plane manually or set an exact height using the Cut tool dialog. Choose whether you want to keep only the part above the cut, below it, or both.

## Diagram/Screenshot Description

The image is a screenshot of the **PrusaSlicer software interface** showing a 3D model editing view.

**Main subject of the 3D view:**
- A 3D model of an Egyptian-style bust (resembling Nefertiti) rendered in **green**, sitting on a **grid-patterned build plate** (dark gray with white grid lines, representing the print bed).
- The bust has a tall crown/headdress and a segmented neck/collar area.
- An **orange cube icon** is shown floating above/near the crown of the bust, representing the **Cut tool's manipulator handle** used to position the cutting plane.
- A **white/light gray horizontal plane** intersects through the model roughly at the neck/upper chest level, illustrating the **cutting plane** placement — this plane is semi-transparent and disc-shaped, indicating where the cut would be made.
- A coordinate axis indicator (red, green, blue arrows) is shown in the lower-left of the 3D viewport, representing the X (red), Y (green), and Z (blue) axes.

**Top toolbar (horizontal icons across the top of the viewport):**
A row of icons is visible, including (left to right, based on typical PrusaSlicer layout, icons partially legible):
- Add/import object
- Delete object
- Delete all
- Arrange
- Copy
- Paste
- Add instance (+)
- Remove instance (−)
- Split to objects
- Split to parts
- Variable layer height
- (Undo/redo arrows near the right side)

**Left-side vertical toolbar (tool icons stacked vertically):**
- Move tool (arrows icon)
- Scale tool (icon with corner handles)
- Rotate tool (circular arrow icon)
- Place on face tool
- **Cut tool** (icon resembling a cutting plane — this is the active/selected tool, shown highlighted)
- Paint-on supports tool (below cut tool)
- Seam painting tool
- Measure tool

**Cut Tool Dialog Box (small panel on the left side, below the toolbar, black background with white/orange text):**
This dialog appears active and includes:
- A label "Cut" at the top
- A numeric height field showing **"Z 66.00"** (the height of the cutting plane in mm)
- Checkbox options:
  - ☑ **Keep upper part**
  - ☑ **Keep lower part**
  - ☐ **Rotate lower part upwards** (or similar wording, appears unchecked)
- An orange/highlighted button at the bottom labeled **"Perform cut"**

**Bottom-left icons (below the vertical toolbar):**
- Two small icons representing view modes — one appears to be a "solid/opaque" view cube icon and another a "wireframe" or shaded view icon (likely toggles for object display mode, e.g., editing view vs. preview).

## What This Diagram Answers
This screenshot illustrates **how to use the Cut tool in PrusaSlicer** to slice a 3D model (that is too large for the print bed) into smaller parts. It shows:
- Where the Cut tool is located in the left-hand toolbar.
- How the cutting plane is visually represented on the model (the translucent disc/plane).
- The Z-height field for setting an exact cut height (in this example, Z = 66.00 mm).
- The checkboxes for choosing to keep the upper part, lower part, or both after cutting.
- The "Perform cut" button used to execute/confirm the cut.

## Page Footer
Page number: **47**

## Page 48

![Page 48](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/48.png)

# Page Transcription

## Heading
**6.5.7. Printing Multicolored Objects (without MMU3)**

## Body Text
If you want to have a print with layers in different colors, it can be easily set up directly in PrusaSlicer - follow the instructions below.

## Numbered Instructions
1. Switch to the layer view (Preview) using the button in the left bottom corner.
2. Use the slider on the right to select the layer in which you want to change the color.
3. Click on the orange icon with the plus sign.
4. An immediate preview will appear. You can undo the color change by clicking on the gray cross which will appear instead of the orange plus sign.
5. Export the G-code and you can start printing!

## Closing Body Text
Once the printer reaches the layer, where the color change should happen, **the printer will pause and display a prompt on the screen.** Follow the instructions on the screen to finish the filament change.

## Screenshot Description (PrusaSlicer Application Window)

The image shows a screenshot of the PrusaSlicer software interface, titled in the window bar: "Slic3rPE-1.42.0-beta1+87-win64-full-g62539bc35-201904010909"

**Top Menu Bar:** File, Edit, Window, View, Configuration, Help

**Tab Bar (below menu):** Plater, Print Settings, Filament Settings, Printer Settings

**Main 3D Viewport (left/center):**
- Displays a dark gray grid-plane (print bed) with white gridlines.
- A 3D-rendered object reading "PRUSA" in large block letters is shown lying flat on the bed.
- The text object is colored with a red/maroon fill and yellow/gold outline, representing a color-changed section.
- A thin vertical orange/red slider bar is on the right side of the viewport, representing the layer height slider.
    - Top of slider shows value "1.70 (11)" — indicating current layer height (1.70) and layer number (11).
    - Bottom of slider shows value "0.20 (1)" — indicating the starting layer.
    - An orange circular icon with a "+" (plus sign) is shown next to the slider at the "1.70 (11)" position — this is the button referenced in Step 3, used to insert a color change at that layer.
    - A magnified circular callout (orange circle) zooms in on this "+" icon to make it clearly visible, showing the plus symbol enlarged.

**Bottom-left icons (view mode toggles):** Two icons resembling a cube/box shape (likely "solid" and "wireframe" or object list view toggles).

**Bottom toolbar under viewport:**
- "View" dropdown: set to "Feature type"
- "Show Feature types" checkbox/button
- Checkboxes: ☐ Travel, ☐ Retractions, ☐ Unretractions, ☐ Shells
- Status text: "Ready to slice"

**Right Panel (Settings Panel):**
- Tabs at top: Simple | Advanced | **Expert** (Expert tab appears selected/highlighted)
- **Print settings:** dropdown showing "● 0.15mm QUALITY MK3"
- **Filament:** dropdown showing "● Prusa PLA"
- **Printer:** dropdown showing "● Original Prusa i3 MK3S"
- **Supports:** None
- **Infill:** dropdown field showing "15%" (highlighted/selected in blue)
- **Brim:** checkbox (unchecked)
- **Name field:** blank (labeled "Name")
- Object name row: "Prusa" with icon buttons to the right (gear/settings icon, cube icon)

**Object Manipulation Panel (lower right):**
- **Position:** X = 125, Y = 105, Z = 1.50 (units: mm)
- **Rotation:** X = 0, Y = 0, Z = 0 (units: degrees, shown as °)
- **Scale factors:** X = 100, Y = 100, Z = 100 (units: %)
- **Size:** X = 91.50, Y = 19.50, Z = 3.00 (units: mm)

**Info section (bottom right, partially visible/cut off):**
- Size: 91.50 x 19.50 x 3.00
- Volume: 3967.06 (units cut off, likely mm³)

**Bottom right button:** "Slice now" (button)

### What This Diagram Answers
This screenshot answers: "Where in PrusaSlicer do I click to insert a manual color change at a specific layer?" — showing the exact location of the orange plus-sign icon on the layer slider (right side of the 3D viewport), which layer height/number it corresponds to (1.70mm / layer 11 in this example), and the surrounding software context (print/filament/printer profiles in use: 0.15mm QUALITY MK3 print settings, Prusa PLA filament, Original Prusa i3 MK3S printer).

## Page Number
48

## Page 49

![Page 49](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/49.png)

# Page 49 — Transcription

## Heading
**6.5.8. Slicing and Exporting**

## Body Text
One of the most important phases of the slicing process is the final check of the sliced object in the Preview. Using the slider on the right, you can review all the print layers of the object one by one. This will help you identify problematic spots - for example, if the bottom of the object doesn't stick well to the bed or if some of the parts are missing supports and are "hanging in the air".

(Bolded phrases in original: "One of the most important phases of the slicing process is the final check of the sliced object in the Preview.", "review all the print layers", "identify problematic spots")

## Diagram / Screenshot Description

The image shows a **slicer software preview screenshot** displaying a 3D-printed object (appears to be an orange, layer-lined model resembling a decorative object/statue with a central cylindrical body, a round opening/ring at the top, and three protruding "arm"-like cylindrical extensions with dark red/maroon rounded tips). The object sits on a dark gray grid-patterned print bed shown in perspective.

### Left-side info panel (table-like overlay on the screenshot)
A small data box in the upper-left of the preview area lists print statistics by feature type, with color swatches, time, percentage, and material used. The text is small/low-resolution but appears to follow this structure:

| Feature type | Time | Percentage | Used filament |
|---|---|---|---|
| Perimeter | 2h22m | 22.1% | 16.15 m / 48.17 g |
| External perimeter | 3h53m | 36.7% | 16.35 m / 48.7 g |
| Overhang perimeter | 44s | 0.7% | 0.03 m / 0.10 g |
| Internal infill | 2h27m | 17.7% | 15.13 m / 45.13 g |
| Solid infill | 1h07m | 14.1% | 7.85 m / 23.05 g |
| Top solid infill | 22m | 3.3% | 1.24 m / 3.69 g |
| Bridge infill | 29m | 3.3% | 1.32 m / 3.93 g |
| Skirt/brim | 22m | 3.3% | 0.93 m / 0.27 g |
| Custom | 15s | 0.6% | 0.01 m / 0.04 g |

Below the table:
- **Estimated printing time(s):** (value not clearly legible)
- **Total:** 1h51m (approximate, low legibility)

*(Note: exact numeric values are low-resolution/blurry in the source image; general structure and column headers are clear, but individual digits should be verified against the actual software if precision is required.)*

### Right-side vertical slider
- A vertical slider bar runs along the right edge of the preview pane, used to scrub through print layers.
- Numeric layer-height/Z-position tick marks are shown along the slider (values appear as a descending/ascending scale, e.g., increments visible from top ~163.40 mm down to near 0 mm; exact tick labels not fully legible due to image resolution).
- A small orange marker/dot indicates the current slider position, near the top value "163.40 (818)".

### Bottom horizontal slider
- A horizontal slider bar beneath the 3D preview, spanning left to right, used for scrubbing through the print sequence horizontally (likely corresponds to the "layers" or "moves" view).
- Numeric values at each end: left end shows a value near "1198934" (or similar large number, low legibility), right end shows "1170810" (low legibility) — these likely represent total G-code line numbers or move counts.

### Bottom-left toolbar icons
- Two small icon buttons below the info panel, appearing to be view-toggle icons (one resembling a 3D cube icon, another resembling layered/stacked lines icon) — likely toggles between "3D view" and "Preview/legend" or "Top/Layer view" modes.
- A dropdown labeled **"View"** with value **"Feature type"** (dropdown selector).
- A dropdown/button labeled **"Show"** with value **"Options"** (dropdown selector).

## Callout Box (Red Warning Box with Hexagonal "!" Icon)
**Icon:** Black hexagon containing a white exclamation mark ("!"), on a red rectangular background.

**Warning text (verbatim):**
"Before you export the model as G-code and upload it to the USB drive, always check it in the Preview first. It's the best way to avoid mistakes during printing."

## Page Footer
- Page number: **49**

## Summary of What This Page Answers
- How to perform a final visual check of a sliced 3D model before printing (via the Preview mode).
- How to use the layer slider to review each print layer individually.
- How to identify common print errors: poor bed adhesion (bottom not sticking) or missing supports (parts "hanging in the air").
- What info is shown in the slicer's feature-type breakdown panel (time, percentage of total print time, and filament usage per feature type: perimeter, external perimeter, overhang perimeter, internal infill, solid infill, top solid infill, bridge infill, skirt/brim, custom).
- Where the "View" and "Show" dropdown controls are located for changing preview display.
- Explicit best-practice instruction: always check the Preview before exporting G-code to USB to avoid print failures.

## Page 50

![Page 50](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/50.png)

# 7. Material Guide

**A full table of materials is available online!** Due to limited space within this guide, we can only provide a brief overview of popular materials here. Visit **help.prusa3d.com/materials** to find a **full overview of a wide range of printing materials.** The Original Prusa MK4S 3D printer is compatible with almost all filaments available. Individual materials may differ not only in color but also in mechanical and optical properties, or even in printing difficulty.

## Info Box (orange callout, marked with "i" icon)

Prusament (**prusament.com**) is our in-house made line of **high-quality filaments.** We were not satisfied with the quality of filaments on the market, so we decided to make our own! **The whole manufacturing process is closely monitored** and every spool is thoroughly tested for string diameter, color consistency, and mechanical properties.

We are the only manufacturer that gives customers the option to **fully inspect the parameters of every filament spool.** Just scan a QR code on the spool to see all details online. We offer a wide range of various materials at **prusa3d.com** and it keeps growing every day!

---

## 7.1. PLA

PLA is the most commonly used material for 3D printing. It prints easily and prints from PLA are very hard. Perfect choice for printing large objects due to low shrinkage (prints don't warp on the bed) and for printing detailed small models.

### Advantages / Disadvantages Table

| Advantages | Disadvantages |
|---|---|
| Easy to print, suitable for beginners | Brittle and inflexible |
| Easily print small detailed models | Low temperature resistance (50-60 °C) |
| Trouble-free printing of larger objects | Difficult post-processing |
| Almost odorless | Not suitable for outdoor use (low UV and temperature resistance) |
| Affordable | |
| Wide range of colors | |

**Typical uses:** Prototypes, toys, action figures, jewelry and small detailed models in general, architecture models and more!

**Tips and tricks:** Prints best on a smooth (or satin) print sheet. When post-processing PLA prints, it is best to use wet sanding to achieve better results. If you use sandpaper dry, the heat generated by friction can start to deform the printed object. PLA can only be dissolved in chemicals such as chloroform or heated benzene. For gluing, a good quality superglue is sufficient, certain types of PLA can also be glued with acetone.

- **Nozzle temperature:** 215 °C
- **Heated print bed temperature:** 50-60 °C
- **Print surface:** Make sure the print sheet is clean, as per instructions in the Regular Maintenance chapter.

---

Page number: 50

## Page 51

![Page 51](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/51.png)

# 7.2. PETG

**Page number:** 51 (bottom right corner)

## Body Text

PETG is one of the most popular materials for 3D printing. It is a great choice for parts that will be subject to mechanical stress. Compared to PLA, it has a higher temperature resistance, it is more flexible and less brittle. Thanks to its low thermal expansion, it holds well to the bed and does not warp. Printing with it is almost as easy as with PLA, but unlike PLA it offers much better mechanical properties. Parts of our printers are printed with PETG!

## Advantages / Disadvantages Table

| Advantages | Disadvantages |
|---|---|
| High temperature resistance | Not suitable for printing small/highly detailed models |
| Easy printing | Nozzle can leave thin filaments (stringing) |
| Low thermal expansion | Problematic bridging and overhangs |
| Durable and tough | Strong adhesion to the bed |
| Easy machining (sanding) | Cannot be smoothed with commonly available solvents, soluble only in dangerous chemicals |
| Printing almost without smell | Removal of supports can be difficult |
| Glossy surface | |
| Good adhesion of layers | |

## Typical Use
**Typical use:** Mechanical parts, Holders and cases, Waterproof prints (flower pots).

## Tips and Tricks

**Tips and tricks:** PETG requires a higher heatbed temperature (85 °C). PETG usually has worse results when bridging two points, plus PETG tends to string - this means it's leaving fine plastic strings on the surface of the print (which can be relatively easily removed). Stringing can be reduced by setting appropriate retraction and using lower printing temperatures - we recommend sticking to the values in PrusaSlicer profiles. The print must be well cooled - it has better details and stringing can be prevented to some extent. However, if you want the most durable print, try turning off the print fan. A higher temperature will cause the layers to stick better to each other, resulting in better mechanical resistance. Generally, we recommend printing the first few layers with the fan turned off (for adhesion) and then turning it on at 50% power.

## Key Settings (Bulleted List)

- **Nozzle temperature:** 240 °C
- **Bed temperature:** 70-90 °C
- **Print surface:** A textured print sheet and a satin print sheet do not require any special preparation, just keep them clean and free of grease. If you want to use a smooth PEI print sheet, you should apply a thin layer of glue stick, as PETG may adhere too strongly to the sheet surface, making it difficult to remove prints from the sheet.

## Notes on Layout
- No diagrams, schematics, photos, charts, or control panels appear on this page.
- The page consists solely of a heading, introductory paragraph, a two-column advantages/disadvantages list (formatted as a table above), a typical use line, a tips and tricks paragraph, and a final bulleted list of three key settings (nozzle temperature, bed temperature, print surface).
- A short horizontal rule/line appears above the "7.2. PETG" heading at the top of the page (formatting element only, no text).

## Page 52

![Page 52](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/52.png)

# Page 52 — Manual Transcription

## 7.3. ASA (ABS)

**Body text:**

ASA and ABS are very similar materials. In some respects, ASA is better than ABS. ASA is UV-stable compared to ABS and shrinks slightly less during printing. When it comes to post-processing, ABS and ASA can be similar, but the latter is currently more popular, so we will focus mainly on it.

ASA is a strong and versatile material. A higher melting temperature than PLA gives ASA good thermal resistance, so your prints will not show signs of deformation up to temperatures around 100 °C. Unfortunately, compared to PLA, ASA has a very high thermal expansion, which complicates printing, especially larger models. Even with a heatbed set to 100 °C, the print can start to warp and detach from the bed. ASA also produces a noticeable odor during printing.

**Highlighted callout box (orange banner):**
"Best printed in the Original Prusa Enclosure."

---

### Advantages / Disadvantages (two-column layout)

**Advantages**
- High impact and wear resistance (lower than PETG)
- Very good thermal resistance
- Suitable for outdoor use - UV stable
- Soluble in acetone - can be used for gluing
- Possibility of smoothing with acetone vapors
- Detailed prints without stringing (leaving fibers on the print)
- Easy post-processing (e.g. sanding, cutting, etc.)

**Disadvantages**
- Difficult printing
- Tendency to warp (printing in an enclosed box is recommended)
- Unpleasant smell when printing (contains styrene)

---

### Typical uses:
- Cases and protective covers
- Prototypes
- Spare parts
- Toys and figures
- Parts suitable for exterior use

---

### Tips and tricks:

Printing with ASA/ABS is much easier if the printer is placed inside an environment with increased stable temperatures. This significantly reduces both deformation and layer separation. Thanks to acetone, it is easy to join several prints together. Just lightly rub the contact surfaces and press the parts together. In addition, it is possible to smooth the prints with acetone vapors and get a perfectly glossy surface. Be careful when handling acetone!

- **Printing temperature:** 220–275 °C
- **Bed temperature:** 90–110 °C (larger objects require higher temperature)
- **Print surface:** ASA and ABS materials work best with a satin print sheet, which requires no special preparation - just keep it clean and free of grease. However, if you are printing ABS/ASA on a textured/smooth print bed, it is necessary to apply a glue stick.

---

**Page number:** 52

---

## Notes on page layout / non-text elements:
- No tables, diagrams, schematics, or photographs are present on this page.
- The only graphical element is the solid orange horizontal banner containing the callout text about the Original Prusa Enclosure.
- A thin horizontal rule line appears above the "7.3. ASA (ABS)" heading, likely a section-break design element from the manual's template.
- Text is organized in a single-column format except for the "Advantages" and "Disadvantages" section, which is presented in two side-by-side columns.
- Bullet points under "Typical uses" use filled circular bullets (●), while bullets under "Advantages/Disadvantages" use standard dashes/bullet points (•).

## Page 53

![Page 53](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/53.png)

# Page 53 Transcription

## Heading
**7.4. PC (polycarbonate) and PC Blend**

## Body Text
Polycarbonate (PC) is a technical material boasting excellent strength, tensile strength, and resistance to high temperatures. It is however quite demanding to print, thus making it suitable mainly for advanced users. This of course does not apply to our Prusament PC Blend, which is much easier to print compared to other polycarbonates. Polycarbonate surpasses all of the aforementioned materials in its mechanical, chemical, and thermal resistance.

## Callout Box (orange banner)
**Best printed in the Original Prusa Enclosure.**

## Advantages / Disadvantages List

**Advantages**
- High-temperature resistance
- High strength and tension resistance
- Clear polycarbonate is transparent
- Good electrical insulation properties

**Disadvantages**
- Pure polycarbonate is highly hygroscopic
- High nozzle and bed temperatures
- Strong warping, especially for large models
- Mild smell during printing
- Separating layer application recommended
- High price

## Typical Uses
**Typical uses:** Polycarbonate is mostly suitable for technical components, for which we require a higher resistance to mechanical wear and tear and high temperatures.

## Tips and Tricks
**Tips and tricks:** Consider printing in a closed box - to prevent warping of the printed objects; enable the "Brim" feature in PrusaSlicer - set it higher than the default outline, ideally to the whole height of the print; add a "Skirt" in PrusaSlicer around small objects; do not print in low-temperature zones;

- **Nozzle temperature:** 270-275 °C
- **Bed temperature:** 110 °C for the first layer, 115 °C for the following layers
- **Print surface:** Textured print sheet and smooth print sheet with a layer of stick glue offer the best adhesion properties. Although the textured print sheet offers good adhesion properties on its own, we recommend applying a separating layer of glue to prevent wear/damage to the surface.

## Page Footer
Page number: **53**

## Notes on Layout
- No tables, diagrams, schematics, photos, charts, or control panels are present on this page — content is purely textual, organized into a heading, paragraph, a colored callout box, a two-column advantages/disadvantages list, and a bulleted parameter list (nozzle temp, bed temp, print surface).
- No part numbers, wiring diagrams, amperage/voltage, or wire-speed values appear on this page (not applicable to this material data sheet).

## Page 54

![Page 54](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/54.png)

# 7.5. PVB

Polyvinyl butyral (PVB) is a material that can be easily smoothed with isopropyl alcohol (IPA). Prints, when properly set up, are clear and transparent, thus making PVB a suitable material for printing vases, lamp shades, and other decorative models. The printing settings are similar to those for PLA, but the mechanical properties of PVB are slightly better.

## Advantages / Disadvantages

**Advantages**
- Similar printing settings to PLA
- Transparent filament
- Suitable for decorative models - vases, lamp shades, etc.
- Chemical smoothing with IPA
- Good toughness
- Good tensile strength (similar to PETG and PLA)
- Less prone to warping (less than PLA)
- Suitable in combination with 0.8mm nozzle

**Disadvantages**
- Lower adhesion between layers
- Hygroscopic material (absorbs moisture)
- Higher price

## Body Text

**Typical uses:** PVB finds its best use when printing transparent (translucent) models – e.g. jewelry, vases, lamp shades, etc.

**Tips and tricks:** PVB has good adhesion to clean smooth or satin print sheet, while textured print sheets have rather poor adhesion. If you want to print translucent prints which you will later smooth with isopropyl alcohol, we recommend using a bigger nozzle (0.8mm) and enabling the "Spiral vase" mode in PrusaSlicer. When printing with multiple perimeters, the individual layers will be clearly visible even after smoothing with isopropyl alcohol.

**Store the filament in a dry environment** – PVB is a material prone to absorbing moisture, which can negatively affect the quality of the print. Always return the filament to its plastic bag with silica gel, or let it dry for 4 hours at 60 °C before printing with it.

The main advantage of PVB material is that it can be smoothed with isopropyl alcohol (IPA). Models printed from PVB can be smoothed in IPA vapors, by immersing into an IPA bath, or by directly applying IPA on the object surface (by using a sprayer or brush). Detailed instructions can be found on our blog at blog.prusa3d.com.

## Print Settings (bulleted list)

- **Nozzle temperature:** 215±10 °C
- **Bed temperature:** 75 °C
- **Print surface:** Do not use the standard textured print bed. PVB will better adhere to the clean smooth or satin print bed. Textured print sheets may not have sufficient adhesion properties.

---

Page number: 54

**Note:** This page contains no tables, diagrams, schematics, photos, charts, or control panel illustrations — only text content as transcribed above.

## Page 55

![Page 55](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/55.png)

# Page 55 — Transcription

## 7.6. Flexible Materials

Flexible filaments are typically very strong and elastic materials. In many cases, the classic hard plastic (PLA, PETG) may not be ideal or even completely unsuitable for certain models. Whether you are printing a phone case, a housing for an action camera or even wheels for an RC car, it is better to use a flexible material.

These materials are often expensive and not very common and are not suitable for beginners. Before you start printing with Flex, clean the nozzle from the previous material by inserting PLA into the preheated extruder and pushing out all the previous material. For Original Prusa 3D printers, we recommend using Semiflex or Flexfill 98A, or Filatech FilaFlex40, for which we have tuned profiles in PrusaSlicer.

### Advantages / Disadvantages Table

| Advantages | Disadvantages |
|---|---|
| Flexibility and elasticity | Requires a special procedure for inserting filament |
| Minimal shrinkage | Very poor bridging and overhangs |
| Excellent adhesion of layers | Requires lower print speed |
| Great resistance to wear | Higher price |
| | Absorbs moisture - must be stored in a dry environment |

### Print Settings (bulleted list)

- **Nozzle temperature:** 220 - 260 °C
- **Bed temperature:** 40 - 85 °C. (larger objects require higher temperature)
- **Print surface:** If you are printing on a smooth or satin print sheet, apply a separation layer to it! A glue stick is ideal. Textured sheets with a powder-coated PEI surface do not require a separation layer - the print will hold well and can be easily removed from the sheet after cooling.

---

**Page number:** 55

**Note:** No diagrams, schematics, photos, charts, or control panel illustrations appear on this page. The only structured content is the two-column Advantages/Disadvantages list (formatted above as a table) and a bulleted list of temperature/print-surface settings. No part numbers, amperage/voltage, wire-speed, or polarity information is present on this page (this is a 3D printing manual page, not a welding manual page).

## Page 56

![Page 56](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/56.png)

# 7.7. PA (Polyamide) / PA11CF

Polyamide (also known as Nylon) is a versatile material known for its durability and is commonly used for 3D printing special models due to its high difficulty in printing (not applicable to PA11CF) and higher costs. There are several types of polyamide, which differ in properties such as temperature resistance, water absorption and adhesion to different types of surfaces. Prusament PA11CF has great temperature resistance (up to 192 °C), strong resistance to a range of chemicals, and prints easily. Some polyamides, including the PA11CF, are reinforced with carbon fibers to reduce shrinkage, often at the expense of mechanical strength. We recommend the PA11CF for printing extremely stressed parts, such as plastic engine components, etc.

**Callout banner (orange box):** Best printed in the Original Prusa Enclosure.

## Advantages
- Great temperature resistance (up to 192 °C)
- Resistance to a range of chemicals
- Hard and resilient in thick layers, flexible in thin layers
- Smooth glossy surface of clean PA
- Excellent layer adhesion
- Suitable insulation material

## Disadvantages
- Not suitable for printing small/highly detailed models
- Prone to warping (not applicable to PA11CF)
- Challenging bridging and overhangs
- Strong (or too weak) adhesion to the surface
- Cannot be smoothed with commonly available solvents, dissolvable only in dangerous chemicals
- Difficult to remove supports
- Highly hygroscopic material

**Typical use:** Mechanical parts, holders and housings, electrical insulation parts, movable parts, and parts requiring high temperature resistance.

**Tips and tricks:** It is absolutely essential to **keep the filament dry,** otherwise its adhesion and overall printing quality will significantly worsen. Therefore, we recommend drying the filament for at least 4 hours at a maximum temperature of 90 °C before printing. The print from a dried polyamide should have a smooth and glossy surface, while materials reinforced with carbon fibers have a matte surface.

When printing polyamides, **we recommend using an enclosed printer with active filtration** or keeping the printer in a well-ventilated room. Not only are potentially hazardous particles released when printing (all) PA, but the higher ambient temperature also reduces warping and improves layer adhesion. Carbon-reinforced polyamides can be printed without a covered printer, but due to the internal tension caused by the sudden temperature change, the finished prints may have slightly worse mechanical properties.

- **Nozzle temperature:** 240 - 285 °C
- **Bed temperature:** 70 - 115 °C
- **Print sheet surface:** For printing most polyamides we recommend using our special PA Nylon print sheet, which ensures ideal adhesion even when its only cleaned with water. However, the adhesion of some types of polyamide may be too high, leading to damage to the sheet, so we recommend checking the compatibility in our material table (help.prusa3d.com/materials). We do not recommend printing polyamides on a smooth print sheet, and when using a textured or satin sheet a layer of paper glue (glue stick - Kores / PVA gluestick) must be applied.

---
Page number: 56

## Page 57

![Page 57](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/57.png)

# Page Transcription

**Page Number:** 57

---

## 8. Regular Maintenance

The Original Prusa MK4S was designed from the beginning as a true print "workhorse". Despite its high reliability, it is still a device with mechanical components that require more or less regular maintenance. Follow the instructions below to keep your printer in perfect condition for as long as possible.

---

### 8.1. Flexible Print Sheets

**To achieve the best adhesion of the print surface, it needs to be kept clean.** Choose the right cleaning agent depending on the type of print sheet (see below). Drop a small amount of the agent onto a clean paper towel and wipe the print surface. Best results will be achieved when the print sheet is cold, otherwise, you may burn yourself on the nozzle or heated bed. Also, the alcohol will evaporate before it has a chance to clean anything. Details can be found in the chapter **Your First Print** in this manual.

The effect of various print sheets on the first layer can be seen below. **From left to right: smooth, satin and textured powder-coated print sheet.**

---

### Diagram/Photo Description:

Three large dark gray/black circular disc images arranged side-by-side horizontally, each representing a different print sheet surface finish. Each large circle has a smaller circular inset (magnified detail) overlapping its bottom-right edge, showing a close-up texture sample of that surface.

1. **Left circle (Smooth print sheet):** Surface shows fine diagonal linear striations/brush-like texture. The magnified inset shows closely spaced parallel diagonal lines, indicating a smooth but lightly textured surface with visible fine linear grain.

2. **Middle circle (Satin print sheet):** Surface appears smoother and more uniform than the left, with subtle diagonal texture, slightly less pronounced than the smooth sheet. The magnified inset shows fine parallel lines similar to the smooth sheet but appears slightly less coarse.

3. **Right circle (Textured powder-coated print sheet):** Surface shows a rough, stippled, granular texture with irregular bumps/dots covering the entire surface. The magnified inset shows a dense pattern of small irregular dots/bumps, indicating a much rougher, matte, textured finish compared to the other two.

**Purpose of diagram:** Visually illustrates how the underside (first layer) of a 3D print appears/feels differently depending on which of the three print sheet types (smooth, satin, textured powder-coated) was used as the print surface — answers the question "what does the first layer look like on each of the three official print sheet finishes?"

---

### Info Box (Orange background, "i" icon):

**Icon:** Black hexagon with white "i" (information symbol).

**Text:** "The print surface does not need to be cleaned before every print, just be aware of not touching it with your fingers."

## Page 58

![Page 58](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/58.png)

# Page Transcription (Page 58)

## Body Text (intro paragraph)

Recommended cleaning agents differ slightly depending on the type of print sheet. Instructions for the use of specific materials (e.g. the need to use a separation layer to avoid damaging the surface) can also be found in the previous chapter.

## Main Table — Print Sheet Cleaning Guide

| Print Sheet Type | Correct usage: | Risks and dangers: |
|---|---|---|
| **Print sheet with smooth PEI surface** | • Isopropyl alcohol 90%+ (IPA) is the best option for degreasing. Do not use dermatological hand products which may contain isopropyl alcohol - they contain other additives (ointments, hydrating ingredients).<br>• Warm water with a few drops of dish soap (in case IPA does not remove residues like sugar from the bed)<br>• Acetone - occasionally for thorough cleaning of the print sheet<br>• When printing with Flex material you need to apply glue stick (Kores / PVA gluestick) | • Prints from PETG would stick too strongly to the sheet cleaned with isopropyl alcohol (IPA) and removing it could damage the surface. Materials such as PETG, ASA, ABS, PC, CPE, PP and FLEX should only be printed with a separating layer (glue stick). |
| **Print sheet with a textured powder-coated surface** | • Isopropyl alcohol 90%+ (IPA) - best for degreasing | • **Do not use acetone** |
| **Satin print sheet** | • Suitable for PLA and PETG<br>• 90% isopropyl alcohol (IPA) is the best degreaser<br>• For printing flexible filaments you need a separating layer of glue (Kores)<br>• Broad spectrum of supported materials; including advanced materials such as PC Blend and others | • **Never use acetone!**<br>• For printing ASA and PC Blend you need to add a brim, outline or shield around the print<br>• Do not use sharp objects to remove the print from the bed! |

## Callout Boxes

**Warning Box (red, marked with "!" icon in black hexagon):**
> Consumable materials such as print sheets are not covered by our warranty unless they arrive damaged or incorrectly manufactured. Print sheets are consumables and the warranty only applies to defects that appear immediately after unpacking.

**Info Box (orange, marked with "i" icon in black hexagon):**
> All original print sheets made in Prusa Research are double-sided.

## Page Footer

Page number: **58**

## Notes for Technician Reference

- **Three print sheet surface types covered:** Smooth PEI, Textured powder-coated, Satin.
- **Common approved cleaner across all types:** Isopropyl alcohol 90%+ (IPA).
- **Acetone usage:**
  - Smooth PEI: allowed occasionally for thorough cleaning.
  - Textured powder-coated: **NOT allowed** (do not use acetone).
  - Satin: **NEVER allowed** (strongest warning, bolded "Never use acetone!").
- **Glue stick requirement:** Needed when printing Flex/flexible filaments on smooth PEI and satin sheets (Kores / PVA gluestick specified for PEI; Kores glue specified for satin).
- **Material-specific risk:** PETG, ASA, ABS, PC, CPE, PP, FLEX should only be printed with a separating layer (glue stick) on smooth PEI surface — otherwise prints stick too strongly and removal damages the surface.
- **Satin sheet specific instructions:** Suitable for PLA and PETG directly; ASA and PC Blend prints require a brim, outline, or shield around the print; do not use sharp objects to remove prints (damage risk).
- **Warranty note:** Print sheets are consumables — warranty only covers damage/defects found immediately upon unpacking, not wear from normal use.
- **General fact:** All original Prusa Research print sheets are double-sided.

No diagrams, schematics, photos, or control panel images appear on this page — content is text and tables only.

## Page 59

![Page 59](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/59.png)

# Page 59 — Transcription

## Section 8.1.1. Double-Sided TEXTURED Print Sheet

Bullet list:
- Surface resistant to damage and scratches
- The texture on the surface of the sheet is transferred to the bottom side of the printed object
- Simpler Z-axis calibration
- FLEX does not require glue (Kores / PVA gluestick) application to the print bed
- After the print sheet cools down, the print usually detaches itself
- PLA prints with a small contact area may require a brim
- Large PLA prints may warp
- **Never clean with acetone** (bolded in original)

Body paragraph:
"The textured powder-coated surface applied directly to metal allows us to create a print sheet that is highly resistant to damage. If a heated nozzle hits it, the metal is able to quickly dissipate heat. **The textured powder coating also gives the bottom surface of the print a unique, interesting texture.** The textured surface is able to mask most scratches and similar types of damage caused by various tools. One can only scratch the highest points of the texture, yet this type of damage will not be visible on the print."

### Warning Callout (red box, exclamation mark icon "!"):
"Never clean the textured powder surface with acetone! This will cause micro-cracks in the PEI layer, which will eventually lead to a significant deterioration of the surface quality."

---

## Section 8.1.2. Double-Sided SMOOTH Print Sheet

Bullet list:
- Excellent for PLA
- Great adhesion to almost all materials
- Smooth bottom layer of prints
- Even small prints will hold well
- Occasionally clean with acetone

Body paragraph:
"For printing materials such as PETG, ASA, ABS, PC, CPE, PP, Flex and others, it is necessary to apply a glue separation layer. More information can be found in the Materials Guide."

### Info Callout #1 (orange box, "i" icon):
"The industrial adhesive used to attach the PEI layer to the print sheet tends to soften at temperatures above 110°C. The adhesive can then move beneath the surface, creating small bumps."

### Info Callout #2 (orange box, "i" icon):
"If you notice small bubbles appearing beneath the PEI layer on the flexible print sheet, just flip it over and print on the other side. After a few days or weeks, the bubbles should disappear. The bubbles have no effect on the print quality."

---

## Page Footer
Page number: **59**

---

## Notes on Layout/Icons
- Two horizontal divider lines separate the two subsections (8.1.1 and 8.1.2) from surrounding content.
- Warning box uses a **black hexagon icon with white "!"** on a **red background** — indicates a critical warning (do not use acetone on textured sheet).
- Info boxes use a **black circle icon with white "i"** on an **orange background** — indicates general informational/advisory notes (not critical warnings).
- No tables, diagrams, schematics, or numerical settings (amperage, voltage, wire-speed, part numbers) appear on this page — content is purely descriptive/instructional text regarding print sheet care and material compatibility.
- Referenced but not detailed on this page: "Materials Guide" (external document referenced for glue separation layer instructions per material type).

## Page 60

![Page 60](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/60.png)

# Page 60 — Transcription

---

## 8.1.3. Double-Sided SATIN Print Sheet

- Suitable for PLA and PETG
- Soft texture on the bottom part of the print
- **Only use quality isopropyl alcohol (90+ %) to clean**
- FLEX requires the use of a glue separation layer (Kores / PVA glue stick) on the print sheet
- Wide range of supported materials, including advanced materials such as PC Blend and more
- Easy maintenance and good adhesion
- **Do not use acetone! Acetone will damage the surface of the print sheet!**
- When printing with ASA and PC Blend, a brim or a raft may be required around the print, depending on the model height
- **Do not use sharp metal objects to remove prints from the sheet (e.g. a metal spatula)**

---

## 8.1.4. Improving the Adhesion

Body text:

In certain special cases, such as printing a very tall object that touches the print sheet with a very small area, it may be necessary to **improve the adhesion.** PEI is fortunately a chemically very resistant polymer, so it is possible to **apply various substances to improve adhesion without risking damage to the surface.** This also applies to various materials whose adhesion to PEI would be very weak under normal circumstances. More information can be found on the website help.prusa3d.com/materials.

**Info callout box (orange, with "i" icon):**
> Before applying anything to the print sheet, consider using the Brim feature in PrusaSlicer to increase the area of the first layer.

---

## 8.2. Keeping the Printer Clean

Body text:

After several hours of printing, various kinds of debris may start to accumulate around the printer parts or under the heatbed - pieces of filament, dust, scraps, broken supports, etc. Always make sure that the parts of the printer are clean. You can use a brush, a small broom or a vacuum to remove debris.

---

## 8.3. Bearings

Body text (paragraph 1):

Every couple hundred hours, the smooth rods should be cleaned with a paper towel. Then look for the white tube in the package and apply a little bit of the included lubricant on the smooth rods and move the axis back and forth a couple of times. This cleans the dirt and increases longevity. For a detailed maintenance guide, please head to help.prusa3d.com

Body text (paragraph 2):

If you feel the axis is not running smoothly anymore, bearings can be taken out and greased on the inside (they need to be removed from the axis because the plastic lip will prevent most of the grease from getting inside).

---

## Page footer
Page number: **60**

---

## Notes on page layout/design elements
- Section headings (8.1.3, 8.1.4, 8.2, 8.3) are each preceded by a thin horizontal divider line.
- Bullet points under 8.1.3 use standard round bullets; several are bolded for emphasis (warnings/cautions).
- The info box under 8.1.4 is a solid orange rectangle with a black circular icon containing a white lowercase "i" (info symbol) to the left of the text — standard "tip/note" callout style.
- Hyperlinked text (in orange/colored font) appears twice: "help.prusa3d.com/materials" and "help.prusa3d.com" — these are website references for additional maintenance/adhesion information, not clickable in print but indicate URLs to visit.
- No tables, diagrams, schematics, or photographs appear on this page — content is entirely textual (headings, bullet lists, paragraphs, and one styled callout box).

## Page 61

![Page 61](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/61.png)

# Page 61 — Transcription

## 8.4. Fans

**The RPM (revolutions per minute) of both fans is constantly measured.** This means that the printer will **report an error if the fan suddenly slows down,** for example due to a piece of filament stuck in it. In such a case, check and remove any dirt from the relevant fan. Do not try to bypass the RPM check - this could damage the printer! Both fans should be checked and cleaned after every few hundred hours of printing. Dust can be removed with compressed air in a spray can, small plastic threads can be removed with tweezers. **Do not blow compressed air on the running fan.**

---

## 8.5. Extruder Feeding Gear

The feeding gear in the extruder does not need any lubricant. Over time, **a filament powder deposit may form in the grooves,** causing poor extrusion of filament. Remove the debris using compressed air in a spray, small plastic threads can be removed with tweezers. Use the access opening on the side of the extruder. Clean as much as possible, then turn the wheel (LCD Menu - Control - Axis) and continue.

### ⚠ Warning callout (red box, exclamation-mark icon):
"Warning: Never, under any circumstances, open the gearbox itself unless you have the gearbox alignment tool that comes with the MK4S assembly kit. There is no need to open the gearbox cover."

---

## 8.6. Electronics

It is a good practice to check and optionally reconnect the electrical connectors on the xBuddy board and electronics board in the Nextruder every 600-800 hours of printing.

---

## 8.7. Extruder is Clogged or Jammed

Clogged extruders can cause issues when printing or when loading a new filament. On the top of the extruder, there is a pair of screws directly next to the filament insertion point. You can adjust the idler pressure by loosening or tightening these screws. By unlocking the top clip, you can open the idler and check the filament track for any blockages. **When you open the idler, you can easily clean the feed gear of all filament remnants. We recommend regularly cleaning the gear.**

---

## Diagrams / Visual Elements

- No tables, charts, schematics, or photographs are present on this page.
- One graphical element: a black hexagonal icon containing a white exclamation mark ("!"), used to flag the warning text in Section 8.5 as a caution/warning notice (red background box with white text).

## Page Footer
- Page number: **61**

## Key Facts/Values for Quick Reference
- Fan cleaning interval: every few hundred hours of printing.
- Electrical connector check interval (xBuddy board & electronics board in Nextruder): every 600-800 hours of printing.
- Cleaning tools mentioned: compressed air (spray can), tweezers (for removing plastic threads/debris).
- Access point for feeding gear cleaning: access opening on the side of the extruder.
- LCD Menu path to rotate wheel/gear during cleaning: **LCD Menu → Control → Axis**.
- Idler pressure adjustment: pair of screws on top of extruder, next to filament insertion point (loosen/tighten to adjust pressure).
- Special tool referenced: "gearbox alignment tool" (comes with the MK4S assembly kit) — required before opening the gearbox; otherwise gearbox should not be opened.

## Page 62

![Page 62](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/62.png)

# Page 62 Transcription

## 8.8. Cleaning the Nozzle

**[WARNING CALLOUT - Red box with exclamation point icon in black hexagon]**
"Do not touch the nozzle during this procedure - it is hot and there is a risk of burning yourself! To better access the extruder during cleaning, raise the extruder to the top of the Z-axis in the LCD menu - Control - Movement - Z Axis."

### 8.8.1. The filament does not come out of the nozzle.

Body text: If the filament does not pass through the extruder and no plastic is being extruded, check the following:

- Open the idler on the side of the extruder to see if the filament strand reached the extruder gear and continues down into the nozzle
- See if the temperatures are set correctly (215 °C for PLA, 260 °C for ASA, etc.)
- Check if the fan on the side of the extruder is spinning

Body text: If the filament strand is not visible (does not reach the extruder wheel), the problem is likely near the filament entry point or the filament sensor. Inspect the path of the filament and see if the filament sensor isn't stuck.

### 8.8.2. The filament does not come out of the nozzle or only a small amount comes out

Body text (repeated as subheading): The filament does not come out of the nozzle or only a small amount comes out

Numbered steps:
1. Heat the nozzle to the appropriate temperature for the filament material you are printing with or slightly above. First, feed the filament, then insert an acupuncture needle (included in the package) or thin wire (0.3-0.35 mm) into the nozzle from the bottom to a depth of about 1-2 cm. Use protective gloves in case material suddenly starts to come out of the nozzle.
2. Select the Load Filament option from the LCD menu and check that the nozzle is actually extruding the filament.
3. Again insert the wire or acupuncture needle into the nozzle and repeat the whole procedure several times. If the filament is being extruded correctly, the nozzle is clean.

Body text: If the filament still doesn't come out and the nozzle is clogged, you can perform a cold pull method to clean the insides of the nozzle. You can find the Cold Pull wizard in the printer's LCD Menu.

---

## 8.9. Troubleshooting Faulty Sensor Readings and Removing Errors

Body text: If you encounter problems with the filament sensor, such as incorrect (or random) readings, make sure that everything in the Nextruder is correctly wired and that there is no debris in the filament path inside the extruder. If this doesn't help, please contact our tech support.

---

## 8.10. Filament Sensor

Body text: The filament sensor is calibrated during the initial Selftest and can be also re-calibrated from the printer's Control menu. If you encounter random readings, unload the filament, turn the printer off and remove debris from the Nextruder - either using tweezers or a can of compressed air.

---

**Page number:** 62

---

## Notes on Diagrams/Images
This page contains **no diagrams, schematics, photos, charts, or control panel images** — only text content, a warning callout box (red background with hexagonal exclamation icon), section headings, body paragraphs, bullet lists, and a numbered procedure list. No tables are present on this page.

## Key Values Referenced (for quick lookup)
| Parameter | Value |
|---|---|
| PLA nozzle temperature | 215 °C |
| ASA nozzle temperature | 260 °C |
| Needle/wire diameter for unclogging | 0.3–0.35 mm |
| Insertion depth into nozzle | 1–2 cm |

**Tools/Items mentioned:** Acupuncture needle (included in package), thin wire (0.3-0.35mm), protective gloves, tweezers, can of compressed air.

**Menu paths mentioned:**
- LCD menu → Control → Movement → Z Axis (to raise extruder for nozzle access)
- LCD menu → Load Filament (to check extrusion)
- LCD Menu → Cold Pull wizard (for clogged nozzle cleaning)
- Printer's Control menu (for filament sensor re-calibration)

## Page 63

![Page 63](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/63.png)

# Page 63 — Transcription

## Heading
**9. FAQ - Frequently Asked Questions and Basic Troubleshooting**

## Body Text (Intro)
In case of a critical failure, the Original Prusa MK4S may display an error screen with short instructions on how to proceed. This screen contains a link to a detailed article on our Knowledge Base at help.prusa3d.com as well as a QR code that can be scanned by a mobile phone to quickly access the link.

---

## 9.1. Mesh Bed Leveling Fails

In case the automatic first layer calibration (Mesh Bed Leveling) fails, the cause is likely to be either the Load cell sensor or a misaligned X/Z axis. Run the Auto Home and Z-axis calibration from the Control menu and see if the issue goes away. Move the Z-Axis all the way upwards until it hits the endstops. You will hear a couple of clicks from the motors. This way, you can ensure the horizontal axis is perfectly level. Make sure the print sheet is correctly placed and re-run the Load cell calibration again. Then start the print again.

### Callout Box (Green box with pen/note icon)
"If you built the assembly kit and you're seeing errors related to either homing or Mesh Bed Levelling, there might be an issue related to incorrect assembly. Closely inspect all axes. Make sure all screws are tight. You can turn off the printer and move the Nextruder left and right, and the heatbed back and forth to ensure that the movement is smooth."

---

## 9.2. Printer Does Not Recognize the Inserted USB Drive

If the printer does not recognize the USB drive, try restarting the printer first. In case the error "Error mounting USB drive" appears, the most probable cause is an incompatible file system (e.g. exFAT). Use a smaller USB drive (4-16GB) formatted with the FAT32 file system. More information on formatting and using USB drives can be found on our Knowledge base at help.prusa3d.com. Once the USB drive is inserted, one of two situations may occur:

**Cannot access the Print menu after inserting the USB drive**

1. Restart the printer first
2. Use a USB drive formatted to FAT32 with a single partition
3. Try using a different USB drive

If you have tried multiple USB drives and none of them can be read, there may be a problem with the mainboard. Contact our technical support.

**USB drive is recognized but no files are visible in the file browser:**

1. Make sure you are using compatible G-code
2. Make sure the file is correctly written to the drive (in Windows use the "Safely remove" function before ejecting the drive)
3. Try a different USB drive and a different G-code file
4. Try renaming the file to something simpler, e.g. model.gcode

---

## Page Footer
Page number: **63**

---

## Notes on Visual Elements
- **Horizontal rule lines** separate sections (top of page, above 9.1, and above 9.2).
- **Small black icon** (square with pen/edit symbol) appears at the top-left of the green callout box, indicating a "note" or "tip" style callout.
- **Green highlighted box** contains troubleshooting advice specific to self-assembled (kit) printers, distinguishing it from the general troubleshooting text above.
- No tables, schematics, wiring diagrams, or control panel images are present on this page — content is purely textual (headings, paragraphs, numbered lists, and one highlighted callout box).
- Hyperlinked text "help.prusa3d.com" appears twice, styled in orange/underlined (typical hyperlink formatting), pointing to the Prusa Knowledge Base.

## Page 64

![Page 64](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/64.png)

# Page 64 Transcription

## 9.3. Loose Belts

Check both belts to make sure they are properly tensioned. Loose belts can cause printing errors or prevent the printer from starting up. The easiest way to check the belt tension is to print a circular object. If the result is not perfectly round, you need to adjust the belt tension. Instructions can be found at help.prusa3d.com.

---

## 9.4. Homing Failed

This issue is usually caused by a blockage in one or more axes. Perform the Auto Home calibration from the LCD Menu and observe the movements of the printer. Make sure the cables leading to the extruder are not touching anything (a wall, shelf, etc.). Make sure nothing is applying pressure onto the heatsink or the extruder motor (e.g., too long screws at the back of the Z-carriage) - this doesn't happen on a factory-built MK4S, but if you built the MK4S as a kit, it's possible there's an issue with assembly.

If you have assembled the Original Prusa MK4S using the assembly kit, make sure that the cables running from the electronics to the extruder are not blocked by anything. Carefully inspect the rear side of the extruder and compare it to the assembly manual to make sure that the cable bundle leading from the extruder is not causing incorrect homing.

---

## 9.5. Heating Error

If the printer stops and the screen is red with a heating-related error, please check the connections of the heating element and thermistors. Detailed descriptions can be found at help.prusa3d.com.

---

## 9.6. Fan Error

If your printer stops and displays a fan-related error message, check both fans on the print head. It is possible that they are not spinning because they got clogged up. If the problem is elsewhere (e.g. cable connection) visit help.prusa3d.com for more information.

---

## 9.7. Reverting to an Older Firmware

Sometimes it is necessary to reinstall an older version of firmware. Upload a file containing the older firmware onto a USB drive formatted with the FAT32 system. Insert the drive into the printer, press the restart button and once the Original Prusa MK4S logo appears on the screen, press and hold the knob. This will activate the firmware update screen. Select "Flash" to reinstall the current firmware with the version from the USB drive.

---

## 9.8. Nozzle Hitting the Sheet / Other Z-axis Issues

**[Note/Callout Box - Green background with a black hexagonal icon containing a stylized "N" or pencil-like symbol on the left side]**

Text within green callout box:
"This issue is usually related to the assembly kit - the assembled printers coming from the factory are thoroughly tested before we ship them out."

---

**Page number: 64**

## Notes on Page Layout/Formatting:
- Each numbered section (9.3 through 9.8) is preceded by a horizontal divider line.
- Section headings are in a bold, casual/handwritten-style font.
- Hyperlinked text "help.prusa3d.com" appears in orange/amber color throughout the page (appears 3 times: in sections 9.3, 9.5, and 9.6).
- Section 9.8's content is cut off at the bottom of the page after the introductory callout box - no body paragraph text is visible before the page ends, only the green highlighted tip box.
- No tables, diagrams, schematics, photos, or control panel images appear on this page - it is text-only content with one graphical callout box element (the green tip box with icon).

## Page 65

![Page 65](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/65.png)

# Page Transcription (Page 65)

## Body Text (continuation, no heading — preceding section)

If you are having issues with first-layer calibration or Mesh Bed Leveling procedure, first make sure everything is properly wired - check the connectors on the electronics board in the Nextruder. Next, perform Auto Home calibration on all axes to make sure that everything is properly aligned - the print sheet is correctly placed, and the X-axis isn't skewed. Run the Load Cell sensor calibration again.

---

## Heading: 10. Advanced Hardware Troubleshooting

Body text:

Due to the length of the articles, it is not possible to include detailed troubleshooting guides in this handbook. However, the Original Prusa MK4S will display an error screen with a short recommendation on how to proceed further if it runs into a problem. This screen will also contain a link to a detailed article in our Knowledge Base at **help.prusa3d.com**. Additionally, there is a **QR code that you can scan with your mobile phone** for quicker access to the link. Troubleshooting guides for component replacements and advanced hardware issues can be found online at **help.prusa3d.com**.

(Note: "help.prusa3d.com" appears as a hyperlink, styled in orange/underlined text, twice in this section. The phrase "QR code that you can scan with your mobile phone" is bolded in the original text.)

---

## Heading: 11. Troubleshooting Print Quality Issues

Body text:

If prints are not quite up to your expectations or even have major flaws (shifted layers, ghosting, under-extrusion), it is necessary to find the cause of the issue and address it. On our website **help.prusa3d.com** you will find troubleshooting guides for 3D printing quality issues, including pictures and specific advice for different types of printers (some of which may still be in English only).

(Note: "help.prusa3d.com" appears as a hyperlink, styled in orange/underlined text.)

---

## Page Footer

Page number: **65**

---

## Additional Notes

- No tables, diagrams, schematics, photos, or control panel images are present on this page.
- No amperage/voltage/wire-speed values, polarity information, or part numbers are present on this page.
- The page consists solely of body text under two headings, with hyperlinked references to help.prusa3d.com (Prusa's online Knowledge Base) for further troubleshooting information not included in this printed handbook.
- Horizontal orange divider lines appear above each numbered heading (10. and 11.) as a formatting/section-break element.
- Heading text color: orange (matching the divider lines and hyperlink color scheme used throughout the document).

## Page 66

![Page 66](/assets/pages/33faa5f4-c211-4dab-881d-3202af20d989/66.png)

# Page Transcription

## Photo (top portion of page)
A top-down close-up photograph of a 3D-printed board game, appearing to be a Catan-style hex-tile game. The image shows:
- Multiple hexagonal terrain tiles in different colors representing game resources/terrain types:
  - Green hex tiles with numbered markers (visible numbers include "8", "3", "6")
  - Yellow/tan hex tiles with textured surface (resembling wheat/grain fields), also with numbered markers
  - A dark tile with a black cone-shaped structure (resembling a volcano or mountain)
  - An orange/red circular tile with a spiral/target-like pattern and the number "5"
  - White/cream colored small round pieces scattered on some tiles (resembling sheep or resource tokens)
  - Small figurines/miniatures visible in the upper portion (dark silhouetted shapes, possibly ships or pirate figures)
  - Small red brick-like structures near the volcano tile
  - A wooden pier/dock structure visible on the left edge
- The tiles are arranged edge-to-edge forming the modular game board
- Lighting appears to be studio/directional lighting on a dark blue surface/table

## Logo
- Stylized geometric orange/dark orange 3D cube-like icon (folded/origami style design) to the left of the text
- **Printables** (large bold white text)
- **by JOSEF PRUSA** (smaller text beneath, right-aligned under "Printables")

## Headline Text
**PRINT AND SHARE!**
**JOIN OUR COMMUNITY!**

## Body Text
Download 3D models for free at **printables.com** (shown in orange/highlighted link color) and participate in design contests!

Follow us for tips, guides, inspiring videos and amazing 3D prints!

## Callout Banner
An orange rectangular banner containing:
- "Share your prints with" (smaller white text on orange background)
- **#printedbyprusa** (large bold black text on orange background)

## Social Media Icons
A row of seven circular icons (white icons on dark/black circular backgrounds), left to right:
1. Facebook (f logo)
2. Instagram (camera icon)
3. Twitter (bird icon)
4. YouTube (play button icon)
5. TikTok (musical note icon)
6. Pinterest (P icon)
7. LinkedIn (in icon)

## Background Design
Dark black background with subtle repeating triangle/geometric pattern texture visible throughout the lower portion of the page (barely visible, decorative only).

---
**Note:** This page is promotional/marketing material for Prusa's "Printables" 3D model sharing platform, encouraging readers to download free 3D models, participate in contests, follow social media channels, and share their prints using a specific hashtag. It does not contain technical product specifications, tables, wiring diagrams, or numeric settings relevant to equipment operation.
