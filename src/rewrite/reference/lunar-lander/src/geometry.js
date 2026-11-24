// REAL landing-spot and boulder geometry, recovered from the SWF's own
// vector/placement data via FFDec's XFL export (not placeholders, not
// guessed). See work/lunar-lander/compare/parse-spots.mjs and
// parse-boulders.mjs for the extraction scripts, and
// work/lunar-lander/compare/landing-spots-extracted.json /
// boulders-extracted.json for the raw extraction output these tables
// were copied from.
//
// Units/conversion, made explicit because XFL mixes two conventions:
// - DOMSymbolInstance <Matrix tx="..."> is already in PIXELS (FLA's
//   authoring unit).
// - DOMShape <Edge edges="..."> coordinates are in TWIPS (1/20 px) - the
//   SWF binary's native unit, unconverted by this export mode.
// Both are converted here to LANDER METERS by dividing by
// PIX_PER_METER (7, frame_1/DoAction.as "var pixPerMeter = 7") after
// first converting twips to pixels (/20) where needed.
//
// Mechanism this geometry serves (cited, not guessed):
// - Landing spots: ScoreKeeper.as:34-41, a MovieClip bounding-box
//   hitTest(landingSpots[i]) per spot, so being INSIDE a spot's
//   rectangle is what counts - landing between two spots (there are
//   real gaps, e.g. spot9 ends at 46.43m, spot10 starts at 73.57m)
//   scores no spot bonus, which this geometry now reproduces instead of
//   the earlier placeholder's "always pick some zone" approximation.
// - Boulders: frame_1/DoAction.as:294-295, a TRUE SHAPE hitTest(x,y,true)
//   of two leg points against the boulders_mc clip. This module's
//   BOULDER_ZONES are bounding boxes of the 36 real rock/terrain shapes
//   inside that clip - closer to the original than a placeholder, but
//   still a bounding-box approximation of each shape's actual polygon
//   outline (see "Known remaining approximation" below).

export const PIX_PER_METER = 7;

// Symbol 144 ("landingSpots"), 15 instances. index = Number(name.slice(4))
// per ScoreKeeper.as:41. centerM/halfWidthM computed from each
// instance's Matrix tx and horizontal scale "a" (default 1.0 if the SWF
// omits it) applied to the base shape Symbol 143's half-width (800
// twips = 40px).
export const LANDING_SPOTS = [
    { index: 1, centerM: -322.142857, halfWidthM: 5.714286 },
    { index: 2, centerM: -202.142857, halfWidthM: 8.413173 },
    { index: 3, centerM: -166.707143, halfWidthM: 5.714286 },
    { index: 4, centerM: -89.285714, halfWidthM: 17.148176 },
    { index: 5, centerM: -56.535714, halfWidthM: 7.178606 },
    { index: 6, centerM: -35.814286, halfWidthM: 9.381365 },
    { index: 7, centerM: -3.428571, halfWidthM: 12.706473 },
    { index: 8, centerM: 23.571429, halfWidthM: 7.142857 },
    { index: 9, centerM: 40.714286, halfWidthM: 5.714286 },
    { index: 10, centerM: 89.285714, halfWidthM: 15.714286 },
    { index: 11, centerM: 121.9, halfWidthM: 6.649344 },
    { index: 12, centerM: 153.871429, halfWidthM: 17.057146 },
    { index: 13, centerM: 188.735714, halfWidthM: 8.121425 },
    { index: 14, centerM: 243.214286, halfWidthM: 9.107143 },
    { index: 15, centerM: 295.321429, halfWidthM: 5.714286 },
];

// Returns the spot index the given x (meters) falls inside, or null if
// it's in a gap between spots (a real possibility - see module header).
// Not "placeholder" anymore - this is the real recovered layout.
export function landingSpotIndexAt(xMeters) {
    for (const spot of LANDING_SPOTS) {
        if (xMeters >= spot.centerM - spot.halfWidthM && xMeters <= spot.centerM + spot.halfWidthM) {
            return spot.index;
        }
    }
    return null;
}

