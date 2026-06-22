const PILLARS = [
  "Governance & Institutions",
  "Risk Reduction & Exposure Management",
  "Infrastructure & Essential Services",
  "Socioeconomic Resilience",
  "Preparedness & Recovery Capacity",
];
const SHORT_PILLARS = [
  "Governance & Institutions",
  "Risk Reduction & Exposure Management",
  "Infrastructure & Essential Services",
  "Socioeconomic Resilience",
  "Preparedness & Recovery Capacity",
];
const DATA_EXPLANATION =
  "Current values are indicative starter values used to demonstrate the SADRI methodology and dashboard functions. They should be replaced with verified source data before formal citation or policy use.";
const DATA = [
  ["SGP", "Singapore", "Medium", [82, 76, 88, 84, 78]],
  ["BRN", "Brunei Darussalam", "Low", [70, 67, 74, 72, 66]],
  ["MYS", "Malaysia", "Medium", [68, 63, 71, 66, 69]],
  ["THA", "Thailand", "Medium", [63, 58, 67, 61, 64]],
  ["VNM", "Viet Nam", "Medium", [61, 60, 59, 57, 66]],
  ["IDN", "Indonesia", "Medium", [58, 55, 61, 54, 62]],
  ["PHL", "Philippines", "Medium", [56, 52, 58, 53, 65]],
  ["LAO", "Lao PDR", "Low", [47, 44, 45, 42, 49]],
  ["KHM", "Cambodia", "Low", [45, 43, 42, 40, 47]],
  ["TLS", "Timor-Leste", "Low", [42, 39, 36, 38, 44]],
  ["MMR", "Myanmar", "Low", [38, 41, 35, 37, 39]],
].map(([iso3, name, confidence, pillars]) => ({
  iso3,
  name,
  confidence,
  pillars,
  score: avg(pillars),
  dataStatus: "Provisional dashboard data",
}));
const CODEBOOK = [
  ["Governance & Institutions", "Policy frameworks, coordination capacity, public finance, local implementation", "Higher score = stronger institutional resilience", "Use verified governance and disaster-risk-management sources."],
  ["Risk Reduction & Exposure Management", "Hazard exposure, vulnerability, mitigation investment, land-use controls", "Risk-based inputs reverse-coded", "Lower raw risk must become a higher 0-100 resilience score."],
  ["Infrastructure & Essential Services", "Health, water, transport, power, communications, service continuity", "Higher score = stronger service resilience", "Prefer comparable regional or international datasets."],
  ["Socioeconomic Resilience", "Poverty, social protection, education, fiscal space, adaptive capacity", "Deprivation inputs reverse-coded", "Document missingness and whether values are national or subnational."],
  ["Preparedness & Recovery Capacity", "Early warning, contingency planning, logistics, insurance, recovery finance", "Higher score = stronger preparedness and recovery capacity", "Record source year, coverage, and event-performance limits."],
];
const MAP_BOUNDS = [[-12, 92], [25, 142]];
const CALLOUTS = {
  SGP: { center: [1.3521, 103.8198], label: "Singapore" },
  BRN: { center: [4.5353, 114.7277], label: "Brunei" },
};
const byIso = new Map(DATA.map((d) => [d.iso3, d]));
const ranked = [...DATA].sort((a, b) => b.score - a.score).map((d, i) => ({ ...d, rank: i + 1 }));
let selectedIso = ranked[0].iso3;
let mapLayer;
let calloutMarkers = [];

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", () => drawRadar(byIso.get(selectedIso)));

function init() {
  document.querySelector("#dataExplanation").textContent = DATA_EXPLANATION;
  document.querySelector("#methodDataNote").textContent = DATA_EXPLANATION;
  document.querySelector("#countryCount").textContent = DATA.length;
  document.querySelector("#regionalMean").textContent = avg(DATA.map((d) => d.score)).toFixed(1);
  renderLegend();
  renderRanking();
  renderHeatmap();
  renderCodebook();
  populateSensitivity();
  setupMap();
  updateProfile(selectedIso);
  updateSensitivity();
  setCsvDownload();
}

