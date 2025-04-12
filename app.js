
let nickname = '';
let playerColor = '';
let currentGameId = '';
let userRef = null;

// Firebase paths
const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

function init() {
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);
  userRef = usersRef.push({ name: nickname, status: "online" });
  userRef.onDisconnect().remove();
  listenForUsers();
  renderLobby();
}

function listenForUsers() {
  usersRef.on("value", (snapshot) => {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "";
    snapshot.forEach((child) => {
      const user = child.val();
      const li = document.createElement("li");
      li.textContent = user.name + (user.status === "online" ? " 🟢" : " 🔴");
      if (user.name !== nickname && user.status === "online") {
        const btn = document.createElement("button");
        btn.textContent = "Sfida";
        btn.onclick = () => sendChallenge(child.key);
        li.appendChild(btn);
      }
      userList.appendChild(li);
    });
  });
}

function sendChallenge(targetId) {
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    id: userRef.key
  });
}

function renderLobby() {
  const container = document.getElementById("board");
  container.innerHTML = `
    <h3>Ciao, ${nickname}</h3>
    <h4>Utenti online:</h4>
    <ul id="user-list"></ul>
  `;
}

// Ascolta inviti in arrivo
usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  if (data.invite && data.name === nickname) {
    const accept = confirm(`${data.invite.from} ti ha sfidato a una partita. Accetti?`);
    if (accept) {
      startGameWith(data.invite.id, snapshot.key);
    } else {
      usersRef.child(snapshot.key).child("invite").remove();
    }
  }
});

function startGameWith(opponentId, selfId) {
  const gameId = Math.random().toString(36).substr(2, 5);
  currentGameId = gameId;
  playerColor = 'black';

  gamesRef.child(gameId).set({
    board: createInitialBoard(),
    turn: 'red',
    players: {
      red: opponentId,
      black: selfId
    }
  });

  // Rimuovi inviti
  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();

  // Avvia la partita
  document.getElementById("status").textContent = "Partita iniziata!";
  listenToGame(gameId);
}

function createInitialBoard() {
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

function listenToGame(gameId) {
  const ref = firebase.database().ref('games/' + gameId);
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      renderBoard(data.board || []);
    }
  });
}

function renderBoard(board) {
  const container = document.getElementById('board');
  container.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      square.dataset.row = r;
      square.dataset.col = c;

      if (board[r][c]) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + board[r][c];
        square.appendChild(piece);
      }

      container.appendChild(square);
    }
  }
}

// Avvia
window.onload = init;
