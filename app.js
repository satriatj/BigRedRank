const DATA_URL = "./spots.json";
const STORAGE_KEY = "big-red-rank-ratings-v2";

const els = {
  categoryTabs: document.querySelector("#categoryTabs"),
  leaderboard: document.querySelector("#leaderboard"),
  leaderboardTitle: document.querySelector("#leaderboardTitle"),
  leaderboardMeta: document.querySelector("#leaderboardMeta"),
  ratingMeta: document.querySelector("#ratingMeta"),
  ratingScale: document.querySelector("#ratingScale"),
  resetButton: document.querySelector("#resetButton"),
  selectedSpot: document.querySelector("#selectedSpot"),
  selectedSpotName: document.querySelector("#selectedSpotName"),
  spotPicker: document.querySelector("#spotPicker")
};

let spotsByCategory = {};
let activeCategory = "libraries";
let selectedSpotId = "";
let state = {
  ratings: {}
};

init();

async function init() {
  spotsByCategory = await loadSpots();
  activeCategory = Object.keys(spotsByCategory)[0] ?? "libraries";
  selectedSpotId = spotsByCategory[activeCategory]?.[0]?.id ?? "";
  state = loadState();
  ensureStateShape();
  bindEvents();
  render();
}

async function loadSpots() {
  const response = await fetch(DATA_URL);

  if (!response.ok) {
    throw new Error("Could not load demo spot data.");
  }

  return response.json();
}

function bindEvents() {
  els.resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = {
      ratings: {}
    };
    ensureStateShape();
    render();
  });
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { ratings: {} };
  } catch {
    return { ratings: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureStateShape() {
  Object.keys(spotsByCategory).forEach((category) => {
    state.ratings[category] ??= {};
  });
}

function render() {
  renderTabs();
  renderSpotPicker();
  renderSelectedSpot();
  renderRatingScale();
  renderLeaderboard();
}

function renderTabs() {
  els.categoryTabs.innerHTML = "";

  Object.keys(spotsByCategory).forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = category === activeCategory ? "tab active" : "tab";
    button.textContent = formatCategory(category);
    button.addEventListener("click", () => {
      activeCategory = category;
      selectedSpotId = spotsByCategory[category]?.[0]?.id ?? "";
      render();
    });

    els.categoryTabs.append(button);
  });
}

function renderSpotPicker() {
  const spots = spotsByCategory[activeCategory] ?? [];
  els.spotPicker.innerHTML = "";

  spots.forEach((spot) => {
    const personalRating = getPersonalRating(spot.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      spot.id === selectedSpotId ? "spot-picker-item active" : "spot-picker-item";
    button.innerHTML = `
      <span>
        <strong>${spot.name}</strong>
        <small>${spot.area}</small>
      </span>
      <span class="picker-score">${personalRating ? personalRating.toFixed(1) : "-"}</span>
    `;
    button.addEventListener("click", () => {
      selectedSpotId = spot.id;
      renderSpotPicker();
      renderSelectedSpot();
      renderRatingScale();
    });

    els.spotPicker.append(button);
  });
}

function renderSelectedSpot() {
  const spot = getSelectedSpot();

  if (!spot) {
    els.selectedSpotName.textContent = "Add a spot";
    els.ratingMeta.textContent = "0 spots rated";
    els.selectedSpot.innerHTML = `
      <div class="empty-state">
        <h3>No spots yet</h3>
        <p>Add placeholder entries to spots.json to start rating.</p>
      </div>
    `;
    return;
  }

  const personalRating = getPersonalRating(spot.id);
  const ratedCount = getRatedCount();
  els.selectedSpotName.textContent = spot.name;
  els.ratingMeta.textContent = `${ratedCount} of ${getCurrentSpots().length} spots rated`;
  els.selectedSpot.innerHTML = `
    <p class="spot-area">${spot.area}</p>
    <h3>${spot.name}</h3>
    <p>${spot.description}</p>
    <div class="tag-row">
      ${(spot.tags ?? []).map((tag) => `<span>${tag}</span>`).join("")}
    </div>
    <div class="score-grid">
      <div>
        <span>Your score</span>
        <strong>${personalRating ? personalRating.toFixed(1) : "Not rated"}</strong>
      </div>
      <div>
        <span>Average user score</span>
        <strong>${formatScore(spot.averageUserScore)}</strong>
      </div>
      <div>
        <span>Demo reviews</span>
        <strong>${spot.reviewCount ?? 0}</strong>
      </div>
    </div>
  `;
}

function renderRatingScale() {
  const spot = getSelectedSpot();
  els.ratingScale.innerHTML = "";

  if (!spot) {
    return;
  }

  const personalRating = getPersonalRating(spot.id);

  for (let score = 1; score <= 10; score += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = personalRating === score ? "rating-button active" : "rating-button";
    button.textContent = score;
    button.setAttribute("aria-label", `Rate ${spot.name} ${score} out of 10`);
    button.addEventListener("click", () => handleRating(spot.id, score));
    els.ratingScale.append(button);
  }
}

function handleRating(spotId, score) {
  state.ratings[activeCategory][spotId] = score;
  saveState();
  renderSpotPicker();
  renderSelectedSpot();
  renderRatingScale();
  renderLeaderboard();
}

function renderLeaderboard() {
  const spots = getCurrentSpots().sort(compareSpots);
  const ratedCount = getRatedCount();

  els.leaderboardTitle.textContent = formatCategory(activeCategory);
  els.leaderboardMeta.textContent =
    ratedCount === 0
      ? "Ranked by demo average until you rate spots"
      : `${ratedCount} personal ratings`;
  els.leaderboard.innerHTML = "";

  spots.forEach((spot, index) => {
    const personalRating = getPersonalRating(spot.id);
    const item = document.createElement("li");
    item.className = personalRating ? "leaderboard-item rated" : "leaderboard-item";
    item.innerHTML = `
      <span class="rank-number">${index + 1}</span>
      <div>
        <strong>${spot.name}</strong>
        <p>${spot.area}</p>
      </div>
      <div class="leaderboard-scores">
        <span class="score">${personalRating ? personalRating.toFixed(1) : "-"}</span>
        <small>avg ${formatScore(spot.averageUserScore)}</small>
      </div>
    `;

    item.addEventListener("click", () => {
      selectedSpotId = spot.id;
      renderSpotPicker();
      renderSelectedSpot();
      renderRatingScale();
    });

    els.leaderboard.append(item);
  });
}

function compareSpots(a, b) {
  const aPersonal = getPersonalRating(a.id);
  const bPersonal = getPersonalRating(b.id);

  if (aPersonal && bPersonal) {
    return bPersonal - aPersonal || b.averageUserScore - a.averageUserScore;
  }

  if (aPersonal) {
    return -1;
  }

  if (bPersonal) {
    return 1;
  }

  return b.averageUserScore - a.averageUserScore;
}

function getCurrentSpots() {
  return [...(spotsByCategory[activeCategory] ?? [])];
}

function getSelectedSpot() {
  return getCurrentSpots().find((spot) => spot.id === selectedSpotId);
}

function getPersonalRating(spotId) {
  return state.ratings[activeCategory]?.[spotId] ?? null;
}

function getRatedCount() {
  return Object.keys(state.ratings[activeCategory] ?? {}).length;
}

function formatScore(score) {
  return Number(score ?? 0).toFixed(1);
}

function formatCategory(category) {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