// Symbol 29 ("boulders", referenced by Symbol 30 at tx=0,ty=0 with no
// scale), 36 shapes. minY/maxY kept in the SWF's own authoring
// convention (negative = above the shape's ground attachment point) -
// callers wanting "height above ground in lander-meters" should negate.
// NOTE: several of these (e.g. the ones spanning ~79m and ~106m of
// height) are clearly background mountain silhouettes, not small
// foreground rocks - confirmed by their size, not assumed. They are
// included anyway because frame_1/DoAction.as's hitTest(x,y,true) tests
// the WHOLE boulders_mc clip without distinguishing foreground rocks
// from background art, so the original's actual collision behavior
// does not distinguish them either.
export const BOULDER_ZONES = [
    { minXm: -257.142857, maxXm: -236.571429, minHeightM: 22.842857, maxHeightM: 55.285714 },
    { minXm: 299.878571, maxXm: 304.7, minHeightM: 0, maxHeightM: 3.771429 },
    { minXm: 306.107143, maxXm: 311.007143, minHeightM: 0, maxHeightM: 2.785714 },
    { minXm: -351.042857, maxXm: -336.471429, minHeightM: 0, maxHeightM: 3.15 },
    { minXm: 286.128571, maxXm: 292.021429, minHeightM: 0, maxHeightM: 3.75 },
    { minXm: 276.064286, maxXm: 282.385714, minHeightM: 0, maxHeightM: 4.735714 },
    { minXm: -331.478571, maxXm: -325.035714, minHeightM: 0, maxHeightM: 3.75 },
    { minXm: -335.05, maxXm: -330.228571, minHeightM: 0.035714, maxHeightM: 3.807143 },
    { minXm: -312.621429, maxXm: -307.7, minHeightM: 0, maxHeightM: 2.785714 },
    { minXm: -307.2, maxXm: -295.071429, minHeightM: 0, maxHeightM: 5.042857 },
    { minXm: -294.657143, maxXm: -272.8, minHeightM: 0, maxHeightM: 6.95 },
    { minXm: -317.114286, maxXm: -312.192857, minHeightM: 0, maxHeightM: 2.778571 },
    { minXm: 104.264286, maxXm: 109.085714, minHeightM: 0, maxHeightM: 3.6 },
    { minXm: 110.964286, maxXm: 115.885714, minHeightM: 0, maxHeightM: 2.614286 },
    { minXm: 127.042857, maxXm: 139.171429, minHeightM: 0, maxHeightM: 4.835714 },
    { minXm: 252, maxXm: 275.728571, minHeightM: 0, maxHeightM: 12.8 }, // tall - likely a background rock spire
    { minXm: 171.4, maxXm: 177.285714, minHeightM: 0, maxHeightM: 3.6 },
    { minXm: 175.414286, maxXm: 181.735714, minHeightM: 0, maxHeightM: 4.707143 },
    { minXm: 195.285714, maxXm: 207.414286, minHeightM: 0.1, maxHeightM: 5.142857 },
    { minXm: 205.714286, maxXm: 246.178571, minHeightM: 0, maxHeightM: 79.1 }, // background mountain, see module header
    { minXm: 45.328571, maxXm: 60.814286, minHeightM: 0, maxHeightM: 17.357143 },
    { minXm: 61.185714, maxXm: 75.757143, minHeightM: 0.007143, maxHeightM: 3.171429 },
    { minXm: 30.278571, maxXm: 36.042857, minHeightM: 0, maxHeightM: 2.292857 },
    { minXm: 7.557143, maxXm: 19.807143, minHeightM: 0.014286, maxHeightM: 5.364286 },
    { minXm: -146.978571, maxXm: -142.164286, minHeightM: 0, maxHeightM: 3.75 },
    { minXm: -275.885714, maxXm: -208.285714, minHeightM: 0, maxHeightM: 106.035714 }, // background mountain, see module header
    { minXm: -193.278571, maxXm: -171.428571, minHeightM: 0.007143, maxHeightM: 12.942857 },
    { minXm: -161.471429, maxXm: -156.65, minHeightM: 0.042857, maxHeightM: 3.814286 },
    { minXm: -154.771429, maxXm: -149.85, minHeightM: 0.042857, maxHeightM: 2.828571 },
    { minXm: -138.692857, maxXm: -126.564286, minHeightM: 0.007143, maxHeightM: 5.05 },
    { minXm: -29.835714, maxXm: -23.007143, minHeightM: 0.078571, maxHeightM: 6.542857 },
    { minXm: -22.95, maxXm: -17.607143, minHeightM: 0.078571, maxHeightM: 3.178571 },
    { minXm: -50.278571, maxXm: -44.507143, minHeightM: 0, maxHeightM: 2.292857 },
    { minXm: -126.15, maxXm: -104.292857, minHeightM: 0.007143, maxHeightM: 6.957143 },
    { minXm: -73.007143, maxXm: -60.757143, minHeightM: 0.014286, maxHeightM: 5.364286 },
    { minXm: -150.75, maxXm: -145.828571, minHeightM: 0, maxHeightM: 2.785714 },
];

// Checks whether (xMeters, altitudeMeters) falls inside any real
// boulder's 2D bounding box. altitudeMeters should be the lander's
// current height above ground (state.pos.y) - the original tests two
// specific LEG points (0.32*bodyHeight below the lander's body,
// frame_1/DoAction.as:285-286), whose exact pixel offset is unknown
// (landerBody_mc._height was never recovered - see behavior-spec.md
// section 6). Using pos.y directly is a documented approximation of
// that leg offset, layered on top of now-real zone bounds.
export function boulderHitAt(xMeters, altitudeMeters) {
    for (const z of BOULDER_ZONES) {
        if (xMeters >= z.minXm && xMeters <= z.maxXm && altitudeMeters >= z.minHeightM && altitudeMeters <= z.maxHeightM) {
            return z;
        }
    }
    return null;
}
