const DATA_URL = "./spots.json";
const STORAGE_KEY = "big-red-rank-preferences-v3";

const SENTIMENTS = {
  like: { label: "Like", icon: "♥", range: [8, 10] },
  mid: { label: "Mid", icon: "—", range: [5, 7.4] },
  dislike: { label: "Dislike", icon: "×", range: [2, 4.4] },
  unvisited: { label: "Haven't been", icon: "?", range: null },
};

const els = {
  categoryTabs: document.querySelector("#categoryTabs"),
  experienceScreen: document.querySelector("#experienceScreen"),
  leaderboard: document.querySelector("#leaderboard"),
  leaderboardMeta: document.querySelector("#leaderboardMeta"),
  leaderboardTitle: document.querySelector("#leaderboardTitle"),
  modelConfidence: document.querySelector("#modelConfidence"),
  resetButton: document.querySelector("#resetButton"),
  stepClassify: document.querySelector("#stepClassify"),
  stepCompare: document.querySelector("#stepCompare"),
  stepResults: document.querySelector("#stepResults"),
  stepProgress: document.querySelector("#stepProgress"),
};

let spotsByCategory = {};
let activeCategory = "libraries";
let state = { categories: {} };

init();

async function init() {
  spotsByCategory = await loadSpots();
  activeCategory = Object.keys(spotsByCategory)[0] ?? "libraries";
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

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { categories: {} };
  } catch {
    return { categories: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureStateShape() {
  state.categories ??= {};

  Object.keys(spotsByCategory).forEach((category) => {
    state.categories[category] ??= {
      sentiments: {},
      comparisons: [],
    };
  });
}

function bindEvents() {
  els.resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = { categories: {} };
    ensureStateShape();
    render();
  });
}

function render() {
  renderTabs();
  renderStepper();
  renderExperience();
  renderLeaderboard();
  renderConfidence();
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
      render();
    });
    els.categoryTabs.append(button);
  });
}

function renderStepper() {
  const stage = getStage();
  const classified = getClassifiedCount();
  const total = getCurrentSpots().length;
  const classificationProgress = total ? classified / total : 0;

  [els.stepClassify, els.stepCompare, els.stepResults].forEach((step) => {
    step.classList.remove("active", "complete");
  });

  if (stage === "classify") {
    els.stepClassify.classList.add("active");
  } else {
    els.stepClassify.classList.add("complete");
  }

  if (stage === "compare") {
    els.stepCompare.classList.add("active");
  } else if (stage === "results") {
    els.stepCompare.classList.add("complete");
    els.stepResults.classList.add("active");
  }

  els.stepProgress.style.width = `${Math.round(classificationProgress * 100)}%`;
}

function renderExperience() {
  const stage = getStage();

  if (stage === "classify") {
    renderClassification();
  } else if (stage === "compare") {
    renderComparison();
  } else {
    renderResults();
  }
}

function renderClassification() {
  const spots = getCurrentSpots();
  const categoryState = getCategoryState();
  const spot = spots.find((item) => !categoryState.sentiments[item.id]);
  const current = getClassifiedCount();

  if (!spot) {
    render();
    return;
  }

  els.experienceScreen.innerHTML = `
    <div class="screen-heading">
      <div>
        <p class="section-label">Quick take · ${current + 1} of ${spots.length}</p>
        <h2>What's your read?</h2>
      </div>
      <span class="learning-badge"><i></i> Learning your taste</span>
    </div>

    <div class="classification-layout">
      <article class="feature-spot">
        <div class="spot-visual">
          <span>${formatCategory(activeCategory).slice(0, -1)}</span>
          <strong>${String(current + 1).padStart(2, "0")}</strong>
        </div>
        <div class="feature-copy">
          <p class="spot-area">${spot.area}</p>
          <h3>${spot.name}</h3>
          <p>${spot.description}</p>
          <div class="tag-row">
            ${(spot.tags ?? []).map((tag) => `<span>${tag}</span>`).join("")}
          </div>
          <div class="community-note">
            <span>Community average</span>
            <strong>${spot.averageUserScore}</strong>
            <small>${spot.reviewCount ?? 0} demo reviews</small>
          </div>
        </div>
      </article>

      <div class="sentiment-actions">
        ${Object.entries(SENTIMENTS)
          .map(
            ([key, sentiment]) => `
              <button class="sentiment-button ${key}" type="button" data-sentiment="${key}">
                <span>${sentiment.icon}</span>
                <strong>${sentiment.label}</strong>
                <small>${getSentimentHint(key)}</small>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;

  els.experienceScreen
    .querySelectorAll("[data-sentiment]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        categoryState.sentiments[spot.id] = button.dataset.sentiment;
        categoryState.comparisons = removeInvalidComparisons(
          categoryState.comparisons,
        );
        saveState();
        render();
      });
    });
}

