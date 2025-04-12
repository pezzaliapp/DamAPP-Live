/***************************************
 * Riferimenti Firebase & Variabili
 ***************************************/
let nickname = '';
let playerColor = ''; // "red" o "black"
let currentGameId = '';
let userRef = null;

// Per gestire la selezione dei pezzi (click)
let selectedCell = null; // {r, c} o null

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

/**************************************************
 * 1) Inizializzazione
 **************************************************/
function init() {
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);

  // Record utente
  userRef = usersRef.push({
    name: nickname,
    status: "online",
    lastActive: Date.now(),
    inGame: false,
    currentGame: ""
  });

  // Se chiudo la pagina, rimuove il record utente
  userRef.onDisconnect().remove();
  
  // Aggiorniamo lastActive ogni 30s
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);

  document.getElementById("status").textContent =
    `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;

  // Ascolta la lista utenti
  listenForUsers();

  // Se nel mio record compare un "currentGame", lo carico
  userRef.on("value", snapshot => {
    const data = snapshot.val();
    if (data.currentGame && data.currentGame !== currentGameId) {
      currentGameId = data.currentGame;
      listenToGame(currentGameId);
      document.getElementById("status").textContent = "Partita iniziata!";
    }
  });
}

/****************************************************
 * 2) Mostra l'elenco utenti online non in partita
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

      // Ignoro se inattivo da 60s o già inGame
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
  // Io che mando l'invito sarò "rosso" e muovo per primo
  // ma l'utente che ACCETTA creerà la partita
  // e imposterà me come "red", se stesso come "black".
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    fromId: userRef.key
  });
}

/****************************************************************
 * 4) Ascolta i cambiamenti di *tutti* gli utenti (inviti)
 ****************************************************************/
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  // Se questo utente cambiato sono io e c'è un invito => me lo mostra
  if (data.name === nickname && data.invite) {
    const invite = data.invite;
    const accept = confirm(`${invite.from} ti ha sfidato. Accetti?`);
    if (accept) {
      // Io che ACCETTO => sono "black"
      // Metto inGame entrambi
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(invite.fromId).update({ inGame: true });

      // Avvio partita => ho in mano la logica, e so che "opponentId" = chi ha sfidato
      // "selfId" = me
      startGameWith(invite.fromId, snapshot.key);
    } else {
      // Se rifiuto, tolgo l'invito
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

/*************************************************
 * 5) startGameWith: crea la partita su Firebase
 *    e fa in modo che "red" sia l'utente che ha sfidato
 *    e "black" sia quello che accetta
 *************************************************/
function startGameWith(opponentId, selfId) {
  // Opponent = colui che mi ha invitato (rosso)
  // Io = colui che accetta (nero)

  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  
  // Imposto localmente che io (che sto accettando) sono black
  playerColor = 'black';

  // Crea la partita su Firebase
  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red', // Il primo turno tocca a rosso
    players: {
      red: opponentId,  // colui che ha inviato la sfida
      black: selfId     // me, che ho accettato
    }
  });

  // Rimuovo l'invito su entrambi
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();

  // Imposto il currentGame su entrambi
  usersRef.child(selfId).update({ currentGame: gameId });
  usersRef.child(opponentId).update({ currentGame: gameId });

  // Ascolto la partita
  listenToGame(gameId);

  document.getElementById("status").textContent = "Partita iniziata!";
}

/*******************************************************
 * 6) Creazione damiera iniziale
 *******************************************************/
function createInitialBoard() {
  // Possibili valori: '', 'red', 'black', 'redK', 'blackK'
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
 * 7) Ascolta i cambiamenti del game su Firebase.
 *    Ogni volta che board o turn cambiano, ri-renderizzo.
 *********************************************************************/
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.board) {
      renderBoard(data.board, data.turn);
    }
  });
}

/**************************************************************
 * 8) renderBoard: Disegna la board e aggancia gli eventi click
 **************************************************************/
function renderBoard(board, turn) {
  const container = document.getElementById('board');
  container.innerHTML = '';

  // Mostra info sul turno
  if (turn) {
    document.getElementById('status').textContent =
      `Turno di ${turn.toUpperCase()}`;
  }

  // Disegno 8x8
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

      // Se la cella è quella selezionata, evidenzio
      if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        square.classList.add('selected');
      }

      const pieceVal = board[r][c];
      if (pieceVal) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + pieceVal;
        square.appendChild(piece);
      }

      // Click
      square.onclick = () => onSquareClick(board, turn, r, c);
      container.appendChild(square);
    }
  }
}

/***************************************************************
 * 9) Gestione click su una cella della board
 *    - Obbligo di cattura: se ci sono catture possibili, 
 *      solo quelle sono consentite.
 *    - Cattura multipla: se dopo la prima cattura il pezzo
 *      può catturare ancora, lo stesso giocatore prosegue.
 ***************************************************************/
function onSquareClick(board, turn, r, c) {
  // Se non è il mio turno, ignoro
  if (turn !== playerColor) return;

  // Controllo eventuali catture disponibili per il colore di turno
  const captures = findAllCaptures(board, turn);

  // Se non ho un pezzo selezionato
  if (!selectedCell) {
    // Se c'è un mio pezzo
    const pieceVal = board[r][c];
    if (pieceVal && pieceVal.startsWith(turn)) {
      // Se ci sono catture e questo pezzo NON può catturare, non lo seleziono
      if (captures.length > 0) {
        const pieceCaptures = captures.filter(cap => cap.fromR === r && cap.fromC === c);
        if (pieceCaptures.length === 0) return; 
      }
      // Altrimenti seleziono
      selectedCell = { r, c };
      renderBoard(board, turn);
    }
  }
  // Ho un pezzo selezionato => cerco di muoverlo/catturare
  else {
    const fromR = selectedCell.r;
    const fromC = selectedCell.c;
    const pieceVal = board[fromR][fromC];

    // Se ci sono catture e la mossa non è una cattura => vietato
    const isCaptureMove = isThisMoveACapture(board, pieceVal, fromR, fromC, r, c);
    if (captures.length > 0 && !isCaptureMove) {
      return;
    }

    // Provo a muovere
    const moveResult = tryMove(board, fromR, fromC, r, c);
    if (!moveResult.success) {
      // Mossa non valida
      return;
    }

    // Se è una cattura, controllo la cattura multipla
    if (moveResult.captureHappened) {
      const newR = r;
      const newC = c;
      const moreCaptures = findCapturesForPiece(board, newR, newC);
      if (moreCaptures.length > 0) {
        // Resto io a giocare => non cambio turno
        selectedCell = { r: newR, c: newC };
        updateBoardOnFirebase(board, turn, /* sameTurn */ true);
        renderBoard(board, turn);
        return;
      }
    }

    // Fine della mossa
    selectedCell = null;
    updateBoardOnFirebase(board, turn, /* sameTurn */ false);
  }
}

/********************************************************************
 * 10) tryMove: controlla validità e applica la mossa su "board"
 *     Restituisce { success: bool, captureHappened: bool }
 ********************************************************************/
function tryMove(board, fromR, fromC, toR, toC) {
  const pieceVal = board[fromR][fromC];
  if (!pieceVal) return { success: false, captureHappened: false };

  // Destinazione deve essere vuota
  if (board[toR][toC] !== '') {
    return { success: false, captureHappened: false };
  }

  // Cattura o mossa semplice?
  const isCapture = isThisMoveACapture(board, pieceVal, fromR, fromC, toR, toC);
  if (isCapture) {
    // Rimuovo pezzo avversario
    const midR = (fromR + toR) / 2;
    const midC = (fromC + toC) / 2;
    board[midR][midC] = '';
  } else {
    // Altrimenti controlla se è mossa semplice valida
    if (!isValidStep(board, pieceVal, fromR, fromC, toR, toC)) {
      return { success: false, captureHappened: false };
    }
  }

  // Sposto il pezzo
  board[toR][toC] = pieceVal;
  board[fromR][fromC] = '';

  // Promozione
  doPromotionIfNeeded(board, toR, toC);

  return { success: true, captureHappened: isCapture };
}

/************************************************************************
 * 11) isThisMoveACapture: verifica se (fromR,fromC)->(toR,toC)
 *     è un salto di 2 in diagonale con pezzo avversario in mezzo
 ************************************************************************/
function isThisMoveACapture(board, pieceVal, fromR, fromC, toR, toC) {
  if (Math.abs(toR - fromR) !== 2 || Math.abs(toC - fromC) !== 2) {
    return false;
  }
  // La casella intermedia deve avere un pezzo avversario
  const midR = (fromR + toR) / 2;
  const midC = (fromC + toC) / 2;
  const midVal = board[midR][midC];
  if (!midVal) return false;
  // Se è dello stesso colore => no cattura
  if (midVal.startsWith(pieceVal.startsWith('red') ? 'red' : 'black')) {
    return false;
  }

  // Se non è un re, controlla la direzione
  const isKing = pieceVal.endsWith('K');
  const isRed = pieceVal.startsWith('red');
  if (!isKing) {
    if (isRed && (toR - fromR) !== -2) return false;
    if (!isRed && (toR - fromR) !== 2) return false;
  }

  return true;
}

/************************************************************************
 * 12) isValidStep: mossa semplice di 1 casella diagonale
 ************************************************************************/
function isValidStep(board, pieceVal, fromR, fromC, toR, toC) {
  if (Math.abs(toR - fromR) !== 1 || Math.abs(toC - fromC) !== 1) return false;
  
  const isRed = pieceVal.startsWith('red');
  const isKing = pieceVal.endsWith('K');

  if (!isKing) {
    if (isRed && (toR - fromR) !== -1) return false; // rosso sale
    if (!isRed && (toR - fromR) !== 1) return false; // nero scende
  }
  return true;
}

/****************************************************************
 * 13) doPromotionIfNeeded: promuove a re se arrivo in ultima riga
 ****************************************************************/
function doPromotionIfNeeded(board, r, c) {
  const pieceVal = board[r][c];
  if (!pieceVal) return;
  if (pieceVal.endsWith('K')) return; // già re

  if (pieceVal === 'red' && r === 0) {
    board[r][c] = 'redK';
  }
  if (pieceVal === 'black' && r === 7) {
    board[r][c] = 'blackK';
  }
}

/****************************************************************
 * 14) findAllCaptures: cerca in tutta la board catture
 *     disponibili per il colore di turno.
 ****************************************************************/
function findAllCaptures(board, color) {
  const captures = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const pieceVal = board[r][c];
      if (pieceVal && pieceVal.startsWith(color)) {
        // Cerco catture per questo pezzo
        const pieceCaptures = findCapturesForPiece(board, r, c);
        captures.push(...pieceCaptures);
      }
    }
  }
  return captures;
}

/****************************************************************
 * 15) findCapturesForPiece: catture singole per un pezzo
 ****************************************************************/
function findCapturesForPiece(board, r, c) {
  const pieceVal = board[r][c];
  if (!pieceVal) return [];

  const isRed = pieceVal.startsWith('red');
  const isKing = pieceVal.endsWith('K');

  // Direzioni di salto: se è re => ±2, altrimenti dipende dal colore
  const rowDirs = isKing ? [-2, 2] : (isRed ? [-2] : [2]);
  const colDirs = [-2, 2];

  const captures = [];
  for (let dr of rowDirs) {
    for (let dc of colDirs) {
      const newR = r + dr;
      const newC = c + dc;
      if (newR < 0 || newR > 7 || newC < 0 || newC > 7) continue;
      if (isThisMoveACapture(board, pieceVal, r, c, newR, newC)) {
        captures.push({ fromR: r, fromC: c, toR: newR, toC: newC });
      }
    }
  }
  return captures;
}

/****************************************************************
 * 16) updateBoardOnFirebase: salva la board e gestisce il turno
 *     Se sameTurn = true, non passo il turno all'avversario
 ****************************************************************/
function updateBoardOnFirebase(localBoard, currentTurn, sameTurn) {
  const ref = firebase.database().ref(`games/${currentGameId}`);
  ref.once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const nextTurn = sameTurn
      ? currentTurn
      : (currentTurn === 'red' ? 'black' : 'red');

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
