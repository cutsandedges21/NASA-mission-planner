// Every source the app relies on, for the "Data & credits" panel (web/components/map/Credits.tsx) and the README.
// T-25, Teammate's Claude. Each URL was checked against its publisher page or the baked meta.json `sources`.
// Keep in sync with web/public/data/gale/meta.json when a region is re-baked.

export type Credit = {
  group: 'NASA data' | 'Models & methods' | 'Software';
  name: string;
  what: string;
  url: string;
  license?: string;
};

export const CREDITS: Credit[] = [
  // ---- NASA data (the baked Gale region: web/public/data/gale/meta.json → sources)
  {
    group: 'NASA data',
    name: 'MSL Gale Merged DEM v3, 1 m (Parker & Calef, USGS 2016)',
    what: 'Elevation and slope for routing, the slope layer and the 3D view: MRO HiRISE / CTX, Mars Express HRSC and MGS MOLA, resampled to 25 m cells',
    url: 'https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m',
    license: 'Public domain (USGS)',
  },
  {
    group: 'NASA data',
    name: 'MSL Gale HiRISE colour mosaic (USGS)',
    what: 'Colour imagery of the planning area: MRO HiRISE, 25 cm source (covers 74 % of the box)',
    url: 'https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm',
    license: 'Public domain (USGS)',
  },
  {
    group: 'NASA data',
    name: 'Viking MDIM 2.1 colour mosaic (NASA Ames recolour)',
    what: 'Fills the colour image where HiRISE has no coverage: Viking Orbiter, ~232 m/px',
    url: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif',
    license: 'Public domain (NASA/USGS)',
  },
  {
    group: 'NASA data',
    name: 'THEMIS Night IR controlled mosaic v2 (USGS)',
    what: 'Night-time thermal image of the area (rock vs dust): Mars Odyssey THEMIS, 100 m/px',
    url: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif',
    license: 'Public domain (NASA/USGS)',
  },
  {
    group: 'NASA data',
    name: 'MSL waypoints: Curiosity end-of-drive stops (NASA/JPL)',
    what: "Curiosity's real drive path on the map, and the exact positions of Yellowknife Bay, Pahrump Hills and Vera Rubin Ridge; also the validation reference",
    url: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
  },
  {
    group: 'NASA data',
    name: 'DONKI WSA-ENLIL CME forecasts (NASA CCMC, Goddard)',
    what: 'Live check for solar storms (coronal mass ejections) forecast to reach Mars, via api.nasa.gov',
    url: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
  },
  {
    group: 'NASA data',
    name: 'Curiosity RAD surface radiation dose (Hassler et al. 2014, Science 343)',
    what: 'The 0.64 mSv/day dose rate measured at Gale, used for each route\'s EVA dose',
    url: 'https://doi.org/10.1126/science.1244797',
  },
  {
    group: 'NASA data',
    name: 'Estimated Radiation Dosage on Mars, PIA03480 (NASA/JPL/JSC, Mars Odyssey MARIE + MGS MOLA)',
    what: 'The Radiation map type (reprojected worldwide), and the +5.1 % dose rate per km of altitude we read off it to scale Curiosity\'s 0.64 mSv/day across Gale (data/radiation_map.py)',
    url: 'https://photojournal.jpl.nasa.gov/catalog/PIA03480',
    license: 'Public domain (NASA)',
  },
  {
    group: 'NASA data',
    name: 'MGS MOLA Mission Experiment Gridded Data Record, 4 px/deg (NASA PDS Geosciences)',
    what: 'Global elevations paired with the PIA03480 colours to fit dose vs altitude',
    url: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html',
  },
  {
    group: 'NASA data',
    name: 'Viking global mosaic of Mars, PIA00407 (NASA/JPL/USGS)',
    what: 'The Mars globe on the landing screen',
    url: 'https://photojournal.jpl.nasa.gov/catalog/PIA00407',
    license: 'Public domain (NASA)',
  },
  {
    group: 'NASA data',
    name: 'First Landing Site / Exploration Zone Workshop for Human Missions (NASA, 2015)',
    what: 'Why Gale: it was proposed there as a human Exploration Zone',
    url: 'https://www.hou.usra.edu/meetings/explorationzone2015/',
  },
  {
    group: 'NASA data',
    name: 'MSL traverse line (NASA/JPL MMGIS)',
    what: 'Curiosity\'s detailed drive line drawn on the map (2,494 of the 12,919 points inside the Gale box, simplified to 1 m)',
    url: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json',
  },
  {
    group: 'NASA data',
    name: 'Mars Dust Activity Database (MDAD), Battalio & Wang 2021',
    what: 'How often a dust storm covered our Gale area, by season (MGS MOC + MRO MARCI daily maps, Mars Years 24–32). Sets the storm chance in the Mission simulator (data/dust_gale.py → dust.json)',
    url: 'https://doi.org/10.7910/DVN/F8R2JX',
  },
  {
    group: 'NASA data',
    name: 'PIA26042: Curiosity\'s Path to Gediz Vallis Ridge and Beyond (NASA/JPL-Caltech/ESA/University of Arizona/JHUAPL/MSSS/USGS Astrogeology)',
    what: 'The guide for our approximate rock-unit outlines (unit names and colours). No pixels copied: the outlines come from the MSL DEM and HiRISE',
    url: 'https://photojournal.jpl.nasa.gov/catalog/PIA26042',
  },
  {
    group: 'NASA data',
    name: 'NASA Mars Trek (JPL Solar System Treks), global map layers',
    what: 'The whole-planet map types around the planning area, reprojected in the browser: Viking MDIM 2.1 colour mosaic (232 m), MGS MOLA colour shaded relief (463 m), Mars Odyssey THEMIS day IR (100 m), and the MOLA 8-bit DEM for approximate elevations outside Gale (±0.5 km)',
    url: 'https://trek.nasa.gov/mars/',
  },
  {
    group: 'Models & methods',
    name: 'Curiosity REMS ground temperature at Gale (Martínez et al. 2017, Space Sci. Rev. 212: 295–338)',
    what: 'Basis of the hover readout’s surface-temperature model: the typical sol range at Gale by local solar time, scaled by latitude, nudged by THEMIS night IR. A model, not a measurement',
    url: 'https://doi.org/10.1007/s11214-017-0360-x',
  },

  // ---- Models & methods
  {
    group: 'Models & methods',
    name: 'Pandolf, Givoni & Goldman (1977), J. Appl. Physiol. 43: 577–581',
    what: 'Metabolic cost of walking with a load; scaled to Mars gravity with a pressure-suit penalty for the O₂ budget',
    url: 'https://doi.org/10.1152/jappl.1977.43.4.577',
  },
  {
    group: 'Models & methods',
    name: "Tobler's hiking function",
    what: 'Walking speed vs slope (Tobler-style curve in the EVA model)',
    url: 'https://en.wikipedia.org/wiki/Tobler%27s_hiking_function',
  },
  {
    group: 'Models & methods',
    name: 'Mars24 algorithm: Allison & McEwen (2000), Planet. Space Sci. 48: 215–235 (NASA GISS)',
    what: 'Mars clock, local solar time, sunrise/sunset and season at Gale',
    url: 'https://www.giss.nasa.gov/tools/mars24/',
  },
  {
    group: 'Models & methods',
    name: 'Apollo lunar EVA metabolic rates (NASA TN D-7883)',
    what: 'Reference range the EVA model is checked against in docs/VALIDATION.md',
    url: 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD7883Metabolic.pdf',
  },

  // ---- Software
  {
    group: 'Software',
    name: 'Sol Atlas by The SOL Explorers',
    what: 'Our routing (A* on the elevation grid), EVA oxygen model, Mars-time code and data pipeline were adapted from it. Every adapted file lists its changes',
    url: 'https://github.com/saracen66/the-sol-explorers',
  },
  { group: 'Software', name: 'MapLibre GL JS', what: 'Map rendering, layers, 3D terrain', url: 'https://maplibre.org/', license: 'BSD-3-Clause' },
  { group: 'Software', name: 'Next.js', what: 'Web app framework (and the space-weather server route)', url: 'https://nextjs.org/', license: 'MIT' },
  { group: 'Software', name: 'Rasterio, NumPy, SciPy, Pillow', what: 'Python data pipeline (data/build_region.py)', url: 'https://rasterio.readthedocs.io/' },
  {
    group: 'Software',
    name: 'Claude Code (Anthropic)',
    what: 'Development only: Claude Code helped write the code and docs under our direction. Nothing in the running app uses AI',
    url: 'https://www.anthropic.com/claude',
  },
];