function renderComparison() {
  const pair = getNextComparison();
  const progress = getComparisonProgress();

  if (!pair) {
    render();
    return;
  }

  const [left, right] = pair;
  const sentiment = getCategoryState().sentiments[left.id];
  const sentimentMeta = SENTIMENTS[sentiment];

  els.experienceScreen.innerHTML = `
    <div class="screen-heading">
      <div>
        <p class="section-label">Taste calibration · ${progress.done + 1} of ${progress.total}</p>
        <h2>Which belongs higher?</h2>
      </div>
      <span class="learning-badge"><i></i> Comparing ${sentimentMeta.label.toLowerCase()} picks</span>
    </div>

    <div class="versus-grid">
      ${comparisonCard(left, "left")}
      <div class="versus-mark"><span>or</span></div>
      ${comparisonCard(right, "right")}
    </div>

    <button class="tie-button" type="button" data-tie>
      Too close to call <span>Mark as a tie</span>
    </button>
  `;

  els.experienceScreen.querySelectorAll("[data-winner]").forEach((button) => {
    button.addEventListener("click", () =>
      recordComparison(pair, button.dataset.winner),
    );
  });

  els.experienceScreen
    .querySelector("[data-tie]")
    .addEventListener("click", () => {
      recordComparison(pair, null);
    });
}

function comparisonCard(spot, side) {
  return `
    <button class="comparison-card ${side}" type="button" data-winner="${spot.id}">
      <div class="comparison-orb">${spot.name.charAt(0)}</div>
      <p class="spot-area">${spot.area}</p>
      <h3>${spot.name}</h3>
      <p>${spot.description}</p>
      <div class="comparison-footer">
        <span>Community ${spot.averageUserScore}</span>
        <strong>Choose this spot →</strong>
      </div>
    </button>
  `;
}

function renderResults() {
  const ranking = calculateRanking();
  const topSpot = ranking[0];

  els.experienceScreen.innerHTML = `
    <div class="results-screen">
      <span class="result-spark">✦</span>
      <p class="section-label">Preference model complete</p>
      <h2>Your Cornell taste, decoded.</h2>
      <p>
        You placed <strong>${topSpot?.name ?? "this category"}</strong> at the top.
        Your scores were inferred from ${getClassifiedCount()} first impressions
        and ${getCategoryState().comparisons.length} head-to-head decisions.
      </p>
      <div class="result-stats">
        <div><strong>${topSpot?.personalScore ?? "—"}</strong><span>top score</span></div>
        <div><strong>${getOverallConfidence()}%</strong><span>confidence</span></div>
        <div><strong>${getCategoryState().comparisons.length}</strong><span>comparisons</span></div>
      </div>
      <button class="primary-button" type="button" data-refine>Refine my answers</button>
    </div>
  `;

  els.experienceScreen
    .querySelector("[data-refine]")
    .addEventListener("click", () => {
      getCategoryState().comparisons = [];
      saveState();
      render();
    });
}

function renderLeaderboard() {
  const ranking = calculateRanking();
  const classifiedCount = getClassifiedCount();

  els.leaderboardTitle.textContent = formatCategory(activeCategory);
  els.leaderboardMeta.textContent = classifiedCount
    ? `${classifiedCount} of ${getCurrentSpots().length} spots modeled`
    : "Classify spots to build your ranking";
  els.leaderboard.innerHTML = "";

  ranking.forEach((spot, index) => {
    const sentiment = getCategoryState().sentiments[spot.id];
    const item = document.createElement("li");
    item.className = sentiment
      ? "leaderboard-item modeled"
      : "leaderboard-item";
    item.innerHTML = `
      <span class="rank-number">${index + 1}</span>
      <div class="rank-copy">
        <div>
          <strong>${spot.name}</strong>
          ${sentiment ? `<span class="sentiment-chip ${sentiment}">${SENTIMENTS[sentiment].label}</span>` : ""}
        </div>
        <p>${spot.area} · Community ${spot.averageUserScore}</p>
      </div>
      <div class="leaderboard-scores">
        <span class="score">${spot.personalScore ?? "—"}</span>
        <small>${
          sentiment === "unvisited"
            ? "not visited"
            : spot.confidence
              ? `${spot.confidence}% confident`
              : "not modeled"
        }</small>
      </div>
    `;
    els.leaderboard.append(item);
  });
}

