/***************************************
 * CONFIGURAZIONE REGOLAMENTO
 ***************************************/
const forceCapture = true;  // Se true, la cattura è obbligatoria
const multiCaptureTimeoutMS = 5000; // Timeout per cattura multipla (5 sec)

/***************************************
 * Riferimenti Firebase & Variabili Globali
 ***************************************/
let nickname = '';
let playerColor = ''; // 'red' oppure 'panna'
let currentGameId = '';
let userRef = null;

let selectedCell = null; // {r, c} oppure null
let multiCaptureTimeout = null; // Timeout per cattura multipla

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

/***************************************
 * Funzione helper: clona la board
 ***************************************/
function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

/***************************************
 * Funzione helper: controlla se un giocatore ha mosse legali
 ***************************************/
function playerHasMoves(board, color) {
  // Questa funzione non viene più utilizzata per terminare automaticamente la partita.
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const piece = board[r][c];
      if (piece && piece.startsWith(color)) {
        let simpleDirs = [];
        const isKing = piece.endsWith('K');
        if (isKing) {
          simpleDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        } else {
          simpleDirs = color === 'red' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
        }
        for (let [dr, dc] of simpleDirs) {
          let newR = r + dr, newC = c + dc;
          if (newR >= 0 && newR < 8 && newC >= 0 && newC < 8 && board[newR][newC] === '') {
            return true;
          }
        }
        if (findCapturesForPiece(board, r, c).length > 0) return true;
      }
    }
  }
  return false;
}

/**************************************************
 * 1) Inizializzazione: imposta utente e ascolta sfide
 **************************************************/
function init() {
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);
  
  userRef = usersRef.push({
    name: nickname,
    status: "online",
    lastActive: Date.now(),
    inGame: false,
    currentGame: ""
  });
  userRef.onDisconnect().remove();
  
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);
  
  document.getElementById("status").textContent =
    `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;
  console.log(`Benvenuto ${nickname}`);
  
  listenForUsers();
  
  userRef.on("value", snapshot => {
    const data = snapshot.val();
    if (data.currentGame && data.currentGame !== currentGameId) {
      currentGameId = data.currentGame;
      console.log("Carico partita esistente, ID:", currentGameId);
      listenToGame(currentGameId);
      document.getElementById("status").textContent = "Partita iniziata!";
    }
  });
}

/****************************************************
 * 2) Visualizza utenti online (non in gioco)
 ****************************************************/
function listenForUsers() {
  usersRef.on("value", snapshot => {
    const usersContainer = document.getElementById("users");
    const now = Date.now();
    usersContainer.innerHTML = `
      <h4>Utenti online (non in gioco):</h4>
      <ul id="user-list"></ul>
    `;
    const ul = document.getElementById("user-list");
    snapshot.forEach(child => {
      const user = child.val();
      if (!user.lastActive || now - user.lastActive > 60000 || user.inGame) return;
      const li = document.createElement("li");
      li.textContent = user.name + " 🟢";
      if (user.name !== nickname) {
        const btn = document.createElement("button");
        btn.textContent = "Sfida";
        btn.onclick = () => sendChallenge(child.key);
        li.appendChild(btn);
      }
      ul.appendChild(li);
    });
  });
}

/*********************************************
 * 3) Invia sfida a un altro utente
 *********************************************/
function sendChallenge(targetId) {
  console.log(`Invio sfida a ${targetId}`);
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    fromId: userRef.key
  });
}

/****************************************************************
 * 4) Ricezione sfide: ascolta modifiche per "invite"
 ****************************************************************/
usersRef.on("child_changed", snapshot => {
  const data = snapshot.val();
  if (data.name === nickname && data.invite) {
    const invite = data.invite;
    console.log(`Ricevuto invito da ${invite.from}`);
    const accept = confirm(`${invite.from} ti ha sfidato. Accetti?`);
    if (accept) {
      console.log(`Accetto sfida da ${invite.from}`);
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(invite.fromId).update({ inGame: true });
      startGameWith(invite.fromId, snapshot.key);
    } else {
      console.log(`Rifiuto sfida da ${invite.from}`);
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

/*************************************************
 * 5) startGameWith: crea partita su Firebase
 *    Assegna: challenger (inviante) = red, accettante = panna
 *************************************************/
function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  console.log(`Creo partita ${gameId}. Opponent (red): ${opponentId}, Io (panna): ${selfId}`);
  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red',  // Turno iniziale: red
    players: { red: opponentId, panna: selfId }
  });
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();
  usersRef.child(selfId).update({ currentGame: gameId });
  usersRef.child(opponentId).update({ currentGame: gameId });
  listenToGame(gameId);
  document.getElementById("status").textContent = "Partita iniziata!";
}

/*******************************************************
 * 6) Creazione damiera iniziale (8x8)
 * – Le tre righe superiori: pedine "panna" (accettante)
 * – Le tre righe inferiori: pedine "red" (challenger)
 *******************************************************/
function createInitialBoard() {
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      if ((r+c) % 2 === 1 && r < 3) row.push('panna');
      else if ((r+c) % 2 === 1 && r > 4) row.push('red');
      else row.push('');
    }
    board.push(row);
  }
  return board;
}

/*********************************************************************
 * 7) Ascolta la partita e assegna il colore locale in base al record dei giocatori
 *********************************************************************/
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (data && data.board) {
      if (data.players.red === userRef.key) playerColor = 'red';
      else if (data.players.panna === userRef.key) playerColor = 'panna';
      console.log(`Assegnato playerColor: ${playerColor} per l'utente ${userRef.key}`);
      renderBoard(data.board, data.turn);
    }
  });
}

