const config = require('../../src/config');

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

global.activeXOGames = global.activeXOGames || Object.create(null);

const getGames = () => global.activeXOGames;

const renderBoard = (board) => board
  .map((cell, index) => cell || String(index + 1))
  .reduce((rows, cell, index) => {
    const row = Math.floor(index / 3);
    rows[row].push(cell);
    return rows;
  }, [[], [], []])
  .map(row => ` ${row.join(' │ ')} `)
  .join('\n───┼───┼───\n');

const getWinner = (board) => WINNING_LINES.find(([a, b, c]) =>
  board[a] && board[a] === board[b] && board[a] === board[c]
);

const mention = (sender) => sender ? `@${sender.split('@')[0]}` : 'player';

const sendBoard = (sock, game, quoted, text, mentions = []) =>
  sock.sendMessage(game.chatId, {
    text: `${text}\n\n${renderBoard(game.board)}`,
    mentions,
  }, { quoted });

const startGame = async (sock, msg, args, extra) => {
  const games = getGames();
  if (games[extra.from]) {
    return extra.reply('🎮 An XO game is already active in this chat. Finish it before starting another.');
  }

  const game = {
    chatId: extra.from,
    board: Array(9).fill(null),
    players: { X: extra.sender, O: null },
    turn: 'X',
  };
  games[extra.from] = game;

  try {
    await sendBoard(
      sock,
      game,
      msg,
      `❌⭕ *Tic-Tac-Toe*\n${mention(extra.sender)} is ❌\n\nType a number from 1 to 9 to play. Waiting for an ⭕ player.`,
      [extra.sender],
    );
  } catch (error) {
    delete games[extra.from];
    throw error;
  }
};

const handleMessage = async (sock, msg, body, extra) => {
  const game = getGames()[extra.from];
  if (!game || !/^[1-9]$/.test(body)) return false;

  const position = Number(body) - 1;
  if (game.board[position]) {
    await extra.reply('That position is already occupied. Choose an empty number from 1 to 9.');
    return true;
  }

  let symbol = Object.keys(game.players).find(key => game.players[key] === extra.sender);
  if (!symbol) {
    if (game.players.O) {
      await extra.reply('This game already has two players.');
      return true;
    }
    game.players.O = extra.sender;
    symbol = 'O';
  }

  if (symbol !== game.turn) {
    await extra.reply(`It is ${game.turn === 'X' ? '❌' : '⭕'}'s turn.`);
    return true;
  }

  game.board[position] = symbol === 'X' ? '❌' : '⭕';
  const winner = getWinner(game.board);
  const isDraw = !winner && game.board.every(Boolean);

  if (winner || isDraw) {
    const result = winner
      ? `🏆 ${symbol === 'X' ? '❌' : '⭕'} ${mention(extra.sender)} wins!`
      : '🤝 It is a draw!';
    await sendBoard(sock, game, msg, result, [extra.sender]);
    delete getGames()[extra.from];
    return true;
  }

  game.turn = game.turn === 'X' ? 'O' : 'X';
  const nextPlayer = game.players[game.turn];
  const nextText = nextPlayer
    ? `🎮 ${game.turn === 'X' ? '❌' : '⭕'} ${mention(nextPlayer)}'s turn.`
    : '🎮 Waiting for an ⭕ player to join.';
  await sendBoard(sock, game, msg, nextText, nextPlayer ? [nextPlayer] : []);
  return true;
};

const isActiveGame = (chatId) => Boolean(getGames()[chatId]);

module.exports = {
  name: 'xo',
  aliases: ['tictactoe', 'tic-tac-toe'],
  category: 'games',
  description: 'Play Tic-Tac-Toe in the current chat',
  usage: `${config.prefix}xo`,
  execute: startGame,
  handleMessage,
  isActiveGame,
  renderBoard,
};
