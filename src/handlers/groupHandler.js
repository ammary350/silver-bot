/**
 * Group participant update handler — welcome/goodbye/join-rules/promotion detection.
 * Banned-contact enforcement on join lives in features/bans/enforcer.js (handleParticipantAdd).
 */

const config = require('../config');
const database = require('../storage/database');
const perm = require('../core/permissions');
const { getGroupMetadata } = require('../features/groups/metadata');
const { handlePromotionDetection } = require('./protections');
const { normalizeJidWithLid } = require('../core/jid');
const axios = require('axios');

// Group participant update handler
const handleGroupUpdate = async (sock, update) => {
  try {
    const { id, participants, action, actor } = update;

    if (!id || !id.endsWith('@g.us')) {
      return;
    }

    const groupSettings = database.getGroupSettings(id);

    // Handle unauthorized promotion detection for 'promote' action
    if (action === 'promote') {
      const promoteUpdate = { id, participants, actor };
      await handlePromotionDetection(sock, promoteUpdate, groupSettings);
      return;
    }

    // Early return if no welcome/goodbye/joinrules enabled
    if (!groupSettings.welcome && !groupSettings.goodbye && !groupSettings.joinrules) return;

    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return;

    const getParticipantJid = (participant) => {
      if (typeof participant === 'string') {
        return participant;
      }
      if (participant && participant.id) {
        return participant.id;
      }
      if (participant && typeof participant === 'object') {
        return participant.jid || participant.participant || null;
      }
      return null;
    };

    const resolveParticipantInfo = async (participantJid, participantNumber) => {
      let displayName = participantNumber;
      let profilePicUrl = '';

      const participantInfo = groupMetadata.participants.find(p => {
        const pId = p.id || p.jid || p.participant;
        const pPhone = p.phoneNumber;
        return pId === participantJid ||
               pId?.split('@')[0] === participantNumber ||
               pPhone === participantJid ||
               pPhone?.split('@')[0] === participantNumber;
      });

      let phoneJid = null;
      if (participantInfo && participantInfo.phoneNumber) {
        phoneJid = participantInfo.phoneNumber;
      } else {
        try {
          const normalized = normalizeJidWithLid(participantJid);
          if (normalized && normalized.includes('@s.whatsapp.net')) {
            phoneJid = normalized;
          }
        } catch (e) {
          if (participantJid.includes('@s.whatsapp.net')) {
            phoneJid = participantJid;
          }
        }
      }

      if (phoneJid) {
        try {
          if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
            const contact = sock.store.contacts[phoneJid];
            if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
              displayName = contact.notify.trim();
            } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
              displayName = contact.name.trim();
            }
          }
          if (displayName === participantNumber) {
            try {
              await sock.onWhatsApp(phoneJid);
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                }
              }
            } catch (fetchError) {}
          }
        } catch (contactError) {}
      }

      if (displayName === participantNumber && participantInfo) {
        if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
          displayName = participantInfo.notify.trim();
        } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
          displayName = participantInfo.name.trim();
        }
      }

      try {
        profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
      } catch (ppError) {
        profilePicUrl = '';
      }

      return { displayName, profilePicUrl };
    };

    for (const participant of participants) {
      const participantJid = getParticipantJid(participant);
      if (!participantJid) {
        continue;
      }

      const participantNumber = participantJid.split('@')[0];

      if (action === 'add') {
        // Join-rules message
        if (groupSettings.joinrules) {
          try {
            const rulesText = groupSettings.joinrulesMessage || 'Welcome! Please follow the group rules.';
            await sock.sendMessage(id, {
              text: rulesText,
              mentions: [participantJid]
            });
          } catch (e) {
            console.error('[JoinRules Error]', e.message);
          }
        }

        // Welcome message
        if (groupSettings.welcome) {
          try {
            const { displayName, profilePicUrl } = await resolveParticipantInfo(participantJid, participantNumber);
            const groupName = groupMetadata.subject || 'the group';
            const groupDesc = groupMetadata.desc || 'No description';
            const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            const welcomeMsg = `╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @${displayName} 👋\n┃Member count: #${groupMetadata.participants.length}\n┃𝚃𝙸𝙼𝙴: ${timeString}⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@${displayName}* Welcome to *${groupName}*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\n${groupDesc}\n\n> *${config.botName}*`;

            const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=join&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
            const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);

            await sock.sendMessage(id, {
              image: imageBuffer,
              caption: welcomeMsg,
              mentions: [participantJid]
            });
          } catch (welcomeError) {
            console.error('Welcome image error:', welcomeError);
            let message = groupSettings.welcomeMessage || 'Welcome @user to @group! 👋\nEnjoy your stay!';
            message = message.replace('@user', `@${participantNumber}`);
            message = message.replace('@group', groupMetadata.subject || 'the group');

            await sock.sendMessage(id, {
              text: message,
              mentions: [participantJid]
            });
          }
        }
      } else if (action === 'remove' && groupSettings.goodbye) {
        try {
          const { displayName, profilePicUrl } = await resolveParticipantInfo(participantJid, participantNumber);
          const groupName = groupMetadata.subject || 'the group';
          const goodbyeMsg = `Goodbye @${displayName} 👋 We will never miss you!`;

          const apiUrl = `https://api.some-random-api.com/welcome/img/7/gaming4?type=leave&textcolor=white&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}&avatar=${encodeURIComponent(profilePicUrl)}`;
          const imageResponse = await axios.get(apiUrl, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);

          await sock.sendMessage(id, {
            image: imageBuffer,
            caption: goodbyeMsg,
            mentions: [participantJid]
          });
        } catch (goodbyeError) {
          console.error('Goodbye error:', goodbyeError);
          const goodbyeMsg = `Goodbye @${participantNumber} 👋 We will never miss you! 💀`;

          await sock.sendMessage(id, {
            text: goodbyeMsg,
            mentions: [participantJid]
          });
        }
      }
    }
  } catch (error) {
    // Silently handle forbidden errors and other group metadata errors
    if (error.message && (
      error.message.includes('forbidden') ||
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      // Silently skip forbidden groups
      return;
    }
    // Only log non-forbidden errors
    if (!error.message || !error.message.includes('forbidden')) {
      console.error('Error handling group update:', error);
    }
  }
};

module.exports = { handleGroupUpdate };
