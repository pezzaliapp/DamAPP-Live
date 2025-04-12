/***************************************
 * Riferimenti Firebase & Variabili
 ***************************************/
let nickname = '';
let playerColor = ''; // verrà "red" oppure "panna"
let currentGameId = '';
let userRef = null;

// Variabile per gestire la selezione del pezzo
let selectedCell = null; // {r, c} oppure null

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

/**************************************************
 * 1) Inizializzazione
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

  // Aggiorna lastActive ogni 30 secondi
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);

  document.getElementById("status").textContent =
    `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;
  console.log(`Benvenuto ${nickname}`);

  listenForUsers();

  // Se il record utente viene aggiornato con un "currentGame", carico la partita
  userRef.on("value", snapshot => {
    const data = snapshot.val();
    if (data.currentGame && data.currentGame !== currentGameId) {
      currentGameId = data.currentGame;
      console.log("Partita esistente trovata, ID:", currentGameId);
      listenToGame(currentGameId);
      document.getElementById("status").textContent = "Partita iniziata!";
    }
  });
}

/****************************************************
 * 2) Visualizza utenti online (non in gioco)
 ****************************************************/
function listenForUsers() {
  usersRef.on("value", (snapshot) => {
    const usersContainer = document.getElementById("users");
    const now = Date.now();

    usersContainer.innerHTML = `
      <h4>Utenti online (non in gioco):</h4>
      <ul id="user-list"></ul>
    `;
    const ul = document.getElementById("user-list");

    snapshot.forEach((child) => {
      const user = child.val();
      if (!user.lastActive || now - user.lastActive > 60000 || user.inGame)
        return;

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
  console.log(`Invio sfida a utente con key ${targetId}`);
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    fromId: userRef.key
  });
}

/****************************************************************
 * 4) Ascolta le modifiche (inviti) per ricevere sfide
 ****************************************************************/
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  if (data.name === nickname && data.invite) {
    const invite = data.invite;
    console.log(`Ricevuto invito da ${invite.from}`);
    const accept = confirm(`${invite.from} ti ha sfidato. Accetti?`);
    if (accept) {
      console.log(`Accetto la sfida da ${invite.from}`);
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(invite.fromId).update({ inGame: true });
      startGameWith(invite.fromId, snapshot.key);
    } else {
      console.log(`Rifiuto la sfida da ${invite.from}`);
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

/*************************************************
 * 5) startGameWith: crea la partita su Firebase
 *    Assegna: challenger (inviante) = RED, chi accetta = PANNA
 *************************************************/
function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  
  // Il challenger (inviante) è RED; Io (accettante) sono PANNA.
  console.log(`Creo partita ${gameId}. Opponent (RED): ${opponentId}, Io (PANNA): ${selfId}`);
  
  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red', // Il turno iniziale è RED
    players: {
      red: opponentId,
      panna: selfId
    }
  });

  // Rimuovo inviti e assegno la partita a entrambi
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();
  usersRef.child(selfId).update({ currentGame: gameId });
  usersRef.child(opponentId).update({ currentGame: gameId });

  listenToGame(gameId);
  document.getElementById("status").textContent = "Partita iniziata!";
}

/*******************************************************
 * 6) Creazione damiera iniziale (8x8)
 *******************************************************/
function createInitialBoard() {
  // Valori possibili: "", "red", "panna", "redK", "pannaK"
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      // Le tre righe superiori contengono le pedine "panna"
      if ((r + c) % 2 === 1 && r < 3) {
        row.push('panna');
      }
      // Le tre righe inferiori contengono le pedine "red"
      else if ((r + c) % 2 === 1 && r > 4) {
        row.push('red');
      } else {
        row.push('');
      }
    }
    board.push(row);
  }
  return board;
}

/*********************************************************************
 * 7) Ascolta i cambiamenti della partita e assegna il colore
 *********************************************************************/
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.board) {
      // Determina il colore locale confrontando con il record della partita
      if (data.players.red === userRef.key) {
        playerColor = 'red';
      } else if (data.players.panna === userRef.key) {
        playerColor = 'panna';
      }
      console.log(`Assegnato playerColor: ${playerColor} per l'utente ${userRef.key}`);
      renderBoard(data.board, data.turn);
    }
  });
}

/**************************************************************
 * 8) renderBoard: disegna la damiera e inverte le righe per "panna"
 **************************************************************/
