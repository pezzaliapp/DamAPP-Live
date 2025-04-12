
let nickname = '';
let playerColor = '';
let gameRef = null;
let currentGameId = '';

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

function createGame() {
  nickname = document.getElementById('nickname').value || 'Player';
  const gameId = Math.random().toString(36).substr(2, 5);
  playerColor = 'red';
  document.getElementById('status').textContent = 'Partita creata. Codice: ' + gameId;

  const board = createInitialBoard();

  gameRef = firebase.database().ref('games/' + gameId);
  gameRef.set({ board: board, turn: 'red', players: { red: nickname } });

  currentGameId = gameId;
  listenToGame(gameId);
}

function joinGame() {
  nickname = document.getElementById('nickname').value || 'Player';
  const gameId = document.getElementById('roomId').value;
  playerColor = 'black';
  document.getElementById('status').textContent = 'Sei entrato nella partita: ' + gameId;

  gameRef = firebase.database().ref('games/' + gameId + '/players');
  gameRef.update({ black: nickname });

  currentGameId = gameId;
  listenToGame(gameId);
}

function listenToGame(gameId) {
  const ref = firebase.database().ref('games/' + gameId);
  ref.on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      document.getElementById('status').textContent = 'Turno: ' + data.turn;
      renderBoard(data.board || [], gameId, data.turn);
    }
  });
}

function renderBoard(board, gameId, turn) {
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

      square.addEventListener('click', () => handleClick(r, c, board, gameId, turn));
      container.appendChild(square);
    }
  }
}

let selected = null;

function handleClick(r, c, board, gameId, turn) {
  if (turn !== playerColor) return;

  if (selected) {
    const [sr, sc] = selected;
    const dr = r - sr;
    const dc = c - sc;

    if (Math.abs(dr) === 1 && Math.abs(dc) === 1 && !board[r][c]) {
      board[r][c] = board[sr][sc];
      board[sr][sc] = '';
      updateBoard(gameId, board);
      switchTurn(gameId, turn);
      selected = null;
    } else if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
      const mr = sr + dr / 2;
      const mc = sc + dc / 2;
      if (board[mr][mc] && board[mr][mc] !== board[sr][sc] && !board[r][c]) {
        board[r][c] = board[sr][sc];
        board[sr][sc] = '';
        board[mr][mc] = '';
        updateBoard(gameId, board);
        switchTurn(gameId, turn);
        selected = null;
      }
    } else {
      selected = null;
    }
  } else if (board[r][c] === playerColor) {
    selected = [r, c];
  }
}

function updateBoard(gameId, board) {
  firebase.database().ref('games/' + gameId + '/board').set(board);
}

function switchTurn(gameId, currentTurn) {
  const nextTurn = currentTurn === 'red' ? 'black' : 'red';
  firebase.database().ref('games/' + gameId + '/turn').set(nextTurn);
}
