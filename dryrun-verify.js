/**
 * Dry-run verification — NO real WhatsApp actions.
 * Uses a mock socket; backs up and restores data/groups.json + data/blocklist.json.
 * Run:  node dryrun-verify.js   (from the project root)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(process.cwd(), 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const BLOCKLIST_FILE = path.join(DATA_DIR, 'blocklist.json');
const COOWNS_FILE = path.join(DATA_DIR, 'coowners.json');
const BOTADMINS_FILE = path.join(DATA_DIR, 'botadmins.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const backup = {};
for (const [name, file] of [['groups', GROUPS_FILE], ['blocklist', BLOCKLIST_FILE], ['coowners', COOWNS_FILE], ['botadmins', BOTADMINS_FILE], ['settings', SETTINGS_FILE]]) {
  backup[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

let pass = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };

async function main() {
  console.log('=== DRY-RUN VERIFICATION ===');

  const config = require('./config');
  const database = require('./database');
  const protections = require('./src/handlers/protections');
  const groupHandler = require('./src/handlers/groupHandler');
  const { registerGroupParticipantsEvents } = require('./src/events/groupParticipants');

  // ── Mock socket ──
  const calls = [];
  const metaCache = new Map();
  function mockSock() {
    return {
      user: { id: '249124050708@s.whatsapp.net', lid: '249124050708@lid' },
      ev: { on: (ev, cb) => { calls.push({ ev }); } },
      sendMessage: async (jid, content, opts) => { calls.push({ type: 'send', jid, content }); return { key: { id: 'x' } }; },
      groupParticipantsUpdate: async (jid, participants, action) => { calls.push({ type: 'members', jid, participants, action }); return {}; },
      updateBlockStatus: async (jid, status) => { calls.push({ type: 'block', jid, status }); return {}; },
      fetchBlocklist: async () => [],
      groupFetchAllParticipating: async () => { calls.push({ type: 'fetchAll' }); return Object.fromEntries(metaCache); },
      groupMetadata: async (groupId) => metaCache.get(groupId) || null
    };
  }
  const sock = mockSock();
  const callsOf = (pred) => calls.filter(pred);

  const GROUP = '120363000000000001@g.us';
  const OTHER_GROUP = '120363000000000002@g.us';
  const SENDER = '212700000001@s.whatsapp.net';
  const CARD_NUMBER = '19998887777@s.whatsapp.net';
  const OWNER_JID = `${config.ownerNumber[0]}@s.whatsapp.net`;

  function makeMeta({ senderAdmin = false, botAdmin = true } = {}) {
    return {
      subject: 'Dry Test Group',
      participants: [
        { id: '249124050708@s.whatsapp.net', admin: botAdmin ? 'admin' : null, phoneNumber: '249124050708@s.whatsapp.net' },
        { id: SENDER, admin: senderAdmin ? 'admin' : null, phoneNumber: SENDER },
        { id: '212700000002@s.whatsapp.net', admin: null, phoneNumber: '212700000002@s.whatsapp.net' }
      ]
    };
  }
  metaCache.set(GROUP, makeMeta());
  metaCache.set(OTHER_GROUP, makeMeta());

  const cardMsg = (over = {}) => ({
    key: { remoteJid: GROUP, participant: SENDER, id: 'MSG-CARD-1', fromMe: false },
    message: { contactMessage: { displayName: 'Card Person', vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Card Person\nTEL;waid=${CARD_NUMBER}:${CARD_NUMBER}\nEND:VCARD` } }
  });

  // 1) owner numbers absent from menu / status output
  console.log('\n[Part 1] Owner visibility');
  {
    database.updateGroupSettings(GROUP, { welcome: false, goodbye: false, joinrules: false });
    const menuCmd = require('./commands/general/menu');
    const menuCalls = [];
    const mSock = mockSock();
    const origSend = mSock.sendMessage;
    mSock.sendMessage = async (jid, content) => { menuCalls.push(content); return {}; };
    await menuCmd.execute(mSock, cardMsg(), [], { from: GROUP, sender: SENDER, isGroup: true, groupMetadata: metaCache.get(GROUP), reply: async () => {}, react: async () => {} });
    const menuText = menuCalls.map(c => c.caption || c.text || '').join('\n');
    assert(!menuText.includes('212722838422') && !menuText.includes('212750038790'), 'menu leaks owner numbers');
    assert(!menuText.includes('249124050708'), 'menu leaks bot number');
    ok('menu contains no owner/bot numbers');
    const statusSrc = fs.readFileSync(path.join(process.cwd(), 'commands/general/status.js'), 'utf8');
    assert(!statusSrc.includes('ownerNumber') && !statusSrc.includes('getOwnerLines'), 'status command renders owner data');
    ok('status command has no owner-number rendering');
  }

  // 2) .owner sends vCards, no plain-text numbers
  {
    const ownerCmd = require('./commands/general/owner');
    const sent = [];
    let replyText = '';
    const oSock = mockSock();
    const origSend = oSock.sendMessage;
    oSock.sendMessage = async (jid, content) => { sent.push(content); return {}; };
    await ownerCmd.execute(oSock, cardMsg(), [], { from: GROUP, sender: SENDER, isGroup: true, groupMetadata: metaCache.get(GROUP), reply: async (t) => { replyText = t; }, react: async () => {} });
    const contactsMsg = sent.find(c => c.contacts);
    assert(contactsMsg, '.owner did not send a contacts message');
    const { contacts } = contactsMsg;
    assert(contacts.displayName && contacts.contacts.length > 0, 'contacts.displayName missing');
    for (const c of contacts.contacts) {
      assert(c.vcard.includes('BEGIN:VCARD') && c.vcard.includes('VERSION:3.0') && c.vcard.includes('FN:') && c.vcard.includes('TEL;waid=') && c.vcard.includes('END:VCARD'), 'invalid vCard: ' + c.vcard);
    }
    assert(!/212722838422|212750038790|249124050708/.test(replyText), '.owner reply leaks numbers');
    ok(`.owner sent ${contacts.contacts.length} valid vCard(s), reply number-free`);
    const cfgNumbers = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
    assert.deepStrictEqual(cfgNumbers, ['212722838422', '212750038790'], 'owner numbers changed!');
    ok('owner numbers unchanged (config)');
    const vc = contacts.contacts[0].vcard;
    assert(vc.includes('waid=212722838422:212722838422'), 'vCard uses normalized owner number');
    ok('vCard waid uses existing owner number');
  }

  // 3) detc toggle
  console.log('\n[Part 2] Promotion detection (.detc)');
  {
    const promoteUpdate = { id: GROUP, participants: [SENDER], actor: OWNER_JID };
    database.updateGroupSettings(GROUP, { detc: true });
    const onSock = mockSock();
    const onCalls = [];
    const origSend = onSock.sendMessage;
    onSock.sendMessage = async (jid, content) => { onCalls.push(content); return {}; };
    await protections.handlePromotionDetection(onSock, promoteUpdate, database.getGroupSettings(GROUP));
    assert(onCalls.some(c => (c.text || '').includes('Promotion Detected')), 'detc ON: no notification');
    ok('detc ON: promotion notification sent');
    database.updateGroupSettings(GROUP, { detc: false });
    const offSock = mockSock();
    const offCalls = [];
    const origSend2 = offSock.sendMessage;
    offSock.sendMessage = async (jid, content) => { offCalls.push(content); return {}; };
    await protections.handlePromotionDetection(offSock, promoteUpdate, database.getGroupSettings(GROUP));
    assert(offCalls.length === 0, 'detc OFF: handler sent something');
    ok('detc OFF: handler sends nothing');
    const persisted = database.getGroupSettings(GROUP).detc;
    assert(persisted === false, 'detc setting not persisted');
    ok('detc OFF persists across restart (re-read from storage)');
    const addRemoveSock = mockSock();
    const arCalls = [];
    const origSend3 = addRemoveSock.sendMessage;
    addRemoveSock.sendMessage = async (jid, content) => { arCalls.push(content); return {}; };
    await groupHandler.handleGroupUpdate(addRemoveSock, { id: GROUP, action: 'add', participants: [SENDER], actor: OWNER_JID });
    await groupHandler.handleGroupUpdate(addRemoveSock, { id: GROUP, action: 'remove', participants: [SENDER], actor: OWNER_JID });
    assert(arCalls.length === 0, 'add/remove triggered promotion handling');
    ok('add/remove behavior unchanged (no promotion processing)');
  }

  // 4) contact-card anti-spam
  console.log('\n[Part 3] Contact-card anti-spam');
  {
    database.updateGroupSettings(GROUP, { antiacc: true });
    const content = { contactMessage: { vcard: 'x' } };

    // bot admin, plain message (no card) → nothing
    calls.length = 0;
    await protections.handleAntiAcc(sock, cardMsg(), GROUP, SENDER, metaCache.get(GROUP), { conversation: 'hello 212700000009' });
    assert(callsOf(c => c.type === 'members' || c.type === 'block').length === 0, 'plain text triggered enforcement');
    ok('plain text with number: no action');

    // bot admin + contact card → delete + kick sender + blocklist sender
    calls.length = 0;
    const senderNotInOtherGroupMeta = { ...metaCache.get(OTHER_GROUP), participants: metaCache.get(OTHER_GROUP).participants.filter(p => p.id !== SENDER) };
    metaCache.set(OTHER_GROUP, senderNotInOtherGroupMeta);
    await protections.handleAntiAcc(sock, cardMsg(), GROUP, SENDER, metaCache.get(GROUP), content);
    const delCalls = callsOf(c => c.type === 'send' && c.content && c.content.delete);
    assert(delCalls.length === 1 && delCalls[0].content.delete.id === 'MSG-CARD-1', 'wrong/duplicate delete target');
    ok('only the triggering card message targeted for deletion');
    const memberCalls = callsOf(c => c.type === 'members' && c.action === 'remove');
    assert(memberCalls.length === 1, 'more than one removal attempted');
    assert(memberCalls[0].jid === GROUP, 'removal outside the current group!');
    assert(memberCalls[0].participants[0] === SENDER, 'removal target is not the sender');
    ok('only the sender removed, only from the current group');
    const entry = database.getRichBlocklist().find(e => e.number === '212700000001');
    assert(entry && entry.number === '212700000001', 'blocklist entry missing/wrong');
    ok('sender stored in canonical blocklist (not the card number)');
    assert(!database.isNumberBlocked('19998887777'), 'card number was banned!');
    ok('contact-card number NOT banned');

    // duplicate delivery (same msg id) → no second processing
    const before = calls.length;
    await protections.handleAntiAcc(sock, cardMsg(), GROUP, SENDER, metaCache.get(GROUP), content);
    const after = calls.length;
    assert(after === before, 'duplicate delivery caused re-processing');
    ok('duplicate delivery: one processing attempt only');

    // owner sends card → protected
    calls.length = 0;
    const ownerMsg = { key: { remoteJid: GROUP, participant: OWNER_JID, id: 'MSG-OWNER', fromMe: false }, message: { contactMessage: { vcard: 'x' } } };
    await protections.handleAntiAcc(sock, ownerMsg, GROUP, OWNER_JID, metaCache.get(GROUP), content);
    assert(calls.length === 0, 'owner card triggered action');
    ok('owner sending a contact card: protected');

    // bot sends card (fromMe) → no action
    calls.length = 0;
    const botMsg = { key: { remoteJid: GROUP, participant: '249124050708@s.whatsapp.net', id: 'MSG-BOT', fromMe: true }, message: { contactMessage: { vcard: 'x' } } };
    await protections.handleAntiAcc(sock, botMsg, GROUP, '249124050708@s.whatsapp.net', metaCache.get(GROUP), content);
    assert(calls.length === 0, 'bot card triggered action');
    ok('bot sending a contact card: no action');

    // card number not a participant → no error, sender still target
    calls.length = 0;
    const card2 = { key: { remoteJid: GROUP, participant: '212700000002@s.whatsapp.net', id: 'MSG-CARD-2', fromMe: false }, message: { contactMessage: { vcard: `BEGIN:VCARD\nTEL;waid=19998887777:19998887777\nEND:VCARD` } } };
    await protections.handleAntiAcc(sock, card2, GROUP, '212700000002@s.whatsapp.net', metaCache.get(GROUP), content);
    const kicks = callsOf(c => c.type === 'members' && c.action === 'remove');
    assert(kicks.length === 1 && kicks[0].participants[0] === '212700000002@s.whatsapp.net', 'card-number-as-target or error');
    ok('card number not in group: no error, sender remains the only target');

    // bot not admin → no kick, no blocklist, owner DM
    calls.length = 0;
    const nonAdminMeta = makeMeta({ botAdmin: false });
    metaCache.set(GROUP, nonAdminMeta);
    const dm = { key: { remoteJid: GROUP, participant: '212700000003@s.whatsapp.net', id: 'MSG-CARD-3', fromMe: false }, message: { contactMessage: { vcard: 'x' } } };
    await protections.handleAntiAcc(sock, dm, GROUP, '212700000003@s.whatsapp.net', nonAdminMeta, content);
    assert(callsOf(c => c.type === 'members').length === 0, 'kick attempted without admin');
    assert(!database.isNumberBlocked('212700000003'), 'blocklisted without admin');
    const dmCalls = callsOf(c => c.type === 'send' && c.jid === OWNER_JID);
    assert(dmCalls.length >= 1, 'owner not notified when bot lacks admin');
    ok('bot not admin: no kick, no blocklist, owner notified, no crash');
    metaCache.set(GROUP, makeMeta());
  }

  // 5) listener registered exactly once
  console.log('\n[Part 5] Listener registration');
  {
    const evLog = [];
    const regSock = { ev: { on: (ev) => evLog.push(ev) } };
    registerGroupParticipantsEvents(regSock, {});
    const count = evLog.filter(e => e === 'group-participants.update').length;
    assert(count === 1, `group-participants.update registered ${count} times`);
    ok('group-participants.update registered exactly once');
  }

  // 6) roles message: mention in-group holders, show numbers for absent holders
  console.log('\n[Part 6] Roles display');
  {
    const rolesCmd = require('./commands/roles/roles');
    const owner1 = config.ownerNumber[0];            // in group
    const owner2 = config.ownerNumber[1];            // not in group
    const coTest = '212760000001';                    // in group
    const admTest = '212770000001';                   // not in group

    const coowns = database.getCoOwners();
    const botAdmins = database.getBotAdmins();
    for (const c of coowns) database.removeCoOwner(c);
    for (const a of botAdmins) database.removeBotAdmin(a);
    database.addCoOwner(coTest);
    database.addBotAdmin(admTest);

    const rolesMeta = {
      subject: 'Roles Test',
      participants: [
        { id: '249124050708@s.whatsapp.net', admin: 'admin' },
        { id: `${owner1}@s.whatsapp.net`, admin: 'admin' },
        { id: `${coTest}@s.whatsapp.net`, admin: 'admin' }
      ]
    };

    const sent = [];
    const rSock = mockSock();
    const origSend = rSock.sendMessage;
    rSock.sendMessage = async (jid, content) => { sent.push(content); return {}; };
    await rolesCmd.execute(rSock, cardMsg(), [], { from: GROUP, sender: SENDER, isGroup: true, groupMetadata: rolesMeta, reply: async () => {}, react: async () => {} });

    const msgOut = sent.find(c => c.text);
    assert(msgOut, 'roles did not send a message');
    const text = msgOut.text;
    const mentions = msgOut.mentions || [];

    // message design preserved
    assert(text.includes('╭━━『 *Role System* 』━━╮') && text.includes('╰━━━━━━━━━━━━━━━╯'), 'roles box design changed');
    assert(text.includes('*👑 Owner* (highest authority)') && text.includes('*🤖 Bot* (runtime identity)') && text.includes('*⭐ Co-owner* (strong management)') && text.includes('*🛡️ Bot Admin* (moderation, no role assignment)'), 'roles section design changed');
    ok('roles message design preserved');

    // owner1 in group -> real mention
    assert(text.includes(`@${owner1}`), 'in-group owner not mentioned');
    assert(mentions.includes(`${owner1}@s.whatsapp.net`), 'in-group owner JID missing from mentions');
    // owner2 not in group -> formatted number, no mention
    assert(text.includes(database.formatNumber(owner2)), 'out-of-group owner number not shown');
    assert(!text.includes(`@${owner2}`), 'out-of-group owner was mentioned');
    assert(!mentions.includes(`${owner2}@s.whatsapp.net`), 'out-of-group owner JID in mentions');
    ok('owner: in-group mentioned, out-of-group shows number');

    // bot in group -> mention
    assert(mentions.includes('249124050708@s.whatsapp.net'), 'in-group bot not mentioned');
    ok('bot in group: mentioned');

    // co-owner in group -> mention
    assert(text.includes(`@${coTest}`) && mentions.includes(`${coTest}@s.whatsapp.net`), 'in-group co-owner not mentioned');
    // admin not in group -> number
    assert(text.includes(database.formatNumber(admTest)) && !mentions.includes(`${admTest}@s.whatsapp.net`), 'out-of-group admin displayed wrong');
    ok('co-owner in-group mentioned; admin out-of-group shows number');

    assert(!/@lid/.test(text), 'raw lid shown in roles text');
    ok('no raw @lid values in roles text');
  }

  // 7) Block Control group: automatic phone-number blocklisting
  console.log('\n[Part 7] Block Control group');
  {
    const blockctrl = require('./src/features/blockctrl');
    const blockctrlCmd = require('./commands/owner/blockctrl');
    blockctrl.clearBlockControlGroup();

    // --- detection unit tests (pure) ---
    const rules = { cc: '212' };
    const det = (t) => blockctrl.detectNumbers(t, rules);
    assert.deepStrictEqual(det('+212600000000 hello'), ['212600000000'], 'intl prefix example');
    ok('detect: +212600000000 hello');
    assert.deepStrictEqual(det('hello 212600000000'), ['212600000000'], 'bare intl example');
    ok('detect: hello 212600000000');
    assert.deepStrictEqual(det('number: 06 00 00 00 00'), ['212600000000'], 'local spaced example');
    ok('detect: 06 00 00 00 00 (local -> canonical)');
    assert.deepStrictEqual(det('call me at +212 6 00 00 00 00'), ['212600000000'], 'spaced intl example');
    ok('detect: +212 6 00 00 00 00');
    assert.deepStrictEqual(det('abc-(+212)-600-000-000-xyz'), ['212600000000'], 'surrounded example');
    ok('detect: abc-(+212)-600-000-000-xyz');
    assert.deepStrictEqual(det('رقم ٠٦١٢٣٤٥٦٧٨ شكرا'), ['212612345678'], 'Arabic-Indic digits example');
    ok('detect: Arabic-Indic digits');
    assert.deepStrictEqual(det('15082026'), [], 'date rejected');
    assert.deepStrictEqual(det('ID 7654321'), [], 'short ID rejected');
    assert.deepStrictEqual(det('12345678901234567890'), [], '>15 digits rejected');
    assert.deepStrictEqual(det('000000000'), [], 'repeated digit rejected');
    assert.deepStrictEqual(det('hello world, no numbers here'), [], 'plain text rejected');
    ok('rejects dates, IDs, long/repeated digits, plain text');
    assert(!/@lid|@g\.us|@s\.whatsapp\.net/.test(JSON.stringify(det('group 120363000000000001@g.us msg-id ABC123'))), 'JIDs / message IDs treated as numbers');
    ok('JIDs and message IDs are not phone numbers');

    // --- command: owner-only selection ---
    let replyTexts = [];
    const cmdExtra = (over = {}) => ({ from: GROUP, isGroup: true, reply: async (t) => replyTexts.push(t), react: async () => {}, ...over });
    replyTexts = [];
    await blockctrlCmd.execute(sock, cardMsg(), [], cmdExtra());
    assert(replyTexts[0].includes('No Block Control group'), 'status reply wrong');
    ok('command: status shows not set');
    replyTexts = [];
    await blockctrlCmd.execute(sock, cardMsg(), ['set'], cmdExtra({ isGroup: false }));
    assert(replyTexts[0].includes('inside the group'), 'non-group set not rejected');
    assert(blockctrl.getBlockControlGroup() === '', 'set applied outside a group');
    ok('command: set outside group rejected');
    replyTexts = [];
    await blockctrlCmd.execute(sock, cardMsg(), ['set'], cmdExtra());
    assert(blockctrl.getBlockControlGroup() === GROUP, 'set did not persist');
    ok('command: set in group persists');
    replyTexts = [];
    await blockctrlCmd.execute(sock, cardMsg(), ['off'], cmdExtra());
    assert(blockctrl.getBlockControlGroup() === '', 'off did not clear');
    ok('command: off clears selection');
    await blockctrlCmd.execute(sock, cardMsg(), ['set'], cmdExtra());
    assert(blockctrl.getBlockControlGroup() === GROUP, 're-set failed');
    ok('command: re-select for integration test');

    // --- integration: scanning + delayed enforcement ---
    const bannedA = '212600000000';
    const bannedB = '212555555555';
    for (const meta of [metaCache.get(GROUP), metaCache.get(OTHER_GROUP)]) {
      meta.participants.push({ id: `${bannedA}@s.whatsapp.net`, admin: null, phoneNumber: `${bannedA}@s.whatsapp.net` });
      meta.participants.push({ id: `${bannedB}@s.whatsapp.net`, admin: null, phoneNumber: `${bannedB}@s.whatsapp.net` });
    }
    const controlMsg = (over = {}) => ({
      key: { remoteJid: GROUP, participant: SENDER, id: 'MSG-CTRL-1', fromMe: false },
      message: { conversation: '+212600000000 hello' },
      ...over
    });

    calls.length = 0;
    await blockctrl.handleBlockControlMessage(sock, controlMsg());
    // duplicate delivery — same number, different id → ignored
    await blockctrl.handleBlockControlMessage(sock, controlMsg({ key: { remoteJid: GROUP, participant: SENDER, id: 'MSG-CTRL-2', fromMe: false } }));
    // quoted text carries the second number
    await blockctrl.handleBlockControlMessage(sock, {
      key: { remoteJid: GROUP, participant: SENDER, id: 'MSG-CTRL-3', fromMe: false },
      message: { extendedTextMessage: { text: 'see this', contextInfo: { quotedMessage: { conversation: 'call me at +212 5 55 55 55 55' } } } }
    });
    // message in another group while control = GROUP → nothing
    await blockctrl.handleBlockControlMessage(sock, { key: { remoteJid: OTHER_GROUP, participant: SENDER, id: 'MSG-CTRL-4', fromMe: false }, message: { conversation: '+212600000000' } });
    // bot's own message in the control group → nothing
    await blockctrl.handleBlockControlMessage(sock, { key: { remoteJid: GROUP, participant: '249124050708@s.whatsapp.net', id: 'MSG-CTRL-5', fromMe: true }, message: { conversation: '+212600000000' } });
    // owner number → never blocked
    await blockctrl.handleBlockControlMessage(sock, { key: { remoteJid: GROUP, participant: SENDER, id: 'MSG-CTRL-6', fromMe: false }, message: { conversation: `+${config.ownerNumber[0]}` } });

    const entries = database.getRichBlocklist().filter(e => e.number === bannedA || e.number === bannedB);
    assert(entries.length === 2, `expected 2 entries, got ${entries.length}`);
    ok('both numbers blocklisted immediately, duplicate ignored');
    assert(entries.every(e => e.reason === 'blockctrl'), 'entry reason wrong');
    ok('entries tagged with blockctrl reason');
    assert(!database.isNumberBlocked(config.ownerNumber[0]), 'owner was blocklisted!');
    ok('owner number never blocklisted');
    assert(callsOf(c => c.type === 'send').length === 0, 'public message sent by the scan');
    ok('no public announcement of detected numbers');

    // wait for the 3-4s delayed enforcement
    await new Promise(r => setTimeout(r, 5500));
    const blockCallsA = callsOf(c => c.type === 'block' && c.jid === `${bannedA}@s.whatsapp.net`);
    const blockCallsB = callsOf(c => c.type === 'block' && c.jid === `${bannedB}@s.whatsapp.net`);
    assert(blockCallsA.length === 1, `number A blocked ${blockCallsA.length} times`);
    assert(blockCallsB.length === 1, `number B blocked ${blockCallsB.length} times`);
    ok('delayed enforcement: each number WhatsApp-blocked exactly once (dedupe)');
    const removals = callsOf(c => c.type === 'members' && c.action === 'remove' && (c.participants[0] === `${bannedA}@s.whatsapp.net` || c.participants[0] === `${bannedB}@s.whatsapp.net`));
    const removedJids = new Set(removals.map(c => c.jid));
    assert(removedJids.has(GROUP) && removedJids.has(OTHER_GROUP), 'not removed from every group where present');
    ok('enforcement removed both numbers from every group where the bot is admin');
    assert(callsOf(c => c.type === 'send').length === 0, 'enforcement announced publicly');
    ok('no public messages during enforcement');

    // --- wiring: message handler hooks the scan before mute ---
    const mhSrc = fs.readFileSync(path.join(process.cwd(), 'src/handlers/messageHandler.js'), 'utf8');
    assert(mhSrc.includes('handleBlockControlMessage'), 'messageHandler does not call the scan');
    assert(mhSrc.indexOf('handleBlockControlMessage(sock, msg)') < mhSrc.indexOf('muteGs.mute'), 'scan must run before the mute check');
    ok('messageHandler runs the scan before mute (control group stays active)');

    blockctrl.clearBlockControlGroup();
  }

  // 8) .resetroles: preview -> confirm within 30s, owners preserved
  console.log('\n[Part 8] Role reset (.resetroles)');
  {
    const resetCmd = require('./commands/owner/resetroles');
    const coowns = database.getCoOwners();
    const botAdmins = database.getBotAdmins();
    for (const c of coowns) database.removeCoOwner(c);
    for (const a of botAdmins) database.removeBotAdmin(a);
    assert(database.getCoOwners().length === 0 && database.getBotAdmins().length === 0, 'pre-clean failed');
    database.addCoOwner(`${config.ownerNumber[0]}@s.whatsapp.net`); // owner stored as co-owner (weird state)
    database.addCoOwner('12345@lid');                               // LID-identity co-owner
    database.addCoOwner('212760000001@s.whatsapp.net');
    database.addBotAdmin('212770000001@s.whatsapp.net');

    assert(resetCmd.ownerOnly === true, 'resetroles is not owner-only');
    ok('ownerOnly: true');

    // confirm without preview -> rejected
    let replies = [];
    const resetExtra = (over = {}) => ({ from: GROUP, sender: OWNER_JID, isGroup: true, reply: async (t) => replies.push(t), react: async () => {}, ...over });
    replies = [];
    await resetCmd.execute(sock, cardMsg(), ['confirm'], resetExtra());
    assert(replies[0].includes('No pending reset') || replies[0].includes('expired'), 'confirm without preview not rejected');
    assert(database.getCoOwners().length === 3, 'confirm without preview modified data');
    ok('confirm without preview rejected');

    // preview: nothing changes, reply shows what will be cleared
    replies = [];
    await resetCmd.execute(sock, cardMsg(), [], resetExtra());
    assert(database.getCoOwners().length === 3, 'preview modified co-owners');
    assert(database.getBotAdmins().length === 1, 'preview modified bot admins');
    assert(replies[0].includes('Role Reset Preview') && replies[0].includes('confirm'), 'preview reply wrong');
    assert(!/\d{7,}/.test(replies[0]), 'preview leaks phone numbers');
    ok('preview only (no data change, number-free)');

    // expiry: shorten TTL, preview, wait past TTL, confirm -> expired
    resetCmd._setTtl(50);
    replies = [];
    await resetCmd.execute(sock, cardMsg(), [], resetExtra());
    await new Promise(r => setTimeout(r, 120));
    replies = [];
    await resetCmd.execute(sock, cardMsg(), ['confirm'], resetExtra());
    resetCmd._setTtl(30000);
    assert(database.getCoOwners().length === 3, 'expired confirmation still applied');
    assert(replies[0].includes('expired'), 'expiry message wrong');
    ok('confirmation expires after TTL (nothing reset)');

    // full flow: preview -> confirm -> cleared + owners preserved
    replies = [];
    await resetCmd.execute(sock, cardMsg(), [], resetExtra());
    assert(database.getCoOwners().length === 3, 'preview changed data (2)');
    replies = [];
    await resetCmd.execute(sock, cardMsg(), ['confirm'], resetExtra());
    assert(database.getCoOwners().length === 0, 'co-owners not cleared');
    assert(database.getBotAdmins().length === 0, 'bot admins not cleared');
    ok('co-owners + bot admins cleared (incl. LID-stored identity)');
    assert(replies[0].includes('✅ Roles reset.') && replies[0].includes('Owners were preserved'), 'success message differs from spec');
    assert(replies[0].includes('Co-owners cleared') && replies[0].includes('Bot admins cleared'), 'success message incomplete');
    ok('success message matches spec');

    // owners + bot identity untouched
    assert(Array.isArray(config.ownerNumber) && config.ownerNumber.length === 2 && config.ownerNumber[0] === '212722838422' && config.ownerNumber[1] === '212750038790', 'owner config changed!');
    assert(database.getBotNumber() === '249124050708', 'bot identity changed!');
    ok('configured owners + bot identity preserved');

    // persistence: files on disk no longer contain the cleared identities
    const coFile = JSON.parse(fs.readFileSync(COOWNS_FILE, 'utf8'));
    const adFile = JSON.parse(fs.readFileSync(BOTADMINS_FILE, 'utf8'));
    assert((coFile.coowners || []).length === 0 && (adFile.admins || []).length === 0, 'reset not persisted to disk');
    ok('reset persisted (coowners.json / botadmins.json)');

    // no WhatsApp group-admin changes, nothing sent outside the current chat
    const beforeMembers = callsOf(c => c.type === 'members').length;
    replies = [];
    await resetCmd.execute(sock, cardMsg(), [], resetExtra());
    await resetCmd.execute(sock, cardMsg(), ['confirm'], resetExtra());
    assert(callsOf(c => c.type === 'members').length === beforeMembers, 'WhatsApp group admin status was changed');
    assert(callsOf(c => c.type === 'send').length === 0, 'result sent outside the current chat');
    assert(replies.length === 2, 'result leaked outside the current chat');
    ok('no WhatsApp group-admin ops; result only in the current chat');

    // end-to-end: .roles after reset shows owners + bot only
    const rolesMeta = {
      subject: 'Roles After Reset',
      participants: [
        { id: '249124050708@s.whatsapp.net', admin: 'admin' },
        { id: `${config.ownerNumber[0]}@s.whatsapp.net`, admin: 'admin' },
        { id: `${config.ownerNumber[1]}@s.whatsapp.net`, admin: null }
      ]
    };
    const sent = [];
    const rSock = mockSock();
    const origSend2 = rSock.sendMessage;
    rSock.sendMessage = async (jid, content) => { sent.push(content); return {}; };
    const rolesCmd = require('./commands/roles/roles');
    await rolesCmd.execute(rSock, cardMsg(), [], { from: GROUP, sender: OWNER_JID, isGroup: true, groupMetadata: rolesMeta, reply: async () => {}, react: async () => {} });
    const text = (sent.find(c => c.text) || {}).text || '';
    assert(text.includes(`@${config.ownerNumber[0]}`) && text.includes(`@${config.ownerNumber[1]}`), 'owners missing after reset');
    assert(!text.includes('212760000001') && !text.includes('212770000001'), 'cleared identities still listed');
    assert(!text.includes('@212770000001') && !text.includes('@212760000001'), 'cleared identities mentioned');
    ok('.roles after reset: configured owners only, no cleared identities');
  }

  console.log(`\n=== ALL ${pass} CHECKS PASSED ===`);
}

main()
  .catch(err => { console.error('\n=== DRY-RUN FAILED ==='); console.error(err); process.exitCode = 1; })
  .finally(() => {
    for (const [name, content] of Object.entries(backup)) {
      const file = { groups: GROUPS_FILE, blocklist: BLOCKLIST_FILE, coowners: COOWNS_FILE, botadmins: BOTADMINS_FILE, settings: SETTINGS_FILE }[name];
      if (content === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
      else fs.writeFileSync(file, content, 'utf8');
    }
    process.exit(process.exitCode || 0);
  });