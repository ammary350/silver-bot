const config = require('../../src/config');

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const POSITION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

global.activeXOGames = global.activeXOGames || Object.create(null);

const getGames = () => global.activeXOGames;
const mention = (sender) => sender ? `@${sender.split('@')[0]}` : 'player';

const renderBoard = (board) => board
  .map((cell, index) => cell || POSITION_EMOJIS[index])
  .reduce((rows, cell, index) => {
    rows[Math.floor(index / 3)].push(cell);
    return rows;
  }, [[], [], []])
  .map(row => row.join(' '))
  .join('\n');

const getWinner = (board) => WINNING_LINES.find(([a, b, c]) =>
  board[a] && board[a] === board[b] && board[a] === board[c]
);

const sendBoard = (sock, game, quoted, currentPlayer, mentions) => sock.sendMessage(
  game.chatId,
  {
    text: [
      '🎮 بدأت لعبة TicTacToe!',
      '',
      `👉 الدور على: ${mention(currentPlayer)}`,
      '',
      renderBoard(game.board),
      '',
      '🧩 القوانين:',
      '• اجمع 3 رموز متتالية للفوز',
      '• أرسل رقم من 1 إلى 9 لتضع الرمز',
      '• أرسل surrender للاستسلام',
    ].join('\n'),
    mentions,
  },
  { quoted },
);

const startLobby = async (sock, msg, extra) => {
  const games = getGames();
  if (games[extra.from]) {
    return extra.reply('🎮 توجد لعبة XO قيد الانتظار أو التشغيل بالفعل.');
  }

  games[extra.from] = {
    chatId: extra.from,
    phase: 'lobby',
    board: Array(9).fill(null),
    players: { X: extra.sender, O: null },
    turn: 'X',
  };

  try {
    await sock.sendMessage(extra.from, {
      text: '⏳ في انتظار خصم...\nاكتب `.ttt` أو `.xo` للانضمام!',
    }, { quoted: msg });
  } catch (error) {
    delete games[extra.from];
    throw error;
  }
};

const joinLobby = async (sock, msg, extra) => {
  const game = getGames()[extra.from];
  if (!game) {
    await startLobby(sock, msg, extra);
    return true;
  }

  if (game.phase !== 'lobby') {
    await extra.reply('🎮 توجد لعبة XO قيد التشغيل بالفعل.');
    return true;
  }

  if (game.players.X === extra.sender) {
    await extra.reply('⏳ أنت اللاعب الأول. في انتظار خصم للانضمام.');
    return true;
  }

  game.players.O = extra.sender;
  game.phase = 'started';
  await sendBoard(sock, game, msg, game.players.X, [game.players.X]);
  return true;
};

const execute = (sock, msg, args, extra) => joinLobby(sock, msg, extra);

const handleCommand = async (sock, msg, body, extra) => {
  const normalized = body.toLowerCase();
  if (!['.xo', 'xo', '.ttt', 'ttt', '.اكس او', 'اكس او'].includes(normalized)) {
    return false;
  }
  return joinLobby(sock, msg, extra);
};

const handleMessage = async (sock, msg, body, extra) => {
  const game = getGames()[extra.from];
  if (!game || game.phase !== 'started' || !/^[1-9]$/.test(body)) return false;

  const symbol = game.players.X === extra.sender
    ? 'X'
    : game.players.O === extra.sender
      ? 'O'
      : null;

  if (!symbol) {
    await extra.reply('🎮 هذه اللعبة مخصصة للاعبين المشاركين فقط.');
    return true;
  }

  if (symbol !== game.turn) {
    await extra.reply(`👉 الدور على: ${mention(game.players[game.turn])}`);
    return true;
  }

  const position = Number(body) - 1;
  if (game.board[position]) {
    await extra.reply('❌ هذا المكان مستخدم، اختر رقماً آخراً من 1 إلى 9.');
    return true;
  }

  game.board[position] = symbol === 'X' ? '❌' : '⭕';
  const winner = getWinner(game.board);
  const isDraw = !winner && game.board.every(Boolean);

  if (winner || isDraw) {
    const result = winner
      ? `🏆 الفائز: ${mention(extra.sender)}`
      : '🤝 تعادل!';
    await sock.sendMessage(extra.from, {
      text: `${result}\n\n${renderBoard(game.board)}`,
      mentions: [extra.sender],
    }, { quoted: msg });
    delete getGames()[extra.from];
    return true;
  }

  game.turn = game.turn === 'X' ? 'O' : 'X';
  await sendBoard(sock, game, msg, game.players[game.turn], [game.players[game.turn]]);
  return true;
};

const isActiveGame = (chatId) => Boolean(getGames()[chatId]);

module.exports = {
  name: 'xo',
  aliases: ['ttt', 'tictactoe', 'tic-tac-toe', 'اكس او'],
  category: 'games',
  description: 'Play Tic-Tac-Toe in the current chat',
  usage: `${config.prefix}xo`,
  execute,
  handleCommand,
  handleMessage,
  isActiveGame,
  renderBoard,
};