function renderConfidence() {
  els.modelConfidence.textContent = `${getOverallConfidence()}%`;
}

function recordComparison(pair, winnerId) {
  getCategoryState().comparisons.push({
    a: pair[0].id,
    b: pair[1].id,
    winner: winnerId,
  });
  saveState();
  render();
}

function getStage() {
  if (getClassifiedCount() < getCurrentSpots().length) {
    return "classify";
  }

  return getNextComparison() ? "compare" : "results";
}

function getNextComparison() {
  const answered = new Set(
    getCategoryState().comparisons.map(({ a, b }) => pairKey(a, b)),
  );

  return (
    getAllPairs().find(([a, b]) => !answered.has(pairKey(a.id, b.id))) ?? null
  );
}

function getAllPairs() {
  const categoryState = getCategoryState();
  const pairs = [];

  Object.keys(SENTIMENTS).forEach((sentiment) => {
    if (!SENTIMENTS[sentiment].range) {
      return;
    }

    const group = getCurrentSpots().filter(
      (spot) => categoryState.sentiments[spot.id] === sentiment,
    );

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        pairs.push([group[i], group[j]]);
      }
    }
  });

  return pairs;
}

function getComparisonProgress() {
  return {
    done: getCategoryState().comparisons.length,
    total: getAllPairs().length,
  };
}

function removeInvalidComparisons(comparisons) {
  const validPairs = new Set(
    getAllPairs().map(([a, b]) => pairKey(a.id, b.id)),
  );
  return comparisons.filter(({ a, b }) => validPairs.has(pairKey(a, b)));
}

function calculateRanking() {
  const categoryState = getCategoryState();
  const spots = getCurrentSpots().map((spot) => {
    const sentiment = categoryState.sentiments[spot.id];

    if (!sentiment) {
      return { ...spot, personalScore: null, confidence: 0 };
    }

    if (!SENTIMENTS[sentiment].range) {
      return { ...spot, personalScore: null, confidence: 0 };
    }

    const group = getCurrentSpots().filter(
      (item) => categoryState.sentiments[item.id] === sentiment,
    );
    const comparisons = categoryState.comparisons.filter(
      ({ a, b }) => a === spot.id || b === spot.id,
    );
    const points = comparisons.reduce((total, comparison) => {
      if (comparison.winner === spot.id) return total + 1;
      if (comparison.winner === null) return total + 0.5;
      return total;
    }, 0);
    const [minimum, maximum] = SENTIMENTS[sentiment].range;
    const isPerfectLike =
      sentiment === "like" &&
      (group.length === 1 || points === group.length - 1);
    const ratio = isPerfectLike
      ? 1
      : group.length > 1
        ? (points + 1) / (group.length + 1)
        : 0.5;
    const personalScore = String(minimum + ratio * (maximum - minimum));
    const confidence =
      group.length > 1
        ? Math.round(55 + (comparisons.length / (group.length - 1)) * 40)
        : 72;

    return {
      ...spot,
      personalScore,
      confidence: Math.min(confidence, 95),
    };
  });

  return spots.sort((a, b) => {
    if (a.personalScore !== null && b.personalScore !== null) {
      if (a.personalScore === b.personalScore) {
        return b.averageUserScore - a.averageUserScore;
      }

      return a.personalScore < b.personalScore ? 1 : -1;
    }
    if (a.personalScore !== null) return -1;
    if (b.personalScore !== null) return 1;
    return b.averageUserScore - a.averageUserScore;
  });
}

function getOverallConfidence() {
  const totalSpots = getCurrentSpots().length;
  if (!totalSpots) return 0;

  const classificationWeight = (getClassifiedCount() / totalSpots) * 55;
  const allPairs = getAllPairs().length;
  const comparisonWeight = allPairs
    ? (getCategoryState().comparisons.length / allPairs) * 40
    : getClassifiedCount() === totalSpots
      ? 40
      : 0;

  return Math.round(classificationWeight + comparisonWeight);
}

function getClassifiedCount() {
  return Object.keys(getCategoryState().sentiments).length;
}

function getCategoryState() {
  return state.categories[activeCategory];
}

function getCurrentSpots() {
  return [...(spotsByCategory[activeCategory] ?? [])];
}

function pairKey(a, b) {
  return [a, b].sort().join("::");
}

function getSentimentHint(sentiment) {
  if (sentiment === "like") return "I'd seek it out";
  if (sentiment === "mid") return "It's fine, not special";
  if (sentiment === "dislike") return "I'd rather go elsewhere";
  return "Save it for later";
}

function formatCategory(category) {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
