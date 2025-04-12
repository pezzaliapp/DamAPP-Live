
let nickname = '';
let playerColor = '';
let currentGameId = '';
let userRef = null;

const usersRef = firebase.database().ref('users');
const gamesRef = firebase.database().ref('games');

function init() {
  nickname = prompt("Inserisci il tuo nome") || "Guest" + Math.floor(Math.random() * 1000);
  

userRef = usersRef.push({ name: nickname, status: "online", lastActive: Date.now(), inGame: false });
userRef.onDisconnect().remove();

// Aggiorna lastActive ogni 30 secondi
setInterval(() => {
  userRef.update({ lastActive: Date.now() });
}, 30000);

userRef.onDisconnect().remove();

// Aggiorna lastActive ogni 30 secondi
setInterval(() => {
  userRef.update({ lastActive: Date.now() });
}, 30000);

  userRef.onDisconnect().remove();
  listenForUsers();
  renderLobby();
}

function listenForUsers() {
  usersRef.on("value", (snapshot) => {
    const userList = document.getElementById("board");
    userList.innerHTML = "<h3>Ciao, " + nickname + "</h3><h4>Utenti online:</h4><ul id='user-list'></ul>";
    const ul = document.getElementById("user-list");
    
const now = Date.now();
snapshot.forEach((child) => {
  const user = child.val();
  
if (!user.lastActive || now - user.lastActive > 60000 || user.inGame) return;
 // ignora utenti inattivi da >60s

      const user = child.val();
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

function sendChallenge(targetId) {
  usersRef.child(targetId).child("invite").set({
    from: nickname,
    id: userRef.key
  });
}

usersRef.on("child_changed", (snapshot) => {
  const data = snapshot.val();
  if (data.invite && data.name === nickname) {
    const accept = confirm(data.invite.from + " ti ha sfidato. Accetti?");
    if (accept) {
      
usersRef.child(snapshot.key).update({ inGame: true });
usersRef.child(data.invite.id).update({ inGame: true });
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

  usersRef.child(selfId).child("invite").remove();
  usersRef.child(opponentId).child("invite").remove();

  document.getElementById("status").textContent = "Partita iniziata!";
  
listenToGame(gameId);
checkOpponentStatus(gameId);

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
  playerColor = playerColor || (Math.random() > 0.5 ? 'red' : 'black');
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
      if (board[r][c]) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + board[r][c];
        square.appendChild(piece);
      }
      container.appendChild(square);
    }
  }
}

window.onload = init;


function checkOpponentStatus(gameId) {
  firebase.database().ref('games/' + gameId + '/players').once('value').then(snapshot => {
    const players = snapshot.val();
    const opponentKey = playerColor === 'red' ? players.black : players.red;
    firebase.database().ref('users/' + opponentKey).on('value', snap => {
      const val = snap.val();
      if (!val) {
        document.getElementById('status').textContent = "⚠️ Il tuo avversario si è disconnesso.";
      }
    });
  });
}