/**************************************************************
 * 8) renderBoard: disegna la damiera; se sei "panna", inverte l'ordine delle righe
 **************************************************************/
function renderBoard(board, turn) {
  console.log(`renderBoard: Turno di ${turn}. Io sono ${playerColor}`);
  const container = document.getElementById('board');
  container.innerHTML = '';
  if (turn) document.getElementById('status').textContent = `Turno di ${turn.toUpperCase()}`;
  
  let rowIndices = [];
  if (playerColor === 'panna') {
    for (let r = board.length - 1; r >= 0; r--) rowIndices.push(r);
  } else {
    for (let r = 0; r < board.length; r++) rowIndices.push(r);
  }
  
  rowIndices.forEach(r => {
    for (let c = 0; c < board[r].length; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + (((r+c) % 2 === 0) ? 'light' : 'dark');
      if (selectedCell && selectedCell.r === r && selectedCell.c === c)
        square.classList.add('selected');
      const pieceVal = board[r][c];
      if (pieceVal) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + pieceVal;
        square.appendChild(piece);
      }
      square.onclick = () => onSquareClick(board, turn, r, c);
      container.appendChild(square);
    }
  });
}

/***************************************************************
 * 9) onSquareClick: gestisce selezione, deselezione e movimento
 ***************************************************************/
function onSquareClick(board, turn, r, c) {
  console.log(`Cliccato su cella (${r},${c}). Turno: ${turn} – Io: ${playerColor}`);
  
  // Se non è il mio turno (solo in multiplayer)
  if (!testingMode && turn !== playerColor) {
    console.log("Non è il mio turno");
    document.getElementById('status').textContent = "Attendi il tuo turno per muovere";
    return;
  }
  
  // Se clicco nuovamente sulla stessa cella, deseleziona
  if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
    console.log("Deseleziono la pedina");
    selectedCell = null;
    renderBoard(board, turn);
    return;
  }
  
  const availableCaptures = findAllCaptures(board, turn);
  
  if (!selectedCell) {
    const pieceVal = board[r][c];
    if (pieceVal && pieceVal.startsWith(turn)) {
      if (forceCapture && availableCaptures.length > 0) {
        const capForPiece = availableCaptures.filter(cap => cap.fromR === r && cap.fromC === c);
        if (capForPiece.length === 0) {
          console.log("Devi catturare: questa pedina non può");
          return;
        }
      }
      selectedCell = { r, c };
      console.log(`Pedina in (${r},${c}) selezionata`);
      renderBoard(board, turn);
    } else {
      console.log("Cella vuota o non è una tua pedina");
    }
  } else {
    const fromR = selectedCell.r, fromC = selectedCell.c;
    const currentPiece = board[fromR][fromC];
    const isCap = isThisMoveACapture(board, currentPiece, fromR, fromC, r, c);
    if (forceCapture && availableCaptures.length > 0 && !isCap) {
      console.log("Mossa rifiutata: devi catturare");
      return;
    }
    const moveResult = tryMove(board, fromR, fromC, r, c);
    if (!moveResult.success) {
      console.log("Mossa rifiutata:", moveResult.reason);
      return;
    }
    if (isCap) {
      const extraCaps = findCapturesForPiece(board, r, c);
      if (extraCaps.length > 0) {
        selectedCell = { r, c };
        updateBoardOnFirebase(board, turn, true); // Turno non cambia
        renderBoard(board, turn);
        console.log("Cattura multipla: continua a catturare");
        // Imposta timeout per cattura multipla: se l'utente non effettua la mossa entro il tempo, il turno passa
        clearTimeout(multiCaptureTimeout);
        multiCaptureTimeout = setTimeout(() => {
          console.log("Timeout cattura multipla: turno passato");
          selectedCell = null;
          updateBoardOnFirebase(board, turn, false);
          renderBoard(board, turn);
        }, multiCaptureTimeoutMS);
        return;
      }
    }
    selectedCell = null;
    updateBoardOnFirebase(board, turn);
  }
}

