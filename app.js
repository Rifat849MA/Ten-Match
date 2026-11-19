import { firebaseConfig } from "./firebase-config.js";

const ROWS = 8;
const COLS = 8;
const HINTS_PER_LEVEL = 3;
const SHUFFLES_PER_LEVEL = 2;
const NEIGHBOR_EDGES = buildNeighborEdges();
const LOCAL_RANKS_KEY = "ruang-angka-local-ranks-v1";
const LOCAL_BEST_KEY = "ruang-angka-best-v1";
const FIREBASE_VERSION = "10.12.2";
const firebaseReady = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.projectId
  && firebaseConfig.appId
  && !firebaseConfig.apiKey.startsWith("GANTI_")
  && !firebaseConfig.projectId.startsWith("GANTI_")
  && !firebaseConfig.appId.startsWith("GANTI_")
);

const ui = {
  board: document.querySelector("#board"),
  score: document.querySelector("#score"),
  bestScore: document.querySelector("#best-score"),
  combo: document.querySelector("#combo"),
  lifeHearts: document.querySelector("#life-hearts"),
  timer: document.querySelector("#timer"),
  level: document.querySelector("#level-label"),
  difficulty: document.querySelector("#difficulty-label"),
  message: document.querySelector("#game-message"),
  overlay: document.querySelector("#board-overlay"),
  overlayTitle: document.querySelector("#overlay-title"),
  overlayCopy: document.querySelector("#overlay-copy"),
  nextLevel: document.querySelector("#next-level"),
  hint: document.querySelector("#hint-button"),
  hintCount: document.querySelector("#hint-count"),
  shuffle: document.querySelector("#shuffle-button"),
  shuffleCount: document.querySelector("#shuffle-count"),
  leaderboard: document.querySelector("#leaderboard-list"),
  rankScope: document.querySelector("#rank-scope"),
  leaderboardNote: document.querySelector("#leaderboard-note"),
  leaderboardCta: document.querySelector("#leaderboard-cta"),
  connection: document.querySelector("#connection-label"),
  accountButton: document.querySelector("#account-button"),
  accountName: document.querySelector("#account-name"),
  accountType: document.querySelector("#account-type"),
  avatar: document.querySelector("#avatar"),
  authDialog: document.querySelector("#auth-dialog"),
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authDescription: document.querySelector("#auth-description"),
  authUsernameField: document.querySelector("#username-field"),
  authUsername: document.querySelector("#auth-username"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authError: document.querySelector("#auth-error"),
  authSubmit: document.querySelector("#auth-submit"),
  authSwitch: document.querySelector("#auth-switch"),
  authLocalNote: document.querySelector("#auth-local-note"),
  toast: document.querySelector("#toast")
};

let board = [];
let selectedIndex = null;
let score = 0;
let level = 1;
let combo = 1;
let lastMatchAt = 0;
let startedAt = Date.now();
let lives = 3;
let hintsRemaining = HINTS_PER_LEVEL;
let shufflesRemaining = SHUFFLES_PER_LEVEL;
let matchesCleared = 0;
let mistakesMade = 0;
let isResolving = false;
let isGameOver = false;
let resolutionTimeout = null;
let activeUser = null;
let authMode = "login";
let firebaseServices = null;
let toastTimeout = null;
let hintTimeout = null;
let localPlayerName = localStorage.getItem("ruang-angka-guest-name-v1");
if (!localPlayerName) {
  localPlayerName = `Tamu-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem("ruang-angka-guest-name-v1", localPlayerName);
}
let currentBest = 0;

function bestScoreKey() {
  return `${LOCAL_BEST_KEY}-${activeUser?.uid || localPlayerName}`;
}

function buildNeighborEdges() {
  const edges = [];
  const directions = [[0, 1], [1, -1], [1, 0], [1, 1]];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const index = row * COLS + col;
      directions.forEach(([rowStep, colStep]) => {
        const nextRow = row + rowStep;
        const nextCol = col + colStep;
        if (nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS) {
          edges.push([index, nextRow * COLS + nextCol]);
        }
      });
      if (col === COLS - 1 && index + 1 < ROWS * COLS) edges.push([index, index + 1]);
    }
  }
  return edges;
}

function shuffleInPlace(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function getOpeningMoveRange() {
  const maximum = Math.max(3, 5 - Math.floor((level - 1) / 3));
  return { minimum: Math.max(2, maximum - 1), maximum };
}

function createBoard() {
  // Separate compatible values by checkerboard family, then reveal a few legal openings.
  const familyValues = [
    [1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 5, 5, 5, 5],
    [2, 2, 2, 2, 2, 2, 2, 2, 8, 8, 8, 8, 8, 8, 8, 8],
    [3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 7, 7, 7, 7, 7],
    [4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 6]
  ];
  const familyPositions = [[], [], [], []];
  for (let index = 0; index < ROWS * COLS; index += 1) {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    familyPositions[(row % 2) * 2 + (col % 2)].push(index);
  }

  const cells = new Array(ROWS * COLS);
  familyValues.forEach((values, family) => {
    shuffleInPlace(values);
    familyPositions[family].forEach((position, index) => { cells[position] = values[index]; });
  });

  const swaps = [];
  NEIGHBOR_EDGES.forEach(([first, second]) => {
    const secondRow = Math.floor(second / COLS);
    const secondCol = second % COLS;
    const family = (secondRow % 2) * 2 + (secondCol % 2);
    familyPositions[family].forEach((source) => {
      if (source !== second) swaps.push([first, source]);
    });
  });
  shuffleInPlace(swaps);

  const { minimum, maximum } = getOpeningMoveRange();
  let bestBoard = null;
  let bestDistance = Infinity;
  for (const [first, source] of swaps) {
    const candidate = [...cells];
    [candidate[first], candidate[source]] = [candidate[source], candidate[first]];
    const openingMoves = countOpeningMoves(candidate);
    if (openingMoves >= minimum && openingMoves <= maximum) return candidate;
    if (openingMoves > 0) {
      const distance = openingMoves < minimum
        ? minimum - openingMoves
        : openingMoves - maximum;
      if (distance < bestDistance) {
        bestBoard = candidate;
        bestDistance = distance;
      }
    }
  }
  return bestBoard || cells;
}

function countOpeningMoves(cells) {
  return NEIGHBOR_EDGES.reduce((count, [first, second]) => {
    return count + Number(cells[first] === cells[second] || cells[first] + cells[second] === 10);
  }, 0);
}

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function renderBoard() {
  ui.board.replaceChildren();
  board.forEach((value, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.setAttribute("role", "gridcell");
    tile.setAttribute("aria-label", value === null ? "Kosong" : `Angka ${value}`);
    tile.dataset.index = String(index);
    if (value === null) {
      tile.classList.add("empty");
      tile.disabled = true;
    } else {
      tile.textContent = String(value);
      tile.setAttribute("aria-pressed", String(selectedIndex === index));
      if (selectedIndex === index) tile.classList.add("selected");
      tile.disabled = isResolving || isGameOver;
      tile.addEventListener("click", () => selectTile(index));
    }
    ui.board.append(tile);
  });
  ui.score.textContent = formatScore(score);
  ui.bestScore.textContent = formatScore(currentBest);
  ui.combo.textContent = `×${combo}`;
  ui.level.textContent = `LEVEL ${String(level).padStart(2, "0")}`;
  const difficulty = level < 4
    ? { label: "MENENGAH", className: "medium" }
    : level < 7
      ? { label: "SULIT", className: "hard" }
      : { label: "AHLI", className: "expert" };
  ui.difficulty.textContent = difficulty.label;
  ui.difficulty.className = `difficulty-pill ${difficulty.className}`;
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  ui.timer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  renderToolCounts();
}

function renderLives(animateLost = false) {
  ui.lifeHearts.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const heart = document.createElement("span");
    heart.className = "life-heart";
    heart.textContent = "♥";
    heart.setAttribute("aria-hidden", "true");
    if (index >= lives) heart.classList.add("lost");
    if (animateLost && index === lives) heart.classList.add("just-lost");
    ui.lifeHearts.append(heart);
  }
  ui.lifeHearts.setAttribute("aria-label", `${lives} dari 3 nyawa tersisa`);
}

function renderToolCounts() {
  ui.hintCount.textContent = String(hintsRemaining);
  ui.shuffleCount.textContent = String(shufflesRemaining);
  const boardFinished = board.length > 0 && board.every((value) => value === null);
  ui.hint.disabled = hintsRemaining === 0 || isResolving || isGameOver || boardFinished;
  ui.shuffle.disabled = shufflesRemaining === 0 || isResolving || isGameOver || boardFinished;
}

function getCoordinates(index) {
  return { row: Math.floor(index / COLS), col: index % COLS };
}

function isClearLine(firstIndex, secondIndex, cells = board) {
  const first = getCoordinates(firstIndex);
  const second = getCoordinates(secondIndex);
  const rowDistance = second.row - first.row;
  const colDistance = second.col - first.col;
  const aligned = rowDistance === 0 || colDistance === 0 || Math.abs(rowDistance) === Math.abs(colDistance);
  if (aligned) {
    const rowStep = Math.sign(rowDistance);
    const colStep = Math.sign(colDistance);
    let row = first.row + rowStep;
    let col = first.col + colStep;
    while (row !== second.row || col !== second.col) {
      if (cells[row * COLS + col] !== null) return false;
      row += rowStep;
      col += colStep;
    }
    return true;
  }

  if (first.row === second.row) return false;
  const start = Math.min(firstIndex, secondIndex);
  const end = Math.max(firstIndex, secondIndex);
  for (let index = start + 1; index < end; index += 1) {
    if (cells[index] !== null) return false;
  }
  return true;
}

function isValidPair(firstIndex, secondIndex, cells = board) {
  if (firstIndex === secondIndex || cells[firstIndex] === null || cells[secondIndex] === null) return false;
  const first = cells[firstIndex];
  const second = cells[secondIndex];
  return (first === second || first + second === 10) && isClearLine(firstIndex, secondIndex, cells);
}

function findAvailablePair(cells = board) {
  for (let first = 0; first < cells.length; first += 1) {
    if (cells[first] === null) continue;
    for (let second = first + 1; second < cells.length; second += 1) {
      if (isValidPair(first, second, cells)) return [first, second];
    }
  }
  return null;
}

function countAvailablePairs(cells = board) {
  let count = 0;
  for (let first = 0; first < cells.length; first += 1) {
    if (cells[first] === null) continue;
    for (let second = first + 1; second < cells.length; second += 1) {
      if (isValidPair(first, second, cells)) count += 1;
    }
  }
  return count;
}

function selectTile(index) {
  if (isResolving || isGameOver) return;
  if (selectedIndex === null) {
    selectedIndex = index;
    ui.message.textContent = "Sekarang pilih pasangan yang cocok.";
    renderBoard();
    return;
  }
  if (selectedIndex === index) {
    selectedIndex = null;
    ui.message.textContent = "Pilihan dibatalkan.";
    renderBoard();
    return;
  }

  if (isValidPair(selectedIndex, index)) {
    const matchedIndices = [selectedIndex, index];
    selectedIndex = null;
    isResolving = true;
    matchedIndices.forEach((matchedIndex) => {
      const tile = ui.board.children[matchedIndex];
      tile.classList.remove("selected");
      tile.classList.add("correct");
      tile.disabled = true;
    });
    ui.message.textContent = "Pasangan benar! +100 poin.";
    resolutionTimeout = setTimeout(() => {
      matchedIndices.forEach((matchedIndex) => { board[matchedIndex] = null; });
      isResolving = false;
      const now = Date.now();
      combo = now - lastMatchAt < 5000 ? Math.min(combo + 1, 9) : 1;
      lastMatchAt = now;
      matchesCleared += 1;
      const gained = 100 + (combo - 1) * 25;
      score += gained;
      ui.message.textContent = `Pasangan tepat! +${gained} poin${combo > 1 ? ` · kombo ×${combo}` : ""}.`;
      if (score > currentBest) {
        currentBest = score;
        localStorage.setItem(bestScoreKey(), String(currentBest));
        saveScore().catch((error) => showToast(`Skor belum tersimpan: ${error.message}`));
      }
      renderBoard();
      if (board.every((value) => value === null)) finishLevel();
      else if (!findAvailablePair()) {
        if (shufflesRemaining > 0) {
          ui.message.textContent = `Buntu! Gunakan acak ulang (${shufflesRemaining} tersisa) untuk membuka jalur.`;
        } else {
          finishGame("stuck");
        }
      }
    }, 300);
  } else {
    const missedIndices = [selectedIndex, index];
    selectedIndex = null;
    mistakesMade += 1;
    lives -= 1;
    isResolving = true;
    renderLives(true);
    missedIndices.forEach((missedIndex) => {
      const tile = ui.board.children[missedIndex];
      tile.classList.remove("selected");
      tile.classList.add("wrong");
      tile.disabled = true;
    });
    ui.message.textContent = lives > 0
      ? `Salah! Satu nyawa berkurang. Sisa ${lives} nyawa.`
      : "Salah! Kesempatanmu habis.";
    resolutionTimeout = setTimeout(() => {
      isResolving = false;
      renderBoard();
      if (lives === 0) finishGame();
    }, 480);
  }
}

function finishLevel() {
  ui.overlay.classList.remove("game-over");
  ui.overlayTitle.textContent = `Level ${level} selesai!`;
  ui.overlayCopy.textContent = `Skor ${formatScore(score)} · ${matchesCleared} pasangan · ${mistakesMade} salah. Siap lanjut?`;
  ui.nextLevel.innerHTML = `LANJUT LEVEL <span>→</span>`;
  ui.overlay.classList.remove("hidden");
  ui.message.textContent = "Papan bersih! Kamu naik level.";
  saveScore().catch((error) => showToast(`Skor belum tersimpan: ${error.message}`));
}

function startNextLevel() {
  if (isGameOver) {
    startNewGame();
    return;
  }
  level += 1;
  board = createBoard();
  selectedIndex = null;
  combo = 1;
  lastMatchAt = 0;
  hintsRemaining = HINTS_PER_LEVEL;
  shufflesRemaining = SHUFFLES_PER_LEVEL;
  ui.overlay.classList.remove("game-over");
  ui.overlay.classList.add("hidden");
  ui.message.textContent = "Level baru dimulai. Cari pasangan pertamamu!";
  renderBoard();
}

function startNewGame() {
  clearTimeout(resolutionTimeout);
  isResolving = false;
  isGameOver = false;
  level = 1;
  board = createBoard();
  selectedIndex = null;
  score = 0;
  combo = 1;
  matchesCleared = 0;
  mistakesMade = 0;
  lives = 3;
  hintsRemaining = HINTS_PER_LEVEL;
  shufflesRemaining = SHUFFLES_PER_LEVEL;
  lastMatchAt = 0;
  startedAt = Date.now();
  renderLives();
  ui.overlay.classList.remove("game-over");
  ui.overlay.classList.add("hidden");
  ui.message.textContent = "Pilih angka untuk mencari pasangannya.";
  renderBoard();
}

function finishGame(reason = "lives") {
  isGameOver = true;
  renderBoard();
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  ui.overlayTitle.textContent = reason === "stuck" ? "Tidak ada langkah sah" : "Kesempatan habis";
  ui.overlayCopy.textContent = `Skor ${formatScore(score)} · ${matchesCleared} pasangan · ${mistakesMade} salah · ${duration}. Coba strategi baru!`;
  ui.nextLevel.innerHTML = `COBA LAGI <span>↻</span>`;
  ui.overlay.classList.add("game-over");
  ui.overlay.classList.remove("hidden");
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove("visible"), 3500);
}

function showHint() {
  if (isResolving || isGameOver) return;
  if (hintsRemaining === 0) {
    ui.message.textContent = "Jatah petunjuk level ini sudah habis.";
    return;
  }
  const pair = findAvailablePair();
  if (!pair) {
    ui.message.textContent = "Tidak ada pasangan. Coba acak ulang papan.";
    return;
  }
  hintsRemaining -= 1;
  score = Math.max(0, score - 25);
  ui.message.textContent = "Petunjuk: dua angka bercahaya bisa dipasangkan.";
  renderBoard();
  pair.forEach((index) => ui.board.children[index].classList.add("hinted"));
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => {
    pair.forEach((index) => ui.board.children[index]?.classList.remove("hinted"));
  }, 1500);
}

function shuffleBoard() {
  if (isResolving || isGameOver) return;
  if (shufflesRemaining === 0) {
    ui.message.textContent = "Jatah acak ulang level ini sudah habis.";
    return;
  }
  const values = board.filter((value) => value !== null);
  if (values.length < 2) return;
  const activeIndices = board.flatMap((value, index) => value === null ? [] : [index]);
  let bestBoard = null;
  let closestMoveCount = Infinity;
  const { minimum, maximum } = getOpeningMoveRange();
  const targetMoves = (minimum + maximum) / 2;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const shuffledValues = [...values];
    for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledValues[index], shuffledValues[swapIndex]] = [shuffledValues[swapIndex], shuffledValues[index]];
    }
    const candidate = [...board];
    activeIndices.forEach((boardIndex, index) => { candidate[boardIndex] = shuffledValues[index]; });
    const availableMoves = countAvailablePairs(candidate);
    const distanceFromTarget = Math.abs(availableMoves - targetMoves);
    if (availableMoves > 0 && distanceFromTarget < closestMoveCount) {
      bestBoard = candidate;
      closestMoveCount = distanceFromTarget;
    }
    if (distanceFromTarget === 0) break;
  }
  shufflesRemaining -= 1;
  score = Math.max(0, score - 75);
  selectedIndex = null;
  if (!bestBoard) {
    renderBoard();
    ui.message.textContent = "Tidak ada pasangan yang bisa dibentuk lagi dari angka tersisa.";
    finishGame("stuck");
    return;
  }
  board = bestBoard;
  renderBoard();
  ui.message.textContent = `Papan diacak ulang (−75 poin). Sisa acak: ${shufflesRemaining}.`;
}

function readLocalRanks() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_RANKS_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn("Data leaderboard lokal tidak dapat dibaca.", error);
    return [];
  }
}

function saveLocalRank() {
  const ranks = readLocalRanks();
  const playerName = activeUser?.displayName || activeUser?.email?.split("@")[0] || localPlayerName;
  const existing = ranks.find((entry) => entry.displayName === playerName);
  if (existing) existing.bestScore = Math.max(existing.bestScore, score);
  else ranks.push({ displayName: playerName, bestScore: score, isGuest: true });
  ranks.sort((first, second) => second.bestScore - first.bestScore);
  localStorage.setItem(LOCAL_RANKS_KEY, JSON.stringify(ranks.slice(0, 10)));
  renderLeaderboard(ranks.slice(0, 10));
}

function renderLeaderboard(entries) {
  ui.leaderboard.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty-ranking";
    empty.textContent = "Belum ada skor. Jadilah yang pertama mengisi papan!";
    ui.leaderboard.append(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement("li");
    row.className = "rank-row";
    const number = document.createElement("span");
    number.className = "rank-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const player = document.createElement("span");
    player.className = "rank-player";
    const name = document.createElement("strong");
    name.textContent = entry.displayName || "Pemain";
    const label = document.createElement("small");
    label.className = entry.isGuest ? "guest-label" : "";
    label.textContent = entry.isGuest ? "TAMU · TIDAK RESMI" : "AKUN RESMI";
    player.append(name, label);
    const points = document.createElement("span");
    points.className = "rank-score";
    points.textContent = formatScore(Number(entry.bestScore) || 0);
    row.append(number, player, points);
    ui.leaderboard.append(row);
  });
}

async function loadFirebase() {
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  firebaseServices = { authSdk, auth, db, firestoreSdk };
  ui.connection.textContent = "Firebase aktif";
  authSdk.onAuthStateChanged(auth, (user) => {
    activeUser = user;
    updateAccount();
    loadLeaderboard().catch((error) => {
      console.error("Leaderboard Firebase gagal dimuat.", error);
      ui.leaderboardNote.textContent = "Leaderboard gagal dimuat. Periksa koneksi atau Firestore Rules.";
      showToast("Leaderboard gagal dimuat. Periksa konfigurasi Firebase.");
    });
  });
}

function updateAccount() {
  const isSignedIn = Boolean(activeUser && !activeUser.isAnonymous);
  const name = isSignedIn
    ? activeUser.displayName || activeUser.email?.split("@")[0] || "Pemain"
    : localPlayerName;
  currentBest = Number(localStorage.getItem(bestScoreKey())) || 0;
  ui.bestScore.textContent = formatScore(currentBest);
  ui.accountName.textContent = name;
  ui.avatar.textContent = name.charAt(0).toUpperCase();
  ui.accountType.textContent = isSignedIn ? "AKUN RESMI" : "AKUN TIDAK RESMI";
  ui.accountType.style.color = isSignedIn ? "var(--lime)" : "";
  ui.leaderboardCta.textContent = isSignedIn ? "Keluar dari akun" : "Masuk untuk simpan ranking";
  const arrow = document.createElement("span");
  arrow.textContent = isSignedIn ? "↗" : "↗";
  ui.leaderboardCta.append(arrow);
}

async function loadLeaderboard() {
  if (!firebaseServices) {
    renderLeaderboard(readLocalRanks());
    ui.leaderboardNote.textContent = "Leaderboard lokal perangkat ini. Tamu ditandai akun tidak resmi.";
    ui.rankScope.textContent = "LOKAL";
    ui.connection.textContent = "Mode lokal";
    return;
  }
  const { db, firestoreSdk } = firebaseServices;
  const scores = firestoreSdk.collection(db, "scores");
  const rankingQuery = firestoreSdk.query(scores, firestoreSdk.orderBy("bestScore", "desc"), firestoreSdk.limit(10));
  const snapshot = await firestoreSdk.getDocs(rankingQuery);
  const entries = snapshot.docs.map((document) => document.data());
  renderLeaderboard(entries);
  ui.rankScope.textContent = "GLOBAL";
  ui.leaderboardNote.textContent = "Ranking global berdasarkan skor terbaik. Tamu ditandai akun tidak resmi.";
}

async function saveScore() {
  if (!firebaseServices) {
    saveLocalRank();
    return;
  }
  const { auth, authSdk, db, firestoreSdk } = firebaseServices;
  let user = auth.currentUser;
  if (!user) {
    const result = await authSdk.signInAnonymously(auth);
    user = result.user;
  }
  const displayName = user.isAnonymous
    ? localPlayerName
    : user.displayName || user.email?.split("@")[0] || "Pemain";
  currentBest = Math.max(currentBest, score);
  localStorage.setItem(bestScoreKey(), String(currentBest));
  ui.bestScore.textContent = formatScore(currentBest);
  const scoreRef = firestoreSdk.doc(db, "scores", user.uid);
  await firestoreSdk.runTransaction(db, async (transaction) => {
    const existing = await transaction.get(scoreRef);
    const previousBest = existing.exists() ? Number(existing.data().bestScore) || 0 : 0;
    transaction.set(scoreRef, {
      displayName,
      bestScore: Math.max(previousBest, score),
      isGuest: user.isAnonymous,
      updatedAt: firestoreSdk.serverTimestamp()
    });
  });
  await loadLeaderboard();
}

function showAuthDialog() {
  if (!firebaseReady) {
    ui.authLocalNote.classList.remove("hidden");
    ui.authError.textContent = "";
  } else {
    ui.authLocalNote.classList.add("hidden");
  }
  if (!ui.authDialog.open) ui.authDialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  ui.authTitle.textContent = registering ? "Buat akunmu." : "Gabung ke arena.";
  ui.authDescription.textContent = registering
    ? "Daftar agar skor terbaikmu tersimpan di leaderboard global."
    : "Masuk atau daftar untuk menyimpan skor ke leaderboard global.";
  ui.authUsernameField.classList.toggle("hidden", !registering);
  ui.authUsername.required = registering;
  ui.authPassword.autocomplete = registering ? "new-password" : "current-password";
  ui.authSubmit.innerHTML = `${registering ? "DAFTAR" : "MASUK"} <span>→</span>`;
  ui.authSwitch.innerHTML = registering
    ? "Sudah punya akun? <b>Masuk</b>"
    : "Belum punya akun? <b>Daftar</b>";
  ui.authError.textContent = "";
}

function authErrorMessage(error) {
  const knownErrors = {
    "auth/email-already-in-use": "Email ini sudah terdaftar. Silakan masuk.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/network-request-failed": "Jaringan bermasalah. Coba lagi."
  };
  return knownErrors[error.code] || error.message || "Terjadi kesalahan. Coba lagi.";
}

async function submitAuth(event) {
  event.preventDefault();
  if (!firebaseReady || !firebaseServices) {
    ui.authError.textContent = "Aktifkan Firebase terlebih dahulu untuk memakai akun.";
    return;
  }
  ui.authError.textContent = "";
  ui.authSubmit.disabled = true;
  try {
    const { auth, authSdk } = firebaseServices;
    const email = ui.authEmail.value.trim();
    const password = ui.authPassword.value;
    if (authMode === "register") {
      const username = ui.authUsername.value.trim();
      const credential = await authSdk.createUserWithEmailAndPassword(auth, email, password);
      activeUser = credential.user;
      updateAccount();
      ui.authDialog.close();
      showToast("Akun berhasil dibuat. Kamu sudah masuk dan siap bermain!");

      try {
        await authSdk.updateProfile(credential.user, { displayName: username });
        updateAccount();
      } catch (error) {
        console.error("Profil akun berhasil dibuat, tetapi nama pemain gagal disimpan.", error);
        showToast(`Akun sudah aktif, tetapi nama pemain gagal disimpan: ${authErrorMessage(error)}`);
      }

      try {
        await saveScore();
      } catch (error) {
        console.error("Akun berhasil dibuat, tetapi skor awal gagal disimpan.", error);
        showToast(`Akun sudah aktif, tetapi skor belum tersimpan: ${error.message}`);
      }
      return;
    }

    const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
    activeUser = credential.user;
    updateAccount();
    ui.authDialog.close();
    showToast("Berhasil masuk.");
  } catch (error) {
    ui.authError.textContent = authErrorMessage(error);
  } finally {
    ui.authSubmit.disabled = false;
  }
}

async function signOut() {
  if (!firebaseServices) return;
  try {
    await firebaseServices.authSdk.signOut(firebaseServices.auth);
    activeUser = null;
    updateAccount();
    showToast("Kamu sudah keluar. Tetap bisa bermain sebagai tamu.");
  } catch (error) {
    showToast(`Gagal keluar: ${error.message}`);
  }
}

document.querySelector("#new-game").addEventListener("click", startNewGame);
ui.nextLevel.addEventListener("click", startNextLevel);
ui.hint.addEventListener("click", showHint);
ui.shuffle.addEventListener("click", shuffleBoard);
document.querySelector("#refresh-leaderboard").addEventListener("click", () => {
  loadLeaderboard().catch((error) => showToast(`Gagal memuat ranking: ${error.message}`));
});
ui.accountButton.addEventListener("click", () => {
  if (activeUser && !activeUser.isAnonymous) {
    signOut();
    return;
  }
  setAuthMode("login");
  showAuthDialog();
});
ui.leaderboardCta.addEventListener("click", () => {
  if (activeUser && !activeUser.isAnonymous) signOut();
  else {
    setAuthMode("login");
    showAuthDialog();
  }
});
ui.authSwitch.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
ui.authForm.addEventListener("submit", submitAuth);
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "h" && !ui.authDialog.open && !/input|textarea/i.test(document.activeElement.tagName)) showHint();
});

board = createBoard();
currentBest = Number(localStorage.getItem(bestScoreKey())) || 0;
renderLives();
renderBoard();
updateAccount();
loadLeaderboard();
if (firebaseReady) {
  loadFirebase().catch((error) => {
    console.error("Firebase gagal dimulai.", error);
    ui.connection.textContent = "Firebase gagal";
    ui.leaderboardNote.textContent = "Firebase gagal dimulai. Periksa konfigurasi dan koneksi.";
    showToast("Firebase gagal dimulai. Mode game lokal tetap bisa digunakan.");
    loadLeaderboard();
  });
}

setInterval(() => {
  if (!ui.overlay.classList.contains("hidden")) return;
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  ui.timer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}, 1000);