function avg(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function category(score) {
  if (score >= 80) return ["Very high", "#287857"];
  if (score >= 65) return ["High", "#0d6b66"];
  if (score >= 50) return ["Moderate", "#b8871e"];
  if (score >= 35) return ["Emerging", "#b46b30"];
  return ["Limited", "#b14a3f"];
}

function color(score) {
  return category(score)[1];
}

async function setupMap() {
  const geojson = await loadSoutheastAsiaGeoJson();
  if (!geojson) return;

  if (window.L) {
    const map = L.map("map", {
      maxBounds: MAP_BOUNDS,
      maxBoundsViscosity: 0.65,
      scrollWheelZoom: false,
    }).setView([6, 113], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 8,
      opacity: 0.46,
      className: "base-map-tiles",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    mapLayer = L.geoJSON(geojson, {
      style: (f) => styleFor(getFeatureIso(f)),
      onEachFeature: (f, layer) => {
        const iso = getFeatureIso(f);
        const c = byIso.get(iso);
        layer.bindTooltip(tooltipHtml(c), { sticky: true, direction: "top" });
        layer.on({
          mouseover: () => layer.setStyle({ weight: 2, color: "#17201d", fillOpacity: 0.78 }),
          mouseout: () => {
            mapLayer.resetStyle(layer);
            updateMapSelection();
          },
          click: () => updateProfile(iso),
        });
      },
    }).addTo(map);
    addCallouts(map);
    map.fitBounds(MAP_BOUNDS, { padding: [16, 16] });
    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(MAP_BOUNDS, { padding: [16, 16] });
    }, 100);
    return;
  }
  renderSvgMap(geojson);
}

async function loadSoutheastAsiaGeoJson() {
  try {
    const response = await fetch("southeast-asia.geojson");
    if (!response.ok) throw new Error("Boundary file unavailable");
    const geojson = await response.json();
    validateGeoJson(geojson);
    return geojson;
  } catch (error) {
    document.querySelector("#map").innerHTML = `<div class="map-error">Unable to load Southeast Asia country boundaries.</div>`;
    return null;
  }
}

function validateGeoJson(geojson) {
  const missing = DATA.filter((country) => !geojson.features.some((feature) => getFeatureIso(feature) === country.iso3));
  if (missing.length) throw new Error(`Missing GeoJSON countries: ${missing.map((country) => country.iso3).join(", ")}`);
  const mismatchedNames = DATA.filter((country) => {
    const feature = geojson.features.find((item) => getFeatureIso(item) === country.iso3);
    return feature.properties.name !== country.name;
  });
  if (mismatchedNames.length) throw new Error(`GeoJSON name mismatch: ${mismatchedNames.map((country) => country.iso3).join(", ")}`);
}

function getFeatureIso(feature) {
  return feature.properties.iso3 || feature.properties.ISO_A3 || feature.properties["ISO3166-1-Alpha-3"];
}

function styleFor(iso) {
  const c = byIso.get(iso);
  return {
    color: selectedIso === iso ? "#15211e" : "#f7fbf9",
    weight: selectedIso === iso ? 2.6 : 1,
    fillColor: color(c.score),
    fillOpacity: selectedIso === iso ? 0.82 : 0.65,
    opacity: 1,
  };
}

function addCallouts(map) {
  calloutMarkers = Object.entries(CALLOUTS).map(([iso, callout]) => {
    const c = byIso.get(iso);
    L.tooltip({
      permanent: true,
      direction: "right",
      offset: [8, 0],
      className: "callout-label",
    })
      .setLatLng(callout.center)
      .setContent(callout.label)
      .addTo(map);
    const marker = L.circleMarker(callout.center, calloutStyle(iso))
      .bindTooltip(tooltipHtml(c), { sticky: true, direction: "top", className: "country-tooltip" })
      .on("click", () => updateProfile(iso))
      .on("mouseover", () => marker.setStyle({ radius: 9, weight: 2.5, color: "#15211e" }))
      .on("mouseout", () => marker.setStyle(calloutStyle(iso)))
      .addTo(map);
    marker.sadriIso = iso;
    return marker;
  });
}

