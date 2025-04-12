
let nickname = '';
let playerColor = '';
let gameRef = null;

function createGame() {
  nickname = document.getElementById('nickname').value || 'Player';
  const gameId = Math.random().toString(36).substr(2, 5);
  playerColor = 'red';
  document.getElementById('status').textContent = 'Partita creata. Codice: ' + gameId;

  gameRef = firebase.database().ref('games/' + gameId);
  gameRef.set({ board: [], turn: 'red', players: { red: nickname } });

  listenToGame(gameId);
}

function joinGame() {
  nickname = document.getElementById('nickname').value || 'Player';
  const gameId = document.getElementById('roomId').value;
  playerColor = 'black';
  document.getElementById('status').textContent = 'Sei entrato nella partita: ' + gameId;

  gameRef = firebase.database().ref('games/' + gameId + '/players');
  gameRef.update({ black: nickname });

  listenToGame(gameId);
}

function listenToGame(gameId) {
  const ref = firebase.database().ref('games/' + gameId);
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      document.getElementById('status').textContent = 'Turno: ' + data.turn;
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
      container.appendChild(square);
      if (board[r] && board[r][c]) {
        const piece = document.createElement('div');
        piece.className = 'piece ' + board[r][c];
        square.appendChild(piece);
      }
    }
  }
}