/********************************************************************
 * 10) tryMove: verifica la validità della mossa (passo semplice o cattura) e aggiorna la board
 ********************************************************************/
function tryMove(board, fromR, fromC, toR, toC) {
  if (board[toR][toC] !== '')
    return { success: false, reason: "La destinazione non è vuota" };
  const pieceVal = board[fromR][fromC];
  if (!pieceVal)
    return { success: false, reason: "Nessuna pedina da muovere" };
  const dr = toR - fromR, dc = toC - fromC;
  const isRed = pieceVal.startsWith('red');
  const isKing = pieceVal.endsWith('K');
  
  // Movimento semplice: 1 casella in diagonale
  if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
    if (!isKing) {
      if (isRed && dr !== -1)
        return { success: false, reason: "La pedina red si muove solo verso l'alto" };
      if (!isRed && dr !== 1)
        return { success: false, reason: "La pedina panna si muove solo verso il basso" };
    }
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }
  
  // Cattura: 2 caselle in diagonale
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
    const midR = fromR + dr/2, midC = fromC + dc/2;
    const enemy = board[midR][midC];
    if (!enemy)
      return { success: false, reason: "Nessun nemico da catturare" };
    if (enemy.startsWith(pieceVal.startsWith('red') ? 'red' : 'panna'))
      return { success: false, reason: "Non puoi catturare una tua pedina" };
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    board[midR][midC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }
  
  return { success: false, reason: "Mossa non valida: deve essere 1 o 2 caselle in diagonale" };
}

/****************************************************************
 * 11) doPromotionIfNeeded: promuove la pedina a re se raggiunge l'ultima riga
 ****************************************************************/
function doPromotionIfNeeded(board, r, c) {
  const pieceVal = board[r][c];
  if (!pieceVal || pieceVal.endsWith('K')) return;
  if (pieceVal === 'red' && r === 0)
    board[r][c] = 'redK';
  if (pieceVal === 'panna' && r === 7)
    board[r][c] = 'pannaK';
}

/****************************************************************
 * 12) findAllCaptures: ritorna tutte le catture disponibili per il colore in turno
 ****************************************************************/
function findAllCaptures(board, color) {
  const caps = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const piece = board[r][c];
      if (piece && piece.startsWith(color)) {
        const capMoves = findCapturesForPiece(board, r, c);
        caps.push(...capMoves);
      }
    }
  }
  return caps;
}

/****************************************************************
 * 13) findCapturesForPiece: ritorna le catture disponibili per il pezzo in (r,c)
 ****************************************************************/
function findCapturesForPiece(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const directions = [[-2,-2],[-2,2],[2,-2],[2,2]];
  const caps = [];
  directions.forEach(([dr, dc]) => {
    const newR = r + dr, newC = c + dc;
    if (newR < 0 || newR > 7 || newC < 0 || newC > 7) return;
    if (isThisMoveACapture(board, piece, r, c, newR, newC)) {
      caps.push({ fromR: r, fromC: c, toR: newR, toC: newC });
    }
  });
  return caps;
}

/****************************************************************
 * 14) isThisMoveACapture: verifica se il movimento da (from) a (to)
 * è una cattura valida
 ****************************************************************/
function isThisMoveACapture(board, piece, fromR, fromC, toR, toC) {
  if (Math.abs(toR - fromR) !== 2 || Math.abs(toC - fromC) !== 2) return false;
  const midR = fromR + (toR - fromR) / 2, midC = fromC + (toC - fromC) / 2;
  const enemy = board[midR][midC];
  if (!enemy) return false;
  return !enemy.startsWith(piece.startsWith('red') ? 'red' : 'panna');
}

/****************************************************************
 * 15) updateBoardOnFirebase: salva la board su Firebase e passa il turno
 * Se sameTurn = true (cattura multipla), il turno rimane invariato.
 ****************************************************************/
function updateBoardOnFirebase(localBoard, currentTurn, sameTurn = false) {
  const ref = firebase.database().ref(`games/${currentGameId}`);
  ref.once("value").then(snapshot => {
    const data = snapshot.val();
    if (!data) {
      console.log("Partita non trovata, ID:", currentGameId);
      return;
    }
    const nextTurn = sameTurn ? currentTurn : (currentTurn === 'red' ? 'panna' : 'red');
    console.log("Aggiorno board. Turno passa a:", nextTurn);
    // Non viene effettuato alcun controllo sulle mosse del prossimo giocatore per evitare blocchi
    ref.update({ board: localBoard, turn: nextTurn });
  });
}

/***********************************
 * Avvio dell'app
 ***********************************/
window.onload = init;
