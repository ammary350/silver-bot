const config = require('../../config');
const menuChats = new Set();

const menuSections = {
  general: {
    label: 'عام',
    cmds: ['menu', 'ping', 'owner', 'alive', 'status', 'uptime', 'sticker', 'tts', 'qr', 'attp', 'getpp', 'viewonce', 'chat', 'botstats', 'setstatsgroup']
  },
  roles: {
    label: 'الرتب',
    cmds: ['addadm', 'deladm', 'addco', 'delco', 'roles', 'resetroles']
  },
  admin: {
    label: 'الإدارة',
    cmds: ['kick', 'promote', 'demote', 'mute', 'unmute', 'warn', 'resetwarn', 'tagall', 'hidetag', 'antilink', 'antitag', 'antiacc', 'welcome', 'setwelcome', 'goodbye', 'setgoodbye', 'clean', 'delete', 'grouplink', 'ginfo', 'setrules', 'reqs', 'approveall', 'setreqmsg', 'linksetup', 'links', 'linkhide']
  },
  protection: {
    label: 'الحماية',
    cmds: ['detc', 'antiword', 'addword', 'delword', 'antispam', 'spamlimit', 'spamtime', 'antidelete', 'lock', 'unlock', 'panic', 'rules', 'scan']
  },
  owner: {
    label: 'المالك',
    cmds: ['ban', 'in', 'mode', 'broadcast', 'restart', 'disconnect', 'setprefix', 'setbotname', 'setbotpp', 'setmenuimage', 'anticall', 'autoreact', 'update', 'addblock', 'delblock', 'blocks', 'check', 'dailyreport', 'resetroles']
  },
  ai: {
    label: 'الذكاء الاصطناعي',
    cmds: ['ai', 'gptimage', 'imagine']
  },
  utility: {
    label: 'أدوات',
    cmds: ['translate', 'calc', 'weather']
  }
};

const menuChoices = {
  '1': ['admin', 'protection'],
  '2': ['general', 'roles', 'owner', 'ai', 'utility'],
  '4': ['admin']
};

const formatSection = (sectionName) => {
  const section = menuSections[sectionName];
  return `${section.label}\n${section.cmds.map(command => `- ${config.prefix}${command}`).join('\n')}`;
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'general',
  description: 'عرض جميع الأوامر المتاحة',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;

      if (args[0] === '3') {
        return sock.sendMessage(extra.from, {
          text: `قسم الفعاليات\n\n- الأمر الأساسي: ${prefix}ابداء [النوع] [عدد الجولات]\n- الأنواع: تفكيك، كتابة، احزر، المليون`
        }, { quoted: msg });
      }

      menuChats.add(extra.from);

      const allCmds = Object.values(menuSections).reduce((acc, s) => acc.concat(s.cmds), []);
      const totalCount = allCmds.length;

      const menuText = `| ${config.botName} |\n\n` +
        `مرحبا @${extra.sender.split('@')[0]}!\n\n` +
        `1. قسم الحماية والإدارة\n` +
        `2. الإعدادات\n` +
        `3. قسم الفعاليات\n\n` +
        `أرسل رقم القسم لعرض محتواه.`;

      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');

      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: [extra.sender]
        }, { quoted: msg });
      }
    } catch (error) {
      await extra.reply(`خطأ: ${error.message}`);
    }
  }
,

  async handleMessage(sock, msg, body, extra) {
    if (!menuChats.has(extra.from) || !['1', '2', '3', '4'].includes(body)) return false;
    menuChats.delete(extra.from);

    if (body !== '3') {
      const sections = menuChoices[body] || [];
      await sock.sendMessage(extra.from, {
        text: sections.map(formatSection).join('\n\n')
      }, { quoted: msg });
      return true;
    }

    await sock.sendMessage(extra.from, {
      text: `قسم الفعاليات\n\n- الأمر الأساسي: ${config.prefix}ابداء [النوع] [عدد الجولات]\n- الأنواع: تفكيك، كتابة، احزر، المليون`
    }, { quoted: msg });
    return true;
  },

  isActiveMenu: (chat) => menuChats.has(chat)
};
