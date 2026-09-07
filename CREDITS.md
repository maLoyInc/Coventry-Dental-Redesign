# Credits

Generated at build time from the image records in `src/content` and
`src/data/images.ts`. Do not edit by hand — edit the record and rebuild.

**This is an unsolicited design concept** for The Coventry & Warwickshire Centre for Advanced Dentistry. It is not
commissioned, reviewed, or endorsed by the practice, by Dr Jag Shergill, or
by any related party. The practice name, address, telephone number and
email address are factual details reproduced from public sources. Nothing
else on the page is the practice's work.

## Not reproduced

- **Logo and brand marks.** A neutral wordmark is used instead.
- **Media logos** (BBC, The Times, and any others). Press coverage renders
  as plain text. The `mediaMentions` schema has no `logo` field, so adding
  one fails the build rather than failing review.
- **Photography from the live site.** Every image below is licensed stock
  or map data, fetched by a script in /scripts that records where it came
  from. Nothing is taken from the practice.
- **A portrait of the clinician.** No photograph of Dr Shergill appears.
  A stock face under the name of a real, identifiable person is a picture
  of somebody else presented as him, which a caption does not undo. The
  block shows his initials instead.

## Text

- **Testimonials** are placeholder copy at realistic length. No real
  patient words appear anywhere. Every record carries `isPlaceholder: true`
  as a literal, so writing `false` fails the build.
- **Opening hours** are placeholder values. The live site does not publish
  hours at all; that is a gap in the original, and the page labels the
  times it shows as indicative.
- **Prices** are indicative "from" figures shown with a visible caveat and
  are deliberately absent from the structured data, where no caveat could
  travel with them.
- **GDC number** is omitted rather than invented.

## Licensed stock photography

Free to use under the licence named. Attribution is not required by the Unsplash or Pexels licences; it is recorded and displayed anyway.

| Used in | File | Dimensions | Credit | Source |
| --- | --- | --- | --- | --- |
| Hero | `src/assets/images/hero/clinic-interior.jpg` | 1440×960 | Kari Bjorn Photography (@karibjorn) on Unsplash | [Source](https://unsplash.com/photos/a-dental-room-with-a-desk-and-chairs-Fdku_oMrDvk) |
| Treatment card — Dental Implants | `src/assets/images/treatments/dental-implants.jpg` | 1200×800 | Jonathan Borba (@jonathanborba) on Unsplash | [Source](https://unsplash.com/photos/dental-implant-model-with-teeth-W9YEY6G8LVM) |
| Treatment card — All-on-4 | `src/assets/images/treatments/all-on-4.jpg` | 1200×800 | Quang Tri NGUYEN (@quangtri) on Unsplash | [Source](https://unsplash.com/photos/dentures-on-white-scale-rack-VxVO1zrY5F8) |
| Treatment card — Invisalign | `src/assets/images/treatments/invisalign.jpg` | 1200×800 | Katarzyna Zygnerska (@katasha) on Unsplash | [Source](https://unsplash.com/photos/a-person-in-blue-gloves-holding-a-clear-toothbrush-hD14Ge9DX_Q) |
| Treatment card — Cosmetic Dentistry | `src/assets/images/treatments/cosmetic-dentistry.jpg` | 1200×800 | Ozkan Guner (@dentistozkanguner) on Unsplash | [Source](https://unsplash.com/photos/a-group-of-white-objects-WvVW7mRaZE8) |

## Map data

Map tiles rendered from OpenStreetMap data. **Attribution is required** under the ODbL and is displayed beside the map on the page. See https://osm.org/copyright. Generated once by `scripts/fetch-map-asset.mjs`; the build itself makes no network calls.

| Used in | File | Dimensions | Credit | Source |
| --- | --- | --- | --- | --- |
| Static map, Finding us | `src/assets/images/map/practice-location.png` | 1200×675 | Map data © OpenStreetMap contributors | [Source](https://www.openstreetmap.org/#map=17/52.40701/-1.48458) |

## Licence summary

- **Unsplash License** — 5 assets
- **Open Database License (ODbL) 1.0** — 1 asset

## Alt text

Recorded here because it is content, not decoration, and because the
schema requires it: an image without alt text cannot be added.

- **Hero** — An empty dental treatment room with a reclined chair, overhead light and worktop
- **Treatment card — Dental Implants** — A cutaway dental model showing a titanium implant post set into the jawbone between two natural teeth
- **Treatment card — All-on-4** — A dental model of a full lower arch of teeth fixed onto implant abutments
- **Treatment card — Invisalign** — A gloved hand holding a single clear removable aligner, with its case behind
- **Treatment card — Cosmetic Dentistry** — Four thin ceramic veneers laid out in a row on a dark reflective surface
- **Static map, Finding us** — Street map showing the practice marked on Marlborough Road, off Binley Road in Coventry