function calloutStyle(iso) {
  const c = byIso.get(iso);
  return {
    radius: selectedIso === iso ? 9 : 7,
    color: selectedIso === iso ? "#15211e" : "#ffffff",
    weight: selectedIso === iso ? 2.8 : 1.6,
    fillColor: color(c.score),
    fillOpacity: 0.95,
  };
}

function renderSvgMap(geojson) {
  const map = document.querySelector("#map");
  const bounds = { minLon: 92, maxLon: 142, minLat: -11, maxLat: 29 };
  const w = 900;
  const h = 560;
  const pad = 22;
  const project = ([lon, lat]) => [
    pad + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (w - pad * 2),
    pad + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (h - pad * 2),
  ];
  const paths = geojson.features.map((f) => {
    const iso = getFeatureIso(f);
    const c = byIso.get(iso);
    const rings = getOuterRings(f.geometry);
    const d = rings.map((ring) => `M ${ring.map((p) => project(p).join(" ")).join(" L ")} Z`).join(" ");
    const points = rings.flat();
    const center = [avg(points.map((p) => project(p)[0])), avg(points.map((p) => project(p)[1]))];
    return `<g data-iso="${iso}" tabindex="0" role="button" aria-label="${c.name}">
      <path class="svg-country" d="${d}" fill="${color(c.score)}"></path>
      <text class="svg-label" x="${center[0]}" y="${center[1]}" text-anchor="middle">${iso}</text>
    </g>`;
  }).join("");
  map.innerHTML = `<svg class="svg-map" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#dbe8e8"></rect>${paths}</svg><div id="mapTooltip" class="tooltip" hidden></div>`;
  map.querySelectorAll("g[data-iso]").forEach((node) => {
    node.addEventListener("click", () => updateProfile(node.dataset.iso));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") updateProfile(node.dataset.iso);
    });
    node.addEventListener("mousemove", (e) => showSvgTip(e, node.dataset.iso));
    node.addEventListener("mouseleave", () => { document.querySelector("#mapTooltip").hidden = true; });
  });
}

