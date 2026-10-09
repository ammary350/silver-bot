const assert = require('assert');
const questions = require('./games_db.json');
const game = require('./commands/general/abda');

const chat = '120000000000000000@g.us';
const admin = '111111111111@s.whatsapp.net';
const player = '222222222222@s.whatsapp.net';
const messages = [];

const sock = {
  async sendPresenceUpdate() {},
  async sendMessage(to, content) {
    const text = content.text || '';
    messages.push({ to, text });
    console.log(text);
  }
};

const message = { key: { remoteJid: chat, id: 'LOCAL-TEST' } };
const context = (sender) => ({
  from: chat,
  sender,
  isGroup: true,
  groupMetadata: { participants: [] }
});

async function main() {
  await game.execute(sock, message, ['تفكيك', '3'], context(admin));
  const firstQuestion = questions.tafkik[0];
  assert(messages.some(entry => entry.text.includes('الجولة 1/3')), 'first question was not sent');

  const handledWrongAnswer = await game.handleMessage(sock, message, 'إجابة خاطئة', context(player));
  assert.strictEqual(handledWrongAnswer, true, 'wrong answer was not consumed');
  const beforeCorrect = messages.length;

  await game.handleMessage(sock, message, firstQuestion.a.replace(/ /g, '  '), context(player));
  assert(messages.length > beforeCorrect, 'correct answer produced no response');
  assert(messages.some(entry => entry.text.includes('النقاط: 1')), 'score was not updated');
  assert(messages.some(entry => entry.text.includes('الجولة 2/3')), 'round did not progress');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
