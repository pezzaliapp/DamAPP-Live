/***************************************
 * Riferimenti Firebase & Variabili
 ***************************************/
let nickname = '';
let playerColor = ''; // "red" o "black"
let currentGameId = '';
let userRef = null;

let selectedCell = null; // {r, c} se un pezzo è selezionato

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
  
  // Aggiorna lastActive ogni 30s
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);

  console.log(`Benvenuto ${nickname}. Attendi o sfida qualcuno...`);
  document.getElementById("status").textContent =
    `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;

  listenForUsers();

  // Se ho currentGame nel mio record, lo carico
  userRef.on("value", snapshot => {
    const data = snapshot.val();
    if (data.currentGame && data.currentGame !== currentGameId) {
      currentGameId = data.currentGame;
      console.log("Carico la partita esistente: ", currentGameId);
      listenToGame(currentGameId);
      document.getElementById("status").textContent = "Partita iniziata!";
    }
  });
}

/****************************************************
 * 2) Mostra l'elenco utenti online (non in partita)
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

      // Ignoro se inattivo da 60s o inGame
      if (!user.lastActive || now - user.lastActive > 60000 || user.inGame) {
        return;
      }

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
 * 3) Invia sfida a un altro utente (io = rosso)
 *********************************************/
function sendChallenge(targetId) {
  console.log("Invio sfida a utente con key:", targetId);
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    fromId: userRef.key
  });
}

/****************************************************************
 * 4) Ascolta i cambiamenti di *tutti* gli utenti per sfida
 ****************************************************************/
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  if (data.name === nickname && data.invite) {
    const invite = data.invite;
    console.log(`Ho ricevuto un invito da ${invite.from}`);
    const accept = confirm(`${invite.from} ti ha sfidato. Accetti?`);
    if (accept) {
      console.log("Accetto sfida da:", invite.from);
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(invite.fromId).update({ inGame: true });
      startGameWith(invite.fromId, snapshot.key);
    } else {
      console.log("Rifiuto sfida da:", invite.from);
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

/*************************************************
 * 5) startGameWith: crea la partita su Firebase
 *************************************************/
function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  
  // Io che accetto => black, Opponent => red
  playerColor = 'black';

  console.log("Creo partita ID:", gameId, " - Opponent=red:", opponentId, " Me=black:", selfId);

  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red', // inizia rosso
    players: {
      red: opponentId,
      black: selfId
    }
  });

  // Pulisco inviti e aggiorno la currentGame
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
  // "", "red", "black", "redK", "blackK"
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1 && r < 3) {
        row.push('black');
      } else if ((r + c) % 2 === 1 && r > 4) {
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
 * 7) Ascolta i cambiamenti del game su Firebase, aggiorna board/turn
 *********************************************************************/
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.board) {
      console.log("Aggiornamento partita:", data);
      renderBoard(data.board, data.turn);
    }
  });
}

/**************************************************************
 * 8) renderBoard
 **************************************************************/
function renderBoard(board, turn) {
  console.log("renderBoard() - Turno di:", turn, " - Io sono:", playerColor);
  const container = document.getElementById('board');
  container.innerHTML = '';

  if (turn) {
    document.getElementById('status').textContent = `Turno di ${turn.toUpperCase()}`;
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      
      // Se è la cella selezionata, la evidenzio
      if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        square.classList.add('selected');
      }

      const pieceVal = board[r][c];
      if (pieceVal) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + pieceVal;
        square.appendChild(piece);
      }

      square.onclick = () => onSquareClick(board, turn, r, c);
      container.appendChild(square);
    }
  }
}

/***************************************************************
 * 9) onSquareClick: mossa libera (senza obbligo di cattura)
 *    - Se non è il mio turno, ignoro
 *    - Se non ho selezionato un pezzo, seleziono
 *    - Se ho selezionato un pezzo, tento mossa (passo o cattura)
 ***************************************************************/
function onSquareClick(board, turn, r, c) {
  console.log(`Cliccato su cella (${r}, ${c}). Turno di ${turn}, Io sono ${playerColor}`);

  // Se non è il mio turno
  if (turn !== playerColor) {
    console.log("Mossa rifiutata: Non è il mio turno");
    return;
  }

  // Se non ho selezionato nessuna pedina
  if (!selectedCell) {
    const pieceVal = board[r][c];
    if (pieceVal && pieceVal.startsWith(turn)) {
      // Seleziono la pedina
      selectedCell = { r, c };
      console.log("Ho selezionato la pedina in", selectedCell);
      renderBoard(board, turn);
    } else {
      console.log("Mossa rifiutata: questa cella non contiene una mia pedina");
    }
  }
  // Se ho già selezionato un pezzo, provo a muovere
  else {
    const fromR = selectedCell.r;
    const fromC = selectedCell.c;
    const moveResult = tryMove(board, fromR, fromC, r, c);

    if (!moveResult.success) {
      console.log("Mossa rifiutata:", moveResult.reason);
      return;
    }

    // Mossa valida => aggiorno su Firebase e passo il turno
    selectedCell = null;
    updateBoardOnFirebase(board, turn);
  }
}

/********************************************************************
 * 10) tryMove: controlla validità (o cattura) e aggiorna "board"
 ********************************************************************/
function tryMove(board, fromR, fromC, toR, toC) {
  // La destinazione dev'essere vuota
  if (board[toR][toC] !== '') {
    return { success: false, reason: "La destinazione non è vuota" };
  }

  const pieceVal = board[fromR][fromC];
  if (!pieceVal) {
    return { success: false, reason: "Nessuna pedina da muovere qui" };
  }

  // Check se è una mossa semplice di 1 in diagonale
  const dr = toR - fromR;
  const dc = toC - fromC;

  // Se pedina non è re, deve muoversi di ±1 solo in avanti (rosso su, nero giù)
  const isRed = pieceVal.startsWith('red');
  const isKing = pieceVal.endsWith('K');

  // Provo prima la mossa di 1
  if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
    // Se non è un re, controllo direzione
    if (!isKing) {
      if (isRed && dr !== -1) {
        return { success: false, reason: "Pedina rossa normale si muove solo in su di 1" };
      }
      if (!isRed && dr !== 1) {
        return { success: false, reason: "Pedina nera normale si muove solo in giù di 1" };
      }
    }

    // OK => sposto
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }

  // Provo la cattura di 2
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
    // Casella intermedia
    const midR = fromR + dr / 2;
    const midC = fromC + dc / 2;
    const enemyPiece = board[midR][midC];
    if (!enemyPiece) {
      return { success: false, reason: "Non c'è un pezzo avversario da catturare" };
    }
    // Deve essere dell'avversario
    if (enemyPiece.startsWith(pieceVal.startsWith('red') ? 'red' : 'black')) {
      return { success: false, reason: "Non posso catturare una mia pedina" };
    }

    // Se non è un re, controllo direzione
    if (!isKing) {
      if (isRed && dr !== -2) {
        return { success: false, reason: "Pedina rossa normale cattura solo verso l'alto" };
      }
      if (!isRed && dr !== 2) {
        return { success: false, reason: "Pedina nera normale cattura solo verso il basso" };
      }
    }

    // Eseguo cattura
    board[toR][toC] = pieceVal;
    board[fromR][fromC] = '';
    board[midR][midC] = '';
    doPromotionIfNeeded(board, toR, toC);
    return { success: true };
  }

  // Altrimenti non è una mossa valida
  return { success: false, reason: "Mossa non valida: non è un passo di 1 o 2 in diagonale" };
}

/****************************************************************
 * 11) doPromotionIfNeeded
 ****************************************************************/
function doPromotionIfNeeded(board, r, c) {
  const pieceVal = board[r][c];
  if (!pieceVal) return;
  if (pieceVal.endsWith('K')) return;

  // Se rosso arriva a r=0 => redK
  if (pieceVal === 'red' && r === 0) {
    board[r][c] = 'redK';
  }
  // Se nero arriva a r=7 => blackK
  if (pieceVal === 'black' && r === 7) {
    board[r][c] = 'blackK';
  }
}

/****************************************************************
 * 12) updateBoardOnFirebase: salvo board, cambio turno
 ****************************************************************/
function updateBoardOnFirebase(localBoard, currentTurn) {
  const ref = firebase.database().ref(`games/${currentGameId}`);
  ref.once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) {
      console.log("ERRORE: nessun game con ID", currentGameId);
      return;
    }
    const nextTurn = (currentTurn === 'red') ? 'black' : 'red';

    console.log("Aggiorno board su Firebase. Turno passa a:", nextTurn);
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
