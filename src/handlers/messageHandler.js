/**
 * Main message handler — processes incoming messages and executes commands.
 * Moved from the old monolithic handler.js; shared helpers now live in
 * features/groups/metadata.js and handlers/protections.js.
 */

const config = require('../config');
const database = require('../storage/database');
const perm = require('../core/permissions');
const { loadCommands } = require('../utils/commandLoader');
const { addMessage } = require('../utils/groupstats');
const { getGroupMetadata, isAdmin, isBotAdmin } = require('../features/groups/metadata');
const {
  handleAntiSpam,
  handleAntiWord,
  handleAntiAcc
} = require('./protections');
const { handleBlockControlMessage } = require('../features/blockctrl');

const commands = loadCommands();

// Unwrap WhatsApp containers (ephemeral, view once, etc.)
const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;

  let m = msg.message;

  // Common wrappers in modern WhatsApp
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

  return m;
};

// System JID filter - checks if JID is from broadcast/status/newsletter
const isSystemJid = (jid) => {
  if (!jid) return true;
  return jid.includes('@broadcast') ||
         jid.includes('status.broadcast') ||
         jid.includes('@newsletter') ||
         jid.includes('@newsletter.');
};

// Main message handler
const handleMessage = async (sock, msg) => {
  try {
    if (!msg.message) return;

    const from = msg.key.remoteJid;

    // System message filter - ignore broadcast/status/newsletter messages
    if (isSystemJid(from)) {
      return; // Silently ignore system messages
    }

    // Block Control group — automatic phone-number blocklisting (owner-selected)
    try {
      await handleBlockControlMessage(sock, msg);
    } catch (e) {
      // never let the scan break the main pipeline
    }

    // Unwrap containers first
    const content = getMessageContent(msg);
    // Note: We don't return early if content is null because forwarded status messages might not have content

    // Still check for actual message content for regular processing
    let actualMessageTypes = [];
    if (content) {
      const allKeys = Object.keys(content);
      // Filter out protocol/system messages and find actual message content
      const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
      actualMessageTypes = allKeys.filter(key => !protocolMessages.includes(key));
    }

    // Use the first actual message type (conversation, extendedTextMessage, etc.)
    const messageType = actualMessageTypes[0];

    const sender = msg.key.fromMe ? (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net' : (msg.key.participant || msg.key.remoteJid || '');
    const isGroup = from.endsWith('@g.us');

    // Fetch group metadata immediately if it's a group
    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;

    // Mute check — bot stays completely silent in muted groups
    if (isGroup && !msg.key.fromMe) {
      try {
        const muteGs = database.getGroupSettings(from);
        if (muteGs.mute) return;
      } catch (e) {
        // If we can't read settings, proceed normally
      }
    }

    // Track group message statistics (enhanced - skip stickers/reactions/emoji-only)
    if (isGroup) {
      const shouldCount = (() => {
        const rawMsg = msg.message;
        if (!rawMsg) return false;
        if (rawMsg.stickerMessage) return false;
        if (rawMsg.reactionMessage) return false;
        if (rawMsg.protocolMessage) return false;
        if (rawMsg.senderKeyDistributionMessage) return false;
        const text = rawMsg.conversation || rawMsg.extendedTextMessage?.text || rawMsg.imageMessage?.caption || rawMsg.videoMessage?.caption || '';
        if (!text.trim()) return false;
        if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]+$/u.test(text.trim())) return false;
        return true;
      })();
      if (shouldCount) {
        addMessage(from, sender);
      }
    }

    // Anti-spam check
    if (isGroup && !msg.key.fromMe) {
      const gs = database.getGroupSettings(from);
      if (gs.antispam) {
        try {
          await handleAntiSpam(sock, msg, from, sender, groupMetadata);
        } catch (e) {
          console.error('[AntiSpam Error]', e.message);
        }
      }
    }

    // Anti-word check
    if (isGroup && !msg.key.fromMe) {
      const gs = database.getGroupSettings(from);
      if (gs.antiword) {
        try {
          await handleAntiWord(sock, msg, from, sender, groupMetadata);
        } catch (e) {
          console.error('[AntiWord Error]', e.message);
        }
      }
    }

    // Return early for non-group messages with no recognizable content
    if (!content || actualMessageTypes.length === 0) return;

    // Button response routing
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const buttonId = btn.selectedButtonId;
      const buttonCmds = { btn_menu: 'menu', btn_ping: 'ping', btn_help: 'list' };
      const cmdName = buttonCmds[buttonId];
      if (cmdName) {
        const cmd = commands.get(cmdName);
        if (cmd) {
          await cmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: perm.isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: perm.isBotAdminApproved(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
      }
      return;
    }

    // Get message body from unwrapped content
    let body = '';
    if (content.conversation) {
      body = content.conversation;
    } else if (content.extendedTextMessage) {
      body = content.extendedTextMessage.text || '';
    } else if (content.imageMessage) {
      body = content.imageMessage.caption || '';
    } else if (content.videoMessage) {
      body = content.videoMessage.caption || '';
    }

    body = (body || '').trim();

    // XO accepts both the configured command prefix and the short "xo" form.
    // Its move handler must run before the normal prefix and role gates so
    // plain numbers are consumed while a chat has an active game.
    const xoCommand = commands.get('xo');
    if (xoCommand) {
      if (xoCommand.handleCommand && await xoCommand.handleCommand(
        sock, msg, body, { from, sender, isGroup, groupMetadata, reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }) }
      )) return;

      if (xoCommand.isActiveGame?.(from) && await xoCommand.handleMessage(
        sock, msg, body, { from, sender, isGroup, groupMetadata, reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }) }
      )) return;
    }

    const gameCommand = commands.get('ابداء');
    if (gameCommand && await gameCommand.handleMessage(sock, msg, body, { from, sender, isGroup, groupMetadata })) return;
    const menuCommand = commands.get('menu');
    if (menuCommand && await menuCommand.handleMessage(sock, msg, body, { from, sender, isGroup, groupMetadata })) return;

    // Check antiall protection (owner only feature)
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antiall) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        const senderIsOwner = perm.isOwner(sender);

        if (!senderIsAdmin && !senderIsOwner) {
          const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
          if (botIsAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
          }
        }
      }

      // Anti-tag protection (check BEFORE text check, as tagall can have no text)
      if (groupSettings.antitag && !msg.key.fromMe) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];

        const messageText = (
          body ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          ''
        );

        const numericMentions = messageText.match(/@\d{5,}/g) || [];
        const uniqueNumericMentions = new Set();
        numericMentions.forEach((mention) => {
          const numMatch = mention.match(/@(\d+)/);
          if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });

        const atCount = (messageText.match(/@/g) || []).length;
        const mentionCount = Math.max(mentionedJids.length, uniqueNumericMentions.size, atCount);
        const participants = groupMetadata.participants || [];
        const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.25));
        const isMassTagMessage = mentionCount >= 3 || uniqueNumericMentions.size >= 3 || atCount >= 3 || mentionedJids.length >= 3;

        if (isMassTagMessage && (mentionCount >= mentionThreshold || mentionCount >= 3 || atCount >= 3 || uniqueNumericMentions.size >= 3)) {
          try {
            const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
            const senderIsOwner = perm.isOwner(sender);

            if (!senderIsAdmin && !senderIsOwner) {
              const action = (groupSettings.antitagAction || 'delete').toLowerCase();

              if (action === 'delete') {
                try {
                  await sock.sendMessage(from, { delete: msg.key });
                  await sock.sendMessage(from, {
                    text: '⚠️ *Tagall Detected!*',
                    mentions: [sender]
                  }, { quoted: msg });
                } catch (e) {
                  console.error('Failed to delete tagall message:', e);
                }
              } else if (action === 'kick') {
                try {
                  await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {
                  console.error('Failed to delete tagall message:', e);
                }

                const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
                if (botIsAdmin) {
                  try {
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');
                  } catch (e) {
                    console.error('Failed to kick for antitag:', e);
                  }
                  const usernames = [`@${sender.split('@')[0]}`];
                  await sock.sendMessage(from, {
                    text: `🚫 *Antitag Detected!*\n\n${usernames.join(', ')} has been kicked for tagging all members.`,
                    mentions: [sender],
                  }, { quoted: msg });
                }
              }
              return;
            }
          } catch (e) {
            console.error('Error during anti-tag enforcement:', e);
          }
        }
      }
    }

    // Anti-contact protection is automatic in groups and private chats.
    if (content) {
      try {
        await handleAntiAcc(sock, msg, from, sender, groupMetadata, content);
      } catch (e) {
        console.error('[AntiAcc handler error]', e.message);
      }
    }

    // AutoSticker feature - convert images/videos to stickers automatically
    if (isGroup) { // Process all messages in groups (including bot's own messages)
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.autosticker) {
        const mediaMessage = content?.imageMessage || content?.videoMessage;

        // Only process if it's an image or video (not documents)
        if (mediaMessage) {
          // Skip if message has a command prefix (let command handle it)
          if (!body.startsWith(config.prefix)) {
            try {
              // Import sticker command logic
              const stickerCmd = commands.get('sticker');
              if (stickerCmd) {
                // Execute sticker conversion silently
                await stickerCmd.execute(sock, msg, [], {
                  from,
                  sender,
                  isGroup,
                  groupMetadata,
                  isOwner: perm.isOwner(sender),
                  isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                  isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                  isMod: perm.isBotAdminApproved(sender),
                  reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                  react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                return; // Don't process as command after auto-converting
              }
            } catch (error) {
              console.error('[AutoSticker Error]:', error);
              // Continue to normal processing if autosticker fails
            }
          }
        }
      }
    }

    // Active games consume raw answers, including plain text and numbers.
    const gameActive = gameCommand?.isActiveGame?.() === true;
    const menuActive = menuCommand?.isActiveMenu?.(from) === true;
    if (!body.startsWith(config.prefix) && !gameActive && !menuActive) return;

    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    // Get command
    const command = commands.get(commandName);
    if (!command) return;

    if (commandName === 'ابداء' || commandName === 'ابدأ') {
      const allowed = perm.isOwner(sender) || perm.isCoOwner(sender) || (isGroup && await isAdmin(sock, sender, from, groupMetadata));
      if (!allowed) return;
      return command.execute(sock, msg, args, {
        from, sender, isGroup, groupMetadata,
        isAdmin: true,
        reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
        react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
      });
    }

    // The configured link hub is intentionally public, including in self mode.
    // ── Mode Context Check ──
    // Private mode: bot only responds to registered role-holders
    // Public mode: role gate below still applies
    if (config.selfMode && !perm.hasRole(sender)) {
      return;
    }

    // ── Unified Role Validation ──
    // Only users with an approved bot role can execute commands:
    //   Owner (config) > Co-owner (database) > Bot Admin (database) > Bot User (session)
    // WhatsApp group admin alone does not grant bot command access.
    if (!perm.hasRole(sender)) {
      return;
    }

    // Permission checks
    if (command.ownerOnly && !perm.isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }

    if (command.coOwnerOnly && !perm.isOwner(sender) && !perm.isCoOwner(sender)) {
      return sock.sendMessage(from, { text: '👑 This command is only for owner/co-owner!' }, { quoted: msg });
    }

    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: config.messages.groupOnly }, { quoted: msg });
    }

    if (command.privateOnly && isGroup) {
      return sock.sendMessage(from, { text: config.messages.privateOnly }, { quoted: msg });
    }

    if (command.adminOnly && !perm.isOwner(sender) && !perm.isCoOwner(sender) && !(await isAdmin(sock, sender, from, groupMetadata))) {
      return sock.sendMessage(from, { text: config.messages.adminOnly }, { quoted: msg });
    }

    if (command.botAdminNeeded) {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (!botIsAdmin) {
        return sock.sendMessage(from, { text: config.messages.botAdminNeeded }, { quoted: msg });
      }
    }

    // Auto-typing
    if (config.autoTyping) {
      await sock.sendPresenceUpdate('composing', from);
    }

    // Execute command
    console.log(`Executing command: ${commandName} from ***${String(sender || '').replace(/[^0-9]/g, '').slice(-3)}`);

    await command.execute(sock, msg, args, {
      from,
      sender,
      isGroup,
      groupMetadata,
      isOwner: perm.isOwner(sender),
      isBotUser: perm.isBotUser(sender),
      isCoOwner: perm.isCoOwner(sender),
      isTrusted: perm.isTrusted(sender),
      isAdmin: await isAdmin(sock, sender, from, groupMetadata),
      isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
      isBotAdminApproved: perm.isBotAdminApproved(sender),
      commandName,
      reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
    });

  } catch (error) {
    console.error('Error in message handler:', error);

    // Don't send error messages for rate limit errors
    if (error.message && error.message.includes('rate-overlimit')) {
      console.warn('⚠️ Rate limit reached. Skipping error message.');
      return;
    }

    try {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `${config.messages.error}\n\n${error.message}`
      }, { quoted: msg });
    } catch (e) {
      // Don't log rate limit errors when sending error messages
      if (!e.message || !e.message.includes('rate-overlimit')) {
        console.error('Error sending error message:', e);
      }
    }
  }
};

module.exports = { handleMessage, getMessageContent, isSystemJid };
