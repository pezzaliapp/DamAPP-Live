let nickname = '';
let playerColor = '';
let currentGameId = '';
let userRef = null;

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

function init() {
  // Chiede il nickname all'utente
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);

  // Crea un record nel DB con lo stato dell'utente
  userRef = usersRef.push({
    name: nickname,
    status: "online",
    lastActive: Date.now(),
    inGame: false
  });

  // Rimuove l'utente al termine della connessione
  userRef.onDisconnect().remove();

  // Aggiorna lastActive ogni 30 secondi
  setInterval(() => {
    userRef.update({ lastActive: Date.now() });
  }, 30000);

  document.getElementById("status").textContent = `Benvenuto, ${nickname}! Seleziona un utente da sfidare.`;

  // Avvia l'ascolto per aggiornare la lista utenti
  listenForUsers();
}

// Mostra in #users la lista degli utenti online, escludendo chi è inattivo o già in partita
function listenForUsers() {
  usersRef.on("value", (snapshot) => {
    const usersContainer = document.getElementById("users");
    const now = Date.now();

    // Ricostruisce la sezione
    usersContainer.innerHTML = `
      <h3>Utenti online (non in gioco):</h3>
      <ul id="user-list"></ul>
    `;

    const ul = document.getElementById("user-list");

    snapshot.forEach((child) => {
      const user = child.val();

      // Ignora se inattivo > 60s o già in partita
      if (!user.lastActive || now - user.lastActive > 60000 || user.inGame) {
        return;
      }

      // Crea elemento di lista
      const li = document.createElement("li");
      li.textContent = user.name + " 🟢";

      // Se l'utente è diverso da me, aggiunge il pulsante "Sfida"
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

// Invia un invito di sfida a un utente
function sendChallenge(targetId) {
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    id: userRef.key
  });
}

// Quando cambiano i dati di un utente, controlliamo se c'è un invito per noi
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();

  // Se c'è un invito e l'utente corrisponde al mio nickname
  if (data.invite && data.name === nickname) {
    const accept = confirm(`${data.invite.from} ti ha sfidato. Accetti?`);
    if (accept) {
      // Mettiamo entrambi inGame
      usersRef.child(snapshot.key).update({ inGame: true });
      usersRef.child(data.invite.id).update({ inGame: true });

      // Avvia la partita
      startGameWith(data.invite.id, snapshot.key);
    } else {
      // Se rifiutiamo, togliamo l'invito
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

// Avvia la partita tra i due utenti
function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  // Chi accetta la sfida viene impostato come colore "black"
  playerColor = 'black';

  // Crea la partita nel DB con la damiera iniziale
  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red',
    players: {
      red: opponentId,
      black: selfId
    }
  });

  // Rimuoviamo eventuali inviti residui
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();

  document.getElementById("status").textContent = "Partita iniziata!";
  listenToGame(gameId);
  checkOpponentStatus(gameId);
}

// Crea lo schema base per una damiera a 8x8
function createInitialBoard() {
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      // Pezzi neri (black) nelle prime 3 righe (solo caselle scure)
      if ((r + c) % 2 === 1 && r < 3) {
        row.push('black');
      }
      // Pezzi rossi (red) nelle ultime 3 righe (solo caselle scure)
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

// Ascolta i cambiamenti sul game corrente
function listenToGame(gameId) {
  const ref = firebase.database().ref(`games/${gameId}`);
  ref.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.board) {
      renderBoard(data.board);
    }
  });
}

// Disegna la board nel div #board
function renderBoard(board) {
  const container = document.getElementById('board');
  container.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

      // Se c'è un pezzo in questa posizione, lo mostriamo
      if (board[r][c]) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + board[r][c];
        square.appendChild(piece);
      }
      container.appendChild(square);
    }
  }
}

// Controlla se l'avversario si è disconnesso durante la partita
function checkOpponentStatus(gameId) {
  firebase.database().ref(`games/${gameId}/players`)
    .once('value')
    .then(snapshot => {
      const players = snapshot.val();
      if (!players) return;

      // Determina la chiave dell'avversario
      const opponentKey = (playerColor === 'red') ? players.black : players.red;

      firebase.database().ref(`users/${opponentKey}`).on('value', snap => {
        const val = snap.val();
        if (!val) {
          document.getElementById('status').textContent =
            "⚠️ Il tuo avversario si è disconnesso.";
        }
      });
    });
}

// Avvio dell'app
window.onload = init;