function getOuterRings(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.slice(0, 1);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function showSvgTip(event, iso) {
  const tip = document.querySelector("#mapTooltip");
  const box = document.querySelector("#map").getBoundingClientRect();
  tip.innerHTML = tooltipHtml(byIso.get(iso));
  tip.hidden = false;
  tip.style.left = `${Math.min(event.clientX - box.left + 14, box.width - 280)}px`;
  tip.style.top = `${Math.max(event.clientY - box.top - 18, 10)}px`;
}

function tooltipHtml(c) {
  const r = ranked.find((d) => d.iso3 === c.iso3);
  const sw = strongestWeakest(c);
  return `<strong>${c.name}</strong><br>SADRI score: <b>${c.score.toFixed(1)}</b><br>Rank: <b>${r.rank} of ${DATA.length}</b><br>Category: <b>${category(c.score)[0]}</b><br>Strongest: <b>${sw.strongest.pillar}</b><br>Weakest: <b>${sw.weakest.pillar}</b><br>Data confidence: <b>${c.confidence}</b>`;
}

function strongestWeakest(c) {
  const pairs = PILLARS.map((pillar, i) => ({ pillar, value: c.pillars[i] }));
  return {
    strongest: [...pairs].sort((a, b) => b.value - a.value)[0],
    weakest: [...pairs].sort((a, b) => a.value - b.value)[0],
  };
}

function updateProfile(iso) {
  selectedIso = iso;
  const c = byIso.get(iso);
  const r = ranked.find((d) => d.iso3 === iso);
  const cat = category(c.score);
  const sw = strongestWeakest(c);
  document.querySelector("#selectedMetric").textContent = c.name;
  document.querySelector("#profileName").textContent = c.name;
  document.querySelector("#profileCategory").textContent = cat[0];
  document.querySelector("#profileCategory").style.background = cat[1];
  document.querySelector("#profileCategory").style.color = "#fff";
  document.querySelector("#profileScore").textContent = c.score.toFixed(1);
  document.querySelector("#profileRank").textContent = `${r.rank} / ${DATA.length}`;
  document.querySelector("#profileConfidence").textContent = c.confidence;
  document.querySelector("#interpretationText").textContent = `${possessive(c.name)} provisional dashboard profile is strongest in ${sw.strongest.pillar.toLowerCase()} (${sw.strongest.value}) and weakest in ${sw.weakest.pillar.toLowerCase()} (${sw.weakest.value}). Treat this as a prototype diagnostic until verified source data replace the starter values.`;
  document.querySelector("#pillarBars").innerHTML = PILLARS.map((pillar, i) => `<div class="bar-row"><header><strong>${pillar}</strong><span>${c.pillars[i]}</span></header><div class="track"><div class="fill" style="width:${c.pillars[i]}%;background:${color(c.pillars[i])}"></div></div></div>`).join("");
  document.querySelectorAll("#rankingBody tr").forEach((row) => row.classList.toggle("active", row.dataset.iso === iso));
  document.querySelectorAll(".heat-cell[data-iso]").forEach((cell) => cell.classList.toggle("active-heat", cell.dataset.iso === iso));
  document.querySelectorAll(".svg-country").forEach((path) => path.classList.toggle("selected", path.parentElement.dataset.iso === iso));
  updateMapSelection();
  const scenarioCountry = document.querySelector("#scenarioCountry");
  if (scenarioCountry.value !== iso) {
    scenarioCountry.value = iso;
    updateSensitivity();
  }
  drawRadar(c);
}

function updateMapSelection() {
  if (mapLayer) mapLayer.eachLayer((layer) => layer.setStyle(styleFor(getFeatureIso(layer.feature))));
  calloutMarkers.forEach((marker) => marker.setStyle(calloutStyle(marker.sadriIso)));
}

function possessive(name) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function drawRadar(c) {
  const canvas = document.querySelector("#radar");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * scale);
  canvas.height = Math.max(1, rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const cx = rect.width / 2;
  const cy = rect.height / 2 + 4;
  const radius = Math.min(rect.width, rect.height) * 0.33;
  const angles = SHORT_PILLARS.map((_, i) => -Math.PI / 2 + (i * Math.PI * 2) / SHORT_PILLARS.length);
  ctx.strokeStyle = "#d9e2de";
  ctx.fillStyle = "#61706b";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  [0.2, 0.4, 0.6, 0.8, 1].forEach((ring) => {
    ctx.beginPath();
    angles.forEach((a, i) => {
      const x = cx + Math.cos(a) * radius * ring;
      const y = cy + Math.sin(a) * radius * ring;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  angles.forEach((a, i) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
    ctx.fillText(SHORT_PILLARS[i], cx + Math.cos(a) * (radius + 50), cy + Math.sin(a) * (radius + 32), 126);
  });
  ctx.beginPath();
  c.pillars.forEach((value, i) => {
    const x = cx + Math.cos(angles[i]) * radius * (value / 100);
    const y = cy + Math.sin(angles[i]) * radius * (value / 100);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(13,107,102,.18)";
  ctx.strokeStyle = "#0d6b66";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function renderRanking() {
  document.querySelector("#rankingBody").innerHTML = ranked.map((c) => `<tr data-iso="${c.iso3}">
    <td>${c.rank}</td>
    <td><strong>${c.name}</strong><small>${c.dataStatus}</small></td>
    <td class="score-cell"><div class="score-bar"><strong>${c.score.toFixed(1)}</strong><div class="track"><div class="fill" style="width:${c.score}%;background:${color(c.score)}"></div></div></div></td>
    <td><span class="badge" style="background:${color(c.score)};border-color:${color(c.score)};color:#fff">${category(c.score)[0]}</span></td>
    <td>${c.confidence}</td>
  </tr>`).join("");
  document.querySelectorAll("#rankingBody tr").forEach((row) => row.addEventListener("click", () => updateProfile(row.dataset.iso)));
}

function renderHeatmap() {
  const head = ["Country", ...PILLARS].map((x) => `<div class="heat-cell heat-head">${x}</div>`).join("");
  const rows = ranked.map((c) => `<div class="heat-cell heat-country" data-iso="${c.iso3}">${c.name}</div>${c.pillars.map((v) => `<div class="heat-cell" data-iso="${c.iso3}" style="background:${color(v)}">${v}</div>`).join("")}`).join("");
  document.querySelector("#heatmapGrid").innerHTML = `<div class="heat-grid">${head}${rows}</div>`;
}

function renderCodebook() {
  document.querySelector("#codebookBody").innerHTML = CODEBOOK.map((r) => `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("");
}

function populateSensitivity() {
  document.querySelector("#scenarioCountry").innerHTML = ranked.map((c) => `<option value="${c.iso3}">${c.name}</option>`).join("");
  document.querySelector("#scenarioPillar").innerHTML = PILLARS.map((p, i) => `<option value="${i}">${p}</option>`).join("");
  ["#scenarioCountry", "#scenarioPillar", "#scenarioDelta"].forEach((id) => document.querySelector(id).addEventListener("input", updateSensitivity));
}

function updateSensitivity() {
  const iso = document.querySelector("#scenarioCountry").value || selectedIso;
  const idx = Number(document.querySelector("#scenarioPillar").value || 0);
  const delta = Number(document.querySelector("#scenarioDelta").value || 0);
  const c = byIso.get(iso);
  const pillars = [...c.pillars];
  pillars[idx] = Math.min(100, Math.max(0, pillars[idx] + delta));
  const scenarioScore = avg(pillars);
  const scenarioRank = [...DATA.map((d) => ({ ...d, score: d.iso3 === iso ? scenarioScore : d.score }))].sort((a, b) => b.score - a.score).findIndex((d) => d.iso3 === iso) + 1;
  document.querySelector("#deltaText").textContent = delta > 0 ? `+${delta}` : delta;
  document.querySelector("#officialScore").textContent = c.score.toFixed(1);
  document.querySelector("#scenarioScore").textContent = scenarioScore.toFixed(1);
  document.querySelector("#scenarioRank").textContent = `${scenarioRank} / ${DATA.length}`;
  document.querySelector("#scenarioNote").textContent = `Exploratory scenario only: ${PILLARS[idx].toLowerCase()} changes by ${delta} score points for ${c.name}. The official score remains ${c.score.toFixed(1)} and is calculated as the average of the five fixed 20% pillars.`;
}

function renderLegend() {
  const bins = [["Very high", "#287857"], ["High", "#0d6b66"], ["Moderate", "#b8871e"], ["Emerging", "#b46b30"], ["Limited", "#b14a3f"]];
  document.querySelector("#legend").innerHTML = bins.map(([label, c]) => `<span><i style="background:${c}"></i>${label}</span>`).join("");
}

function buildCsv() {
  const header = ["country", "iso3", "sadri_score", "rank", "category", "data_confidence", "data_status", ...PILLARS.map((p) => p.toLowerCase().replaceAll(" & ", "_and_").replaceAll(" ", "_"))];
  const rows = ranked.map((c) => [c.name, c.iso3, c.score.toFixed(1), c.rank, category(c.score)[0], c.confidence, c.dataStatus, ...c.pillars]);
  return [header, ...rows].map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function setCsvDownload() {
  const link = document.querySelector("#downloadCsv");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(buildCsv())}`;
}
