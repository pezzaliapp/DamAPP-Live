/***********************************
 * Variabili e riferimenti Firebase
 ***********************************/
let nickname = '';
let playerColor = '';
let currentGameId = '';
let userRef = null;

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

/******************************************
 * Inizializzazione dell'app all'avvio
 ******************************************/
function init() {
  // Chiediamo il nickname
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);

  // Creiamo un record utente su Firebase
  userRef = usersRef.push({
    name: nickname,
    status: "online",
    lastActive: Date.now(),
    inGame: false,
    currentGame: ""  // per memorizzare l'ID partita
  });

  // Rimuove l'utente se chiude la pagina
  userRef.onDisconnect().remove();

  // Aggiorna lastActive ogni 30s
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);

  // Messaggio iniziale
  document.getElementById("status").textContent = `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;

  // Ascolta la lista utenti
  listenForUsers();

  // Ascolta cambiamenti sul singolo utente (es: currentGame impostato)
  userRef.on("value", snapshot => {
    const data = snapshot.val();
    // Se mi hanno assegnato una partita => la carico
    if (data.currentGame && data.currentGame !== currentGameId) {
      currentGameId = data.currentGame;
      listenToGame(currentGameId);
      document.getElementById("status").textContent = "Partita iniziata!";
    }
  });
}

/****************************************************
 * Mostra nella sezione #users la lista degli utenti
 ****************************************************/
function listenForUsers() {
  usersRef.on("value", (snapshot) => {
    const usersContainer = document.getElementById("users");
    const now = Date.now();

    // Reset contenuto
    usersContainer.innerHTML = `
      <h4>Utenti online (non in gioco):</h4>
      <ul id="user-list"></ul>
    `;
    const ul = document.getElementById("user-list");

    // Scorriamo tutti gli utenti
    snapshot.forEach((child) => {
      const user = child.val();

      // Ignora se inattivo da 60s o già in partita
      if (!user.lastActive || now - user.lastActive > 60000 || user.inGame) {
        return;
      }

      // Crea elemento di lista
      const li = document.createElement("li");
      li.textContent = user.name + " 🟢";

      // Se non è il mio utente, aggiungo bottone Sfida
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

/*******************************************************
 * Invio di una sfida a un utente target (targetId)
 *******************************************************/
function sendChallenge(targetId) {
  // Scrivo un oggetto "invite" all'utente target
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    fromId: userRef.key
  });
}

/*******************************************************************
 * Ascolta i cambiamenti di *tutti* gli utenti per l'accettazione
 *******************************************************************/
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();

  // Se l'utente cambiato sono io e c'è un "invite", lo gestisco
  if (data.name === nickname && data.invite) {
    const invite = data.invite;
    const accept = confirm(`${invite.from} ti ha sfidato. Accetti?`);
    
    if (accept) {
      // Impostiamo entrambi "inGame: true" e creiamo la partita
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(invite.fromId).update({ inGame: true });
      // Avvio la partita
      startGameWith(invite.fromId, snapshot.key);
    } else {
      // Rimuovo l'invito se rifiuto
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

/*********************************************************************
 * Creazione e avvio partita: la esegue sempre chi ACCETTA la sfida
 *********************************************************************/
function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;

  // Chi accetta la sfida gioca con le pedine nere
  playerColor = 'black';

  // 1) Creo su Firebase un record "gameId" con damiera iniziale
  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red', // tocca al rosso (opponent) di default
    players: {
      red: opponentId,
      black: selfId
    }
  });

  // 2) Rimuovo eventuali inviti
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();

  // 3) Salvo il gameId su *entrambi* gli utenti
  usersRef.child(selfId).update({ currentGame: gameId });
  usersRef.child(opponentId).update({ currentGame: gameId });

  // 4) Io che ho accettato, inizio subito ad ascoltare la partita
  listenToGame(gameId);

  document.getElementById("status").textContent = "Partita iniziata!";
}

/************************************************************************
 * Creazione damiera iniziale 8x8 (pezzi rossi in basso, neri in alto)
 ************************************************************************/
function createInitialBoard() {
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      // Pedine nere in alto (solo caselle scure)
      if ((r + c) % 2 === 1 && r < 3) {
        row.push('black');
      }
      // Pedine rosse in basso (solo caselle scure)
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

/********************************************************************
 * Ascolta i cambiamenti del game su Firebase e aggiorna la damiera
 ********************************************************************/
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.board) {
      renderBoard(data.board);
    }
  });
}

/*********************************************************
 * Disegna la board (8x8) dentro #board
 *********************************************************/
function renderBoard(board) {
  const container = document.getElementById('board');
  container.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

      // Se c'è un pezzo (black o red), mostralo
      if (board[r][c]) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + board[r][c];
        square.appendChild(piece);
      }
      container.appendChild(square);
    }
  }
}

/*********************************************************************
 * Avviso se l'avversario si disconnette (opzionale, da migliorare)
 *********************************************************************/
function checkOpponentStatus(gameId) {
  // Se vuoi un controllo esplicito, puoi fare una logica simile
  // a "once('value')" e poi "on('value')" come nel tuo codice.
  // Non essenziale per vedere la scacchiera da entrambi i lati.
}

/******************************************************
 * Avvio dell'app quando la pagina è caricata
 ******************************************************/
window.onload = init;