function renderBoard(board, turn) {
  console.log(`renderBoard: Turno di ${turn}. Io sono ${playerColor}`);
  const container = document.getElementById('board');
  container.innerHTML = '';

  // Aggiorna lo status con il turno corrente
  if (turn) {
    document.getElementById('status').textContent = `Turno di ${turn.toUpperCase()}`;
  }
  
  // Se il giocatore è "panna", inverto l'ordine delle righe
  let rowIndices = [];
  if (playerColor === 'panna') {
    for (let r = board.length - 1; r >= 0; r--) {
      rowIndices.push(r);
    }
  } else {
    for (let r = 0; r < board.length; r++) {
      rowIndices.push(r);
    }
  }
  
  // Disegna le righe secondo l'orientamento calcolato
  rowIndices.forEach(r => {
    for (let c = 0; c < board[r].length; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      
      if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        square.classList.add('selected');
      }
      
      const pieceVal = board[r][c];
      if (pieceVal) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + pieceVal;  // Ci aspettiamo "red", "panna", "redK", "pannaK"
        square.appendChild(piece);
      }
      
      // Associamo l'evento click mantenendo le coordinate interne
      square.onclick = () => onSquareClick(board, turn, r, c);
      container.appendChild(square);
    }
  });
}

/***************************************************************
 * 9) onSquareClick: gestione dei click per selezionare e muovere
 ***************************************************************/
function onSquareClick(board, turn, r, c) {
  console.log(`Cliccato su cella (${r},${c}). Turno: ${turn} – Io: ${playerColor}`);
  if (turn !== playerColor) {
    console.log("Non è il mio turno");
    return;
  }
  
  if (!selectedCell) {
    const pieceVal = board[r][c];
    if (pieceVal && pieceVal.startsWith(turn)) {
      selectedCell = { r, c };
      console.log(`Selezionata pedina in (${r},${c})`);
      renderBoard(board, turn);
    } else {
      console.log("Cella vuota o non è la mia pedina");
    }
  } else {
    const fromR = selectedCell.r;
    const fromC = selectedCell.c;
    const moveResult = tryMove(board, fromR, fromC, r, c);
    if (!moveResult.success) {
      console.log("Mossa rifiutata:", moveResult.reason);
      return;
    }
    selectedCell = null;
    updateBoardOnFirebase(board, turn);
  }
}

/********************************************************************
 * 10) tryMove: controlla se la mossa è valida (passo o cattura)
 ********************************************************************/
function tryMove(board, fromR, fromC, toR, toC) {
  if (board[toR][toC] !== '') {
    return { success: false, reason: "La destinazione non è vuota" };
  }

  const pieceVal = board[fromR][fromC];
  if (!pieceVal) return { success: false, reason: "Nessuna pedina da muovere" };

  const dr = toR - fromR;
  const dc = toC - fromC;
  const isRed = pieceVal.startsWith('red');
  const isKing = pieceVal.endsWith('K');

  // Mossa semplice: 1 casella in diagonale
  if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
    if (!isKing) {
      if (isRed && dr !== -1)
        return { success: false, reason: "La pedina rossa si muove solo in su di 1" };
      if (!isRed && dr !== 1)
        return { success: false, reason: "La pedina panna si muove solo in giù di 1" };
    }
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }

  // Cattura: 2 caselle in diagonale
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
    const midR = fromR + dr / 2;
    const midC = fromC + dc / 2;
    const enemyPiece = board[midR][midC];
    if (!enemyPiece)
      return { success: false, reason: "Non c'è un nemico da catturare" };
    if (enemyPiece.startsWith(pieceVal.startsWith('red') ? 'red' : 'panna'))
      return { success: false, reason: "Non posso catturare una mia pedina" };
    if (!isKing) {
      if (isRed && dr !== -2)
        return { success: false, reason: "La pedina rossa cattura solo in su" };
      if (!isRed && dr !== 2)
        return { success: false, reason: "La pedina panna cattura solo in giù" };
    }
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    board[midR][midC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }

  return { success: false, reason: "Mossa non valida: deve essere 1 o 2 caselle in diagonale" };
}

/****************************************************************
 * 11) doPromotionIfNeeded: promuove in re se si raggiunge la riga finale
 ****************************************************************/
function doPromotionIfNeeded(board, r, c) {
  const pieceVal = board[r][c];
  if (!pieceVal) return;
  if (pieceVal.endsWith('K')) return;
  if (pieceVal === 'red' && r === 0) {
    board[r][c] = 'redK';
  }
  if (pieceVal === 'panna' && r === 7) {
    board[r][c] = 'pannaK';
  }
}

/****************************************************************
 * 12) updateBoardOnFirebase: salva la board e passa il turno
 ****************************************************************/
function updateBoardOnFirebase(localBoard, currentTurn, sameTurn = false) {
  const ref = firebase.database().ref(`games/${currentGameId}`);
  ref.once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) {
      console.log("Nessuna partita trovata con ID", currentGameId);
      return;
    }
    // Calcolo il turno successivo: se currentTurn è "red", passa a "panna", altrimenti a "red".
    const nextTurn = sameTurn ? currentTurn : (currentTurn === 'red' ? 'panna' : 'red');
    console.log("Aggiorno la board. Turno passa a:", nextTurn);
    ref.update({
      board: localBoard,
      turn: nextTurn
    });
  });
}

/***********************************
 * Avvio dell'app
 ***********************************/
window.onload = init;
