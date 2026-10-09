const QUESTIONS = require('../../games_db.json');

let globalActiveGame = null;

const CATEGORY_KEYS = {
  mixed: ['kitaba', 'tafkik', 'ahzer', 'million'],
  كتابة: ['kitaba'],
  تفكيك: ['tafkik'],
  احزر: ['ahzer'],
  المليون: ['million']
};

const normalizeArabic = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[إأآا]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[ـ\s]+/g, ' ')
  .trim();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const sendHumanMessage = async (sock, chat, text, quoted) => {
  await sock.sendPresenceUpdate('composing', chat);
  await wait(1500 + Math.floor(Math.random() * 1501));
  return sock.sendMessage(chat, { text }, { quoted });
};

const parseGame = (args) => {
  let type = 'mixed';
  let rounds = 10;
  if (/^\d+$/.test(args[0] || '')) rounds = Number(args[0]);
  else if (args[0]) {
    type = args[0];
    if (/^\d+$/.test(args[1] || '')) rounds = Number(args[1]);
  }
  return { type, rounds: Math.min(Math.max(rounds, 1), 30) };
};

const getQuestions = (type) => {
  const keys = CATEGORY_KEYS[type] || CATEGORY_KEYS.mixed;
  return keys.flatMap(key => QUESTIONS[key] || []);
};

const formatQuestion = (question) => question.choices
  ? `${question.q}\n${question.choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}`
  : question.q;

const startGame = async (sock, msg, args, extra) => {
  if (globalActiveGame) return;
  const { type, rounds } = parseGame(args);
  const questions = getQuestions(type);
  if (!questions.length) return;
  globalActiveGame = { chat: extra.from, scores: new Map(), round: 0, rounds, questions, answered: false };
  try {
    await sendHumanMessage(sock, extra.from, `🎮 بدأت اللعبة\nالنوع: ${type}\nالجولات: ${rounds}`, msg);
    await nextRound(sock, msg);
  } catch (error) {
    globalActiveGame = null;
    throw error;
  }
};

const nextRound = async (sock, quoted) => {
  const game = globalActiveGame;
  if (!game) return;
  if (game.round >= game.rounds) {
    const top = [...game.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const result = top.length ? top.map((entry, index) => `${index + 1}. @${entry[0].split('@')[0]} — ${entry[1]}`).join('\n') : 'لا توجد إجابات صحيحة.';
    await sock.sendMessage(game.chat, { text: `🏆 انتهت اللعبة!\n\n${result}`, mentions: top.map(entry => entry[0]) }, { quoted });
    globalActiveGame = null;
    return;
  }
  game.round += 1;
  game.answered = false;
  const question = game.questions[(game.round - 1) % game.questions.length];
  game.answer = normalizeArabic(question.a);
  await sock.sendMessage(game.chat, { text: `الجولة ${game.round}/${game.rounds}\n${formatQuestion(question)}` }, { quoted });
};

const handleMessage = async (sock, msg, body, extra) => {
  const game = globalActiveGame;
  if (!game || game.chat !== extra.from || !body || body.startsWith('.')) return false;
  if (game.answered || normalizeArabic(body) !== game.answer) return true;
  game.answered = true;
  const sender = extra.sender;
  game.scores.set(sender, (game.scores.get(sender) || 0) + 1);
  await sock.sendMessage(game.chat, { text: `✅ أسرع إجابة: @${sender.split('@')[0]}\nالنقاط: ${game.scores.get(sender)}`, mentions: [sender] }, { quoted: msg });
  await wait(3000);
  await nextRound(sock, msg);
  return true;
};

module.exports = {
  name: 'ابداء',
  aliases: ['ابدأ'],
  category: 'events',
  usage: '.ابداء [النوع] [عدد الجولات]',
  adminOnly: true,
  execute: startGame,
  handleMessage,
  normalizeArabic,
  sendHumanMessage
};